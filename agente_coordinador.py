#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import json
import time
from urllib.parse import urlparse

# Intentar cargar variables de entorno desde .env local
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import urllib.request
import urllib.error

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
    # Intentar leer desde .env si existe físicamente
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip().startswith("GEMINI_API_KEY="):
                    GEMINI_API_KEY = line.strip().split("=", 1)[1].strip().strip('"').strip("'")
                    break

if not GEMINI_API_KEY:
    print(f"{C_RED}{C_BOLD}❌ Error: No se encontró la variable GEMINI_API_KEY.{C_RESET}")
    print("Por favor, asegúrate de configurar GEMINI_API_KEY en tu archivo .env o en el entorno.")
    print("Puedes obtener una clave gratuita en: https://aistudio.google.com/app/api-keys")
    sys.exit(1)

# Prompts de los agentes
ROUTER_AGENT_PROMPT = """
Eres el Agente Enrutador de BEATSS. Tu única tarea es analizar la consulta del usuario y clasificarla en una de las dos siguientes categorías:

1. "DIRECT": Para saludos, despedidas, conversaciones generales, preguntas simples sobre la plataforma que no requieren especialistas de diseño, programación, contabilidad, leyes o seguridad.
2. "DELEGATE": Para requerimientos complejos que requieran análisis técnico, cambios de diseño, programación en javascript, reglas de seguridad de firebase, redacción de contratos, gestión de Obsidian o cálculos contables/financieros.

Responde estrictamente en formato JSON con la siguiente estructura:
{
  "routing_decision": "DIRECT" | "DELEGATE",
  "pensamiento": "Tu explicación breve y razonamiento sobre por qué tomas esta decisión.",
  "respuesta_directa": "Si decides DIRECT, coloca aquí tu respuesta final, amable y en español. Si decides DELEGATE, deja este campo vacío."
}
No agregues explicaciones fuera del JSON.
"""

MAIN_AGENT_PROMPT = """
Eres el Agente Principal (Director de Proyecto) de BEATSS. Tu objetivo es coordinar y resolver los requerimientos del usuario delegando a los subagentes adecuados.
Tienes disponibles los siguientes subagentes especialistas:

1. `integrator`: Firebase, base de datos Firestore, auth, carga a Firebase Storage y checkout.
2. `data_engineer`: Importación de CSVs (de Beatstars), respaldos JSON de base de datos y procesamiento de datos.
3. `document_expert`: Maquetación de contratos, CSS de impresión y generación/descarga de PDFs de licencias.
4. `designer`: Estilos visuales CSS, layouts, glassmorphism, gradientes modernos y refinamiento tipográfico.
5. `qa_tester`: Control de calidad, pruebas unitarias y de interfaz, validación de cupones y checkout.
6. `seo_optimizer`: Optimización Core Web Vitals (LCP, INP), compresión de bundles con Vite, metatags y JSON-LD.
7. `security_ops`: Reglas de seguridad de Firestore (hardening de firestore.rules) y protección de API keys/secretos.
8. `marketing_copywriter`: Redacción comercial/persuasiva en landing pages, textos bilingües y correos de entrega.
9. `business_analyst`: Gráficos en frontend, métricas financieras de dashboard (LTV, MRR) e ingresos de productores.
10. `automation_expert`: Webhooks de pagos, notificaciones y correos automatizados (Resend/SendGrid).
11. `legal_advisor`: Abogado de industria musical, contratos, splits de regalías (Composer/Writer Share) y Content ID.
12. `support_helper`: Centro de soporte, ayuda al cliente, guías de derechos de autor y FAQs.
13. `mobile_developer`: App móvil iOS/Android, sincronización y reproductor en segundo plano nativo.
14. `audio_dsp_expert`: Web Audio API, reproductor multipista web y manipulación de stems individuales.
15. `devops_admin`: Despliegue en Vercel, CI/CD, monitoreo de salud e índices compuestos de Firestore.
16. `refactor_expert`: Arquitectura JS modular, resolver dependencias circulares y window retrocompatible.
17. `obsidian_expert`: Gestión de la bóveda de Obsidian, Dashboard BEATSS.md y mantenimiento de documentación organizada.
18. `token_optimizer`: Optimización del consumo de tokens, gestión de contextos eficientes y optimización de prompts.
19. `growth_hacker`: Embudos de conversión, email marketing y adquisición de tráfico de artistas.

Dado el requerimiento del usuario, debes decidir a quién(es) delegar y qué preguntarles. Puedes delegar a uno o más subagentes en paralelo.
Responde estrictamente en formato JSON con la siguiente estructura:
{
  "pensamiento": "Tu razonamiento interno sobre cómo abordar el problema y a qué especialistas delegar.",
  "delegados": [
    {
      "rol": "nombre_del_agente",
      "consulta": "La consulta específica y detallada que le haces al subagente."
    }
  ]
}
Si decides resolver la consulta de forma directa porque es simple, la lista de "delegados" puede estar vacía.
No agregues explicaciones fuera del JSON.
"""

