# BEATSS — transferencia a OpenCode

Este archivo es el punto de entrada para continuar el trabajo de BEATSS en
OpenCode. La conversación de Codex no se copia automáticamente a OpenCode;
este documento resume el estado operativo que sí debe conservarse.

## Proyecto y fuentes de verdad

- Raíz activa: `/Users/sossa/Documents/Codex/BeatSS`
- Bóveda Obsidian: `/Users/sossa/Documents/Codex/BeatSS-Obsidian`
- Proyecto histórico: `/Users/sossa/IA/generador-licencias` — no usar para editar.
- Leer primero: `AGENTS.md`, `CURRENT_STATE.md`,
  `COLLABORATION_PROTOCOL.md`, `task.md` y `.agents/AGENTS.md`.
- Consultar después, solo si la tarea lo requiere: `CODEX_HANDOFF.md`,
  `COLLABORATION_STATE.md`, `Memoria del Proyecto.md`, `Dashboard BEATSS.md`
  y `docs/3_Recursos/Graphify/GRAPHIFY_SUMMARY.md`.

## Producción vigente — verificada 2026-09-01

- Alias: `https://beatss.app`
- Despliegue: `dpl_29F7BamD4iRb6dNgUwmNeUozpV7U` (`READY`, `production`).
- La referencia de 2026-08-10 que aparece más abajo es histórica; no usarla
  como la versión actual.

## Estado actual

- Rama actual: `main`.
- El árbol de trabajo contiene cambios locales y archivos sin seguimiento de
  trabajos anteriores. No ejecutar `git reset`, `git checkout`, limpieza masiva
  ni sobrescribir archivos sin revisar su procedencia.
- Existe `.env`; tratarlo como secreto. No leerlo, mostrarlo, copiarlo ni
  incluirlo en commits.
- El diseño sigue siendo experimental. Ninguna paleta, composición o propuesta
  visual está aprobada como definitiva por Sossa.
- No desplegar a producción, cambiar Firestore, procesar cobros ni enviar emails
  sin autorización explícita.

## Sistema de agentes v2 — 2026-08-13

- La fuente activa de roles es `.agents/agent-registry-v2.json`; no reconstruir
  el catálogo desde los prompts o agentes Antigravity históricos.
- `agent_registry.py` resuelve diez agentes canónicos y mantiene compatibles
  los 25 nombres anteriores mediante aliases.
- Cada agente tiene un perfil bajo `.opencode/agents/` sobre
  `deepseek/deepseek-v4-flash`. OpenCode no ejecuta herramientas directamente;
  `agent_manager.py` aplica el allowlist y la política de escritura local.
- Las skills activas propias del proyecto están bajo `.agents/skills-v2/`:
  Evidence Gates, Interface Lab, Sensitive Actions y Knowledge Hygiene.
- Para funciones, aliases, permisos y validación, leer
  `.agents/AGENT_SYSTEM_V2.md`.
- El cierre local pasó 27/27 pruebas de agentes, auditoría 10/10, seguridad,
  build y dos inferencias sintéticas reales. No se desplegó ni hubo pagos,
  correos, Firestore o contenido de bóveda enviado al modelo.

## Actualización operativa histórica — 2026-08-10

- Producción de esa actualización: `dpl_6wdHSvHNZXGgD4TC1nY1qbWk3vo3`,
  `READY`, alias `https://beatss.app`. La portada, checkout móvil, Stripe
  sandbox y reglas quedaron verificados en ese release; ver el estado actual
  para la versión vigente.
- Después del release se retiró localmente un template histórico no utilizado
  de `index.html` y se reforzó `scripts/performance-budget.mjs`. Esta mejora
  reduce 58,825 bytes de HTML fuente y aún no está publicada.
- `npm run build` ya incluye el presupuesto de rendimiento; no sustituirlo por
  una llamada directa a Vite antes de un deploy.
- Las ocho alertas moderadas restantes no tienen una actualización automática
  compatible: el plan de `npm audit fix` baja Firebase Admin a 10.3.0. Dejar
  la dependencia en 13.6.0 y revisar una actualización futura; no usar
  `--force`. La máquina local puede mostrar un aviso por usar Node 26, pero
  el runtime objetivo del proyecto es Node 22.
