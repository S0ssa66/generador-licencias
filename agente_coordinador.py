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
20. `rights_manager`: Reclamaciones de copyright, disputas de Content ID y whitelisting de YouTube.
21. `branding_specialist`: Marca personal de Sossa, relaciones públicas, outreach y redes sociales.
22. `sri_tax_advisor`: Asesoría tributaria del SRI (Ecuador), facturación electrónica, firma .p12 (XAdES-BES) y RIDE PDF.
23. `licensing_negotiator`: Negociación de ofertas por licencias exclusivas en el panel "Hacer Oferta" (márgenes y contrapropuestas).
24. `beatstars_sync_expert`: Sincronización automática bidireccional de catálogos y licencias con la API y cuenta de Beatstars.


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

--- MEMORIA A LARGO PLAZO ---
Esta es tu memoria de ejecuciones y decisiones previas (recuperada del disco):
{memoria_persistente}
-----------------------------

Tienes acceso a herramientas locales para interactuar con la base de código. Puedes usar estas herramientas de forma iterativa antes de dar tu respuesta final:
1. `list_dir(path)`: Lista los contenidos de un directorio.
2. `read_file(path)`: Lee el contenido completo de un archivo de texto.
3. `read_file_lines(path, start_line, end_line)`: Lee únicamente un rango específico de líneas (1-indexed, inclusive) de un archivo. ¡Úsala preferentemente para archivos grandes para ahorrar tokens!
4. `search_grep(pattern)`: Busca un patrón de texto de forma global en todos los archivos del proyecto. ¡Úsala para ubicar funciones, variables o lógica en segundos!
5. `write_file(path, content)`: Escribe o modifica un archivo de texto (requiere confirmación del usuario).

Para usar una herramienta, debes responder con un objeto JSON válido con la siguiente estructura:
{{
  "pensamiento": "Tu razonamiento detallado sobre qué información necesitas de la base de código o qué acción vas a tomar.",
  "tool_use": {{
    "tool": "list_dir" | "read_file" | "read_file_lines" | "search_grep" | "write_file",
    "path": "ruta_relativa_del_archivo_o_directorio" (para list_dir, read_file, read_file_lines, write_file),
    "pattern": "patrón_de_búsqueda" (solo si la tool es search_grep),
    "start_line": numero_linea_inicio (solo si tool es read_file_lines),
    "end_line": numero_linea_fin (solo si tool es read_file_lines),
    "content": "Contenido completo a escribir (solo si tool es write_file)"
  }}
}}

Cuando tengas toda la información necesaria y no requieras usar más herramientas, responde con tu solución final.
Si consideras que has hecho o descubierto algo relevante sobre el proyecto que necesitas recordar para tus futuras ejecuciones de este rol, describe brevemente esa información en "actualizar_memoria" (máximo 3-4 líneas). Esta información se inyectará en tu prompt en ejecuciones futuras.

