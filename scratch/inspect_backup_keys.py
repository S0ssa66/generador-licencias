import json
import os

filepath = "/Users/sossa/IA/generador-licencias/sossa_backup_sincronizado.json"
if os.path.exists(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    config = data.get("sossa_producer_config")
    if config:
        if isinstance(config, str):
            config = json.loads(config)
        print("Sossa producer config:")
        for k, v in config.items():
            print(f"  {k}: {v}")
    else:
        print("sossa_producer_config not found!")
else:
    print("Backup file not found!")
