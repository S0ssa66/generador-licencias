import os
import json
import urllib.request
import base64
import datetime
import time
import sri_invoicing
import sri_ride
from server_utils import get_admin_token, resolve_backup_file

def validar_cedula_ruc_ecuador(dni):
    """
    Valida si un número de identificación cumple con el formato y algoritmos del SRI
    (Cédula de identidad, RUC de persona natural, RUC de persona jurídica o RUC público).
    """
    if not dni or not isinstance(dni, str):
        return False
    
    dni = dni.strip()
    if dni == '9999999999999':
        return False
        
    if len(dni) not in [10, 13]:
        return False
        
    try:
        # Extraer los dígitos
        digits = [int(x) for x in dni]
        
        # Validar provincia (primeros 2 dígitos entre 01 y 24, o 30)
        prov = digits[0] * 10 + digits[1]
        if (prov < 1 or prov > 24) and prov != 30:
            return False
            
        third_digit = digits[2]
        
        # 1. Cédula o RUC de persona natural (tercer dígito < 6)
        if third_digit < 6:
            coefs = [2, 1, 2, 1, 2, 1, 2, 1, 2]
            suma = 0
            for i in range(9):
                val = digits[i] * coefs[i]
                if val >= 10:
                    val -= 9
                suma += val
            verificador = (10 - (suma % 10)) % 10
            if verificador != digits[9]:
                return False
                
        # 2. RUC de personas jurídicas o extranjeros no residentes (tercer dígito = 9)
        elif third_digit == 9:
            if len(dni) != 13:
                return False
            coefs = [4, 3, 2, 7, 6, 5, 4, 3, 2]
            suma = 0
            for i in range(9):
                suma += digits[i] * coefs[i]
            verificador = (11 - (suma % 11)) % 11
            if verificador == 11:
                verificador = 0
            if verificador != digits[9]:
                return False
                
        # 3. RUC de entidades públicas (tercer dígito = 6)
        elif third_digit == 6:
            if len(dni) != 13:
                return False
            coefs = [3, 2, 7, 6, 5, 4, 3, 2]
            suma = 0
            for i in range(8):
                suma += digits[i] * coefs[i]
            verificador = (11 - (suma % 11)) % 11
            if verificador == 11:
                verificador = 0
            if verificador != digits[8]:
                return False
        else:
            return False
            
        # Para RUC de 13 dígitos, validar que el establecimiento final no sea 000
        if len(dni) == 13:
            if dni[10:] == '000':
                return False
                
        return True
    except Exception:
        return False

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
    
    # 5. Mapear identificación del comprador con validación y fallback inteligente
    buyer_dni = comprador_info.get('buyerDni', '').strip() if comprador_info else ''
    buyer_name = comprador_info.get('buyerName', 'CONSUMIDOR FINAL') if comprador_info else 'CONSUMIDOR FINAL'
    buyer_dni_type = '07'
    
    if validar_cedula_ruc_ecuador(buyer_dni):
        if len(buyer_dni) == 10:
            buyer_dni_type = '05'
        elif len(buyer_dni) == 13:
            buyer_dni_type = '04'
    else:
        # Si no es un DNI ecuatoriano válido, y no se trata de pasaporte con formato decente, fallback a Consumidor Final
        # Para pasaporte (tipo 06), permitimos longitud > 0 pero aplicamos validación de seguridad
        if buyer_dni and len(buyer_dni) >= 5 and buyer_dni != '9999999999999':
            # Asumimos que es pasaporte o DNI extranjero y no lo alteramos, asignándole tipo 06 (Pasaporte)
            buyer_dni_type = '06'
        else:
            print(f"[!] [SRI] Identificación de comprador inválida o extranjera ('{buyer_dni}'). Se aplica fallback automático a Consumidor Final.")
            buyer_dni = '9999999999999'
            buyer_dni_type = '07'
            buyer_name = 'CONSUMIDOR FINAL'
        
    comprador = {
        'tipoIdentificacionComprador': buyer_dni_type,
        'razonSocialComprador': buyer_name,
        'identificacionComprador': buyer_dni,
        'dirComprador': comprador_info.get('buyerCity', 'Quito') if comprador_info else 'Quito',
        'emailComprador': comprador_info.get('buyerEmail', '') if comprador_info else '',
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
    
    # 8. Enviar al WS de Recepción del SRI (con reintentos para mitigar caídas)
    ws_recepcion = sri_invoicing.WS_RECEPCION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_RECEPCION_PROD
    ws_autorizacion = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
    
    max_intentos = 3
    res_recepcion = None
    ultimo_error_recepcion = None
    
    for intento in range(1, max_intentos + 1):
        try:
            print(f"[+] [SRI] Enviando comprobante al Web Service de Recepción ({ambiente}) - Intento {intento}/{max_intentos}...")
            res_recepcion_soap = sri_invoicing.enviar_sri_soap(xml_firmado_b64, ws_recepcion)
            res_recepcion = sri_invoicing.parsear_respuesta_recepcion(res_recepcion_soap)
            ultimo_error_recepcion = None
            break
        except Exception as e:
            ultimo_error_recepcion = e
            print(f"[!] [SRI] Fallo en intento {intento}/{max_intentos} de Recepción: {e}")
            if intento < max_intentos:
                time.sleep(3)
                
    if ultimo_error_recepcion:
        print(f"[-] [SRI] Todos los {max_intentos} intentos al servicio de Recepción fallaron.")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_CONEXION_RECEPCION", error_msg=str(ultimo_error_recepcion), token=token, ref_code=reference_id)
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
    
    # 9. Consultar la autorización (con reintentos)
    res_autorizacion = None
    ultimo_error_autorizacion = None
    
    for intento in range(1, max_intentos + 1):
        try:
            print(f"[+] [SRI] Consultando autorización ({clave_acceso}) - Intento {intento}/{max_intentos}...")
            res_autorizacion_soap = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_autorizacion)
            res_autorizacion = sri_invoicing.parsear_respuesta_autorizacion(res_autorizacion_soap)
            ultimo_error_autorizacion = None
            break
        except Exception as e:
            ultimo_error_autorizacion = e
            print(f"[!] [SRI] Fallo en intento {intento}/{max_intentos} de Autorización: {e}")
            if intento < max_intentos:
                time.sleep(3)
                
    if ultimo_error_autorizacion:
        print(f"[-] [SRI] Todos los {max_intentos} intentos al servicio de Autorización fallaron.")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_CONEXION_AUTORIZACION", error_msg=str(ultimo_error_autorizacion), token=token, ref_code=reference_id)
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
