"""Persistencia segura y recuperación contextual de memoria para BEATSS.

La memoria nueva se guarda por contexto en ``.beatss_memory/``. Los archivos
JSON antiguos se leen únicamente como migración compatible para la sesión
local, pero no se sobrescriben ni se eliminan automáticamente.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Any, Callable

from llm_utils import call_gemini, C_GRAY, C_RESET


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ID = "beatss"
MEMORY_ROOT = os.path.join(BASE_DIR, ".beatss_memory")

# Rutas heredadas. Se conservan para lectura de migración y compatibilidad con
# scripts externos, pero la escritura nueva usa MEMORY_ROOT.
SESSION_MEMORY_FILE = os.path.join(BASE_DIR, "session_memory.json")
SUBAGENT_MEMORIES_FILE = os.path.join(BASE_DIR, "subagent_memories.json")

MAX_SESSION_TURNS = 30
MAX_AGENT_MEMORY_EVENTS = 12
MAX_SUMMARY_CHARS = 4000
_THREAD_LOCKS: dict[str, threading.RLock] = {}
_THREAD_LOCKS_GUARD = threading.Lock()

try:
    import fcntl  # type: ignore
except ImportError:  # pragma: no cover - solo plataformas sin flock
    fcntl = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_component(value: Any, fallback: str, max_length: int = 96) -> str:
    """Convierte identificadores externos en componentes de ruta seguros."""
    text = str(value or "").strip()
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text)
    text = text.strip("._-")[:max_length]
    return text or fallback


def normalize_context(
    user_id: Any = None,
    task_id: Any = None,
    project_id: Any = None,
) -> dict[str, str]:
    """Devuelve un contexto estable y no ambiguo para aislar la memoria."""
    return {
        "user_id": _safe_component(user_id, "local"),
        "task_id": _safe_component(task_id, "interactive"),
        "project_id": _safe_component(project_id, PROJECT_ID),
    }


def _coerce_context(context: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(context, dict):
        return normalize_context()
    return normalize_context(
        context.get("user_id"),
        context.get("task_id"),
        context.get("project_id"),
    )


def _context_key(context: dict[str, str]) -> str:
    raw = "|".join(
        [context["user_id"], context["project_id"], context["task_id"]]
    )
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]
    readable = "__".join(
        [context["user_id"], context["project_id"], context["task_id"]]
    )
    return f"{readable[:180]}__{digest}"


def _context_dir(context: dict[str, str]) -> str:
    return os.path.join(MEMORY_ROOT, _context_key(context))


def _context_paths(context: dict[str, str]) -> tuple[str, str]:
    directory = _context_dir(context)
    return (
        os.path.join(directory, "session.json"),
        os.path.join(directory, "subagents.json"),
    )


def _is_default_local_context(context: dict[str, str]) -> bool:
    return context == normalize_context()


def _thread_lock(lock_path: str) -> threading.RLock:
    with _THREAD_LOCKS_GUARD:
        return _THREAD_LOCKS.setdefault(lock_path, threading.RLock())


@contextmanager
def _locked(lock_path: str):
    """Bloquea dentro del proceso y, en POSIX, también entre procesos."""
    os.makedirs(os.path.dirname(lock_path), exist_ok=True)
    local_lock = _thread_lock(lock_path)
    with local_lock:
        with open(lock_path, "a+", encoding="utf-8") as lock_file:
            if fcntl is not None:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                if fcntl is not None:
                    fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)


def _atomic_write_json(path: str, value: Any) -> None:
    """Escribe JSON mediante archivo temporal y ``os.replace``."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".memory-", suffix=".tmp", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def _read_json(path: str, default: Any) -> Any:
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[Memoria] No se pudo leer {os.path.basename(path)}: {exc}")
        return default


def _valid_turns(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, dict):
        value = value.get("turns", [])
    if not isinstance(value, list):
        return []
    turns = []
    for item in value:
        if not isinstance(item, dict):
            continue
        user = item.get("usuario", item.get("user", ""))
        assistant = item.get("asistente", item.get("assistant", ""))
        if user is None and assistant is None:
            continue
        turns.append(
            {
                "usuario": str(user or ""),
                "asistente": str(assistant or ""),
                "timestamp": str(item.get("timestamp") or _now()),
            }
        )
    return turns[-MAX_SESSION_TURNS:]


def _new_session_state(context: dict[str, str]) -> dict[str, Any]:
    return {
        "version": 2,
        "kind": "session_memory",
        "context": context,
        "turns": [],
        "summary": "",
        "summary_source_count": 0,
        "updated_at": _now(),
    }


