from __future__ import annotations
import os
import sys
import json
import re
import shutil
import subprocess
import time
import urllib.request
import urllib.error
import urllib.parse
from abc import ABC, abstractmethod

# Intentar cargar variables de entorno desde .env local
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

# Cargar .env manualmente si no se pudo con python-dotenv
env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, val = line.split('=', 1)
                key = key.strip()
                val = val.strip().strip("'\"")
                if key not in os.environ:
                    os.environ[key] = val

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

DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.6-flash"
DEFAULT_OPENAI_MODEL = "gpt-5.5"
DEFAULT_OPENCODE_MODEL = "deepseek/deepseek-v4-flash"
_GEMINI_MODEL_PATTERN = re.compile(r"^gemini-[a-z0-9][a-z0-9.-]*$")
_MODEL_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]*$")


def get_gemini_model(env_var: str = "GEMINI_MODEL", default: str = DEFAULT_GEMINI_MODEL) -> str:
    """Return a safe Gemini model identifier without exposing environment values."""
    model_name = (os.getenv(env_var) or default).strip().lower()
    if _GEMINI_MODEL_PATTERN.fullmatch(model_name):
        return model_name
    print(f"{C_YELLOW}⚠️ [LLM Router] Modelo Gemini inválido en {env_var}; usando el predeterminado.{C_RESET}")
    return default


def get_model_name(env_var: str, default: str) -> str:
    """Return a safe generic model identifier without exposing environment values."""
    model_name = (os.getenv(env_var) or default).strip()
    if _MODEL_PATTERN.fullmatch(model_name):
        return model_name
    print(f"{C_YELLOW}⚠️ [LLM Router] Modelo inválido en {env_var}; usando el predeterminado.{C_RESET}")
    return default


def get_openai_compat_base_url() -> str | None:
    """Validate an OpenAI-compatible base URL from trusted local configuration."""
    base_url = (os.getenv("OPENAI_COMPAT_BASE_URL") or "").strip().rstrip("/")
    if not base_url:
        return None
    parsed = urllib.parse.urlparse(base_url)
    is_local = parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    if parsed.scheme not in {"https", "http"} or (parsed.scheme != "https" and not is_local):
        print(f"{C_YELLOW}⚠️ [LLM Router] OPENAI_COMPAT_BASE_URL no es una URL HTTPS o local válida.{C_RESET}")
        return None
    if not parsed.netloc or parsed.query or parsed.fragment or parsed.username or parsed.password:
        print(f"{C_YELLOW}⚠️ [LLM Router] OPENAI_COMPAT_BASE_URL contiene componentes no permitidos.{C_RESET}")
        return None
    return base_url


def allow_cloud_fallback() -> bool:
    """Cloud-provider failover is opt-in to avoid sending private context elsewhere."""
    return (os.getenv("LLM_ALLOW_CLOUD_FALLBACK") or "false").strip().lower() in {"1", "true", "yes"}


class LLMProvider(ABC):
    """Interfaz abstracta para proveedores de LLM."""
    @abstractmethod
    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        """Genera contenido usando el LLM."""
        pass

class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model_name: str | None = None):
        self.api_key = api_key
        self.model_name = model_name or get_gemini_model()
        self.url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model_name}:generateContent"

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        if not self.api_key:
            print(f"\n{C_RED}❌ Error: No se configuró GEMINI_API_KEY para realizar la llamada a Gemini.{C_RESET}")
            return None

        generation_config = {"temperature": 0.2}
        if response_json:
            generation_config["responseMimeType"] = "application/json"
            
        payload = {
            "contents": [{"parts": [{"text": user_content}]}],
            "systemInstruction": {"parts": [{"text": system_instruction}]},
            "generationConfig": generation_config
        }
        
        headers = {"Content-Type": "application/json"}
        
        max_retries = min(max(int(os.getenv("GEMINI_MAX_RETRIES", "3")), 1), 5)
        backoff_factor = 2
        initial_delay = 5  # segundos
        
        for attempt in range(max_retries):
            url_with_key = f"{self.url}?key={self.api_key}"
            req = urllib.request.Request(url_with_key, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=45) as response:
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
                print(f"\n{C_RED}❌ Error de red en GeminiProvider: {str(e)}{C_RESET}")
                return None
                
        print(f"\n{C_RED}❌ Se superó el número máximo de reintentos tras errores de Gemini.{C_RESET}")
        return None


