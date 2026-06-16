import os
import io
import re
import uuid
import math
import base64
import hashlib
import binascii
import datetime
import urllib.request
import urllib.error
from random import random
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes
from OpenSSL import crypto

# Constantes del estándar de firma digital
XMLNS = 'xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:etsi="http://uri.etsi.org/01903/v1.3.2#"'
MAX_LINE_SIZE = 76

# WS Endpoints de Pruebas del SRI
WS_RECEPCION_PRUEBAS = "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl"
WS_AUTORIZACION_PRUEBAS = "https://celcer.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl"

# WS Endpoints de Producción del SRI
WS_RECEPCION_PROD = "https://cel.sri.gob.ec/comprobantes-electronicos-ws/RecepcionComprobantesOffline?wsdl"
WS_AUTORIZACION_PROD = "https://cel.sri.gob.ec/comprobantes-electronicos-ws/AutorizacionComprobantesOffline?wsdl"


# --- FUNCIONES DE SOPORTE CRIPTOGRÁFICO Y XML ---

def c14n_xml(xml_str):
    """Canonicaliza un fragmento o documento XML de forma exacta usando xmllint."""
    import uuid
    import subprocess
    import os
    archivo_tmp = f'/tmp/c14n_{uuid.uuid4()}.xml'
    try:
        with open(archivo_tmp, 'w', encoding='utf-8') as f:
            f.write(xml_str)
        cmd = f'xmllint --c14n {archivo_tmp}'
        salida = subprocess.check_output(cmd, shell=True)
        return salida.decode('utf-8')
    finally:
        if os.path.exists(archivo_tmp):
            os.remove(archivo_tmp)

def format_xml_string(cad):
    cad = cad.replace('\n', '')
    cad = re.sub(' +', ' ', cad).replace('> ', '>').replace(' <', '<')
    return cad

def sha1_base64(txt_bytes):
    m = hashlib.sha1()
    m.update(txt_bytes)
    sha1_hex = m.hexdigest()
    sha1_bin = binascii.unhexlify(sha1_hex)
    return base64.b64encode(sha1_bin).decode('utf-8')

def p_obtener_aleatorio():
    return int(math.floor(random() * 999000) + 990)

def split_string_every_n(cad, n):
    res = [cad[i:i + n] for i in range(0, len(cad), n)]
    return '\n'.join(res)

def get_xml_nodo_final(xml_str):
    parser = etree.XMLParser(remove_blank_text=True)
    root = etree.fromstring(xml_str.strip().encode('utf-8'), parser)
    return '</{}>'.format(root.tag)

# --- PLANTILLAS XML DE FIRMA DIGITAL XAdES-BES ---

def get_signed_properties(signature_number, signed_properties_number, certificate_der_hash, serial_number, reference_id_number, issuer_name, signing_time):
    signed_properties = f"""
    <etsi:SignedProperties Id="Signature{signature_number}-SignedProperties{signed_properties_number}">
        <etsi:SignedSignatureProperties>
            <etsi:SigningTime>{signing_time}</etsi:SigningTime>
            <etsi:SigningCertificate>
                <etsi:Cert>
                    <etsi:CertDigest>
                        <ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
                        <ds:DigestValue>{certificate_der_hash}</ds:DigestValue>
                    </etsi:CertDigest>
                    <etsi:IssuerSerial>
                        <ds:X509IssuerName>{issuer_name}</ds:X509IssuerName>
                        <ds:X509SerialNumber>{serial_number}</ds:X509SerialNumber>
                    </etsi:IssuerSerial>
                </etsi:Cert>
            </etsi:SigningCertificate>
        </etsi:SignedSignatureProperties>
        <etsi:SignedDataObjectProperties>
            <etsi:DataObjectFormat ObjectReference="#Reference-ID-{reference_id_number}">
                <etsi:Description>contenido comprobante</etsi:Description>
                <etsi:MimeType>text/xml</etsi:MimeType>
            </etsi:DataObjectFormat>
        </etsi:SignedDataObjectProperties>
    </etsi:SignedProperties>"""
    return format_xml_string(signed_properties)

