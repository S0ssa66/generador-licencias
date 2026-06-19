import os
import json
from llm_utils import call_gemini, C_GRAY, C_RESET

# Rutas de persistencia de memoria
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SESSION_MEMORY_FILE = os.path.join(BASE_DIR, "session_memory.json")
SUBAGENT_MEMORIES_FILE = os.path.join(BASE_DIR, "subagent_memories.json")


def load_session_memory():
    """Carga el historial de conversación guardado."""
    if os.path.exists(SESSION_MEMORY_FILE):
        try:
            with open(SESSION_MEMORY_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []


def save_session_memory(memory):
    """Guarda el historial de conversación, limitándolo a las últimas 30 interacciones."""
    try:
        with open(SESSION_MEMORY_FILE, "w", encoding="utf-8") as f:
            json.dump(memory[-30:], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error al guardar memoria de sesión: {e}")


def summarize_history_if_needed(history):
    """
    Si el historial supera los 8 turnos, genera una memoria sintetizada de los turnos antiguos 
    para mantener el contexto histórico sin saturar la ventana de tokens.
    """
    if len(history) <= 8:
        return ""
        
    print(f"\n{C_GRAY}[Token Optimizer] 🧠 Optimizando contexto: Sumarizando turnos antiguos de la sesión...{C_RESET}")
    
    # Formatear la parte antigua a resumir (excluyendo los últimos 4 turnos)
    part_to_summarize = history[:-4]
    text_to_summarize = ""
    for turno in part_to_summarize:
        text_to_summarize += f"Usuario: {turno.get('usuario', '')}\nBEATSS: {turno.get('asistente', '')}\n\n"
        
    system_prompt = """
    Eres el Agente Token Optimizer de BEATSS. Tu única tarea es escribir un resumen ultra-condensado (máximo 4 líneas)
    que capture las decisiones clave, archivos modificados y el progreso de la conversación histórica que se te proporciona.
    Sé muy directo y conciso. Evita introducciones o comentarios adicionales. Responde en español.
    """
    
    summary = call_gemini(system_prompt, text_to_summarize, response_json=False)
    if summary:
        return f"--- RESUMEN DE LA SESIÓN ANTERIOR (MEMORIA HISTÓRICA) ---\n{summary.strip()}\n--------------------------------------------------------\n\n"
    return ""


def load_subagent_memories():
    """Carga las memorias a largo plazo de todos los subagentes."""
    if os.path.exists(SUBAGENT_MEMORIES_FILE):
        try:
            with open(SUBAGENT_MEMORIES_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_subagent_memory(rol, memory_text):
    """Guarda o actualiza la memoria de un subagente específico."""
    try:
        memories = load_subagent_memories()
        memories[rol.lower().strip()] = memory_text
        with open(SUBAGENT_MEMORIES_FILE, "w", encoding="utf-8") as f:
            json.dump(memories, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Error al guardar memoria del subagente {rol}: {e}")


def get_subagent_memory(rol):
    """Obtiene la memoria guardada de un subagente."""
    memories = load_subagent_memories()
    return memories.get(rol.lower().strip(), "No tienes registros previos en tu memoria a largo plazo.")