SUBAGENT_BASE_PROMPT = """
Eres el agente especialista `{rol}` de la plataforma BEATSS.
Tu system prompt específico es:
{prompt_especifico}

Tienes acceso a herramientas locales para interactuar con la base de código. Puedes usar estas herramientas de forma iterativa antes de dar tu respuesta final:
1. `list_dir(path)`: Lista los contenidos de un directorio.
2. `read_file(path)`: Lee el contenido completo de un archivo de texto.
3. `read_file_lines(path, start_line, end_line)`: Lee únicamente un rango específico de líneas (1-indexed, inclusive) de un archivo. ¡Úsala preferentemente para archivos grandes para ahorrar tokens!
4. `write_file(path, content)`: Escribe o modifica un archivo de texto (requiere confirmación del usuario).

Para usar una herramienta, debes responder con un objeto JSON válido con la siguiente estructura:
{{
  "pensamiento": "Tu razonamiento detallado sobre qué información necesitas de la base de código o qué acción vas a tomar.",
  "tool_use": {{
    "tool": "list_dir" | "read_file" | "read_file_lines" | "write_file",
    "path": "ruta_relativa_del_archivo_o_directorio",
    "start_line": numero_linea_inicio (solo si tool es read_file_lines),
    "end_line": numero_linea_fin (solo si tool es read_file_lines),
    "content": "Contenido completo a escribir (solo si tool es write_file)"
  }}
}}

Cuando tengas toda la información necesaria y no requieras usar más herramientas, responde con tu solución final usando esta estructura:
{{
  "pensamiento": "Razonamiento final sobre la solución basada en el análisis.",
  "tool_use": {{
    "tool": "none"
  }},
  "respuesta": "Tu respuesta técnica detallada y solución final para el Director."
}}

IMPORTANTE: Responde estrictamente en formato JSON. No incluyas explicaciones de texto fuera del JSON. Si solicitas usar una herramienta, el sistema ejecutará la acción y te proporcionará la OBSERVACIÓN de retorno en el siguiente turno.
"""