def get_key_info(certificate_number, certificateX509, modulus, exponent):
    key_info = f"""<ds:KeyInfo Id="Certificate{certificate_number}">
<ds:X509Data>
<ds:X509Certificate>
{certificateX509}
</ds:X509Certificate>
</ds:X509Data>
<ds:KeyValue>
<ds:RSAKeyValue>
<ds:Modulus>
{modulus}
</ds:Modulus>
<ds:Exponent>{exponent}</ds:Exponent>
</ds:RSAKeyValue>
</ds:KeyValue>
</ds:KeyInfo>"""
    return key_info

def get_signed_info(signed_info_number, signed_properties_id_number, sha1_signed_properties, certificate_number, sha1_certificado, reference_id_number, sha1_comprobante, signature_number, signed_properties_number):
    signed_info = f"""<ds:SignedInfo Id="Signature-SignedInfo{signed_info_number}">
<ds:CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
<ds:SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/>
<ds:Reference Id="SignedPropertiesID{signed_properties_id_number}" Type="http://uri.etsi.org/01903#SignedProperties" URI="#Signature{signature_number}-SignedProperties{signed_properties_number}">
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
<ds:DigestValue>{sha1_signed_properties}</ds:DigestValue>
</ds:Reference>
<ds:Reference URI="#Certificate{certificate_number}">
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
<ds:DigestValue>{sha1_certificado}</ds:DigestValue>
</ds:Reference>
<ds:Reference Id="Reference-ID-{reference_id_number}" URI="#comprobante">
<ds:Transforms>
<ds:Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/>
<ds:Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/>
</ds:Transforms>
<ds:DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/>
<ds:DigestValue>{sha1_comprobante}</ds:DigestValue>
</ds:Reference>
</ds:SignedInfo>"""
    return signed_info

def get_xades_bes(xmls, signature_number, signature_value_number, object_number, signed_info, signature, key_info, signed_properties):
    xades_bes = f"""<ds:Signature {xmls} Id="Signature{signature_number}">
{signed_info}
<ds:SignatureValue>
{signature}
</ds:SignatureValue>
{key_info}
<ds:Object Id="Signature{signature_number}-Object{object_number}"><etsi:QualifyingProperties Target="#Signature{signature_number}">{signed_properties}</etsi:QualifyingProperties></ds:Object></ds:Signature>"""
    return xades_bes

# --- LÓGICA DE FIRMADO DE COMPROBANTE ---

