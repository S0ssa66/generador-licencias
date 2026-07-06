"""Mixin do_GET — módulo extraído de server.py"""
import json
import os
import base64
import tempfile
import hashlib
import urllib.request
from urllib.parse import urlparse, parse_qs

from server_utils import get_admin_token
from audio_utils import process_watermark_audio, get_gdrive_direct_link
from analytics import get_sales_analytics
from admin_config import get_admin_config
import sri_ride

DIRECTORY = os.path.dirname(os.path.abspath(__file__))


def check_is_public_preview(file_id):
    import os
    import json
    import urllib.request
    
    # 1. Buscar en archivos de respaldo locales primero
    for filename in os.listdir(DIRECTORY):
        if filename.endswith('_backup_sincronizado.json'):
            try:
                with open(os.path.join(DIRECTORY, filename), 'r', encoding='utf-8') as f:
                    data = json.load(f)
                for key, val in data.items():
                    if key.endswith('_beats') and val:
                        beats = json.loads(val)
                        for beat in beats:
                            mp3 = beat.get('mp3', '')
                            artwork = beat.get('artwork', '')
                            if file_id in mp3 or file_id in artwork:
                                print(f"[+] [Local Preview Check] File {file_id} autorizado por backup local {filename}")
                                return True
            except Exception as e:
                print(f"[⚠️ Local Preview Check] Error al leer backup {filename}: {e}")

    # 2. Query Firestore via REST API
    query_body = {
        "structuredQuery": {
            "from": [{"collectionId": "beats", "allDescendants": True}]
        }
    }
    url = "https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents:runQuery"
    headers = {"Content-Type": "application/json"}
    req = urllib.request.Request(
        url, 
        data=json.dumps(query_body).encode("utf-8"), 
        headers=headers, 
        method="POST"
    )
    try:
        with urllib.request.urlopen(req) as response:
            results = json.loads(response.read().decode("utf-8"))
            for result in results:
                doc = result.get("document", {})
                fields = doc.get("fields", {})
                mp3 = fields.get("mp3", {}).get("stringValue", "")
                artwork = fields.get("artwork", {}).get("stringValue", "")
                if file_id in mp3 or file_id in artwork:
                    print(f"[+] [Local Preview Check] File {file_id} autorizado por Firestore REST RunQuery")
                    return True
    except Exception as e:
        print(f"[⚠️ Firestore Preview Check] Error en runQuery: {e}")
        
    return False


