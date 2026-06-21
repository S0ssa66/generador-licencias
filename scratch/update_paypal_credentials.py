import json
import os

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
            
            # Update values
            config["paypalClientId"] = "AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-"
            config["paypalClientSecret"] = "EDsYZC2RavRufW3IxqC5ellTX_Ee7qi5K1xphfVcwAhoYn04iWv9wNNfJIMWEjS1nZRRYfdZki_xcV_h"
            
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
