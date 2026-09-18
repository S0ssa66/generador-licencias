"""Prompt loading for the active BEATSS v2 agent contracts."""

import os

from agent_registry import get_agent_prompt, get_all_agent_names, get_canonical_agents


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROMPTS_DIR = os.path.join(BASE_DIR, "prompts")


def _read_prompt(filename, fallback):
    path = os.path.join(PROMPTS_DIR, filename)
    try:
        with open(path, "r", encoding="utf-8") as prompt_file:
            content = prompt_file.read().strip()
        return content or fallback.strip()
    except OSError:
        return fallback.strip()


def get_router_prompt():
    return _read_prompt(
        "router_agent.txt",
        """
Eres el Enrutador v2 de BEATSS. Devuelve solo JSON con routing_decision,
resumen_operativo y respuesta_directa. Usa DELEGATE cuando se requiera evidencia.
""",
    )


def _compact_main_agent_prompt():
    roles = ", ".join(get_canonical_agents())
    return f"""
Eres el Director v2 de BEATSS. Delega solo a estos agentes canónicos: {roles}.
Devuelve JSON válido con `resumen_operativo` y `delegados`, sin razonamiento
privado, secretos ni afirmaciones no verificadas.
""".strip()


def get_main_agent_prompt():
    return _read_prompt("main_agent.txt", _compact_main_agent_prompt())


def get_subagent_base_prompt():
    return _read_prompt(
        "subagent_base.txt",
        """
Eres `{rol}` de BEATSS. Contrato: {prompt_especifico}. Memoria:
{memoria_persistente}. Herramientas: {herramientas_permitidas}. Escritura:
{politica_escritura}. Devuelve JSON con resumen_operativo, tool_use y respuesta.
""",
    )


def get_synthesis_prompt():
    return _read_prompt(
        "synthesis.txt",
        """
Consolida en español sin inventar evidencia. Historial: {historial_conversacion}
Solicitud: {user_query}\nResultados: {subagent_responses}
""",
    )


def get_subagent_prompt(rol):
    prompt = get_agent_prompt(str(rol or "").lower().strip())
    if prompt:
        return prompt.strip()
    return f"Rol desconocido de BEATSS: {rol}. No ejecutes acciones."


def check_subagent_role_exists(rol):
    return str(rol or "").lower().strip() in get_all_agent_names()
