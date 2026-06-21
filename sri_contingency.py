import os
import sqlite3
import time
import base64
import urllib.request
import json
import threading

# Ruta base del proyecto
BASE_DIR = "/Users/sossa/IA/generador-licencias"
DB_PATH = os.path.join(BASE_DIR, "sri_contingency.db")

_db_lock = threading.Lock()

def init_db():
    """Inicializa la base de datos SQLite para la cola de contingencia del SRI."""
    with _db_lock:
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
        try:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO contingency_queue 
                (purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, attempts, last_attempt, error_msg, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                ON CONFLICT(purchase_id) DO UPDATE SET
                    xml_firmado=excluded.xml_firmado,
                    status=excluded.status,
                    error_msg=excluded.error_msg,
                    last_attempt=excluded.last_attempt
            """, (purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status, now, error_msg, now))
            conn.commit()
            conn.close()
            print(f"[+] [SRI Contingency] Factura {purchase_id} (Secuencial: {secuencial}) guardada en la cola de contingencia local.")
        except Exception as e:
            print(f"[-] [SRI Contingency] Error al guardar factura en la cola local: {e}")

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
                
        ambiente = producer_config.get('sriAmbiente', '1')
        ws_recepcion = sri_invoicing.WS_RECEPCION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_RECEPCION_PROD
        ws_autorizacion = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
        
        # Caso A: Faltaba ser RECIBIDA
        if status == 'PENDING_RECEPCION':
            try:
                xml_firmado_b64 = base64.b64encode(xml_firmado.encode('utf-8')).decode('utf-8')
                res_recepcion_soap = sri_invoicing.enviar_sri_soap(xml_firmado_b64, ws_recepcion)
                res_recepcion = sri_invoicing.parsear_respuesta_recepcion(res_recepcion_soap)
                
                estado_recepcion = res_recepcion.get('estado')
                if estado_recepcion == 'RECIBIDA':
                    status = 'PENDING_AUTORIZACION'
                    # Guardar nuevo estado en base de datos local
                    save_to_queue(purchase_id, user_uid, xml_firmado, clave_acceso, secuencial, status)
                else:
                    msgs = res_recepcion.get('comprobantes', [{}])[0].get('mensajes', [])
                    err_msg = "; ".join([m.get('mensaje') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else "Rechazado en recepción."
                    mark_attempt(purchase_id, f"Rechazo Recepcion: {err_msg}")
                    continue
            except Exception as e:
                mark_attempt(purchase_id, f"Error conexion Recepcion: {str(e)}")
                continue
                
        # Caso B: Faltaba ser AUTORIZADA
        if status == 'PENDING_AUTORIZACION':
            try:
                res_autorizacion_soap = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_autorizacion)
                res_autorizacion = sri_invoicing.parsear_respuesta_autorizacion(res_autorizacion_soap)
                
                autorizaciones = res_autorizacion.get('autorizaciones', [])
                if not autorizaciones:
                    mark_attempt(purchase_id, "Sin respuesta de autorizacion del SRI.")
                    continue
                    
                aut = autorizaciones[0]
                estado_aut = aut.get('estado')
                
                if estado_aut == 'AUTORIZADO':
                    num_aut = aut.get('numeroAutorizacion')
                    fec_aut = aut.get('fechaAutorizacion')
                    xml_autorizado_sri = aut.get('comprobante')
                    
                    print(f"✅ [SRI Contingency] Factura {purchase_id} AUTORIZADA exitosamente en reintento.")
                    
                    # Generar RIDE PDF localmente
                    target_dir = os.path.expanduser('~/Documents/Licencias')
                    os.makedirs(target_dir, exist_ok=True)
                    ride_filename = f"Factura_{str(secuencial).zfill(9)}_{clave_acceso}.pdf"
                    ride_filepath = os.path.join(target_dir, ride_filename)
                    
                    try:
                        sri_ride.generar_ride_pdf(ride_filepath, xml_autorizado_sri, aut)
                    except Exception as e:
                        print(f"[-] [SRI Contingency] Error al generar RIDE PDF en reintento: {e}")
                        
                    # Actualizar estado en Firestore y local backup
                    sri_service.actualizar_estado_factura_db(
                        purchase_id, user_uid, "AUTORIZADO",
                        clave_acceso=clave_acceso,
                        xml_autorizado=xml_autorizado_sri,
                        num_autorizacion=num_aut,
                        fecha_autorizacion=fec_aut,
                        secuencial=secuencial,
                        ride_path=ride_filepath,
                        token=token,
                        ref_code=purchase_id
                    )
                    
                    # Eliminar de la cola local
                    remove_from_queue(purchase_id)
                    
                else:
                    msgs = aut.get('mensajes', [])
                    err_msg = "; ".join([m.get('mensaje') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else "No autorizado."
                    mark_attempt(purchase_id, f"No autorizado: {err_msg}")
            except Exception as e:
                mark_attempt(purchase_id, f"Error conexion Autorizacion: {str(e)}")
                continue

def start_contingency_worker():
    """Inicia un hilo en segundo plano que procesa la cola de contingencia periódicamente."""
    def run_worker():
        init_db()
        while True:
            try:
                process_queue()
            except Exception as e:
                print(f"[-] [SRI Contingency Worker] Error en ciclo de proceso: {e}")
            time.sleep(300)  # Reintentar cada 5 minutos
            
    worker_thread = threading.Thread(target=run_worker, daemon=True)
    worker_thread.start()
    print("[+] [SRI Contingency] Hilo de procesamiento en segundo plano (Worker) iniciado.")
