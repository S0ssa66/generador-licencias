import os
import json
import base64
import urllib.request
import urllib.error

def send_invoice_email(buyer_email, reference_id, xml_content, ride_filepath=None):
    """
    Envía un correo de entrega de factura electrónica al comprador.
    Utiliza la API de Resend si está configurada la variable de entorno RESEND_API_KEY.
    Si no, simula el envío imprimiendo en consola.
    """
    if not buyer_email:
        print("[!] [EmailService] No se especificó email del comprador. Se omite el envío del correo.")
        return False

    resend_api_key = os.environ.get("RESEND_API_KEY")
    subject = f"Tu Factura Electrónica Autorizada - Transacción: {reference_id}"
    
    html_content = f"""
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', sans-serif; background-color: #0f1115; color: #f3f4f6; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #1a1d24; padding: 30px; border-radius: 12px; border: 1px solid #2d3748; }}
            .logo {{ color: #10b981; font-weight: bold; font-size: 24px; text-decoration: none; margin-bottom: 20px; display: inline-block; }}
            .title {{ font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #ffffff; }}
            .body-text {{ font-size: 14px; line-height: 1.6; color: #cbd5e0; margin-bottom: 20px; }}
            .footer {{ font-size: 11px; color: #718096; border-top: 1px solid #2d3748; padding-top: 15px; margin-top: 25px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <a href="https://sossamusic.com" class="logo">BEATSS</a>
            <div class="title">¡Hola! Tu comprobante electrónico está listo</div>
            <p class="body-text">
                Muchas gracias por tu compra. Adjunto a este correo encontrarás el archivo XML oficial autorizado por el SRI 
                y la representación impresa PDF (RIDE) de tu factura electrónica para la transacción <b>{reference_id}</b>.
            </p>
            <p class="body-text">
                Si adquiriste licencias instrumentales, puedes descargarlas directamente en tu panel de descargas de BEATSS.
            </p>
            <div class="footer">
                Este correo fue enviado de forma automática por BEATSS License Orchestrator.<br>
                Sossa Music LLC. Todos los derechos reservados.
            </div>
        </div>
    </body>
    </html>
    """

    attachments = []
    
    # Adjuntar XML
    if xml_content:
        xml_bytes = xml_content.encode('utf-8')
        xml_b64 = base64.b64encode(xml_bytes).decode('utf-8')
        attachments.append({
            "content": xml_b64,
            "filename": f"Factura_{reference_id}.xml"
        })
        
    # Adjuntar PDF RIDE
    if ride_filepath and os.path.exists(ride_filepath):
        try:
            with open(ride_filepath, 'rb') as f:
                pdf_bytes = f.read()
                pdf_b64 = base64.b64encode(pdf_bytes).decode('utf-8')
                attachments.append({
                    "content": pdf_b64,
                    "filename": os.path.basename(ride_filepath)
                })
        except Exception as e:
            print(f"[-] [EmailService] Error al codificar PDF RIDE para adjunto: {e}")

    if resend_api_key:
        print(f"[+] [EmailService] Enviando correo de factura a {buyer_email} vía API de Resend...")
        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {resend_api_key}",
            "Content-Type": "application/json"
        }
        
        payload = {
            "from": "BEATSS Billing <facturas@sossamusic.com>",
            "to": [buyer_email],
            "subject": subject,
            "html": html_content,
            "attachments": attachments
        }
        
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode('utf-8'),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=15) as res:
                res_data = json.loads(res.read().decode('utf-8'))
                email_id = res_data.get("id")
                print(f"✅ [EmailService] Correo enviado exitosamente (ID: {email_id})")
                return True
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            print(f"[-] [EmailService] Error de API en Resend al enviar correo: {error_body}")
            return False
        except Exception as e:
            print(f"[-] [EmailService] Error de red al enviar correo vía Resend: {e}")
            return False
    else:
        # Modo de simulación
        print(f"✨ [EmailService-MOCK] Simulación de Envío de Correo:")
        print(f"  ➔ Para: {buyer_email}")
        print(f"  ➔ Asunto: {subject}")
        print(f"  ➔ Adjuntos encolados: {[a['filename'] for a in attachments]}")
        print(f"  ➔ Estado: SIMULACIÓN EXITOSA (Falta configurar RESEND_API_KEY)")
        return True
