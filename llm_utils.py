import os
import sys
import json
import time
import urllib.request
import urllib.error

# Intentar cargar variables de entorno desde .env local
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Configuración de colores ANSI para la consola
C_RESET = "\033[0m"
C_BOLD = "\033[1m"
C_CYAN = "\033[36m"
C_GREEN = "\033[32m"
C_MAGENTA = "\033[35m"
C_YELLOW = "\033[33m"
C_RED = "\033[31m"
C_WHITE = "\033[37m"
C_GRAY = "\033[90m"
C_BLUE = "\033[34m"

# Verificar clave API de Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    # Intentar leer desde .env si existe físicamente en el directorio del proyecto
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GEMINI_API_KEY="):
                    GEMINI_API_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                    break

if not GEMINI_API_KEY:
    print(f"{C_RED}{C_BOLD}❌ Error: No se encontró la variable GEMINI_API_KEY en llm_utils.{C_RESET}")
    print("Por favor, asegúrate de configurar GEMINI_API_KEY en tu archivo .env o en el entorno.")
    sys.exit(1)


def call_gemini(system_instruction, user_content, response_json=False):
    """Realiza una petición HTTP directa al API de Gemini con reintentos automáticos ante límite de cuota (429)."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    generation_config = {
        "temperature": 0.2
    }
    if response_json:
        generation_config["responseMimeType"] = "application/json"
        
    payload = {
        "contents": [
            {
                "parts": [
                    {"text": user_content}
                ]
            }
        ],
        "systemInstruction": {
            "parts": [
                {"text": system_instruction}
            ]
        },
        "generationConfig": generation_config
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    max_retries = 5
    backoff_factor = 2
    initial_delay = 5  # segundos
    
    for attempt in range(max_retries):
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["candidates"][0]["content"]["parts"][0]["text"]
        except urllib.error.HTTPError as e:
            error_code = e.code
            error_body = e.read().decode('utf-8')
            
            if error_code in [429, 503, 500, 502, 504]:
                delay = initial_delay * (backoff_factor ** attempt)
                try:
                    err_json = json.loads(error_body)
                    msg = err_json.get("error", {}).get("message", "")
                    if "retry in" in msg.lower():
                        suggested_time = float(msg.lower().split("retry in")[1].strip().split("s")[0])
                        delay = max(delay, suggested_time + 1)
                except Exception:
                    pass
                
                print(f"\n{C_YELLOW}⚠️ Error temporal del API de Gemini ({error_code}). Reintentando en {delay:.1f} segundos (intento {attempt + 1}/{max_retries})...{C_RESET}")
                time.sleep(delay)
                continue
            else:
                print(f"\n{C_RED}❌ Error del API de Gemini: {error_body}{C_RESET}")
                return None
        except Exception as e:
            print(f"\n{C_RED}❌ Error de red en llm_utils: {str(e)}{C_RESET}")
            return None
            
    print(f"\n{C_RED}❌ Se superó el número máximo de reintentos tras errores de Gemini.{C_RESET}")
    return None


def clean_and_parse_json(text):
    """Extrae y parsea un objeto JSON de una respuesta de texto."""
    if not text:
        return None
    text = text.strip()
    
    # Buscar bloques markdown de código ```json o ```
    if "```json" in text:
        try:
            part = text.split("```json")[1].split("```")[0].strip()
            return json.loads(part)
        except Exception:
            pass
            
    if "```" in text:
        try:
            part = text.split("```")[1].split("```")[0].strip()
            return json.loads(part)
        except Exception:
            pass
            
    # Intentar parsear el texto completo
    try:
        return json.loads(text)
    except Exception:
        pass
        
    # Si falla, intentar buscar el primer '{' y el último '}'
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end+1])
        except Exception:
            pass
            
    return None
