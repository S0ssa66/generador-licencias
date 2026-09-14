# Protocolo BEATSS: Codex ↔ OpenCode

Este archivo define cómo continuar el proyecto sin depender del historial de
una aplicación. La fuente compartida es el repositorio; la conversación sirve
como contexto adicional, nunca como única memoria del trabajo.

## Fuente única de continuidad

Antes de trabajar, ambos agentes deben leer en este orden:

1. `AGENTS.md`
2. `CURRENT_STATE.md`
3. `COLLABORATION_PROTOCOL.md`
4. `task.md`
5. `.agents/AGENTS.md`

Los handoffs específicos y `COLLABORATION_STATE.md` se consultan bajo demanda.
Este último es el archivo histórico de evidencia, no la fuente de tarea actual.

Si hay contradicción, prevalece el estado verificable de los archivos y el
código actual. Nunca se debe reconstruir el estado solo por memoria de chat.

## Regla de una sola tarea activa

- Solo puede existir una tarea principal activa en `CURRENT_STATE.md`.
- Antes de editar, el agente debe escribir qué va a cambiar, qué archivos toca y
  cómo lo verificará.
- Si el estado dice `IN_PROGRESS`, el otro agente debe continuar esa tarea o
  detenerse y dejar una nota de bloqueo; no debe iniciar una tarea paralela.
- Si el estado dice `READY_FOR_HANDOFF`, el siguiente agente puede continuar.

## Ciclo obligatorio de cada sesión

### Al comenzar

1. Leer el estado compartido.
2. Ejecutar `git status --short`.
3. Confirmar que el servidor y el puerto no se asumen: comprobarlos.
4. Revisar los cambios locales relacionados con la tarea.
5. No editar `.env`, credenciales, certificados o configuraciones privadas.

### Antes de detenerse

Actualizar `CURRENT_STATE.md` con:

- estado: `IN_PROGRESS`, `READY_FOR_HANDOFF`, `BLOCKED` o `DONE`;
- resumen de lo realizado;
- archivos modificados;
- verificaciones ejecutadas y resultado;
- problema actual o bloqueo, si existe;
- siguiente acción exacta;
- fecha y agente (`Codex` u `OpenCode`).

### Al cerrar una tarea

El agente debe dejar evidencia concreta: build, test, captura visual, endpoint
comprobado o diff revisado. No escribir “funciona” sin indicar qué se probó.

## Propiedad de los archivos

- No usar `git reset --hard`, `git checkout --`, limpieza masiva ni borrar
  cambios locales heredados.
- Si ambos agentes necesitan editar el mismo archivo, uno termina y actualiza
  `CURRENT_STATE.md` antes de que el otro empiece.
- No hacer commits automáticos. El usuario decide cuándo consolidar cambios.
- No desplegar ni cambiar datos externos sin autorización explícita.

## Prompt de inicio para OpenCode

Copiar este texto al comenzar una sesión:

> Trabaja en `/Users/sossa/Documents/Codex/BeatSS`. Antes de hacer cualquier
> cambio, lee `AGENTS.md`, `CURRENT_STATE.md`, `COLLABORATION_PROTOCOL.md`,
> `task.md` y `.agents/AGENTS.md`. Ejecuta `git status --short` y conserva
> todos los cambios locales. Retoma únicamente la tarea indicada como
> `IN_PROGRESS` o `READY_FOR_HANDOFF` en `CURRENT_STATE.md`; no inventes contexto del
> historial. Si existe una tarea activa, continúa desde su siguiente acción.
> Antes de terminar, actualiza `CURRENT_STATE.md` con el resultado,
> archivos modificados, pruebas realizadas y siguiente acción. No leas ni
> muestres `.env`, credenciales, certificados o contraseñas. No hagas deploy,
> cobros, cambios en Firestore ni envíos externos sin mi autorización.

## Prompt de reanudación para Codex

> Retoma BEATSS desde `/Users/sossa/Documents/Codex/BeatSS`. Lee primero
> `AGENTS.md`, `CURRENT_STATE.md`, `COLLABORATION_PROTOCOL.md` y `task.md`.
> Trata el estado
> compartido como la fuente de continuidad, revisa `git status --short` y no
> sobrescribas cambios locales. Continúa exactamente desde la siguiente acción
> indicada. Verifica el resultado antes de marcar la tarea como terminada y
> actualiza `CURRENT_STATE.md` al cerrar.