def _load_session_state_unlocked(
    context: dict[str, str], path: str
) -> dict[str, Any]:
    if os.path.exists(path):
        raw = _read_json(path, {})
    elif _is_default_local_context(context):
        # Migración no destructiva del formato anterior.
        raw = _read_json(SESSION_MEMORY_FILE, [])
    else:
        raw = {}

    state = _new_session_state(context)
    if isinstance(raw, dict) and raw.get("kind") == "session_memory":
        state.update(raw)
    else:
        state["turns"] = _valid_turns(raw)
    state["context"] = context
    state["turns"] = _valid_turns(state.get("turns", []))
    state["summary"] = str(state.get("summary") or "")[:MAX_SUMMARY_CHARS]
    state["summary_source_count"] = int(state.get("summary_source_count") or 0)
    return state


def load_session_state(context: dict[str, Any] | None = None) -> dict[str, Any]:
    context = _coerce_context(context)
    session_path, _ = _context_paths(context)
    lock_path = f"{session_path}.lock"
    with _locked(lock_path):
        return _load_session_state_unlocked(context, session_path)


def load_session_memory(context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Carga solo los turnos del contexto solicitado."""
    return load_session_state(context).get("turns", [])


def save_session_memory(
    memory: list[dict[str, Any]], context: dict[str, Any] | None = None
) -> None:
    """Guarda turnos de forma atómica sin perder el resumen persistente."""
    context = _coerce_context(context)
    session_path, _ = _context_paths(context)
    with _locked(f"{session_path}.lock"):
        state = _load_session_state_unlocked(context, session_path)
        state["turns"] = _valid_turns(memory)
        state["updated_at"] = _now()
        _atomic_write_json(session_path, state)


def append_session_turn(
    user_text: str,
    assistant_text: str,
    context: dict[str, Any] | None = None,
) -> None:
    """Añade un turno bajo el mismo lock que la lectura, evitando carreras."""
    context = _coerce_context(context)
    session_path, _ = _context_paths(context)
    with _locked(f"{session_path}.lock"):
        state = _load_session_state_unlocked(context, session_path)
        state["turns"].append(
            {
                "usuario": str(user_text or ""),
                "asistente": str(assistant_text or ""),
                "timestamp": _now(),
            }
        )
        state["turns"] = _valid_turns(state["turns"])
        state["updated_at"] = _now()
        _atomic_write_json(session_path, state)


def save_session_summary(
    summary: str,
    source_count: int,
    context: dict[str, Any] | None = None,
) -> None:
    context = _coerce_context(context)
    session_path, _ = _context_paths(context)
    with _locked(f"{session_path}.lock"):
        state = _load_session_state_unlocked(context, session_path)
        state["summary"] = str(summary or "").strip()[:MAX_SUMMARY_CHARS]
        state["summary_source_count"] = max(0, int(source_count))
        state["updated_at"] = _now()
        _atomic_write_json(session_path, state)


def _formatted_summary(state: dict[str, Any]) -> str:
    summary = str(state.get("summary") or "").strip()
    if not summary:
        return ""
    return (
        "--- RESUMEN PERSISTENTE DE LA SESIÓN ---\n"
        f"{summary}\n"
        "-----------------------------------------\n\n"
    )


def summarize_history_if_needed(
    history: list[dict[str, Any]], context: dict[str, Any] | None = None
) -> str:
    """Genera y persiste un resumen solo cuando hay información nueva."""
    context = _coerce_context(context)
    state = load_session_state(context)
    if len(history) <= 8:
        return _formatted_summary(state)

    source_count = max(0, len(history) - 4)
    if state.get("summary") and state.get("summary_source_count", 0) >= source_count:
        return _formatted_summary(state)

    print(
        f"\n{C_GRAY}[Token Optimizer] 🧠 Generando resumen persistente de la sesión...{C_RESET}"
    )
    text_to_summarize = "\n\n".join(
        f"Usuario: {turn.get('usuario', '')}\nBEATSS: {turn.get('asistente', '')}"
        for turn in history[:-4]
    )
    system_prompt = """
Eres el Agente Token Optimizer de BEATSS. Resume en español las decisiones,
hechos vigentes, archivos relevantes y pendientes. Máximo 8 líneas. No
incluyas credenciales, tokens, contraseñas ni razonamiento privado.
"""
    summary = call_gemini(system_prompt, text_to_summarize, response_json=False)
    if summary:
        save_session_summary(summary, source_count, context)
        return _formatted_summary(load_session_state(context))
    return _formatted_summary(state)


def _new_subagent_state(context: dict[str, str]) -> dict[str, Any]:
    return {
        "version": 2,
        "kind": "subagent_memory",
        "context": context,
        "agents": {},
        "updated_at": _now(),
    }


def _load_subagent_state_unlocked(
    context: dict[str, str], path: str
) -> dict[str, Any]:
    if os.path.exists(path):
        raw = _read_json(path, {})
    elif _is_default_local_context(context):
        raw = _read_json(SUBAGENT_MEMORIES_FILE, {})
    else:
        raw = {}

    state = _new_subagent_state(context)
    if isinstance(raw, dict) and raw.get("kind") == "subagent_memory":
        state.update(raw)
    elif isinstance(raw, dict):
        # Formato anterior: {"rol": "texto"}. Migración no destructiva.
        for role, text in raw.items():
            if isinstance(text, str):
                state["agents"][_safe_component(role, "unknown").lower()] = {
                    "current": text,
                    "history": [{"text": text, "timestamp": _now(), "source": "legacy"}],
                    "updated_at": _now(),
                }
    if not isinstance(state.get("agents"), dict):
        state["agents"] = {}
    state["context"] = context
    return state


def load_subagent_memories(
    context: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Devuelve el recuerdo actual de cada rol, manteniendo la API antigua."""
    context = _coerce_context(context)
    _, agents_path = _context_paths(context)
    with _locked(f"{agents_path}.lock"):
        state = _load_subagent_state_unlocked(context, agents_path)
    result = {}
    for role, record in state["agents"].items():
        if isinstance(record, dict) and record.get("current"):
            result[role] = str(record["current"])
    return result


def save_subagent_memory(
    rol: str,
    memory_text: str,
    context: dict[str, Any] | None = None,
    source: str = "agent",
) -> None:
    """Añade una versión al historial del rol en vez de sobrescribirlo."""
    context = _coerce_context(context)
    role = _safe_component(rol, "unknown").lower()
    text = str(memory_text or "").strip()[:MAX_SUMMARY_CHARS]
    if not text:
        return
    _, agents_path = _context_paths(context)
    with _locked(f"{agents_path}.lock"):
        state = _load_subagent_state_unlocked(context, agents_path)
        record = state["agents"].get(role, {"current": "", "history": []})
        history = record.get("history", []) if isinstance(record, dict) else []
        history.append({"text": text, "timestamp": _now(), "source": source})
        record = {
            "current": text,
            "history": history[-MAX_AGENT_MEMORY_EVENTS:],
            "updated_at": _now(),
        }
        state["agents"][role] = record
        state["updated_at"] = _now()
        _atomic_write_json(agents_path, state)


def get_subagent_memory(
    rol: str, context: dict[str, Any] | None = None
) -> str:
    """Recupera el recuerdo actual y las últimas versiones del rol."""
    context = _coerce_context(context)
    role = _safe_component(rol, "unknown").lower()
    _, agents_path = _context_paths(context)
    with _locked(f"{agents_path}.lock"):
        state = _load_subagent_state_unlocked(context, agents_path)
    record = state["agents"].get(role)
    if not isinstance(record, dict) or not record.get("current"):
        return "No tienes registros previos en tu memoria a largo plazo."
    history = record.get("history", [])[-3:]
    previous = "\n".join(
        f"- {item.get('timestamp', '')}: {item.get('text', '')}"
        for item in history[:-1]
        if isinstance(item, dict)
    )
    if previous:
        return f"Memoria actual:\n{record['current']}\nVersiones recientes:\n{previous}"
    return f"Memoria actual:\n{record['current']}"


def _tokens(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-záéíóúñ0-9_/-]{3,}", text.lower())
        if token not in {"para", "como", "este", "esta", "desde", "cuando", "puede"}
    }


