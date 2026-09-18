import os
import sys
import json
import time
import shutil
import subprocess

from llm_utils import (
    call_llm,
    clean_and_parse_json,
    C_RESET,
    C_BOLD,
    C_CYAN,
    C_GREEN,
    C_MAGENTA,
    C_YELLOW,
    C_RED,
    C_WHITE,
    C_GRAY,
    C_BLUE
)

from prompt_manager import (
    get_router_prompt,
    get_main_agent_prompt,
    get_subagent_base_prompt,
    get_synthesis_prompt,
    get_subagent_prompt,
    check_subagent_role_exists
)
from agent_registry import (
    get_agent_contract,
    get_agent_iteration_limit,
    get_agent_profile,
    get_agent_tools,
    get_agent_write_policy,
    get_canonical_role,
)

from memory_manager import (
    load_session_memory,
    save_session_memory,
    append_session_turn,
    summarize_history_if_needed,
    load_subagent_memories,
    save_subagent_memory,
    get_subagent_memory,
    get_relevant_context,
)

# Colores mapeados para cada subagente
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
    "knowledge_steward": C_MAGENTA,
    "token_optimizer": C_BLUE,
    "growth_hacker": C_MAGENTA,
    "rights_manager": C_RED,
    "branding_specialist": C_CYAN,
    "sri_tax_advisor": C_BLUE,
    "licensing_negotiator": C_YELLOW,
    "beatstars_sync_expert": C_GREEN,
    "stripe_ops": C_CYAN
}

KNOWLEDGE_STEWARD_MONITOR = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "scripts",
    "knowledge-steward-monitor.mjs",
)


def GET_COLOR_FOR_ROL(rol):
    return AGENT_COLORS.get(rol.lower().strip(), C_WHITE)


def agent_can_write(rol):
    """Use the v2 contract instead of a global implicit write permission."""
    return get_agent_write_policy(rol) == "approval_required"


