import os
import sys
import json

# Ensure parent directory is in Python path to import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from agente_coordinador import SUBAGENT_PROMPTS, execute_subagent_react_loop
except ImportError as e:
    print("Error al importar de agente_coordinador:", e)
    sys.exit(1)

def run():
    rol = "token_optimizer"
    prompt = SUBAGENT_PROMPTS.get(rol)
    if not prompt:
        print(f"Error: No se encontró el prompt para el rol {rol}")
        sys.exit(1)
        
    consulta = (
        "Analiza las nuevas actualizaciones en la base de código del proyecto BEATSS. "
        "Encuentra áreas de mejora relacionadas con el consumo de tokens y la gestión de contextos eficientes. "
        "Especialmente analiza el tamaño y modularidad de index.html, main.js y server.py. "
        "Proporciona recomendaciones específicas y un plan de acción para optimizar los tokens."
    )
    
    print(f"🤖 Iniciando ejecución del Agente de {rol.upper()}...")
    respuesta = execute_subagent_react_loop(rol.upper(), prompt, consulta)
    
    print("\n" + "="*80)
    print(f"   RESPUESTA DEL AGENTE DE {rol.upper()}")
    print("="*80)
    print(respuesta)
    print("="*80 + "\n")

if __name__ == "__main__":
    run()
