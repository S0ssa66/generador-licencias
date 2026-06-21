import json
import os

# Cargar .env manualmente si existe
env_path = "/Users/sossa/IA/generador-licencias/.env"
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                os.environ[key.strip()] = val.strip().strip("'\"")

filepath = "/Users/sossa/IA/generador-licencias/sossa_backup_sincronizado.json"
if os.path.exists(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    updated = False
    
    for key in ["sossa_producer_config", "paXbnNbHMMPC31X3hf0oTUx4bbr2_producer_config"]:
        if key in data:
            config = data[key]
            if isinstance(config, str):
                config = json.loads(config)
                is_str = True
            else:
                is_str = False
            
            # Update values from env
            config["paypalClientId"] = os.getenv("PAYPAL_CLIENT_ID", "")
            config["paypalClientSecret"] = os.getenv("PAYPAL_CLIENT_SECRET", "")
            
            if is_str:
                data[key] = json.dumps(config)
            else:
                data[key] = config
            updated = True
            print(f"[+] Updated {key}")
            
    if updated:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("[+] sossa_backup_sincronizado.json saved successfully.")
    else:
        print("[-] No config keys found to update.")
else:
    print("[-] Backup file not found!")
