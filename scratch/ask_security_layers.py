import sys
import os

DIRECTORY = '/Users/sossa/IA/generador-licencias'
sys.path.append(DIRECTORY)

# Configurar variables de entorno para usar Gemini si está configurado en .env
# o usar Ollama como fallback
os.environ["LLM_PROVIDER"] = "gemini" # Cambiamos a gemini temporalmente para usar la API key directa si es válida

import agente_coordinador

query = (
    "El usuario quiere configurar una arquitectura de seguridad de 5 capas para su aplicación "
    "basada en un video de TikTok. Su stack consiste en Backend Python, base de datos Firestore "
    "y hosting en Vercel. Por favor, como SecurityOps, evalúa esta arquitectura de 5 capas y "
    "explica detalladamente cómo se aplicaría a nuestro stack de Vercel/Firestore (Serverless) "
    "y cómo se configuraría en un VPS tradicional de manera detallada (Nginx, UFW/iptables, "
    "Fail2ban, WireGuard VPN, MySQL/PostgreSQL separación y privilegios DML). "
    "Dame las configuraciones y scripts exactos."
)

def progress_callback(msg):
    print("➔", msg)

try:
    print("Iniciando consulta al Agente de Seguridad...")
    response = agente_coordinador.run_agent_pipeline(query, progress_callback)
    print("\n=== RESPUESTA DE SECURITYOPS ===")
    print(response)
except Exception as e:
    import traceback
    traceback.print_exc()
