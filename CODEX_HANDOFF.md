# Traspaso de Antigravity a Codex

Fecha de migración: 2026-07-23

## Ubicaciones

- Proyecto activo: `/Users/sossa/Documents/Codex/BeatSS`
- Bóveda Obsidian: `/Users/sossa/Documents/Codex/BeatSS-Obsidian`
- Proyecto anterior, conservado sin cambios:
  `/Users/sossa/IA/generador-licencias`
- Bóveda anterior, conservada sin cambios:
  `/Users/sossa/Documents/COSAS DE IA/BeatSS`

## Estado conservado

- Se copió el repositorio `.git`, sus ramas y el árbol de trabajo actual.
- Se preservaron los cambios locales existentes y los archivos sin seguimiento.
- Se copió completa la bóveda de Obsidian, incluidos `.obsidian`, Canvas,
  enlaces Markdown y los resultados de Graphify.
- El remoto Git de la copia se cambió a una URL HTTPS sin credenciales
  incrustadas.

## Elementos regenerables no copiados

- `node_modules/`
- `.venv/`
- `dist/`
- cachés y audio temporal no versionado

Los archivos versionados que estaban dentro de `temp_audio_cache` sí fueron
preservados para mantener el mismo estado Git.

## Uso de este archivo

Este es un handoff histórico de la migración a Codex. Para retomar una tarea,
leer primero `AGENTS.md` y `CURRENT_STATE.md`; consultar este archivo sólo para
los límites de la migración, rutas históricas y seguridad. Antes de implementar
una tarea, revisar los cambios locales heredados para no mezclarlos con trabajo
nuevo.

## Seguridad pendiente

La configuración Git anterior contenía una credencial dentro de la URL del
remoto. La copia de Codex ya está saneada, pero esa credencial debe revocarse o
rotarse en GitHub.
