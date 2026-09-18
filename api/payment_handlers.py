import os
import json
import re
import time
import datetime
import threading
import urllib.request
import urllib.parse
from server_utils import get_admin_token, resolve_backup_file
from admin_config import get_admin_config
from payment_verifier import (
    update_user_plan_in_firestore, 
    confirm_payment_in_firestore, 
    verify_paypal_subscription, 
    verify_paypal_order,
    register_youtube_whitelist_in_firestore
)
from sri_service import emitir_factura_sri_background

def handle_deuna_qr(handler, parsed):
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
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
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        
        res_payload = {
            "status": "success",
            "qrUrl": qr_url,
            "deeplink": deeplink
        }
        handler.wfile.write(json.dumps(res_payload).encode('utf-8'))
        print(f"📲 QR de Deuna! generado para compra: {purchase_id} ($ {amount})")
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        print(f"❌ Error al generar QR Deuna: {str(e)}")

def handle_deuna_webhook(handler, parsed):
    deuna_secret = os.environ.get("DEUNA_WEBHOOK_SECRET")
    is_simulation = parsed.path == '/api/payments/deuna/simulate-confirm'
    
    # Si es simulación, exigir token de autenticación local
    if is_simulation:
        if not handler.check_local_auth():
            print("[⚠️ Security Alert] Intento no autorizado de simulación de pago Deuna.")
            handler.send_response(401)
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
            return
    elif deuna_secret:
        token_recibido = handler.headers.get('X-Deuna-Token') or handler.headers.get('Authorization')
        if token_recibido != deuna_secret and token_recibido != f"Bearer {deuna_secret}":
            print("[⚠️ Security Alert] Token de webhook de Deuna inválido o ausente.")
            handler.send_response(401)
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(b'{"error": "Unauthorized"}')
            return

    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
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
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({"status": "success", "message": f"Pago {purchase_id} confirmado exitosamente"}).encode('utf-8'))
        else:
            raise RuntimeError("Error al confirmar el pago en Firestore")
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        print(f"❌ Error en webhook/confirmación de Deuna: {str(e)}")