SUBAGENT_PROMPTS = {
    "integrator": """
Eres el Agente de Integraciones y Firebase de BEATSS. Administras la base de datos (Firestore), autenticación de usuarios y pasarelas de pago.
Tus prioridades:
1. Diseñar y optimizar reglas de seguridad y consultas de Firestore.
2. Integrar pasarelas de pago y flujos seguros de checkout.
3. Asegurar la autenticación del frontend.
""",
    "data_engineer": """
Eres el Agente de Datos y Migraciones de BEATSS. Automatizas la importación de beats desde plataformas externas (como Beatstars) y gestionas respaldos físicos en formato JSON o CSV.
Tus prioridades:
1. Validar e importar archivos CSV del catálogo de Beats.
2. Gestionar respaldos locales JSON de base de datos sin corrupción.
3. Crear scripts rápidos de procesamiento de datos.
""",
    "document_expert": """
Eres el Agente de Documentos y PDF de BEATSS. Diseñas las plantillas de los contratos y aseguras una exportación impecable del PDF (estilos de impresión, márgenes, firmas alineadas y sin huérfanos).
Tus prioridades:
1. Ajustar el CSS de impresión y diseño de contratos en styles.css.
2. Asegurar que las variables de config.js se integren perfectamente en los PDFs.
""",
    "designer": """
Eres el Agente de Diseño y UI/UX de BEATSS. Diseñas interfaces web modernas con efectos glassmorphism, gradientes complejos, sombras de neón, tipografía Montserrat/Outfit y micro-animaciones en hover.
Tus prioridades:
1. Mantener los CSS Tokens unificados del Design System en styles.css.
2. Diseñar layouts de alta gama e interfaces responsivas.
""",
    "qa_tester": """
Eres el Agente de QA y Pruebas Unitarias de BEATSS. Diseñas y ejecutas planes de prueba automatizados y manuales de UI, cálculos matemáticos y flujos de negocio.
Tus prioridades:
1. Verificar cálculos de checkout, comisiones e impuestos.
2. Identificar y depurar bugs de la interfaz.
""",
    "seo_optimizer": """
Eres el Agente de SEO y Rendimiento Web de BEATSS. Optimizas los Core Web Vitals (LCP, INP), disminuyes tiempos de carga de bundles en Vite, configuras metadatos y estructuración JSON-LD de Google.
Tus prioridades:
1. Mejorar el rendimiento de carga y compresión de archivos estáticos.
2. Estructurar metadatos y microdatos Schema.org.
""",
    "security_ops": """
Eres el Agente de Seguridad y Operaciones de BEATSS. Proteges el backend y base de datos contra abusos, fugas de credenciales y escalado de privilegios.
Tus prioridades:
1. Auditar e implementar hardening en firestore.rules.
2. Asegurar el manejo seguro de tokens y variables de entorno del sistema.
""",
    "marketing_copywriter": """
Eres el Agente de Copywriting y Localización de BEATSS. Escribes textos persuasivos, correos automáticos transaccionales y localizas la web de forma bilingüe (Español/Inglés).
Tus prioridades:
1. Redactar textos persuasivos y de conversión para la landing page.
2. Asegurar que el glosario de términos bilingües sea exacto y coherente.
""",
    "business_analyst": """
Eres el Agente de Analítica de Negocio y Dashboard de BEATSS. Diseñas el panel del productor, contabilidad, y visualizaciones de ingresos y descargas.
Tus prioridades:
1. Calcular métricas comerciales complejas (LTV, MRR, conversiones).
2. Optimizar consultas para reportar estadísticas financieras del panel.
""",
    "automation_expert": """
Eres el Agente de Webhooks y Automatización de BEATSS. Conectas la plataforma con servicios de terceros como mensajería (Telegram) y envíos de correo transaccional (Resend/SendGrid).
Tus prioridades:
1. Conectar flujos de email marketing y boletines.
2. Alertar al productor en tiempo real sobre compras exitosas mediante webhooks.
""",
    "legal_advisor": """
Eres el Agente de Asesoría Legal y Derechos de Autor de BEATSS. Redactas y auditas términos contractuales, splits de regalías de autor (Composer/Writer) y licencias de beats.
Tus prioridades:
1. Ajustar cláusulas de distribución digital y Content ID de YouTube.
2. Asegurar la validez jurídica de contratos en config.js.
""",
    "support_helper": """
Eres el Agente de Soporte al Cliente y Guías de Uso de BEATSS. Diseñas los módulos de ayuda, guías de registro de regalías de autor y el panel de FAQ interactivo.
Tus prioridades:
1. Resolver dudas comunes y estructurar guías bilingües.
2. Escribir respuestas prediseñadas efectivas ante incidencias.
""",
    "mobile_developer": """
Eres el Agente de Desarrollo Mobile de BEATSS. Desarrollas la aplicación móvil nativa o híbrida del marketplace de beats y el generador de licencias.
Tus prioridades:
1. Integrar la app móvil con Firestore y Auth.
2. Optimizar reproductores de audio nativos en segundo plano.
""",
    "audio_dsp_expert": """
Eres el Agente de Audio y Procesamiento Digital de BEATSS. Creas el reproductor multipista web avanzado e implementas la reproducción de stems individuales.
Tus prioridades:
1. Conectar nodos de la Web Audio API para efectos de audio (faders, ecualizadores).
2. Optimizar la compresión y latencia de streaming.
""",
    "devops_admin": """
Eres el Agente de Infraestructura y DevOps de BEATSS. Administras servidores, flujos CI/CD en GitHub Actions, despliegues serverless en Vercel y optimización de bases de datos.
Tus prioridades:
1. Automatizar el despliegue del marketplace en Vercel.
2. Configurar alertas de salud del sistema y monitorear logs.
""",
    "refactor_expert": """
Eres el Agente de Refactorización Modular de BEATSS. Mantienes la arquitectura desacoplada del frontend (auth, player, catalog, checkout, editor, dashboard) y previenes dependencias circulares.
Tus prioridades:
1. Asegurar el aislamiento y cohesión de submódulos.
2. Garantizar que las variables y ruteo expuestos en window sean retrocompatibles.
""",
    "obsidian_expert": """
Eres el Agente de Obsidian y Gestión del Conocimiento de BEATSS. Mantienes estructurada la documentación de la bóveda (/Users/sossa/IA), el dashboard de control y los enlaces bidireccionales.
Tus prioridades:
1. Organizar reportes en carpetas por categoría (docs/10_Pagos, docs/20_Soporte, etc.).
2. Mantener Dashboard BEATSS.md limpio y excluir archivos no deseados.
""",
    "token_optimizer": """
Eres el Agente de Eficiencia de Tokens y Gestión de Contexto de BEATSS. Tu misión es maximizar la inteligencia de la plataforma minimizando el consumo de tokens en los prompts.
Tus prioridades:
1. Analizar la base de código para proponer divisiones de archivos y refactorizaciones que reduzcan el tamaño físico del código.
2. Recomendar estructuras de notas atómicas en Obsidian.
3. Optimizar las llamadas en agente_coordinador.py promoviendo la lectura por rangos de líneas (read_file_lines) en lugar de lecturas completas.
""",
    "growth_hacker": """
Eres el Agente de Tráfico, Ventas y Embudos de Conversión (Growth Hacker) de BEATSS. Tu misión es maximizar las ventas de beats atrayendo artistas y optimizando el embudo de checkout.
Tus prioridades:
1. Diseñar lead magnets (beats gratis a cambio de correos) y automatizaciones de email marketing.
2. Analizar el checkout para reducir fricción y aumentar conversiones.
3. Proponer promociones, packs y descuentos efectivos en la tienda.
"""
}

