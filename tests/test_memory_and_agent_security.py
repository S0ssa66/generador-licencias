import json
import os
import shutil
import tempfile
import unittest
from unittest.mock import patch

import memory_manager as memory
from agent_manager import (
    agent_can_write,
    get_safe_path,
    run_knowledge_steward_task_check,
    run_tool_search_grep,
)
from prompt_manager import check_subagent_role_exists, get_subagent_base_prompt, get_subagent_prompt
from llm_utils import (
    DEFAULT_GEMINI_MODEL,
    DEFAULT_OPENAI_MODEL,
    DEFAULT_OPENCODE_MODEL,
    GeminiProvider,
    OpenAICompatibleProvider,
    OpenAIProvider,
    OpenCodeProvider,
    get_gemini_model,
    get_model_name,
)


class MemoryIsolationTests(unittest.TestCase):
    def setUp(self):
        self.original_root = memory.MEMORY_ROOT
        self.original_session = memory.SESSION_MEMORY_FILE
        self.original_subagents = memory.SUBAGENT_MEMORIES_FILE
        self.temp_root = tempfile.mkdtemp(prefix="beatss-memory-test-")
        memory.MEMORY_ROOT = os.path.join(self.temp_root, "contexts")
        memory.SESSION_MEMORY_FILE = os.path.join(self.temp_root, "legacy-session.json")
        memory.SUBAGENT_MEMORIES_FILE = os.path.join(self.temp_root, "legacy-agents.json")

    def tearDown(self):
        memory.MEMORY_ROOT = self.original_root
        memory.SESSION_MEMORY_FILE = self.original_session
        memory.SUBAGENT_MEMORIES_FILE = self.original_subagents
        shutil.rmtree(self.temp_root, ignore_errors=True)

    def test_sessions_are_isolated_and_atomic_envelope_is_written(self):
        first = {"user_id": "user-a", "task_id": "task-1", "project_id": "beatss"}
        second = {"user_id": "user-b", "task_id": "task-1", "project_id": "beatss"}

        memory.append_session_turn("A secreto", "Respuesta A", first)
        memory.append_session_turn("B secreto", "Respuesta B", second)

        self.assertEqual(memory.load_session_memory(first)[0]["usuario"], "A secreto")
        self.assertEqual(memory.load_session_memory(second)[0]["usuario"], "B secreto")

        session_path, _ = memory._context_paths(memory.normalize_context(**first))
        with open(session_path, "r", encoding="utf-8") as handle:
            persisted = json.load(handle)
        self.assertEqual(persisted["version"], 2)
        self.assertEqual(persisted["context"]["user_id"], "user-a")

    def test_subagent_memory_keeps_versions(self):
        context = {"user_id": "user-a", "task_id": "task-1", "project_id": "beatss"}
        memory.save_subagent_memory("security_ops", "Primera observación", context)
        memory.save_subagent_memory("security_ops", "Corrección verificada", context)

        result = memory.get_subagent_memory("security_ops", context)
        self.assertIn("Corrección verificada", result)
        self.assertIn("Primera observación", result)

    def test_relevant_context_filters_unrelated_memories(self):
        context = {"user_id": "user-a", "task_id": "task-1", "project_id": "beatss"}
        memory.append_session_turn("Revisar seguridad de Firebase", "Reglas pendientes", context)
        memory.append_session_turn("Diseñar portada", "Usar logo azul", context)

        result = memory.get_relevant_context("Firebase reglas", context)
        self.assertIn("Firebase", result)
        self.assertNotIn("logo azul", result)


class AgentSecurityTests(unittest.TestCase):
    def test_knowledge_steward_replaces_the_legacy_obsidian_role(self):
        self.assertTrue(check_subagent_role_exists("knowledge_steward"))
        self.assertFalse(check_subagent_role_exists("obsidian_expert"))
        self.assertIn("fuente de verdad", get_subagent_prompt("knowledge_steward").lower())
        self.assertFalse(agent_can_write("knowledge_steward"))

    def test_subagent_prompt_can_be_formatted(self):
        rendered = get_subagent_base_prompt().format(
            rol="knowledge_steward",
            prompt_especifico="Solo lectura.",
            memoria_persistente="Sin memoria.",
            herramientas_permitidas="read_file, search_grep",
            politica_escritura="deny",
        )
        self.assertIn('"tool_use"', rendered)

    def test_sensitive_and_parent_paths_are_denied(self):
        self.assertIsNone(get_safe_path(".env"))
        self.assertIsNone(get_safe_path("firebase-adminsdk.json"))
        self.assertIsNone(get_safe_path(".git/config"))
        self.assertIsNone(get_safe_path("../"))

    def test_project_relative_path_is_allowed(self):
        self.assertTrue(get_safe_path("memory_manager.py").endswith("memory_manager.py"))

    def test_model_facing_tools_cannot_open_the_obsidian_vault_directly(self):
        vault_path = os.path.realpath(
            os.path.join(os.path.dirname(__file__), "..", "..", "BeatSS-Obsidian")
        )
        self.assertIsNone(get_safe_path(vault_path))

    def test_search_does_not_return_secret_file_names(self):
        result = run_tool_search_grep("GEMINI_API_KEY")
        self.assertNotIn("session_memory.json", result)
        self.assertNotIn("subagent_memories.json", result)
        self.assertNotIn("firebase-adminsdk", result)

    def test_task_start_check_is_local_when_there_are_no_audits(self):
        completed = type("Result", (), {
            "stdout": json.dumps({"status": "scanned", "events": [], "audits": []}),
            "stderr": "",
            "returncode": 0,
        })()
        messages = []

        result = run_knowledge_steward_task_check(messages.append, run_process=lambda *args, **kwargs: completed)

        self.assertEqual(result["status"], "scanned")
        self.assertEqual(result["audits"], [])
        self.assertEqual(messages, [])


class GeminiConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.original_model = os.environ.get("GEMINI_MODEL")

    def tearDown(self):
        if self.original_model is None:
            os.environ.pop("GEMINI_MODEL", None)
        else:
            os.environ["GEMINI_MODEL"] = self.original_model

    def test_default_model_is_flash_lite_and_provider_uses_it(self):
        os.environ.pop("GEMINI_MODEL", None)
        self.assertEqual(get_gemini_model(), DEFAULT_GEMINI_MODEL)
        self.assertEqual(GeminiProvider("test-key").model_name, DEFAULT_GEMINI_MODEL)

    def test_invalid_model_name_falls_back_to_default(self):
        os.environ["GEMINI_MODEL"] = "not a valid model"
        self.assertEqual(get_gemini_model(), DEFAULT_GEMINI_MODEL)


class OpenAIConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.original_model = os.environ.get("OPENAI_MODEL")

    def tearDown(self):
        if self.original_model is None:
            os.environ.pop("OPENAI_MODEL", None)
        else:
            os.environ["OPENAI_MODEL"] = self.original_model

    def test_openai_provider_uses_responses_api_and_default_model(self):
        os.environ.pop("OPENAI_MODEL", None)
        provider = OpenAIProvider("test-key")
        self.assertEqual(provider.model_name, DEFAULT_OPENAI_MODEL)
        self.assertEqual(provider.url, "https://api.openai.com/v1/responses")

    def test_openai_compatible_provider_uses_chat_completions(self):
        provider = OpenAICompatibleProvider("http://localhost:1234/v1", "", "test-model")
        self.assertEqual(provider.url, "http://localhost:1234/v1/chat/completions")
        self.assertEqual(get_model_name("OPENAI_MODEL", DEFAULT_OPENAI_MODEL), DEFAULT_OPENAI_MODEL)

    @patch("llm_utils.subprocess.run")
    def test_opencode_provider_extracts_json_event_without_auto_approval(self, run):
        run.return_value = type("Result", (), {
            "stdout": '{"type":"text","part":{"text":"{\\"ok\\":true}"}}\n',
            "returncode": 0,
        })()
        provider = OpenCodeProvider(command="opencode")
        self.assertEqual(provider.generate_content("Sistema", "Consulta", response_json=True), '{"ok":true}')
        command = run.call_args.args[0]
        self.assertNotIn("--auto", command)
        self.assertIn("knowledge-steward", command)

    @patch("llm_utils.subprocess.run")
    def test_opencode_provider_allows_a_valid_per_call_agent_override(self, run):
        run.return_value = type("Result", (), {
            "stdout": '{"type":"text","part":{"text":"ok"}}\n',
            "returncode": 0,
        })()
        provider = OpenCodeProvider(command="opencode")
        self.assertEqual(
            provider.generate_content("Sistema", "Consulta", options={"opencode_agent": "beatss-orchestrator"}),
            "ok",
        )
        command = run.call_args.args[0]
        self.assertIn("beatss-orchestrator", command)

    def test_knowledge_steward_profile_is_toolless_and_read_only(self):
        profile_path = os.path.join(os.path.dirname(__file__), "..", ".opencode", "agents", "knowledge-steward.md")
        with open(profile_path, encoding="utf-8") as profile:
            content = profile.read()
        self.assertIn("edit: deny", content)
        self.assertIn("bash: deny", content)
        self.assertIn("read: deny", content)
        self.assertIn("glob: deny", content)
        self.assertIn("grep: deny", content)
        self.assertIn("manifiesto local, limitado y previamente saneado", content)

    def test_opencode_defaults_to_deepseek_flash_v4(self):
        self.assertEqual(DEFAULT_OPENCODE_MODEL, "deepseek/deepseek-v4-flash")


if __name__ == "__main__":
    unittest.main()
