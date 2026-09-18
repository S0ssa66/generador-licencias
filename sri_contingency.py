import os
import sqlite3
import time
import datetime
import base64
import urllib.request
import urllib.parse
import json
import threading
import socket
from pathlib import Path

# La cola debe vivir junto al checkout vigente, nunca en la ruta histórica de
# Antigravity. En producción se debe reemplazar por una cola persistente
# administrada; esta SQLite es para el servidor local.
BASE_DIR = os.environ.get("BEATSS_DATA_DIR", str(Path(__file__).resolve().parent))
DB_PATH = os.environ.get("SRI_CONTINGENCY_DB_PATH", os.path.join(BASE_DIR, "sri_contingency.db"))
REMOTE_MAX_ATTEMPTS = max(1, min(int(os.environ.get('SRI_REMOTE_MAX_ATTEMPTS', '8')), 20))

_db_lock = threading.Lock()

def init_db():
    """Inicializa la base de datos SQLite para la cola de contingencia del SRI."""
    with _db_lock:
        os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS contingency_queue (
                purchase_id TEXT PRIMARY KEY,
                user_uid TEXT,
                xml_firmado TEXT,
                clave_acceso TEXT,
                secuencial INTEGER,
                status TEXT,
                attempts INTEGER DEFAULT 0,
                last_attempt REAL,
                error_msg TEXT,
                created_at REAL
            )
        """)
        conn.commit()
        conn.close()

def save_to_queue(purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, error_msg=""):
    """Guarda una factura fallida en la cola de contingencia."""
    init_db()
    now = time.time()
    with _db_lock:
        conn = None
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO contingency_queue 
                (purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, attempts, last_attempt, error_msg, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                ON CONFLICT(purchase_id) DO UPDATE SET
                    status=excluded.status,
                    error_msg=excluded.error_msg,
                    last_attempt=excluded.last_attempt
                WHERE contingency_queue.xml_firmado=excluded.xml_firmado
                  AND contingency_queue.clave_acceso=excluded.clave_acceso
                  AND contingency_queue.secuencial=excluded.secuencial
            """, (purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, now, error_msg, now))
            if cursor.rowcount != 1:
                raise ValueError('La factura en contingencia ya tiene otro XML o clave de acceso.')
            conn.commit()
            print(f"[+] [SRI Contingency] Factura {purchase_id} (Secuencial: {secuencial}) guardada en la cola de contingencia local.")
        except Exception as e:
            print(f"[-] [SRI Contingency] Error al guardar factura en la cola local: {e}")
            raise
        finally:
            if conn:
                conn.close()

def get_pending():
    """Retorna todos los comprobantes pendientes de procesar."""
    init_db()
    with _db_lock:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, attempts FROM contingency_queue")
            rows = cursor.fetchall()
            conn.close()
            return [
                {
                    "purchase_id": r[0],
                    "user_uid": r[1],
                    "xml_firmado": r[2],
                    "clave_acceso": r[3],
                    "secuencial": r[4],
                    "status": r[5],
                    "attempts": r[6]
                }
                for r in rows
            ]
        except Exception as e:
            print(f"[-] [SRI Contingency] Error al obtener comprobantes pendientes: {e}")
            return []

