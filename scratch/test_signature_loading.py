import sys
import os
import json
import base64
from cryptography.hazmat.primitives.serialization import pkcs12

# Agregar ruta base
sys.path.append("/Users/sossa/IA/generador-licencias")

def verify_signature_decryption():
    backup_path = "/Users/sossa/IA/generador-licencias/sossa_backup_sincronizado.json"
    if not os.path.exists(backup_path):
        print(f"[-] No se encontró el archivo de respaldo local: {backup_path}")
        return
        
    try:
        with open(backup_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        config_str = data.get("sossa_producer_config")
        if not config_str:
            print("[-] No se encontró la configuración del productor en el respaldo.")
            return
            
        config = json.loads(config_str) if isinstance(config_str, str) else config_str
        
        p12_base64 = config.get('sriP12Base64')
        password = config.get('sriP12Password')
        
        if not p12_base64:
            print("[-] No hay firma electrónica (.p12) registrada en la configuración.")
            return
        if not password:
            print("[-] No hay contraseña registrada para la firma electrónica.")
            return
            
        print("[*] Intentando decodificar y validar la firma electrónica...")
        
        # Limpiar prefijo data URI si existe
        if p12_base64 and ',' in p12_base64:
            print("[+] Detectado prefijo de datos data URI. Removiendo...")
            p12_base64 = p12_base64.split(',', 1)[1]
            
        # 1. Decodificar Base64
        p12_data = base64.b64decode(p12_base64)
        print(f"[+] Decodificación Base64 exitosa. Tamaño binario real: {len(p12_data)} bytes.")
        
        # 2. Intentar cargar pkcs12 usando la contraseña
        try:
            private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(
                p12_data, 
                password.encode('utf-8')
            )
            print("[✅] ¡Éxito! La firma electrónica se cargó y desencriptó correctamente.")
            if certificate:
                print(f"    - Sujeto: {certificate.subject}")
                print(f"    - Emisor: {certificate.issuer}")
                print(f"    - Válido desde: {certificate.not_valid_before_utc if hasattr(certificate, 'not_valid_before_utc') else certificate.not_valid_before}")
                print(f"    - Válido hasta: {certificate.not_valid_after_utc if hasattr(certificate, 'not_valid_after_utc') else certificate.not_valid_after}")
        except Exception as e:
            print(f"[-] Error de desencriptación (contraseña incorrecta o archivo corrupto): {e}")
            
    except Exception as e:
        print(f"[-] Error durante la verificación: {e}")

if __name__ == "__main__":
    verify_signature_decryption()
