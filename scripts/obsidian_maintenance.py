#!/usr/bin/env python3
"""Auditoría no destructiva de la bóveda Obsidian de BEATSS.

No mueve, elimina ni reescribe notas. Genera un inventario de duplicados,
enlaces rotos, referencias históricas, artefactos derivados y frontmatter
ausente para que cualquier limpieza posterior sea revisable y recuperable.
"""

from __future__ import annotations

import argparse
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path


STALE_MARKERS = (
    "/Users/sossa/IA/generador-licencias",
    "generador-licencias/docs/",
    "generador-licencias/backlog_mejoras",
    "generador-licencias/task",
    "generador-licencias/walkthrough",
)
WIKILINK_RE = re.compile(r"\[\[([^\]]+)\]\]")
DUPLICATE_SUFFIX_RE = re.compile(r"(?:_\d+)+$")


def iter_notes(vault: Path):
    excluded_parts = {
        ".obsidian",
        "4_Archivo",
        "Codigo_Beatss",
        "graphify-out",
    }
    for path in vault.rglob("*.md"):
        relative = path.relative_to(vault)
        if any(part in excluded_parts for part in relative.parts):
            continue
        yield path


def iter_all_notes(vault: Path):
    excluded_parts = {".obsidian", "4_Archivo", "graphify-out"}
    for path in vault.rglob("*.md"):
        relative = path.relative_to(vault)
        if any(part in excluded_parts for part in relative.parts):
            continue
        yield path


def canonical_stem(path: Path) -> str:
    return DUPLICATE_SUFFIX_RE.sub("", path.stem).strip().lower()


def note_index(notes: list[Path], vault: Path):
    index = defaultdict(list)
    for note in notes:
        relative = note.relative_to(vault).with_suffix("")
        index[str(relative).lower()].append(note)
        index[note.stem.lower()].append(note)
    return index


def find_broken_links(notes: list[Path], vault: Path):
    index = note_index(notes, vault)
    active_project = Path("/Users/sossa/Documents/Codex/BeatSS")
    broken = []
    ambiguous = []
    for note in notes:
        try:
            text = note.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for raw_target in WIKILINK_RE.findall(text):
            target = raw_target.split("|", 1)[0].strip()
            # Un espacio antes de # suele formar parte del nombre (p. ej.
            # "Bug #12"), mientras que note#seccion es un anchor de Obsidian.
            if "#" in target and not re.search(r"\s#\d", target):
                target = target.split("#", 1)[0].strip()
            target = target.replace("\\", "/")
            if not target or target.startswith("http"):
                continue
            normalized = target.removesuffix(".md").lower()
            matches = index.get(normalized, [])
            if not matches:
                # En la bóveda se permiten referencias a archivos de código
                # del checkout activo, aunque no sean notas Obsidian.
                project_candidate = active_project / target
                if project_candidate.is_file() or any(
                    candidate.name == Path(target).name
                    for candidate in active_project.rglob(Path(target).name)
                ):
                    continue
                broken.append((note.relative_to(vault), target))
            elif len(matches) > 1:
                ambiguous.append((note.relative_to(vault), target, len(matches)))
    return broken, ambiguous