def handle_activate_pro(handler, parsed):
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
    
    try:
        payload = json.loads(post_data.decode('utf-8'))
        order_id = payload.get('orderId')
        subscription_id = payload.get('subscriptionId')
        uid = payload.get('uid')
        email = payload.get('email', '')
        
        # Normalizar si nos mandan de simulación
        is_mock = False
        if order_id and order_id.startswith('PAYPAL-SUB-MOCK-'):
            is_mock = True
        elif subscription_id and subscription_id.startswith('PAYPAL-SUB-MOCK-'):
            is_mock = True
        
        if not order_id and not subscription_id:
            raise ValueError("Faltan parámetros 'orderId' o 'subscriptionId'")
        if not uid:
            raise ValueError("Falta el parámetro 'uid'")
        
        # Si es un ID de simulación mock, omitir la verificación real
        if is_mock and os.environ.get('ALLOW_PAYMENT_MOCKS', '').lower() == 'true' and handler.is_loopback_request():
            plan = payload.get('plan', 'pro')
            print(f"[+] Simulando pago exitoso de PayPal para plan {plan} del usuario {uid}")
            activation_success = update_user_plan_in_firestore(uid, plan, email)
            if activation_success:
                handler.send_response(200)
                handler.send_header('Content-Type', 'application/json')
                handler.send_cors_headers()
                handler.end_headers()
                handler.wfile.write(json.dumps({
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
        
        if subscription_id:
            # Verificar suscripción de PayPal
            success, paypal_plan_id = verify_paypal_subscription(subscription_id, paypal_client_id, paypal_client_secret)
            if not success:
                raise RuntimeError("No se pudo verificar la suscripción de PayPal o no está activa.")
                
            # Determinar el plan según el plan_id devuelto por PayPal
            plan_id_pro = admin_config.get('paypalPlanIdPro')
            plan_id_elite = admin_config.get('paypalPlanIdElite')
            
            if paypal_plan_id == plan_id_elite:
                plan = "elite"
            elif paypal_plan_id == plan_id_pro:
                plan = "pro"
            else:
                plan = payload.get('plan', 'pro')
            amount = 30.0 if plan == 'elite' else 10.0
        else:
            # Verificar orden en PayPal
            success, plan, amount = verify_paypal_order(order_id, paypal_client_id, paypal_client_secret)
            if not success:
                raise RuntimeError("No se pudo verificar el pago en PayPal o no ha sido completado.")
        
        # Activar el plan en Firestore y local
        activation_success = update_user_plan_in_firestore(uid, plan, email)
        
        if activation_success:
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({
                "success": True, 
                "plan": plan,
                "message": f"Suscripción {plan.upper()} activada exitosamente."
            }).encode('utf-8'))
            print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid} ($ {amount})")
        else:
            raise RuntimeError("Error al actualizar el plan en Firestore")
            
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
        print(f"❌ Error en /api/activate-pro: {str(e)}")

def handle_payphone_subscription_confirm(handler, parsed):
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
    
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
            if os.environ.get('ALLOW_PAYMENT_MOCKS', '').lower() != 'true' or not handler.is_loopback_request():
                raise PermissionError("Las simulaciones de pago solo están disponibles en el entorno local autorizado.")
            print(f"[+] Simulando pago exitoso de PayPhone para suscripción del usuario {uid}")
            success = update_user_plan_in_firestore(uid, plan, email)
            if success:
                handler.send_response(200)
                handler.send_header('Content-Type', 'application/json')
                handler.send_cors_headers()
                handler.end_headers()
                handler.wfile.write(json.dumps({
                    "status": "success", 
                    "message": f"Suscripción {plan.upper()} activada exitosamente (Simulación)"
                }).encode('utf-8'))
                return
            else:
                raise RuntimeError("Error al actualizar el plan en Firestore en simulación")
        
        # Cargar el token privado de Payphone del ADMIN
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
            handler.send_response(200)
            handler.send_header('Content-Type', 'application/json')
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({
                "status": "success", 
                "message": f"Suscripción {plan.upper()} activada exitosamente tras pago PayPhone"
            }).encode('utf-8'))
            print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid}")
        else:
            raise RuntimeError("Error al actualizar el plan en Firestore")
            
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        print(f"❌ Error al confirmar suscripción PayPhone: {str(e)}")

def handle_payphone_confirm(handler, parsed):
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
    
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

        # Conservar los IDs de Firestore antes de consumir la lista para el
        # historial local. El cliente los necesita para entregar cada licencia
        # después de una confirmación PayPhone exitosa.
        payment_ids_for_response = list(inserted_payment_ids)
        
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
            
            # Registrar canal en la lista blanca de YouTube
            if youtube_whitelist:
                try:
                    for item in items:
                        register_youtube_whitelist_in_firestore(
                            producer_id=producer_id,
                            buyer_name=buyer_name,
                            beat_name=item.get('beatName', 'Beat'),
                            license_ref=client_tx_id,
                            youtube_channel=youtube_whitelist,
                            token=admin_token
                        )
                except Exception as wle:
                    print(f"[-] Error al registrar YouTube en whitelist para PayPhone: {wle}")
            
            # Disparar la facturación SRI en segundo plano
            threading.Thread(
                target=emitir_factura_sri_background,
                args=(client_tx_id, producer_id)
            ).start()
        except Exception as le:
            print(f"[-] Error al actualizar historial local de licencias tras cobro PayPhone: {le}")
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "status": "success",
            "message": "Pago de PayPhone verificado y registrado exitosamente",
            "transactionId": client_tx_id,
            "paymentIds": payment_ids_for_response
        }).encode('utf-8'))
        print(f"✅ Transacción PayPhone confirmada exitosamente: {client_tx_id}")
        
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        print(f"❌ Error al confirmar pago de PayPhone: {str(e)}")
