#!/usr/bin/env python3
"""Aplica una reparación acotada a la bóveda curada de Obsidian.

Solo actúa con ``--apply``. Antes de cada cambio crea una copia en
``/private/tmp``. Nunca elimina, mueve ni renombra notas y excluye la salida
derivada ``3_Recursos/Codigo_Beatss``.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path


ACTIVE_ROOT = "/Users/sossa/Documents/Codex/BeatSS"
REPLACEMENTS = (
    ("/Users/sossa/IA/generador-licencias", ACTIVE_ROOT),
    ("generador-licencias/docs/", f"{ACTIVE_ROOT}/docs/"),
    ("generador-licencias/backlog_mejoras", f"{ACTIVE_ROOT}/backlog_mejoras"),
    ("generador-licencias/task", f"{ACTIVE_ROOT}/task"),
    ("generador-licencias/walkthrough", f"{ACTIVE_ROOT}/walkthrough"),
    ("21 subagentes", "24 subagentes"),
    ("21 agentes", "24 agentes"),
    ("[[Tokens CSS]]", "tokens CSS"),
    ("[[Bug]]", "bug"),
    ("[[Bug #12 - Error de descarga]]", "Bug #12 - Error de descarga"),
    ("[[nombre_nota]]", "nombre_nota"),
    ("[[cree un enlace]]", "cree un enlace"),
)


def curated_notes(vault: Path):
    for root_name in ("1_Proyectos", "2_Areas", "3_Recursos"):
        root = vault / root_name
        if not root.exists():
            continue
        for path in root.rglob("*.md"):
            relative = path.relative_to(vault)
            if "Codigo_Beatss" in relative.parts:
                continue
            yield path


def write_if_changed(path: Path, text: str, backup_root: Path) -> bool:
    original = path.read_text(encoding="utf-8", errors="replace")
    if original == text:
        return False
    digest = hashlib.sha256(str(path).encode("utf-8")).hexdigest()[:12]
    backup = backup_root / f"{path.stem}-{digest}{path.suffix}"
    backup_root.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup)
    path.write_text(text, encoding="utf-8")
    return True


def frontmatter_for(path: Path) -> str:
    parts = path.parts
    if "50_Seguridad" in parts:
        note_type = "auditoria"
    elif "30_Contratos" in parts:
        note_type = "contrato"
    elif "10_Pagos" in parts:
        note_type = "guia"
    elif "40_Subagentes" in parts:
        note_type = "arquitectura"
    elif "20_Soporte" in parts:
        note_type = "guia"
    elif path.name.lower() in {"task.md", "roadmap.md"}:
        note_type = "tarea"
    else:
        note_type = "recurso"
    return (
        "---\n"
        f"tipo: {note_type}\n"
        "estado: pendiente\n"
        "fuente: importado\n"
        "fecha_revision: 2026-07-25\n"
        "version: 1\n"
        "---\n\n"
    )


def ensure_note(path: Path, text: str, backup_root: Path) -> bool:
    if path.exists():
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def apply(vault: Path) -> tuple[int, Path]:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup_root = Path(tempfile.mkdtemp(prefix=f"beatss-obsidian-backup-{stamp}-"))
    changed = 0
    for path in curated_notes(vault):
        text = path.read_text(encoding="utf-8", errors="replace")
        for old, new in REPLACEMENTS:
            text = text.replace(old, new)
        if not text.lstrip().startswith("---"):
            text = frontmatter_for(path) + text
        if write_if_changed(path, text, backup_root):
            changed += 1

    index_text = """---
tipo: indice
estado: vigente
fuente: codigo
fecha_revision: 2026-07-25
version: 1
---

# Estado actual de BEATSS

- Código fuente: `/Users/sossa/Documents/Codex/BeatSS`
- Bóveda: `/Users/sossa/Documents/Codex/BeatSS-Obsidian`
- Documentación curada: `1_Proyectos/`, `2_Areas/` y `3_Recursos/`.
- Artefactos Graphify: `99_Derivado/Graphify/` cuando se soliciten.
- Los duplicados de `3_Recursos/Codigo_Beatss/` permanecen intactos hasta
  contar con inventario, comparación y aprobación de archivo.

Consulta `docs/3_Recursos/Obsidian/OBSIDIAN_AUDIT.md` en el checkout para el
último inventario no destructivo.
"""
    if ensure_note(vault / "00_Indice" / "Estado actual.md", index_text, backup_root):
        changed += 1

    dashboard_text = """---
tipo: indice
estado: vigente
fuente: codigo
fecha_revision: 2026-07-25
version: 1
---

# Dashboard BEATSS

- [[Estado actual]]
- [Dashboard canónico del checkout](/Users/sossa/Documents/Codex/BeatSS/Dashboard%20BEATSS.md)
- [Auditoría de Obsidian](/Users/sossa/Documents/Codex/BeatSS/docs/3_Recursos/Obsidian/OBSIDIAN_AUDIT.md)
- [Operación de Obsidian](/Users/sossa/Documents/Codex/BeatSS/docs/3_Recursos/Obsidian/OBSIDIAN_OPERATIONS.md)

La bóveda contiene notas operativas curadas. Las exportaciones de Graphify
permanecen derivadas en `99_Derivado/Graphify/` y el archivo histórico
`3_Recursos/Codigo_Beatss/` no recibe nuevas sincronizaciones.
"""
    if ensure_note(vault / "00_Indice" / "Dashboard BEATSS.md", dashboard_text, backup_root):
        changed += 1

    graphify_text = """---
tipo: guia
estado: vigente
fuente: codigo
fecha_revision: 2026-07-25
version: 1
---

# Graphify derivado

Esta carpeta recibe únicamente copias derivadas de Graphify. No es código
fuente ni documentación operativa. La salida canónica se conserva en
`/Users/sossa/Documents/Codex/BeatSS/graphify-out/`.

No sincronizar hacia `3_Recursos/Codigo_Beatss/`, porque contiene exportaciones
históricas con duplicados.
"""
    if ensure_note(vault / "99_Derivado" / "Graphify" / "README.md", graphify_text, backup_root):
        changed += 1
    return changed, backup_root


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    vault = args.vault.expanduser().resolve()
    if not vault.is_dir():
        parser.error(f"No existe la bóveda: {vault}")
    if not args.apply:
        print("Modo diagnóstico: no se modificó la bóveda. Usa --apply para aplicar cambios acotados.")
        return 0
    changed, backup = apply(vault)
    print(f"Archivos creados o actualizados: {changed}")
    print(f"Respaldos temporales: {backup}")
    print("No se eliminaron, movieron ni renombraron notas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