SYNTHESIS_PROMPT = """
Eres el Agente Principal (Director de Proyecto) de BEATSS.
Has consultado a tus subagentes especializados y has recibido sus respuestas y cambios realizados.
Ahora debes presentarle una respuesta final consolidada, profesional y amigable al usuario en español.
Explica detalladamente lo que hicieron o propusieron los subagentes para resolver su requerimiento.

Requerimiento del usuario: {user_query}

Resultados de los subagentes consultados:
{subagent_responses}

Genera la respuesta final consolidada para el usuario.
"""

AGENT_COLORS = {
    "integrator": C_GREEN,
    "data_engineer": C_CYAN,
    "document_expert": C_BLUE,
    "designer": C_MAGENTA,
    "qa_tester": C_YELLOW,
    "seo_optimizer": C_GREEN,
    "security_ops": C_RED,
    "marketing_copywriter": C_CYAN,
    "business_analyst": C_YELLOW,
    "automation_expert": C_MAGENTA,
    "legal_advisor": C_RED,
    "support_helper": C_GREEN,
    "mobile_developer": C_CYAN,
    "audio_dsp_expert": C_YELLOW,
    "devops_admin": C_RED,
    "refactor_expert": C_CYAN,
    "obsidian_expert": C_MAGENTA,
    "token_optimizer": C_BLUE,
    "growth_hacker": C_MAGENTA
}

def GET_COLOR_FOR_ROL(rol):
    return AGENT_COLORS.get(rol.lower().strip(), C_WHITE)

def call_gemini(system_instruction, user_content, response_json=False):
    """Realiza una petición HTTP directa al API de Gemini."""
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
    
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        print(f"\n{C_RED}❌ Error del API de Gemini: {e.read().decode('utf-8')}{C_RESET}")
        return None
    except Exception as e:
        print(f"\n{C_RED}❌ Error de red: {str(e)}{C_RESET}")
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

def get_safe_path(path):
    """Resuelve y valida que la ruta se encuentre dentro del repositorio del proyecto."""
    # El directorio base es donde está este script
    base_dir = os.path.dirname(os.path.abspath(__file__))
    path = os.path.normpath(path)
    
    if os.path.isabs(path):
        if not path.startswith(base_dir):
            return None
        return path
        
    full_path = os.path.abspath(os.path.join(base_dir, path))
    if not full_path.startswith(base_dir):
        return None
    return full_path

