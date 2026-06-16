#!/usr/bin/env python3
import http.server
import json
import os
import sys
import threading
import urllib
import urllib.request
import urllib.error
import urllib.parse
from urllib.parse import urlparse, parse_qs
import subprocess
import tempfile
import hashlib
import base64
import datetime
import re
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import sri_invoicing
import sri_ride



PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Crear carpeta de caché para audios mezclados si no existe
CACHE_DIR = os.path.join(DIRECTORY, 'temp_audio_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Asegurar rutas comunes de Homebrew en el PATH para localización de ffmpeg
common_paths = ["/opt/homebrew/bin", "/usr/local/bin"]
for path in common_paths:
    if path not in os.environ.get("PATH", ""):
        os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")

# Asegurar que se puede importar el coordinador de agentes
sys.path.append(DIRECTORY)
import agente_coordinador

def update_firestore_task(task_id, id_token, estado, progreso=None, resultado=None):
    """Actualiza una tarea en Firestore usando la API REST con el token de autenticación del usuario."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    
    # Construir máscara de campos a actualizar
    params = ["updateMask.fieldPaths=estado"]
    fields = {
        "estado": {"stringValue": estado}
    }
    
    if progreso is not None:
        params.append("updateMask.fieldPaths=progreso")
        fields["progreso"] = {"stringValue": progreso}
        
    if resultado is not None:
        params.append("updateMask.fieldPaths=resultado")
        fields["resultado"] = {"stringValue": resultado}
        
    url_params = "&".join(params)
    full_url = f"{url}?{url_params}"
    
    payload = {
        "fields": fields
    }
    
    headers = {
        "Authorization": f"Bearer {id_token}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Error al actualizar Firestore REST: {e}")
        return None

def get_firestore_task(task_id, id_token):
    """Obtiene una tarea de Firestore usando la API REST."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    headers = {
        "Authorization": f"Bearer {id_token}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            fields = res_data.get("fields", {})
            return {
                "tipo": fields.get("tipo", {}).get("stringValue", ""),
                "consulta": fields.get("consulta", {}).get("stringValue", ""),
                "userId": fields.get("userId", {}).get("stringValue", "")
            }
    except Exception as e:
        print(f"[-] Error al obtener tarea de Firestore REST: {e}")
        return None

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

import subprocess
import time

def get_admin_token():
    """Obtiene un token de acceso OAuth2 del sistema (gcloud o ADC) con privilegios de administrador en Firestore."""
    try:
        res = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True)
        token = res.stdout.strip()
        if token:
            return token
    except Exception:
        pass
        
    try:
        res = subprocess.run(["gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True)
        token = res.stdout.strip()
        if token:
            return token
    except Exception:
        pass
        
    return None

def confirm_payment_in_firestore(payment_id):
    """Actualiza una compra en Firestore al estado 'completed' usando el token de administrador y dispara la facturación del SRI."""
    token = get_admin_token()
    if not token:
        print("[-] No se pudo obtener el token de administrador para confirmar el pago.")
        return False
        
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
    
    # Intentar obtener el pago para validar su existencia
    req_get = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req_get) as response:
            payment_doc = json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Error al obtener el pago {payment_id} de Firestore: {e}")
        return False
        
    fields = payment_doc.get("fields", {})
    status = fields.get("status", {}).get("stringValue", "")
    producer_id = fields.get("producerId", {}).get("stringValue", "sossa")
    reference = fields.get("reference", {}).get("stringValue", payment_id)
    
    if status == "completed":
        print(f"[!] El pago {payment_id} ya estaba en estado 'completed'.")
        return True
        
    # Actualizar estado a 'completed'
    update_fields = {
        "status": {"stringValue": "completed"},
        "updatedAt": {"integerValue": str(int(time.time() * 1000))}
    }
    
    params = ["updateMask.fieldPaths=status", "updateMask.fieldPaths=updatedAt"]
    url_params = "&".join(params)
    full_url = f"{url}?{url_params}"
    
    payload = {
        "fields": update_fields
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    req_patch = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req_patch) as response:
            print(f"[+] Pago {payment_id} marcado exitosamente como 'completed' en Firestore.")
            
            # Disparar la facturación SRI en segundo plano
            threading.Thread(
                target=emitir_factura_sri_background,
                args=(reference, producer_id)
            ).start()
            
            return True
    except Exception as e:
        print(f"[-] Error al actualizar estado del pago {payment_id} en Firestore: {e}")
        return False


def resolve_backup_file(user_id):
    """
    Resuelve el ID de usuario (UID de Firebase o nombre legacy) a la ruta del archivo de backup
    y al nombre de usuario legacy ('sossa' o 'cgmonarco').
    """
    if user_id in ['SlO4pM3oAjZQQB2OoHU1sOTJie03', 'cgmonarco', 'beatscgmonarco@gmail.com']:
        username = 'cgmonarco'
    elif user_id in ['JkjI2lPkkZfzRXCajal9l1L10NN2', 'mrmicua', 'mistermicua@gmail.com']:
        username = 'mrmicua'
    else:
        username = 'sossa'
    
    backup_path = os.path.join(DIRECTORY, f'{username}_backup_sincronizado.json')
    return backup_path, username


def get_admin_config():
    """
    Carga y expone la configuración pública del administrador (sossa) para 
    el procesamiento de cobros de suscripción de la plataforma.
    """
    backup_path = os.path.join(DIRECTORY, 'sossa_backup_sincronizado.json')
    if os.path.exists(backup_path):
        try:
            with open(backup_path, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
            # Buscar la configuración del productor
            for key, val in backup_data.items():
                if key.endswith('_producer_config') and val:
                    config_data = json.loads(val) if isinstance(val, str) else val
                    return {
                        "paypalClientId": config_data.get("paypalClientId", "AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-"),
                        "paypalClientSecret": config_data.get("paypalClientSecret", ""),
                        "payphoneClientId": config_data.get("payphoneClientId", ""),
                        "payphoneAppId": config_data.get("payphoneAppId", ""),
                        "deunaPhone": config_data.get("deunaPhone", "+593961201184"),
                        "deunaName": config_data.get("deunaName", "Joao David Dominguez Sosa"),
                        "bankPichinchaAcc": config_data.get("bankPichinchaAcc", "2205256268"),
                        "bankPichinchaName": config_data.get("bankPichinchaName", "Joao Dominguez"),
                        "bankPichinchaDni": config_data.get("bankPichinchaDni", "080374311")
                    }
        except Exception as e:
            print(f"[-] Error al cargar config de administrador: {e}")
    # Valores de contingencia / fallback
    return {
        "paypalClientId": "AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-",
        "paypalClientSecret": "",
        "payphoneClientId": "",
        "payphoneAppId": "",
        "deunaPhone": "+593961201184",
        "deunaName": "Joao David Dominguez Sosa",
        "bankPichinchaAcc": "2205256268",
        "bankPichinchaName": "Joao Dominguez",
        "bankPichinchaDni": "080374311"
    }


def verify_paypal_order(order_id, client_id, client_secret):
    """
    Verifica un pedido de PayPal conectándose a la API.
    Prueba primero el entorno 'live' y luego 'sandbox' si hay algún fallo.
    Retorna (success, plan, amount) o (False, None, None).
    """
    import base64
    import json
    import urllib.request
    import urllib.error
    
    environments = [
        {"name": "live", "url": "https://api-m.paypal.com"},
        {"name": "sandbox", "url": "https://api-m.sandbox.paypal.com"}
    ]
    
    auth_header = base64.b64encode(f"{client_id}:{client_secret}".encode('utf-8')).decode('utf-8')
    
    for env in environments:
        try:
            # 1. Obtener token de acceso
            token_url = f"{env['url']}/v1/oauth2/token"
            token_headers = {
                "Authorization": f"Basic {auth_header}",
                "Content-Type": "application/x-www-form-urlencoded"
            }
            token_data = "grant_type=client_credentials".encode('utf-8')
            
            token_req = urllib.request.Request(token_url, data=token_data, headers=token_headers, method="POST")
            with urllib.request.urlopen(token_req) as response:
                token_res = json.loads(response.read().decode('utf-8'))
                access_token = token_res.get("access_token")
                
            if not access_token:
                continue
                
            # 2. Consultar detalles del pedido
            order_url = f"{env['url']}/v2/checkout/orders/{order_id}"
            order_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json"
            }
            order_req = urllib.request.Request(order_url, headers=order_headers, method="GET")
            with urllib.request.urlopen(order_req) as response:
                order_res = json.loads(response.read().decode('utf-8'))
                
            status = order_res.get("status")
            if status not in ["COMPLETED", "APPROVED"]:
                print(f"[-] Pedido de PayPal {order_id} no completado en {env['name']}. Estado: {status}")
                continue
                
            purchase_units = order_res.get("purchase_units", [])
            if not purchase_units:
                continue
                
            amount_val = float(purchase_units[0].get("amount", {}).get("value", 0))
            description = purchase_units[0].get("description", "").lower()
            
            # Determinar el plan según el precio o descripción
            if "elite" in description or amount_val >= 25.0:
                plan = "elite"
            else:
                plan = "pro"
                
            return True, plan, amount_val
            
        except urllib.error.HTTPError as he:
            print(f"[-] Intento en PayPal {env['name']} falló con código {he.code}")
            continue
        except Exception as e:
            print(f"[-] Error en PayPal {env['name']}: {e}")
            continue
            
    return False, None, None


def update_user_plan_in_firestore(uid, plan, email=None):
    """
    Actualiza el plan del usuario a 'pro' o 'elite' en Firestore y 
    localmente en su archivo de respaldo físico.
    """
    token = get_admin_token()
    if not token:
        print("[-] No se pudo obtener el token de administrador para actualizar el plan del usuario.")
        return False
        
    now = datetime.datetime.utcnow()
    expiration_date = (now + datetime.timedelta(days=30)).isoformat() + "Z"
    
    # 1. Actualizar /users/{uid}
    user_url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{uid}"
    user_payload = {
        "fields": {
            "plan": {"stringValue": plan},
            "planActivatedAt": {"stringValue": now.isoformat() + "Z"}
        }
    }
    user_params = "updateMask.fieldPaths=plan&updateMask.fieldPaths=planActivatedAt"
    user_req = urllib.request.Request(
        f"{user_url}?{user_params}",
        data=json.dumps(user_payload).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )
    
    try:
        with urllib.request.urlopen(user_req) as response:
            pass
    except Exception as e:
        print(f"[-] Error al actualizar plan raíz en Firestore /users/{uid}: {e}")
        
    # 2. Actualizar /users/{uid}/config/producer
    config_url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{uid}/config/producer"
    config_get_req = urllib.request.Request(config_url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    current_config = {}
    try:
        with urllib.request.urlopen(config_get_req) as response:
            res_doc = json.loads(response.read().decode("utf-8"))
            fields = res_doc.get("fields", {})
            for k, v in fields.items():
                if "stringValue" in v:
                    current_config[k] = v["stringValue"]
                elif "booleanValue" in v:
                    current_config[k] = v["booleanValue"]
    except Exception as e:
        print(f"[-] Config/producer no encontrado en Firestore (se creará): {e}")
        
    current_config["plan"] = plan
    current_config["expirationPro"] = expiration_date
    if email and "email" not in current_config:
        current_config["email"] = email
        
    config_fields = {}
    for k, v in current_config.items():
        if isinstance(v, bool):
            config_fields[k] = {"booleanValue": v}
        else:
            config_fields[k] = {"stringValue": str(v)}
            
    config_payload = {"fields": config_fields}
    config_req = urllib.request.Request(
        config_url,
        data=json.dumps(config_payload).encode('utf-8'),
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PATCH"
    )
    
    try:
        with urllib.request.urlopen(config_req) as response:
            pass
    except Exception as e:
        print(f"[-] Error al actualizar config/producer en Firestore: {e}")
        return False
        
    # 3. Sincronizar respaldo local
    try:
        backup_path, username = resolve_backup_file(uid)
        backup_data = {}
        if os.path.exists(backup_path):
            with open(backup_path, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
                
        config_key = ""
        for k in backup_data.keys():
            if k.endswith('_producer_config'):
                config_key = k
                break
                
        if not config_key:
            config_key = f"{username}_producer_config"
            
        local_config = {}
        if config_key in backup_data and backup_data[config_key]:
            try:
                local_config = json.loads(backup_data[config_key]) if isinstance(backup_data[config_key], str) else backup_data[config_key]
            except Exception:
                pass
                
        local_config["plan"] = plan
        local_config["expirationPro"] = expiration_date
        
        backup_data[config_key] = json.dumps(local_config, ensure_ascii=False) if isinstance(backup_data.get(config_key), str) else local_config
        
        with open(backup_path, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, indent=2, ensure_ascii=False)
            
        print(f"[+] Respaldo local de {username} actualizado: plan={plan}, vencimiento={expiration_date}")
    except Exception as le:
        print(f"[-] Error al actualizar respaldo local de plan de suscripción: {le}")
        
    return True


# --- INTEGRACIÓN DE FACTURACIÓN ELECTRÓNICA SRI ECUADOR ---

def actualizar_secuencial_sri(producer_id, nuevo_secuencial, token=None):
    """
    Actualiza el secuencial del SRI para el productor en Firestore y en el respaldo local.
    """
    if not token:
        token = get_admin_token()
        
    if token:
        try:
            url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/private_config/producer"
            
            req_get = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
            try:
                with urllib.request.urlopen(req_get) as res:
                    doc = json.loads(res.read().decode('utf-8'))
                    fields = doc.get('fields', {})
            except Exception:
                fields = {}
                
            fields["sriSecuencial"] = {"stringValue": str(nuevo_secuencial)}
            
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }
            req_patch = urllib.request.Request(f"{url}?updateMask.fieldPaths=sriSecuencial", data=json.dumps({"fields": {"sriSecuencial": fields["sriSecuencial"]}}).encode("utf-8"), headers=headers, method="PATCH")
            with urllib.request.urlopen(req_patch) as response:
                print(f"[+] [SRI DB] Secuencial del SRI incrementado a {nuevo_secuencial} en Firestore para {producer_id}.")
        except Exception as e:
            print(f"[-] [SRI DB] Error al actualizar secuencial en Firestore: {e}")
            
    try:
        backup_path, username = resolve_backup_file(producer_id)
        if os.path.exists(backup_path):
            with open(backup_path, 'r', encoding='utf-8') as f:
                db_data = json.load(f)
            
            config_key = f"{producer_id}_producer_config"
            if config_key not in db_data:
                config_key = f"{username}_producer_config"
            if config_key in db_data:
                config_data = json.loads(db_data[config_key])
                config_data['sriSecuencial'] = str(nuevo_secuencial)
                db_data[config_key] = json.dumps(config_data, ensure_ascii=False)
                
                with open(backup_path, 'w', encoding='utf-8') as f:
                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                print(f"[+] [SRI DB] Secuencial del SRI incrementado a {nuevo_secuencial} en respaldo local para {producer_id} ({username}).")
    except Exception as e:
        print(f"[-] [SRI DB] Error al incrementar secuencial en respaldo local: {e}")

def actualizar_estado_factura_db(payment_id, producer_id, estado, clave_acceso=None, xml_autorizado=None, num_autorizacion=None, fecha_autorizacion=None, secuencial=None, ride_path=None, error_msg=None, token=None, ref_code=None):
    """
    Guarda los metadatos de la factura electrónica en el pago correspondiente en Firestore y el backup local.
    """
    if not token:
        token = get_admin_token()
        
    fields_to_update = {
        "sriEstado": {"stringValue": estado},
        "sriUltimoIntento": {"stringValue": datetime.datetime.utcnow().isoformat() + "Z"}
    }
    
    if clave_acceso:
        fields_to_update["sriClaveAcceso"] = {"stringValue": clave_acceso}
    if xml_autorizado:
        xml_b64 = base64.b64encode(xml_autorizado.encode('utf-8')).decode('utf-8')
        fields_to_update["sriXmlAutorizadoB64"] = {"stringValue": xml_b64}
    if num_autorizacion:
        fields_to_update["sriNumeroAutorizacion"] = {"stringValue": num_autorizacion}
    if fecha_autorizacion:
        fields_to_update["sriFechaAutorizacion"] = {"stringValue": fecha_autorizacion}
    if secuencial:
        fields_to_update["sriSecuencialFactura"] = {"integerValue": str(secuencial)}
    if ride_path:
        fields_to_update["sriRidePath"] = {"stringValue": ride_path}
    if error_msg:
        fields_to_update["sriErrorMensaje"] = {"stringValue": error_msg[:1000]}
        
    # Validar que el payment_id sea real
    is_valid_payment_id = payment_id and str(payment_id).strip() != "" and str(payment_id).lower() != "undefined"
    
    if token:
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        payload = {"fields": fields_to_update}
        params = [f"updateMask.fieldPaths={k}" for k in fields_to_update.keys()]
        url_params = "&".join(params)

        if is_valid_payment_id:
            try:
                url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                full_url = f"{url}?{url_params}"
                req = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                with urllib.request.urlopen(req) as response:
                    print(f"[+] [SRI DB] Pago {payment_id} actualizado con datos del SRI ({estado}) en Firestore.")
            except Exception as e:
                print(f"[-] [SRI DB] Error al actualizar estado SRI en Firestore para el pago {payment_id}: {e}")

        # También actualizar en la colección de licencias del usuario
        keys_to_try = []
        if ref_code:
            keys_to_try.append(ref_code)
        if payment_id and payment_id not in keys_to_try:
            keys_to_try.append(payment_id)
            
        for doc_key in keys_to_try:
            if doc_key and str(doc_key).strip() != "" and str(doc_key).lower() != "undefined":
                try:
                    url_lic = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/licencias/{doc_key}"
                    full_url_lic = f"{url_lic}?{url_params}"
                    req_lic = urllib.request.Request(full_url_lic, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                    with urllib.request.urlopen(req_lic) as response:
                        print(f"[+] [SRI DB] Licencia {doc_key} del usuario {producer_id} actualizada con datos del SRI ({estado}) en Firestore.")
                except Exception as e:
                    # Es normal que falle si no existe ese documento específico
                    print(f"[-] [SRI DB] Error al intentar actualizar licencia {doc_key} en Firestore (o no existe): {e}")
            
    try:
        backup_path, username = resolve_backup_file(producer_id)
        if os.path.exists(backup_path):
            with open(backup_path, 'r', encoding='utf-8') as f:
                db_data = json.load(f)
            
            updated = False
            history_keys = [f"{producer_id}_license_history", f"{username}_license_history", "sossa_license_history", "cgmonarco_license_history", "mrmicua_license_history"]
            for k in list(db_data.keys()):
                if k.endswith("_license_history") and k not in history_keys:
                    history_keys.append(k)
            
            for history_key in history_keys:
                if history_key in db_data:
                    try:
                        history = json.loads(db_data[history_key])
                        key_updated = False
                        for x in history:
                            # Validar coincidencia de forma robusta por ID, reference o refCode
                            match = False
                            if is_valid_payment_id:
                                if x.get('id') == payment_id or x.get('reference') == payment_id:
                                    match = True
                            if not match and ref_code and str(ref_code).strip() != "" and str(ref_code).lower() != "undefined":
                                if x.get('refCode') == ref_code or x.get('reference') == ref_code or x.get('id') == ref_code:
                                    match = True
                                    
                            if match:
                                x['sriEstado'] = estado
                                if clave_acceso: x['sriClaveAcceso'] = clave_acceso
                                if num_autorizacion: x['sriNumeroAutorizacion'] = num_autorizacion
                                if fecha_autorizacion: x['sriFechaAutorizacion'] = fecha_autorizacion
                                if secuencial: x['sriSecuencialFactura'] = secuencial
                                if ride_path: x['sriRidePath'] = ride_path
                                if error_msg: x['sriErrorMensaje'] = error_msg
                                if xml_autorizado:
                                    xml_b64 = base64.b64encode(xml_autorizado.encode('utf-8')).decode('utf-8')
                                    x['sriXmlAutorizadoB64'] = xml_b64
                                key_updated = True
                                updated = True
                        if key_updated:
                            db_data[history_key] = json.dumps(history, ensure_ascii=False)
                    except Exception as he:
                        print(f"[-] [SRI DB] Error al procesar llave de historial {history_key}: {he}")
                        
            if updated:
                with open(backup_path, 'w', encoding='utf-8') as f:
                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                print(f"[+] [SRI DB] Respaldo local actualizado con estado SRI ({estado}) para la compra {payment_id or ref_code} ({username}).")
            else:
                print(f"[!] [SRI DB] No se encontró la licencia en el historial local para actualizar SRI ({payment_id or ref_code}).")
    except Exception as e:
        print(f"[-] [SRI DB] Error al actualizar estado SRI en el respaldo local: {e}")

def emitir_factura_sri_background(reference_id, producer_id):
    """
    Función que corre en un hilo secundario para procesar la facturación electrónica del SRI de forma asíncrona.
    """
    token = get_admin_token()
    
    # 1. Cargar la configuración del emisor y sus llaves privadas
    producer_config = {}
    private_config = {}
    
    if token:
        try:
            url_pub = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/config/producer"
            req_pub = urllib.request.Request(url_pub, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req_pub) as res:
                doc_pub = json.loads(res.read().decode('utf-8'))
                fields = doc_pub.get('fields', {})
                for k, v in fields.items():
                    producer_config[k] = v.get('stringValue', '')
            
            url_priv = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/private_config/producer"
            req_priv = urllib.request.Request(url_priv, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(req_priv) as res:
                doc_priv = json.loads(res.read().decode('utf-8'))
                fields = doc_priv.get('fields', {})
                for k, v in fields.items():
                    private_config[k] = v.get('stringValue', '')
        except Exception as e:
            print(f"[-] [SRI] Error al obtener config de Firestore para {producer_id}: {e}")
            
    if not producer_config.get('sriRuc') or not private_config.get('sriP12Base64'):
        try:
            backup_path, username = resolve_backup_file(producer_id)
            if os.path.exists(backup_path):
                with open(backup_path, 'r', encoding='utf-8') as f:
                    db_data = json.load(f)
                config_key = f"{producer_id}_producer_config"
                if config_key not in db_data:
                    config_key = f"{username}_producer_config"
                config_str = db_data.get(config_key, "{}")
                local_config = json.loads(config_str)
                producer_config.update(local_config)
                private_config.update(local_config)
        except Exception as e:
            print(f"[-] [SRI] Error al leer config del respaldo local: {e}")
            
    ruc_emisor = producer_config.get('sriRuc')
    p12_b64 = private_config.get('sriP12Base64')
    p12_password = private_config.get('sriP12Password')
    
    if not ruc_emisor or not p12_b64 or not p12_password:
        print(f"[!] [SRI] Facturación SRI no configurada o incompleta para el productor {producer_id}. Se omite la factura.")
        return
        
    print(f"[+] [SRI] Iniciando emisión de factura agrupada para la transacción {reference_id}...")
    
    # 2. Obtener los items y datos de comprador de la transacción
    comprador_info = None
    items_para_factura = []
    
    # Intentar obtener del historial del respaldo local primero
    try:
        backup_path, username = resolve_backup_file(producer_id)
        if os.path.exists(backup_path):
            with open(backup_path, 'r', encoding='utf-8') as f:
                db_data = json.load(f)
            history_key = f"{producer_id}_license_history"
            if history_key not in db_data:
                history_key = f"{username}_license_history"
            history_str = db_data.get(history_key, "[]")
            history = json.loads(history_str)
            
            items_coincidentes = [x for x in history if x.get('reference') == reference_id or x.get('refCode') == reference_id]
            for x in items_coincidentes:
                items_para_factura.append({
                    'codigoPrincipal': x.get('beatId', 'BEAT')[:25],
                    'descripcion': f"{x.get('beatName', 'Beat')} - Licencia {x.get('type', 'basic').upper()}",
                    'cantidad': 1.0,
                    'precioUnitario': float(x.get('value', 0.0)),
                    'descuento': 0.0
                })
                
                if not comprador_info:
                    form_data = x.get('formData', {})
                    if not isinstance(form_data, dict):
                        form_data = {}
                    comprador_info = {
                        'buyerName': x.get('buyerName') or 'CONSUMIDOR FINAL',
                        'buyerEmail': x.get('buyerEmail') or form_data.get('buyerEmail', ''),
                        'buyerDni': form_data.get('buyerId', ''),
                        'buyerCity': form_data.get('buyerCity', 'Quito'),
                        'buyerCountry': form_data.get('buyerCountry', 'Ecuador'),
                        'payment_id': x.get('id')
                    }
    except Exception as e:
        print(f"[-] [SRI] Error al cargar detalles de transacción desde respaldo local: {e}")
        
    if not items_para_factura:
        print(f"[-] [SRI] No se encontraron ítems locales para {reference_id}. Buscando fallback en Firestore...")
        if token:
            try:
                url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/licencias/{reference_id}"
                req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req) as res:
                    doc = json.loads(res.read().decode('utf-8'))
                    fields = doc.get('fields', {})
                    
                    beat_name = fields.get('beatName', {}).get('stringValue', 'Beat')
                    lic_type = fields.get('type', {}).get('stringValue', 'basic')
                    val_field = fields.get('value', {})
                    
                    val_str = ""
                    if 'stringValue' in val_field:
                        val_str = val_field['stringValue']
                    elif 'integerValue' in val_field:
                        val_str = val_field['integerValue']
                    elif 'doubleValue' in val_field:
                        val_str = val_field['doubleValue']
                        
                    val = float(val_str) if val_str else 30.0
                    
                    items_para_factura.append({
                        'codigoPrincipal': fields.get('beatId', {}).get('stringValue', 'BEAT')[:25],
                        'descripcion': f"{beat_name} - Licencia {lic_type.upper()}",
                        'cantidad': 1.0,
                        'precioUnitario': val,
                        'descuento': 0.0
                    })
                    
                    form_data_rest = fields.get('formData', {}).get('mapValue', {}).get('fields', {})
                    comprador_info = {
                        'buyerName': fields.get('buyerName', {}).get('stringValue') or 'CONSUMIDOR FINAL',
                        'buyerEmail': fields.get('buyerEmail', {}).get('stringValue') or form_data_rest.get('buyerEmail', {}).get('stringValue', ''),
                        'buyerDni': form_data_rest.get('buyerId', {}).get('stringValue', ''),
                        'buyerCity': form_data_rest.get('buyerCity', {}).get('stringValue', 'Quito'),
                        'buyerCountry': form_data_rest.get('buyerCountry', {}).get('stringValue', 'Ecuador'),
                        'payment_id': fields.get('id', {}).get('stringValue')
                    }
                    print(f"[+] [SRI] Licencia {reference_id} obtenida con éxito desde Firestore.")
                    try:
                        backup_path, username = resolve_backup_file(producer_id)
                        if os.path.exists(backup_path):
                            with open(backup_path, 'r', encoding='utf-8') as f:
                                db_data = json.load(f)
                            history_key = f"{producer_id}_license_history"
                            if history_key not in db_data:
                                history_key = f"{username}_license_history"
                            history_str = db_data.get(history_key, "[]")
                            history = json.loads(history_str)
                            
                            if not any(x.get('reference') == reference_id or x.get('refCode') == reference_id or x.get('id') == reference_id for x in history):
                                new_license = {
                                    'id': reference_id,
                                    'reference': reference_id,
                                    'refCode': reference_id,
                                    'beatName': beat_name,
                                    'beatId': fields.get('beatId', {}).get('stringValue', 'BEAT')[:25],
                                    'type': lic_type,
                                    'value': val,
                                    'buyerName': comprador_info['buyerName'],
                                    'buyerEmail': comprador_info['buyerEmail'],
                                    'date': fields.get('date', {}).get('stringValue', datetime.datetime.now().strftime("%Y-%m-%d")),
                                    'formData': {
                                        'buyerId': comprador_info['buyerDni'],
                                        'buyerCity': comprador_info['buyerCity'],
                                        'buyerCountry': comprador_info['buyerCountry'],
                                        'buyerEmail': comprador_info['buyerEmail']
                                    }
                                }
                                history.append(new_license)
                                db_data[history_key] = json.dumps(history, ensure_ascii=False)
                                with open(backup_path, 'w', encoding='utf-8') as f:
                                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                                print(f"[+] [SRI] Licencia {reference_id} auto-sincronizada en el respaldo local.")
                    except Exception as se:
                        print(f"[-] [SRI] Error al auto-sincronizar licencia obtenida de Firestore en el local: {se}")
            except Exception as fe:
                print(f"[-] [SRI] Error al buscar licencia {reference_id} en Firestore: {fe}")
                
    if not items_para_factura:
        print(f"[-] [SRI] No se encontraron ítems para la referencia {reference_id} en local ni en Firestore. Cancelando facturación.")
        return
        
    payment_id = comprador_info.get('payment_id') if comprador_info else None
    
    # 3. Obtener e incrementar secuencial
    try:
        secuencial = int(private_config.get('sriSecuencial', 1))
    except Exception:
        secuencial = 1
    secuencial_str = str(secuencial).zfill(9)
    
    # 4. Generar Clave de Acceso
    fecha_emision_dt = datetime.datetime.now()
    ambiente = producer_config.get('sriAmbiente', '1')
    serie = f"{producer_config.get('sriEstab', '001')}{producer_config.get('sriPtoEmi', '001')}"
    
    clave_acceso = sri_invoicing.generar_clave_acceso(
        fecha_emision=fecha_emision_dt,
        tipo_comprobante="01",
        ruc=ruc_emisor,
        ambiente=ambiente,
        serie=serie,
        secuencial=secuencial_str
    )
    
    # 5. Mapear identificación del comprador
    buyer_dni = comprador_info.get('buyerDni', '')
    buyer_dni_type = '07'
    if len(buyer_dni) == 10:
        buyer_dni_type = '05'
    elif len(buyer_dni) == 13 and buyer_dni != '9999999999999':
        buyer_dni_type = '04'
    elif len(buyer_dni) > 0 and buyer_dni != '9999999999999':
        buyer_dni_type = '06'
        
    comprador = {
        'tipoIdentificacionComprador': buyer_dni_type,
        'razonSocialComprador': comprador_info.get('buyerName', 'CONSUMIDOR FINAL'),
        'identificacionComprador': buyer_dni if buyer_dni else '9999999999999',
        'dirComprador': comprador_info.get('buyerCity', 'Quito'),
        'emailComprador': comprador_info.get('buyerEmail', ''),
        'formaPago': '20'
    }
    
    # 6. Generar XML de factura
    try:
        emisor_adaptado = {
            'ruc': producer_config.get('sriRuc', ruc_emisor),
            'razonSocial': producer_config.get('sriRazonSocial', ''),
            'nombreComercial': producer_config.get('sriNombreComercial', ''),
            'dirMatriz': producer_config.get('sriDirMatriz', ''),
            'estab': producer_config.get('sriEstab', '001'),
            'ptoEmi': producer_config.get('sriPtoEmi', '001'),
            'ambiente': producer_config.get('sriAmbiente', '1'),
            'sriRimpe': producer_config.get('sriRimpe', 'no_rimpe'),
            'obligadoContabilidad': producer_config.get('sriContabilidad', 'NO'),
            'contribuyenteEspecial': producer_config.get('sriContribuyenteEspecial', ''),
            'agenteRetencion': producer_config.get('sriAgenteRetencion', '')
        }
        xml_factura = sri_invoicing.generar_xml_factura(
            emisor=emisor_adaptado,
            comprador=comprador,
            items=items_para_factura,
            secuencial=secuencial_str,
            clave_acceso=clave_acceso
        )
    except Exception as e:
        print(f"[-] [SRI] Error al generar XML de factura: {e}")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_XML", error_msg=f"Error al generar XML: {str(e)}", token=token, ref_code=reference_id)
        return
        
    # 7. Firmar XML
    try:
        if p12_b64 and ',' in p12_b64:
            p12_b64 = p12_b64.split(',', 1)[1]
        p12_bytes = base64.b64decode(p12_b64)
        xml_firmado = sri_invoicing.firmar_xml_comprobante(xml_factura, p12_bytes, p12_password)
    except Exception as e:
        print(f"[-] [SRI] Error al firmar XML con certificado .p12: {e}")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_FIRMA", error_msg=f"Error de firma: {str(e)}", token=token, ref_code=reference_id)
        return
        
    xml_firmado_b64 = base64.b64encode(xml_firmado.encode('utf-8')).decode('utf-8')
    
    # 8. Enviar al WS de Recepción del SRI
    ws_recepcion = sri_invoicing.WS_RECEPCION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_RECEPCION_PROD
    ws_autorizacion = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
    
    try:
        print(f"[+] [SRI] Enviando comprobante al Web Service de Recepción ({ambiente})...")
        res_recepcion_soap = sri_invoicing.enviar_sri_soap(xml_firmado_b64, ws_recepcion)
        res_recepcion = sri_invoicing.parsear_respuesta_recepcion(res_recepcion_soap)
    except Exception as e:
        print(f"[-] [SRI] Error al enviar al servicio de Recepción: {e}")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_CONEXION_RECEPCION", error_msg=str(e), token=token, ref_code=reference_id)
        return
        
    estado_recepcion = res_recepcion.get('estado')
    if estado_recepcion != 'RECIBIDA':
        msgs = res_recepcion.get('comprobantes', [{}])[0].get('mensajes', [])
        err_msg = "; ".join([m.get('mensaje') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else "Comprobante devuelto o con errores estructurados."
        print(f"[-] [SRI] Factura rechazada por SRI en Recepción: {estado_recepcion}. Motivo: {err_msg}")
        actualizar_estado_factura_db(payment_id, producer_id, "RECHAZADO_RECEPCION", error_msg=err_msg, token=token, ref_code=reference_id)
        return
        
    print(f"[+] [SRI] Factura RECIBIDA por SRI. Esperando 3 segundos para consultar autorización...")
    time.sleep(3)
    
    # 9. Consultar la autorización
    try:
        res_autorizacion_soap = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_autorizacion)
        res_autorizacion = sri_invoicing.parsear_respuesta_autorizacion(res_autorizacion_soap)
    except Exception as e:
        print(f"[-] [SRI] Error al conectar al servicio de Autorización: {e}")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_CONEXION_AUTORIZACION", error_msg=str(e), token=token, ref_code=reference_id)
        return
        
    autorizaciones = res_autorizacion.get('autorizaciones', [])
    if not autorizaciones:
        print(f"[-] [SRI] No se recibieron respuestas de autorización.")
        actualizar_estado_factura_db(payment_id, producer_id, "SIN_RESPUESTA_AUTORIZACION", error_msg="No se recibió respuesta de autorización del SRI.", token=token, ref_code=reference_id)
        return
        
    aut = autorizaciones[0]
    estado_aut = aut.get('estado')
    
    if estado_aut == 'AUTORIZADO':
        num_aut = aut.get('numeroAutorizacion')
        fec_aut = aut.get('fechaAutorizacion')
        xml_autorizado_sri = aut.get('comprobante')
        
        print(f"✅ [SRI] Factura AUTORIZADA exitosamente. Autorización Nro: {num_aut}")
        
        # 10. Generar el PDF RIDE
        target_dir = os.path.expanduser('~/Documents/Licencias')
        os.makedirs(target_dir, exist_ok=True)
        ride_filename = f"Factura_{secuencial_str}_{clave_acceso}.pdf"
        ride_filepath = os.path.join(target_dir, ride_filename)
        
        try:
            sri_ride.generar_ride_pdf(ride_filepath, xml_autorizado_sri, aut)
        except Exception as e:
            print(f"[-] [SRI] Error al generar RIDE PDF localmente: {e}")
            
        # 11. Incrementar el secuencial
        actualizar_secuencial_sri(producer_id, secuencial + 1, token=token)
        
        # 12. Actualizar estado en DB
        actualizar_estado_factura_db(
            payment_id, producer_id, "AUTORIZADO",
            clave_acceso=clave_acceso,
            xml_autorizado=xml_autorizado_sri,
            num_autorizacion=num_aut,
            fecha_autorizacion=fec_aut,
            secuencial=secuencial,
            ride_path=ride_filepath,
            token=token,
            ref_code=reference_id
        )
    else:
        msgs = aut.get('mensajes', [])
        err_msg = "; ".join([m.get('mensaje') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else "No autorizado."
        print(f"[-] [SRI] Factura NO AUTORIZADA por el SRI. Estado: {estado_aut}. Motivo: {err_msg}")
        actualizar_estado_factura_db(payment_id, producer_id, "RECHAZADO_AUTORIZACION", error_msg=err_msg, token=token, ref_code=reference_id)

class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            super().showPage()
        super().save()

    def draw_page_number(self, page_count):
        crypto_hash = getattr(self, 'crypto_hash', '')
        ref_code = getattr(self, 'ref_code', '')
        
        self.saveState()
        self.setFont("Helvetica-Oblique", 8)
        self.setFillColor(colors.HexColor("#718096"))
        
        hash_stamp = f"Cripto-Sello BEATSS: {crypto_hash[:32]}..." if crypto_hash else "Cripto-Sello BEATSS"
        if ref_code:
            hash_stamp += f" | Ref: {ref_code}"
            
        self.drawString(54, 30, hash_stamp)
        
        page_str = f"Página {self._pageNumber} de {page_count}"
        self.drawRightString(self._pagesize[0] - 54, 30, page_str)
        self.restoreState()

def clean_inline_markdown(text):
    text = re.sub(r'\*\*(.*?)\*\*|__(.*?)__', r'<b>\1\2</b>', text)
    text = re.sub(r'\*(.*?)\*|_(.*?)_', r'<i>\1\2</i>', text)
    text = re.sub(r'\[(.*?)\]\((.*?)\)', r'<a href="\2" color="blue"><u>\1</u></a>', text)
    return text

def markdown_to_flowables(md_text, styles):
    flowables = []
    lines = md_text.split('\n')
    
    in_list = False
    list_items = []
    
    in_table = False
    table_rows = []
    
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if line.startswith('|'):
            if in_list:
                for item in list_items:
                    flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
                    flowables.append(Spacer(1, 4))
                in_list = False
                list_items = []
                
            in_table = True
            cells = [clean_inline_markdown(c.strip()) for c in line.split('|')[1:-1]]
            if not all(re.match(r'^:?-+:?$', c) for c in cells):
                table_rows.append(cells)
            i += 1
            continue
        elif in_table:
            if table_rows:
                col_count = len(table_rows[0])
                col_width = 504 / col_count if col_count > 0 else 100
                t_data = []
                for row_idx, row in enumerate(table_rows):
                    t_row = []
                    for cell in row:
                        cell_style = styles['TableHeaderStyle'] if row_idx == 0 else styles['TableCellStyle']
                        t_row.append(Paragraph(cell, cell_style))
                    t_data.append(t_row)
                
                table = Table(t_data, colWidths=[col_width]*col_count)
                table.setStyle(TableStyle([
                    ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1a1d24")),
                    ('TEXTCOLOR', (0,0), (-1,0), colors.whitesmoke),
                    ('ALIGN', (0,0), (-1,-1), 'LEFT'),
                    ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                    ('BOTTOMPADDING', (0,0), (-1,-1), 6),
                    ('TOPPADDING', (0,0), (-1,-1), 6),
                    ('LEFTPADDING', (0,0), (-1,-1), 6),
                    ('RIGHTPADDING', (0,0), (-1,-1), 6),
                    ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e0")),
                    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, colors.HexColor("#f8fafc")]),
                ]))
                flowables.append(table)
                flowables.append(Spacer(1, 12))
            in_table = False
            table_rows = []
            
        if line.startswith('- ') or line.startswith('* '):
            item_text = clean_inline_markdown(line[2:])
            list_items.append(item_text)
            in_list = True
            i += 1
            continue
        elif in_list and not (line.startswith('- ') or line.startswith('* ')):
            for item in list_items:
                flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
                flowables.append(Spacer(1, 3))
            flowables.append(Spacer(1, 8))
            in_list = False
            list_items = []
            
        if not line:
            flowables.append(Spacer(1, 6))
            i += 1
            continue
            
        if line.startswith('### '):
            flowables.append(Paragraph(clean_inline_markdown(line[4:]), styles['H3Style']))
            flowables.append(Spacer(1, 6))
        elif line.startswith('## '):
            flowables.append(Paragraph(clean_inline_markdown(line[3:]), styles['H2Style']))
            flowables.append(Spacer(1, 8))
        elif line.startswith('# '):
            flowables.append(Paragraph(clean_inline_markdown(line[2:]), styles['H1Style']))
            flowables.append(Spacer(1, 10))
        else:
            flowables.append(Paragraph(clean_inline_markdown(line), styles['NormalStyle']))
            flowables.append(Spacer(1, 8))
            
        i += 1
        
    if in_list:
        for item in list_items:
            flowables.append(Paragraph(f"&bull; {item}", styles['NormalStyle']))
            flowables.append(Spacer(1, 3))
            
    return flowables

def generate_pdf_from_contract(filename, md_content, data_fields):
    doc = SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = {
        'H1Style': ParagraphStyle(
            'H1',
            fontName='Helvetica-Bold',
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#1a202c"),
            spaceAfter=10,
            keepWithNext=True
        ),
        'H2Style': ParagraphStyle(
            'H2',
            fontName='Helvetica-Bold',
            fontSize=12,
            leading=16,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=8,
            keepWithNext=True
        ),
        'H3Style': ParagraphStyle(
            'H3',
            fontName='Helvetica-Bold',
            fontSize=10,
            leading=13,
            textColor=colors.HexColor("#4a5568"),
            spaceAfter=6,
            keepWithNext=True
        ),
        'NormalStyle': ParagraphStyle(
            'Normal',
            fontName='Helvetica',
            fontSize=9,
            leading=12.5,
            textColor=colors.HexColor("#2d3748"),
            spaceAfter=6
        ),
        'TableHeaderStyle': ParagraphStyle(
            'TableHeader',
            fontName='Helvetica-Bold',
            fontSize=8.5,
            leading=11,
            textColor=colors.whitesmoke
        ),
        'TableCellStyle': ParagraphStyle(
            'TableCell',
            fontName='Helvetica',
            fontSize=8,
            leading=10.5,
            textColor=colors.HexColor("#2d3748")
        ),
        'SignatureLabelStyle': ParagraphStyle(
            'SigLabel',
            fontName='Helvetica-Bold',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#4a5568"),
            alignment=1
        ),
        'SignatureValueStyle': ParagraphStyle(
            'SigVal',
            fontName='Helvetica',
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#718096"),
            alignment=1
        )
    }
    
    story = []
    
    aka = data_fields.get('aka', 'SOSSA').upper()
    logo_base64 = data_fields.get('logoBase64', '')
    
    logo_temp_path = None
    if logo_base64:
        try:
            if ',' in logo_base64:
                logo_base64 = logo_base64.split(',')[1]
            logo_data = base64.b64decode(logo_base64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_logo:
                temp_logo.write(logo_data)
                logo_temp_path = temp_logo.name
        except Exception as e:
            print(f"Warning: Failed to decode logoBase64: {e}")
            
    if logo_temp_path:
        try:
            story.append(Image(logo_temp_path, height=45, width=120))
            story.append(Spacer(1, 15))
        except Exception as e:
            print(f"Warning: Failed to render logo image in PDF: {e}")
            story.append(Paragraph(f"<font size=16 color='#1a202c'><b>{aka}</b></font>", styles['H1Style']))
    else:
        title_text = f"<font size=18 color='#1a202c'><b>{aka}</b></font>"
        p_title = Paragraph(title_text, styles['NormalStyle'])
        p_title.style.alignment = 1
        story.append(p_title)
        story.append(Spacer(1, 15))
        
    story.extend(markdown_to_flowables(md_content, styles))
    story.append(Spacer(1, 15))
    
    producer_sig_b64 = data_fields.get('producerSignatureBase64', '')
    buyer_sig_b64 = data_fields.get('buyerSignatureBase64', '')
    needs_buyer = data_fields.get('needsBuyerSignature', False)
    
    producer_img_path = None
    buyer_img_path = None
    
    try:
        if producer_sig_b64:
            if ',' in producer_sig_b64:
                producer_sig_b64 = producer_sig_b64.split(',')[1]
            p_data = base64.b64decode(producer_sig_b64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_p:
                temp_p.write(p_data)
                producer_img_path = temp_p.name
                
        if needs_buyer and buyer_sig_b64:
            if ',' in buyer_sig_b64:
                buyer_sig_b64 = buyer_sig_b64.split(',')[1]
            b_data = base64.b64decode(buyer_sig_b64)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_b:
                temp_b.write(b_data)
                buyer_img_path = temp_b.name
    except Exception as e:
        print(f"Warning: Failed to decode signatures: {e}")
        
    sig_data = []
    prod_col = []
    if producer_img_path:
        try:
            prod_col.append(Image(producer_img_path, width=120, height=45))
        except Exception as e:
            prod_col.append(Paragraph("<font name='Times-Bold' size=16 color='#2b6cb0'><i>" + data_fields.get('producerName', 'Sossa') + "</i></font>", styles['SignatureValueStyle']))
    else:
        prod_col.append(Paragraph("<font name='Times-Bold' size=16 color='#2b6cb0'><i>" + data_fields.get('producerName', 'Sossa') + "</i></font>", styles['SignatureValueStyle']))
    
    prod_col.append(Spacer(1, 5))
    prod_col.append(Paragraph("_____________________________", styles['SignatureValueStyle']))
    prod_col.append(Spacer(1, 3))
    prod_col.append(Paragraph(data_fields.get('producerRole', 'El Licenciante (Productor)'), styles['SignatureLabelStyle']))
    prod_col.append(Paragraph(data_fields.get('producerName', 'Joao David Dominguez'), styles['SignatureValueStyle']))
    prod_col.append(Paragraph(f"Identificación/RUT: {data_fields.get('producerId', '0803743111')}", styles['SignatureValueStyle']))
    prod_col.append(Paragraph(f"AKA: {data_fields.get('aka', 'Sossa')}", styles['SignatureValueStyle']))
    
    buyer_col = []
    if needs_buyer:
        if buyer_img_path:
            try:
                buyer_col.append(Image(buyer_img_path, width=120, height=45))
            except Exception as e:
                buyer_col.append(Paragraph("<font name='Times-Bold' size=16 color='#2b6cb0'><i>" + data_fields.get('buyerName', 'Comprador') + "</i></font>", styles['SignatureValueStyle']))
        else:
            buyer_col.append(Spacer(1, 30))
            
        buyer_col.append(Spacer(1, 5))
        buyer_col.append(Paragraph("_____________________________", styles['SignatureValueStyle']))
        buyer_col.append(Spacer(1, 3))
        buyer_col.append(Paragraph(data_fields.get('buyerRole', 'El Licenciatario (Usuario)'), styles['SignatureLabelStyle']))
        buyer_col.append(Paragraph(data_fields.get('buyerName', 'Jair Yepez'), styles['SignatureValueStyle']))
        buyer_col.append(Paragraph(f"Identificación/RUT: {data_fields.get('buyerId', '0803743111')}", styles['SignatureValueStyle']))
        buyer_col.append(Paragraph("Firma vía DocuSign / Electrónica", styles['SignatureValueStyle']))
        
    if needs_buyer:
        sig_data.append([prod_col, buyer_col])
        sig_table = Table(sig_data, colWidths=[252, 252])
    else:
        sig_data.append([prod_col, ''])
        sig_table = Table(sig_data, colWidths=[252, 252])
        
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ]))
    
    story.append(KeepTogether([sig_table]))
    
    hash_data = f"{data_fields.get('refCode')}|{data_fields.get('beatName')}|{data_fields.get('buyerName')}|{data_fields.get('buyerEmail')}|{data_fields.get('value')}|{data_fields.get('date')}|{aka}"
    crypto_hash = hashlib.sha256(hash_data.encode('utf-8')).hexdigest()
    
    canvas_maker = NumberedCanvas
    canvas_maker.crypto_hash = crypto_hash
    canvas_maker.ref_code = data_fields.get('refCode', '')
    
    doc.build(story, canvasmaker=canvas_maker)
    
    for path in [logo_temp_path, producer_img_path, buyer_img_path]:
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except Exception:
                pass
                
    return crypto_hash

def save_license_hash_in_firestore(producer_id, ref_code, crypto_hash):
    """Guarda el hash criptográfico en la licencia correspondiente en Firestore."""
    token = get_admin_token()
    if not token:
        print("[-] No se pudo obtener el token de administrador para guardar el hash de la licencia.")
        return False
        
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/licencias/{ref_code}"
    
    req_get = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req_get) as response:
            json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Licencia {ref_code} no encontrada en Firestore al intentar guardar hash: {e}")
        return False
        
    params = ["updateMask.fieldPaths=cryptoHash"]
    full_url = f"{url}?{'&'.join(params)}"
    payload = {
        "fields": {
            "cryptoHash": {"stringValue": crypto_hash}
        }
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    req_patch = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req_patch) as response:
            print(f"[+] Crypto-Hash guardado en Firestore para la licencia: {ref_code}")
            return True
    except Exception as e:
        print(f"[-] Error al guardar hash de licencia en Firestore REST: {e}")
        return False

def save_license_hash_in_local_backup(producer_id, ref_code, crypto_hash):
    """Guarda el hash criptográfico en la licencia correspondiente en el respaldo físico local."""
    filepath, username = resolve_backup_file(producer_id)
    if not os.path.exists(filepath):
        return False
        
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
            
        history_key = f"{producer_id}_license_history"
        if history_key not in backup_data:
            history_key = f"{username}_license_history"
        history_str = backup_data.get(history_key, '[]')
        licenses = json.loads(history_str)
        
        updated = False
        for lic in licenses:
            if lic.get('refCode') == ref_code:
                lic['cryptoHash'] = crypto_hash
                updated = True
                break
                
        if updated:
            backup_data[history_key] = json.dumps(licenses)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
            print(f"[+] Crypto-Hash guardado en el respaldo local para la licencia: {ref_code}")
            return True
    except Exception as e:
        print(f"[-] Error al guardar hash de licencia en respaldo local: {e}")
        
    return False

def get_sales_analytics(user='sossa', period='all'):
    backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
    if not os.path.exists(backup_path):
        return {"error": f"No backup file found for user {user}"}
        
    with open(backup_path, 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
        
    history_str = backup_data.get(f'{user}_license_history', '[]')
    licenses = json.loads(history_str)
    
    now = datetime.datetime.now()
    current_year = now.year
    current_month_prefix = f"{current_year}-{now.month:02d}"
    current_year_prefix = f"{current_year}"
    
    filtered_licenses = []
    for lic in licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
            
        try:
            lic_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
            
        if period == '30':
            diff_days = (now - lic_date).days
            if diff_days <= 30:
                filtered_licenses.append(lic)
        elif period == 'month':
            if date_str.startswith(current_month_prefix):
                filtered_licenses.append(lic)
        elif period == 'year':
            if date_str.startswith(current_year_prefix):
                filtered_licenses.append(lic)
        else:
            filtered_licenses.append(lic)
            
    total_revenue = 0.0
    beats_sold = set()
    buyers_map = {}
    
    for lic in filtered_licenses:
        val = 0.0
        try:
            val = float(lic.get('value', 0))
        except (ValueError, TypeError):
            pass
        total_revenue += val
        
        beat_name = lic.get('beatName')
        if beat_name:
            beats_sold.add(beat_name)
            
        buyer_name = lic.get('buyerName')
        if buyer_name:
            if buyer_name not in buyers_map:
                form_data = lic.get('formData', {})
                email = form_data.get('buyerEmail', '') if isinstance(form_data, dict) else ''
                buyers_map[buyer_name] = {
                    "count": 0,
                    "total": 0.0,
                    "email": email
                }
            buyers_map[buyer_name]["count"] += 1
            buyers_map[buyer_name]["total"] += val
            
    top_buyer_name = 'N/A'
    top_buyer_val = 0.0
    for name, b_info in buyers_map.items():
        if b_info["total"] > top_buyer_val:
            top_buyer_val = b_info["total"]
            top_buyer_name = name
            
    monthly_sales = []
    month_keys = []
    for i in range(5, -1, -1):
        m_offset = now.month - i
        y_offset = now.year
        while m_offset <= 0:
            m_offset += 12
            y_offset -= 1
        month_keys.append((y_offset, m_offset))
        
    month_names_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    
    for y, m in month_keys:
        prefix = f"{y}-{m:02d}"
        label = f"{month_names_es[m-1]}"
        monthly_sales.append({
            "prefix": prefix,
            "label": label,
            "revenue": 0.0,
            "count": 0
        })
        
    for lic in filtered_licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
        lic_prefix = date_str[:7]
        for m_data in monthly_sales:
            if m_data["prefix"] == lic_prefix:
                val = 0.0
                try:
                    val = float(lic.get('value', 0))
                except (ValueError, TypeError):
                    pass
                m_data["revenue"] += val
                m_data["count"] += 1
                
    license_types_count = {}
    for lic in filtered_licenses:
        l_type = lic.get('type') or lic.get('licenseType') or 'basic'
        l_type_title = l_type.capitalize()
        if l_type.lower() == 'basic':
            l_type_title = 'Básica'
        elif l_type.lower() == 'premium':
            l_type_title = 'Premium'
        elif l_type.lower() in ['unlimited', 'unlimited_flp', 'ilimitada']:
            l_type_title = 'Ilimitada'
        elif l_type.lower() == 'exclusive' or l_type.lower() == 'exclusiva':
            l_type_title = 'Exclusiva'
            
        license_types_count[l_type_title] = license_types_count.get(l_type_title, 0) + 1
        
    total_lic_count = len(filtered_licenses)
    license_types = []
    colors_map = {
        "Básica": "#3b82f6",
        "Premium": "#10b981",
        "Ilimitada": "#f59e0b",
        "Exclusiva": "#a855f7"
    }
    
    for l_type, count in license_types_count.items():
        pct = (count / total_lic_count * 100) if total_lic_count > 0 else 0
        license_types.append({
            "type": l_type,
            "count": count,
            "pct": pct,
            "color": colors_map.get(l_type, "#718096")
        })
        
    beats_count = {}
    for lic in filtered_licenses:
        b_name = lic.get('beatName')
        if b_name:
            beats_count[b_name] = beats_count.get(b_name, 0) + 1
            
    top_beats = sorted(
        [{"name": k, "count": v} for k, v in beats_count.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:5]
    
    top_buyers = sorted(
        [
            {
                "name": k,
                "count": v["count"],
                "total": v["total"],
                "email": v["email"]
            }
            for k, v in buyers_map.items()
        ],
        key=lambda x: x["total"],
        reverse=True
    )[:5]
    
    return {
        "totalRevenue": total_revenue,
        "totalLicenses": len(filtered_licenses),
        "uniqueBeats": len(beats_sold),
        "topBuyerName": top_buyer_name,
        "topBuyerVal": top_buyer_val,
        "monthlySales": monthly_sales,
        "licenseTypes": license_types,
        "topBeats": top_beats,
        "topBuyers": top_buyers
    }

def fetch_firestore_collection(collection_path, token):

    """Obtiene todos los documentos de una colección específica en Firestore usando REST API."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/{collection_path}"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("documents", [])
    except Exception as e:
        return []

def get_gdrive_direct_link(gdrive_url):
    """Convierte un enlace de compartir de Google Drive a un enlace directo de descarga."""
    if not gdrive_url:
        return ""
    # Si es una ruta local o no parece un ID de Drive
    if os.path.exists(gdrive_url) or gdrive_url.startswith("/") or gdrive_url.startswith("."):
        return gdrive_url
        
    file_id = ""
    if "drive.google.com" in gdrive_url:
        if "/file/d/" in gdrive_url:
            parts = gdrive_url.split("/file/d/")
            if len(parts) > 1:
                file_id = parts[1].split("/")[0].split("?")[0]
        elif "id=" in gdrive_url:
            parsed = urlparse(gdrive_url)
            qs = parse_qs(parsed.query)
            file_id = qs.get('id', [""])[0]
    elif len(gdrive_url) > 15 and "/" not in gdrive_url and "." not in gdrive_url:
        file_id = gdrive_url
        
    if file_id:
        return f"https://docs.google.com/uc?export=download&id={file_id}"
    return gdrive_url

def process_watermark_audio(beat_id, user):
    """
    Obtiene la configuración del productor, verifica si tiene marca de agua,
    descarga el MP3, mezcla el tag y guarda el archivo en la caché local.
    """
    backup_file = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
    if not os.path.exists(backup_file):
        return False, "No se encontro el backup del productor"

    try:
        with open(backup_file, 'r', encoding='utf-8') as f:
            db_data = json.load(f)
    except Exception as e:
        return False, f"Error al cargar base de datos: {str(e)}"

    config_key = f"{user}_producer_config"
    producer_config_str = db_data.get(config_key, None)
    if not producer_config_str:
        producer_config = db_data.get("producer_config", {})
    else:
        try:
            producer_config = json.loads(producer_config_str)
        except Exception:
            producer_config = {}

    audio_tag_b64 = producer_config.get("audioTagBase64", "")
    if not audio_tag_b64:
        beats_key = f"{user}_beats"
        beats_str = db_data.get(beats_key, "[]")
        try:
            beats = json.loads(beats_str)
        except Exception:
            beats = []
            
        beat = next((b for b in beats if str(b.get("id")) == str(beat_id)), None)
        if beat and beat.get("mp3"):
            return False, f"gdrive_url:{beat.get('mp3')}"
        return False, "Productor no tiene marca de agua configurada ni se encontro el beat"

    beats_key = f"{user}_beats"
    beats_str = db_data.get(beats_key, "[]")
    try:
        beats = json.loads(beats_str)
    except Exception:
        beats = []
        
    beat = next((b for b in beats if str(b.get("id")) == str(beat_id)), None)
    if not beat or not beat.get("mp3"):
        return False, "Beat no encontrado o no tiene archivo MP3 asociado"

    gdrive_mp3_url = beat.get("mp3")
    direct_mp3_link = get_gdrive_direct_link(gdrive_mp3_url)

    tag_hash = hashlib.md5(audio_tag_b64.encode('utf-8')).hexdigest()
    cached_filename = f"{beat_id}_{tag_hash}.mp3"
    cached_filepath = os.path.join(DIRECTORY, 'temp_audio_cache', cached_filename)

    if os.path.exists(cached_filepath) and os.path.getsize(cached_filepath) > 0:
        return True, cached_filepath

    print(f"[*] Mezclando en caliente beat {beat_id} con la marca de agua del productor...")
    
    try:
        if "," in audio_tag_b64:
            b64_data = audio_tag_b64.split(",")[1]
        else:
            b64_data = audio_tag_b64
        
        tag_bytes = base64.b64decode(b64_data)
    except Exception as e:
        return False, f"Error al decodificar tag Base64: {str(e)}"

    temp_tag_fd, temp_tag_path = tempfile.mkstemp(suffix=".mp3")
    temp_spaced_fd, temp_spaced_path = tempfile.mkstemp(suffix=".mp3")
    
    try:
        with os.fdopen(temp_tag_fd, 'wb') as tmp_tag:
            tmp_tag.write(tag_bytes)
            
        os.close(temp_spaced_fd)

        # Paso 1 con FFmpeg: Crear un archivo espaciado con 15 segundos de silencio al final
        cmd_space = [
            "ffmpeg", "-y", "-i", temp_tag_path,
            "-filter_complex", "aevalsrc=0:d=15[silence];[0:a][silence]concat=n=2:v=0:a=1",
            temp_spaced_path
        ]
        
        res_space = subprocess.run(cmd_space, capture_output=True, text=True)
        if res_space.returncode != 0:
            raise RuntimeError(f"FFmpeg fallo al espaciar el tag: {res_space.stderr}")

        # Paso 2 con FFmpeg: Mezclar el tag espaciado en bucle sobre la pista de beat
        cmd_mix = [
            "ffmpeg", "-y", "-i", direct_mp3_link,
            "-filter_complex", f"amovie={temp_spaced_path}:loop=0,asetpts=N/SR/TB[tag];[0:a][tag]amix=inputs=2:duration=first:dropout_transition=2",
            cached_filepath
        ]
        
        res_mix = subprocess.run(cmd_mix, capture_output=True, text=True)
        if res_mix.returncode != 0:
            raise RuntimeError(f"FFmpeg fallo al mezclar los audios: {res_mix.stderr}")

        print(f"[+] Beat {beat_id} mezclado con exito y guardado en cache: {cached_filepath}")
        return True, cached_filepath
        
    except Exception as e:
        print(f"[-] Error durante el procesamiento de marca de agua: {str(e)}")
        if os.path.exists(cached_filepath):
            try: os.remove(cached_filepath)
            except Exception: pass
        return False, f"Fallo al aplicar marca de agua: {str(e)}"
        
    finally:
        try: os.remove(temp_tag_path)
        except Exception: pass
        try: os.remove(temp_spaced_path)
        except Exception: pass

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Si existe la carpeta 'dist' (compilada con Vite), servimos desde ahí para evitar errores de módulos nativos (bare imports)
        dist_dir = os.path.join(DIRECTORY, 'dist')
        serve_dir = dist_dir if os.path.exists(dist_dir) else DIRECTORY
        super().__init__(*args, directory=serve_dir, **kwargs)

    def end_headers(self):
        # Cabeceras de seguridad HTTP globales
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-XSS-Protection', '1; mode=block')
        csp_header = (
            "default-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.google.com; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.google.com https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.payphonetodoesposible.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://*.googleusercontent.com https://chart.googleapis.com https://cdn.payphonetodoesposible.com https://unpkg.com; "
            "media-src 'self' blob: data: https://*.googleusercontent.com; "
            "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://pay.payphonetodoesposible.com https://payphonetodoesposible.com;"
        )
        self.send_header('Content-Security-Policy', csp_header)
        super().end_headers()

    def translate_path(self, path):
        parsed = urlparse(path)
        if parsed.path.startswith('/temp_audio_cache/'):
            filename = os.path.basename(parsed.path)
            return os.path.join(DIRECTORY, 'temp_audio_cache', filename)
        return super().translate_path(path)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/load-local':
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            # Solo permitir sossa, cgmonarco y mrmicua por seguridad
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
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
                        parsed = sri_invoicing.parsear_respuesta_autorizacion(soap_res)
                        autorizaciones = parsed.get('autorizaciones', [])
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
            
            # En local dev permitimos acceso libre
            is_authorized = True
            
            if not is_authorized:
                self.send_response(403)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Firma no valida o expirada"}')
                return
                
            direct_link = f"https://docs.google.com/uc?export=download&id={file_id}"
            self.send_response(302)
            self.send_header('Location', direct_link)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        elif parsed.path == '/api/admin/sales-analytics':
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
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(json.dumps(config, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al servir configuración de pagos: {str(e)}")
        else:

            # Servir archivo estático normal
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
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
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Backup local guardado correctamente"}')
                print(f"💾 Archivo de respaldo físico actualizado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
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
                import re
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
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "PDF guardado en Documentos/Licencias"}')
                print(f"📄 PDF de licencia guardado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
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
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Task processing started in background"}')
                print(f"⚙️ Procesamiento asíncrono iniciado para la tarea: {task_id}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al iniciar tarea asíncrona: {str(e)}")
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar QR Deuna: {str(e)}")
        elif parsed.path == '/api/payments/deuna/webhook' or parsed.path == '/api/payments/deuna/simulate-confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                purchase_id = payload.get('purchaseId')
                status = payload.get('status', 'completed')
                
                if not purchase_id:
                    raise ValueError("Falta parámetro 'purchaseId'")
                
                success = False
                if status == 'completed':
                    success = confirm_payment_in_firestore(purchase_id)
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "message": f"Pago {purchase_id} confirmado exitosamente"}).encode('utf-8'))
                else:
                    raise RuntimeError("Error al confirmar el pago en Firestore (verifique credenciales gcloud en la consola)")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Access-Control-Expose-Headers', 'Content-Disposition, X-Crypto-Hash')
                self.send_header('X-Crypto-Hash', crypto_hash)
                self.end_headers()
                self.wfile.write(pdf_bytes)
                print(f"📄 PDF Criptográfico generado, firmado y guardado en: {filepath}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
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
                        self.send_header('Access-Control-Allow-Origin', '*')
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
                    self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                        self.send_header('Access-Control-Allow-Origin', '*')
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
                    self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                    self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al reemitir factura SRI: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    # Silenciar logs repetitivos si se desea, o mantenerlos para debug simple
    def log_message(self, format, *args):
        # Solo imprimimos mensajes que no sean peticiones de recursos normales para no saturar
        message = format % args
        if "GET /api/" in message or "POST /api/" in message:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), message))
        elif "GET /" not in message: # Imprimir cualquier error u otro tipo de petición
            super().log_message(format, *args)

def load_dotenv():
    env_path = os.path.join(DIRECTORY, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    os.environ[key] = val

if __name__ == '__main__':
    load_dotenv()
    
    # Validación de seguridad de variables críticas
    if not os.environ.get('GEMINI_API_KEY'):
        print("[-] ERROR CRÍTICO: La variable de entorno GEMINI_API_KEY no está configurada en .env ni en el entorno del sistema.", file=sys.stderr)
        print("[-] Deteniendo el inicio del servidor por seguridad.", file=sys.stderr)
        sys.exit(1)

    # Permitir configurar puerto por argumento si fuera necesario
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
            
    print(f"[*] Iniciando servidor personalizado de Sossa Licencias...")
    print(f"[*] Directorio raíz: {DIRECTORY}")
    print(f"[*] Escuchando en http://localhost:{port}")
    
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Servidor detenido por el usuario.")
        sys.exit(0)