def get_relevant_context(
    query: str,
    context: dict[str, Any] | None = None,
    max_items: int = 8,
    max_chars: int = 7000,
) -> str:
    """Recupera recuerdos por coincidencia simple de términos y recencia."""
    context = _coerce_context(context)
    query_tokens = _tokens(query)
    state = load_session_state(context)
    _, agents_path = _context_paths(context)
    with _locked(f"{agents_path}.lock"):
        agents_state = _load_subagent_state_unlocked(context, agents_path)

    candidates: list[tuple[float, str]] = []
    for turn in state.get("turns", []):
        text = f"Usuario: {turn.get('usuario', '')}\nBEATSS: {turn.get('asistente', '')}"
        overlap = len(query_tokens & _tokens(text))
        if overlap:
            candidates.append((float(overlap), text))
    for role, record in agents_state.get("agents", {}).items():
        if not isinstance(record, dict):
            continue
        text = f"Agente {role}: {record.get('current', '')}"
        overlap = len(query_tokens & _tokens(text))
        if overlap:
            candidates.append((float(overlap) + 0.2, text))

    selected = [
        text for _, text in sorted(candidates, key=lambda item: item[0], reverse=True)[:max_items]
    ]
    result = "\n\n".join(selected)
    return result[:max_chars]


def clear_context_memory(context: dict[str, Any] | None = None) -> None:
    """Elimina únicamente el contexto solicitado; nunca toca la memoria legacy."""
    context = _coerce_context(context)
    session_path, agents_path = _context_paths(context)
    for path in (session_path, agents_path, f"{session_path}.lock", f"{agents_path}.lock"):
        if os.path.isfile(path):
            os.unlink(path)
