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
from urllib.parse import urlparse, parse_qs

from server_utils import get_admin_token, resolve_backup_file
from firestore_ops import update_firestore_task, get_firestore_task, fetch_firestore_collection, fetch_firestore_document
from admin_config import get_admin_config, save_license_hash_in_firestore, save_license_hash_in_local_backup
from pdf_generator import generate_pdf_from_contract
from sri_service import emitir_factura_sri_background, actualizar_secuencial_sri, actualizar_estado_factura_db
from payment_verifier import verify_paypal_order, update_user_plan_in_firestore, confirm_payment_in_firestore
from organize_obsidian import organize_files, generate_dashboard
import agente_coordinador
import sri_invoicing
import sri_ride

DIRECTORY = os.path.dirname(os.path.abspath(__file__))


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
            
        # 2. Poner la tarea en procesamiento
        update_firestore_task(task_id, id_token, "processing", progreso="Iniciando motor de agentes...")
        
        # 3. Callback para actualizar progreso en Firestore
        def progress_cb(msg):
            print(f"[*] [Worker Task {task_id}] {msg}")
            update_firestore_task(task_id, id_token, "processing", progreso=msg)
            
        # 4. Ejecutar el pipeline de agentes
        resultado = agente_coordinador.run_agent_pipeline(consulta, progress_cb)
        
        # 5. Marcar como completada
        print(f"[+] [Worker] Tarea {task_id} completada exitosamente.")
        update_firestore_task(task_id, id_token, "completed", progreso="Tarea finalizada con éxito.", resultado=resultado)
        
    except Exception as e:
        print(f"[-] [Worker] Error fatal al procesar tarea {task_id}: {str(e)}")
        update_firestore_task(task_id, id_token, "failed", progreso="Error interno al procesar la tarea.", resultado=str(e))


