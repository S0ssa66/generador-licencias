#!/usr/bin/env python3
"""Read-only structural audit for the active BEATSS v2 agent system."""

import json
import os
import shutil
import subprocess
import sys


PROJECT_ROOT = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, PROJECT_ROOT)

from agent_registry import get_agent_contract, get_canonical_agents  # noqa: E402


def main():
    checks = []
    for role in get_canonical_agents():
        contract = get_agent_contract(role)
        profile_path = os.path.join(
            PROJECT_ROOT, ".opencode", "agents", f"{contract['opencode_profile']}.md"
        )
        skill_paths = [
            os.path.join(PROJECT_ROOT, ".agents", "skills-v2", skill, "SKILL.md")
            for skill in contract["skills"]
        ]
        profile_ok = False
        if os.path.isfile(profile_path):
            with open(profile_path, "r", encoding="utf-8") as profile_file:
                profile = profile_file.read()
            profile_ok = (
                "model: deepseek/deepseek-v4-flash" in profile
                and "mode: primary" in profile
                and "edit: deny" in profile
                and "bash: deny" in profile
            )
        checks.append({
            "agent": role,
            "contract": "pass",
            "profile": "pass" if profile_ok else "fail",
            "skills": "pass" if all(os.path.isfile(path) for path in skill_paths) else "fail",
            "write_policy": contract["write_policy"],
        })

    opencode_path = shutil.which("opencode")
    opencode_version = None
    if opencode_path:
        try:
            result = subprocess.run(
                [opencode_path, "--version"], capture_output=True, text=True,
                timeout=10, check=False,
            )
            opencode_version = result.stdout.strip() or result.stderr.strip() or None
        except (OSError, subprocess.SubprocessError):
            pass

    failures = [
        check for check in checks
        if check["profile"] != "pass" or check["skills"] != "pass"
    ]
    report = {
        "status": "pass" if not failures else "fail",
        "schema": "2.0.0",
        "canonical_agents": len(checks),
        "provider": {
            "runtime": "opencode",
            "available": bool(opencode_path),
            "version": opencode_version,
            "model": "deepseek/deepseek-v4-flash",
        },
        "checks": checks,
        "notes": [
            "Structural pass does not prove every stochastic response quality.",
            "No secrets, external writes, payments, emails, or deployments were used.",
        ],
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