def run_knowledge_steward_task_check(progress_callback=None, run_process=subprocess.run):
    """Register accumulated changes and audit allowed docs once a task starts."""
    node_binary = os.environ.get("NODE_BIN")
    if not node_binary:
        node_binary = next(
            (
                candidate
                for candidate in (
                    shutil.which("node"),
                    "/opt/homebrew/bin/node",
                    "/usr/local/bin/node",
                )
                if candidate and os.path.isfile(candidate)
            ),
            None,
        )
    if not node_binary or not os.path.isfile(KNOWLEDGE_STEWARD_MONITOR):
        return {"status": "unavailable", "events": [], "audits": []}

    environment = os.environ.copy()
    environment["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + environment.get("PATH", "")
    try:
        result = run_process(
            [node_binary, KNOWLEDGE_STEWARD_MONITOR],
            cwd=PROJECT_ROOT,
            env=environment,
            capture_output=True,
            text=True,
            timeout=190,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as error:
        if progress_callback:
            progress_callback("⚠️ Knowledge Steward no pudo revisar los cambios; la tarea continuará.")
        return {"status": "failed", "events": [], "audits": [], "error": str(error)[:200]}

    try:
        payload = json.loads(result.stdout)
    except (TypeError, json.JSONDecodeError):
        payload = {"status": "failed", "events": [], "audits": []}

    audits = payload.get("audits") if isinstance(payload.get("audits"), list) else []
    completed = [audit for audit in audits if audit.get("status") == "completed"]
    failed = [audit for audit in audits if audit.get("status") != "completed"]
    if completed and progress_callback:
        progress_callback("[Knowledge Steward] Cambios documentales registrados y auditados.")
    if (failed or result.returncode != 0) and progress_callback:
        progress_callback("⚠️ Knowledge Steward dejó la auditoría pendiente; la tarea continuará.")
    return payload


PROJECT_ROOT = os.path.realpath(os.path.dirname(os.path.abspath(__file__)))
OBSIDIAN_ROOT = os.path.realpath(os.path.join(os.path.dirname(PROJECT_ROOT), "BeatSS-Obsidian"))
# Model-facing tools never receive direct vault access. The Knowledge Steward
# consumes the sanitized manifest produced by the local monitor instead.
READ_ROOTS = (PROJECT_ROOT,)

_HIDDEN_DIRS = {".git", "node_modules", ".venv", ".vercel", "dist", ".beatss_memory"}
_SENSITIVE_BASENAMES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "firebase-adminsdk.json",
    "session_memory.json",
    "subagent_memories.json",
}


def _is_within(path, root):
    try:
        return os.path.commonpath([path, root]) == root
    except ValueError:
        return False


def _is_sensitive_path(path):
    path_parts = set(os.path.normpath(path).split(os.sep))
    if path_parts & _HIDDEN_DIRS:
        return True
    basename = os.path.basename(path).lower()
    if basename in _SENSITIVE_BASENAMES or basename.startswith(".env."):
        return True
    if basename.startswith("firebase-adminsdk") or basename.startswith("service-account"):
        return True
    if basename.endswith("_backup_sincronizado.json"):
        return True
    return basename.endswith((".pem", ".p12", ".pfx", ".key"))


def get_safe_path(path, allow_write=False):
    """Resolve model-facing paths only inside the active BEATSS checkout."""
    if not isinstance(path, str) or not path.strip():
        return None
    candidate = path.strip()
    if not os.path.isabs(candidate):
        candidate = os.path.join(PROJECT_ROOT, candidate)
    full_path = os.path.realpath(os.path.abspath(candidate))
    allowed_roots = (PROJECT_ROOT,) if allow_write else READ_ROOTS
    if not any(_is_within(full_path, root) for root in allowed_roots):
        return None
    if _is_sensitive_path(full_path):
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
            entry_path = os.path.join(safe_path, entry)
            if entry in _HIDDEN_DIRS or entry == ".DS_Store" or _is_sensitive_path(entry_path):
                continue
            is_dir = os.path.isdir(entry_path)
            prefix = "[DIR] " if is_dir else "[FILE] "
            result.append(f"{prefix}{entry}")
        return "\n".join(result) if result else "[Directorio vacío]"
    except Exception as e:
        return f"Error al listar el directorio: {str(e)}"


def run_tool_write_file(rol, path, content):
    safe_path = get_safe_path(path, allow_write=True)
    if not safe_path:
        return "Error: Acceso denegado. No puedes escribir archivos fuera del proyecto."
        
    print(f"\n{C_RED}{C_BOLD}⚠️  ATENCIÓN: El Agente [{rol}] solicita modificar/crear el archivo: {C_YELLOW}{path}{C_RESET}")
    print(f"{C_GRAY}--- Vista Previa del Cambio (primeras 15 líneas) ---{C_RESET}")
    lines = content.split("\n")
    for line in lines[:15]:
        print(f"  {line}")
    if len(lines) > 15:
        print(f"  ... ({len(lines) - 15} líneas más) ...")
    print(f"{C_GRAY}----------------------------------------------------{C_RESET}")
    
    auto_approve = os.environ.get("AUTO_APPROVE_WRITE", "false").lower() == "true"
    if auto_approve:
        print(f"[*] [Auto-Approve] Aprobando automáticamente la escritura solicitada por el agente.")
    else:
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
        os.makedirs(os.path.dirname(safe_path), exist_ok=True)
        directory = os.path.dirname(safe_path)
        os.makedirs(directory, exist_ok=True)
        temporary_path = f"{safe_path}.agent-tmp"
        with open(temporary_path, "w", encoding="utf-8") as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temporary_path, safe_path)
        print(f"✓ Archivo {path} guardado exitosamente.")
        return f"Archivo '{path}' modificado exitosamente."
    except Exception as e:
        return f"Error al escribir el archivo: {str(e)}"


