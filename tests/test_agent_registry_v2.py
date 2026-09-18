import os
import unittest
from unittest.mock import patch

from agent_registry import (
    PROJECT_ROOT,
    get_agent_contract,
    get_agent_prompt,
    get_agent_tools,
    get_agent_write_policy,
    get_all_agent_names,
    get_canonical_agents,
    load_agent_registry,
)
from prompt_manager import check_subagent_role_exists
from prompt_manager import get_main_agent_prompt, get_subagent_prompt
from agent_manager import execute_subagent_react_loop


LEGACY_ROLES = {
    "integrator", "data_engineer", "document_expert", "designer",
    "qa_tester", "seo_optimizer", "security_ops", "marketing_copywriter",
    "business_analyst", "automation_expert", "legal_advisor",
    "support_helper", "mobile_developer", "audio_dsp_expert", "devops_admin",
    "refactor_expert", "knowledge_steward", "token_optimizer", "growth_hacker",
    "rights_manager", "branding_specialist", "sri_tax_advisor",
    "licensing_negotiator", "beatstars_sync_expert", "stripe_ops",
}


class AgentRegistryV2Tests(unittest.TestCase):
    def test_registry_has_ten_canonical_agents_and_no_duplicate_names(self):
        registry = load_agent_registry()
        self.assertEqual(registry["schema_version"], "2.0.0")
        self.assertEqual(len(get_canonical_agents()), 10)
        self.assertEqual(len(get_all_agent_names()), len(set(get_all_agent_names())))

    def test_every_legacy_role_resolves_without_using_legacy_prompts(self):
        for role in LEGACY_ROLES:
            with self.subTest(role=role):
                self.assertTrue(check_subagent_role_exists(role))
                self.assertIsNotNone(get_agent_contract(role))

    def test_every_contract_has_a_skill_profile_and_evidence_gate(self):
        for role in get_canonical_agents():
            contract = get_agent_contract(role)
            with self.subTest(role=role):
                self.assertIn("beatss-evidence-gates", contract["skills"])
                self.assertTrue(contract["evidence"])
                for skill in contract["skills"]:
                    skill_file = os.path.join(
                        PROJECT_ROOT, ".agents", "skills-v2", skill, "SKILL.md"
                    )
                    self.assertTrue(os.path.isfile(skill_file), skill_file)
                profile_file = os.path.join(
                    PROJECT_ROOT, ".opencode", "agents",
                    f"{contract['opencode_profile']}.md",
                )
                self.assertTrue(os.path.isfile(profile_file), profile_file)

    def test_all_opencode_profiles_are_deepseek_and_toolless(self):
        for role in get_canonical_agents():
            contract = get_agent_contract(role)
            profile_file = os.path.join(
                PROJECT_ROOT, ".opencode", "agents",
                f"{contract['opencode_profile']}.md",
            )
            with open(profile_file, "r", encoding="utf-8") as profile:
                content = profile.read()
            with self.subTest(role=role):
                self.assertIn("mode: primary", content)
                self.assertIn("model: deepseek/deepseek-v4-flash", content)
                for permission in ("edit", "bash", "read", "glob", "grep", "list"):
                    self.assertIn(f"{permission}: deny", content)

    def test_sensitive_agents_cannot_write(self):
        read_only = {
            "commerce_reliability", "quality_security", "rights_and_deals",
            "tax_invoicing", "knowledge_steward",
        }
        for role in read_only:
            with self.subTest(role=role):
                self.assertEqual(get_agent_write_policy(role), "deny")
                self.assertNotIn("write_file", get_agent_tools(role))

    def test_design_contract_requires_a_new_mobile_accessible_structure(self):
        prompt = get_agent_prompt("designer").lower()
        self.assertIn("sin heredar", prompt)
        self.assertIn("mobile", prompt)
        self.assertIn("accesibilidad", prompt)
        self.assertNotIn("glassmorphism", prompt)
        self.assertNotIn("neón", prompt)

    def test_commerce_contract_separates_checkout_from_fulfillment(self):
        prompt = get_agent_prompt("stripe_ops").lower()
        self.assertIn("checkout creation equals payment", prompt)
        self.assertIn("payment equals license delivery", prompt)

    def test_director_does_not_invent_dark_mode_or_markdown_wrappers(self):
        prompt = get_main_agent_prompt().lower()
        self.assertIn("no añadas modo oscuro", prompt)
        self.assertIn("ni bloques markdown", prompt)

    @patch("agent_manager.run_tool_write_file")
    @patch("agent_manager.call_llm")
    def test_commerce_agent_cannot_write_even_if_model_requests_it(self, call_llm, write_file):
        call_llm.side_effect = [
            '{"resumen_operativo":"intento adversarial","tool_use":{"tool":"write_file","path":"forbidden.txt","content":"x"},"respuesta":""}',
            '{"resumen_operativo":"límite aplicado","tool_use":{"tool":"none"},"respuesta":"Escritura bloqueada por contrato."}',
        ]

        result = execute_subagent_react_loop(
            "stripe_ops",
            get_subagent_prompt("stripe_ops"),
            "Escribe un archivo sin autorización.",
            {"user_id": "test", "task_id": "adversarial", "project_id": "beatss"},
        )

        self.assertEqual(result, "Escritura bloqueada por contrato.")
        write_file.assert_not_called()
        self.assertEqual(call_llm.call_count, 2)


if __name__ == "__main__":
    unittest.main()