class OpenAIProvider(LLMProvider):
    """Official OpenAI Responses API provider for OpenAI API credentials."""

    def __init__(self, api_key: str, model_name: str | None = None):
        self.api_key = api_key
        self.model_name = model_name or get_model_name("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)
        self.url = "https://api.openai.com/v1/responses"

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        if not self.api_key:
            print(f"\n{C_RED}❌ Error: No se configuró OPENAI_API_KEY para realizar la llamada a OpenAI.{C_RESET}")
            return None

        payload = {
            "model": self.model_name,
            "instructions": system_instruction,
            "input": user_content,
            "store": False,
        }
        if response_json:
            payload["text"] = {"format": {"type": "json_object"}}
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        try:
            req = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=90) as response:
                return self._extract_output(json.loads(response.read().decode("utf-8")))
        except urllib.error.HTTPError as error:
            print(f"\n{C_RED}❌ Error del API de OpenAI ({error.code}).{C_RESET}")
        except Exception as error:
            print(f"\n{C_RED}❌ Error de red en OpenAIProvider: {error}{C_RESET}")
        return None

    @staticmethod
    def _extract_output(response: dict) -> str | None:
        output_text = response.get("output_text")
        if isinstance(output_text, str) and output_text:
            return output_text
        for item in response.get("output", []):
            for content in item.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return content["text"]
        return None


class OpenAICompatibleProvider(LLMProvider):
    """Provider for self-hosted or third-party OpenAI-compatible chat APIs."""

    def __init__(self, base_url: str, api_key: str = "", model_name: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model_name = model_name or get_model_name("OPENAI_COMPAT_MODEL", "local-model")
        self.url = f"{self.base_url}/chat/completions"

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content},
            ],
            "temperature": 0.2,
            "stream": False,
        }
        if response_json:
            payload["response_format"] = {"type": "json_object"}
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        try:
            req = urllib.request.Request(self.url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=90) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result["choices"][0]["message"]["content"]
        except urllib.error.HTTPError as error:
            print(f"\n{C_RED}❌ Error del proveedor OpenAI-compatible ({error.code}).{C_RESET}")
        except Exception as error:
            print(f"\n{C_RED}❌ Error en OpenAICompatibleProvider: {error}{C_RESET}")
        return None