def run_tool_search_grep(pattern, include_vault=False):
    """Busca texto de forma segura en BEATSS y, opcionalmente, su bóveda."""
    if not pattern:
        return "Error: Debes proporcionar un patrón de búsqueda."

    search_roots = [PROJECT_ROOT]
    if include_vault and OBSIDIAN_ROOT in READ_ROOTS:
        search_roots.append(OBSIDIAN_ROOT)
    matches = []
    max_matches = 30

    for base_dir in search_roots:
        for root, dirs, files in os.walk(base_dir):
            dirs[:] = [d for d in dirs if d not in _HIDDEN_DIRS]

            for file in files:
                full_path = os.path.join(root, file)
                if file.endswith((".png", ".jpg", ".jpeg", ".gif", ".pdf", ".zip", ".tar", ".gz", ".db", ".sqlite", ".DS_Store")) or _is_sensitive_path(full_path):
                    continue

                rel_path = os.path.relpath(full_path, base_dir)
                if base_dir == OBSIDIAN_ROOT:
                    rel_path = f"BeatSS-Obsidian/{rel_path}"

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


def format_conversation_for_llm(history):
    """Convierte el historial de turnos en una cadena de texto plana, optimizando el contexto de archivos antiguos."""
    formatted = ""
    last_user_index = -1
    
    for i in range(len(history) - 1, -1, -1):
        if history[i]["role"] == "user":
            last_user_index = i
            break
            
    for idx, turn in enumerate(history):
        role = turn["role"]
        content = turn["content"]
        
        if role == "user":
            provider = os.getenv("LLM_PROVIDER", "auto").lower().strip()
            if provider == "gemini" and idx != last_user_index and ("OBSERVACIÓN de read_file" in content or "OBSERVACIÓN de read_file_lines" in content):
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


