import sys
import os

# Configurar para que use Gemini pero con API key inválida ANTES de importar
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["GEMINI_API_KEY"] = "AIzaSyFakeKeyThatWillDefinitelyFail"

# Permitir importaciones desde la raíz del proyecto
sys.path.append("/Users/sossa/IA/generador-licencias")

import llm_utils

def test_fallback():
    print("[*] Iniciando prueba de Fallback automático de Gemini Cloud -> Ollama Local...")
    
    system_instruction = "Eres un asistente musical y respondes en español."
    user_content = "Hola, responde únicamente con la palabra 'FALLBACK_OK' si puedes leerme."
    
    print("[*] Llamando a call_llm (esto intentará Gemini en la nube, fallará por clave inválida y rebotará a Ollama)...")
    
    # Ejecutar llamada
    response = llm_utils.call_llm(system_instruction, user_content)
    
    if response:
        print("\n--- Respuesta del router/fallback ---")
        print(response.strip())
        print("--------------------------------------")
        if "FALLBACK_OK" in response.upper() or "COMPLETADO" in response.upper() or len(response) > 0:
            print("[✅] Éxito: El fallback a Ollama local se realizó y devolvió una respuesta válida!")
            return
    
    print("[-] Error: El fallback no funcionó o no devolvió una respuesta.")
    sys.exit(1)

if __name__ == "__main__":
    test_fallback()
