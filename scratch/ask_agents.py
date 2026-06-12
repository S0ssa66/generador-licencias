import os
import sys
import json
import urllib.request
import urllib.error

# Intentar cargar variables de entorno desde .env local
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GEMINI_API_KEY="):
                    GEMINI_API_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                    break

if not GEMINI_API_KEY:
    print("Error: No se encontró la variable GEMINI_API_KEY.")
    sys.exit(1)

# Importar prompts desde agente_coordinador
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from agente_coordinador import MAIN_AGENT_PROMPT, SUBAGENT_PROMPTS, SYNTHESIS_PROMPT, call_gemini
except ImportError as e:
    print("Error al importar de agente_coordinador:", e)
    sys.exit(1)

def main():
    user_query = "qué se puede mejorar en la aplicación de BEATSS"
    print("🔍 [Agente Principal] Analizando requerimiento...")
    
    # 1. Llamar al Agente Principal para determinar delegación
    decision_text = call_gemini(MAIN_AGENT_PROMPT, user_query)
    if not decision_text:
        print("Error: No se recibió respuesta del Agente Principal.")
        return
        
    if decision_text.strip().startswith("```"):
        lines = decision_text.strip().split("\n")
        if lines[0].startswith("```json"):
            decision_text = "\n".join(lines[1:-1])
        elif lines[0].startswith("```"):
            decision_text = "\n".join(lines[1:-1])
            
    try:
        decision = json.loads(decision_text.strip())
    except Exception as e:
        print("Error al parsear decisión:", e)
        print("Respuesta cruda:", decision_text)
        return
        
    print(f"🧠 Pensamiento: {decision.get('pensamiento', 'Ninguno')}")
    
    delegados = decision.get("delegados", [])
    respuestas_subagentes = []
    
    if delegados:
        for delg in delegados:
            rol = delg.get("rol")
            consulta = delg.get("consulta")
            
            if rol not in SUBAGENT_PROMPTS:
                continue
                
            print(f"\n🤝 [Delegando a Agente de {rol}]...")
            print(f"↳ Consulta: {consulta}")
            
            resp_sub = call_gemini(SUBAGENT_PROMPTS[rol], consulta)
            if resp_sub:
                print(f"✓ Respuesta recibida.")
                respuestas_subagentes.append(f"--- AGENTE DE {rol} ---\n{resp_sub}\n")
            else:
                print(f"❌ Sin respuesta del Agente de {rol}.")
    else:
        print("ℹ️ El requerimiento se responderá de forma directa.")
        
    print("\n✍️ [Agente Principal] Consolidando respuesta final...")
    subagents_data = "\n".join(respuestas_subagentes) if respuestas_subagentes else "Ningún subagente fue consultado."
    synthesis_content = SYNTHESIS_PROMPT.format(user_query=user_query, subagent_responses=subagents_data)
    
    final_response = call_gemini("Eres el Agente Principal de BEATSS.", synthesis_content)
    
    if final_response:
        print("\n================================================================")
        print("   RESPUESTA DEL DIRECTOR DE PROYECTO (BEATSS)")
        print("================================================================")
        print(final_response)
        print("================================================================")

if __name__ == "__main__":
    main()