def execute_subagent_react_loop(rol, prompt_especifico, consulta, context=None):
    """Ejecuta el loop ReAct (Reasoning + Acting) para que el subagente use herramientas locales."""
    canonical_role = get_canonical_role(rol)
    contract = get_agent_contract(rol)
    if not canonical_role or not contract:
        return f"Error: El rol de agente '{rol}' no pertenece al registro v2 de BEATSS."

    memoria_persistente = get_subagent_memory(canonical_role, context)
    base_prompt = get_subagent_base_prompt()
    system_instruction = base_prompt.format(
        rol=canonical_role,
        prompt_especifico=prompt_especifico,
        memoria_persistente=memoria_persistente,
        herramientas_permitidas=", ".join(contract["tools"]),
        politica_escritura=contract["write_policy"],
    )
    
    conversation_history = [
        {"role": "user", "content": consulta}
    ]
    
    role_lower = canonical_role
    max_iterations = int(os.environ.get("MAX_REACT_ITERATIONS", str(get_agent_iteration_limit(role_lower))))
    allowed_tools = set(get_agent_tools(role_lower))
    
    color = GET_COLOR_FOR_ROL(rol)
    
    for iteration in range(max_iterations):
        user_content = format_conversation_for_llm(conversation_history)
        
        response_text = call_llm(
            system_instruction,
            user_content,
            response_json=True,
            opencode_agent=get_agent_profile(role_lower),
        )
        if not response_text:
            return f"Error al comunicarse con el Agente de {rol}."
            
        agent_decision = clean_and_parse_json(response_text)
        if not agent_decision:
            return f"El Agente de {rol} falló al responder en formato estructurado:\n{response_text}"
            
        pensamiento = agent_decision.get("resumen_operativo", agent_decision.get("pensamiento", ""))
        tool_use = agent_decision.get("tool_use", {})
        tool_name = tool_use.get("tool", "none")
        tool_path = tool_use.get("path", "")
        tool_content = tool_use.get("content", "")
        
        print(f"{color}[Agente {canonical_role}] Resumen: {C_GRAY}{pensamiento}{C_RESET}")
        
        if tool_name == "none" or not tool_name:
            nueva_memoria = agent_decision.get("actualizar_memoria")
            if nueva_memoria:
                print(f"{color}[Agente {canonical_role}] 💾 Recordando: {C_GRAY}{nueva_memoria}{C_RESET}")
                save_subagent_memory(canonical_role, nueva_memoria, context)
            
            return agent_decision.get("respuesta", "Operación completada.")
            
        if tool_name == "search_grep":
            pattern = tool_use.get("pattern", "")
            print(f"{color}[Agente {canonical_role}] 🛠  Herramienta: {C_BOLD}{tool_name}{C_RESET} ➔ Buscando: '{pattern}'{C_RESET}")
        else:
            print(f"{color}[Agente {canonical_role}] 🛠  Herramienta: {C_BOLD}{tool_name}{C_RESET} ➔ {C_CYAN}{tool_path}{C_RESET}")
        
        observation = ""
        if tool_name not in allowed_tools:
            observation = (
                f"Error: La herramienta '{tool_name}' no está permitida para "
                f"{canonical_role}. Herramientas permitidas: {', '.join(sorted(allowed_tools))}."
            )
        elif tool_name == "read_file":
            observation = run_tool_read_file(tool_path)
        elif tool_name == "read_file_lines":
            start_line = tool_use.get("start_line", 1)
            end_line = tool_use.get("end_line", 100)
            observation = run_tool_read_file_lines(tool_path, start_line, end_line)
        elif tool_name == "search_grep":
            pattern = tool_use.get("pattern", "")
            observation = run_tool_search_grep(pattern, include_vault=False)
        elif tool_name == "list_dir":
            observation = run_tool_list_dir(tool_path)
        elif tool_name == "write_file":
            if not agent_can_write(canonical_role):
                observation = f"Error: {canonical_role} opera en modo de solo lectura. Resume el cambio propuesto sin ejecutarlo."
            else:
                observation = run_tool_write_file(canonical_role, tool_path, tool_content)
        else:
            observation = f"Error: La herramienta '{tool_name}' no está disponible."
            
        conversation_history.append({"role": "model", "content": response_text})
        conversation_history.append({"role": "user", "content": f"OBSERVACIÓN de {tool_name}:\n{observation}"})
        
    return f"Se alcanzó el límite de iteraciones (ReAct) del Agente de {rol} sin solución definitiva."


