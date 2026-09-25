import os
import sqlite3
import time
import datetime
import base64
import urllib.request
import urllib.parse
import urllib.error
import json
import threading
import socket
import re
from pathlib import Path

from server_utils import get_admin_token

# La cola debe vivir junto al checkout vigente, nunca en la ruta histórica de
# Antigravity. En producción se debe reemplazar por una cola persistente
# administrada; esta SQLite es para el servidor local.
BASE_DIR = os.environ.get("BEATSS_DATA_DIR", str(Path(__file__).resolve().parent))
DB_PATH = os.environ.get("SRI_CONTINGENCY_DB_PATH", os.path.join(BASE_DIR, "sri_contingency.db"))
REMOTE_MAX_ATTEMPTS = max(1, min(int(os.environ.get('SRI_REMOTE_MAX_ATTEMPTS', '8')), 20))
WORKER_INTERVAL_SECONDS = max(30, min(int(os.environ.get('SRI_WORKER_INTERVAL_SECONDS', '300')), 3600))

_db_lock = threading.Lock()


def _allowed_sri_ambientes():
    """Ambientes que este proceso puede contactar.

    El valor seguro por defecto es únicamente ``1`` (pruebas). Autorizar el
    ambiente ``2`` exige declararlo expresamente en el proceso persistente;
    cambiar el perfil del productor en la web no basta para habilitar Live.
    """
    raw = os.environ.get('SRI_WORKER_ALLOWED_AMBIENTES', '1')
    allowed = {item.strip() for item in raw.split(',') if item.strip()}
    invalid = allowed.difference({'1', '2'})
    if not allowed or invalid:
        raise RuntimeError('SRI_WORKER_ALLOWED_AMBIENTES debe contener solo 1 o 2.')
    return allowed