def firmar_xml_comprobante(xml_content, p12_bytes, password_str):
    """Firma digitalmente un XML con formato XAdES-BES en memoria."""
    # 1. Cargar llave y certificados válidos del archivo .p12
    password_bytes = password_str.encode('utf-8')
    private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(p12_bytes, password_bytes)
    
    # Validar caducidad
    if certificate.not_valid_after < datetime.datetime.now():
        raise ValueError("El certificado de firma electrónica ha caducado.")
        
    # Obtener el certificado OpenSSL para formatear los campos como issuer
    cert_der = certificate.public_bytes(serialization.Encoding.DER)
    cert_openssl = crypto.load_certificate(crypto.FILETYPE_ASN1, cert_der)
    certificate_der_hash = sha1_base64(cert_der)
    
    # Formatear el certificado X509 en Base64
    cert_pem = crypto.dump_certificate(crypto.FILETYPE_PEM, cert_openssl).decode('utf-8')
    cert_x509_clean = "".join(cert_pem.split("-----BEGIN CERTIFICATE-----")[1].split("-----END CERTIFICATE-----")[0].splitlines())
    certificateX509 = split_string_every_n(cert_x509_clean, MAX_LINE_SIZE)
    
    # Obtener Modulus y Exponente
    modulo_hex = '{:X}'.format(certificate.public_key().public_numbers().n)
    modulo_bytes = binascii.unhexlify(modulo_hex if len(modulo_hex) % 2 == 0 else '0' + modulo_hex)
    modulo = base64.b64encode(modulo_bytes).decode('latin-1')
    modulo = split_string_every_n(modulo, MAX_LINE_SIZE)
    
    exponente_hex = '{:X}'.format(certificate.public_key().public_numbers().e).zfill(6)
    exponente = base64.b64encode(binascii.unhexlify(exponente_hex)).decode('utf-8').strip()
    
    serial_number = cert_openssl.get_serial_number()
    
    # Formatear el Issuer Name conforme a RFC 4514 para compatibilidad XAdES
    issuer_name = certificate.issuer.rfc4514_string()
        
    # Canonicalizar el comprobante sin firma
    xml_no_header = c14n_xml(xml_content)
    sha1_comprobante = sha1_base64(xml_no_header.encode('utf-8'))
    
    # Generar números aleatorios para los IDs de firma
    certificate_number = p_obtener_aleatorio()
    signature_number = p_obtener_aleatorio()
    signed_properties_number = p_obtener_aleatorio()
    signed_info_number = p_obtener_aleatorio()
    signed_properties_id_number = p_obtener_aleatorio()
    reference_id_number = p_obtener_aleatorio()
    signature_value_number = p_obtener_aleatorio()
    object_number = p_obtener_aleatorio()
    
    signing_time = datetime.datetime.now().strftime("%Y-%m-%dT%H:%M:%S-05:00") # Zona horaria Ecuador
    
    # Generar SignedProperties y su hash
    signed_properties = get_signed_properties(
        signature_number, signed_properties_number, certificate_der_hash, serial_number,
        reference_id_number, issuer_name, signing_time
    )
    signed_properties_para_hash = signed_properties.replace('<etsi:SignedProperties', '<etsi:SignedProperties ' + XMLNS)
    signed_properties_para_hash = c14n_xml(signed_properties_para_hash)
    sha1_signed_properties = sha1_base64(signed_properties_para_hash.encode('utf-8'))
    
    # Generar KeyInfo y su hash
    key_info = get_key_info(certificate_number, certificateX509, modulo, exponente)
    key_info_para_hash = key_info.replace('<ds:KeyInfo', '<ds:KeyInfo ' + XMLNS)
    key_info_para_hash = c14n_xml(key_info_para_hash)
    sha1_certificado = sha1_base64(key_info_para_hash.encode('utf-8'))
    
    # Generar SignedInfo y firmarlo
    signed_info = get_signed_info(
        signed_info_number, signed_properties_id_number, sha1_signed_properties,
        certificate_number, sha1_certificado, reference_id_number, sha1_comprobante,
        signature_number, signed_properties_number
    )
    signed_info_para_firma = signed_info.replace('<ds:SignedInfo', '<ds:SignedInfo ' + XMLNS)
    signed_info_para_firma = c14n_xml(signed_info_para_firma)
    
    # Firmar usando la clave privada de cryptography nativa
    sign = private_key.sign(
        signed_info_para_firma.encode('utf-8'),
        padding.PKCS1v15(),
        hashes.SHA1()
    )
    signature = base64.b64encode(sign).decode('utf-8')
    signature = split_string_every_n(signature, MAX_LINE_SIZE)
    
    xades_bes = get_xades_bes(XMLNS, signature_number, signature_value_number, object_number, signed_info, signature, key_info, signed_properties)
    
    tail_tag = get_xml_nodo_final(xml_content)
    xml_firmado = xml_content.replace(tail_tag, xades_bes + tail_tag)
    
    return xml_firmado


# --- CÁLCULO DE CLAVE DE ACCESO SRI ecuador (49 dígitos) ---

def calcular_modulo11(clave_48):
    """Aplica el algoritmo Módulo 11 para obtener el dígito verificador del SRI."""
    factor = 2
    suma = 0
    for d in reversed(clave_48):
        suma += int(d) * factor
        factor += 1
        if factor > 7:
            factor = 2
            
    residuo = suma % 11
    verificador = 11 - residuo
    if verificador == 11:
        return 0
    elif verificador == 10:
        return 1
    else:
        return verificador

