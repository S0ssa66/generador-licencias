import os
import json
import re
import urllib.request
import urllib.parse
import urllib.error
import base64
import datetime
import time
import hashlib
import math
import sri_invoicing
import sri_ride
from server_utils import get_admin_token, resolve_backup_file
from sri_config import (
    SRI_PRIVATE_KEYS,
    load_local_private_config,
    migrate_legacy_backup_config,
    split_producer_config,
)

STORAGE_BUCKET = os.environ.get('FIREBASE_STORAGE_BUCKET', 'licencias-musicales.firebasestorage.app')


class SriReconciliationRequired(RuntimeError):
    """El envío pudo llegar al SRI; nunca emitir otra clave automáticamente."""


def _safe_storage_segment(value):
    return re.sub(r'[^A-Za-z0-9_-]', '', str(value or ''))[:160]


def upload_sri_artifact(producer_id, payment_id, filename, content, content_type, token):
    """Sube XML/RIDE autorizado a Storage privado, nunca como Base64 en Firestore."""
    producer = _safe_storage_segment(producer_id)
    payment = _safe_storage_segment(payment_id)
    name = _safe_storage_segment(filename)
    if not producer or not payment or not name or not isinstance(content, (bytes, bytearray)):
        raise ValueError('Datos inválidos para almacenar artefacto SRI.')
    if len(content) > 15 * 1024 * 1024:
        raise ValueError('El artefacto SRI supera el límite de 15 MB.')
    object_path = f'sri/{producer}/{payment}/{name}'
    upload_url = (
        f'https://firebasestorage.googleapis.com/v0/b/{STORAGE_BUCKET}/o'
        f'?uploadType=media&name={urllib.parse.quote(object_path, safe="")}'
    )
    request = urllib.request.Request(
        upload_url,
        data=bytes(content),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': content_type,
            'Cache-Control': 'private, no-store',
        },
        method='POST',
    )
    with urllib.request.urlopen(request) as response:
        if response.status not in (200, 201):
            raise RuntimeError(f'No se pudo almacenar el artefacto SRI ({response.status}).')
    return object_path


def _safe_int_env(name, default, minimum=1, maximum=60):
    try:
        value = int(os.environ.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(value, maximum))


def _read_ride_pdf_base64(path):
    """Lee el RIDE generado para permitir su entrega desde un backend remoto."""
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, 'rb') as handle:
            return base64.b64encode(handle.read()).decode('ascii')
    except OSError as exc:
        print(f"[-] [SRI] No se pudo leer el RIDE generado para almacenamiento: {exc}")
        return None


def _firestore_field_value(fields, key, default=''):
    """Extrae valores primitivos de un documento REST de Firestore."""
    field = (fields or {}).get(key, {}) or {}
    for value_key in ('stringValue', 'integerValue', 'doubleValue', 'booleanValue'):
        if value_key in field:
            return field[value_key]
    return default


def _mark_sri_job_done(payment_id, token):
    """Cierra el trabajo remoto cuando la cola local ya autorizó la factura."""
    if not token or not payment_id or str(payment_id).strip().lower() == 'undefined':
        return

    try:
        job_url = (
            "https://firestore.googleapis.com/v1/projects/licencias-musicales/"
            f"databases/(default)/documents/sriJobs/{payment_id}"
        )
        now = datetime.datetime.utcnow().isoformat() + 'Z'
        payload = {
            "fields": {
                "status": {"stringValue": "DONE"},
                "updatedAt": {"stringValue": now},
            }
        }
        query = "updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt"
        request = urllib.request.Request(
            f"{job_url}?{query}",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
            },
            method="PATCH",
        )
        with urllib.request.urlopen(request):
            print(f"[+] [SRI Queue] Trabajo remoto cerrado como DONE ({payment_id}).")
    except Exception as exc:
        # La autorización ya fue persistida; un fallo de este cierre no debe
        # volver a emitir la factura ni cambiarla a un estado fallido.
        print(f"[-] [SRI Queue] No se pudo cerrar el trabajo remoto ({payment_id}): {exc}")


def _payment_already_authorized(payment_id, token, producer_id=None):
    """Devuelve el estado SRI del pago aprobado y falla cerrado si no responde."""
    if not token or not payment_id:
        raise RuntimeError('No se puede verificar el pago SRI sin autenticación e ID.')
    url = (
        "https://firestore.googleapis.com/v1/projects/licencias-musicales/"
        f"databases/(default)/documents/payments/{urllib.parse.quote(str(payment_id), safe='')}"
    )
    request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            document = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            raise ValueError('No existe un pago aprobado para esta factura SRI.') from exc
        raise RuntimeError('No se pudo verificar el estado fiscal del pago.') from exc
    except Exception as exc:
        raise RuntimeError('No se pudo verificar el estado fiscal del pago.') from exc
    fields = document.get('fields', {})
    if _firestore_field_value(fields, 'status') != 'approved':
        raise ValueError('El pago todavía no está aprobado.')
    if producer_id and _firestore_field_value(fields, 'producerId') != producer_id:
        raise ValueError('El pago no pertenece al productor solicitado.')
    if _firestore_field_value(fields, 'providerLivemode', True) is False:
        raise ValueError('Un pago de prueba no se factura al SRI.')
    if str(_firestore_field_value(fields, 'reference') or payment_id).startswith('cs_test_'):
        raise ValueError('Una sesión de prueba no se factura al SRI.')
    return _firestore_field_value(fields, 'sriEstado')

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


def normalizar_identificacion_comprador(identificacion, nombre):
    """No transforma una cédula errónea en pasaporte ni cambia al comprador."""
    identificacion = str(identificacion or '').strip()
    nombre = str(nombre or '').strip()
    if validar_cedula_ruc_ecuador(identificacion):
        return ('05' if len(identificacion) == 10 else '04', identificacion, nombre)
    if identificacion == '9999999999999' and nombre.upper() == 'CONSUMIDOR FINAL':
        return ('07', identificacion, nombre)
    if not identificacion and nombre.upper() == 'CONSUMIDOR FINAL':
        return ('07', '9999999999999', nombre)
    if re.fullmatch(r'[A-Za-z0-9]{5,20}', identificacion) and re.search(r'[A-Za-z]', identificacion):
        return ('06', identificacion, nombre)
    raise ValueError('Identificación fiscal del comprador inválida; corrige sus datos antes de emitir.')