def _load_public_producer_config(user_uid, token):
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{user_uid}/config/producer"
    request = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(request, timeout=15) as response:
        fields = json.loads(response.read().decode('utf-8')).get('fields', {})
    config = {key: _firestore_string(fields, key) for key in fields}

    # sriAmbiente se guarda en private_config/sri desde el formulario actual.
    # Leer sólo ese campo (no certificado/contraseña) para validar el ambiente
    # antes de reclamar un trabajo o contactar al SRI. El fallback público
    # conserva compatibilidad con perfiles antiguos aún no migrados.
    private_url = (
        f"https://firestore.googleapis.com/v1/projects/licencias-musicales/"
        f"databases/(default)/documents/users/{user_uid}/private_config/sri?"
        f"{urllib.parse.urlencode({'mask.fieldPaths': 'sriAmbiente'})}"
    )
    private_request = urllib.request.Request(private_url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(private_request, timeout=15) as response:
            private_fields = json.loads(response.read().decode('utf-8')).get('fields', {})
        private_environment = _firestore_string(private_fields, 'sriAmbiente')
        if private_environment:
            config['sriAmbiente'] = private_environment
    except urllib.error.HTTPError as exc:
        if exc.code != 404:
            raise
    if user_uid == 'paXbnNbHMMPC31X3hf0oTUx4bbr2':
        config.setdefault('sriAmbiente', '2')
        config.setdefault('sriRimpe', 'rimpe_popular')
        config.setdefault('sriRuc', '0803743111001')
        config.setdefault('sriRazonSocial', 'DOMINGUEZ SOSA JOAO DAVID')
        config.setdefault('sriDirMatriz', 'Barrio: SANTAS VAINAS Calle: RIO TABIAZO Intersección: RIO QUININDE, ESMERALDAS')
        config.setdefault('sriEstab', '001')
        config.setdefault('sriPtoEmi', '001')
        config.setdefault('sriContabilidad', 'NO')
        config.setdefault('sriIvaTarifa', '0')
        config.setdefault('sriIvaIncluido', True)
    return config


def _assert_worker_ambiente(ambiente, allow_manual_live=False):
    ambiente = str(ambiente or '').strip()
    if ambiente not in {'1', '2'}:
        raise RuntimeError('No se pudo verificar el ambiente SRI del emisor.')
    # Sólo el endpoint autenticado que ejecuta una venta elegida por su dueño
    # puede habilitar una invocación Live individual. El worker persistente
    # sigue sujeto a SRI_WORKER_ALLOWED_AMBIENTES.
    if allow_manual_live and ambiente == '2':
        return ambiente
    if ambiente not in _allowed_sri_ambientes():
        raise RuntimeError(
            f'El worker no está autorizado para el ambiente SRI {ambiente}; '
            'revisa SRI_WORKER_ALLOWED_AMBIENTES.'
        )
    return ambiente

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
    if os.environ.get('SRI_SERVERLESS_EXECUTION') == '1':
        # El ejecutor web es efímero: Firestore y la reserva firmada son el
        # registro durable. No depender de SQLite efímero para conciliación.
        print('[*] [SRI Contingency] Emisión puntual; estado durable conservado en Firestore.')
        return True
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

        # Esta cola SQLite puede sobrevivir a versiones anteriores. No enviar
        # nada a SRI salvo que el dueño haya elegido hoy esa operación en
        # BeatSS; un fallo de lectura remota también bloquea el envío.
        if not _remote_manual_issue_is_armed(purchase_id, user_uid, token):
            print("[-] [SRI Contingency] Trabajo local retenido: no hay selección manual vigente en BEATSS.")
            continue
        
        # Omitir si ya ha fallado demasiadas veces consecutivas (ej. más de 20 veces)
        if attempts > 20:
            print(f"[⚠️] [SRI Contingency] Factura {purchase_id} ha fallado {attempts} veces. Omitiendo hasta intervención manual.")
            continue
            
        print(f"[*] [SRI Contingency] Reintentando factura {purchase_id} (Secuencial: {secuencial}, Estado Cola: {status})...")
        
        # Cargar configuración del productor
        try:
            producer_config = _load_public_producer_config(user_uid, token)
            ambiente = _assert_worker_ambiente(producer_config.get('sriAmbiente'))
        except Exception as e:
            # Un bloqueo de ambiente no es un intento fiscal fallido. La cola
            # permanece intacta hasta que un operador configure el worker.
            print(f"[-] [SRI Contingency] Trabajo omitido de forma segura: {e}")
            continue
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


def _is_owner_manually_requested(fields):
    """Sólo la selección confirmada por el productor puede activar Live."""
    value = (fields or {}).get('manualIssueRequested', {})
    return value.get('booleanValue') is True


def _manual_issue_matches(payment_fields, job_fields, payment_id, producer_id):
    return (
        _firestore_string(payment_fields, 'status') == 'approved' and
        _firestore_string(payment_fields, 'producerId') == producer_id and
        payment_fields.get('providerLivemode', {}).get('booleanValue') is not False and
        not _firestore_string(payment_fields, 'reference').lower().startswith('cs_test_') and
        _firestore_string(job_fields, 'paymentId') == payment_id and
        _firestore_string(job_fields, 'producerId') == producer_id and
        _is_owner_manually_requested(job_fields)
    )


def _remote_manual_issue_is_armed(payment_id, producer_id, token):
    """Confirma que pago y job corresponden a una selección manual del dueño."""
    root = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents'
    try:
        docs = []
        for collection in ('payments', 'sriJobs'):
            request = urllib.request.Request(
                f'{root}/{collection}/{urllib.parse.quote(payment_id, safe="")}',
                headers={'Authorization': f'Bearer {token}'}
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                docs.append(json.loads(response.read().decode('utf-8')).get('fields', {}))
        return _manual_issue_matches(docs[0], docs[1], payment_id, producer_id)
    except Exception:
        return False


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


def _inspect_target_reservation(payment_id, token):
    """Devuelve sólo metadatos necesarios para decidir si una consulta es segura."""
    safe_payment = urllib.parse.quote(str(payment_id), safe='')
    url = ('https://firestore.googleapis.com/v1/projects/licencias-musicales/'
           f'databases/(default)/documents/sriReservations/{safe_payment}')
    request = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            fields = json.loads(response.read().decode('utf-8')).get('fields', {})
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return {'exists': False, 'status': '', 'producerId': '', 'hasAccessKey': False, 'hasSequence': False}
        raise RuntimeError('No se pudo comprobar la reserva fiscal de esta venta.') from exc
    except Exception as exc:
        raise RuntimeError('No se pudo comprobar la reserva fiscal de esta venta.') from exc
    return {
        'exists': True,
        'status': _firestore_string(fields, 'status'),
        'producerId': _firestore_string(fields, 'producerId'),
        'hasAccessKey': bool(_firestore_string(fields, 'accessKey')),
        'hasSequence': bool(_firestore_string(fields, 'sequence')),
    }


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
            'allowedAmbientes': {'arrayValue': {'values': [
                {'stringValue': value} for value in sorted(_allowed_sri_ambientes())
            ]}},
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


def inspect_target_sri_job(payment_id, token=None, expected_owner_uid=None, allow_nonpending=False):
    """Verifica una sola orden antes de cualquier emisión bajo demanda.

    No modifica Firestore ni contacta al SRI. Nunca devuelve datos del cliente
    ni credenciales, para que el resumen sea seguro en la terminal.
    """
    if not re.fullmatch(r'[A-Za-z0-9_-]{3,160}', str(payment_id or '')):
        raise ValueError('ID de pago inválido.')
    token = token or get_admin_token()
    if not token:
        raise RuntimeError('No hay autenticación administrativa de Firestore disponible.')
    root = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents'

    def read_document(collection):
        request = urllib.request.Request(f'{root}/{collection}/{payment_id}', headers={'Authorization': f'Bearer {token}'})
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))

    payment = read_document('payments')
    job = read_document('sriJobs')
    payment_fields = payment.get('fields', {})
    job_fields = job.get('fields', {})
    producer_id = _firestore_string(payment_fields, 'producerId')
    if _firestore_string(payment_fields, 'status') != 'approved' or not producer_id:
        raise RuntimeError('El pago no está aprobado o no tiene productor.')
    if _firestore_string(job_fields, 'paymentId') != payment_id or _firestore_string(job_fields, 'producerId') != producer_id:
        raise RuntimeError('El trabajo SRI no corresponde al pago y productor aprobados.')
    if expected_owner_uid and producer_id != expected_owner_uid:
        raise RuntimeError('La venta no pertenece al productor autenticado.')
    if not _is_owner_manually_requested(job_fields):
        raise RuntimeError('El dueño todavía no confirmó esta venta desde BeatSS.')
    if expected_owner_uid and _firestore_string(job_fields, 'manualIssueRequestedBy') not in {expected_owner_uid, f'producer-manual-action-{expected_owner_uid}'}:
        raise RuntimeError('La confirmación fiscal no pertenece al usuario autenticado.')
    reference = _firestore_string(payment_fields, 'reference') or payment_id
    if payment_fields.get('providerLivemode', {}).get('booleanValue') is False or reference.lower().startswith('cs_test_'):
        raise RuntimeError('Un pago sandbox no puede generar una factura fiscal.')
    fiscal_state = _firestore_string(payment_fields, 'sriEstado')
    if fiscal_state in {'AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE', 'ERROR_REQUIERE_REVISION'}:
        raise RuntimeError('El pago ya tiene una autorización o requiere conciliación manual.')
    job_status = _firestore_string(job_fields, 'status')
    selected_contingency = bool(expected_owner_uid and job_status == 'CONTINGENCY')
    selected_expired_processing = bool(
        expected_owner_uid and job_status == 'PROCESSING' and
        _lease_is_expired(job_fields, _iso_now())
    )
    if not allow_nonpending and job_status != 'PENDING' and not selected_contingency and not selected_expired_processing:
        raise RuntimeError(f'El trabajo no está pendiente (estado: {job_status or "desconocido"}).')
    if not allow_nonpending and job_status == 'PENDING' and not _next_attempt_due(job_fields, _iso_now()):
        raise RuntimeError('El siguiente intento del trabajo todavía no vence.')
    producer_config = _load_public_producer_config(producer_id, token)
    ambiente = _assert_worker_ambiente(producer_config.get('sriAmbiente'), allow_manual_live=bool(expected_owner_uid))
    reservation = _inspect_target_reservation(payment_id, token)
    return {'job': job, 'paymentId': payment_id, 'producerId': producer_id, 'ambiente': ambiente,
            'jobStatus': job_status, 'fiscalState': fiscal_state or 'NO_EMITIDA',
            'reservation': reservation}


