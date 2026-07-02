import urllib.request
import json
import sys

def test_gemma():
    url = "http://localhost:11434/api/chat"
    
    sys_prompt = """Copiloto Analítico y Estratégico de BEATSS. Asiste al productor sossa.
DATOS DEL CATÁLOGO:
- Ingresos: $770.00 USD
- Licencias: 14
- Distribución: Fire (6), Prueba1 (5), Thoing (3)
- Métodos de Pago: payphone (8), deuna (6)
- Top Beats: Fire, Prueba1
- Cliente VIP: Elvis Alberto Lopez Troya ($450.00 USD)
INSTRUCCIONES:
- Responde en Español.
- Sé analítico, sugiere bundles, promociones, optimización de precios de Beats e incentivos de upgrade.
- Formato limpio con negritas y viñetas."""

    user_message = "¿Cuál es mi rendimiento de ventas de este mes?"
    
    payload = {
        "model": "gemma4:latest",
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_message}
        ],
        "options": {
            "temperature": 0.3
        },
        "stream": False
    }
    
    print("[*] Consultando al modelo 'gemma4:latest' (esperando carga en memoria)...")
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=180) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            content = res_data["message"]["content"]
            print("\n--- Respuesta de gemma4:latest ---")
            print(content.strip())
            print("-" * 40)
    except Exception as e:
        print(f"[-] Error al consultar gemma4:latest: {e}")
        sys.exit(1)

if __name__ == "__main__":
    test_gemma()