class HandlerPostMixin:
    def do_POST(self):
        parsed = urlparse(self.path)
        
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
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                purchase_id = payload.get('purchaseId')
                amount = payload.get('amount')
                deuna_phone = payload.get('deunaPhone', '0999999999')
                
                if not purchase_id or not amount:
                    raise ValueError("Faltan parámetros 'purchaseId' o 'amount'")
                
                # Formatear deeplink para la app Deuna!
                clean_phone = "".join(filter(str.isdigit, str(deuna_phone)))
                deeplink = f"deuna://payment?phone={clean_phone}&amount={amount}&description=BEATSS-{purchase_id}"
                
                # Usar Google Charts API para generar QR interactivo
                qr_url = f"https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl={urllib.parse.quote(deeplink)}&choe=UTF-8"
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                
                res_payload = {
                    "status": "success",
                    "qrUrl": qr_url,
                    "deeplink": deeplink
                }
                self.wfile.write(json.dumps(res_payload).encode('utf-8'))
                print(f"📲 QR de Deuna! generado para compra: {purchase_id} ($ {amount})")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar QR Deuna: {str(e)}")
        elif parsed.path == '/api/payments/deuna/webhook' or parsed.path == '/api/payments/deuna/simulate-confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                print(f"[+] Recibido webhook de Deuna!: {json.dumps(payload)}")
                
                purchase_id = payload.get('purchaseId')
                status = payload.get('status')
                
                # Intentar extraer del campo description o reference (para Deuna! Negocios real)
                description = payload.get('description') or payload.get('reference') or payload.get('detail') or payload.get('memo')
                
                # Si viene anidado en 'data' (común en webhooks de Deuna! Negocios)
                if not description and isinstance(payload.get('data'), dict):
                    data_obj = payload.get('data')
                    description = data_obj.get('description') or data_obj.get('reference') or data_obj.get('detail')
                    if not status:
                        status = data_obj.get('status') or data_obj.get('state')
                
                if not status:
                    status = 'completed' # Fallback para simulación
                
                if description and 'BEATSS-' in str(description):
                    desc_str = str(description)
                    match = re.search(r'BEATSS-([a-zA-Z0-9_-]+)', desc_str)
                    if match:
                        purchase_id = match.group(1)
                        print(f"[+] Extraído purchase_id '{purchase_id}' del campo de descripción: {desc_str}")
                
                if not purchase_id:
                    raise ValueError("Falta parámetro 'purchaseId' o no se pudo extraer de la descripción")
                
                # Normalizar estados de éxito comunes (completed, paid, success, approved, done, processed)
                is_completed = False
                status_lower = str(status).lower()
                if status_lower in ['completed', 'approved', 'paid', 'success', 'done', 'processed']:
                    is_completed = True
                
                success = False
                if is_completed:
                    success = confirm_payment_in_firestore(purchase_id)
                else:
                    print(f"[-] Webhook recibido pero estado '{status}' no indica éxito.")
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "message": f"Pago {purchase_id} confirmado exitosamente"}).encode('utf-8'))
                else:
                    raise RuntimeError("Error al confirmar el pago en Firestore")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error en webhook/confirmación de Deuna: {str(e)}")
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
                    
                target_dir = os.path.expanduser('~/Documents/Licencias')
                os.makedirs(target_dir, exist_ok=True)
                filepath = os.path.join(target_dir, safe_filename)
                
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                    
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
                print(f"📄 PDF Criptográfico generado, firmado y guardado en: {filepath}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar PDF Criptográfico: {str(e)}")
        elif parsed.path == '/api/activate-pro':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                order_id = payload.get('orderId')
                uid = payload.get('uid')
                email = payload.get('email', '')
                
                if not order_id or not uid:
                    raise ValueError("Faltan parámetros 'orderId' o 'uid'")
                
                # Si es un ID de simulación mock, omitir la verificación real
                if order_id.startswith('PAYPAL-SUB-MOCK-'):
                    plan = payload.get('plan', 'pro')
                    print(f"[+] Simulando pago exitoso de PayPal para plan {plan} del usuario {uid}")
                    activation_success = update_user_plan_in_firestore(uid, plan, email)
                    if activation_success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_cors_headers()
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "success": True, 
                            "plan": plan,
                            "message": f"Suscripción {plan.upper()} activada exitosamente (Simulación)"
                        }).encode('utf-8'))
                        return
                    else:
                        raise RuntimeError("Error al actualizar el plan en Firestore en simulación")
                
                # Cargar credenciales PayPal del administrador
                admin_config = get_admin_config()
                paypal_client_id = admin_config.get('paypalClientId')
                paypal_client_secret = admin_config.get('paypalClientSecret')
                
                if not paypal_client_id or not paypal_client_secret:
                    raise ValueError("El administrador de la plataforma no tiene configuradas sus credenciales de PayPal.")
                
                # Verificar orden en PayPal
                success, plan, amount = verify_paypal_order(order_id, paypal_client_id, paypal_client_secret)
                
                if not success:
                    raise RuntimeError("No se pudo verificar el pago en PayPal o no ha sido completado.")
                
                # Activar el plan en Firestore y local
                activation_success = update_user_plan_in_firestore(uid, plan, email)
                
                if activation_success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "success": True, 
                        "plan": plan,
                        "message": f"Suscripción {plan.upper()} activada exitosamente."
                    }).encode('utf-8'))
                    print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid} ($ {amount})")
                else:
                    raise RuntimeError("Error al actualizar el plan en Firestore")
                    
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                print(f"❌ Error en /api/activate-pro: {str(e)}")
        elif parsed.path == '/api/payments/payphone/subscription/confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payphone_id = payload.get('id')
                client_tx_id = payload.get('clientTxId')
                uid = payload.get('uid')
                plan = payload.get('plan', 'pro')
                email = payload.get('email', '')
                
                if not payphone_id or not client_tx_id or not uid:
                    raise ValueError("Faltan parámetros 'id', 'clientTxId' o 'uid'")
                
                # Si es un ID de simulación mock, omitir la verificación real
                if client_tx_id.startswith('PAYPHONE-SUB-MOCK-'):
                    print(f"[+] Simulando pago exitoso de PayPhone para suscripción del usuario {uid}")
                    success = update_user_plan_in_firestore(uid, plan, email)
                    if success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_cors_headers()
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "status": "success", 
                            "message": f"Suscripción {plan.upper()} activada exitosamente (Simulación)"
                        }).encode('utf-8'))
                        return
                    else:
                        raise RuntimeError("Error al actualizar el plan en Firestore en simulación")
                
                # Cargar el token privado de Payphone del ADMIN (sossa)
                admin_config = get_admin_config()
                payphone_client_id = admin_config.get('payphoneClientId')
                
                if not payphone_client_id:
                    raise ValueError("El administrador de la plataforma no ha configurado sus credenciales de PayPhone.")
                
                # Consumir la API de confirmación de PayPhone por HTTPS POST
                confirm_url = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"
                confirm_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"bearer {payphone_client_id}"
                }
                confirm_body = {
                    "id": int(payphone_id),
                    "clientTxId": client_tx_id
                }
                
                confirm_req = urllib.request.Request(
                    confirm_url,
                    data=json.dumps(confirm_body).encode('utf-8'),
                    headers=confirm_headers,
                    method="POST"
                )
                
                try:
                    with urllib.request.urlopen(confirm_req) as response:
                        res_data = json.loads(response.read().decode('utf-8'))
                except urllib.error.HTTPError as he:
                    err_msg = he.read().decode('utf-8')
                    try:
                        err_json = json.loads(err_msg)
                        raise RuntimeError(err_json.get('message', 'Error en la API de PayPhone'))
                    except Exception:
                        raise RuntimeError(f"Error HTTP de PayPhone ({he.code}): {err_msg}")
                except Exception as e:
                    raise RuntimeError(f"Error de red al conectar con PayPhone: {str(e)}")
                
                status_approved = (
                    res_data.get('transactionStatus') == 'Approved' or 
                    res_data.get('status') == 'Approved' or 
                    res_data.get('statusCode') == 3
                )
                
                if not status_approved:
                    raise RuntimeError(res_data.get('message', 'La transacción no fue aprobada por PayPhone'))
                
                success = update_user_plan_in_firestore(uid, plan, email)
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "success", 
                        "message": f"Suscripción {plan.upper()} activada exitosamente tras pago PayPhone"
                    }).encode('utf-8'))
                    print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid}")
                else:
                    raise RuntimeError("Error al actualizar el plan en Firestore")
                    
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al confirmar suscripción PayPhone: {str(e)}")
        elif parsed.path == '/api/payments/payphone/confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payphone_id = payload.get('id')
                client_tx_id = payload.get('clientTxId')
                producer_id = payload.get('producerId', 'sossa')
                
                if not payphone_id or not client_tx_id:
                    raise ValueError("Faltan parámetros 'id' o 'clientTxId' de la transacción PayPhone")
                
                # Cargar el token privado de Payphone del productor desde su respaldo local
                backup_path, username = resolve_backup_file(producer_id)
                
                payphone_client_id = ""
                backup_data = {}
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        backup_data = json.load(f)
                    
                    # Buscar en las llaves del respaldo
                    for key, val in backup_data.items():
                        if key.endswith('_producer_config') and val:
                            try:
                                config_data = json.loads(val) if isinstance(val, str) else val
                                if config_data.get('payphoneClientId'):
                                    payphone_client_id = config_data.get('payphoneClientId')
                                    break
                            except Exception:
                                pass
                
                if not payphone_client_id:
                    raise ValueError("El productor no tiene configurado su PayPhone Token de Desarrollador en su perfil.")
                
                # Consumir la API de confirmación de PayPhone por HTTPS POST
                confirm_url = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"
                confirm_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"bearer {payphone_client_id}"
                }
                confirm_body = {
                    "id": int(payphone_id),
                    "clientTxId": client_tx_id
                }
                
                confirm_req = urllib.request.Request(
                    confirm_url,
                    data=json.dumps(confirm_body).encode('utf-8'),
                    headers=confirm_headers,
                    method="POST"
                )
                
                try:
                    with urllib.request.urlopen(confirm_req) as response:
                        res_data = json.loads(response.read().decode('utf-8'))
                except urllib.error.HTTPError as he:
                    err_msg = he.read().decode('utf-8')
                    try:
                        err_json = json.loads(err_msg)
                        raise RuntimeError(err_json.get('message', 'Error en la API de PayPhone'))
                    except Exception:
                        raise RuntimeError(f"Error HTTP de PayPhone ({he.code}): {err_msg}")
                except Exception as e:
                    raise RuntimeError(f"Error de red al conectar con PayPhone: {str(e)}")
                
                # Validar estado de la transacción en la respuesta
                status_approved = (
                    res_data.get('transactionStatus') == 'Approved' or 
                    res_data.get('status') == 'Approved' or 
                    res_data.get('statusCode') == 3
                )
                
                if not status_approved:
                    raise RuntimeError(res_data.get('message', 'La transacción no fue aprobada por PayPhone'))
                
                # Registrar el pago en Firestore (si hay token admin disponible)
                admin_token = get_admin_token()
                
                items = payload.get('items', [])
                discount_percent = float(payload.get('discountPercent', 0))
                coupon_code = payload.get('couponCode', '')
                buyer_name = payload.get('buyerName', 'Comprador')
                buyer_email = payload.get('buyerEmail', '')
                buyer_phone = payload.get('buyerPhone', '')
                buyer_dni = payload.get('buyerDni', '')
                buyer_city = payload.get('buyerCity', '')
                buyer_country = payload.get('buyerCountry', '')
                youtube_whitelist = payload.get('youtubeWhitelist', '')
                
                firestore_success = False
                inserted_payment_ids = []
                if admin_token:
                    try:
                        for item in items:
                            order_fields = {
                                "type": {"stringValue": "beat_purchase"},
                                "producerId": {"stringValue": producer_id},
                                "beatId": {"stringValue": item.get('beatId', '')},
                                "beatName": {"stringValue": item.get('beatName', '')},
                                "licenseType": {"stringValue": item.get('licenseType', 'basic')},
                                "price": {"doubleValue": float(item.get('price', 0))},
                                "buyerName": {"stringValue": buyer_name},
                                "buyerEmail": {"stringValue": buyer_email},
                                "buyerPhone": {"stringValue": buyer_phone},
                                "buyerDni": {"stringValue": buyer_dni},
                                "buyerCity": {"stringValue": buyer_city},
                                "buyerCountry": {"stringValue": buyer_country},
                                "youtubeWhitelist": {"stringValue": youtube_whitelist},
                                "method": {"stringValue": "payphone"},
                                "reference": {"stringValue": client_tx_id},
                                "receiptUrl": {"stringValue": ""},
                                "status": {"stringValue": "approved"},
                                "discountPercent": {"doubleValue": discount_percent},
                                "couponCode": {"stringValue": coupon_code},
                                "originalPrice": {"doubleValue": float(item.get('price', 0))},
                                "finalPrice": {"doubleValue": float(item.get('price', 0)) * (1 - (discount_percent / 100))},
                                "timestamp": {"stringValue": datetime.datetime.utcnow().isoformat() + "Z"},
                                "acceptedTerms": {"booleanValue": True},
                                "acceptanceTimestamp": {"stringValue": payload.get('acceptanceTimestamp', datetime.datetime.utcnow().isoformat() + "Z")}
                            }
                            
                            fs_url = "https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments"
                            fs_req = urllib.request.Request(
                                fs_url,
                                data=json.dumps({"fields": order_fields}).encode('utf-8'),
                                headers={
                                    "Authorization": f"Bearer {admin_token}",
                                    "Content-Type": "application/json"
                                },
                                method="POST"
                            )
                            with urllib.request.urlopen(fs_req) as fs_res:
                                fs_res_data = json.loads(fs_res.read().decode('utf-8'))
                                doc_id = fs_res_data.get('name', '').split('/')[-1]
                                inserted_payment_ids.append(doc_id)
                        firestore_success = True
                    except Exception as fe:
                        print(f"[-] Error al guardar pago de PayPhone en Firestore: {fe}")
                
                # Actualizar localmente en el historial de licencias del productor
                try:
                    # Buscar la subllave de historial
                    history_key = ""
                    for k in backup_data.keys():
                        if k.endswith('_license_history'):
                            history_key = k
                            break
                            
                    if not history_key:
                        history_key = f"{producer_id}_license_history"
                        
                    history_str = backup_data.get(history_key, '[]')
                    history_list = json.loads(history_str)
                    
                    for item in items:
                        lic_id = inserted_payment_ids.pop(0) if inserted_payment_ids else f"local_{int(time.time()*1000)}"
                        new_license_entry = {
                            "id": lic_id,
                            "refCode": f"LIC-{item.get('licenseType', 'basic').upper()}-{client_tx_id[:8]}",
                            "beatId": item.get('beatId', ''),
                            "beatName": item.get('beatName', ''),
                            "buyerName": buyer_name,
                            "buyerEmail": buyer_email,
                            "date": datetime.datetime.now().strftime("%Y-%m-%d"),
                            "value": float(item.get('price', 0)) * (1 - (discount_percent / 100)),
                            "type": item.get('licenseType', 'basic'),
                            "youtubeWhitelist": youtube_whitelist,
                            "formData": {
                                "buyerName": buyer_name,
                                "buyerEmail": buyer_email,
                                "buyerPhone": buyer_phone,
                                "buyerId": buyer_dni,
                                "buyerCity": buyer_city,
                                "buyerCountry": buyer_country,
                                "youtubeWhitelist": youtube_whitelist
                            },
                            "status": "approved",
                            "paymentMethod": "payphone",
                            "reference": client_tx_id,
                            "acceptedTerms": True,
                            "acceptanceTimestamp": payload.get('acceptanceTimestamp', datetime.datetime.utcnow().isoformat() + "Z")
                        }
                        history_list.append(new_license_entry)
                        
                    backup_data[history_key] = json.dumps(history_list, ensure_ascii=False)
                    with open(backup_path, 'w', encoding='utf-8') as f:
                        json.dump(backup_data, f, indent=2, ensure_ascii=False)
                    print(f"[+] Compra PayPhone guardada con éxito en respaldo local: {client_tx_id}")
                    
                    # Disparar la facturación SRI en segundo plano
                    threading.Thread(
                        target=emitir_factura_sri_background,
                        args=(client_tx_id, producer_id)
                    ).start()
                except Exception as le:
                    print(f"[-] Error al actualizar historial local de licencias tras cobro PayPhone: {le}")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": "Pago de PayPhone verificado y registrado exitosamente",
                    "transactionId": client_tx_id
                }).encode('utf-8'))
                print(f"✅ Transacción PayPhone confirmada exitosamente: {client_tx_id}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al confirmar pago de PayPhone: {str(e)}")
        elif parsed.path == '/api/payments/retry-sri':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payment_id = payload.get('paymentId')
                producer_id = payload.get('producerId', 'sossa')
                
                if not payment_id:
                    raise ValueError("Falta parámetro 'paymentId'")
                
                # Cargar el historial local del productor para buscar la referencia
                backup_path, username = resolve_backup_file(producer_id)
                reference = None
                payment_entry = None
                
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        backup_data = json.load(f)
                    history_key = f"{producer_id}_license_history"
                    if history_key not in backup_data:
                        history_key = f"{username}_license_history"
                    history_str = backup_data.get(history_key, "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        reference = payment_entry.get('reference') or payment_entry.get('refCode') or payment_id
                        
                # Si no se encuentra localmente, buscar en Firestore si hay token
                if not reference:
                    token = get_admin_token()
                    if token:
                        try:
                            url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                            with urllib.request.urlopen(req) as res:
                                doc = json.loads(res.read().decode('utf-8'))
                                fields = doc.get('fields', {})
                                reference = fields.get('reference', {}).get('stringValue') or payment_id
                                payment_entry = {
                                    'sriEstado': fields.get('sriEstado', {}).get('stringValue', '')
                                }
                        except Exception as e:
                            print(f"[-] [SRI Retry] Error al buscar en Firestore: {e}")
                
                if not reference:
                    # Usar el propio payment_id como referencia en última instancia
                    reference = payment_id
                
                # Validar si ya está autorizado
                if payment_entry and payment_entry.get('sriEstado') == 'AUTORIZADO':
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "La factura correspondiente a este pago ya se encuentra AUTORIZADA."}).encode('utf-8'))
                    return
                
                # Disparar la facturación en segundo plano
                threading.Thread(
                    target=emitir_factura_sri_background,
                    args=(reference, producer_id)
                ).start()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": "Reemisión de factura del SRI iniciada exitosamente en segundo plano.",
                    "reference": reference
                }).encode('utf-8'))
                print(f"[+] [SRI Retry] Reemisión iniciada para la referencia: {reference}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al reemitir factura SRI: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()
