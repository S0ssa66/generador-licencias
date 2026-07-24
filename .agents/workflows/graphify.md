---
name: graphify
description: Turn any folder of files into a navigable knowledge graph
---

# Workflow: graphify

Run Graphify only when a graph refresh is explicitly requested. Use the active
project root (`.`) as input and retain generated files in `graphify-out/`.

Do not export directly into `docs/Codigo_Beatss/`; that legacy destination
created recursive duplicate notes. Use `./sync_graphify_to_beatss_obsidian.sh`
only when a refreshed Obsidian copy is required.