class HandlerGetMixin:
    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/local-token':
            # Check Origin/Referer to ensure it's a local address
            origin = self.headers.get('Origin')
            referer = self.headers.get('Referer')
            
            is_local_origin = False
            local_origins = [
                'http://localhost:8000', 'http://localhost:5173', 'http://localhost:3000',
                'http://127.0.0.1:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'
            ]
            
            # If there is no Origin (same origin request from localhost), allow
            if not origin:
                if referer and any(x in referer for x in ['localhost:', '127.0.0.1:']):
                    is_local_origin = True
                elif not referer:
                    # Direct browser access or same origin without referer
                    is_local_origin = True
            elif origin in local_origins:
                is_local_origin = True
                
            if is_local_origin:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                token = os.environ.get('LOCAL_AUTH_TOKEN', '')
                self.wfile.write(json.dumps({"token": token}).encode('utf-8'))
            else:
                self.send_response(403)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Forbidden: Token retrieval only allowed from localhost"}')
            return
            
        elif parsed.path == '/api/load-local':
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            # Solo permitir sossa, cgmonarco y mrmicua por seguridad
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "No local backup found"}')
        elif parsed.path == '/api/preview-beat':
            qs = parse_qs(parsed.query)
            beat_id = qs.get('beatId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not beat_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro beatId"}')
                return
                
            # Intentar generar o servir el audio mezclado
            success, result_path_or_err = process_watermark_audio(beat_id, user)
            if success:
                # Redirigir a la URL del archivo en cache local
                filename = os.path.basename(result_path_or_err)
                self.send_response(302)
                self.send_header('Location', f'/temp_audio_cache/{filename}')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
            else:
                # Si no se requiere tag o falla la mezcla, redirigir al enlace de origen (Google Drive)
                if "gdrive_url:" in result_path_or_err:
                    direct_link = get_gdrive_direct_link(result_path_or_err.replace("gdrive_url:", ""))
                    self.send_response(302)
                    self.send_header('Location', direct_link)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                else:
                    self.send_response(404)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'{{"error": "{result_path_or_err}"}}'.encode('utf-8'))
        elif parsed.path == '/api/payments/download-ride':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('paymentId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro paymentId"}')
                return
                
            ride_path = None
            xml_autorizado_b64 = None
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                    history_str = db_data.get(f"{user}_license_history", "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        ride_path = payment_entry.get('sriRidePath')
                        if ride_path and not os.path.exists(ride_path):
                            ride_path = None
                        xml_autorizado_b64 = payment_entry.get('sriXmlAutorizadoB64')
            except Exception as e:
                print(f"Error al buscar RIDE localmente: {e}")
                
            if not ride_path and not xml_autorizado_b64:
                token = get_admin_token()
                if token:
                    try:
                        url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                        with urllib.request.urlopen(req) as res:
                            doc = json.loads(res.read().decode('utf-8'))
                            fields = doc.get('fields', {})
                            ride_path = fields.get('sriRidePath', {}).get('stringValue')
                            if ride_path and not os.path.exists(ride_path):
                                ride_path = None
                            xml_autorizado_b64 = fields.get('sriXmlAutorizadoB64', {}).get('stringValue')
                    except Exception as e:
                        print(f"Error al obtener de Firestore en RIDE download: {e}")
                        
            # Auto-recuperación desde el SRI si tenemos clave_acceso pero no tenemos el XML ni el PDF
            if not ride_path and not xml_autorizado_b64 and payment_entry:
                clave_acceso = payment_entry.get('sriClaveAcceso') or payment_entry.get('sriNumeroAutorizacion')
                if clave_acceso and len(clave_acceso) == 49:
                    try:
                        import sri_invoicing
                        ambiente_char = clave_acceso[23]
                        ws_url = sri_invoicing.WS_AUTORIZACION_PROD if ambiente_char == '2' else sri_invoicing.WS_AUTORIZACION_PRUEBAS
                        print(f"[Self-Healing RIDE] Consultado SRI para clave de acceso {clave_acceso}...")
                        soap_res = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_url)
                        parsed = sri_invoicing.parsear_respuesta_autorizacion(soap_res)
                        autorizaciones = parsed.get('autorizaciones', [])
                        if autorizaciones and autorizaciones[0].get('estado') == 'AUTORIZADO':
                            aut = autorizaciones[0]
                            xml_str = aut.get('comprobante')
                            if xml_str:
                                xml_autorizado_b64 = base64.b64encode(xml_str.encode('utf-8')).decode('utf-8')
                                print("[Self-Healing RIDE] XML recuperado del SRI.")
                                
                                # Guardar localmente
                                payment_entry['sriXmlAutorizadoB64'] = xml_autorizado_b64
                                db_data[f"{user}_license_history"] = json.dumps(history, ensure_ascii=False)
                                with open(backup_path, 'w', encoding='utf-8') as f:
                                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                                    
                                # Guardar en Firestore
                                token = get_admin_token()
                                if token:
                                    try:
                                        real_uid = user
                                        if user == 'sossa': real_uid = 'paXbnNbHMMPC31X3hf0oTUx4bbr2'
                                        url_lic = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{real_uid}/licencias/{payment_id}"
                                        payload = {"fields": {"sriXmlAutorizadoB64": {"stringValue": xml_autorizado_b64}}}
                                        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                                        req_lic = urllib.request.Request(f"{url_lic}?updateMask.fieldPaths=sriXmlAutorizadoB64", data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                                        with urllib.request.urlopen(req_lic) as _:
                                            print("[Self-Healing RIDE] XML guardado en Firestore.")
                                    except Exception as fe:
                                        print(f"Error al guardar XML en Firestore: {fe}")
                    except Exception as e:
                        print(f"Error al auto-recuperar XML de SRI: {e}")

            if not ride_path and not xml_autorizado_b64:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No se encontro factura autorizada para este pago"}')
                return
                
            if ride_path and os.path.exists(ride_path):
                try:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'attachment; filename="{os.path.basename(ride_path)}"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(ride_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                except Exception as e:
                    print(f"Error al servir archivo RIDE: {e}")
                    
            if xml_autorizado_b64:
                try:
                    xml_str = base64.b64decode(xml_autorizado_b64).decode('utf-8')
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                        temp_pdf_path = temp_pdf.name
                    
                    sri_ride.generar_ride_pdf(temp_pdf_path, xml_str)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'attachment; filename="Factura_{payment_id}.pdf"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(temp_pdf_path, 'rb') as f:
                        self.wfile.write(f.read())
                        
                    try:
                        os.remove(temp_pdf_path)
                    except Exception:
                        pass
                    return
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'{{"error": "Error al generar RIDE PDF: {str(e)}"}}'.encode('utf-8'))
                    return
            
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"error": "Archivo de RIDE no disponible"}')
            
        elif parsed.path == '/api/payments/download-xml':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('paymentId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro paymentId"}')
                return
                
            xml_autorizado_b64 = None
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                    history_str = db_data.get(f"{user}_license_history", "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        xml_autorizado_b64 = payment_entry.get('sriXmlAutorizadoB64')
            except Exception as e:
                print(f"Error al buscar XML localmente: {e}")
                
            if not xml_autorizado_b64:
                token = get_admin_token()
                if token:
                    try:
                        url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                        with urllib.request.urlopen(req) as res:
                            doc = json.loads(res.read().decode('utf-8'))
                            fields = doc.get('fields', {})
                            xml_autorizado_b64 = fields.get('sriXmlAutorizadoB64', {}).get('stringValue')
                    except Exception as e:
                        print(f"Error al obtener XML de Firestore: {e}")
                        
            # Auto-recuperación desde el SRI si tenemos clave_acceso pero no tenemos el XML
            if not xml_autorizado_b64 and payment_entry:
                clave_acceso = payment_entry.get('sriClaveAcceso') or payment_entry.get('sriNumeroAutorizacion')
                if clave_acceso and len(clave_acceso) == 49:
                    try:
                        import sri_invoicing
                        ambiente_char = clave_acceso[23]
                        ws_url = sri_invoicing.WS_AUTORIZACION_PROD if ambiente_char == '2' else sri_invoicing.WS_AUTORIZACION_PRUEBAS
                        print(f"[Self-Healing XML] Consultado SRI para clave de acceso {clave_acceso}...")
                        soap_res = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_url)
                        parsed_xml = sri_invoicing.parsear_respuesta_autorizacion(soap_res)
                        autorizaciones = parsed_xml.get('autorizaciones', [])
                        if autorizaciones and autorizaciones[0].get('estado') == 'AUTORIZADO':
                            aut = autorizaciones[0]
                            xml_str = aut.get('comprobante')
                            if xml_str:
                                xml_autorizado_b64 = base64.b64encode(xml_str.encode('utf-8')).decode('utf-8')
                                print("[Self-Healing XML] XML recuperado del SRI.")
                                
                                # Guardar localmente
                                payment_entry['sriXmlAutorizadoB64'] = xml_autorizado_b64
                                db_data[f"{user}_license_history"] = json.dumps(history, ensure_ascii=False)
                                with open(backup_path, 'w', encoding='utf-8') as f:
                                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                                    
                                # Guardar en Firestore
                                token = get_admin_token()
                                if token:
                                    try:
                                        real_uid = user
                                        if user == 'sossa': real_uid = 'paXbnNbHMMPC31X3hf0oTUx4bbr2'
                                        url_lic = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{real_uid}/licencias/{payment_id}"
                                        payload = {"fields": {"sriXmlAutorizadoB64": {"stringValue": xml_autorizado_b64}}}
                                        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                                        req_lic = urllib.request.Request(f"{url_lic}?updateMask.fieldPaths=sriXmlAutorizadoB64", data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                                        with urllib.request.urlopen(req_lic) as _:
                                            print("[Self-Healing XML] XML guardado en Firestore.")
                                    except Exception as fe:
                                        print(f"Error al guardar XML en Firestore: {fe}")
                    except Exception as e:
                        print(f"Error al auto-recuperar XML de SRI: {e}")

            if not xml_autorizado_b64:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No se encontro XML autorizado para este pago"}')
                return
                
            try:
                xml_str = base64.b64decode(xml_autorizado_b64).decode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/xml')
                self.send_header('Content-Disposition', f'attachment; filename="Factura_{payment_id}.xml"')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(xml_str.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(f'{{"error": "Error al servir XML: {str(e)}"}}'.encode('utf-8'))
        elif parsed.path == '/api/get-order-downloads':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('id', [None])[0]
            accessToken = qs.get('token', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro id"}')
                return
                
            import hmac
            secret = os.environ.get('DOWNLOAD_SIGNING_KEY', 'dev-signing-key')
            expected_access_token = hmac.new(secret.encode('utf-8'), f"{payment_id}:download".encode('utf-8'), hashlib.sha256).hexdigest()
            
            # En desarrollo local se da acceso si el token coincide
            is_authorized = True
            
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if not os.path.exists(backup_path):
                    raise FileNotFoundError("Respaldo local no encontrado")
                    
                with open(backup_path, 'r', encoding='utf-8') as f:
                    db_data = json.load(f)
                    
                history_str = db_data.get(f"{user}_license_history", "[]")
                history = json.loads(history_str)
                payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                if not payment_entry:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Pedido no encontrado"}')
                    return
                    
                beats_str = db_data.get(f"{user}_beats", "[]")
                beats = json.loads(beats_str)
                beat_id = payment_entry.get('beatId') or payment_entry.get('idBeat')
                beat_data = next((b for b in beats if str(b.get('id')) == str(beat_id)), None)
                if not beat_data:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(b'{"error": "El instrumental no se encuentra en el catalogo"}')
                    return
                    
                config_key = f"{user}_producer_config"
                producer_config_str = db_data.get(config_key, "{}")
                producer_config = json.loads(producer_config_str)
                
                private_wav = beat_data.get('wav', '')
                private_stems = beat_data.get('stems', '')
                
                host = self.headers.get('Host', 'localhost:8000')
                
                def get_signed_proxy_url(raw_url, file_type):
                    if not raw_url: return ''
                    file_id = raw_url
                    if 'id=' in raw_url:
                        try:
                            file_id = raw_url.split('id=')[1].split('&')[0]
                        except Exception: pass
                    elif '/d/' in raw_url:
                        try:
                            file_id = raw_url.split('/d/')[1].split('/')[0]
                        except Exception: pass
                        
                    # WAV y Stems expiran en 24 horas, MP3 en 7 días
                    duration = 86400 if file_type in ['wav', 'stems'] else 86400 * 7
                    import time
                    expires = int(time.time()) + duration
                    
                    data_to_sign = f"{file_id}:{expires}:{payment_id or ''}:{file_type or ''}"
                    sig = hmac.new(secret.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
                    
                    return f"http://{host}/api/proxy-audio?id={file_id}&expires={expires}&paymentId={payment_id or ''}&fileType={file_type or ''}&signature={sig}"
                
                signed_links = {
                    "mp3": get_signed_proxy_url(beat_data.get('mp3', ''), 'mp3'),
                    "wav": get_signed_proxy_url(private_wav, 'wav') if payment_entry.get('licenseType') != 'basic' else '',
                    "stems": get_signed_proxy_url(private_stems, 'stems') if payment_entry.get('licenseType') not in ['basic', 'premium'] else ''
                }
                
                downloads = []
                
                response_payload = {
                    "payment": payment_entry,
                    "beat": {
                        "id": beat_data.get('id'),
                        "name": beat_data.get('name'),
                        "artwork": beat_data.get('artwork', ''),
                        "bpm": beat_data.get('bpm', ''),
                        "key": beat_data.get('key', ''),
                        "genre": beat_data.get('genre', '')
                    },
                    "producer": {
                        "aka": producer_config.get('aka', 'Productor'),
                        "name": producer_config.get('name', ''),
                        "email": producer_config.get('email', ''),
                        "logoBase64": producer_config.get('logoBase64', ''),
                        "id": producer_config.get('id', '')
                    },
                    "signedLinks": signed_links,
                    "downloads": downloads
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_payload, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))
        elif parsed.path == '/api/gdrive-status':
            auth_header = self.headers.get('Authorization')
            if not auth_header or not auth_header.startswith('Bearer '):
                self.send_response(401)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No autorizado: falta el token de sesion"}')
                return
            id_token = auth_header.split('Bearer ')[1].strip()
            
            try:
                from firestore_ops import fetch_firestore_document
                gdrive_config = fetch_firestore_document('system/gdrive_config', id_token)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                
                if gdrive_config:
                    res_data = {
                        "linked": True,
                        "email": gdrive_config.get("authorizedEmail", "masterjuego25@gmail.com"),
                        "clientId": gdrive_config.get("clientId", "")
                    }
                else:
                    res_data = {
                        "linked": False,
                        "email": None,
                        "clientId": ""
                    }
                self.wfile.write(json.dumps(res_data).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        elif parsed.path == '/api/proxy-audio':
            qs = parse_qs(parsed.query)
            file_id = qs.get('id', [None])[0]
            expires = qs.get('expires', [None])[0]
            signature = qs.get('signature', [None])[0]
            payment_id = qs.get('paymentId', [''])[0]
            file_type = qs.get('fileType', [''])[0]
            
            if not file_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro id"}')
                return
                
            import hmac
            import time
            secret = os.environ.get('DOWNLOAD_SIGNING_KEY', 'dev-signing-key')
            
            is_authorized = False
            if expires:
                try:
                    now = int(time.time())
                    if now <= int(expires):
                        data_to_sign = f"{file_id}:{expires}:{payment_id or ''}:{file_type or ''}"
                        expected_signature = hmac.new(secret.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
                        if signature == expected_signature:
                            is_authorized = True
                except Exception:
                    pass
            
            # Si no está autorizado por firma de descarga, permitir si es una petición autenticada del panel local
            if not is_authorized:
                is_authorized = self.check_local_auth()
                
            # Si no está autorizado, comprobar si es un archivo de preview público (MP3 o Artwork)
            if not is_authorized:
                is_authorized = check_is_public_preview(file_id)
            
            if not is_authorized:
                self.send_response(403)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Firma no valida o expirada"}')
                return
                
            # Intentar streaming desde Google Drive usando el token central
            try:
                import urllib.request
                import urllib.parse
                import json
                
                # Obtener la config de Firestore sin requerir token (reglas de lectura abiertas para system/gdrive_config)
                config_url = "https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/system/gdrive_config"
                req_conf = urllib.request.Request(config_url, method="GET")
                with urllib.request.urlopen(req_conf) as resp_conf:
                    gdrive_config = json.loads(resp_conf.read().decode("utf-8")).get("fields", {})
                    
                client_id = gdrive_config.get("clientId", {}).get("stringValue")
                client_secret = gdrive_config.get("clientSecret", {}).get("stringValue")
                refresh_token = gdrive_config.get("refreshToken", {}).get("stringValue")
                
                if client_id and client_secret and refresh_token:
                    # Refrescar token
                    token_url = "https://oauth2.googleapis.com/token"
                    token_data = urllib.parse.urlencode({
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "refresh_token": refresh_token,
                        "grant_type": "refresh_token"
                    }).encode("utf-8")
                    
                    req_tok = urllib.request.Request(token_url, data=token_data, method="POST")
                    with urllib.request.urlopen(req_tok) as resp_tok:
                        token_res = json.loads(resp_tok.read().decode("utf-8"))
                        access_token = token_res["access_token"]
                        
                    # Stream desde Google Drive
                    drive_file_url = f"https://www.googleapis.com/drive/v3/files/{file_id}?alt=media"
                    drive_headers = {"Authorization": f"Bearer {access_token}"}
                    
                    # Reenviar cabecera de Rango (Range) si está presente
                    range_header = self.headers.get("Range") or self.headers.get("range")
                    if range_header:
                        drive_headers["Range"] = range_header
                        
                    req_file = urllib.request.Request(drive_file_url, headers=drive_headers, method="GET")
                    try:
                        with urllib.request.urlopen(req_file) as resp_file:
                            self.send_response(resp_file.status)
                            
                            # Reenviar headers clave de Google Drive
                            for h_name, h_val in resp_file.headers.items():
                                if h_name.lower() in ["content-type", "content-length", "content-range", "accept-ranges"]:
                                    self.send_header(h_name, h_val)
                            self.send_header("Access-Control-Allow-Origin", "*")
                            self.send_header("Cache-Control", "public, max-age=86400")
                            self.end_headers()
                            
                            while True:
                                chunk = resp_file.read(64 * 1024)
                                if not chunk:
                                    break
                                self.wfile.write(chunk)
                            return
                    except Exception as stream_err:
                        print(f"[⚠️ Local Proxy Stream] Error al descargar de Drive, haciendo redirect: {stream_err}")
            except Exception as oauth_err:
                print(f"[⚠️ Local Proxy Auth] Error al refrescar token de Google, haciendo redirect: {oauth_err}")
                
            # Fallback redirect original si falla el streaming
            direct_link = f"https://docs.google.com/uc?export=download&id={file_id}"
            self.send_response(302)
            self.send_header('Location', direct_link)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        elif parsed.path == '/api/admin/sales-analytics':
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            period = qs.get('period', ['all'])[0]
            
            try:
                analytics = get_sales_analytics(user, period)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(json.dumps(analytics, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al servir analíticas de ventas: {str(e)}")
        elif parsed.path == '/api/payments/config':
            try:
                config = get_admin_config()
                # SEGURIDAD: Solo exponer datos necesarios para el flujo de pago del frontend.
                # Datos bancarios sensibles (cuenta, cédula) se omiten intencionalmente de este
                # endpoint público. Se transmiten únicamente al confirmar el pago server-side.
                public_config = {
                    "paypalClientId": config.get("paypalClientId", ""),
                    "paypalPlanIdPro": config.get("paypalPlanIdPro", ""),
                    "paypalPlanIdElite": config.get("paypalPlanIdElite", ""),
                    "payphoneClientId": config.get("payphoneClientId", ""),
                    "payphoneAppId": config.get("payphoneAppId", ""),
                    "deunaPhone": config.get("deunaPhone", ""),
                    "deunaName": config.get("deunaName", ""),
                    "bankPichinchaName": config.get("bankPichinchaName", "")
                    # bankPichinchaAcc y bankPichinchaDni excluidos: datos PII sensibles
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(json.dumps(public_config, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al servir configuración de pagos: {str(e)}")
        else:
            # Servir archivo estático normal
            super().do_GET()