Estructura de respuesta final:
{{
  "pensamiento": "Razonamiento final sobre la solución basada en el análisis.",
  "tool_use": {{
    "tool": "none"
  }},
  "respuesta": "Tu respuesta técnica detallada y solución final para el Director.",
  "actualizar_memoria": "Lo que deseas recordar para futuras consultas de este rol (opcional, máximo 3-4 líneas)."
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
""",
    "rights_manager": """
Eres el Agente Gestor de Derechos y Reclamaciones de Copyright (Rights Manager) de BEATSS. Tu misión es estructurar y automatizar los procesos de resolución de disputas de Content ID de YouTube y la gestión de listas blancas.
Tus prioridades:
1. Diseñar políticas para evitar reclamos cruzados de copyright entre compradores de beats no exclusivos.
2. Estructurar flujos técnicos para automatizar el "whitelisting" de canales de YouTube de los artistas licenciados.
3. Crear plantillas de respuesta legal y técnica para liberar reclamos.
""",
    "branding_specialist": """
Eres el Agente Especialista en Marca Personal y Relaciones Públicas (Branding Specialist) de Sossa y BEATSS. Tu misión es potenciar la marca personal del productor en la escena y atraer artistas de alto nivel.
Tus prioridades:
1. Definir la estética, tono de comunicación y narrativa (storytelling) para las redes sociales oficiales.
2. Redactar plantillas de acercamiento persuasivas (outreach) para proponer coproducciones.
3. Diseñar estrategias de lanzamientos discográficos liderados por el productor.
""",
    "sri_tax_advisor": """
Eres el Agente Especialista en Facturación Electrónica y Asesoría Tributaria del SRI de BEATSS. Tu misión es estructurar, auditar y resolver problemas de facturación, firma de XMLs (XAdES-BES) con certificados .p12 y la transmisión de facturas al SRI.
Tus prioridades:
1. Validar e implementar reglas de facturación electrónica del SRI (Ecuador).
2. Auditar la generación del XML v2.1.0 y la firma digital XAdES-BES.
3. Diagnosticar problemas de red SOAP, rechazos del SRI y validación de secuenciales.
4. Asegurar que las representaciones impresas (RIDE PDF) sean legibles, estéticas y normativas.
""",
    "licensing_negotiator": """
Eres el Agente Negociador de Licencias Exclusivas de BEATSS. Evalúas contraofertas de licencias exclusivas en el panel "Hacer Oferta" calculando márgenes de ganancia mínimos, comisiones de pasarela e historial comercial, y sugieres contrapropuestas.
Tus prioridades:
1. Analizar ofertas de compra enviadas por artistas en el panel "Hacer Oferta".
2. Calcular márgenes de ganancia mínimos aceptables y comisiones bancarias.
3. Generar contrapropuestas persuasivas y profesionales para cerrar la negociación de forma automática.
""",
    "beatstars_sync_expert": """
Eres el Agente de Sincronización Beatstars de BEATSS. Mantienes la consistencia bidireccional en tiempo real entre BEATSS y Beatstars (precios, licencias activas, archivos, tags).
Tus prioridades:
1. Importar y parsear metadatos de nuevos beats subidos a Beatstars.
2. Sincronizar precios, descuentos y estados de licencias (especialmente el estado "Vendido" de licencias exclusivas).
3. Monitorear inconsistencias en los catálogos y resolver duplicidades.
"""
}

SYNTHESIS_PROMPT = """
Eres el Agente Principal (Director de Proyecto) de BEATSS.
Has consultado a tus subagentes especializados y has recibido sus respuestas y cambios realizados.
Ahora debes presentarle una respuesta final consolidada, profesional y amigable al usuario en español.
Explica detalladamente lo que hicieron o propusieron los subagentes para resolver su requerimiento.

--- HISTORIAL DE LA CONVERSACIÓN DE LA SESIÓN ---
{historial_conversacion}
------------------------------------------------

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
    "growth_hacker": C_MAGENTA,
    "rights_manager": C_RED,
    "branding_specialist": C_CYAN,
    "sri_tax_advisor": C_BLUE,
    "licensing_negotiator": C_YELLOW,
    "beatstars_sync_expert": C_GREEN
}

def GET_COLOR_FOR_ROL(rol):
    return AGENT_COLORS.get(rol.lower().strip(), C_WHITE)

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
                # Intentar extraer el tiempo sugerido de espera del mensaje si existe
                try:
                    err_json = json.loads(error_body)
                    msg = err_json.get("error", {}).get("message", "")
                    if "retry in" in msg.lower():
                        # Ejemplo: "Please retry in 30.347492713s."
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
            print(f"\n{C_RED}❌ Error de red: {str(e)}{C_RESET}")
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

def get_safe_path(path):
    """Resuelve y valida que la ruta se encuentre dentro de la bóveda de Obsidian (/Users/sossa/IA)."""
    # El directorio base es donde está este script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # Permitir acceso al directorio padre (bóveda de Obsidian)
    base_dir = os.path.dirname(script_dir)
    path = os.path.normpath(path)
    
    if os.path.isabs(path):
        if not path.startswith(base_dir):
            return None
        return path
        
    full_path = os.path.abspath(os.path.join(script_dir, path))
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
        file_size = os.path.getsize(safe_path)
        # Límite de 20KB para forzar lectura parcial en archivos grandes
        if file_size > 20480:
            return f"Error: El archivo '{path}' es demasiado grande ({file_size / 1024:.1f} KB). Por cuestiones de eficiencia de tokens y límites de la API (como el Error 429), la lectura completa de archivos mayores a 20 KB está deshabilitada. Por favor, utiliza la herramienta 'read_file_lines' indicando un rango de líneas específico (ej. start_line=1, end_line=150) para examinar este archivo en partes."
            
        with open(safe_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
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
    """Convierte el historial de turnos en una cadena de texto plana, optimizando el contexto de archivos antiguos."""
    formatted = ""
    last_user_index = -1
    
    # Encontrar el índice del último mensaje del usuario/herramienta
    for i in range(len(history) - 1, -1, -1):
        if history[i]["role"] == "user":
            last_user_index = i
            break
            
    for idx, turn in enumerate(history):
        role = turn["role"]
        content = turn["content"]
        
        if role == "user":
            # Si es una observación de lectura de archivo antigua (no es el último mensaje del usuario)
            if idx != last_user_index and ("OBSERVACIÓN de read_file" in content or "OBSERVACIÓN de read_file_lines" in content):
                # Extraer la primera línea para mostrar qué archivo se leyó
                file_info = "Lectura de archivo"
                for line in content.split("\n"):
                    if "OBSERVACIÓN de" in line:
                        file_info = line.strip()
                        break
                content = f"{file_info}\n[Contenido largo del archivo omitido para ahorrar tokens en turnos históricos]"
                
            formatted += f"\n[Usuario / Observación de Herramienta]:\n{content}\n"
        elif role == "model":
            formatted += f"\n[Tu respuesta JSON anterior]:\n{content}\n"
    return formatted

# Rutas de persistencia de memoria
SESSION_MEMORY_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "session_memory.json")
SUBAGENT_MEMORIES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "subagent_memories.json")

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

