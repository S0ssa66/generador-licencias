import json

with open('/Users/sossa/IA/generador-licencias/sossa_backup_sincronizado.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

for key, val in data.items():
    if 'history' in key:
        print(f"Key: {key}")
        try:
            history = json.loads(val) if isinstance(val, str) else val
            for i, lic in enumerate(history):
                sri_state = lic.get('sriEstado')
                if sri_state:
                    print(f"  [{i}] sriEstado: {sri_state}")
                    print(f"      keys: {list(lic.keys())}")
                    if 'sriXmlAutorizadoB64' in lic:
                        print(f"      sriXmlAutorizadoB64: {lic.get('sriXmlAutorizadoB64')[:50]}...")
                    else:
                        print("      sriXmlAutorizadoB64 is missing!")
        except Exception as e:
            print(f"  Error parsing {key}: {e}")
