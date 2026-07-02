import sys
import os
import json

# Agregar ruta base
sys.path.append("/Users/sossa/IA/generador-licencias")

def inspect_config():
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
        
        print("\n=== Configuración de Facturación SRI del Productor ===")
        print(f"RUC: {config.get('sriRuc')}")
        print(f"Razón Social: {config.get('sriRazonSocial')}")
        print(f"Nombre Comercial: {config.get('sriNombreComercial')}")
        print(f"Ambiente: {'1 (Pruebas)' if config.get('sriAmbiente') == '1' else '2 (Producción)'}")
        print(f"Tiene firma electrónica cargada (.p12): {'SÍ' if config.get('sriP12Base64') else 'NO'}")
        if config.get('sriP12Base64'):
            print(f"Longitud de firma base64: {len(config.get('sriP12Base64'))} caracteres")
        print(f"Contraseña de firma: {'Cargada' if config.get('sriP12Password') else 'NO'}")
        
    except Exception as e:
        print(f"[-] Error al inspeccionar la configuración: {e}")

if __name__ == "__main__":
    inspect_config()