def validar_configuracion_emisor_sri(producer_config):
    """Valida los datos no secretos necesarios para construir una factura SRI.

    La interfaz hace una validación temprana, pero esta función es la autoridad
    del worker: también protege los trabajos creados por APIs, importaciones o
    configuraciones antiguas. Nunca incluye certificados ni contraseñas en el
    resultado.
    """
    config = producer_config or {}
    errors = []
    ruc = str(config.get('sriRuc') or '').strip()
    razon_social = str(config.get('sriRazonSocial') or '').strip()
    direccion = str(config.get('sriDirMatriz') or 'Quito - Ecuador').strip()
    estab = str(config.get('sriEstab') or '001').strip()
    pto_emi = str(config.get('sriPtoEmi') or '001').strip()
    ambiente = str(config.get('sriAmbiente') or '1').strip()
    rimpe = str(config.get('sriRimpe') or 'no_rimpe').strip()
    contabilidad = str(config.get('sriContabilidad') or 'NO').strip().upper()
    iva = str(config.get('sriIvaTarifa') or ('0' if rimpe == 'rimpe_popular' else '15')).strip().upper()
    proveedor = str(config.get('sriRucProveedor') or '').strip()

    if not validar_cedula_ruc_ecuador(ruc):
        errors.append('RUC del emisor inválido')
    if not razon_social:
        errors.append('razón social del emisor no configurada')
    if not direccion:
        errors.append('dirección de matriz no configurada')
    if not re.fullmatch(r'\d{3}', estab):
        errors.append('establecimiento inválido: debe tener 3 dígitos')
    if not re.fullmatch(r'\d{3}', pto_emi):
        errors.append('punto de emisión inválido: debe tener 3 dígitos')
    if ambiente not in {'1', '2'}:
        errors.append('ambiente SRI inválido: usa 1 (pruebas) o 2 (producción)')
    if rimpe not in {'no_rimpe', 'rimpe_popular', 'rimpe_emprendedor'}:
        errors.append('régimen SRI inválido')
    if contabilidad not in {'SI', 'NO'}:
        errors.append('obligación de contabilidad inválida')
    if iva not in sri_invoicing.IVA_TARIFFS:
        errors.append('tarifa IVA inválida')
    if proveedor and not validar_cedula_ruc_ecuador(proveedor):
        errors.append('RUC del proveedor tercero inválido')

    return errors

def actualizar_secuencial_sri(producer_id, nuevo_secuencial, token=None):
    """
    Actualiza el secuencial del SRI para el productor en Firestore y en el respaldo local.
    """
    if not token:
        token = get_admin_token()
        
    if token:
        try:
            url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/private_config/sri"
            
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
                clean_config, _ = split_producer_config(config_data)
                db_data[config_key] = json.dumps(clean_config, ensure_ascii=False)
                
                with open(backup_path, 'w', encoding='utf-8') as f:
                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                print(f"[+] [SRI DB] Secuencial del SRI incrementado a {nuevo_secuencial} en respaldo local para {producer_id} ({username}).")
    except Exception as e:
        print(f"[-] [SRI DB] Error al incrementar secuencial en respaldo local: {e}")


def _reservation_url(payment_id):
    safe_payment = _safe_storage_segment(payment_id)
    if not safe_payment or safe_payment != str(payment_id):
        raise ValueError('Referencia de pago inválida para el registro fiscal.')
    return ('https://firestore.googleapis.com/v1/projects/licencias-musicales/'
            f'databases/(default)/documents/sriReservations/{safe_payment}')


