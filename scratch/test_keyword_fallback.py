import sys
import os

# Permitir importaciones
sys.path.append("/Users/sossa/IA/generador-licencias")

# Configurar variables para fallar en Gemini
os.environ["LLM_PROVIDER"] = "gemini"
os.environ["GEMINI_API_KEY"] = "AIzaSyInvalidKeyToForceFailure"

import llm_utils

# Guardar la función original de Ollama para no romper nada
original_ollama_generate = llm_utils.OllamaProvider.generate_content

def mock_ollama_generate(self, system_instruction, user_content, response_json=False, options=None):
    print("[*] [Mock Ollama] Inferencia local simulada como caida (retornando None)...")
    return None

# Aplicar el mock
llm_utils.OllamaProvider.generate_content = mock_ollama_generate

def test_keyword_fallback():
    print("[*] Iniciando prueba del motor estático de coincidencia de palabras clave (3er Nivel de Fallback)...")
    
    # 1. Probar palabra clave de métricas/ventas
    print("\n--- 📈 Prueba de Métricas (MRR/LTV) ---")
    res_mrr = llm_utils.call_llm("Instruccion", "Quiero saber el MRR y LTV del dashboard")
    print(res_mrr)
    assert "**[Asistente Estático - Modo Offline]**" in res_mrr
    assert "MRR" in res_mrr
    
    # 2. Probar palabra clave de facturación SRI
    print("\n--- 🧾 Prueba de Facturación SRI ---")
    res_sri = llm_utils.call_llm("Instruccion", "Como funciona la contingencia de facturas del sri?")
    print(res_sri)
    assert "contingencia" in res_sri
    
    # 3. Probar palabra clave de precios
    print("\n--- 🏷️ Prueba de Precios ---")
    res_precios = llm_utils.call_llm("Instruccion", "dame una sugerencia de descuento o combo de licencias")
    print(res_precios)
    assert "combo" in res_precios or "descuento" in res_precios or "bundle" in res_precios
    
    # 4. Probar consulta genérica sin palabras clave
    print("\n--- ❓ Prueba Genérica ---")
    res_generic = llm_utils.call_llm("Instruccion", "Hola, que tal?")
    print(res_generic)
    assert "Hola" in res_generic
    
    print("\n[✅] ¡Todas las pruebas del motor de coincidencia de palabras clave pasaron exitosamente!")

if __name__ == "__main__":
    try:
        test_keyword_fallback()
    finally:
        # Restaurar la función original
        llm_utils.OllamaProvider.generate_content = original_ollama_generate