def mark_attempt(purchase_id, error_msg):
    """Incrementa los intentos de envío y registra el último error."""
    now = time.time()
    with _db_lock:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE contingency_queue 
                SET attempts = attempts + 1, last_attempt = ?, error_msg = ?
                WHERE purchase_id = ?
            """, (now, error_msg, purchase_id))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[-] [SRI Contingency] Error al marcar intento de factura: {e}")

def remove_from_queue(purchase_id):
    """Elimina una factura de la cola (se llama tras una autorización exitosa)."""
    with _db_lock:
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("DELETE FROM contingency_queue WHERE purchase_id = ?", (purchase_id,))
            conn.commit()
            conn.close()
            print(f"[+] [SRI Contingency] Factura {purchase_id} eliminada de la cola de contingencia local.")
        except Exception as e:
            print(f"[-] [SRI Contingency] Error al eliminar factura de la cola local: {e}")

def process_queue():
    """
    Procesa todos los comprobantes en la cola local de contingencia.
    Intenta autorizarlos y los elimina de la cola al tener éxito.
    """
    pending = get_pending()
    if not pending:
        return
        
    print(f"[*] [SRI Contingency] Procesando cola local de contingencia: {len(pending)} comprobantes pendientes...")
    
    # Importar localmente para evitar dependencias circulares
    import sri_invoicing
    import sri_service
    import sri_ride
    from server_utils import get_admin_token
    
    token = get_admin_token()
    if not token:
        print('[-] [SRI Contingency] Sin autenticación para conciliar la cola local; se conserva intacta.')
        return
    
    for item in pending:
        purchase_id = item["purchase_id"]
        user_uid = item["user_uid"]
        xml_firmado = item["xml_firmado"]
        clave_acceso = item["clave_acceso"]
        secuencial = item["secuencial"]
        status = item["status"]
        attempts = item["attempts"]
        
        # Omitir si ya ha fallado demasiadas veces consecutivas (ej. más de 20 veces)
        if attempts > 20:
            print(f"[⚠️] [SRI Contingency] Factura {purchase_id} ha fallado {attempts} veces. Omitiendo hasta intervención manual.")
            continue
            
        print(f"[*] [SRI Contingency] Reintentando factura {purchase_id} (Secuencial: {secuencial}, Estado Cola: {status})...")
        
        # Cargar configuración del productor
        producer_config = {}
        if token:
            try:
                url_pub = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{user_uid}/config/producer"
                req_pub = urllib.request.Request(url_pub, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req_pub) as res:
                    doc_pub = json.loads(res.read().decode('utf-8'))
                    fields = doc_pub.get('fields', {})
                    for k, v in fields.items():
                        producer_config[k] = v.get('stringValue', '')
            except Exception as e:
                print(f"[-] [SRI Contingency] Error al obtener config para {user_uid}: {e}")
                
        if producer_config.get('sriAmbiente') not in {'1', '2'}:
            mark_attempt(purchase_id, 'No se pudo verificar el ambiente SRI del emisor.')
            continue
        ambiente = producer_config['sriAmbiente']
        ws_recepcion = sri_invoicing.WS_RECEPCION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_RECEPCION_PROD
        ws_autorizacion = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
        
        # Las entradas antiguas de Recepción pueden haber sido aceptadas por
        # el SRI aunque la respuesta se perdiera. Nunca reenviar su XML.
        if status == 'PENDING_RECEPCION':
            status = 'PENDING_AUTORIZACION'
            save_to_queue(purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status)
                
        # Caso B: Faltaba ser AUTORIZADA
        if status == 'PENDING_AUTORIZACION':
            try:
                res_autorizacion_soap = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_autorizacion)
                res_autorizacion = sri_invoicing.parsear_respuesta_autorizacion(res_autorizacion_soap)
                
                autorizaciones = res_autorizacion.get('autorizaciones', [])
                if not autorizaciones:
                    mark_attempt(purchase_id, "Autorización aún pendiente en el SRI.")
                    continue
                    
                aut = autorizaciones[0]
                estado_aut = aut.get('estado')
                
                if estado_aut == 'AUTORIZADO':
                    sri_service._update_sri_reservation(purchase_id, token, status='AUTHORIZED')
                    print(f"✅ [SRI Contingency] Factura {purchase_id} AUTORIZADA exitosamente en reintento.")
                    sri_service._persist_authorized_sri(
                        purchase_id, user_uid, purchase_id, secuencial,
                        clave_acceso, aut, token
                    )
                    
                    # Eliminar de la cola local
                    remove_from_queue(purchase_id)
                    
                elif estado_aut in {'PPR', 'PENDIENTE', 'PROCESSING', 'EN_PROCESO'}:
                    mark_attempt(purchase_id, f"Autorización pendiente ({estado_aut}).")
                    continue
                else:
                    msgs = aut.get('mensajes', [])
                    err_msg = "; ".join([m.get('mensaje', '') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else f"No autorizado ({estado_aut or 'sin estado'})."
                    mark_attempt(purchase_id, f"No autorizado: {err_msg}")
            except Exception as e:
                mark_attempt(purchase_id, f"Error conexion Autorizacion: {str(e)}")
                continue


def _firestore_string(fields, key, default=''):
    value = (fields or {}).get(key, {})
    return value.get('stringValue') or value.get('integerValue') or default


def _iso_now():
    return datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'


def _next_attempt_at(attempts, now=None):
    """Backoff exponencial acotado con jitter determinista para no saturar SRI."""
    base = 60
    delay = min(60 * 60, base * (2 ** max(0, min(int(attempts), 6))))
    # El pequeño jitter evita que muchos trabajos reintenten en el mismo segundo.
    jitter = (int(attempts) * 17) % 29
    moment = (now or datetime.datetime.utcnow()) + datetime.timedelta(seconds=delay + jitter)
    return moment.replace(microsecond=0).isoformat() + 'Z'


def _next_attempt_due(fields, now):
    due = _firestore_string(fields, 'nextAttemptAt')
    return not due or due <= now


def _patch_firestore_fields(url, fields, token, update_time=None):
    """Actualiza sólo campos indicados y, si se conoce, exige la versión leída.

    La precondición updateTime convierte el claim del worker en una operación
    compare-and-set: dos workers pueden leer PENDING, pero sólo uno podrá
    adquirir el lease.
    """
    params = [('updateMask.fieldPaths', key) for key in fields]
    if update_time:
        params.append(('currentDocument.updateTime', update_time))
    query = urllib.parse.urlencode(params)
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    request = urllib.request.Request(
        f'{url}?{query}',
        data=json.dumps({'fields': fields}).encode('utf-8'),
        headers=headers,
        method='PATCH'
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode('utf-8'))


def _mark_payment_sri_state(payment_id, producer_id, state, token, message=''):
    """Mantiene el estado visible alineado al estado real del worker."""
    try:
        import sri_service
        sri_service.actualizar_estado_factura_db(
            payment_id,
            producer_id,
            state,
            error_msg=message or None,
            token=token,
            ref_code=payment_id
        )
    except Exception as exc:
        print(f'[-] [SRI Jobs] No se pudo reflejar {state} para {payment_id}: {exc}')


def _report_worker_health(token, pending_count, last_error=''):
    """Heartbeat mínimo para detectar un worker detenido o una cola estancada."""
    try:
        base = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/system/sri_worker'
        now = _iso_now()
        _patch_firestore_fields(base, {
            'lastHeartbeatAt': {'stringValue': now},
            'workerId': {'stringValue': socket.gethostname()[:96]},
            'pendingCount': {'integerValue': str(max(0, int(pending_count)))},
            'lastError': {'stringValue': str(last_error or '')[:1000]}
        }, token)
    except Exception as exc:
        print(f'[-] [SRI Jobs] No se pudo registrar heartbeat: {exc}')


def _lease_is_expired(fields, now):
    lease = _firestore_string(fields, 'leaseExpiresAt')
    return not lease or lease <= now


def _list_firestore_jobs(base, token):
    """Consume todas las páginas; Firestore puede devolver menos de pageSize."""
    documents = []
    page_token = ''
    while True:
        params = {'pageSize': '100'}
        if page_token:
            params['pageToken'] = page_token
        req = urllib.request.Request(
            f'{base}?{urllib.parse.urlencode(params)}',
            headers={'Authorization': f'Bearer {token}'}
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8'))
        documents.extend(payload.get('documents', []))
        next_page = payload.get('nextPageToken', '')
        if not next_page:
            return documents
        if next_page == page_token:
            raise RuntimeError('Firestore repitió el token de página de trabajos SRI.')
        page_token = next_page


def process_firestore_jobs():
    """Procesa trabajos SRI creados por la API serverless de producción.

    El worker corre en el servidor Python persistente (local o desplegado en un
    proceso estable). Vercel solo encola; nunca se confía en una tarea en
    segundo plano dentro de una invocación serverless.
    """
    token = get_admin_token()
    if not token:
        return

    base = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/sriJobs'
    try:
        documents = _list_firestore_jobs(base, token)
    except Exception as exc:
        print(f"[-] [SRI Jobs] No se pudo consultar la cola remota: {exc}")
        return

    now = _iso_now()
    candidate_count = 0
    import sri_service
    for document in documents:
        fields = document.get('fields', {})
        job_status = _firestore_string(fields, 'status')
        if job_status == 'PENDING' and not _next_attempt_due(fields, now):
            continue
        if job_status != 'PENDING' and not (job_status == 'PROCESSING' and _lease_is_expired(fields, now)):
            continue
        candidate_count += 1
        payment_id = _firestore_string(fields, 'paymentId')
        reference = _firestore_string(fields, 'reference') or payment_id
        producer_id = _firestore_string(fields, 'producerId')
        if not payment_id or not reference or not producer_id:
            continue

        job_name = document.get('name', '')
        if not job_name:
            continue
        job_url = f'https://firestore.googleapis.com/v1/{job_name}'
        claimed_at = _iso_now()
        lease_expires_at = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).replace(microsecond=0).isoformat() + 'Z'
        worker_id = socket.gethostname()[:96]
        claim = None
        try:
            claim = _patch_firestore_fields(job_url, {
                'status': {'stringValue': 'PROCESSING'},
                'updatedAt': {'stringValue': claimed_at},
                'lastTransitionAt': {'stringValue': claimed_at},
                'leaseOwner': {'stringValue': worker_id},
                'leaseExpiresAt': {'stringValue': lease_expires_at},
                'attempts': {'integerValue': str(int(_firestore_string(fields, 'attempts', '0') or 0) + 1)},
                'lastError': {'stringValue': ''}
            }, token, document.get('updateTime'))
            print(f"[*] [SRI Jobs] Procesando {payment_id} ({reference}).")
            prior_payment_state = sri_service._payment_already_authorized(payment_id, token, producer_id)
            if prior_payment_state not in {'AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE'}:
                _mark_payment_sri_state(payment_id, producer_id, 'EN_PROCESO', token)
            if prior_payment_state != 'AUTORIZADO':
                sri_service.emitir_factura_sri_background(reference, producer_id)
            # La función de emisión actualiza el pago. El job se cierra solo
            # después de consultar ese estado para no ocultar configuraciones
            # incompletas o respuestas todavía pendientes.
            payment_url = f'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}'
            payment_req = urllib.request.Request(payment_url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(payment_req, timeout=15) as payment_response:
                payment_doc = json.loads(payment_response.read().decode('utf-8'))
            payment_status = _firestore_string(payment_doc.get('fields', {}), 'sriEstado')
            if payment_status == 'AUTORIZADO':
                next_status = 'DONE'
            elif payment_status == 'AUTORIZADO_ENTREGA_PENDIENTE':
                # El siguiente ciclo consulta la misma clave y reintenta sólo
                # almacenar XML/RIDE; jamás vuelve a SOAP Recepción.
                next_status = 'ARTIFACT_REVIEW' if int(_firestore_string(fields, 'attempts', '0') or 0) + 1 >= REMOTE_MAX_ATTEMPTS else 'PENDING'
            elif payment_status in {'CONTINGENCIA', 'PENDIENTE_AUTORIZACION'}:
                # La emisión ya fue entregada a la cola SQLite local. No
                # volver a crear otra factura desde el trabajo remoto.
                next_status = 'CONTINGENCY'
            elif payment_status == 'NO_CONFIGURADO' or payment_status.startswith('ERROR_') or payment_status.startswith('RECHAZADO_'):
                next_status = 'FAILED'
            else:
                next_status = 'PENDING'
            attempts = int(_firestore_string(fields, 'attempts', '0') or 0) + 1
            if next_status == 'PENDING' and attempts >= REMOTE_MAX_ATTEMPTS:
                next_status = 'REVIEW_REQUIRED'
                if payment_status != 'AUTORIZADO_ENTREGA_PENDIENTE':
                    _mark_payment_sri_state(payment_id, producer_id, 'ERROR_REQUIERE_REVISION', token, 'Se agotaron los reintentos automáticos; revisa la clave fiscal antes de continuar.')
            completed_at = _iso_now()
            _patch_firestore_fields(job_url, {
                'status': {'stringValue': next_status},
                'updatedAt': {'stringValue': completed_at},
                'lastTransitionAt': {'stringValue': completed_at},
                'leaseOwner': {'stringValue': ''},
                'leaseExpiresAt': {'stringValue': ''},
                'nextAttemptAt': {'stringValue': _next_attempt_at(attempts) if next_status == 'PENDING' else ''}
            }, token, claim.get('updateTime'))
        except Exception as exc:
            # Un error de precondición significa que otro worker ya tomó el
            # trabajo. No se considera fallo de emisión ni se reencola.
            if '409' in str(exc) or 'FAILED_PRECONDITION' in str(exc):
                continue
            print(f"[-] [SRI Jobs] Error procesando {payment_id}: {exc}")
            if not claim:
                continue
            try:
                attempts = int(_firestore_string(fields, 'attempts', '0') or 0) + 1
                failed_at = _iso_now()
                authorized_pending = False
                try:
                    authorized_pending = sri_service._payment_already_authorized(payment_id, token, producer_id) == 'AUTORIZADO_ENTREGA_PENDIENTE'
                except Exception:
                    pass
                exhausted = attempts >= REMOTE_MAX_ATTEMPTS or (authorized_pending and isinstance(exc, sri_service.SriReconciliationRequired) and 'sin reserva' in str(exc))
                _patch_firestore_fields(job_url, {
                    'status': {'stringValue': ('ARTIFACT_REVIEW' if authorized_pending else 'REVIEW_REQUIRED') if exhausted else 'PENDING'},
                    'lastError': {'stringValue': str(exc)[:1000]},
                    'updatedAt': {'stringValue': failed_at},
                    'lastTransitionAt': {'stringValue': failed_at},
                    'leaseOwner': {'stringValue': ''},
                    'leaseExpiresAt': {'stringValue': ''},
                    'nextAttemptAt': {'stringValue': '' if exhausted else _next_attempt_at(attempts)}
                }, token, claim.get('updateTime'))
                if exhausted and not authorized_pending:
                    _mark_payment_sri_state(payment_id, producer_id, 'ERROR_REQUIERE_REVISION', token, 'Se agotaron los reintentos automáticos del SRI; requiere revisión manual.')
            except Exception as update_exc:
                print(f"[-] [SRI Jobs] No se pudo devolver el trabajo a PENDING: {update_exc}")
    _report_worker_health(token, candidate_count)

def start_contingency_worker():
    """Inicia un hilo en segundo plano que procesa la cola de contingencia periódicamente."""
    def run_worker():
        init_db()
        while True:
            try:
                process_queue()
                process_firestore_jobs()
            except Exception as e:
                print(f"[-] [SRI Contingency Worker] Error en ciclo de proceso: {e}")
            time.sleep(300)  # Reintentar cada 5 minutos
            
    worker_thread = threading.Thread(target=run_worker, daemon=True)
    worker_thread.start()
    print("[+] [SRI Contingency] Hilo de procesamiento en segundo plano (Worker) iniciado.")