def audit(vault: Path) -> str:
    notes = sorted(iter_notes(vault))
    all_notes = sorted(iter_all_notes(vault))
    duplicate_groups = defaultdict(list)
    stale_files = []
    missing_frontmatter = []
    graphify_files = []
    extracted_count = 0

    for note in notes:
        relative = note.relative_to(vault)
        key = canonical_stem(note)
        duplicate_groups[key].append(relative)
        try:
            text = note.read_text(encoding="utf-8", errors="replace")
        except OSError:
            text = ""
        if any(marker in text for marker in STALE_MARKERS):
            stale_files.append(relative)
        if not text.lstrip().startswith("---"):
            missing_frontmatter.append(relative)
        if "graphify/EXTRACTED" in text or "graphify" in str(relative).lower():
            graphify_files.append(relative)
        extracted_count += text.count("graphify/EXTRACTED")

    duplicates = {
        key: paths for key, paths in duplicate_groups.items() if len(paths) > 1
    }
    generated_duplicate_groups = defaultdict(list)
    for note in all_notes:
        relative = note.relative_to(vault)
        if "Codigo_Beatss" in relative.parts:
            generated_duplicate_groups[canonical_stem(note)].append(relative)
    generated_duplicates = {
        key: paths
        for key, paths in generated_duplicate_groups.items()
        if len(paths) > 1
    }
    broken, ambiguous = find_broken_links(notes, vault)
    generated_dir = vault / "3_Recursos" / "Codigo_Beatss"
    generated_count = sum(1 for _ in generated_dir.rglob("*") if _.is_file()) if generated_dir.exists() else 0
    aux_count = sum(1 for path in vault.rglob("._*") if path.is_file())

    lines = [
        "# Auditoría no destructiva de Obsidian — BEATSS",
        "",
        f"- Fecha: {datetime.now(timezone.utc).isoformat()}",
        f"- Bóveda: `{vault}`",
        "- Alcance: notas curadas; se excluyen `4_Archivo`, `.obsidian` y `3_Recursos/Codigo_Beatss`.",
        "- Acción: no se movió, eliminó ni modificó ningún archivo.",
        "",
        "## Resumen",
        "",
        f"- Notas curadas revisadas: **{len(notes)}**",
        f"- Grupos con posibles duplicados: **{len(duplicates)}**",
        f"- Grupos duplicados en artefactos Graphify: **{len(generated_duplicates)}**",
        f"- Enlaces wikilink rotos: **{len(broken)}**",
        f"- Enlaces ambiguos: **{len(ambiguous)}**",
        f"- Notas con referencias históricas: **{len(stale_files)}**",
        f"- Notas sin frontmatter: **{len(missing_frontmatter)}**",
        f"- Marcadores `graphify/EXTRACTED`: **{extracted_count}**",
        f"- Archivos derivados en `3_Recursos/Codigo_Beatss`: **{generated_count}**",
        f"- Auxiliares `._*`: **{aux_count}**",
        "",
        "## Prioridades",
        "",
        "1. Corregir referencias históricas y enlaces rotos en notas curadas.",
        "2. Revisar grupos duplicados antes de cualquier archivo o eliminación.",
        "3. Mantener Graphify como salida derivada, fuera de la documentación operativa.",
        "4. Añadir frontmatter solo a notas curadas, no a exportaciones históricas.",
        "",
        "## Referencias históricas detectadas",
        "",
    ]
    lines.extend(f"- `{path}`" for path in stale_files[:80])
    if not stale_files:
        lines.append("- Ninguna.")
    lines.extend(["", "## Enlaces rotos (muestra)", ""])
    lines.extend(f"- `{note}` → `{target}`" for note, target in broken[:120])
    if not broken:
        lines.append("- Ninguno.")
    lines.extend(["", "## Enlaces ambiguos (muestra)", ""])
    lines.extend(f"- `{note}` → `{target}` ({count} coincidencias)" for note, target, count in ambiguous[:80])
    if not ambiguous:
        lines.append("- Ninguno.")
    lines.extend(["", "## Grupos duplicados (muestra)", ""])
    for key, paths in sorted(duplicates.items())[:80]:
        lines.append(f"### `{key}`")
        lines.extend(f"- `{path}`" for path in paths[:20])
    if not duplicates:
        lines.append("- Ninguno.")
    lines.extend(["", "## Duplicados de artefactos Graphify (muestra)", ""])
    for key, paths in sorted(generated_duplicates.items())[:80]:
        lines.append(f"### `{key}`")
        lines.extend(f"- `{path}`" for path in paths[:20])
    if not generated_duplicates:
        lines.append("- Ninguno.")
    lines.extend(["", "## Notas sin frontmatter (muestra)", ""])
    lines.extend(f"- `{path}`" for path in missing_frontmatter[:120])
    if not missing_frontmatter:
        lines.append("- Ninguna.")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    vault = args.vault.expanduser().resolve()
    if not vault.is_dir():
        parser.error(f"No existe la bóveda: {vault}")
    report = args.report.expanduser()
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(audit(vault), encoding="utf-8")
    print(f"Auditoría escrita en {report}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
