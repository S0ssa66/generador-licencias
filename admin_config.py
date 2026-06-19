"""Configuración de admin y hashes de licencias — módulo extraído de server.py"""
import json
import os
import urllib.request
from server_utils import get_admin_token, resolve_backup_file

DIRECTORY = os.path.dirname(os.path.abspath(__file__))


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