def run_agent_pipeline(
    user_query,
    progress_callback=None,
    user_id="local",
    task_id="interactive",
    project_id="beatss",
):
    """Ejecuta todo el pipeline de enrutamiento, delegación, ejecución ReAct y síntesis."""
    context = {
        "user_id": user_id,
        "task_id": task_id,
        "project_id": project_id,
    }
    def log_progress(msg):
        if progress_callback:
            progress_callback(msg)
        else:
            print(msg)

    # La revisión es bajo demanda: el Mac no mantiene un vigilante permanente.
    # Sin cambios documentales permitidos, esta comprobación es local y no llama al LLM.
    if str(project_id).lower().strip() == "beatss":
        run_knowledge_steward_task_check(log_progress)

    # 1. Cargar historial y compresión
    historial = load_session_memory(context)
    memoria_historica_str = summarize_history_if_needed(historial, context)
    
    historial_str = ""
    if historial:
        historial_str = memoria_historica_str
        historial_str += "--- HISTORIAL RECIENTE DEL CHAT (MEMORIA DE SESIÓN) ---\n"
        ultimos_turnos = historial[-4:]
        for turno in ultimos_turnos:
            historial_str += f"Usuario: {turno.get('usuario', '')}\nBEATSS: {turno.get('asistente', '')}\n\n"
        historial_str += "------------------------------------------------------\n\n"
    recuerdos_relevantes = get_relevant_context(user_query, context)
    if recuerdos_relevantes:
        historial_str += "--- MEMORIA RELEVANTE RECUPERADA ---\n"
        historial_str += recuerdos_relevantes
        historial_str += "\n------------------------------------\n\n"
        
    user_input_con_historial = f"{historial_str}Consulta actual: {user_query}"
    
    log_progress("[Agente Enrutador] Clasificando requerimiento...")
    
    # 2. Enrutador (Carga de prompt dinámico)
    router_prompt = get_router_prompt()
    router_text = call_llm(
        router_prompt,
        user_input_con_historial,
        response_json=True,
        opencode_agent="beatss-orchestrator",
    )
    if not router_text:
        return "Error al clasificar la consulta (Enrutador sin respuesta)."
        
    router_decision = clean_and_parse_json(router_text)
    if not router_decision:
        router_decision = {"routing_decision": "DELEGATE", "pensamiento": "Fallo al parsear JSON del enrutador. Delegando por seguridad."}
        
    if router_decision.get("routing_decision") == "DIRECT":
        resp_directa = router_decision.get("respuesta_directa", "Hola. ¿En qué puedo ayudarte hoy?")
        historial.append({"usuario": user_query, "asistente": resp_directa})
        append_session_turn(user_query, resp_directa, context)
        return resp_directa
        
    log_progress("[Agente Principal] Analizando requerimiento y decidiendo delegación...")
    
    # 3. Agente Principal (Carga de prompt dinámico)
    main_agent_prompt = get_main_agent_prompt()
    decision_text = call_llm(
        main_agent_prompt,
        user_input_con_historial,
        response_json=True,
        opencode_agent="beatss-orchestrator",
    )
    if not decision_text:
        return "Error al analizar la consulta (Director sin respuesta)."
        
    decision = clean_and_parse_json(decision_text)
    if not decision:
        print(f"\n[-] [Error de Parseo JSON] Texto recibido del Agente Principal:\n{decision_text}\n")
        return f"Error: Respuesta inválida del Agente Principal al decidir delegaciones. Texto crudo recibido: {decision_text}"
        
    delegados = decision.get("delegados", [])
    respuestas_subagentes = []
    
    # 4. Procesar delegaciones
    if delegados:
        for idx, delg in enumerate(delegados, 1):
            rol = delg.get("rol", "").lower().strip()
            consulta = delg.get("consulta")
            
            if not check_subagent_role_exists(rol):
                log_progress(f"⚠️ Subagente '{rol}' no encontrado en el sistema.")
                continue
                
            log_progress(f"[Agente Principal] Delegando tarea ({idx}/{len(delegados)}) al Agente de {rol.upper()}...")
            
            prompt_especifico = get_subagent_prompt(rol)
            resp_sub = execute_subagent_react_loop(rol.upper(), prompt_especifico, consulta, context)
            
            if resp_sub:
                respuestas_subagentes.append(f"--- RESPUESTA DEL AGENTE DE {rol.upper()} ---\n{resp_sub}\n")
            else:
                log_progress(f"❌ Sin respuesta del Agente de {rol.upper()}.")
    else:
        log_progress("[Agente Principal] No se requirió delegar a subagentes especialistas.")
        
    log_progress("[Agente Principal] Consolidando y sintetizando respuesta final...")
    
    # 5. Sintetizar respuesta
    subagents_data = "\n".join(respuestas_subagentes) if respuestas_subagentes else "Ningún subagente fue consultado."
    synthesis_prompt = get_synthesis_prompt()
    synthesis_content = synthesis_prompt.format(
        historial_conversacion=historial_str if historial_str else "Sin historial de conversación previo en esta sesión.",
        user_query=user_query, 
        subagent_responses=subagents_data
    )
    
    final_response = call_llm(
        "Eres el Agente Principal de BEATSS.",
        synthesis_content,
        response_json=False,
        opencode_agent="beatss-orchestrator",
    )
    
    if final_response:
        historial.append({"usuario": user_query, "asistente": final_response})
        append_session_turn(user_query, final_response, context)
        return final_response
    else:
        return "Error al consolidar la respuesta final."
