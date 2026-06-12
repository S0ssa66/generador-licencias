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
MAIN_AGENT_PROMPT = """
Eres el Agente Principal (Director de Proyecto) de BEATSS. Tu objetivo es coordinar y resolver los requerimientos del usuario delegando a los subagentes adecuados.
Tienes disponibles los siguientes subagentes especialistas:
1. Agente de Diseño (DISEÑO): Experto en CSS, maquetación visual, glassmorphism, paleta de colores y branding.
2. Agente de Contabilidad y Finanzas (CONTABILIDAD): Experto en pasarelas de pago, cálculo de descuentos, impuestos y registros de transacciones.
3. Agente de Desarrollo de Software (PROGRAMACIÓN): Experto en Javascript, integraciones de base de datos Firebase y validación de código.
4. Agente de Seguridad y Auditoría (SEGURIDAD): Experto en seguridad de Firebase, protección de credenciales, sanitización y validación de reglas de acceso.

Dado el requerimiento del usuario, debes decidir a quién(es) delegar y qué preguntarles.
Responde estrictamente en formato JSON con la siguiente estructura:
{
  "pensamiento": "Tu razonamiento interno sobre cómo abordar el problema.",
  "delegados": [
    {
      "rol": "DISEÑO" | "CONTABILIDAD" | "PROGRAMACIÓN" | "SEGURIDAD",
      "consulta": "La consulta específica y detallada que le haces al subagente."
    }
  ]
}
Si no necesitas delegar nada porque es una pregunta general o simple, la lista de "delegados" puede estar vacía.
No agregues explicaciones fuera del JSON.
"""

SUBAGENT_PROMPTS = {
    "DISEÑO": """
Eres el Agente de Diseño de BEATSS. Eres un experto en UI/UX moderna, CSS, paletas de colores (HSL/Hex), glassmorphism, animaciones y maquetación visual.
Responde de forma detallada y técnica sobre cómo mejorar o implementar la parte visual del requerimiento solicitado.
""",
    "CONTABILIDAD": """
Eres el Agente de Contabilidad y Finanzas de BEATSS. Eres experto en pasarelas de pago (PayPal, Deuna, Transferencia), cálculo preciso de porcentajes, cupones de descuento, impuestos y transacciones en base de datos.
Responde de forma detallada y matemática al requerimiento solicitado.
""",
    "PROGRAMACIÓN": """
Eres el Agente de Desarrollo de Software de BEATSS. Eres experto en Javascript, estructura de Firebase Firestore, APIs y optimización de código.
Responde de forma técnica y detallada con fragmentos de código, explicaciones estructuradas y pasos de implementación.
""",
    "SEGURIDAD": """
Eres el Agente de Seguridad y Auditoría de BEATSS. Eres experto en seguridad de Firebase Firestore, reglas de acceso, sanitización de entradas, prevención de XSS e inyecciones de código, y auditoría de integraciones de pago.
Responde de forma técnica y estructurada sobre cómo asegurar la integridad de la aplicación frente al requerimiento solicitado.
"""
}

SYNTHESIS_PROMPT = """
Eres el Agente Principal (Director de Proyecto) de BEATSS.
Has consultado a tus subagentes especializados y has recibido sus respuestas.
Ahora debes presentarle una respuesta final consolidada, profesional y amigable al usuario en español.
Explica detalladamente lo que propusieron los subagentes y cómo se coordinaron para resolver su requerimiento.

Requerimiento del usuario: {user_query}

Respuestas de los subagentes consultados:
{subagent_responses}

Genera la respuesta final consolidada para el usuario.
"""

def call_gemini(system_instruction, user_content):
    """Realiza una petición HTTP directa al API de Gemini."""
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
    
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
        "generationConfig": {
            "temperature": 0.2
        }
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