def generar_clave_acceso(fecha_emision, tipo_comprobante, ruc, ambiente, serie, secuencial, codigo_numerico="12345678"):
    """
    Genera la clave de acceso de 49 dígitos numéricos del SRI.
    Formatos:
      fecha_emision: datetime.date o string 'DDMMAAAA'
      tipo_comprobante: '01' (Factura)
      ruc: RUC emisor de 13 dígitos
      ambiente: '1' (Pruebas) o '2' (Producción)
      serie: '001001' (Estab + PtoEmi)
      secuencial: '000000001' (9 dígitos)
    """
    if isinstance(fecha_emision, (datetime.date, datetime.datetime)):
        fecha_str = fecha_emision.strftime("%d%m%Y")
    else:
        fecha_str = fecha_emision.replace("/", "").replace("-", "")
        
    ruc_clean = re.sub(r'\D', '', ruc)
    serie_clean = re.sub(r'\D', '', serie).zfill(6)
    secuencial_clean = re.sub(r'\D', '', secuencial).zfill(9)
    codigo_clean = re.sub(r'\D', '', str(codigo_numerico)).zfill(8)
    
    # 48 primeros dígitos
    clave_48 = f"{fecha_str}{tipo_comprobante}{ruc_clean}{ambiente}{serie_clean}{secuencial_clean}{codigo_clean}1"
    
    verificador = calcular_modulo11(clave_48)
    return f"{clave_48}{verificador}"


# --- COMUNICACIÓN SOAP CON SRI ---

def enviar_sri_soap(xml_firmado_b64, ws_url):
    """Envía un XML firmado codificado en base64 al WS de Recepción del SRI."""
    soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.recepcion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:validarComprobante>
         <xml>{xml_firmado_b64}</xml>
      </ec:validarComprobante>
   </soapenv:Body>
</soapenv:Envelope>"""
    
    req = urllib.request.Request(
        ws_url,
        data=soap_request.encode('utf-8'),
        headers={
            "Content-Type": "text/xml;charset=UTF-8",
            "SOAPAction": ""
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            response_xml = res.read().decode('utf-8')
            return response_xml
    except urllib.error.HTTPError as he:
        err_msg = he.read().decode('utf-8')
        raise RuntimeError(f"HTTP Error {he.code} del SRI: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"Error de red al conectar con SRI SOAP: {str(e)}")

def consultar_sri_autorizacion(clave_acceso, ws_url):
    """Consulta la autorización de un comprobante electrónico en el WS del SRI."""
    soap_request = f"""<?xml version="1.0" encoding="utf-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ec="http://ec.gob.sri.ws.autorizacion">
   <soapenv:Header/>
   <soapenv:Body>
      <ec:autorizacionComprobante>
         <claveAccesoComprobante>{clave_acceso}</claveAccesoComprobante>
      </ec:autorizacionComprobante>
   </soapenv:Body>
