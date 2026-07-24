---
trigger: always_on
description: Consult the graphify knowledge graph at graphify-out/ for codebase and architecture questions.
---

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- For codebase or architecture questions, when `graphify-out/graph.json` exists, first run `graphify query "<question>"` (CLI) or `query_graph` (MCP). Use `graphify path "<A>" "<B>"` / `shortest_path` for relationships and `graphify explain "<concept>"` / `get_node` for focused concepts. These return a scoped subgraph, usually much smaller than `GRAPH_REPORT.md` or raw grep output.
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context
- Do not rebuild or export Graphify automatically after ordinary code edits or Git commits. The previous automatic workflow recursively indexed generated notes and created thousands of duplicates.
- Refresh it manually only for a deliberate architecture/documentation review. Keep generated output in `graphify-out/` and, if an Obsidian copy is needed, use `./sync_graphify_to_beatss_obsidian.sh`. Never export to `docs/Codigo_Beatss/`.
- Before a manual refresh, exclude generated and non-source paths: `.git/`, `node_modules/`, `dist/`, `.vercel/`, `.venv/`, caches, backups, `graphify-out/`, `docs/Codigo_Beatss/` and `docs/3_Recursos/Codigo_Beatss/`. Index application code and curated docs only.
