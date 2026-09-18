import os
import json
import urllib.request
import threading
from server_utils import get_admin_token, resolve_backup_file
from sri_service import emitir_factura_sri_background

def handle_retry_sri(handler, parsed):
    content_length = int(handler.headers.get('Content-Length', 0))
    post_data = handler.rfile.read(content_length)
    
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
            handler.send_response(400)
            handler.send_header('Content-Type', 'application/json')
            handler.send_cors_headers()
            handler.end_headers()
            handler.wfile.write(json.dumps({"error": "La factura correspondiente a este pago ya se encuentra AUTORIZADA."}).encode('utf-8'))
            return
        
        # Disparar la facturación en segundo plano
        threading.Thread(
            target=emitir_factura_sri_background,
            args=(reference, producer_id)
        ).start()
        
        handler.send_response(200)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({
            "status": "success",
            "message": "Reemisión de factura del SRI iniciada exitosamente en segundo plano.",
            "reference": reference
        }).encode('utf-8'))
        print(f"[+] [SRI Retry] Reemisión iniciada para la referencia: {reference}")
        
    except Exception as e:
        handler.send_response(400)
        handler.send_header('Content-Type', 'application/json')
        handler.send_cors_headers()
        handler.end_headers()
        handler.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        print(f"❌ Error al reemitir factura SRI: {str(e)}")