def run_tool_search_grep(pattern):
    """Busca un patrón de texto en todos los archivos del proyecto de forma rápida y segura."""
    if not pattern:
        return "Error: Debes proporcionar un patrón de búsqueda."
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    matches = []
    max_matches = 30
    
    for root, dirs, files in os.walk(base_dir):
        # Excluir carpetas de desarrollo ruidosas
        dirs[:] = [d for d in dirs if d not in [".git", "node_modules", ".venv", ".vercel", "dist"]]
        
        for file in files:
            # Excluir binarios y archivos de datos irrelevantes
            if file.endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".tar", ".gz", ".db", ".sqlite", ".DS_Store", "session_memory.json", "subagent_memories.json")):
                continue
                
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, base_dir)
            
            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    for line_num, line in enumerate(f, 1):
                        if pattern.lower() in line.lower():
                            matches.append(f"{rel_path}:{line_num}: {line.strip()}")
                            if len(matches) >= max_matches:
                                return f"[Se muestran las primeras {max_matches} coincidencias para '{pattern}']:\n" + "\n".join(matches) + "\n... (más coincidencias encontradas)"
            except Exception:
                continue
                
    if not matches:
        return f"No se encontraron coincidencias para '{pattern}' en el proyecto."
        
    return f"[Coincidencias encontradas para '{pattern}']:\n" + "\n".join(matches)

