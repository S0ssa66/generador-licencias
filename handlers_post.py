"""Mixin do_POST — módulo extraído de server.py"""
import json
import os
import re
import base64
import threading
import subprocess
import urllib.request
import urllib.parse
import datetime
import time
import uuid
import tempfile
from urllib.parse import urlparse, parse_qs

from server_utils import get_admin_token, resolve_backup_file
from firestore_ops import update_firestore_task, get_firestore_task, fetch_firestore_collection, fetch_firestore_document
from admin_config import get_admin_config, save_license_hash_in_firestore, save_license_hash_in_local_backup
from pdf_generator import generate_pdf_from_contract
from sri_service import emitir_factura_sri_background, actualizar_secuencial_sri, actualizar_estado_factura_db
from payment_verifier import verify_paypal_order, verify_paypal_subscription, update_user_plan_in_firestore, confirm_payment_in_firestore
from organize_obsidian import organize_files, generate_dashboard
from llm_utils import call_gemini
import agente_coordinador
import sri_invoicing
import sri_ride

DIRECTORY = os.path.dirname(os.path.abspath(__file__))


def get_or_create_drive_folder(token, folder_name, parent_id=None):
    import urllib.request
    import urllib.parse
    import json
    
    q = f"name='{folder_name}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    if parent_id:
        q += f" and '{parent_id}' in parents"
        
    url = f"https://www.googleapis.com/drive/v3/files?q={urllib.parse.quote(q)}&fields=files(id)"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            files = res_data.get("files", [])
            if files:
                return files[0]["id"]
    except Exception as e:
        raise Exception(f"Error buscando carpeta {folder_name}: {e}")
        
    # Crear carpeta
    create_url = "https://www.googleapis.com/drive/v3/files"
    meta = {
        "name": folder_name,
        "mimeType": "application/vnd.google-apps.folder"
    }
    if parent_id:
        meta["parents"] = [parent_id]
        
    req = urllib.request.Request(
        create_url, 
        data=json.dumps(meta).encode("utf-8"), 
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as response:
            folder = json.loads(response.read().decode("utf-8"))
            if "id" in folder:
                return folder["id"]
            raise Exception("No se pudo crear la carpeta en Google Drive.")
    except Exception as e:
        raise Exception(f"Error creando carpeta {folder_name}: {e}")


def process_async_task(task_id, id_token):
    """Worker asíncrono que procesa la tarea utilizando el pipeline de agentes en segundo plano."""
    print(f"[*] [Worker] Iniciando procesamiento de tarea {task_id}...")
    try:
        # 1. Obtener la tarea de Firestore
        task = get_firestore_task(task_id, id_token)
        if not task:
            print(f"[-] [Worker] No se pudo cargar la tarea {task_id} de Firestore.")
            update_firestore_task(task_id, id_token, "failed", progreso="Error al leer la tarea desde la base de datos.")
            return
            
        consulta = task.get("consulta", "")
        if not consulta:
            print(f"[-] [Worker] Consulta vacía en tarea {task_id}.")
            update_firestore_task(task_id, id_token, "failed", progreso="La consulta de la tarea está vacía.")
            return

        # La memoria del agente debe aislarse por usuario y tarea. Si una tarea
        # antigua no trae userId, usamos el task_id como aislamiento mínimo en
        # lugar de mezclarla con la sesión local global.
        user_id = task.get("userId") or f"task_{task_id}"
            
        # 2. Poner la tarea en procesamiento
        update_firestore_task(task_id, id_token, "processing", progreso="Iniciando motor de agentes...")
        
        # 3. Callback para actualizar progreso en Firestore
        def progress_cb(msg):
            print(f"[*] [Worker Task {task_id}] {msg}")
            update_firestore_task(task_id, id_token, "processing", progreso=msg)
            
        # 4. Ejecutar el pipeline de agentes
        resultado = agente_coordinador.run_agent_pipeline(
            consulta,
            progress_cb,
            user_id=user_id,
            task_id=task_id,
            project_id="beatss",
        )
        
        # 5. Marcar como completada
        print(f"[+] [Worker] Tarea {task_id} completada exitosamente.")
        update_firestore_task(task_id, id_token, "completed", progreso="Tarea finalizada con éxito.", resultado=resultado)
        
    except Exception as e:
        print(f"[-] [Worker] Error fatal al procesar tarea {task_id}: {str(e)}")
        update_firestore_task(task_id, id_token, "failed", progreso="Error interno al procesar la tarea.", resultado=str(e))


# Rate limiting para webhooks de pago (máximo 10 peticiones por minuto por IP)
_ip_rate_limits = {}
_ip_rate_limits_lock = threading.Lock()

def check_ip_rate_limit(ip, limit=10, window=60):
    """
    Verifica si una IP ha excedido el límite de solicitudes permitido.
    Retorna True si está permitida, False si debe ser bloqueada.
    """
    global _ip_rate_limits
    now = time.time()
    with _ip_rate_limits_lock:
        if ip not in _ip_rate_limits:
            _ip_rate_limits[ip] = []
        _ip_rate_limits[ip] = [t for t in _ip_rate_limits[ip] if now - t < window]
        if len(_ip_rate_limits[ip]) >= limit:
            return False
        _ip_rate_limits[ip].append(now)
        return True


class HandlerPostMixin:
    def do_POST(self):
        parsed = urlparse(self.path)
        
        # Aplicar Rate Limiting por IP en webhooks y confirmaciones de pago
        if parsed.path in [
            '/api/payments/deuna/webhook',
            '/api/payments/deuna/simulate-confirm',
            '/api/payments/payphone/webhook',
            '/api/payments/payphone/confirm',
            '/api/payments/payphone/subscription/confirm'
        ]:
            client_ip = self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()
            if not check_ip_rate_limit(client_ip, limit=10, window=60):
                print(f"[⚠️ Rate Limit Exceeded] IP {client_ip} ha excedido el límite en {parsed.path}")
                self.send_response(429)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Too Many Requests: Rate limit exceeded. Try again in a minute."}')
                return
        
        # Rutas locales sensibles que requieren autenticación
        protected_paths = [
            '/api/save-local',
            '/api/save-pdf',
            '/api/run-task',
            '/api/organize-obsidian',
            '/api/payments/retry-sri',
            '/api/admin/backup-firestore'
        ]
        
        req_path = parsed.path
        if req_path in protected_paths:
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
        if parsed.path == '/api/save-local':
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            content_length = int(self.headers.get('Content-Length', 0))
            # Limitar tamaño máximo del payload a 50 MB para evitar agotamiento de memoria
            MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
            if content_length > MAX_PAYLOAD_BYTES:
                self.send_response(413)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error": "Payload demasiado grande (maximo 50 MB)"}'.encode('utf-8'))
                return
            post_data = self.rfile.read(content_length)
            
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            try:
                # Validar que los datos recibidos sean JSON válido
                data = json.loads(post_data.decode('utf-8'))
                
                # Escribir con formato legible
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Backup local guardado correctamente"}')
                print(f"💾 Archivo de respaldo físico actualizado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar respaldo local: {str(e)}")
        elif parsed.path == '/api/firebase-upload-pdf':
            # El servidor local actúa como puente para evitar que una política
            # CORS del bucket bloquee el PDF visual generado en localhost. El
            # token del usuario se reenvía a Firebase, por lo que Storage Rules
            # conserva la autorización por UID.
            client_ip = self.client_address[0]
            if client_ip not in ('127.0.0.1', '::1'):
                self.send_response(403)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error":"Este endpoint solo está disponible en el servidor local."}'.encode('utf-8'))
                return

            authorization = self.headers.get('Authorization', '')
            uid = self.headers.get('X-Firebase-Uid', '').strip()
            raw_filename = urllib.parse.unquote(self.headers.get('X-File-Name', 'Contrato.pdf'))
            content_length = int(self.headers.get('Content-Length', 0))
            max_pdf_bytes = 15 * 1024 * 1024

            if not authorization.startswith('Bearer ') or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', uid):
                self.send_response(401)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error":"Falta una sesión válida de Firebase para subir el contrato."}'.encode('utf-8'))
                return
            if content_length <= 4 or content_length > max_pdf_bytes:
                self.send_response(413)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error":"El PDF debe tener menos de 15 MB."}'.encode('utf-8'))
                return

            pdf_bytes = self.rfile.read(content_length)
            if not pdf_bytes.startswith(b'%PDF'):
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error":"El archivo recibido no es un PDF válido."}'.encode('utf-8'))
                return

            safe_filename = re.sub(r'[^a-zA-Z0-9 ._\-\u00c0-\u024f]', '_', raw_filename)
            if not safe_filename.lower().endswith('.pdf'):
                safe_filename += '.pdf'
            object_path = f'licenses/{uid}/{int(time.time() * 1000)}_{safe_filename}'
            encoded_path = urllib.parse.quote(object_path, safe='')
            firebase_token = str(uuid.uuid4())
            upload_url = (
                'https://firebasestorage.googleapis.com/v0/b/'
                'licencias-musicales.firebasestorage.app/o?uploadType=media&name='
                + urllib.parse.quote(object_path, safe='')
            )
            request = urllib.request.Request(
                upload_url,
                data=pdf_bytes,
                headers={
                    'Authorization': authorization,
                    'Content-Type': 'application/pdf',
                    'X-Goog-Meta-FirebaseStorageDownloadTokens': firebase_token
                },
                method='POST'
            )
            try:
                with urllib.request.urlopen(request, timeout=45) as response:
                    uploaded = json.loads(response.read().decode('utf-8'))
                download_tokens = uploaded.get('downloadTokens', firebase_token)
                download_token = download_tokens.split(',')[0]
                download_url = (
                    'https://firebasestorage.googleapis.com/v0/b/licencias-musicales.firebasestorage.app/o/'
                    f'{encoded_path}?alt=media&token={urllib.parse.quote(download_token, safe="")}'
                )
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'downloadUrl': download_url, 'objectPath': object_path}).encode('utf-8'))
                print(f'☁️ PDF de licencia subido a Firebase: {object_path}')
            except urllib.error.HTTPError as error:
                details = error.read().decode('utf-8', errors='replace')[:500]
                self.send_response(error.code)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'Firebase respondió HTTP {error.code}', 'details': details}).encode('utf-8'))
                print(f'❌ Firebase rechazó PDF: HTTP {error.code} {details}')
            except Exception as error:
                self.send_response(502)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({'error': f'No se pudo contactar Firebase: {error}'}).encode('utf-8'))
                print(f'❌ Error al subir PDF a Firebase: {error}')
        elif self.path == '/api/save-pdf':
            content_length = int(self.headers.get('Content-Length', 0))
            # Limitar tamaño máximo del payload a 50 MB
            MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
            if content_length > MAX_PAYLOAD_BYTES:
                self.send_response(413)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error": "Payload demasiado grande (maximo 50 MB)"}'.encode('utf-8'))
                return
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                filename = payload.get('filename')
                pdf_data_uri = payload.get('pdfData')
                
                if not filename or not pdf_data_uri:
                    raise ValueError("Faltan parámetros 'filename' o 'pdfData'")
                
                # Sanitizar el nombre del archivo para prevenir path traversal
                # Solo permitir caracteres alfanuméricos, espacios, guiones y puntos
                safe_filename = re.sub(r'[^a-zA-Z0-9 \-_\.\u00c0-\u024f]', '_', os.path.basename(filename))
                if not safe_filename.lower().endswith('.pdf'):
                    safe_filename += '.pdf'
                
                # Extraer base64 si viene como Data URI
                if ',' in pdf_data_uri:
                    base64_str = pdf_data_uri.split(',')[1]
                else:
                    base64_str = pdf_data_uri
                
                import base64
                pdf_bytes = base64.b64decode(base64_str)
                
                # Definir ruta de guardado: ~/Documents/Licencias
                target_dir = os.path.expanduser('~/Documents/Licencias')
                os.makedirs(target_dir, exist_ok=True)
                
                filepath = os.path.join(target_dir, safe_filename)
                # Verificar que el path resuelto esté dentro del directorio permitido (doble check)
                if not os.path.realpath(filepath).startswith(os.path.realpath(target_dir)):
                    raise ValueError("Nombre de archivo no permitido")
                
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "PDF guardado en Documentos/Licencias"}')
                print(f"📄 PDF de licencia guardado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar PDF local: {str(e)}")
        elif parsed.path == '/api/run-task':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                task_id = payload.get('taskId')
                id_token = payload.get('idToken')
                
                if not task_id or not id_token:
                    raise ValueError("Faltan parámetros 'taskId' o 'idToken'")
                
                # Iniciar procesamiento en segundo plano (hilo asíncrono)
                t = threading.Thread(target=process_async_task, args=(task_id, id_token))
                t.daemon = True
                t.start()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Task processing started in background"}')
                print(f"⚙️ Procesamiento asíncrono iniciado para la tarea: {task_id}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al iniciar tarea asíncrona: {str(e)}")
        elif parsed.path == '/api/organize-obsidian':
            try:
                # Ejecutar organización y regeneración de dashboard
                organize_files()
                generate_dashboard()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Obsidian vault organized successfully"}')
                print("[+] Obsidian vault organized successfully on request")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error organizing Obsidian: {str(e)}")
        elif parsed.path == '/api/payments/deuna/qr':
            from api.payment_handlers import handle_deuna_qr
            handle_deuna_qr(self, parsed)
        elif parsed.path == '/api/payments/deuna/webhook' or parsed.path == '/api/payments/deuna/simulate-confirm':
            from api.payment_handlers import handle_deuna_webhook
            handle_deuna_webhook(self, parsed)
        elif parsed.path == '/api/admin/backup-firestore':
            try:
                token = get_admin_token()
                if not token:
                    raise RuntimeError("No autorizado: gcloud local no autenticado o no disponible.")
                
                print("[*] Iniciando respaldo completo de Firestore a JSON...")
                backup_data = {}
                
                # Colecciones a respaldar
                collections = ["users", "payments", "referrals", "vip_codes"]
                for col in collections:
                    docs = fetch_firestore_collection(col, token)
                    backup_data[col] = []
                    for doc in docs:
                        doc_name = doc.get("name", "")
                        doc_id = doc_name.split("/")[-1]
                        doc_fields = doc.get("fields", {})
                        
                        doc_entry = {
                            "id": doc_id,
                            "fields": doc_fields
                        }
                        
                        # Si es de la colección users, descargar subcolección beats
                        if col == "users":
                            beats_docs = fetch_firestore_collection(f"users/{doc_id}/beats", token)
                            doc_entry["beats"] = []
                            for beat in beats_docs:
                                b_id = beat.get("name", "").split("/")[-1]
                                doc_entry["beats"].append({
                                    "id": b_id,
                                    "fields": beat.get("fields", {})
                                })
                                
                        backup_data[col].append(doc_entry)
                
                # Guardar en archivo local
                timestamp = int(time.time())
                backup_filename = f"firestore_backup_{timestamp}.json"
                backup_path = os.path.join(DIRECTORY, backup_filename)
                
                with open(backup_path, "w", encoding="utf-8") as f:
                    json.dump(backup_data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                
                res_payload = {
                    "status": "success",
                    "filename": backup_filename,
                    "filepath": backup_path,
                    "summary": {col: len(backup_data[col]) for col in collections}
                }
                self.wfile.write(json.dumps(res_payload).encode('utf-8'))
                print(f"💾 Respaldo de Firestore guardado exitosamente en: {backup_path}")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al respaldar Firestore: {str(e)}")
        elif parsed.path == '/api/generate-contract-pdf':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                
                ref_code = payload.get('refCode', 'REF')
                markdown_content = payload.get('markdownText', '')
                producer_id = payload.get('producerId', 'sossa')
                
                if not markdown_content:
                    raise ValueError("Falta parámetro 'markdownText'")
                    
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                    temp_pdf_path = temp_pdf.name
                    
                crypto_hash = generate_pdf_from_contract(temp_pdf_path, markdown_content, payload)
                
                with open(temp_pdf_path, 'rb') as f:
                    pdf_bytes = f.read()
                    
                try:
                    os.remove(temp_pdf_path)
                except Exception:
                    pass
                    
                beat_name = payload.get('beatName', 'Beat')
                buyer_name = payload.get('buyerName', 'Comprador')
                license_type = payload.get('licenseType', 'basic')
                
                filename = f"Licencia_{license_type.upper()}_{ref_code} - {beat_name} - {buyer_name}.pdf"
                safe_filename = re.sub(r'[^a-zA-Z0-9 \-_\.\u00c0-\u024f]', '_', filename)
                if not safe_filename.lower().endswith('.pdf'):
                    safe_filename += '.pdf'
                    
                # El archivo se devuelve al navegador aunque el directorio de
                # respaldo local no esté disponible (por permisos o un disco
                # externo). Nunca debe fallar la entrega por ese respaldo.
                filepath = None
                try:
                    target_dir = os.path.expanduser('~/Documents/Licencias')
                    os.makedirs(target_dir, exist_ok=True)
                    filepath = os.path.join(target_dir, safe_filename)
                    with open(filepath, 'wb') as f:
                        f.write(pdf_bytes)
                except OSError as archive_error:
                    print(f"⚠️ PDF generado sin copia local: {archive_error}")
                    
                save_license_hash_in_firestore(producer_id, ref_code, crypto_hash)
                save_license_hash_in_local_backup(producer_id, ref_code, crypto_hash)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_filename}"')
                self.send_cors_headers()
                self.send_header('Access-Control-Expose-Headers', 'Content-Disposition, X-Crypto-Hash')
                self.send_header('X-Crypto-Hash', crypto_hash)
                self.end_headers()
                self.wfile.write(pdf_bytes)
                if filepath:
                    print(f"📄 PDF criptográfico generado y guardado en: {filepath}")
                else:
                    print("📄 PDF criptográfico generado y entregado al navegador sin copia local")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar PDF Criptográfico: {str(e)}")
        elif parsed.path == '/api/activate-pro':
            from api.payment_handlers import handle_activate_pro
            handle_activate_pro(self, parsed)
        elif parsed.path == '/api/payments/payphone/subscription/confirm':
            from api.payment_handlers import handle_payphone_subscription_confirm
            handle_payphone_subscription_confirm(self, parsed)
        elif parsed.path == '/api/payments/payphone/confirm':
            # El confirmador Python anterior escribía compras con referencias
            # heredadas y no comparte las validaciones canónicas del endpoint
            # serverless. Para no tener dos lógicas de cobro, el servidor
            # local no procesa PayPhone: las pruebas y los cobros reales deben
            # pasar por el endpoint de producción actualizado.
            self.send_response(410)
            self.send_header('Content-Type', 'application/json')
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": "PayPhone no se procesa desde el servidor local. Usa el flujo seguro desplegado."
            }).encode('utf-8'))
        elif parsed.path == '/api/payments/retry-sri':
            from api.sri_handlers import handle_retry_sri
            handle_retry_sri(self, parsed)
        elif parsed.path == '/api/support-chat':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                message = payload.get('message', '').strip()
                lang = payload.get('lang', 'es').strip()
                producer_config = payload.get('producerConfig')
                license_history = payload.get('licenseHistory')

                if not message:
                    raise ValueError("Falta el parámetro 'message' o está vacío")

                # Construir el contexto en formato de texto para pasar a la directiva del sistema
                context_parts = []
                
                # Configuración del productor
                if producer_config and isinstance(producer_config, dict):
                    prod_name = producer_config.get('producerName', 'sossa')
                    sayco = producer_config.get('sayco', 'No registrado')
                    paypal_email = producer_config.get('paypalEmail', 'No especificado')
                    context_parts.append(
                        f"Información del productor musical activo:\n"
                        f"- Nombre del productor: {prod_name}\n"
                        f"- Registro SAYCO / PRO: {sayco}\n"
                        f"- Email de PayPal: {paypal_email}"
                    )
                else:
                    context_parts.append("Productor: sossa")
                
                # Historial de licencias del usuario
                if license_history and isinstance(license_history, list) and len(license_history) > 0:
                    context_parts.append("Historial de licencias compradas por este usuario en BEATSS:")
                    for idx, lic in enumerate(license_history, start=1):
                        beat_name = lic.get('beatName', 'Desconocido')
                        ref_code = lic.get('refCode', 'Sin código')
                        lic_type = lic.get('licenseType', 'Básica')
                        date = lic.get('date', 'Fecha desconocida')
                        context_parts.append(
                            f"  {idx}. Beat: '{beat_name}' | Licencia: {lic_type} | Código de referencia: {ref_code} | Fecha: {date}"
                        )
                else:
                    context_parts.append("El usuario no tiene historial de licencias compradas en esta sesión/navegador.")

                context_text = "\n".join(context_parts)

                # Definir instrucciones del sistema según el idioma
                if lang == 'en':
                    sys_prompt = f"""Support Assistant for BEATSS (by sossa). Context: {context_text}
Rules:
- YouTube Claims: Dispute using: "I hold commercial exploitation rights under a license granted by sossa via BEATSS (Ref: [REF_CODE] / Beat: '[BEAT_NAME]')." Released in 24-72h.
- Formats: Basic=MP3, Premium=MP3+WAV, Premium Plus=Stems, Unlimited=Stems, Exclusive=All.
- Splits: Artist 50% / sossa 50% Composer.
- Payments: Ecuador=Deuna!/Transfer; Global=PayPal/Cards.
- Behavior: Reply in English, very concise, friendly, markdown."""
                else:
                    sys_prompt = f"""Soporte de BEATSS (por sossa). Contexto: {context_text}
Reglas:
- Content ID: Disputar con: "Tengo los derechos de explotación bajo licencia otorgada por sossa en BEATSS (Ref: [REF_CODE] / Beat: '[BEAT_NAME]')." Retiro en 24-72h.
- Formatos: Básica=MP3, Premium=MP3+WAV, Premium Plus=Stems, Ilimitada=Stems, Exclusiva=Todos (incluyendo Proyecto FLP).
- Splits: Artista 50% / sossa 50% Compositor.
- Pagos: Ecuador=Deuna!/Transferencia; Global=PayPal/Tarjeta.
- Conducta: Responde en Español, muy conciso, amigable, markdown."""

                from llm_utils import call_llm, llm_manager, OllamaProvider, LMStudioProvider, GeminiProvider
                
                # Llamar al LLM seleccionado a través de la función de llm_utils con contexto optimizado de 4096
                ai_response = call_llm(sys_prompt, message, num_ctx=4096)
                
                if not ai_response:
                    raise RuntimeError("No se obtuvo respuesta del servicio de IA")
                
                # Detectar el proveedor de IA activo para comunicarlo al frontend
                active_provider = llm_manager.get_provider()
                provider_info = "Gemini Cloud"
                if active_provider:
                    if isinstance(active_provider, OllamaProvider):
                        provider_info = f"Ollama ({active_provider.model_name})"
                    elif isinstance(active_provider, LMStudioProvider):
                        provider_info = "LM Studio"
                    elif isinstance(active_provider, GeminiProvider):
                        provider_info = "Gemini Cloud"
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success", 
                    "response": ai_response,
                    "provider": provider_info
                }).encode('utf-8'))
                print(f"[+] [Support Chat] Pregunta respondida usando {provider_info} ({lang})")

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ [Support Chat] Error al responder chat de soporte: {str(e)}")
        elif parsed.path == '/api/admin/copilot':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                message = payload.get('message', '').strip()
                
                if not message:
                    raise ValueError("Falta el parámetro 'message' o está vacío")

                # Cargar el archivo de respaldo para extraer estadísticas en tiempo real
                backup_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sossa_backup_sincronizado.json")
                total_revenue = 0.0
                total_licenses = 0
                payment_methods = {}
                license_types = {}
                beats_sales = {}
                buyer_ltv = {}
                
                if os.path.exists(backup_path):
                    try:
                        with open(backup_path, "r", encoding="utf-8") as f:
                            data = json.load(f)
                        history_str = data.get("sossa_license_history", "[]")
                        history = json.loads(history_str)
                        total_licenses = len(history)
                        
                        for item in history:
                            val = item.get("value")
                            try:
                                price = float(val) if val is not None else 0.0
                            except (ValueError, TypeError):
                                price = 0.0
                                
                            total_revenue += price
                            
                            method = item.get("paymentMethod", "desconocido")
                            payment_methods[method] = payment_methods.get(method, 0) + 1
                            
                            lic_type = item.get("type", "desconocido")
                            license_types[lic_type] = license_types.get(lic_type, 0) + 1
                            
                            beat = item.get("beatName", "desconocido")
                            beats_sales[beat] = beats_sales.get(beat, 0) + 1
                            
                            buyer = item.get("buyerName", "desconocido")
                            buyer_ltv[buyer] = buyer_ltv.get(buyer, 0.0) + price
                    except Exception as e:
                        print(f"[-] [Copilot Backend] Error al parsear sossa_backup_sincronizado.json: {e}")

                # Dar formato a las variables para inyectar en el Prompt
                top_beats = sorted(beats_sales.items(), key=lambda x: x[1], reverse=True)[:3]
                top_beats_str = ", ".join([f"'{b[0]}' ({b[1]} ventas)" for b in top_beats]) if top_beats else "Ninguno"
                
                top_buyer = sorted(buyer_ltv.items(), key=lambda x: x[1], reverse=True)[:1]
                top_buyer_str = f"{top_buyer[0][0]} (LTV: ${top_buyer[0][1]:.2f})" if top_buyer else "Ninguno"
                
                methods_str = ", ".join([f"{k}: {v}" for k, v in payment_methods.items()]) if payment_methods else "Ninguno"
                types_str = ", ".join([f"{k}: {v}" for k, v in license_types.items()]) if license_types else "Ninguno"

                sys_prompt = f"""Copiloto Analítico y Estratégico de BEATSS. Asiste al productor sossa.
DATOS DEL CATÁLOGO:
- Ingresos: ${total_revenue:.2f} USD
- Licencias: {total_licenses}
- Distribución: {types_str}
- Métodos de Pago: {methods_str}
- Top Beats: {top_beats_str}
- Cliente VIP: {top_buyer_str}
INSTRUCCIONES:
- Responde en Español.
- Sé analítico, sugiere bundles, promociones, optimización de precios de Beats e incentivos de upgrade.
- Formato limpio con negritas y viñetas."""

                from llm_utils import call_llm, llm_manager, OllamaProvider, LMStudioProvider, GeminiProvider
                
                # Consultar al LLM (con fallback dinámico activado y contexto de 4096)
                ai_response = call_llm(sys_prompt, message, num_ctx=4096)
                
                if not ai_response:
                    raise RuntimeError("No se obtuvo respuesta del Copiloto de IA")
                
                # Detectar proveedor
                active_provider = llm_manager.get_provider()
                provider_info = "Gemini Cloud"
                if ai_response and ai_response.startswith("**[Asistente Estático"):
                    provider_info = "Motor Estático (Sin Conexión)"
                elif active_provider:
                    if isinstance(active_provider, OllamaProvider):
                        provider_info = f"Ollama ({active_provider.model_name})"
                    elif isinstance(active_provider, LMStudioProvider):
                        provider_info = "LM Studio"
                    elif isinstance(active_provider, GeminiProvider):
                        provider_info = "Gemini Cloud"

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success", 
                    "response": ai_response,
                    "provider": provider_info
                }).encode('utf-8'))
                print(f"[+] [Admin Copilot] Consulta procesada usando {provider_info}")

            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ [Admin Copilot] Error en el Copiloto de administración: {str(e)}")
        elif parsed.path == '/api/gdrive-upload-session':
            auth_header = self.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "No autorizado: falta el token de sesion"}')
                return
            id_token = auth_header.split('Bearer ')[1].strip()
            
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                file_name = payload.get('fileName')
                sub_folder = payload.get('subFolder', 'Beats')
                content_type = payload.get('contentType', 'application/octet-stream')
                producer_aka = payload.get('producerAka', 'BEATSS')
                
                if not file_name:
                    raise ValueError("Falta parametro fileName")
                
                from firestore_ops import fetch_firestore_document
                admin_token = get_admin_token()
                if not admin_token:
                    raise RuntimeError("No hay credenciales administrativas disponibles para consultar Storage")
                gdrive_config = fetch_firestore_document('system/gdrive_config', admin_token)
                if not gdrive_config:
                    raise Exception("El Google Drive central no esta vinculado o error al leer configuracion.")
                    
                client_id = gdrive_config.get('clientId')
                client_secret = gdrive_config.get('clientSecret')
                refresh_token = gdrive_config.get('refreshToken')
                
                if not client_id or not client_secret or not refresh_token:
                    raise Exception("Configuracion de Google Drive incompleta.")
                    
                token_url = "https://oauth2.googleapis.com/token"
                token_data = urllib.parse.urlencode({
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token"
                }).encode("utf-8")
                
                req = urllib.request.Request(token_url, data=token_data, method="POST")
                with urllib.request.urlopen(req) as response:
                    token_res = json.loads(response.read().decode("utf-8"))
                    access_token = token_res["access_token"]
                    
                root_folder_name = f"{producer_aka} Licencias"
                root_folder_id = get_or_create_drive_folder(access_token, root_folder_name)
                target_folder_id = get_or_create_drive_folder(access_token, sub_folder, root_folder_id)
                
                session_url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable"
                session_meta = {
                    "name": file_name,
                    "parents": [target_folder_id]
                }
                
                session_headers = {
                    "Authorization": f"Bearer {access_token}",
                    "Content-Type": "application/json; charset=UTF-8",
                    "X-Upload-Content-Type": content_type
                }
                
                req = urllib.request.Request(
                    session_url, 
                    data=json.dumps(session_meta).encode("utf-8"), 
                    headers=session_headers, 
                    method="POST"
                )
                
                with urllib.request.urlopen(req) as response:
                    upload_url = response.headers.get("Location")
                    if not upload_url:
                        raise Exception("Google Drive API no devolvio el Location para subida resumible.")
                        
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "uploadUrl": upload_url}).encode('utf-8'))
                print(f"[+] [Google Drive Upload] Sesion iniciada para {file_name}")
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ [Google Drive Upload] Error al generar sesion: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()