def run_tool_read_file(path):
    safe_path = get_safe_path(path)
    if not safe_path:
        return "Error: Acceso denegado. No puedes leer archivos fuera del proyecto."
        
    if not os.path.exists(safe_path):
        return f"Error: El archivo '{path}' no existe."
        
    if os.path.isdir(safe_path):
        return f"Error: '{path}' es un directorio. Usa list_dir en su lugar."
        
    try:
        with open(safe_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(100000) # Límite de 100KB para el contexto
            if len(content) == 100000:
                content += "\n... [Contenido truncado por tamaño] ..."
            return content
    except Exception as e:
        return f"Error al leer el archivo: {str(e)}"

def run_tool_read_file_lines(path, start_line, end_line):
    safe_path = get_safe_path(path)
    if not safe_path:
        return "Error: Acceso denegado. No puedes leer archivos fuera del proyecto."
        
    if not os.path.exists(safe_path):
        return f"Error: El archivo '{path}' no existe."
        
    if os.path.isdir(safe_path):
        return f"Error: '{path}' es un directorio. Usa list_dir en su lugar."
        
    try:
        start = int(start_line)
        end = int(end_line)
    except (ValueError, TypeError):
        return "Error: start_line y end_line deben ser números enteros válidos."
        
    try:
        with open(safe_path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.readlines()
            
        start_idx = max(0, start - 1)
        end_idx = min(len(lines), end)
        
        if start_idx >= len(lines) or start_idx > end_idx:
            return f"Error: Rango de líneas {start}-{end} fuera de límites. El archivo tiene {len(lines)} líneas."
            
        content = "".join(lines[start_idx:end_idx])
        return f"[Líneas {start_idx+1} a {end_idx} de {len(lines)} del archivo '{path}']:\n{content}"
    except Exception as e:
        return f"Error al leer rango de líneas: {str(e)}"

def run_tool_list_dir(path):
    safe_path = get_safe_path(path)
    if not safe_path:
        return "Error: Acceso denegado. No puedes listar directorios fuera del proyecto."
        
    if not os.path.exists(safe_path):
        return f"Error: El directorio '{path}' no existe."
        
    if not os.path.isdir(safe_path):
        return f"Error: '{path}' es un archivo. Usa read_file en su lugar."
        
    try:
        entries = os.listdir(safe_path)
        result = []
        for entry in entries:
            # Filtrar archivos ruidosos de desarrollo
            if entry in [".git", "node_modules", ".venv", ".vercel", "dist", ".DS_Store"]:
                continue
            entry_path = os.path.join(safe_path, entry)
            is_dir = os.path.isdir(entry_path)
            prefix = "[DIR] " if is_dir else "[FILE] "
            result.append(f"{prefix}{entry}")
        return "\n".join(result) if result else "[Directorio vacío]"
    except Exception as e:
        return f"Error al listar el directorio: {str(e)}"

def run_tool_write_file(rol, path, content):
    safe_path = get_safe_path(path)
    if not safe_path:
        return "Error: Acceso denegado. No puedes escribir archivos fuera del proyecto."
        
    # Preguntar confirmación interactiva
    print(f"\n{C_RED}{C_BOLD}⚠️  ATENCIÓN: El Agente [{rol}] solicita modificar/crear el archivo: {C_YELLOW}{path}{C_RESET}")
    print(f"{C_GRAY}--- Vista Previa del Cambio (primeras 15 líneas) ---{C_RESET}")
    lines = content.split("\n")
    for line in lines[:15]:
        print(f"  {line}")
    if len(lines) > 15:
        print(f"  ... ({len(lines) - 15} líneas más) ...")
    print(f"{C_GRAY}----------------------------------------------------{C_RESET}")
    
    while True:
        try:
            choice = input(f"{C_BOLD}{C_WHITE}¿Deseas permitir esta escritura en tu sistema? (s/n): {C_RESET}").strip().lower()
            if choice == "s":
                break
            elif choice == "n":
                print(f"❌ Escritura en {path} rechazada por el usuario.")
                return "Operación de escritura cancelada por el usuario."
        except (KeyboardInterrupt, EOFError):
            print(f"\n❌ Cancelado.")
            return "Operación de escritura cancelada."
            
    try:
        # Asegurar directorios padres si no existen
        os.makedirs(os.path.dirname(safe_path), exist_ok=True)
        with open(safe_path, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"✓ Archivo {path} guardado exitosamente.")
        return f"Archivo '{path}' modificado exitosamente."
    except Exception as e:
        return f"Error al escribir el archivo: {str(e)}"

def format_conversation_for_llm(history):
    """Convierte el historial de turnos en una cadena de texto plana."""
    formatted = ""
    for turn in history:
        role = turn["role"]
        content = turn["content"]
        if role == "user":
            formatted += f"\n[Usuario / Observación de Herramienta]:\n{content}\n"
        elif role == "model":
            formatted += f"\n[Tu respuesta JSON anterior]:\n{content}\n"
    return formatted

def execute_subagent_react_loop(rol, prompt_especifico, consulta):
    """Ejecuta el loop ReAct (Reasoning + Acting) para que el subagente use herramientas locales."""
    system_instruction = SUBAGENT_BASE_PROMPT.format(rol=rol, prompt_especifico=prompt_especifico)
    
    conversation_history = [
        {"role": "user", "content": consulta}
    ]
    
    max_iterations = 6
    color = GET_COLOR_FOR_ROL(rol)
    
    for iteration in range(max_iterations):
        user_content = format_conversation_for_llm(conversation_history)
        
        # Llamar a Gemini exigiendo JSON de forma nativa
        response_text = call_gemini(system_instruction, user_content, response_json=True)
        if not response_text:
            return f"Error al comunicarse con el Agente de {rol}."
            
        agent_decision = clean_and_parse_json(response_text)
        if not agent_decision:
            # Fallback en caso de que no devuelva JSON válido
            return f"El Agente de {rol} falló al responder en formato estructurado:\n{response_text}"
            
        pensamiento = agent_decision.get("pensamiento", "")
        tool_use = agent_decision.get("tool_use", {})
        tool_name = tool_use.get("tool", "none")
        tool_path = tool_use.get("path", "")
        tool_content = tool_use.get("content", "")
        
        print(f"{color}[Agente {rol}] 🧠 Pensamiento: {C_GRAY}{pensamiento}{C_RESET}")
        
        if tool_name == "none" or not tool_name:
            # El agente ya terminó su análisis y devuelve su respuesta
            return agent_decision.get("respuesta", "Operación completada.")
            
        # Ejecutar herramienta
        print(f"{color}[Agente {rol}] 🛠  Herramienta: {C_BOLD}{tool_name}{C_RESET} ➔ {C_CYAN}{tool_path}{C_RESET}")
        
        observation = ""
        if tool_name == "read_file":
            observation = run_tool_read_file(tool_path)
        elif tool_name == "read_file_lines":
            start_line = tool_use.get("start_line", 1)
            end_line = tool_use.get("end_line", 100)
            observation = run_tool_read_file_lines(tool_path, start_line, end_line)
        elif tool_name == "list_dir":
            observation = run_tool_list_dir(tool_path)
        elif tool_name == "write_file":
            observation = run_tool_write_file(rol, tool_path, tool_content)
        else:
            observation = f"Error: La herramienta '{tool_name}' no está disponible."
            
        # Registrar el paso en el historial
        conversation_history.append({"role": "model", "content": response_text})
        conversation_history.append({"role": "user", "content": f"OBSERVACIÓN de {tool_name}:\n{observation}"})
        
    return f"Se alcanzó el límite de iteraciones (ReAct) del Agente de {rol} sin solución definitiva."

def main():
    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}   BEATSS - SISTEMA DE ORQUESTACIÓN MULTI-AGENTE AUTÓNOMO      {C_RESET}")
    print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_GRAY}Gemini API conectada exitosamente (con soporte de 18 subagentes y herramientas).{C_RESET}")
    print(f"Escribe tus requerimientos. Los agentes podrán leer y proponer cambios de código.")
    print(f"Escribe {C_RED}'salir'{C_RESET} para terminar.\n")

    while True:
        try:
            user_input = input(f"{C_BOLD}{C_WHITE}Tú: {C_RESET}")
            if user_input.strip().lower() == "salir":
                print(f"\n{C_CYAN}¡Hasta luego!{C_RESET}")
                break
            
            if not user_input.strip():
                continue
            
            print(f"\n{C_CYAN}{C_BOLD}🔍 [Agente Enrutador] Clasificando requerimiento...{C_RESET}")
            
            # 0. Llamar al Agente Enrutador
            router_text = call_gemini(ROUTER_AGENT_PROMPT, user_input, response_json=True)
            if not router_text:
                continue
            
            router_decision = clean_and_parse_json(router_text)
            if not router_decision:
                router_decision = {"routing_decision": "DELEGATE", "pensamiento": "Fallo al parsear JSON del enrutador. Delegando por seguridad."}
            
            print(f"{C_CYAN}🧠 Pensamiento del Enrutador: {C_GRAY}{router_decision.get('pensamiento', 'Ninguno')}{C_RESET}")
            print(f"{C_CYAN}🎯 Decisión de Enrutamiento: {C_GREEN if router_decision.get('routing_decision') == 'DIRECT' else C_YELLOW}{router_decision.get('routing_decision')}{C_RESET}")
            
            if router_decision.get("routing_decision") == "DIRECT":
                resp_directa = router_decision.get("respuesta_directa", "Hola. ¿En qué puedo ayudarte hoy?")
                print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}   RESPUESTA DIRECTA (BEATSS)                                  {C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_WHITE}{resp_directa}{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}\n")
                continue

            print(f"\n{C_CYAN}{C_BOLD}🔍 [Agente Principal] Analizando requerimiento...{C_RESET}")
            
            # 1. Llamar al Agente Principal para determinar delegación
            decision_text = call_gemini(MAIN_AGENT_PROMPT, user_input, response_json=True)
            if not decision_text:
                continue
            
            decision = clean_and_parse_json(decision_text)
            if not decision:
                print(f"{C_RED}⚠️ Error al parsear decisión del Agente Principal. Respuesta cruda:{C_RESET}")
                print(decision_text)
                continue
            
            print(f"{C_CYAN}🧠 Pensamiento: {C_GRAY}{decision.get('pensamiento', 'Ninguno')}{C_RESET}")
            
            delegados = decision.get("delegados", [])
            respuestas_subagentes = []
            
            # 2. Procesar cada subagente delegado en su ReAct loop
            if delegados:
                for delg in delegados:
                    rol = delg.get("rol", "").lower().strip()
                    consulta = delg.get("consulta")
                    
                    if rol not in SUBAGENT_PROMPTS:
                        print(f"⚠️ Subagente '{rol}' no encontrado en el sistema.")
                        continue
                    
                    color_rol = GET_COLOR_FOR_ROL(rol)
                    print(f"\n{color_rol}{C_BOLD}🤝 [Delegando a Agente de {rol.upper()}]...{C_RESET}")
                    print(f"{color_rol}↳ Consulta: {C_GRAY}{consulta}{C_RESET}")
                    
                    # Ejecutar ReAct loop para el subagente
                    resp_sub = execute_subagent_react_loop(rol.upper(), SUBAGENT_PROMPTS[rol], consulta)
                    
                    if resp_sub:
                        print(f"{color_rol}✓ Respuesta final del Agente {rol.upper()} recibida.{C_RESET}")
                        respuestas_subagentes.append(f"--- RESPUESTA DEL AGENTE DE {rol.upper()} ---\n{resp_sub}\n")
                    else:
                        print(f"{C_RED}❌ Sin respuesta del Agente de {rol.upper()}.{C_RESET}")
            else:
                print(f"{C_CYAN}ℹ️ El requerimiento se responderá de forma directa.{C_RESET}")
            
            # 3. Sintetizar respuesta final (aquí no exigimos JSON para permitir texto libre en markdown)
            print(f"\n{C_CYAN}{C_BOLD}✍️ [Agente Principal] Consolidando respuesta final...{C_RESET}")
            
            subagents_data = "\n".join(respuestas_subagentes) if respuestas_subagentes else "Ningún subagente fue consultado."
            synthesis_content = SYNTHESIS_PROMPT.format(user_query=user_input, subagent_responses=subagents_data)
            
            final_response = call_gemini("Eres el Agente Principal de BEATSS.", synthesis_content, response_json=False)
            
            if final_response:
                print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}   RESPUESTA DEL DIRECTOR DE PROYECTO (BEATSS)                 {C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_WHITE}{final_response}{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}\n")
            
        except (KeyboardInterrupt, EOFError):
            print(f"\n\n{C_CYAN}Programa finalizado. ¡Hasta luego!{C_RESET}")
            break

if __name__ == "__main__":
    main()