def execute_subagent_react_loop(rol, prompt_especifico, consulta):
    """Ejecuta el loop ReAct (Reasoning + Acting) para que el subagente use herramientas locales."""
    memoria_persistente = get_subagent_memory(rol)
    system_instruction = SUBAGENT_BASE_PROMPT.format(
        rol=rol, 
        prompt_especifico=prompt_especifico,
        memoria_persistente=memoria_persistente
    )
    
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
            # Guardar/actualizar la memoria persistente del agente si solicita recordar algo nuevo
            nueva_memoria = agent_decision.get("actualizar_memoria")
            if nueva_memoria:
                print(f"{color}[Agente {rol}] 💾 Recordando: {C_GRAY}{nueva_memoria}{C_RESET}")
                save_subagent_memory(rol, nueva_memoria)
            
            # El agente ya terminó su análisis y devuelve su respuesta
            return agent_decision.get("respuesta", "Operación completada.")
            
        # Ejecutar herramienta
        if tool_name == "search_grep":
            pattern = tool_use.get("pattern", "")
            print(f"{color}[Agente {rol}] 🛠  Herramienta: {C_BOLD}{tool_name}{C_RESET} ➔ Buscando: '{pattern}'{C_RESET}")
        else:
            print(f"{color}[Agente {rol}] 🛠  Herramienta: {C_BOLD}{tool_name}{C_RESET} ➔ {C_CYAN}{tool_path}{C_RESET}")
        
        observation = ""
        if tool_name == "read_file":
            observation = run_tool_read_file(tool_path)
        elif tool_name == "read_file_lines":
            start_line = tool_use.get("start_line", 1)
            end_line = tool_use.get("end_line", 100)
            observation = run_tool_read_file_lines(tool_path, start_line, end_line)
        elif tool_name == "search_grep":
            pattern = tool_use.get("pattern", "")
            observation = run_tool_search_grep(pattern)
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

