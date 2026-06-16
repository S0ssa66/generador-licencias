import os
import json
import urllib.request
import urllib.error
import time
import datetime
import threading
from server_utils import get_admin_token, resolve_backup_file
from sri_service import emitir_factura_sri_background

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


def verify_paypal_order(order_id, client_id, client_secret):
    """
    Verifica un pedido de PayPal conectándose a la API.
    Prueba primero el entorno 'live' y luego 'sandbox' si hay algún fallo.
    Retorna (success, plan, amount) o (False, None, None).
    """
    import base64
    
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