def main():
    print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_CYAN}{C_BOLD}   BEATSS - SISTEMA DE ORQUESTACIÓN MULTI-AGENTE (CLI)         {C_RESET}")
    print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
    print(f"{C_GRAY}Gemini API conectada exitosamente.{C_RESET}")
    print(f"Escribe tus requerimientos y observa cómo interactúan los agentes.")
    print(f"Escribe {C_RED}'salir'{C_RESET} para terminar.\n")

    while True:
        try:
            user_input = input(f"{C_BOLD}{C_WHITE}Tú: {C_RESET}")
            if user_input.strip().lower() == "salir":
                print(f"\n{C_CYAN}¡Hasta luego!{C_RESET}")
                break
            
            if not user_input.strip():
                continue
            
            print(f"\n{C_CYAN}{C_BOLD}🔍 [Agente Principal] Analizando requerimiento...{C_RESET}")
            time.sleep(0.5)
            
            # 1. Llamar al Agente Principal para determinar delegación
            decision_text = call_gemini(MAIN_AGENT_PROMPT, user_input)
            if not decision_text:
                continue
            
            # Limpiar posibles bloques markdown si Gemini responde con ```json
            if decision_text.strip().startswith("```"):
                lines = decision_text.strip().split("\n")
                if lines[0].startswith("```json"):
                    decision_text = "\n".join(lines[1:-1])
                elif lines[0].startswith("```"):
                    decision_text = "\n".join(lines[1:-1])
            
            try:
                decision = json.loads(decision_text.strip())
            except Exception:
                print(f"{C_RED}⚠️ Error al parsear decisión del Agente Principal. Respuesta cruda:{C_RESET}")
                print(decision_text)
                continue
            
            print(f"{C_CYAN}🧠 Pensamiento: {C_GRAY}{decision.get('pensamiento', 'Ninguno')}{C_RESET}")
            
            delegados = decision.get("delegados", [])
            respuestas_subagentes = []
            
            # 2. Procesar cada subagente delegado
            if delegados:
                for delg in delegados:
                    rol = delg.get("rol")
                    consulta = delg.get("consulta")
                    
                    if rol not in SUBAGENT_PROMPTS:
                        continue
                    
                    # Colores y etiquetas por rol
                    color_rol = C_RESET
                    if rol == "DISEÑO":
                        color_rol = C_MAGENTA
                    elif rol == "CONTABILIDAD":
                        color_rol = C_GREEN
                    elif rol == "PROGRAMACIÓN":
                        color_rol = C_YELLOW
                    elif rol == "SEGURIDAD":
                        color_rol = C_RED
                    
                    print(f"\n{color_rol}{C_BOLD}🤝 [Delegando a Agente de {rol}]...{C_RESET}")
                    print(f"{color_rol}↳ Consulta: {C_GRAY}{consulta}{C_RESET}")
                    time.sleep(0.8)
                    
                    # Llamar al subagente
                    resp_sub = call_gemini(SUBAGENT_PROMPTS[rol], consulta)
                    if resp_sub:
                        print(f"{color_rol}✓ Respuesta recibida.{C_RESET}")
                        respuestas_subagentes.append(f"--- AGENTE DE {rol} ---\n{resp_sub}\n")
                    else:
                        print(f"{C_RED}❌ Sin respuesta del Agente de {rol}.{C_RESET}")
            else:
                print(f"{C_CYAN}ℹ️ El requerimiento se responderá de forma directa.{C_RESET}")
            
            # 3. Sintetizar respuesta final
            print(f"\n{C_CYAN}{C_BOLD}✍️ [Agente Principal] Consolidando respuesta final...{C_RESET}")
            time.sleep(0.6)
            
            subagents_data = "\n".join(respuestas_subagentes) if respuestas_subagentes else "Ningún subagente fue consultado."
            synthesis_content = SYNTHESIS_PROMPT.format(user_query=user_input, subagent_responses=subagents_data)
            
            final_response = call_gemini("Eres el Agente Principal de BEATSS.", synthesis_content)
            
            if final_response:
                print(f"\n{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}   RESPUESTA DEL DIRECTOR DE PROYECTO (BEATSS)                 {C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}")
                print(f"{C_WHITE}{final_response}{C_RESET}")
                print(f"{C_CYAN}{C_BOLD}================================================================{C_RESET}\n")
            
        except KeyboardInterrupt:
            print(f"\n\n{C_CYAN}Programa interrumpido. ¡Hasta luego!{C_RESET}")
            break

if __name__ == "__main__":
    main()