def _read_sri_reservation(payment_id, token):
    request = urllib.request.Request(_reservation_url(payment_id), headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            return json.loads(response.read().decode('utf-8'))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise RuntimeError('No se pudo comprobar la reserva fiscal.') from exc
    except Exception as exc:
        raise RuntimeError('No se pudo comprobar la reserva fiscal.') from exc


def _update_sri_reservation(payment_id, token, **values):
    fields = {key: {'stringValue': str(value)} for key, value in values.items()}
    params = [('updateMask.fieldPaths', key) for key in fields]
    params.append(('currentDocument.exists', 'true'))
    request = urllib.request.Request(
        f'{_reservation_url(payment_id)}?{urllib.parse.urlencode(params)}',
        data=json.dumps({'fields': fields}).encode('utf-8'),
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method='PATCH'
    )
    try:
        with urllib.request.urlopen(request, timeout=15):
            pass
    except Exception as exc:
        raise RuntimeError('No se pudo conservar el estado de la factura antes del envío.') from exc


def reservar_secuencial_sri(producer_id, payment_id, producer_config, private_config, token=None, max_attempts=6):
    """Reserva un secuencial una sola vez antes de firmar el XML.

    Firestore no ofrece incrementos condicionados desde su API REST simple. Por
    eso usamos compare-and-set sobre un contador privado y un documento de
    reserva por pago. Si un proceso cae después de incrementar el contador puede
    quedar un hueco, que es preferible a reutilizar un número fiscal. Una
    segunda ejecución del mismo pago recupera su reserva y no incrementa otra
    vez.
    """
    if not token:
        token = get_admin_token()
    if not token:
        raise RuntimeError('No hay credenciales de servicio para reservar el secuencial SRI.')

    safe_payment = _safe_storage_segment(payment_id)
    reservation_url = _reservation_url(payment_id)
    base = 'https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents'
    headers = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

    # La reserva es la fuente de verdad de idempotencia del número fiscal.
    existing_reservation = _read_sri_reservation(payment_id, token)
    if existing_reservation:
        fields = existing_reservation.get('fields', {})
        if _firestore_field_value(fields, 'producerId') != producer_id:
            raise SriReconciliationRequired('La reserva fiscal pertenece a otro productor.')
        if _firestore_field_value(fields, 'series') != f"{producer_config.get('sriEstab', '001')}{producer_config.get('sriPtoEmi', '001')}":
            raise SriReconciliationRequired('La serie de esta factura cambió; requiere revisión.')
        if _firestore_field_value(fields, 'status') != 'RESERVED':
            raise SriReconciliationRequired('Ya existe una clave fiscal preparada o enviada; revisa su resultado antes de reintentar.')
        reserved = _firestore_field_value(fields, 'sequence')
        if reserved:
            return int(reserved)
        raise SriReconciliationRequired('La reserva fiscal existente no tiene secuencial válido.')

    counter_url = f'{base}/users/{producer_id}/private_config/sri_sequence'
    try:
        configured_start = max(1, int(private_config.get('sriSecuencial', 1)))
    except (TypeError, ValueError):
        configured_start = 1
    serie = f"{producer_config.get('sriEstab', '001')}{producer_config.get('sriPtoEmi', '001')}"

    for _ in range(max_attempts):
        document = None
        fields = {}
        try:
            request = urllib.request.Request(counter_url, headers={'Authorization': f'Bearer {token}'})
            with urllib.request.urlopen(request, timeout=15) as response:
                document = json.loads(response.read().decode('utf-8'))
            fields = document.get('fields', {})
            current = int(_firestore_field_value(fields, 'nextSequence', str(configured_start)) or configured_start)
        except Exception:
            current = configured_start

        now = datetime.datetime.utcnow().replace(microsecond=0).isoformat() + 'Z'
        update_fields = {
            'nextSequence': {'integerValue': str(current + 1)},
            'updatedAt': {'stringValue': now},
            'lastReservedPaymentId': {'stringValue': safe_payment},
        }
        params = [('updateMask.fieldPaths', key) for key in update_fields]
        if document and document.get('updateTime'):
            params.append(('currentDocument.updateTime', document['updateTime']))
        else:
            params.append(('currentDocument.exists', 'false'))
        request = urllib.request.Request(
            f"{counter_url}?{urllib.parse.urlencode(params)}",
            data=json.dumps({'fields': update_fields}).encode('utf-8'),
            headers=headers,
            method='PATCH'
        )
        try:
            with urllib.request.urlopen(request, timeout=15):
                pass
        except Exception as exc:
            # Conflicto CAS: relee el contador. Otros errores no se silencian.
            if '409' in str(exc) or 'FAILED_PRECONDITION' in str(exc):
                continue
            raise RuntimeError(f'No se pudo reservar el secuencial SRI: {exc}') from exc

        reservation = {
            'paymentId': {'stringValue': safe_payment},
            'producerId': {'stringValue': str(producer_id)},
            'sequence': {'integerValue': str(current)},
            'series': {'stringValue': serie},
            'status': {'stringValue': 'RESERVED'},
            'reservedAt': {'stringValue': now},
        }
        try:
            reservation_params = [('currentDocument.exists', 'false')]
            reservation_request = urllib.request.Request(
                f"{reservation_url}?{urllib.parse.urlencode(reservation_params)}",
                data=json.dumps({'fields': reservation}).encode('utf-8'), headers=headers, method='PATCH'
            )
            with urllib.request.urlopen(reservation_request, timeout=15):
                pass
        except Exception as exc:
            # Otro intento del mismo pago pudo haber escrito la reserva. Leerla
            # evita firmar dos XML con números distintos para una operación.
            try:
                check = urllib.request.Request(reservation_url, headers={'Authorization': f'Bearer {token}'})
                with urllib.request.urlopen(check, timeout=15) as response:
                    existing = json.loads(response.read().decode('utf-8')).get('fields', {})
                reserved = _firestore_field_value(existing, 'sequence')
                if reserved and _firestore_field_value(existing, 'status') == 'RESERVED' and _firestore_field_value(existing, 'producerId') == producer_id:
                    return int(reserved)
            except Exception:
                pass
            raise RuntimeError(f'No se pudo persistir la reserva SRI: {exc}') from exc

        # Reflejar la reserva en el pago permite auditoría sin revelar la firma.
        persisted = actualizar_estado_factura_db(
            payment_id, producer_id, 'EN_PROCESO', secuencial=current,
            token=token, ref_code=payment_id
        )
        if not persisted:
            raise RuntimeError('La reserva quedó registrada, pero el pago no pudo actualizarse; revisión manual necesaria.')
        return current

    raise RuntimeError('No se pudo reservar el secuencial SRI por conflictos concurrentes.')

def actualizar_estado_factura_db(payment_id, producer_id, estado, clave_acceso=None, xml_autorizado=None, num_autorizacion=None, fecha_autorizacion=None, secuencial=None, ride_path=None, ride_pdf_b64=None, error_msg=None, token=None, ref_code=None, xml_storage_path=None, ride_storage_path=None, xml_sha256=None, ride_sha256=None, xml_size=None, ride_size=None):
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
    # Compatibilidad de lectura para facturas antiguas: los parámetros Base64
    # siguen existiendo, pero las nuevas autorizaciones usan Storage privado.
    if xml_storage_path:
        fields_to_update["sriXmlStoragePath"] = {"stringValue": xml_storage_path}
    if num_autorizacion:
        fields_to_update["sriNumeroAutorizacion"] = {"stringValue": num_autorizacion}
    if fecha_autorizacion:
        fields_to_update["sriFechaAutorizacion"] = {"stringValue": fecha_autorizacion}
    if secuencial:
        fields_to_update["sriSecuencialFactura"] = {"integerValue": str(secuencial)}
    if ride_path:
        fields_to_update["sriRidePath"] = {"stringValue": ride_path}
    if ride_storage_path:
        fields_to_update["sriRideStoragePath"] = {"stringValue": ride_storage_path}
    for name, value in (('sriXmlSha256', xml_sha256), ('sriRideSha256', ride_sha256)):
        if value:
            fields_to_update[name] = {'stringValue': value}
    for name, value in (('sriXmlSize', xml_size), ('sriRideSize', ride_size)):
        if value is not None:
            fields_to_update[name] = {'integerValue': str(value)}
    if error_msg:
        fields_to_update["sriErrorMensaje"] = {"stringValue": error_msg[:1000]}
        
    # Validar que el payment_id sea real
    is_valid_payment_id = payment_id and str(payment_id).strip() != "" and str(payment_id).lower() != "undefined"
    
    payment_updated = False
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
                # Nunca recrear un payment eliminado entre la verificación y
                # este PATCH: una factura no valida un cobro inexistente.
                full_url = f"{url}?{url_params}&currentDocument.exists=true"
                req = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                with urllib.request.urlopen(req) as response:
                    print(f"[+] [SRI DB] Pago {payment_id} actualizado con datos del SRI ({estado}) en Firestore.")
                    payment_updated = True

                    if estado == "AUTORIZADO":
                        _mark_sri_job_done(payment_id, token)
                    
                    # Disparar envío de correo al comprador si el estado es AUTORIZADO
                    if estado == "AUTORIZADO":
                        try:
                            # Obtener email del comprador leyendo el documento de pago
                            req_get = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
                            buyer_email = ""
                            with urllib.request.urlopen(req_get) as response_get:
                                pay_doc = json.loads(response_get.read().decode("utf-8"))
                                buyer_email = pay_doc.get("fields", {}).get("buyerEmail", {}).get("stringValue", "")
                            
                            if buyer_email:
                                from email_service import send_invoice_email
                                send_invoice_email(
                                    buyer_email=buyer_email,
                                    reference_id=ref_code or payment_id,
                                    xml_content=xml_autorizado,
                                    ride_filepath=ride_path
                                )
                        except Exception as mail_err:
                            print(f"[-] [SRI Email] Falló el proceso de envío de correo automático: {mail_err}")
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
                                if ride_storage_path: x['sriRideStoragePath'] = ride_storage_path
                                if error_msg: x['sriErrorMensaje'] = error_msg
                                if xml_storage_path:
                                    x['sriXmlStoragePath'] = xml_storage_path
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

    return payment_updated


def _persist_authorized_sri(payment_id, producer_id, reference_id, secuencial, clave_acceso, aut, token):
    """Recupera y entrega una autorización existente sin enviar otro XML al SRI."""
    xml_autorizado = aut.get('comprobante')
    if not xml_autorizado:
        raise SriReconciliationRequired('El SRI autorizó la clave, pero no devolvió XML recuperable.')
    secuencial_str = str(secuencial).zfill(9)
    target_dir = os.path.expanduser('~/Documents/Licencias')
    os.makedirs(target_dir, exist_ok=True)
    ride_filepath = os.path.join(target_dir, f'Factura_{secuencial_str}_{clave_acceso}.pdf')
    ride_bytes = None
    try:
        sri_ride.generar_ride_pdf(ride_filepath, xml_autorizado, aut)
        with open(ride_filepath, 'rb') as handle:
            ride_bytes = handle.read()
    except Exception as exc:
        print(f'[-] [SRI] No se pudo generar RIDE de una factura autorizada: {exc}')

    xml_bytes = xml_autorizado.encode('utf-8')
    xml_path = None
    ride_path = None
    try:
        xml_path = upload_sri_artifact(producer_id, payment_id, f'Factura_{secuencial_str}.xml', xml_bytes, 'application/xml', token)
    except Exception as exc:
        print(f'[-] [SRI] No se pudo almacenar XML autorizado: {exc}')
    if ride_bytes:
        try:
            ride_path = upload_sri_artifact(producer_id, payment_id, f'Factura_{secuencial_str}.pdf', ride_bytes, 'application/pdf', token)
        except Exception as exc:
            print(f'[-] [SRI] No se pudo almacenar RIDE autorizado: {exc}')

    ready = bool(xml_path and ride_path)
    state = 'AUTORIZADO' if ready else 'AUTORIZADO_ENTREGA_PENDIENTE'
    persisted = actualizar_estado_factura_db(
        payment_id, producer_id, state,
        clave_acceso=clave_acceso, xml_autorizado=xml_autorizado,
        num_autorizacion=aut.get('numeroAutorizacion'),
        fecha_autorizacion=aut.get('fechaAutorizacion'),
        secuencial=secuencial, ride_path=ride_filepath if ready else None,
        token=token, ref_code=reference_id,
        xml_storage_path=xml_path, ride_storage_path=ride_path,
        xml_sha256=hashlib.sha256(xml_bytes).hexdigest() if xml_path else None,
        ride_sha256=hashlib.sha256(ride_bytes).hexdigest() if ride_path else None,
        xml_size=len(xml_bytes) if xml_path else None,
        ride_size=len(ride_bytes) if ride_path else None,
        error_msg=None if ready else 'Autorizada por el SRI; falta almacenar XML o RIDE para habilitar la descarga.'
    )
    if not persisted:
        raise SriReconciliationRequired('La factura está autorizada, pero no se pudo guardar el estado del pago.')
    return state


def _reconcile_sri_reservation(payment_id, producer_id, producer_config, fields, token):
    """Consulta la misma clave de acceso; nunca vuelve a SOAP Recepción."""
    key = _firestore_field_value(fields, 'accessKey')
    sequence = _firestore_field_value(fields, 'sequence')
    if not key or not sequence:
        raise SriReconciliationRequired('Reserva fiscal incompleta; requiere revisión manual.')
    ambiente = str(producer_config.get('sriAmbiente') or '1')
    ws = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
    try:
        soap = sri_invoicing.consultar_sri_autorizacion(key, ws)
        autorizaciones = sri_invoicing.parsear_respuesta_autorizacion(soap).get('autorizaciones', [])
    except Exception as exc:
        raise SriReconciliationRequired('No se pudo consultar la clave fiscal previa; no se volverá a emitir.') from exc
    aut = next((item for item in autorizaciones if item.get('estado') == 'AUTORIZADO'), None)
    if not aut:
        raise SriReconciliationRequired('La clave fiscal anterior aún no está autorizada; necesita revisión sin reenvío.')
    _update_sri_reservation(payment_id, token, status='AUTHORIZED')
    return _persist_authorized_sri(payment_id, producer_id, payment_id, int(sequence), key, aut, token)


def emitir_factura_sri_background(reference_id, producer_id):
    """
    Función que corre en un hilo secundario para procesar la facturación electrónica del SRI de forma asíncrona.
    """
    token = get_admin_token()

    prior_state = _payment_already_authorized(reference_id, token, producer_id)
    if prior_state == 'AUTORIZADO':
        print(f"[=] [SRI] La transacción {reference_id} ya tiene factura autorizada; se omite duplicado.")
        return
    
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
            
            url_priv = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/private_config/sri"
            try:
                req_priv = urllib.request.Request(url_priv, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req_priv) as res:
                    doc_priv = json.loads(res.read().decode('utf-8'))
                    fields = doc_priv.get('fields', {})
                    for k, v in fields.items():
                        private_config[k] = v.get('stringValue', '')
            except Exception:
                # Compatibilidad temporal con configuraciones creadas antes de
                # separar la firma; el endpoint de configuración las migra al
                # primer acceso autenticado y luego esta ruta deja de usarse.
                legacy_url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/private_config/producer"
                req_legacy = urllib.request.Request(legacy_url, headers={"Authorization": f"Bearer {token}"})
                with urllib.request.urlopen(req_legacy) as res:
                    doc_priv = json.loads(res.read().decode('utf-8'))
                    fields = doc_priv.get('fields', {})
                    for k, v in fields.items():
                        private_config[k] = v.get('stringValue', '')
        except Exception as e:
            print(f"[-] [SRI] Error al obtener config de Firestore para {producer_id}: {e}")
            
    # El backup antiguo podía contener las credenciales SRI mezcladas con los
    # datos públicos. Se migra una sola vez a un archivo local ignorado por Git
    # y nunca se vuelve a usar ese backup como almacén de secretos.
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
                public_local, migrated_private, migration_needed = migrate_legacy_backup_config(local_config, producer_id)
                producer_config.update(public_local)
                private_config.update(migrated_private)
                if migration_needed:
                    db_data[config_key] = json.dumps(public_local, ensure_ascii=False)
                    with open(backup_path, 'w', encoding='utf-8') as handle:
                        json.dump(db_data, handle, indent=2, ensure_ascii=False)
                    print(f"[+] [SRI] Configuración privada migrada fuera del backup local para {producer_id}.")
        except Exception as e:
            print(f"[-] [SRI] Error al leer config del respaldo local: {e}")

    # Permite usar una firma local que no proviene de Firestore sin ponerla en
    # localStorage ni en la configuración pública.
    private_config = {**load_local_private_config(producer_id), **private_config}
            
    # Los datos fiscales se guardan en private_config. La mezcla conserva
    # compatibilidad con documentos heredados mientras se completa la migración.
    producer_config = {**producer_config, **private_config}
    ruc_emisor = producer_config.get('sriRuc')
    p12_b64 = private_config.get('sriP12Base64')
    p12_password = os.environ.get("SRI_FIRMA_PASSWORD") or private_config.get('sriP12Password')
    
    prior_reservation = _read_sri_reservation(reference_id, token)
    if prior_reservation:
        prior_fields = prior_reservation.get('fields', {})
        if _firestore_field_value(prior_fields, 'status') != 'RESERVED':
            _reconcile_sri_reservation(reference_id, producer_id, producer_config, prior_fields, token)
            return
    elif prior_state == 'AUTORIZADO_ENTREGA_PENDIENTE':
        # No cambiar el estado autorizado si falta el registro de reserva.
        # El worker cerrará la tarea para revisión, sin emitir una segunda clave.
        raise SriReconciliationRequired('Factura autorizada sin reserva fiscal recuperable; requiere revisión manual.')

    if not ruc_emisor or not p12_b64 or not p12_password:
        print(f"[!] [SRI] Facturación SRI no configurada o incompleta para el productor {producer_id} (falta RUC, P12 o contraseña). Se omite la factura.")
        # No dejes el trabajo remoto en PENDING indefinidamente: el historial
        # podrá mostrar el motivo y el usuario podrá reintentarlo después de
        # completar la configuración fiscal.
        actualizar_estado_factura_db(
            reference_id,
            producer_id,
            "NO_CONFIGURADO",
            error_msg="Configura el RUC, el certificado .p12/.pfx y su contraseña para emitir la factura SRI.",
            token=token,
            ref_code=reference_id,
        )
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
                        'buyerEmail': x.get('buyerEmail') or form_data.get('buyerEmail') or '',
                        'buyerDni': form_data.get('buyerId') or '',
                        'buyerCity': form_data.get('buyerCity') or 'Quito',
                        'buyerCountry': form_data.get('buyerCountry') or 'Ecuador',
                        'payment_id': x.get('id'),
                        'payment_method': x.get('paymentMethod') or x.get('method') or x.get('payment_method') or 'otros'
                    }
    except Exception as e:
        print(f"[-] [SRI] Error al cargar detalles de transacción desde respaldo local: {e}")
        
    # La fuente fiscal de comprador y valor es siempre el pago aprobado. Los
    # respaldos locales/las licencias pueden estar desactualizados o editados.
    # Cada pago BEATSS corresponde a una línea de licencia, incluso en carritos.
    payment_url = ("https://firestore.googleapis.com/v1/projects/licencias-musicales/"
                   f"databases/(default)/documents/payments/{urllib.parse.quote(str(reference_id), safe='')}")
    try:
        with urllib.request.urlopen(urllib.request.Request(payment_url, headers={'Authorization': f'Bearer {token}'}), timeout=15) as response:
            payment_doc = json.loads(response.read().decode('utf-8'))
        payment_fields = payment_doc.get('fields', {})
        amount = _firestore_field_value(payment_fields, 'finalPrice')
        if amount in (None, ''):
            amount = _firestore_field_value(payment_fields, 'price')
        amount = float(amount)
        if not math.isfinite(amount) or amount <= 0:
            raise ValueError('El pago no tiene un importe válido para facturar.')
        items_para_factura = [{
            'codigoPrincipal': str(_firestore_field_value(payment_fields, 'beatId', 'BEAT'))[:25],
            'descripcion': f"{_firestore_field_value(payment_fields, 'beatName', 'Beat')} - Licencia {str(_firestore_field_value(payment_fields, 'licenseType', 'basic')).upper()}",
            'cantidad': 1.0, 'precioUnitario': amount, 'descuento': 0.0
        }]
        comprador_info = {
            'buyerName': _firestore_field_value(payment_fields, 'buyerName', 'CONSUMIDOR FINAL'),
            'buyerEmail': _firestore_field_value(payment_fields, 'buyerEmail', ''),
            'buyerDni': _firestore_field_value(payment_fields, 'buyerDni', ''),
            'buyerCity': _firestore_field_value(payment_fields, 'buyerCity', 'Quito'),
            'buyerCountry': _firestore_field_value(payment_fields, 'buyerCountry', 'Ecuador'),
            'payment_id': reference_id,
            'payment_method': _firestore_field_value(payment_fields, 'paymentMethod') or _firestore_field_value(payment_fields, 'method') or 'otros'
        }
    except Exception as exc:
        raise RuntimeError('No se pudo verificar los datos del pago para facturar; se reintentará sin enviar XML.') from exc

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
                        'buyerEmail': fields.get('buyerEmail', {}).get('stringValue') or form_data_rest.get('buyerEmail', {}).get('stringValue') or '',
                        'buyerDni': form_data_rest.get('buyerId', {}).get('stringValue') or '',
                        'buyerCity': form_data_rest.get('buyerCity', {}).get('stringValue') or 'Quito',
                        'buyerCountry': form_data_rest.get('buyerCountry', {}).get('stringValue') or 'Ecuador',
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

    # Las compras PayPal confirmadas por la función serverless se guardan en
    # `payments/{paymentId}` y no pasan por el historial local ni por
    # `users/{uid}/licencias`. El worker usa el paymentId como referencia para
    # que la facturación siga funcionando aunque el usuario cambie de equipo.
    if not items_para_factura and token:
        try:
            payment_url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{reference_id}"
            payment_req = urllib.request.Request(payment_url, headers={"Authorization": f"Bearer {token}"})
            with urllib.request.urlopen(payment_req) as res:
                payment_doc = json.loads(res.read().decode('utf-8'))
            payment_fields = payment_doc.get('fields', {})
            payment_producer = _firestore_field_value(payment_fields, 'producerId')
            if payment_producer and payment_producer != producer_id:
                raise ValueError('El pago no pertenece al productor solicitado')

            beat_id = _firestore_field_value(payment_fields, 'beatId', 'BEAT')
            beat_name = _firestore_field_value(payment_fields, 'beatName', 'Beat')
            license_type = _firestore_field_value(payment_fields, 'licenseType', 'basic')
            raw_price = _firestore_field_value(payment_fields, 'finalPrice', '')
            if raw_price in ('', None):
                raw_price = _firestore_field_value(payment_fields, 'price', '0')
            price = float(raw_price or 0)
            items_para_factura.append({
                'codigoPrincipal': str(beat_id or 'BEAT')[:25],
                'descripcion': f"{beat_name or 'Beat'} - Licencia {str(license_type or 'basic').upper()}",
                'cantidad': 1.0,
                'precioUnitario': price,
                'descuento': 0.0
            })
            comprador_info = {
                'buyerName': _firestore_field_value(payment_fields, 'buyerName', 'CONSUMIDOR FINAL'),
                'buyerEmail': _firestore_field_value(payment_fields, 'buyerEmail', ''),
                'buyerDni': _firestore_field_value(payment_fields, 'buyerDni', ''),
                'buyerCity': _firestore_field_value(payment_fields, 'buyerCity', 'Quito'),
                'buyerCountry': _firestore_field_value(payment_fields, 'buyerCountry', 'Ecuador'),
                        'payment_id': reference_id,
                        'payment_method': _firestore_field_value(payment_fields, 'paymentMethod') or _firestore_field_value(payment_fields, 'method') or _firestore_field_value(payment_fields, 'payment_method') or 'otros'
            }
            print(f"[+] [SRI] Pago {reference_id} obtenido desde Firestore para facturación.")
        except Exception as payment_error:
            # Un 404 aquí significa que la referencia antigua no es un
            # paymentId; se conserva el comportamiento de contingencia local.
            print(f"[-] [SRI] Error al buscar pago {reference_id} en Firestore: {payment_error}")
                
    if not items_para_factura:
        print(f"[-] [SRI] No se encontraron ítems para la referencia {reference_id} en local ni en Firestore. Cancelando facturación.")
        actualizar_estado_factura_db(
            reference_id,
            producer_id,
            "ERROR_DATOS",
            error_msg="No se encontraron los datos de la licencia o del pago para generar la factura.",
            token=token,
            ref_code=reference_id,
        )
        return
        
    payment_id = comprador_info.get('payment_id') if comprador_info else None

    # No enviar al SRI una factura con datos fiscales incompletos. El XML
    # puede tener la forma correcta y aun así ser rechazado por un RUC inválido
    # o por faltar la razón social del emisor.
    ruc_proveedor = str(producer_config.get('sriRucProveedor') or '').strip()
    config_errors = validar_configuracion_emisor_sri(producer_config)
    if config_errors:
        config_error = '; '.join(config_errors)
        print(f"[!] [SRI] Configuración fiscal inválida: {config_error}")
        actualizar_estado_factura_db(payment_id, producer_id, "ERROR_CONFIG", error_msg=config_error, token=token, ref_code=reference_id)
        return
    
    # 3. Reservar el secuencial antes de firmar. La reserva con CAS impide que
    # dos workers emitan el mismo número cuando reciben el mismo pago o cuando
    # se solapan dos pedidos distintos.
    try:
        secuencial = reservar_secuencial_sri(
            producer_id,
            payment_id or reference_id,
            producer_config,
            private_config,
            token=token,
        )
    except SriReconciliationRequired as exc:
        actualizar_estado_factura_db(
            payment_id, producer_id, 'ERROR_REQUIERE_REVISION',
            error_msg=str(exc), token=token, ref_code=reference_id
        )
        return
    except Exception as exc:
        print(f"[-] [SRI] No se pudo reservar secuencial: {exc}")
        actualizar_estado_factura_db(
            payment_id, producer_id, 'ERROR_SECUENCIAL', error_msg=str(exc),
            token=token, ref_code=reference_id
        )
        return
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
        secuencial=secuencial_str,
        codigo_numerico=sri_invoicing.codigo_numerico_desde_referencia(reference_id)
    )
    
    # 5. Validar la identidad fiscal antes de firmar y enviar. Nunca convertir
    # una cédula/RUC inválidos en pasaporte o consumidor final por inferencia.
    buyer_dni = comprador_info.get('buyerDni', '').strip() if comprador_info else ''
    buyer_name = comprador_info.get('buyerName', 'CONSUMIDOR FINAL') if comprador_info else 'CONSUMIDOR FINAL'
    try:
        buyer_dni_type, buyer_dni, buyer_name = normalizar_identificacion_comprador(buyer_dni, buyer_name)
    except ValueError as exc:
        actualizar_estado_factura_db(
            payment_id, producer_id, 'ERROR_DATOS', error_msg=str(exc),
            token=token, ref_code=reference_id
        )
        return
        
    comprador = {
        'tipoIdentificacionComprador': buyer_dni_type,
        'razonSocialComprador': buyer_name,
        'identificacionComprador': buyer_dni,
        'dirComprador': (comprador_info.get('buyerCity') or 'Quito') if comprador_info else 'Quito',
        'emailComprador': comprador_info.get('buyerEmail', '') if comprador_info else '',
        'formaPago': sri_invoicing.normalizar_forma_pago_sri(comprador_info.get('payment_method'))
    }
    
    # 6. Generar XML de factura
    try:
        emisor_adaptado = {
            'ruc': producer_config.get('sriRuc', ruc_emisor),
            'razonSocial': producer_config.get('sriRazonSocial', ''),
            'nombreComercial': producer_config.get('sriNombreComercial', ''),
            'dirMatriz': producer_config.get('sriDirMatriz') or 'Quito - Ecuador',
            'estab': producer_config.get('sriEstab', '001'),
            'ptoEmi': producer_config.get('sriPtoEmi', '001'),
            'ambiente': producer_config.get('sriAmbiente', '1'),
            'sriRimpe': producer_config.get('sriRimpe', 'no_rimpe'),
            'obligadoContabilidad': producer_config.get('sriContabilidad', 'NO'),
            'contribuyenteEspecial': producer_config.get('sriContribuyenteEspecial', ''),
            'agenteRetencion': producer_config.get('sriAgenteRetencion', ''),
            'ivaTarifa': producer_config.get('sriIvaTarifa') or (
                '0' if producer_config.get('sriRimpe') == 'rimpe_popular' else '15'
            ),
            'ivaIncluido': producer_config.get('sriIvaIncluido', True),
            'rucProveedor': ruc_proveedor
        }
        xml_factura = sri_invoicing.generar_xml_factura(
            emisor=emisor_adaptado,
            comprador=comprador,
            items=items_para_factura,
            secuencial=secuencial_str,
            clave_acceso=clave_acceso
        )
        sri_invoicing.validar_xml_factura_basico(xml_factura)
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

    # Los bytes exactos firmados y la clave se conservan antes de contactar al
    # SRI. Si el proceso cae tras enviar, un nuevo worker ve SENDING y se
    # detiene para reconciliar por la misma clave, sin crear otro XML.
    try:
        signed_bytes = xml_firmado.encode('utf-8')
        signed_path = upload_sri_artifact(
            producer_id, payment_id or reference_id,
            f'Factura_{secuencial_str}_firmada.xml', signed_bytes,
            'application/xml', token
        )
        _update_sri_reservation(
            payment_id or reference_id, token, status='SIGNED_READY',
            accessKey=clave_acceso, emissionDate=fecha_emision_dt.strftime('%Y-%m-%d'),
            signedXmlStoragePath=signed_path,
            signedXmlSha256=hashlib.sha256(signed_bytes).hexdigest(),
        )
        _update_sri_reservation(payment_id or reference_id, token, status='SENDING')
    except Exception as exc:
        actualizar_estado_factura_db(
            payment_id, producer_id, 'ERROR_PREPARACION',
            error_msg='No se pudo conservar el XML firmado antes de enviarlo.',
            token=token, ref_code=reference_id
        )
        print(f'[-] [SRI] Preparación durable fallida: {exc}')
        return
    
    # 8. Una sola llamada a Recepción: un timeout no prueba que el SRI no la
    # recibió. Los siguientes ciclos sólo consultan Autorización por clave.
    ws_recepcion = sri_invoicing.WS_RECEPCION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_RECEPCION_PROD
    ws_autorizacion = sri_invoicing.WS_AUTORIZACION_PRUEBAS if ambiente == '1' else sri_invoicing.WS_AUTORIZACION_PROD
    
    try:
        print(f"[+] [SRI] Enviando comprobante al Web Service de Recepción ({ambiente})...")
        res_recepcion_soap = sri_invoicing.enviar_sri_soap(xml_firmado_b64, ws_recepcion)
        res_recepcion = sri_invoicing.parsear_respuesta_recepcion(res_recepcion_soap)
    except Exception as exc:
        print(f"[-] [SRI] Resultado de Recepción incierto: {exc}")
        actualizar_estado_factura_db(
            payment_id, producer_id, 'EN_CONCILIACION',
            error_msg='La respuesta de Recepción no llegó; se consultará la clave fiscal sin reenviar XML.',
            token=token, ref_code=reference_id
        )
        return
        
    estado_recepcion = res_recepcion.get('estado')
    if estado_recepcion != 'RECIBIDA':
        msgs = res_recepcion.get('comprobantes', [{}])[0].get('mensajes', [])
        err_msg = "; ".join([m.get('mensaje') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else "Comprobante devuelto o con errores estructurados."
        print(f"[-] [SRI] Factura rechazada por SRI en Recepción: {estado_recepcion}. Motivo: {err_msg}")
        actualizar_estado_factura_db(payment_id, producer_id, "RECHAZADO_RECEPCION", error_msg=err_msg, token=token, ref_code=reference_id)
        return
    _update_sri_reservation(payment_id or reference_id, token, status='RECEIVED')
        
    auth_wait_seconds = _safe_int_env('SRI_AUTH_WAIT_SECONDS', 5, minimum=1, maximum=120)
    auth_poll_delay = _safe_int_env('SRI_AUTH_POLL_DELAY_SECONDS', 5, minimum=1, maximum=120)
    auth_poll_attempts = _safe_int_env('SRI_AUTH_POLL_ATTEMPTS', 5, minimum=1, maximum=12)
    print(f"[+] [SRI] Factura RECIBIDA por SRI. Esperando {auth_wait_seconds} segundos para consultar autorización...")
    time.sleep(auth_wait_seconds)
    
    # 9. Consultar la autorización (con reintentos)
    res_autorizacion = None
    ultimo_error_autorizacion = None
    
    for intento in range(1, auth_poll_attempts + 1):
        try:
            print(f"[+] [SRI] Consultando autorización ({clave_acceso}) - Intento {intento}/{auth_poll_attempts}...")
            res_autorizacion_soap = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_autorizacion)
            res_autorizacion = sri_invoicing.parsear_respuesta_autorizacion(res_autorizacion_soap)
            ultimo_error_autorizacion = None
            break
        except Exception as e:
            ultimo_error_autorizacion = e
            print(f"[!] [SRI] Fallo en intento {intento}/{auth_poll_attempts} de Autorización: {e}")
            if intento < auth_poll_attempts:
                time.sleep(auth_poll_delay)
                
    if ultimo_error_autorizacion:
        print(f"[-] [SRI] Todos los {auth_poll_attempts} intentos al servicio de Autorización fallaron. Encolando en contingencia local...")
        import sri_contingency
        sri_contingency.save_to_queue(
            purchase_id=reference_id,
            user_uid=producer_id,
            xml_firmado=xml_firmado,
            clave_acceso=clave_acceso,
            secuencial=secuencial,
            status='PENDING_AUTORIZACION',
            error_msg=str(ultimo_error_autorizacion)
        )
        actualizar_estado_factura_db(payment_id, producer_id, "CONTINGENCIA", error_msg=f"Error Autorizacion (En cola local): {str(ultimo_error_autorizacion)}", token=token, ref_code=reference_id)
        return
        
    autorizaciones = res_autorizacion.get('autorizaciones', [])
    if not autorizaciones:
        print(f"[*] [SRI] La autorización aún no está disponible. Se conserva en la cola para el worker.")
        import sri_contingency
        sri_contingency.save_to_queue(
            purchase_id=reference_id,
            user_uid=producer_id,
            xml_firmado=xml_firmado,
            clave_acceso=clave_acceso,
            secuencial=secuencial,
            status='PENDING_AUTORIZACION',
            error_msg="Autorización aún pendiente en el SRI."
        )
        actualizar_estado_factura_db(payment_id, producer_id, "PENDIENTE_AUTORIZACION", error_msg="Autorización aún pendiente en el SRI.", token=token, ref_code=reference_id)
        return
        
    aut = autorizaciones[0]
    estado_aut = aut.get('estado')
    
    if estado_aut == 'AUTORIZADO':
        num_aut = aut.get('numeroAutorizacion')
        _update_sri_reservation(payment_id or reference_id, token, status='AUTHORIZED')
        print(f"✅ [SRI] Factura AUTORIZADA exitosamente. Autorización Nro: {num_aut}")
        _persist_authorized_sri(payment_id or reference_id, producer_id, reference_id,
                                secuencial, clave_acceso, aut, token)
    else:
        msgs = aut.get('mensajes', [])
        err_msg = "; ".join([m.get('mensaje', '') + " (" + m.get('infoAdicional', '') + ")" for m in msgs]) if msgs else f"No autorizado ({estado_aut or 'sin estado'})."
        print(f"[-] [SRI] Factura NO AUTORIZADA por el SRI. Estado: {estado_aut}. Motivo: {err_msg}")
        if estado_aut in {'PPR', 'PENDIENTE', 'PROCESSING', 'EN_PROCESO'}:
            import sri_contingency
            sri_contingency.save_to_queue(
                purchase_id=reference_id,
                user_uid=producer_id,
                xml_firmado=xml_firmado,
                clave_acceso=clave_acceso,
                secuencial=secuencial,
                status='PENDING_AUTORIZACION',
                error_msg=err_msg
            )
            actualizar_estado_factura_db(payment_id, producer_id, "PENDIENTE_AUTORIZACION", error_msg=err_msg, token=token, ref_code=reference_id)
        else:
            actualizar_estado_factura_db(payment_id, producer_id, "RECHAZADO_AUTORIZACION", error_msg=err_msg, token=token, ref_code=reference_id)