## Prompt de entrega entre agentes

> Antes de entregar esta tarea al otro agente, actualiza
> `CURRENT_STATE.md`. Incluye: estado, objetivo, resumen, archivos
> modificados, pruebas con resultado, decisiones pendientes, bloqueos y la
> siguiente acción exacta. No describas como terminado algo que no haya sido
> verificado.

## Qué hacer si el estado está desactualizado

No borrar ni adivinar. Revisar `git diff`, `git status`, los logs de la app y
las pruebas disponibles; después actualizar el estado con la evidencia actual.

## Acuerdo de memoria única y trabajo independiente

Acordado por Sossa, Codex y OpenCode el 2026-09-13 para operar en paralelo sin
depender de la memoria del chat.

### Fuente de verdad (una sola)

1. `CURRENT_STATE.md`: único estado operativo vigente (tarea activa, evidencia,
   siguiente acción).
2. `task.md`: checklist de pendientes.
3. `COLLABORATION_STATE.md`: solo histórico; nunca decide el estado actual.
4. `COLLABORATION_PROTOCOL.md`, `AGENTS.md` y `.agents/AGENTS.md`: reglas y
   políticas.
5. `CODEX_HANDOFF.md` y `OPEN_CODE_HANDOFF.md`: solo notas de migración.

Ningún agente decide por memoria de chat: relee el archivo en disco antes de
editar.

### Reclamo y ciclo de sesión

- Al comenzar: leer `AGENTS.md`, `CURRENT_STATE.md`,
  `COLLABORATION_PROTOCOL.md`, `task.md`; ejecutar `git status --short`; y
  reclamar la tarea escribiendo en `CURRENT_STATE.md` una entrada `IN_PROGRESS`
  con agente, fecha, objetivo, archivos y verificación prevista.
- Una sola tarea activa a la vez. Si un archivo cae dentro del scope de otro
  `IN_PROGRESS`, el agente se detiene y deja nota de bloqueo.
- Al terminar: dejar el handoff de `CURRENT_STATE.md` con estado
  (`DONE` | `READY_FOR_HANDOFF` | `BLOCKED`), resumen, archivos modificados,
  pruebas con resultado, bloqueos y siguiente acción exacta.

### Guardia de estado (obligatoria)

El lock vive en `.state-claim.json` (local, ignorado por Git). La fuente
autoritativa sigue siendo `CURRENT_STATE.md`; la guardia sólo impide dos tareas
activas a la vez. Ambos agentes deben ejecutar:

- Al iniciar: `node scripts/state-guard.mjs check`. Si reporta una tarea ajena
  activa, detenerse y dejar nota; no abrir tarea paralela.
- Al reclamar: `node scripts/state-guard.mjs claim --agent <Codex|OpenCode>
  --task "..." --files "a,b" --verify "..."` y reflejar la misma entrada en
  `CURRENT_STATE.md` (`IN_PROGRESS`).
- Al cerrar: `node scripts/state-guard.mjs release --status done|blocked` y
  actualizar `CURRENT_STATE.md` con el handoff completo.

### Reglas duras

- No `git reset --hard`, `git checkout --`, limpieza masiva ni borrar historial.
- No commits, deploy, cobros, Firestore, correos ni secretos sin autorización
  explícita de Sossa.
- No leer ni mostrar `.env`, credenciales, certificados ni contraseñas.
- Si el estado no coincide con git/código, no adivinar: revisar `git diff`,
  `git status`, logs y actualizar con evidencia.

### Resolución de conflictos

- Solo `CURRENT_STATE.md` manda. Si dos entradas chocan, gana la más reciente
  con evidencia verificable; la otra se marca `BLOCKED` o se archiva.
- Si un agente detecta que otro editó el estado, relee y respeta su reclamo
  antes de escribir.

### Registro de aceptación

- `OpenCode`: aceptado 2026-09-13.
- `Codex`: aceptado 2026-09-13; sin tarea activa tras cerrar la auditoría
  Stripe. Confirmó usar `state-guard.mjs check/claim/release` en cada sesión y
  reflejar el mismo estado en `CURRENT_STATE.md`.
