# Operación documental de Obsidian — BEATSS

## Fuentes de verdad

1. Código fuente y estado técnico: `/Users/sossa/Documents/Codex/BeatSS`.
2. Notas operativas curadas: `/Users/sossa/Documents/Codex/BeatSS-Obsidian`.
3. Graphify: salida derivada en `graphify-out/` o en
   `BeatSS-Obsidian/99_Derivado/Graphify/` cuando se solicite explícitamente.
4. `docs/3_Recursos/Codigo_Beatss/` y `docs/Codigo_Beatss/` son históricos o
   derivados; no deben recibir nuevas exportaciones.

## Estructura objetivo

```text
BeatSS-Obsidian/
├── 00_Indice/
├── 1_Proyectos/
│   └── BeatSS/
├── 2_Areas/
│   ├── 10_Pagos/
│   ├── 30_Contratos/
│   └── 50_Seguridad/
├── 3_Recursos/
│   ├── 20_Soporte/
│   ├── 40_Subagentes/
│   └── Codigo_Beatss/        # legado, solo lectura
├── 4_Archivo/
└── 99_Derivado/
    └── Graphify/
```

La consolidación de duplicados es una tarea posterior y requiere inventario,
comparación de contenido y una copia recuperable. Este flujo no elimina notas.

## Auditoría

Ejecutar desde el checkout:

```bash
python3 scripts/obsidian_maintenance.py \
  --vault /Users/sossa/Documents/Codex/BeatSS-Obsidian \
  --report docs/3_Recursos/Obsidian/OBSIDIAN_AUDIT.md
```

El script excluye `.obsidian`, `4_Archivo` y `3_Recursos/Codigo_Beatss` del
conteo de notas curadas, pero informa el tamaño de los artefactos derivados.

## Reglas de mantenimiento

- No ejecutar Graphify automáticamente después de editar o hacer commit.
- No borrar ni renombrar duplicados sin inventario y confirmación.
- No convertir artefactos `graphify/EXTRACTED` en notas operativas.
- Usar frontmatter en nuevas notas curadas:

```yaml
---
tipo: decision|guia|auditoria|arquitectura|tarea
estado: vigente|historico|pendiente|archivado
fuente: codigo|usuario|auditoria|graphify
fecha_revision: 2026-07-25
version: 1
---
```
