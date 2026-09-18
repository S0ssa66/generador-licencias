# Contexto operativo de BEATSS para Codex

Este repositorio fue migrado desde Antigravity. Las rutas absolutas antiguas que
empiezan por `/Users/sossa/IA/generador-licencias` son referencias históricas.
La raíz vigente del proyecto es `/Users/sossa/Documents/Codex/BeatSS`.

## Contexto mínimo al iniciar

Para mantener las sesiones rápidas y consistentes, usa este archivo como índice
de contexto. Antes de modificar el proyecto, leer en este orden:

1. `CURRENT_STATE.md` — única tarea vigente, producción verificada y siguiente acción.
2. `COLLABORATION_PROTOCOL.md` — reglas para coordinar Codex y OpenCode.
3. `task.md` — pendientes técnicos y de negocio.
4. `.agents/AGENTS.md` — reglas de producto, pagos, privacidad y SRI.

Consulta bajo demanda, no de forma completa en cada sesión:

- `Memoria del Proyecto.md` para antecedentes técnicos e históricos.
- `Dashboard BEATSS.md` para navegar documentación.
- `docs/3_Recursos/Graphify/GRAPHIFY_SUMMARY.md` para arquitectura y flujos.
- `CODEX_HANDOFF.md` y `OPEN_CODE_HANDOFF.md` para límites o procedimientos
  específicos de cada entorno.
- `COLLABORATION_STATE.md` para evidencia e historial; no usarlo para inferir
  la tarea actual.

La bóveda completa de Obsidian está en
`/Users/sossa/Documents/Codex/BeatSS-Obsidian`. Los archivos bajo
`docs/Codigo_Beatss` y `docs/3_Recursos/Codigo_Beatss` son artefactos derivados
de Graphify; deben consultarse con búsquedas dirigidas y no asumirse como código
fuente.

No ejecutar Graphify automáticamente después de ediciones o commits. Para una
revisión arquitectónica deliberada, consulta primero el resumen de Graphify y
mantén fuera del corpus `.git/`, `node_modules/`, `dist/`, `.vercel/`, cachés,
backups, `graphify-out/` y las exportaciones Markdown derivadas.

## Reglas de seguridad

- No mostrar, registrar ni incluir en commits valores de `.env`, credenciales
  Firebase, claves privadas, certificados, tokens o contraseñas.
- Respetar `.gitignore` y comprobar `git status` antes de cualquier commit.
- El árbol llegó con cambios locales y archivos sin seguimiento. No descartarlos,
  sobrescribirlos ni incluirlos en un commit sin revisar su procedencia.
- No desplegar a producción, cambiar Firestore, procesar cobros ni enviar
  comunicaciones externas sin autorización explícita del usuario.
- Mantener las reglas de producto, pagos, privacidad y SRI definidas en
  `.agents/AGENTS.md` y `Memoria del Proyecto.md`.

## Entorno local

- Frontend: `npm ci`, luego `npm run dev` o `npm run build`.
- Servidor Python: revisar `requirements.txt` y `run.sh` antes de recrear el
  entorno virtual.
- `node_modules`, `.venv`, `dist` y cachés no forman parte de la migración; son
  dependencias o resultados regenerables.