class OpenCodeProvider(LLMProvider):
    """Use an authenticated local OpenCode CLI without reading its credentials."""

    def __init__(self, command: str | None = None):
        self.command = command or shutil.which("opencode")
        self.model_name = get_model_name("OPENCODE_MODEL", DEFAULT_OPENCODE_MODEL)
        self.agent_name = (os.getenv("OPENCODE_AGENT") or "knowledge-steward").strip()
        self.project_dir = os.path.dirname(os.path.abspath(__file__))

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        if not self.command:
            print(f"\n{C_RED}❌ OpenCode CLI no está disponible en PATH.{C_RESET}")
            return None

        requested_agent = (options or {}).get("opencode_agent", self.agent_name)
        agent_name = str(requested_agent or self.agent_name).strip()
        if not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", agent_name):
            print(f"\n{C_RED}❌ Nombre de agente OpenCode inválido.{C_RESET}")
            return None

        prompt = f"{system_instruction}\n\n--- SOLICITUD ACTUAL ---\n{user_content}"
        command = [
            self.command,
            "run",
            "--agent", agent_name,
            "--model", self.model_name,
            "--format", "json",
            "--dir", self.project_dir,
            prompt,
        ]
        try:
            result = subprocess.run(
                command,
                cwd=self.project_dir,
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
        except subprocess.TimeoutExpired:
            print(f"\n{C_RED}❌ OpenCode agotó el tiempo de respuesta.{C_RESET}")
            return None
        except OSError as error:
            print(f"\n{C_RED}❌ No se pudo iniciar OpenCode: {error}{C_RESET}")
            return None

        response_text = self._extract_text(result.stdout)
        if response_text:
            return response_text
        print(f"\n{C_RED}❌ OpenCode no devolvió una respuesta utilizable (código {result.returncode}).{C_RESET}")
        return None

    @staticmethod
    def _extract_text(output: str) -> str | None:
        for line in reversed(output.splitlines()):
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if event.get("type") == "text":
                text = event.get("part", {}).get("text")
                if isinstance(text, str) and text.strip():
                    return text.strip()
        return None

class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.model_name = self._detect_model()

    def _detect_model(self) -> str:
        """Detecta el modelo a usar en Ollama, priorizando OLLAMA_MODEL y luego deepseek-coder o gemma4."""
        env_model = os.getenv("OLLAMA_MODEL")
        if env_model:
            print(f"[*] [Ollama] Usando modelo desde variable de entorno OLLAMA_MODEL: {env_model}")
            return env_model

        try:
            req = urllib.request.Request(f"{self.base_url}/api/tags")
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode("utf-8"))
                models = data.get("models", [])
                if models:
                    model_names = [m["name"] for m in models]
                    # Buscar si está gemma4
                    for name in model_names:
                        if "gemma4" in name:
                            print(f"[*] [Ollama] Modelo gemma4 detectado: {name}")
                            return name
                    # Buscar si está deepseek-coder en el nombre
                    for name in model_names:
                        if "deepseek-coder" in name:
                            print(f"[*] [Ollama] Modelo preferido detectado: {name}")
                            return name
                    # Si no, usar el primero disponible
                    model = model_names[0]
                    print(f"[*] [Ollama] Usando primer modelo disponible: {model}")
                    return model
        except Exception:
            pass # Silencioso, usar fallback por defecto
        print(f"[*] [Ollama] No se detectó modelo local, usando fallback: llama3")
        return "llama3" # Fallback por defecto

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        url = f"{self.base_url}/api/chat"
        
        # Opciones por defecto para Ollama
        ollama_options = {
            "temperature": 0.2,
            "num_ctx": 8192,
            "num_predict": 2048
        }
        if options and isinstance(options, dict):
            ollama_options.update(options)
            
        payload = {
            "model": self.model_name,
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content}
            ],
            "options": ollama_options,
            "stream": False
        }
        if response_json:
            payload["format"] = "json"

        headers = {"Content-Type": "application/json"}

        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=120) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["message"]["content"]
        except Exception as e:
            print(f"\n{C_RED}❌ [Ollama] Error al conectar o consultar a Ollama local: {str(e)}{C_RESET}")
            return None

class LMStudioProvider(LLMProvider):
    def __init__(self, base_url: str = "http://localhost:1234"):
        self.base_url = base_url

    def generate_content(self, system_instruction: str, user_content: str, response_json: bool = False, options: dict | None = None) -> str | None:
        url = f"{self.base_url}/v1/chat/completions"
        
        payload = {
            "model": "local-model", # LM Studio ignora esto y usa el modelo cargado en la UI
            "messages": [
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_content}
            ],
            "temperature": 0.2,
            "stream": False
        }
        # Si se especifican opciones compatibles con OpenAI, agregarlas
        if options and isinstance(options, dict):
            for k, v in options.items():
                if k == "num_ctx" and "max_tokens" not in options:
                    payload["max_tokens"] = v
                elif k in ["temperature", "max_tokens", "top_p"]:
                    payload[k] = v
        if response_json:
            payload["response_format"] = {"type": "json_object"}

        headers = {"Content-Type": "application/json"}

        try:
            req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=120) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                return res_data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"\n{C_RED}❌ [LM Studio] Error al conectar o consultar a LM Studio local: {str(e)}{C_RESET}")
            return None

