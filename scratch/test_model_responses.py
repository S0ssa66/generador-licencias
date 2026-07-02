import urllib.request
import json
import sys

def test_model(model_name):
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
        "model": model_name,
        "messages": [
            {"role": "system", "content": sys_prompt},
            {"role": "user", "content": user_message}
        ],
        "options": {
            "temperature": 0.2
        },
        "stream": False
    }
    
    print(f"\n[*] Consultando al modelo '{model_name}'...")
    try:
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=30) as res:
            res_data = json.loads(res.read().decode("utf-8"))
            content = res_data["message"]["content"]
            print(f"--- Respuesta de {model_name} ---")
            print(content.strip())
            print("-" * 40)
    except Exception as e:
        print(f"[-] Error al consultar {model_name}: {e}")

if __name__ == "__main__":
    test_model("deepseek-coder:6.7b")
    test_model("gemma4:latest")