def process_firestore_jobs(payment_id_filter=None, expected_owner_uid=None, reconciliation_only=False):
    """Procesa la cola SRI o una sola venta elegida explícitamente.

    El worker persistente procesa el conjunto elegible. El endpoint serverless
    puede pasar un payment_id_filter y expected_owner_uid para procesar una
    sola selección autenticada, con un lease corto y sin depender de tareas en
    segundo plano. La llamada puntual nunca informa un heartbeat persistente.
    """
    token = get_admin_token()
    if not token:
        if payment_id_filter:
            raise RuntimeError('No hay autenticación administrativa de Firestore disponible.')
        return

    base = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/sriJobs'
    try:
        documents = [inspect_target_sri_job(payment_id_filter, token, expected_owner_uid)['job']] if payment_id_filter else _list_firestore_jobs(base, token)
    except Exception as exc:
        if payment_id_filter:
            raise
        print(f"[-] [SRI Jobs] No se pudo consultar la cola remota: {exc}")
        _report_worker_health(token, 0, 'No se pudo consultar la cola remota.')
        return

    now = _iso_now()
    candidate_count = 0
    blocked_by_environment = 0
    selected_result = None
    import sri_service
    for document in documents:
        fields = document.get('fields', {})
        # La cola puede contener jobs heredados o de flujos antiguos. Un worker
        # persistente procesa únicamente ventas elegidas y confirmadas desde
        # BeatSS; los demás quedan intactos para conciliación.
        if not payment_id_filter and not _is_owner_manually_requested(fields):
            continue
        job_status = _firestore_string(fields, 'status')
        if job_status == 'PENDING' and not _next_attempt_due(fields, now):
            continue
        selected_contingency = bool(payment_id_filter and expected_owner_uid and job_status == 'CONTINGENCY')
        if job_status != 'PENDING' and not selected_contingency and not (job_status == 'PROCESSING' and _lease_is_expired(fields, now)):
            continue
        candidate_count += 1
        payment_id = _firestore_string(fields, 'paymentId')
        reference = _firestore_string(fields, 'reference') or payment_id
        producer_id = _firestore_string(fields, 'producerId')
        if not payment_id or not reference or not producer_id:
            continue

        # Verifica el ambiente antes de adquirir el lease o tocar el pago. Así
        # un worker de pruebas jamás consume por accidente un trabajo Live.
        try:
            producer_config = _load_public_producer_config(producer_id, token)
            _assert_worker_ambiente(producer_config.get('sriAmbiente'), allow_manual_live=bool(payment_id_filter and expected_owner_uid and _is_owner_manually_requested(fields)))
        except Exception as exc:
            blocked_by_environment += 1
            print(f"[-] [SRI Jobs] Trabajo omitido de forma segura: {exc}")
            continue

        job_name = document.get('name', '')
        if not job_name:
            continue
        job_url = f'https://firestore.googleapis.com/v1/{job_name}'
        claimed_at = _iso_now()
        lease_delta = datetime.timedelta(minutes=2) if expected_owner_uid else datetime.timedelta(hours=1)
        lease_expires_at = (datetime.datetime.utcnow() + lease_delta).replace(microsecond=0).isoformat() + 'Z'
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
                # `reference` puede ser una referencia contractual legible y
                # no el ID del documento payments. El servicio fiscal usa su
                # argumento como clave de pago/reserva: siempre pasar el ID
                # canónico para no consultar ni actualizar otro documento.
                sri_service.emitir_factura_sri_background(
                    payment_id, producer_id, reconciliation_only=reconciliation_only
                )
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
            if payment_id_filter:
                selected_result = next_status
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
            if payment_id_filter:
                raise RuntimeError('La emisión puntual falló; revisa la reserva y el estado fiscal antes de reintentar.') from exc
    health_error = ''
    if blocked_by_environment:
        health_error = f'{blocked_by_environment} trabajo(s) bloqueado(s) por ambiente no autorizado.'
    # Una ejecución puntual no es un worker persistente: no publicar un
    # heartbeat que haría creer a la web que habrá ciclos posteriores.
    if not payment_id_filter:
        _report_worker_health(token, candidate_count, health_error)
    if payment_id_filter:
        if selected_result is None:
            raise RuntimeError('El trabajo puntual no se procesó; revisa su ambiente y estado.')
        return selected_result


def run_worker_cycle():
    """Ejecuta un ciclo completo; útil para pruebas y supervisores externos."""
    init_db()
    process_queue()
    process_firestore_jobs()


def run_worker_forever():
    """Ejecuta el worker en primer plano para un servicio persistente."""
    allowed = ','.join(sorted(_allowed_sri_ambientes()))
    print(f'[+] [SRI Worker] Iniciado; ambientes autorizados: {allowed}.')
    while True:
        try:
            run_worker_cycle()
        except Exception as exc:
            print(f'[-] [SRI Worker] Error en ciclo de proceso: {exc}')
        time.sleep(WORKER_INTERVAL_SECONDS)

def start_contingency_worker():
    """Inicia un hilo en segundo plano que procesa la cola de contingencia periódicamente."""
    def run_worker():
        run_worker_forever()
            
    worker_thread = threading.Thread(target=run_worker, daemon=True)
    worker_thread.start()
    print("[+] [SRI Contingency] Hilo de procesamiento en segundo plano (Worker) iniciado.")