- El modal de acceso se carga ahora separado del Studio: no volver a importar
  Firestore/Storage desde `auth.js`. Los módulos `firebase-core.js` y
  `firebase-data.js` dividen Auth de datos, mientras `firebase.js` conserva la
  compatibilidad de importaciones del resto de la app. Vite contiene reglas de
  agrupación y preload necesarias para que esa división sea efectiva; ejecutar
  `node --test tests/*.test.mjs` y la auditoría de navegador si se toca esa
  configuración.
- `auth.js` tampoco debe volver a importar `i18n.js`: el diccionario completo
  pertenece al Studio; el modal sólo conserva los dos fallbacks equivalentes
  para la etiqueta del catálogo.
- La vista previa posterior pasó 320, 360 y 390 px sin overflow ni errores en
  la esquina superior derecha; también pasó checkout móvil, carga diferida,
  Lighthouse, build, 34/34 pruebas Node, 9/9 Python y seguridad.
- No desplegar esta optimización sin una nueva autorización explícita. No usar
  `npm audit fix --force`: las ocho alertas moderadas son transitivas y la
  propuesta instala una versión Firebase Admin incompatible con Vercel.

## Último trabajo: flujo del estudio

Problema reportado: al avanzar entre `Tipo`, `Datos` y `Entrega`, el paso
anterior quedaba montado debajo del siguiente.

Corrección aplicada:

- `index.html` contiene un único contenedor `#wizard-stage` con los tres paneles.
- `main.js` usa `showEditorStep()` para activar exactamente un panel, actualizar
  `hidden`, `aria-hidden`, `inert` y `data-wizard-active`, y reiniciar el scroll.
- `viewport-coherence.css` oculta los paneles inactivos y muestra el activo. Se
  eliminó un selector por ID demasiado específico que ocultaba incluso el panel
  activo.
- Se actualizaron las versiones de caché de los assets en `index.html`.

Validaciones realizadas:

- `node --check main.js` pasó.
- `npm run build` pasó con Vite.
- La prueba de transición comprobó los estados 1, 2 y 3, que solo exista un
  panel activo y que el scroll vuelva a cero.
- La última captura visual posterior al ajuste no pudo repetirse porque la
  herramienta de navegador agotó su cuota; OpenCode debe hacer una comprobación
  visual antes de dar este punto por cerrado.

## Cómo ejecutar localmente

### Frontend Vite

```bash
npm ci
npm run dev -- --host 0.0.0.0 --port 5175
```

Abrir en Mac: `http://localhost:5175/studio`.

Para acceder desde un teléfono conectado a la misma red Wi-Fi, usar la IP local
del Mac, por ejemplo `http://192.168.x.x:5175/studio`; no usar `localhost` desde
el teléfono.

### Servidor Python heredado / APIs locales

Revisar `run.sh`, `requirements.txt` y `server.py` antes de levantarlo. El
script usa por defecto el puerto 8000 y mantiene desactivado el worker de SRI.
No activar `ENABLE_SRI_CONTINGENCY_WORKER` hasta que la configuración fiscal
haya sido revisada.

## Checklist para OpenCode

1. Leer los archivos de contexto indicados arriba.
2. Ejecutar `git status --short` y preservar todos los cambios locales.
3. Levantar Vite en un puerto libre.
4. Probar visualmente `/studio` en escritorio y móvil.
5. Confirmar que al cambiar 1 → 2 → 3 nunca aparecen dos paneles ni quedan
   contenidos del paso anterior.
6. Ejecutar `npm run build` y `git diff --check`.
7. Si se modifica UI, revisar también `mobile.css`, `sonic-ledger.css` y
   `viewport-coherence.css` para evitar reglas heredadas con `!important`.
8. No afirmar que SRI, emails, pagos, Firebase, producción o almacenamiento
   funcionan sin una prueba real del flujo correspondiente.

## Nota sobre Obsidian

La conversación de Codex no se guarda automáticamente en Obsidian. Las
decisiones y el estado operativo nuevos se registran en `CURRENT_STATE.md`; este
archivo conserva procedimientos específicos de OpenCode e historial técnico.