</soapenv:Envelope>"""
    
    req = urllib.request.Request(
        ws_url,
        data=soap_request.encode('utf-8'),
        headers={
            "Content-Type": "text/xml;charset=UTF-8",
            "SOAPAction": ""
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=15) as res:
            response_xml = res.read().decode('utf-8')
            return response_xml
    except urllib.error.HTTPError as he:
        err_msg = he.read().decode('utf-8')
        raise RuntimeError(f"HTTP Error {he.code} del SRI: {err_msg}")
    except Exception as e:
        raise RuntimeError(f"Error de red al consultar autorización SRI: {str(e)}")


# --- PARSEADORES DE RESPUESTA SOAP SRI ---

def parsear_respuesta_recepcion(soap_response):
    """Parsea la respuesta del Web Service de Recepción del SRI."""
    # Usar lxml para parsear namespaces SOAP
    try:
        root = etree.fromstring(soap_response.encode('utf-8'))
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'ns2': 'http://ec.gob.sri.ws.recepcion'
        }
        
        estado_nodes = root.xpath('//estado/text()', namespaces=namespaces)
        if not estado_nodes:
            # Fallback xpath genérico
            estado_nodes = root.xpath('//*[local-name()="estado"]/text()')
            
        estado = estado_nodes[0] if estado_nodes else 'ERROR'
        
        comprobantes = []
        comprobante_nodes = root.xpath('//*[local-name()="comprobante"]')
        for comp in comprobante_nodes:
            clave = comp.xpath('.//*[local-name()="claveAcceso"]/text()')
            clave = clave[0] if clave else ''
            
            mensajes = []
            mensaje_nodes = comp.xpath('.//*[local-name()="mensaje"]')
            for msg in mensaje_nodes:
                ident = msg.xpath('.//*[local-name()="identificador"]/text()')
                texto = msg.xpath('.//*[local-name()="mensaje"]/text()')
                info = msg.xpath('.//*[local-name()="informacionAdicional"]/text()')
                tipo = msg.xpath('.//*[local-name()="tipo"]/text()')
                
                mensajes.append({
                    "identificador": ident[0] if ident else '',
                    "mensaje": texto[0] if texto else '',
                    "infoAdicional": info[0] if info else '',
                    "tipo": tipo[0] if tipo else 'ERROR'
                })
            comprobantes.append({
                "claveAcceso": clave,
                "mensajes": mensajes
            })
            
        return {
            "estado": estado,
            "comprobantes": comprobantes
        }
    except Exception as e:
        return {"estado": "ERROR", "error": f"Error al parsear recepción: {str(e)}"}

def parsear_respuesta_autorizacion(soap_response):
    """Parsea la respuesta del Web Service de Autorización del SRI."""
    try:
        root = etree.fromstring(soap_response.encode('utf-8'))
        
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'ns2': 'http://ec.gob.sri.ws.autorizacion'
        }
        
        autorizacion_nodes = root.xpath('//*[local-name()="autorizacion"]')
        autorizaciones = []
        for aut in autorizacion_nodes:
            estado = aut.xpath('.//*[local-name()="estado"]/text()')
            numero_aut = aut.xpath('.//*[local-name()="numeroAutorizacion"]/text()')
            fecha_aut = aut.xpath('.//*[local-name()="fechaAutorizacion"]/text()')
            comprobante_xml = aut.xpath('.//*[local-name()="comprobante"]/text()')
            
            mensajes = []
            mensaje_nodes = aut.xpath('.//*[local-name()="mensaje"]')
            for msg in mensaje_nodes:
                ident = msg.xpath('.//*[local-name()="identificador"]/text()')
                texto = msg.xpath('.//*[local-name()="mensaje"]/text()')
                info = msg.xpath('.//*[local-name()="informacionAdicional"]/text()')
                tipo = msg.xpath('.//*[local-name()="tipo"]/text()')
                
                mensajes.append({
                    "identificador": ident[0] if ident else '',
                    "mensaje": texto[0] if texto else '',
                    "infoAdicional": info[0] if info else '',
                    "tipo": tipo[0] if tipo else 'ERROR'
                })
                
            autorizaciones.append({
                "estado": estado[0] if estado else 'ERROR',
                "numeroAutorizacion": numero_aut[0] if numero_aut else '',
                "fechaAutorizacion": fecha_aut[0] if fecha_aut else '',
                "comprobante": comprobante_xml[0] if comprobante_xml else '',
                "mensajes": mensajes
            })
            
        return {
            "numeroComprobantes": len(autorizaciones),
            "autorizaciones": autorizaciones
        }
    except Exception as e:
        return {"estado": "ERROR", "error": f"Error al parsear autorización: {str(e)}"}


# --- GENERADOR DE XML FACTURA v2.1.0 ---

def generar_xml_factura(emisor, comprador, items, secuencial, clave_acceso):
    """
    Genera el XML de la factura de acuerdo a la estructura oficial del SRI (v2.1.0).
    emisor: dict con llaves ruc, razonSocial, nombreComercial, dirMatriz, dirEstablecimiento, estab, ptoEmi, obligadoContabilidad, ambiente, sriRimpe, contribuyenteEspecial, agenteRetencion
    comprador: dict con llaves tipoIdentificacionComprador, razonSocialComprador, identificacionComprador, dirComprador, emailComprador, formaPago
    items: lista de dict con llaves codigoPrincipal, descripcion, cantidad, precioUnitario, descuento
    secuencial: string de 9 dígitos.
    clave_acceso: string de 49 dígitos.
    """
    import datetime
    
    # Limpieza de valores del comprador y emisor
    razon_social_comprador = comprador.get('razonSocialComprador', 'CONSUMIDOR FINAL')
    identificacion_comprador = comprador.get('identificacionComprador', '9999999999999')
    tipo_id_comprador = comprador.get('tipoIdentificacionComprador', '07')
    email_comprador = comprador.get('emailComprador', '')
    dir_comprador = comprador.get('dirComprador', 'Quito')
    forma_pago = comprador.get('formaPago', '20') # 20 = Otros con utilizacion del sistema financiero
    
    fecha_emision = datetime.datetime.now().strftime("%d/%m/%Y")
    
    # Calcular totales
    total_sin_impuestos = 0.0
    total_descuento = 0.0
    
    for item in items:
        cantidad = float(item.get('cantidad', 1))
        precio_uni = float(item.get('precioUnitario', 0.0))
        desc = float(item.get('descuento', 0.0))
        total_sin_impuestos += (cantidad * precio_uni)
        total_descuento += desc
        
    importe_total = total_sin_impuestos - total_descuento
    
    root = etree.Element("factura", id="comprobante", version="2.1.0")
    
    # infoTributaria
    info_trib = etree.SubElement(root, "infoTributaria")
    etree.SubElement(info_trib, "ambiente").text = str(emisor.get('ambiente', '1'))
    etree.SubElement(info_trib, "tipoEmision").text = "1" # Normal
    etree.SubElement(info_trib, "razonSocial").text = emisor.get('razonSocial', '')
    if emisor.get('nombreComercial'):
        etree.SubElement(info_trib, "nombreComercial").text = emisor.get('nombreComercial')
    etree.SubElement(info_trib, "ruc").text = emisor.get('ruc', '')
    etree.SubElement(info_trib, "claveAcceso").text = clave_acceso
    etree.SubElement(info_trib, "codDoc").text = "01" # Factura
    etree.SubElement(info_trib, "estab").text = str(emisor.get('estab', '001')).zfill(3)
    etree.SubElement(info_trib, "ptoEmi").text = str(emisor.get('ptoEmi', '001')).zfill(3)
    etree.SubElement(info_trib, "secuencial").text = str(secuencial).zfill(9)
    etree.SubElement(info_trib, "dirMatriz").text = emisor.get('dirMatriz', '')
    
    if emisor.get('contribuyenteEspecial'):
        etree.SubElement(info_trib, "contribuyenteEspecial").text = emisor.get('contribuyenteEspecial')
        
    # RIMPE tag en infoTributaria
    sri_rimpe = emisor.get('sriRimpe', 'no_rimpe')
    if sri_rimpe == 'rimpe_emprendedor' or sri_rimpe == 'RIMPE':
        etree.SubElement(info_trib, "contribuyenteRimpe").text = "CONTRIBUYENTE RÉGIMEN RIMPE"
    elif sri_rimpe == 'rimpe_popular':
        etree.SubElement(info_trib, "contribuyenteRimpe").text = "CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE"
        
    if emisor.get('agenteRetencion'):
        etree.SubElement(info_trib, "agenteRetencion").text = emisor.get('agenteRetencion')
        
    # infoFactura
    info_fact = etree.SubElement(root, "infoFactura")
    etree.SubElement(info_fact, "fechaEmision").text = fecha_emision
    etree.SubElement(info_fact, "dirEstablecimiento").text = emisor.get('dirEstablecimiento', emisor.get('dirMatriz', ''))
    
    etree.SubElement(info_fact, "obligadoContabilidad").text = emisor.get('obligadoContabilidad', 'NO').upper()
    etree.SubElement(info_fact, "tipoIdentificacionComprador").text = tipo_id_comprador
    etree.SubElement(info_fact, "razonSocialComprador").text = razon_social_comprador
    etree.SubElement(info_fact, "identificacionComprador").text = identificacion_comprador
    etree.SubElement(info_fact, "direccionComprador").text = dir_comprador
    etree.SubElement(info_fact, "totalSinImpuestos").text = f"{total_sin_impuestos:.2f}"
    etree.SubElement(info_fact, "totalDescuento").text = f"{total_descuento:.2f}"
    
    # totalConImpuestos
    total_con_imp = etree.SubElement(info_fact, "totalConImpuestos")
    total_imp = etree.SubElement(total_con_imp, "totalImpuesto")
    etree.SubElement(total_imp, "codigo").text = "2" # IVA
    etree.SubElement(total_imp, "codigoPorcentaje").text = "0" # IVA 0%
    etree.SubElement(total_imp, "baseImponible").text = f"{importe_total:.2f}"
    etree.SubElement(total_imp, "valor").text = "0.00"
    
    etree.SubElement(info_fact, "propina").text = "0.00"
    etree.SubElement(info_fact, "importeTotal").text = f"{importe_total:.2f}"
    etree.SubElement(info_fact, "moneda").text = "DOLAR"
    
    # pagos
    pagos = etree.SubElement(info_fact, "pagos")
    pago = etree.SubElement(pagos, "pago")
    etree.SubElement(pago, "formaPago").text = forma_pago
    etree.SubElement(pago, "total").text = f"{importe_total:.2f}"
    
    # detalles
    detalles = etree.SubElement(root, "detalles")
    for item in items:
        detalle = etree.SubElement(detalles, "detalle")
        etree.SubElement(detalle, "codigoPrincipal").text = item.get('codigoPrincipal', 'BEAT')
        etree.SubElement(detalle, "descripcion").text = item.get('descripcion', 'Licencia Musical')
        
        cant = float(item.get('cantidad', 1))
        p_uni = float(item.get('precioUnitario', 0.0))
        d_val = float(item.get('descuento', 0.0))
        p_total = (cant * p_uni) - d_val
        
        etree.SubElement(detalle, "cantidad").text = f"{cant:.2f}"
        etree.SubElement(detalle, "precioUnitario").text = f"{p_uni:.2f}"
        etree.SubElement(detalle, "descuento").text = f"{d_val:.2f}"
        etree.SubElement(detalle, "precioTotalSinImpuesto").text = f"{p_total:.2f}"
        
        # impuestos del detalle
        det_impuestos = etree.SubElement(detalle, "impuestos")
        det_imp = etree.SubElement(det_impuestos, "impuesto")
        etree.SubElement(det_imp, "codigo").text = "2"
        etree.SubElement(det_imp, "codigoPorcentaje").text = "0"
        etree.SubElement(det_imp, "tarifa").text = "0"
        etree.SubElement(det_imp, "baseImponible").text = f"{p_total:.2f}"
        etree.SubElement(det_imp, "valor").text = "0.00"
        
    # infoAdicional
    info_adicional = etree.SubElement(root, "infoAdicional")
    if email_comprador:
        campo = etree.SubElement(info_adicional, "campoAdicional", nombre="Email")
        campo.text = email_comprador
    if dir_comprador:
        campo = etree.SubElement(info_adicional, "campoAdicional", nombre="Direccion")
        campo.text = dir_comprador
    if sri_rimpe and sri_rimpe != 'no_rimpe':
        campo = etree.SubElement(info_adicional, "campoAdicional", nombre="Regimen")
        if sri_rimpe == 'rimpe_emprendedor' or sri_rimpe == 'RIMPE':
            campo.text = "Contribuyente Régimen RIMPE"
        elif sri_rimpe == 'rimpe_popular':
            campo.text = "Contribuyente Negocio Popular - Régimen RIMPE"
            
    # Retornar string XML decodificado con declaración xml
    xml_bytes = etree.tostring(root, xml_declaration=True, encoding="UTF-8", pretty_print=False)
    return xml_bytes.decode('utf-8')