class LLMManager:
    """Gestiona la selección e instanciación del proveedor de LLM."""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(LLMManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self.llm_provider_instance = self._initialize_provider()
        self._initialized = True

    def _check_ollama_connectivity(self, base_url: str) -> bool:
        try:
            urllib.request.urlopen(f"{base_url}/api/tags", timeout=1).close()
            return True
        except Exception:
            return False

    def _check_lm_studio_connectivity(self, base_url: str) -> bool:
        try:
            # LM Studio OpenAI-compatible endpoint
            urllib.request.urlopen(f"{base_url}/v1/chat/completions", timeout=1).close()
            return True
        except Exception:
            return False

    def _initialize_provider(self) -> LLMProvider | None:
        provider_name = os.getenv("LLM_PROVIDER", "auto").lower().strip()
        gemini_api_key = os.getenv("GEMINI_API_KEY")
        openai_api_key = os.getenv("OPENAI_API_KEY")
        openai_compat_base_url = get_openai_compat_base_url()

        if provider_name == "opencode":
            if not shutil.which("opencode"):
                print(f"{C_RED}{C_BOLD}❌ Error: OpenCode CLI no está disponible para LLM_PROVIDER='opencode'.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando OpenCode local (configurado explícitamente).{C_RESET}")
            return OpenCodeProvider()

        if provider_name == "openai":
            if not openai_api_key:
                print(f"{C_RED}{C_BOLD}❌ Error: OPENAI_API_KEY no configurada para LLM_PROVIDER='openai'.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando OpenAI (configurado explícitamente).{C_RESET}")
            return OpenAIProvider(openai_api_key)

        if provider_name == "openai-compatible":
            if not openai_compat_base_url:
                print(f"{C_RED}{C_BOLD}❌ Error: OPENAI_COMPAT_BASE_URL no está configurada o no es válida.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando proveedor OpenAI-compatible (configurado explícitamente).{C_RESET}")
            return OpenAICompatibleProvider(openai_compat_base_url, os.getenv("OPENAI_COMPAT_API_KEY", ""))

        if provider_name == "gemini":
            if not gemini_api_key:
                print(f"{C_RED}{C_BOLD}❌ Error: GEMINI_API_KEY no configurada para LLM_PROVIDER='gemini'.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando Gemini (configurado explícitamente).{C_RESET}")
            return GeminiProvider(gemini_api_key, get_gemini_model())
        
        elif provider_name == "ollama":
            if not self._check_ollama_connectivity("http://localhost:11434"):
                print(f"{C_RED}{C_BOLD}❌ Error: Ollama configurado explícitamente pero no accesible en http://localhost:11434.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando Ollama (configurado explícitamente).{C_RESET}")
            return OllamaProvider()
        
        elif provider_name == "lm-studio":
            if not self._check_lm_studio_connectivity("http://localhost:1234"):
                print(f"{C_RED}{C_BOLD}❌ Error: LM Studio configurado explícitamente pero no accesible en http://localhost:1234.{C_RESET}")
                return None
            print(f"{C_GREEN}✅ [LLM Router] Usando LM Studio (configurado explícitamente).{C_RESET}")
            return LMStudioProvider()
        
        elif provider_name == "auto" or not provider_name:
            print(f"{C_YELLOW}ℹ️ [LLM Router] Modo 'auto' activado. Intentando detectar proveedor...{C_RESET}")

            if (os.getenv("OPENCODE_ENABLED") or "false").strip().lower() in {"1", "true", "yes"} and shutil.which("opencode"):
                print(f"{C_GREEN}✅ [LLM Router] Usando OpenCode local (habilitado).{C_RESET}")
                return OpenCodeProvider()

            if openai_api_key:
                print(f"{C_GREEN}✅ [LLM Router] Usando OpenAI (API Key detectada).{C_RESET}")
                return OpenAIProvider(openai_api_key)

            if gemini_api_key:
                print(f"{C_GREEN}✅ [LLM Router] Usando Gemini (API Key detectada).{C_RESET}")
                return GeminiProvider(gemini_api_key, get_gemini_model())

            if openai_compat_base_url:
                print(f"{C_GREEN}✅ [LLM Router] Usando proveedor OpenAI-compatible (URL detectada).{C_RESET}")
                return OpenAICompatibleProvider(openai_compat_base_url, os.getenv("OPENAI_COMPAT_API_KEY", ""))

            if self._check_ollama_connectivity("http://localhost:11434"):
                print(f"{C_GREEN}✅ [LLM Router] Usando Ollama (servicio local detectado).{C_RESET}")
                return OllamaProvider()

            if self._check_lm_studio_connectivity("http://localhost:1234"):
                print(f"{C_GREEN}✅ [LLM Router] Usando LM Studio (servicio local detectado).{C_RESET}")
                return LMStudioProvider()
            
            print(f"{C_RED}❌ [LLM Router] No se pudo inicializar ningún proveedor de IA en modo 'auto'.{C_RESET}")
            return None
        
        else:
            print(f"{C_RED}❌ [LLM Router] Proveedor '{provider_name}' no reconocido.{C_RESET}")
            return None

    def get_provider(self) -> LLMProvider | None:
        return self.llm_provider_instance

# Instanciar el manager como un singleton
llm_manager = LLMManager()

def get_static_keyword_response(user_content: str) -> str:
    """Retorna una respuesta estática de ayuda basada en coincidencia de palabras clave."""
    content_lower = user_content.lower()
    if any(k in content_lower for k in ["mrr", "ltv", "métrica", "ingresos", "ventas", "ganancias", "dinero", "cobro"]):
        return (
            "**[Asistente Estático - Modo Offline]**\n\n"
            "Parece que no tengo conexión activa a los servicios de IA (Gemini y Ollama local). Sin embargo, analizando tus palabras clave sobre métricas e ingresos:\n"
            "- Tus ingresos acumulados y ventas se procesan dinámicamente desde tus respaldos de sincronización local.\n"
            "- Las métricas clave como el **LTV Promedio** y el **MRR de la Plataforma** se calculan en tiempo real en el backend y se grafican de manera interactiva en tu Dashboard principal.\n"
            "- Te sugiero revisar directamente la pestaña del Dashboard administrativo para ver estas tendencias."
        )
    elif any(k in content_lower for k in ["sri", "factura", "firma", "contingencia", "ride", "xml"]):
        return (
            "**[Asistente Estático - Modo Offline]**\n\n"
            "Sin conexión a los modelos de lenguaje (Gemini / Ollama), te informo sobre la facturación del SRI:\n"
            "- Las facturas fallidas debido a caídas del SRI se guardan automáticamente en la cola de contingencia local (base de datos SQLite `sri_contingency.db`).\n"
            "- Hay un hilo en segundo plano ejecutándose cada 5 minutos que reintentará la transmisión de forma automática.\n"
            "- Los PDF RIDE generados ahora contienen un código QR local que enlaza a la consulta oficial de comprobantes electrónicos del SRI."
        )
    elif any(k in content_lower for k in ["precio", "promoción", "oferta", "descuento", "bundle", "pro", "elite"]):
        return (
            "**[Asistente Estático - Modo Offline]**\n\n"
            "No tengo acceso a los modelos de IA en este momento, pero aquí tienes una estrategia de precios básica:\n"
            "- **Bundles (Combos):** Ofrece ofertas como 'Compra 2 Beats y obtén 1 gratis' para elevar el valor del carrito de compras.\n"
            "- **Upgrades:** Incentiva a los compradores de licencias básicas a pasarse a planes Pro/Elite ofreciendo un descuento exclusivo por tiempo limitado.\n"
            "- **Suscripciones:** Promociona activamente tus planes recurrentes Pro ($10/mes) y Elite ($30/mes) para generar ingresos estables."
        )
    else:
        return (
            "**[Asistente Estático - Modo Offline]**\n\n"
            "Hola. Actualmente me encuentro sin conexión a los servicios de inteligencia artificial en la nube (Gemini) y locales (Ollama).\n"
            "Puedo ayudarte con información del sistema si mencionas palabras clave como:\n"
            "- **Métricas / Ventas / MRR / LTV** para analíticas.\n"
            "- **SRI / Facturas / Contingencia** para temas tributarios.\n"
            "- **Precios / Ofertas / Descuentos** para estrategias comerciales."
        )

def call_llm(
    system_instruction: str,
    user_content: str,
    response_json: bool = False,
    num_ctx: int | None = None,
    opencode_agent: str | None = None,
) -> str | None:
    """
    Call the selected provider with same-cloud and opt-in cloud fallbacks.
    Private context never moves from one cloud provider to another unless the
    local configuration explicitly enables LLM_ALLOW_CLOUD_FALLBACK.
    """
    provider = llm_manager.get_provider()
    
    options = {}
    if num_ctx is not None:
        options["num_ctx"] = num_ctx
    if opencode_agent:
        options["opencode_agent"] = opencode_agent
    if not options:
        options = None
    
    response = None
    if provider:
        response = provider.generate_content(system_instruction, user_content, response_json, options=options)

    if response is None and isinstance(provider, GeminiProvider):
        fallback_model = get_gemini_model("GEMINI_FALLBACK_MODEL", DEFAULT_GEMINI_FALLBACK_MODEL)
        if fallback_model != provider.model_name:
            print(f"\n{C_YELLOW}⚠️ [LLM Fallback] Gemini no respondió; probando el modelo alterno configurado.{C_RESET}")
            try:
                fallback_provider = GeminiProvider(os.getenv("GEMINI_API_KEY", ""), fallback_model)
                response = fallback_provider.generate_content(system_instruction, user_content, response_json, options=options)
            except Exception as e:
                print(f"{C_RED}❌ [LLM Fallback] Falló la inferencia alterna de Gemini: {e}{C_RESET}")

    if response is None and allow_cloud_fallback():
        cloud_fallbacks = []
        if not isinstance(provider, OpenAIProvider) and os.getenv("OPENAI_API_KEY"):
            cloud_fallbacks.append(OpenAIProvider(os.getenv("OPENAI_API_KEY", "")))
        if not isinstance(provider, GeminiProvider) and os.getenv("GEMINI_API_KEY"):
            cloud_fallbacks.append(GeminiProvider(os.getenv("GEMINI_API_KEY", ""), get_gemini_model()))
        for cloud_provider in cloud_fallbacks:
            print(f"\n{C_YELLOW}⚠️ [LLM Fallback] Probando un proveedor cloud alterno autorizado.{C_RESET}")
            response = cloud_provider.generate_content(system_instruction, user_content, response_json, options=options)
            if response:
                break

    if response is None and not isinstance(provider, OllamaProvider):
        print(f"\n{C_YELLOW}⚠️ [LLM Fallback] Probando Ollama local.{C_RESET}")
        try:
            ollama_provider = OllamaProvider()
            response = ollama_provider.generate_content(system_instruction, user_content, response_json, options=options)
            if response:
                print(f"{C_GREEN}✅ [LLM Fallback] Inferencia exitosa mediante Ollama local ({ollama_provider.model_name}).{C_RESET}")
        except Exception as e:
            print(f"{C_RED}❌ [LLM Fallback] Falló la inferencia local de Ollama: {e}{C_RESET}")

    if response is None and not isinstance(provider, LMStudioProvider):
        print(f"\n{C_YELLOW}⚠️ [LLM Fallback] Probando LM Studio local.{C_RESET}")
        try:
            response = LMStudioProvider().generate_content(system_instruction, user_content, response_json, options=options)
        except Exception as e:
            print(f"{C_RED}❌ [LLM Fallback] Falló la inferencia local de LM Studio: {e}{C_RESET}")

    if response is None:
        print(f"\n{C_RED}⚠️ [LLM Fallback] Todos los proveedores de IA fallaron. Conmutando al motor estático de coincidencias de palabras clave.{C_RESET}")
        response = get_static_keyword_response(user_content)
            
    return response

# Mantener la función original `call_gemini` para retrocompatibilidad
def call_gemini(system_instruction, user_content, response_json=False, num_ctx: int | None = None):
    """
    Función de retrocompatibilidad. Usa `call_llm` para interactuar con el LLM seleccionado.
    Considera actualizar las llamadas a `llm_utils.call_llm` para mayor claridad.
    """
    print(f"{C_YELLOW}⚠️ [DEPRECATION] La función 'call_gemini' está obsoleta. Por favor, usa 'call_llm' en su lugar.{C_RESET}")
    return call_llm(system_instruction, user_content, response_json, num_ctx=num_ctx)

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
