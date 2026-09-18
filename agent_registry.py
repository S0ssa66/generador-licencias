"""Validated contracts for the active BEATSS v2 agent system."""

from functools import lru_cache
import json
import os


PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
REGISTRY_PATH = os.path.join(PROJECT_ROOT, ".agents", "agent-registry-v2.json")
VALID_WRITE_POLICIES = {"deny", "approval_required"}
VALID_TOOLS = {"list_dir", "read_file", "read_file_lines", "search_grep", "write_file"}


@lru_cache(maxsize=1)
def load_agent_registry():
    with open(REGISTRY_PATH, "r", encoding="utf-8") as registry_file:
        registry = json.load(registry_file)
    validate_agent_registry(registry)
    return registry


def validate_agent_registry(registry):
    if registry.get("schema_version") != "2.0.0":
        raise ValueError("Unsupported BEATSS agent registry schema")
    agents = registry.get("agents")
    if not isinstance(agents, list) or not agents:
        raise ValueError("The BEATSS agent registry must contain agents")

    identifiers = set()
    aliases = set()
    required = {
        "id", "version", "objective", "responsibilities", "source_areas",
        "skills", "tools", "write_policy", "risk", "evidence",
        "must_not_claim", "max_iterations", "opencode_profile", "aliases",
    }
    for agent in agents:
        missing = required.difference(agent)
        if missing:
            raise ValueError(f"Agent contract is missing fields: {sorted(missing)}")
        identifier = agent["id"]
        if identifier in identifiers or identifier in aliases:
            raise ValueError(f"Duplicate agent identifier: {identifier}")
        identifiers.add(identifier)
        if agent["version"] != "2.0.0":
            raise ValueError(f"Unsupported contract version for {identifier}")
        if agent["write_policy"] not in VALID_WRITE_POLICIES:
            raise ValueError(f"Invalid write policy for {identifier}")
        tools = set(agent["tools"])
        if not tools.issubset(VALID_TOOLS):
            raise ValueError(f"Invalid tool allowlist for {identifier}")
        if agent["write_policy"] == "deny" and "write_file" in tools:
            raise ValueError(f"Read-only agent {identifier} exposes write_file")
        if not isinstance(agent["max_iterations"], int) or agent["max_iterations"] < 1:
            raise ValueError(f"Invalid iteration limit for {identifier}")
        for alias in agent["aliases"]:
            if alias in identifiers or alias in aliases:
                raise ValueError(f"Duplicate agent alias: {alias}")
            aliases.add(alias)
    return registry


def get_agent_contract(role):
    normalized = str(role or "").lower().strip()
    for agent in load_agent_registry()["agents"]:
        if normalized == agent["id"] or normalized in agent["aliases"]:
            return agent
    return None


def get_canonical_role(role):
    contract = get_agent_contract(role)
    return contract["id"] if contract else None


def get_agent_prompt(role):
    contract = get_agent_contract(role)
    if not contract:
        return None
    responsibilities = "; ".join(contract["responsibilities"])
    skills = ", ".join(f"${skill}" for skill in contract["skills"])
    evidence = "; ".join(contract["evidence"])
    prohibited_claims = "; ".join(contract["must_not_claim"])
    return (
        f"Eres {contract['id']}, agente v{contract['version']} de BEATSS. "
        f"Objetivo: {contract['objective']}\n"
        f"Responsabilidades: {responsibilities}.\n"
        f"Aplica estas skills del proyecto: {skills}.\n"
        f"Evidencia mínima: {evidence}.\n"
        f"No afirmes: {prohibited_claims}.\n"
        f"Riesgo: {contract['risk']}. Política de escritura: {contract['write_policy']}."
    )


def get_agent_tools(role):
    contract = get_agent_contract(role)
    return tuple(contract["tools"]) if contract else tuple()


def get_agent_write_policy(role):
    contract = get_agent_contract(role)
    return contract["write_policy"] if contract else "deny"


def get_agent_profile(role):
    contract = get_agent_contract(role)
    return contract["opencode_profile"] if contract else "beatss-orchestrator"


def get_agent_iteration_limit(role):
    contract = get_agent_contract(role)
    return contract["max_iterations"] if contract else 6


def get_canonical_agents():
    return tuple(agent["id"] for agent in load_agent_registry()["agents"])


def get_all_agent_names():
    names = []
    for agent in load_agent_registry()["agents"]:
        names.append(agent["id"])
        names.extend(agent["aliases"])
    return tuple(names)