def run_agent_pipeline(user_query, progress_callback=None):
    """
    Ejecuta todo el pipeline de enrutamiento, delegación, ejecución ReAct y síntesis.
    Permite un progress_callback(mensaje_progreso) para actualizar el estado externamente.
    """
    def log_progress(msg):
        if progress_callback:
            progress_callback(msg)
        else:
            print(msg)

    # 1. Cargar historial de conversación de la sesión
    historial = load_session_memory()
    memoria_historica_str = summarize_history_if_needed(historial)
    
    historial_str = ""
    if historial:
        historial_str = memoria_historica_str
        historial_str += "--- HISTORIAL RECIENTE DEL CHAT (MEMORIA DE SESIÓN) ---\n"
        # Mantener de forma explícita solo los últimos 4 turnos para no saturar y delegar el resto al resumen
        ultimos_turnos = historial[-4:]
        for turno in ultimos_turnos:
            historial_str += f"Usuario: {turno.get('usuario', '')}\nBEATSS: {turno.get('asistente', '')}\n\n"
        historial_str += "------------------------------------------------------\n\n"
        
    user_input_con_historial = f"{historial_str}Consulta actual: {user_query}"
    
    log_progress("[Agente Enrutador] Clasificando requerimiento...")
    
    # 2. Enrutador
    router_text = call_gemini(ROUTER_AGENT_PROMPT, user_input_con_historial, response_json=True)
    if not router_text:
        return "Error al clasificar la consulta (Enrutador sin respuesta)."
        
    router_decision = clean_and_parse_json(router_text)
    if not router_decision:
        router_decision = {"routing_decision": "DELEGATE", "pensamiento": "Fallo al parsear JSON del enrutador. Delegando por seguridad."}
        
    if router_decision.get("routing_decision") == "DIRECT":
        resp_directa = router_decision.get("respuesta_directa", "Hola. ¿En qué puedo ayudarte hoy?")
        # Guardar en memoria de sesión
        historial.append({"usuario": user_query, "asistente": resp_directa})
        save_session_memory(historial)
        return resp_directa
        
    log_progress("[Agente Principal] Analizando requerimiento y decidiendo delegación...")
    
    # 3. Agente Principal
    decision_text = call_gemini(MAIN_AGENT_PROMPT, user_input_con_historial, response_json=True)
    if not decision_text:
        return "Error al analizar la consulta (Director sin respuesta)."
        
    decision = clean_and_parse_json(decision_text)
    if not decision:
        return "Error: Respuesta inválida del Agente Principal al decidir delegaciones."
        
    delegados = decision.get("delegados", [])
    respuestas_subagentes = []
    
    # 4. Procesar delegaciones
    if delegados:
        for idx, delg in enumerate(delegados, 1):
            rol = delg.get("rol", "").lower().strip()
            consulta = delg.get("consulta")
            
            if rol not in SUBAGENT_PROMPTS:
                log_progress(f"⚠️ Subagente '{rol}' no encontrado en el sistema.")
                continue
                
            log_progress(f"[Agente Principal] Delegando tarea ({idx}/{len(delegados)}) al Agente de {rol.upper()}...")
            
            # Ejecutar ReAct loop para el subagente
            resp_sub = execute_subagent_react_loop(rol.upper(), SUBAGENT_PROMPTS[rol], consulta)
            
            if resp_sub:
                respuestas_subagentes.append(f"--- RESPUESTA DEL AGENTE DE {rol.upper()} ---\n{resp_sub}\n")
            else:
                log_progress(f"❌ Sin respuesta del Agente de {rol.upper()}.")
    else:
        log_progress("[Agente Principal] No se requirió delegar a subagentes especialistas.")
        
    log_progress("[Agente Principal] Consolidando y sintetizando respuesta final...")
    
    # 5. Sintetizar respuesta
    subagents_data = "\n".join(respuestas_subagentes) if respuestas_subagentes else "Ningún subagente fue consultado."
    synthesis_content = SYNTHESIS_PROMPT.format(
        historial_conversacion=historial_str if historial_str else "Sin historial de conversación previo en esta sesión.",
        user_query=user_query, 
        subagent_responses=subagents_data
    )
    
    final_response = call_gemini("Eres el Agente Principal de BEATSS.", synthesis_content, response_json=False)
    
    if final_response:
        # Guardar en memoria de sesión
        historial.append({"usuario": user_query, "asistente": final_response})
        save_session_memory(historial)
        return final_response
    else:
        return "Error al consolidar la respuesta final."

def main():
    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}   BEATSS - SISTEMA DE ORQUESTACIÓN MULTI-AGENTE AUTÓNOMO      {C_RESET}")
    print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_GRAY}Gemini API conectada (soporte de 21 subagentes, memorias y search_grep).{C_RESET}")
    print(f"Escribe tus requerimientos. Los agentes recordarán el historial de conversación.")
    print(f"Comandos especiales: {C_GREEN}'limpiar'{C_RESET} (reinicia memorias de sesión y subagentes) o {C_RED}'salir'{C_RESET}.\n")

    while True:
        try:
            user_input = input(f"{C_BOLD}{C_WHITE}Tú: {C_RESET}")
            if user_input.strip().lower() == "salir":
                print(f"\n{C_CYAN}¡Hasta luego!{C_RESET}")
                break
            
            if user_input.strip().lower() in ["limpiar", "reset", "clear"]:
                if os.path.exists(SESSION_MEMORY_FILE):
                    os.remove(SESSION_MEMORY_FILE)
                if os.path.exists(SUBAGENT_MEMORIES_FILE):
                    os.remove(SUBAGENT_MEMORIES_FILE)
                print(f"\n{C_GREEN}✓ Memorias del Agent OS (sesión y subagentes) reiniciadas correctamente.{C_RESET}\n")
                continue
            
            if not user_input.strip():
                continue
            
            # Callback para mostrar los avances en la interfaz CLI
            def cli_progress_callback(msg):
                print(f"{C_CYAN}➔ {msg}{C_RESET}")
                
            final_response = run_agent_pipeline(user_input, cli_progress_callback)
            
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
