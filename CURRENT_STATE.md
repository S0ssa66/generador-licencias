# Estado operativo actual de BEATSS

> Fuente breve de continuidad para Codex y OpenCode. No contiene secretos,
> datos de clientes ni historial extenso. El historial se conserva en
> `COLLABORATION_STATE.md`, que desde 2026-09-01 es un archivo de consulta.

## Rediseño compacto de Ventas y retiro del asistente financiero — 2026-09-16

- Estado: `DONE` (local; pendiente de publicar si Sossa lo autoriza).
- Agente: `OpenCode`.
- Ventas: se compactó la sección para reducir el scroll — hero más pequeño,
  métricas más bajas (min-height 104px y tipografía menor), paneles y gráficos
  con menos padding y altura (charts 250 → 170px), gaps 24 → 16px.
- Asistente financiero (Copilot): **eliminado** — se quitó la sección
  `sales-copilot` de `index.html`, el módulo `dashboard_modules/copilot.js`, su
  import en `dashboard-module.js` y su CSS en `sales-analytics.css`. El bundle
  ya no contiene Copilot.
- Archivos: `index.html`, `sales-analytics.css`, `dashboard-module.js`,
  `dashboard_modules/copilot.js` (eliminado), `main.js` (comentario),
  `tests/auth-bootstrap.test.mjs`, `tests/security-hardening-batch11.test.mjs`,
  `tests/security-hardening-batch14.test.mjs`.
- Verificación: 259/259 pruebas Node, `npm run build` con presupuesto; `dist`
  sin referencias a Copilot. La prueba de arranque ahora exige que
  `sales-copilot` NO exista (barrera anti-regresión).
- Nota: quedan reglas CSS inertes de copilot en `beatss-coherence.css`
  (selectores que ya no coinciden con ningún elemento); no afectan la vista.
- Siguiente acción: revisar visualmente y, si Sossa autoriza, publicar.

## Desplegar blindaje SRI verificado a producción — DONE (2026-09-16)

- Estado: `DONE`
- Agente: `Codex`
- Objetivo: publicar el blindaje SRI ya verificado localmente, sin modificar
  registros de ventas ni emitir comprobantes.
- Despliegue: `dpl_4BUNcwpYJxbpq2wkeN6uT9b1FAbF`, estado `READY`.
- Producción: alias `https://beatss.app` asignado al despliegue; comprobación
  externa HTTP `200` realizada después de publicar.
- Límite: el despliegue no emitió facturas, no alteró Firestore y no ejecutó
  cobros.
- Siguiente acción exacta: si Sossa decide activar la emisión SRI, habilitarla
  desde Configuración y realizar una prueba Live controlada con una solicitud
  explícita de factura.

## Blindar facturación SRI opcional, cola idempotente y privacidad — DONE (2026-09-16)

- Estado: `DONE`
- Agente: `Codex`
- Objetivo: impedir la facturación SRI automática sin decisión explícita,
  distinguir eventos Stripe Live de pruebas, reflejar estados fiscales reales,
  endurecer la cola contra duplicados y evitar que secretos SRI lleguen al
  navegador.
- Resumen: las compras nuevas empiezan en `NO_EMITIDA`; sólo se encolan si son
  Live, el comprador solicitó factura y el productor activa expresamente la
  emisión automática. El reintento manual conserva control del productor. Las
  pruebas Stripe quedan fuera de la cola fiscal. La cola usa una clave
  idempotente por pago, lease con precondición de versión y heartbeat del
  worker. Los estados visibles ahora distinguen cola, proceso, autorización y
  contingencia. La firma P12 y contraseña se migran al documento SRI sin
  lectura de cliente; nuevos XML/RIDE se almacenan en Storage privado y la API
  mantiene compatibilidad de descarga para comprobantes antiguos en Base64.
- Archivos modificados: `api/_sri_queue.js`, flujo de checkout/Stripe y
  cumplimiento, `api/payments/retry-sri.js`, `api/payments/config.js`,
  `api/_sri_download.js`, `dashboard_modules/history.js`,
  `dashboard_modules/invoicing.js`, `main.js`, `index.html`,
  `sri_contingency.py`, `sri_service.py`, reglas Firestore/Storage y pruebas.
- Pruebas:
  - `node --test tests/*.test.mjs`: **260 / 260** aprobadas.
  - `npm run security:check`: aprobado; sólo advierte que
    `DOWNLOAD_SIGNING_KEY` no está presente localmente.
  - `npm run security:deps`: sin vulnerabilidades altas ni críticas; reporta
    **9 moderadas** en dependencias transitivas de Firebase/Admin. No se aplicó
    el arreglo automático porque propone una actualización mayor.
  - `npm run build`: aprobado; HTML gzip **61,329 bytes**, bajo el límite de
    65 kB.
  - Sintaxis Python de `sri_service.py` y `sri_contingency.py`: aprobada.
  - `git diff --check`: las rutas intervenidas no añaden errores nuevos; el
    árbol ya contiene dos espacios finales heredados en `checkout.js:1004` y
    `firestore.rules:123`, que no se reescribieron para no alterar trabajo
    local ajeno.
- Límite de verificación: `python3 -m unittest tests/test_sri_invoicing.py` no
  pudo ejecutarse en este equipo porque falta el paquete local `lxml`; no se
  instalaron ni actualizaron dependencias durante este cambio.
- No se desplegó, no se modificó Firestore, no se emitió una factura y no se
  leyó ni expuso ningún secreto.
- Siguiente acción exacta: con autorización de Sossa, desplegar y luego probar
  en producción una compra Live con solicitud de factura usando credenciales
  fiscales válidas, verificando `NO_EMITIDA`/`EN_COLA_EMISION` y la descarga
  autenticada de XML/RIDE según corresponda.

## Depurar registros de licencias de prueba — DONE (2026-09-16)

- Estado: `DONE`
- Agente: `Codex`
- Fecha: `2026-09-16`
- Objetivo: archivar por lote únicamente las nueve licencias de prueba ya
  aprobadas, sin tocar ventas reales ni sus pagos, PDFs o entregas.
- Archivos previstos: `CURRENT_STATE.md`, `index.html`, `storageBackup.js`,
  `dashboard_modules/history.js` y su prueba de historial. Se conservará el
  ID real de cada documento Firestore y se usará archivo de bajas en vez de
  borrado sin rastro.
- Verificación: exigir que existan exactamente las nueve referencias aprobadas
  antes de una operación en lote; conservar activos los registros Live y
  manuales reales, y comprobar el total activo y el archivo privado después.
- Inventario read-only: 9 candidatos. Seis Stripe Sandbox/E2E con referencias
  `cs_test_` (Magic y Diamond, 2026-08-08 a 2026-09-12) y tres licencias
  manuales de beat `Prueba1`: `LIC-BAS-20260605-6364`,
  `LIC-BAS-20260605-7214`, `LIC-BAS-20260605-7537`.
  Quedan excluidas expresamente la venta Live de Juliana (`cs_live_…`) y la
  venta manual de Jefferson (`BS3-20260913-BAS-…`).
- Decisión de producto: la acción existente borraba el documento sin conservar
  evidencia. Por solicitud expresa de Sossa se sustituirá por una baja auditable
  (`archivedAt`, motivo y referencia), fuera del conteo y de las métricas, pero
  visible sólo en un archivo privado de bajas.
- Implementación local completada: `dashboard_modules/history.js` ahora archiva
  en vez de ejecutar `deleteDoc` por fila, persiste `historyStatus`,
  `archivedAt` y motivo; `index.html` presenta "Licencias eliminadas" y
  `license-library.css` la distingue del historial activo. La razón de los
  candidatos detectados como prueba será "Registro de prueba eliminado por
  Sossa".
- Pruebas y verificación:
  - `node --test tests/*.test.mjs`: **254 / 254** aprobadas.
  - `npm run security:check`: aprobado (sin secreto de descarga local, como se
    espera en esta revisión).
  - `npm run build`: aprobado; presupuesto de rendimiento aprobado (HTML gzip
    61,104 bytes, bajo 65 kB).
  - `git diff --check` sobre archivos intervenidos: sin errores de espacios.
- Despliegue publicado: Sossa autorizó el 2026-09-16 y Vercel publicó la
  corrección final en `dpl_6n1UN9JhHD89kRjCcZQxYqaaLdRF`, estado `READY`,
  producción y alias `https://beatss.app`.
- Límite: no se alteró ningún documento de Firestore durante el despliegue y
  no se usó el botón antiguo, pues borraría sin trazabilidad.
- Corrección local posterior: se detectó que el archivado por fila asumía que
  la referencia pública era el ID del documento Firestore. `storageBackup.js`
  ahora conserva el `firestoreId` real sólo en memoria, `saveHistory()` no lo
  persiste como dato contractual, y las copias antiguas no pueden reactivar una
  baja. `history.js` incorpora un lote cerrado de las nueve referencias ya
  aprobadas: exige encontrarlas todas antes de escribir y usa `writeBatch` para
  marcar la baja auditable en una sola confirmación.
- Verificación local posterior: `node --test tests/*.test.mjs` **256 / 256**,
  `npm run security:check` aprobado (la advertencia local de
  `DOWNLOAD_SIGNING_KEY` es esperada) y `npm run build` aprobado; HTML gzip
  61,183 bytes, dentro del límite de 65 kB.
- Ejecución autenticada en producción: se aplicó una sola operación atómica de
  Firestore sobre las nueve referencias cerradas; cada una quedó con
  `historyStatus: archived`, fecha de baja y motivo “Registro de prueba
  eliminado por Sossa”. No se borró ningún documento ni se modificó una venta,
  pago, PDF o entrega real.
- Verificación visual autenticada en `https://beatss.app/licencias`: contador de
  activas **50**; archivo privado de bajas **9** con las nueve referencias y
  marcas de tiempo; siguen activas la licencia manual de Jefferson
  `BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN` y la venta Live de Juliana
  `cs_live_a1cMFd1TNZ2kmNm0vqJG7u3J4Y9sHksYOJCoiNY4fxdcqrSOsryzu1E6KE`.
- Pruebas finales de la implementación: `node --test tests/*.test.mjs`
  **256 / 256** aprobadas; `npm run security:check` aprobado (la advertencia
  local de `DOWNLOAD_SIGNING_KEY` es esperada); `npm run build` aprobado y
  HTML gzip **61,183 bytes**, dentro del límite de 65 kB.
- Siguiente acción exacta: ninguna para estas pruebas; las bajas se conservan
  sólo para auditoría y las licencias reales permanecen en el registro activo.

## Compactar encabezado de Licencias — DONE (2026-09-16)

- Estado: `READY_FOR_HANDOFF`
- Agente: `Codex`
- Objetivo: reducir el espacio inicial de “Tus acuerdos, en orden” para que el
  registro de licencias aparezca antes de tener que desplazarse.
- Resumen: se retiró el salto de línea forzado del título y se redujeron la
  altura mínima, padding, tipografía, separaciones y sello de privacidad; los
  breakpoints móvil y tableta también conservan una cabecera compacta.
- Archivos modificados: `index.html`, `license-library.css`,
  `tests/history-pdf-flow.test.mjs`, `CURRENT_STATE.md`.
- Pruebas: prueba focal de historial **6 / 6** aprobada; `npm run build` y
  presupuesto de rendimiento aprobados (HTML gzip 61,100 bytes, bajo 65 kB);
  `git diff --check` sin errores de espacios.
- Despliegue: incluido en `dpl_AnmwiBWhZvGCE9WjLgYGQ9cMAjWu`, estado `READY`,
  alias `https://beatss.app`; la respuesta pública de `/licencias` contiene el
  título compacto sin el salto de línea forzado.
- Siguiente acción exacta: continuar con el archivado auditado de los nueve
  registros de prueba ya confirmados.

## Publicar corrección de vista previa del contrato — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Codex`
- Fecha: `2026-09-15`
- Objetivo: Publicar la corrección de la vista previa vacía de `/contrato`.
- Resumen: se publicó el árbol autorizado por Sossa, incluida la corrección que
  conecta el editor modular al estado vigente y evita el visor vacío.
- Archivos modificados: `editor.js`, `tests/contract-preview.test.mjs`,
  `CURRENT_STATE.md`.
- Pruebas y verificación:
  - `node --test tests/*.test.mjs`: **253 / 253** aprobadas.
  - `npm run security:check` y `npm run build`: aprobados.
  - Revisión visual autenticada en `https://beatss.app/contrato`: el documento
    muestra el encabezado, cláusulas, aceptación y sello; ya no aparece la hoja
    en blanco.
- Bloqueos: ninguno.
- Siguiente acción exacta: crear una licencia de prueba desde el Studio si se
  desea comprobar un caso con datos completos antes de una entrega real.

## Corrección de Historial de Emails y Saneamiento de Recursos por Nivel de Licencia — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: En la pestaña de "Emails Enviados" (`tab-email-history`), un registro de fecha 2026-09-13 correspondiente al beat "Wow" y comprador Jefferson Andrés Ambuludi Ordóñez bajo licencia Básica mostraba etiquetas de archivos WAV y Stems además de MP3 y PDF. Se verificó que:
  1. El registro en Firestore (`l855AQrIUpA2raY2YZ6r`) correspondió al intento preliminar con referencia `"REF"`, donde el formulario manual antiguo anexó al log todos los archivos vinculados al beat sin filtrar por nivel de licencia.
  2. El comprador **nunca** tuvo acceso a WAV ni Stems: la plantilla EmailJS condicionaba estrictamente la inclusión de enlaces de WAV y Stems a licencias no básicas (`type !== 'basic'`), los enlaces directos a `proxy-audio` devuelven `403 Forbidden` al carecer de firma HMAC, y la entrega oficial de la compra (`manual_f9d6f2fadab81d68f31216862243a758f7c759c7`) entrega únicamente MP3 y PDF.
- Acciones ejecutadas:
  1. **Saneamiento en Firestore (Opción B aprobada por Sossa)**:
     - Documento `users/paXbnNbHMMPC31X3hf0oTUx4bbr2/email_logs/l855AQrIUpA2raY2YZ6r` actualizado para conservar estrictamente los recursos correspondientes a Licencia Básica (`pdf` y `mp3`), eliminando `wav` y `stems`.
  2. **Blindaje del Módulo de Historial de Emails (`dashboard_modules/email_history.js`)**:
     - Implementada la función `filterResourcesForLicense(resources, licenseType)` para que licencias `basic` excluyan `wav` y `stems`, y `premium` excluyan `stems`.
     - Aplicado el filtro preventivo en `renderRows`, `buildDeliveryLinks` (para reenvíos), `recordEmailEvent`, `exportEmailHistoryToCSV` y `exportEmailHistoryToJSON`.
  3. **Pruebas unitarias (`tests/email-history.test.mjs`)**:
     - Añadida prueba unitaria que verifica la exclusión estricta de WAV/Stems en Básica y Stems en Premium.
- Verificación técnica:
  - Suite de pruebas completa: **252 / 252 tests passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de compilación y rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.56 kB $\le$ 65 kB).
- Siguiente acción: Esperar instrucciones de Sossa para desplegar a producción o atender la siguiente tarea.

## Despliegue en producción (Vercel) — Rediseño Móvil Studio y Corrección Footer Flotante — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Objetivo: Publicar en producción (`https://beatss.app`) el rediseño completo del Studio móvil ("Crear") y la eliminación de la brecha blanca/footer flotante.
- Despliegue Vercel:
  - Deployment ID: `dpl_F8SgZKHxRzFo6kZ2rrL1Z6VrUa4c`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-781psc40h-masterjuego25-5300s-projects.vercel.app`
  - Inspector: `https://vercel.com/masterjuego25-5300s-projects/generador-licencias/F8SgZKHxRzFo6kZ2rrL1Z6VrUa4c`
  - Build Duration: 50s (Vite build + gzip budget: 60.56 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/"` -> HTTP/2 200 OK verificado en vivo (`x-vercel-id: iad1::4khrv-1789514221179-437670bca722`).
- Siguiente acción: Tarea concluida satisfactoriamente.

## Rediseño Móvil del Studio de Licencias y Erradicación de Footer Flotante — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: En la vista móvil del Studio de Licencias (pestaña "Crear" / `#app-container[data-active-tab="editor"] .sidebar`), existía una triple acumulación de compensaciones (`padding-bottom: 150px` en `mobile.css`, `position: sticky; bottom: calc(76px + ...)` en `viewport-coherence.css`, y `padding-bottom: calc(76px + ...)` en `.sidebar-footer`) que empujaba el botón "Continuar a datos" flotando más de 250px por encima de la barra de navegación móvil, dejando un enorme espacio blanco vacío que tapaba e impedía visualizar y seleccionar las licencias inferiores (Premium Plus, Ilimitada, Exclusiva). Además, una regla de inyección inline en `mobile-studio.js` aplicaba `display: block !important`, destruyendo la estructura de columna flexbox de la barra lateral.
- Acciones ejecutadas:
  1. **Arquitectura Flexbox de Pantalla Completa (`contract-studio.css`, `mobile.css`, `mobile-studio.js`)**:
     - `.sidebar` configurado con `display: flex !important; flex-direction: column !important; height: 100dvh; max-height: 100dvh; padding-bottom: calc(72px + env(safe-area-inset-bottom, 8px)); overflow: hidden;`.
     - `.sidebar-scroll` configurado con `flex: 1 1 0%; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 10px 12px 20px;`, permitiendo scroll independiente y suave en el contenido sin desplazar el contenedor padre.
     - `.sidebar-footer` ajustado a `position: relative !important; bottom: auto !important; flex: 0 0 auto; padding: 8px 12px;` con fondo blanco y sutil sombra superior, eliminando los 150px redundantes.
  2. **Rediseño Paso 1 (Selección de Licencias)**:
     - Tarjetas en ancho completo (1 columna) con `min-height: 60px`, bordes elegantes (`1.5px solid #e2e8f0`), tipografía contrastada y legible.
     - Radio indicators táctiles personalizados (20x20px con aro azul `#3157e8`).
     - Visibilidad de las 5 licencias (Básica, Premium, Premium Plus, Ilimitada, Exclusiva).
  3. **Rediseño Paso 2 (Datos del Contrato)**:
     - Campos táctiles modernos con radio de borde de 12px, etiquetas nítidas y selector de cliente.
     - Navegación balanceada: botón "Volver a licencia" (38%) y botón "Revisar entrega" (62%).
  4. **Rediseño Paso 3 (Entrega y Acciones)**:
     - Rejilla compacta de 2 columnas para `#delivery-actions`, evitando el crecimiento vertical excesivo.
     - Control estricto de atributos `[hidden]` (`display: none !important`) para prevenir que botones de pasos futuros o pasados colisionen con el paso activo.
- Verificación técnica y visual:
  - Suite de pruebas completa: **251 / 251 passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Compilación y presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.56 kB $\le$ 65 kB).
  - Verificación visual E2E en viewport de iPhone 14/15 (390x844) con Puppeteer: Pasos 1, 2 y 3 verificados; pie de página perfectamente encajado justo encima de `.ledger-mobile-nav` con 0px de holgura muerta.
- Siguiente acción: Desplegar a producción en Vercel tras autorización del usuario.

## Despliegue en producción (Vercel) — Sincronización Licencia Manual e Historial — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Objetivo: Publicar en producción (`https://beatss.app`) el blindaje de `server-handlers/secure-license-delivery.js` para sincronización automática en `users/{producerId}/licencias/{paymentId}` y reflejo inmediato en el historial.
- Despliegue Vercel:
  - Deployment ID: `dpl_Dw4SiV9Y8KCpFbm3dsyH74wcVeg2`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-8us7cm8tg-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 47s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/"` -> HTTP/2 200 OK verificado en vivo (`x-vercel-id: iad1::pmk77-1789509509869-b4cea56c657e`).
- Siguiente acción: Tarea concluida satisfactoriamente.

## Sincronización de Licencia Manual en Historial y Corrección de Entrega — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: La licencia manual emitida para el beat `Wow` (`beat_1789340688365`) a nombre de `Jefferson Andrés Ambuludi Ordóñez` (Básica, $30.00, ref `BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN`, emitida el 2026-09-13) no figuraba en la vista de "Registros Recientes" (`tab-history`). El documento de pago residía íntegro en `/payments/manual_f9d6f2fadab81d68f31216862243a758f7c759c7` y su PDF en Cloud Storage, pero `server-handlers/secure-license-delivery.js` no sincronizaba el registro hacia la subcolección `/users/{producerId}/licencias`, la cual es leída por la app cliente (`loadHistory` en `storageBackup.js`).
- Acciones ejecutadas:
  1. **Sincronización en Firestore**: Documento `manual_f9d6f2fadab81d68f31216862243a758f7c759c7` sincronizado con metadatos completos y enlace directo a PDF en `users/paXbnNbHMMPC31X3hf0oTUx4bbr2/licencias` y en espejo para `users/I2gjxwWf6VWWvAipK1WowvLJD3t2/licencias`.
  2. **Blindaje de Backend (`server-handlers/secure-license-delivery.js`)**: Añadida la sincronización automática de entregas manuales hacia `users/{producerId}/licencias/{paymentId}` inmediatamente tras persistir el contrato en PDF y la colección `payments`.
  3. **Prueba de regresión (`tests/secure-license-delivery-regression.test.mjs`)**: Añadida aserción para garantizar la persistencia continua en la subcolección `licencias`.
- Verificación técnica:
  - Suite de pruebas completa: **251 / 251 passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Compilación y presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.56 kB $\le$ 65 kB).
- Siguiente acción: Desplegar a producción en Vercel (Completado).

## Despliegue en producción (Vercel) — Corrección Login Google Mobile & Proxy Auth — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Objetivo: Publicar en producción (`https://beatss.app`) la corrección integral del inicio de sesión con Google en navegadores móviles (preservación de activación de usuario sin `disabled` síncrono previo al popup, eliminación de redirección ciega a dominios con storage partitioning, reverse proxy en `/__/auth/:path*` y selector explícito de cuenta).
- Despliegue Vercel:
  - Deployment ID: `dpl_3Xg8mv2qLcSNVZ6UWppRW2ZHMaeT`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-kigzga9iu-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 44s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/"` -> HTTP/2 200 OK verificado en vivo (`x-vercel-id: iad1::ws7sh-1789507795812-b5d570512568`).
  - `curl -s -I "https://beatss.app/__/auth/handler"` -> HTTP/2 200 OK verificado en vivo (`x-vercel-id: iad1::64ff6-1789507796252-44e7c0c511ae`).
- Siguiente acción: Tarea concluida satisfactoriamente.

## Corrección de Login con Google en móvil y erradicación de "missing initial state" — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: Al intentar iniciar sesión con Google en navegadores móviles (iOS Safari, Chrome iOS, WebKit), aparecía una pantalla de error en `...firebaseapp.com` con el mensaje: *"Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared. Some specific scenarios are - 1) Using IDP-Initiated SAML SSO. 2) Using signInWithRedirect in a storage-partitioned browser environment."*.
  Las causas raíz identificadas fueron:
  1. `auth.js` ejecutaba `setButtonBusy(googleBtn, true)` de forma síncrona antes de llamar a `signInWithPopup(auth, googleProvider)`. En WebKit (iOS), deshabilitar el botón pulsado (`button.disabled = true`) cancela de inmediato la activación transitoria del usuario (`transient user activation`), haciendo que el navegador bloquee la ventana emergente con el error `auth/popup-blocked`.
  2. En el bloque `catch` de `auth.js`, al detectar el fallo del popup, se ejecutaba ciegamente `await signInWithRedirect(auth, googleProvider)`.
  3. `signInWithRedirect` guardaba el estado OAuth en `sessionStorage` bajo `beatss.app` y redirigía la ventana a `licencias-musicales.firebaseapp.com/__/auth/handler`.
  4. Debido a las políticas modernas de partición de almacenamiento en navegadores móviles (Safari ITP / Chrome storage partitioning), `licencias-musicales.firebaseapp.com` no tiene acceso al `sessionStorage` originado en `beatss.app`, arrojando la pantalla de error fatal y dejando al usuario atrapado fuera de la aplicación.
- Archivos modificados:
  - `auth.js`:
    - Preservada la activación de usuario en el evento `click`: ya no se establece `button.disabled = true` de forma síncrona antes de `signInWithPopup`. Se utiliza guarda en vuelo `isGoogleAuthPending` y feedback visual con `aria-busy="true"` y texto.
    - Eliminada la redirección ciega `signInWithRedirect` hacia el dominio cruzado de Firebase en caso de fallo del popup. Ahora la aplicación retiene al usuario dentro de `beatss.app`, restaura el botón y comunica el estado claramente con `parseAuthError`.
    - Mensaje refinado para `auth/popup-blocked` instruyendo al usuario a permitir ventanas emergentes o abrir directamente en Safari/Chrome.
    - Manejo seguro de errores en `getRedirectResult` usando `setAuthMessage` y `parseAuthError`.
  - `firebase-core.js`:
    - Configurado `googleProvider.setCustomParameters({ prompt: 'select_account' })` para garantizar selección explícita de cuenta y evitar bucles silenciosos de autenticación.
  - `vercel.json`:
    - Añadida regla de reescritura reverse-proxy: `/__/auth/:path*` $\rightarrow$ `https://licencias-musicales.firebaseapp.com/__/auth/:path*`.
  - `tests/auth-bootstrap.test.mjs`:
    - Añadida prueba unitaria que verifica la preservación del gesto de usuario (sin `disabled = true` síncrono previo al popup), la ausencia de `signInWithRedirect` ciego ante bloqueos de popup, la configuración de `prompt: 'select_account'` y la presencia del rewrite en `vercel.json`.
- Verificación técnica:
  - Suite de pruebas unitarias: **250 / 250 passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de compilación y rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (HTML gzip: 60.56 kB $\le$ 65 kB).
- Siguiente acción: Esperar confirmación de Sossa tras probar el acceso con Google en móvil.

## Despliegue en producción (Vercel) — Optimización Móvil y Erradicación Barrera — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Objetivo: Publicar en producción (`https://beatss.app`) la optimización integral de la versión móvil, eliminación de la barrera de scroll inferior, botón flotante del editor elevado, acceso a Facturas SRI en dock y zonas táctiles ampliadas, autorizado por Sossa.
- Despliegue Vercel:
  - Deployment ID: `dpl_GdjLG9zBABxuZMwjBjn9tbri8ZSr`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-bg5o5fhk1-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 34s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/"` -> HTTP/2 200 OK verificado en vivo (`x-vercel-id: iad1::2dtt9-1789506291432-66b67dd5a1df`).
  - Navegación responsive y carga en producción comprobadas.
- Siguiente acción: Tarea concluida satisfactoriamente.

## Optimización integral de la versión móvil y erradicación de la barrera inferior — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: En pantallas móviles (≤ 768px), los elementos en la parte inferior (tarjetas de "Facturación" y "Empieza en tres pasos" en Inicio, botones de comprobantes SRI y el asistente flotante del editor) quedaban bloqueados u ocluidos por la barra inferior fija (`.ledger-mobile-nav`), dando la sensación de una "barrera" que impedía ver y acceder al contenido inferior. Las causas raíz identificadas por la auditoría fueron:
  1. Deducción duplicada de altura y padding (`height: calc(100dvh - 89px)` en `.main-panel` sumado a `padding-bottom: 89px` en `#app-container`).
  2. Trampas de scroll anidado con `overflow-y: auto` concurrente en `.main-panel` y `#tab-home.active`.
  3. Padding inferior insuficiente (52px) en `.producer-home-shell` ante la barra fija de ~76px.
  4. El asistente flotante del editor (`.sidebar-footer`) quedaba solapado por debajo del dock de navegación móvil.
  5. El menú "Más" (`.ledger-mobile-more`) carecía de listener de click-outside/tap-outside para cerrarse y no ofrecía acceso directo a "Facturas SRI".
- Archivos modificados:
  - `dashboard-home.css`: Eliminadas deducciones redundantes de 89px, `padding-bottom: calc(115px + env(safe-area-inset-bottom, 20px)) !important;` en `.producer-home-shell`, `padding-bottom: 0 !important;` en `#app-container.saas-workspace`, y `overflow-y: visible !important; height: auto !important;` en `#tab-home.active` móvil.
  - `mobile.css`: `padding: 12px 12px calc(115px + env(safe-area-inset-bottom, 20px)) !important;` en `.tab-content.active`, `overscroll-behavior-y: contain`, tap targets ampliados a ≥ 46px en `.ledger-mobile-more button`.
  - `viewport-coherence.css`: `.sidebar-footer` elevado a `bottom: calc(76px + env(safe-area-inset-bottom, 12px)) !important; z-index: 501 !important;`.
  - `mobile-studio.js`: Integrado botón directo a "Facturas SRI" en menú "Más", añadido `tab-invoicing` a `secondaryViews`, implementado cierre automático con `pointerdown` al pulsar fuera del menú, y expuesto `window.setMobileStudioView`.
  - `main.js`: Vinculado clic en "Crear una licencia" de Inicio con conmutación directa a `setMobileStudioView('editor')` en móvil, y refrescados parámetros de cache busting (`v=boot-fix-6`).
  - `facturador.css`, `license-library.css`, `beat-catalog.css`, `sales-analytics.css`, `operations-ledger.css`: Padding inferior `calc(115px + env(safe-area-inset-bottom, 20px))` y zonas táctiles de 44px en acciones de tablas.
  - `tests/auth-bootstrap.test.mjs`: Test añadido verificando holgura de scroll inferior en móvil, `tab-invoicing` en navegación y cierre `pointerdown`.
- Verificación técnica:
  - Pruebas unitarias y de integración: **249 / 249 passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (gzip: 60.56 kB index / límite 65 kB).
  - Verificación Puppeteer en viewport móvil (390x844): Confirmada visualmente la holgura de 22px entre la última tarjeta y el dock, apertura del menú Más con "Facturas SRI", cierre al tocar fuera, footer del editor visible a 143px sobre el dock, e interfaz fluida en SRI, Catálogo y Registro.
- Siguiente acción: Desplegar a producción en Vercel y verificar disponibilidad en `https://beatss.app`.

## Corrección de carga bajo demanda del compilador de contratos en PDF de Licencias — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: Al entrar directamente a `/licencias` y pulsar el botón "PDF" en cualquier registro, salía el mensaje *"Error al generar el PDF: El compilador de contratos no está disponible."*. La causa raíz fue que el generador de contratos (`compileContractData`) reside en `editor.js`, el cual se carga perezosamente (lazy loading) solo al abrir la pestaña del Studio (`/contrato` / `tab-preview`). Al navegar directamente a `/licencias`, `window.compileContractData` aún no estaba en memoria del navegador.
- Archivos modificados: `dashboard_modules/history.js`, `main.js`, `tests/history-pdf-flow.test.mjs`, `CURRENT_STATE.md`.
- Cambios realizados:
  - `dashboard_modules/history.js`:
    - En `downloadLicensePdfFromHistory`, si `window.compileContractData` no está en memoria, importa dinámicamente `../editor.js` (`await import('../editor.js')`) bajo demanda antes de compilar el contrato.
    - Soporte de metadatos de productor como fallback directo (`window.producerConfig || lic.producerConfig || lic.producer`).
  - `main.js`:
    - Al conmutar a `tab-history`, dispara la precarga en segundo plano de `editor` (`Promise.resolve(loadModule('editor')).catch(() => {})`) para que el compilador esté listo de inmediato cuando el usuario presione PDF o Editar.
  - `tests/history-pdf-flow.test.mjs`:
    - Aserción añadida para validar la importación dinámica de `../editor.js`.
- Verificación técnica:
  - Pruebas unitarias: **248 / 248 passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (gzip: 60.56 kB index / límite 65 kB).
  - Verificación Puppeteer: Comprobado el clic en el botón PDF con import dinámico en vivo (`compilerBeforeClick` $\rightarrow$ `compilerAfterClick: function`, `html2pdfSaveCalled: true`, `errorToast: null`).
- Siguiente acción: Desplegar la corrección a producción en Vercel con autorización de Sossa.

## Despliegue en producción (Vercel) — Rediseño Licencias y Flujo PDF — DONE (2026-09-15)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Objetivo: Publicar en producción (`https://beatss.app`) el rediseño integral de la sección de Licencias (`/licencias`), la generación autónoma de PDFs de contratos en sandbox fuera de pantalla, la búsqueda infalible de registros y la microinteracción de copiado de códigos de referencia, autorizado por Sossa.
- Despliegue Vercel:
  - Deployment ID: `dpl_HB65m5a4dxrGECzD89kuK3CZ7Wn9`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-ke31ahhe1-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 31s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/"` -> HTTP/2 200 OK verificado en vivo.
  - Verificada la descarga directa y compilación de contratos.
- Siguiente acción: Tarea concluida satisfactoriamente.

## Rediseño de sección Licencias y corrección del flujo PDF — DONE (2026-09-15)

- Estado: `READY FOR REVIEW`
- Agente activo: `Antigravity`
- Fecha: `2026-09-15`
- Diagnóstico: Al hacer clic en el botón "PDF" en los registros de licencias (`/licencias` / `#tab-history`), la generación no se ejecutaba debido a acoplamientos con `#tab-editor` y dependencias de UI visibles no inicializadas. Asimismo, la sección requería un rediseño de alta estética ejecutiva alineado al estándar Sonic Ledger.
- Archivos modificados: `dashboard_modules/history.js`, `license-library.css`, `tests/history-pdf-flow.test.mjs`, `CURRENT_STATE.md`.
- Cambios realizados:
  - `dashboard_modules/history.js`:
    - Función `findLicenseFromButton(btn)`: busca de forma robusta por `data-index`, `data-id` y `data-ref`.
    - Función `downloadLicensePdfFromHistory(lic, btnEl)`: generación autónoma de PDF compilando el contrato con `window.compileContractData` en un sandbox fuera de pantalla (`#history-pdf-offscreen-sandbox`), aplicando clase `.printing-pdf`, ejecutando `html2pdf()` con configuración A4 estándar y descargando el archivo sin requerir que `#tab-editor` esté visible.
    - Soporte directo de descarga inmediata si la licencia ya cuenta con `lic.contractPdfUrl`.
    - Atributos `data-index`, `data-id` y `data-ref` vinculados a botones de acción (`.btn-row-pdf`, `.btn-row-load`, `.btn-row-delete`).
    - Botón de copiado con un clic `.btn-copy-ref-badge` con icono Lucide y microinteracción visual junto al código de referencia.
    - Botón "Editar" (`.btn-row-load`): carga el contrato en el editor y navega fluidamente a `tab-preview`.
  - `license-library.css`:
    - Badges de nivel de licencia de alto contraste y refinamiento tipográfico (`.basic`, `.premium`, `.premium_plus`, `.unlimited`, `.exclusive`).
    - Badges de estado SRI estilizados (`.autorizado`, `.pendiente`, `.fallido`, `.no-emitida`) y botón `.btn-sri-action`.
    - Spinner de carga y estado deshabilitado en `.btn-row-pdf` (`.animate-spin`).
    - Preservados estrictamente todos los invariantes visuales y semánticos evaluados en `tests/auth-bootstrap.test.mjs`.
- Verificación técnica:
  - Pruebas unitarias y de integración: **248 / 248 tests passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (HTML gzip: 60.56 kB $\le$ 65 kB).
  - Verificación Puppeteer E2E: Captura en escritorio (1280x1200) y móvil (390x844), confirmando generación de PDF autónoma en sandbox y alternancia de pestañas al pulsar "Editar".
- Siguiente acción: Presentar capturas y resultados a Sossa para aprobación y despliegue a producción.

## Despliegue en producción (Vercel) — Google Auth CSP & SRI Ecuador — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (`https://beatss.app`) la corrección del inicio de sesión con Google (CSP permitiendo iframe de Firebase Auth Relay) y la clarificación de que la facturación electrónica SRI aplica exclusivamente para Ecuador, autorizado por Sossa.
- Despliegue Vercel:
  - Deployment ID: `dpl_Ey5c8PpeL7ZHAPe5xE9RtBNX9iMs`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-rf4svjbol-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 35s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `curl -s -I "https://beatss.app/" | grep -i "content-security-policy"` -> Verificado en vivo que `frame-src` incluye `https://*.firebaseapp.com` y `https://licencias-musicales.firebaseapp.com`.
  - Prueba de navegador con Puppeteer en `https://beatss.app`: inserción de iframe `AuthRelay` completada con 0 violaciones de CSP (`violated: null`).
  - Verificada en vivo la presencia de *"Facturación electrónica (Solo Ecuador)"* en la página de inicio.
- Siguiente acción: Esperar confirmación de Sossa tras probar el login con Google.

## Corrección de Login con Google (CSP Firebase Auth Relay) — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Diagnóstico: Al hacer clic en "Continuar con Google", el usuario elegía su cuenta en el popup de Google, pero la ventana quedaba cargando indefinidamente y luego se cerraba arrojando el error *"La ventana de Google se cerró. Vuelve a intentarlo cuando estés listo"* (`auth/popup-closed-by-user`). La causa raíz fue que la cabecera `Content-Security-Policy` restrictiva en `vercel.json` no permitía `frame-src https://*.firebaseapp.com https://licencias-musicales.firebaseapp.com`. Firebase Auth requiere embeber un iframe invisible (`/__/auth/iframe` / `AuthRelay`) en la ventana principal para recibir las credenciales del popup de autenticación; al ser bloqueado por CSP, el relay nunca respondía y el popup fallaba por timeout/cierre.
- Archivos modificados: `vercel.json`, `tests/security-hardening-batch2.test.mjs`, `CURRENT_STATE.md`.
- Cambios realizados:
  - `vercel.json`: Actualizada la directiva `Content-Security-Policy`:
    - `frame-src`: Agregados `https://*.firebaseapp.com`, `https://licencias-musicales.firebaseapp.com` y `https://*.google.com`.
    - `script-src`: Agregados `https://www.gstatic.com` y `https://*.firebaseio.com`.
    - `connect-src`: Agregados `https://*.firebaseapp.com` y `https://licencias-musicales.firebaseapp.com`.
  - `tests/security-hardening-batch2.test.mjs`: Añadidas aserciones para garantizar que `https://*.firebaseapp.com`, `https://licencias-musicales.firebaseapp.com` y `https://www.gstatic.com` permanezcan siempre permitidos en la CSP.
- Verificación técnica:
  - Suite de pruebas completa: **244 / 244 tests passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de compilación: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.56 kB / límite 65 kB).
  - Verificación en navegador Puppeteer: Comprobada la inserción del iframe `AuthRelay` de Firebase con la nueva CSP resultando en 0 violaciones (`violated: null`).
- Siguiente acción: Desplegar a producción en Vercel con autorización de Sossa.

## Clarificación de Facturación SRI Exclusiva para Ecuador — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Especificar en la página de inicio que la emisión de facturación electrónica SRI aplica exclusivamente para Ecuador/operaciones locales, evitando que compradores internacionales esperen documentos tributarios del SRI.
- Archivos modificados: `relay-home.js`, `CURRENT_STATE.md`.
- Cambios realizados:
  - Metric Strip: Actualizado a *"Facturación electrónica (Solo Ecuador)"* con descripción *"Emisión automática de RIDE y XML legal en cada venta (exclusivo para Ecuador)."*
  - Operating Stack (Card 2): Titular *"Factura Electrónica SRI (Solo Ecuador)"*.
  - Bento Card 4: Titular *"Entrega inmediata y facturación SRI (Solo Ecuador)"* con etiqueta *"RIDE y XML (Solo Ecuador)"* y copia aclaratoria en el texto.
  - Comparativa de Plataforma: Detallado *"Emisión automática de facturación electrónica SRI para ventas en Ecuador (RIDE y XML autorizados)."*
- Verificación técnica:
  - Suite de pruebas completa: **244 / 244 tests passing** (`node --test tests/*.test.mjs`).
  - Seguridad estática: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Presupuesto de compilación: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.95 kB / límite 65 kB).
  - Verificación visual con Puppeteer: Se validó que el texto no genere desbordamientos ni colisiones tipográficas en pantallas móviles y de escritorio.
- Siguiente acción: Consultar a Sossa si desea desplegar esta actualización a producción (`https://beatss.app`).

## Despliegue en producción (Vercel) — Rediseño Generalizado de Portada — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (`https://beatss.app`) el nuevo diseño generalizado de la página de inicio (Sonic Ledger Platform), autorizado explícitamente por Sossa.
- Despliegue Vercel:
  - Deployment ID: `dpl_8JFE6iczyAaoHeLeFt2bqUMZ4Guk`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-8emk4thwk-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 35s (Vite build + gzip budget: 60.76 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK con cabeceras de seguridad estrictas (CSP, Permissions-Policy, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff).
  - Verificada la presencia del nuevo titular *"Tu catálogo, tus licencias y tus cobros. En una sola operación."* en la respuesta HTTP en vivo.
  - Comprobación visual E2E con Puppeteer en `https://beatss.app` confirmando la correcta renderización de la vitrina operativa, bento grid y comparativa.
- Siguiente acción: Esperar instrucciones de Sossa para la siguiente iteración.

## Rediseño generalizado de la página de inicio (Sonic Ledger Platform) — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Antigravity`
- Objetivo: Rediseñar la página de inicio de BEATSS con un enfoque generalizado de plataforma musical integral (catálogo, licencias legales, cobros multi-pasarela, facturación SRI y entrega segura), manteniendo la estética Sonic Ledger y resguardando el diseño anterior en `relay-home.v1-backup.js`.
- Archivos modificados/creados: `relay-home.js`, `sonic-ledger.css`, `relay-home.v1-backup.js`, `tests/home-redesign.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. **Copia de seguridad íntegra del diseño anterior**: `relay-home.v1-backup.js` conserva exactamente el marcado y lógica V1 (`OOUUHH`, Dancehall 96 BPM, `.ledger-operation-card`), permitiendo revertir en segundos si se requiere.
  2. **Hero de Plataforma Generalizada**:
     - Eliminada la tarjeta de beat individual estático con barras de sonido.
     - Nuevo titular con balance tipográfico pulido: *"Tu catálogo, tus licencias y tus cobros. En una sola operación."*
     - Showcase modular de arquitectura operativa (*Operating Stack*):
       - Tarjeta 1: *Contrato de Licencia Digital* (Ref BS3-8821, Split 50/50, streaming 500k, ASCAP/BMI).
       - Tarjeta 2: *Cobro Multi-Pasarela & SRI* (Deuna! QR / Tarjeta / PayPal, RIDE electrónico emitido).
       - Tarjeta 3: *Bóveda de Entrega Inmediata* (Token HMAC activo, WAV 24-bit, Stems, PDF firmado).
  3. **Barra de Métricas y Respaldo Operativo**:
     - 4 indicadores: 100% Validez contractual, SRI Directo, Multi-Pasarela y Anti-Filtración HMAC.
  4. **Grid Bento de 4 Pilares de la Plataforma**:
     - 01 / Distribución: Catálogo público y storefront directo con metadatos (BPM, Key, tags).
     - 02 / Licenciamiento: Studio legal de contratos automatizados en PDF con splits.
     - 03 / Liquidación: Cobros sin fronteras con Deuna! QR (Ecuador), tarjetas y PayPal Live.
     - 04 / Cumplimiento: Entrega inmediata de masters y facturación electrónica autorizada por el SRI.
  5. **Comparativa Operativa (Informal vs. BEATSS)**:
     - Contraste visual entre los riesgos de la venta informal por chat/WhatsApp y la certeza de la operación profesional automatizada con BEATSS.
  6. **Banner de Cierre y Footer Refinado**:
     - Call to action de alto contraste con accesos directos al Studio y al Catálogo.
  7. **Preservación total de contratos y rutas**:
     - `goToSossaStore` dirigiendo a `/tienda/sossa`.
     - Acceso al Studio/Auth mediante `withAuth` y `withApp`.
     - Total compatibilidad responsive (Mobile 390px, Tablet 768px, Desktop 1280px+).
- Verificación completada:
  - Suite de pruebas completa: **244 pruebas unitarias pasando al 100%** (`node --test tests/*.test.mjs`), incluyendo la nueva suite `tests/home-redesign.test.mjs`.
  - Chequeo estático de seguridad: `npm run security:check` -> `SECURITY CHECK PASSED`.
  - Compilación y presupuesto de rendimiento: `npm run build` -> `PERFORMANCE BUDGET PASSED` (index gzip: 60.56 kB / presupuesto 65 kB).
  - Inspección visual con capturas reales (Puppeteer): Verificados desktop (1280x900) y mobile (390x844), confirmando legibilidad, balance de contrastes y jerarquía tipográfica sin colisiones.
- Siguiente acción: Presentar el resultado visual a Sossa con las capturas de pantalla y esperar su retroalimentación para ajustar o publicar a producción.

## Publicación de corrección del panel de entrega — DONE (2026-09-14)

- Estado: `DONE`
- Agente activo: `Codex`
- Objetivo: publicar la corrección del panel de entrega que Sossa autorizó
  expresamente.
- Archivos de la funcionalidad: `index.html`, `relay-home.js`, `editor.js`,
  `main.js` y `tests/email-progress-theme.test.mjs`; seguimiento en
  `CURRENT_STATE.md`.
- Despliegue Vercel: `dpl_B32hYkNWEmWBzLa8WBbmJB3FBXsY`, objetivo
  `production`, estado `READY`.
- Verificación completada: Vercel reportó `READY` y la portada de
  `https://beatss.app` carga sin el panel “Enviando entrega”.
- Siguiente acción: ninguna para este cambio; esperar la siguiente instrucción
  de Sossa.

## Despliegue en producción (Vercel) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (Vercel) con mejoras de seguridad acumuladas del Lote 14
- Despliegue Vercel:
  - Deployment ID: `dpl_3r1GBthZ8DGkeDe5vrG6DmDJAxdP`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - URL de despliegue: `https://generador-licencias-4kdcctd3m-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 35s (Vite build + gzip budget: 60.48 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK. Cabeceras de seguridad activas: CSP estricta, `permissions-policy`, HSTS, X-Frame-Options DENY, X-Content-Type-Options nosniff.
  - `OPTIONS https://beatss.app/api/payments/stripe/retry-deliveries` -> HTTP 204 con `Allow: GET, OPTIONS` y `Cache-Control: private, no-store`.
  - `POST https://beatss.app/api/payments/stripe/retry-deliveries` -> HTTP 405 con `Allow: GET, OPTIONS` y `Cache-Control: private, no-store`.
  - `POST https://beatss.app/api/public-store` -> HTTP 405 con `Allow: GET, OPTIONS` y `Cache-Control: private, no-store`.
  - `OPTIONS https://beatss.app/api/confirm-purchase` -> HTTP 204 No Content.
- Siguiente acción: Esperar instrucciones de Sossa para la siguiente iteración de seguridad o nuevas funcionalidades.

## Remediación de seguridad (Lote 14) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 14): Blindaje de Contabilidad Admin (DOM XSS / eliminación de inline onclick), validación de URLs de comprobantes, cabeceras Cache-Control y Allow en dispatchers y endpoints serverless, y resiliencia para SSR/Node
- Archivos modificados/creados: `dashboard_modules/accounting.js`, `api/account.js`, `api/order.js`, `api/stripe.js`, `server-handlers/stripe-retry-deliveries.js`, `server-handlers/public-store.js`, `server-handlers/account-deletion-request.js`, `server-handlers/log-download.js`, `server-handlers/payment-status.js`, `api/convert-referral.js`, `dashboard_modules/copilot.js`, `dashboard_modules/csv_importer.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch14.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Blindaje contra Stored DOM XSS y eliminación de inline onclick en Contabilidad Admin (`dashboard_modules/accounting.js`):
     - Saneamiento con `sanitizeHtml` en todos los campos de pagos pendientes (`pay.userEmail`, `pay.userId`, `pay.aka`, `pay.method`, `pay.reference`).
     - Eliminación de controladores `onclick` inline (`onclick="viewReceiptLarge(...)"`, `onclick="approvePaymentAdmin(...)"`, `onclick="rejectPaymentAdmin(...)"`, `onclick="deactivateVipCodeAdmin(...)"`), reemplazados por `data-action` y escuchadores delegados, fortaleciendo el cumplimiento de la CSP estricta.
     - Saneamiento de `s.lastActiveDate` en tarjetas de analítica.
     - Implementada función `isSafeReceiptUrl` en `viewReceiptLarge`, validando que solo URLs seguras (`https://`, `blob:`, `data:image/...`) puedan cargarse en el visor de comprobantes, bloqueando esquemas no seguros (`javascript:`).
  2. Cabeceras defensivas `Cache-Control: private, no-store` en Dispatchers de API (`api/account.js`, `api/order.js`, `api/stripe.js`):
     - Respuestas HTTP 404 ante rutas no mapeadas emiten `Cache-Control: private, no-store` para evitar almacenamiento en cachés intermedias de CDN.
  3. Consolidación de Preflight OPTIONS y cabeceras en Recuperación Programada (`server-handlers/stripe-retry-deliveries.js`):
     - Manejo de preflight `OPTIONS` retornando `HTTP 204 No Content`.
     - Emisión de `Allow: GET, OPTIONS` ante métodos no permitidos (`HTTP 405`).
     - Cabecera `Cache-Control: private, no-store` en todas las respuestas.
  4. Cabeceras HTTP universales `Allow` y `Cache-Control` en endpoints serverless:
     - `server-handlers/public-store.js`: `Allow: GET, OPTIONS` en 405 y `Cache-Control: private, no-store` en errores y consultas de cupones.
     - `server-handlers/account-deletion-request.js`: `Allow: POST, OPTIONS` en 405.
     - `server-handlers/log-download.js`: `Allow: POST, OPTIONS` en 405 y `Cache-Control: private, no-store`.
     - `server-handlers/payment-status.js`: `Allow: GET, OPTIONS` en 405.
     - `api/convert-referral.js`: `Allow: POST, OPTIONS` en 405 y `Cache-Control: private, no-store`.
  5. Resiliencia de Entorno en Módulos de Frontend (`dashboard_modules/copilot.js` y `dashboard_modules/csv_importer.js`):
     - Elevación de `escapeCopilotHtml` al nivel del módulo y aislamiento con guardas `typeof window !== 'undefined'` y `typeof document !== 'undefined'`.
     - Protección de asignaciones globales y variables en `csv_importer.js` para compatibilidad limpia con Node/SSR.
  6. Suite de pruebas y aserciones de seguridad:
     - Creada suite de pruebas unitarias `tests/security-hardening-batch14.test.mjs` (6 pruebas pasando).
     - Añadidas aserciones estáticas automáticas en `scripts/security-check.mjs`.
- Verificación completada:
  - Suite de pruebas completa: 242 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Consultar a Sossa si desea desplegar el Lote 14 a producción en Vercel o continuar explorando más mejoras de seguridad.

## Remediación de seguridad (Lote 13) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 13): Stored DOM XSS en analítica/gráficos, hardening de contactos, reglas de Firestore y webhook Stripe
- Archivos modificados/creados: `dashboard_modules/charts.js`, `dashboard_modules/contacts.js`, `firestore.rules`, `api/payments/stripe/webhook.js`, `server-handlers/create-pending-order.js`, `api/payments/payphone/confirm.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch13.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Blindaje contra Stored DOM XSS en Analítica y Gráficos (`dashboard_modules/charts.js`):
     - Incorporado helper modular `sanitizeHtml` con fallback local defensivo.
     - Saneamiento estricto de `buyer.name` y `buyer.email` en `renderTopBuyersTable`.
     - Saneamiento de `beat.name` en `renderTopBeatsChart`.
     - Saneamiento de `seg.type` en `renderLicenseDistributionChart`.
  2. Saneamiento defensivo y validación de identificadores en Contactos (`dashboard_modules/contacts.js`):
     - Incorporadas funciones `cleanContactText` y `safeContactDocId`.
     - `autoSaveContact` acota longitudes y filtra caracteres de control y etiquetas HTML en `name`, `id`, `phone`, `city`, `country`.
     - Sanitización de IDs de documento en Firestore (`replace(/[^a-zA-Z0-9@_-]/g, '_')`).
     - Protección de listeners en `typeof document !== 'undefined'` para SSR/Node.
  3. Cierre de brecha en reglas de Firestore (`firestore.rules`):
     - En `/contacts/{contactId}`, eliminación de la regla permisiva `allow read, write:` que eclipsaba la función de validación de esquema `isValidContact()`.
     - Reemplazada por `allow read, delete:` para el propietario/admin, y `allow create, update:` con cumplimiento forzoso de `isValidContact()`.
  4. Cabeceras defensivas en webhook de Stripe (`api/payments/stripe/webhook.js`):
     - Cabecera `Cache-Control: private, no-store`.
     - Cabecera `Allow: POST` al rechazar solicitudes no permitidas (`HTTP 405`).
  5. Consolidación de Preflight OPTIONS en Pedidos Pendientes y PayPhone:
     - En `server-handlers/create-pending-order.js` y `api/payments/payphone/confirm.js`, reordenado el manejador preflight OPTIONS 204 para ejecutarse antes de la verificación estricta de origen del cuerpo POST.
  6. Suite de pruebas y aserciones de seguridad:
     - Nuevas aserciones estáticas automáticas en `scripts/security-check.mjs`.
     - Creada suite de pruebas unitarias `tests/security-hardening-batch13.test.mjs` (5 pruebas pasando).
- Verificación completada:
  - Suite de pruebas completa: 236 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Desplegar a producción Vercel con los Lotes 12 y 13 acumulados autorizados por Sossa.

## Remediación de seguridad (Lote 12) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 12): Inyección de fórmulas CSV (CWE-1236), saneamiento de archivos/DOM XSS, y consolidación universal OPTIONS 204 en los 12 server handlers restantes
- Archivos modificados/creados: `dashboard_modules/history.js`, `dashboard_modules/email_history.js`, `dashboard_modules/csv_importer.js`, `main.js`, `catalog.js`, `server-handlers/activate-pro.js`, `server-handlers/redeem-vip.js`, `server-handlers/cancel-subscription.js`, `server-handlers/account-deletion-request.js`, `server-handlers/stripe-create-checkout-session.js`, `server-handlers/stripe-session-status.js`, `server-handlers/get-order-downloads.js`, `server-handlers/log-download.js`, `server-handlers/payment-status.js`, `api/proxy-audio.js`, `api/convert-referral.js`, `api/payments/config.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch12.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Mitigación contra inyección de fórmulas CSV (CWE-1236):
     - `dashboard_modules/history.js`: función `sanitizeCsvFormula` y `formatCsvCell` en `exportHistoryToCSV`, neutralizando caracteres de ejecución de fórmulas (`=`, `+`, `-`, `@`, `\t`, `\r`, `%`) anteponiendo `'` en todos los campos exportables.
     - `dashboard_modules/email_history.js`: `sanitizeCsvFormula` aplicado en `exportEmailHistoryToCSV` para todas las celdas de registros de correos.
     - `dashboard_modules/csv_importer.js`: saneamiento defensivo (`sanitizeImportText`) en campos leídos de CSVs externos antes de guardarlos en el estado o Firestore.
  2. Blindaje de archivos, DOM XSS y rutas de Cloud Storage:
     - `main.js`: saneamiento estricto de `file.name` con `sanitizeHtml` en la notificación visual de carga de firmas electrónicas `.p12`.
     - `catalog.js`: sanitización de `safeFileName` en `storagePath` para subidas a Firebase Storage, previniendo saltos de directorio (`../`) y caracteres no válidos.
  3. Consolidación total y universal de CORS y preflight OPTIONS 204:
     - Migración completa de los 12 server handlers restantes: `activate-pro`, `redeem-vip`, `cancel-subscription`, `account-deletion-request`, `stripe-create-checkout-session`, `stripe-session-status`, `get-order-downloads`, `log-download`, `payment-status`, `proxy-audio`, `convert-referral` y `payments/config`.
     - Todos los endpoints de la plataforma ahora emiten `Access-Control-Allow-Origin` únicamente ante orígenes confiables (`isTrustedBeatssOrigin`), añaden `Vary: Origin`, y responden inmediatamente con `HTTP 204 No Content` ante preflights `OPTIONS` (0 endpoints quedan con HTTP 200 en OPTIONS).
  4. Suite de pruebas y aserciones de seguridad:
     - Nuevas aserciones estáticas automáticas en `scripts/security-check.mjs`.
     - Creada suite de pruebas unitarias `tests/security-hardening-batch12.test.mjs` (4 pruebas pasando).
- Verificación completada:
  - Suite de pruebas completa: 231 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Presentar resultados a Sossa y consultar si desea publicar el Lote 12 a producción en Vercel o continuar con otra tarea.

## Remediación de seguridad (Lote 11) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediacion de seguridad (Lote 11): DOM XSS sales/copilot, consolidacion CORS sri_download, retry-sri, gdrive, beatstars-migration y publicacion
- Archivos modificados/creados: `dashboard_modules/sales.js`, `dashboard_modules/copilot.js`, `api/_sri_download.js`, `api/payments/retry-sri.js`, `api/gdrive.js`, `api/beatstars-migration.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch11.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Prevención de DOM XSS y attribute breakout en el panel de ventas (`dashboard_modules/sales.js`):
     - Sanitización rigurosa de datos de pedidos y clientes (`pay.reference`, `pay.beatName`, `pay.licenseType`, `pay.buyerName`, `pay.buyerEmail`, `pay.offerMessage`, `dateStr`, `methodLabel`).
     - Codificación de identificadores de pago (`safeId = encodeURIComponent(...)`) en botones de acción inline (`acceptExclusiveOffer`, `rejectBeatSale`, `approveBeatSale`, `viewReceiptImage`, `openSaleDetailsModal`) neutralizando vectores de escape de comillas.
     - Sanitización de auditoría de descargas en `historyList` (`log.ip`, `fileTypeLabel`, `timestampFormatted`).
     - Validación estricta de esquemas de URLs en portadas (`beatArtwork.src`) y comprobantes de pago (`receiptUrl`) con `isSafeArtworkUrl`.
     - Implementación de un fallback seguro y local para `sanitizeHtml`.
  2. Fallback de sanitización en Copilot IA (`dashboard_modules/copilot.js`):
     - Implementada función de escape HTML defensiva `escapeCopilotHtml` para garantizar que la interfaz nunca renderice HTML no saneado si `window.sanitizeHtml` aún no ha sido cargado.
  3. Consolidación total de CORS y preflight OPTIONS 204 en el resto de funciones serverless:
     - `api/_sri_download.js`: Reemplazado el fallback a `beatss.app` por validación estricta de `isTrustedBeatssOrigin(origin)` con cabecera `Vary: Origin`, y respuesta HTTP 204 ante preflights `OPTIONS`.
     - `api/payments/retry-sri.js`: Misma consolidación de CORS estricto y preflights OPTIONS con HTTP 204.
     - `api/gdrive.js`: Unificación de cabeceras CORS en todas sus sub-rutas (`/gdrive-status`, `/gdrive-oauth-client`, `/gdrive-setup`, `/gdrive-upload-session`, `/gdrive-import-email-history`) respondiendo HTTP 204 en preflights OPTIONS y utilizando `resolveAppOrigin` para flujos OAuth.
     - `api/beatstars-migration.js`: Consolidada emisión de `Access-Control-Allow-Origin` únicamente ante orígenes confiables con `Vary: Origin`.
  4. Suite de pruebas y aserciones de seguridad:
     - Nuevas aserciones estáticas en `scripts/security-check.mjs`.
     - Creada suite de pruebas unitarias `tests/security-hardening-batch11.test.mjs` (5 pruebas pasando).
- Verificación completada:
  - Suite de pruebas completa: 227 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Desplegar a producción Vercel los lotes acumulados autorizados por Sossa.

## Remediación de seguridad (Lote 10) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediacion de seguridad (Lote 10): DOM XSS checkout payment methods, rate limiting Deuna QR, y consolidacion CORS confirm-purchase/deuna
- Archivos modificados/creados: `checkout.js`, `api/confirm-purchase.js`, `api/payments/deuna.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch10.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Prevención de inyección DOM XSS y attribute breakout en el checkout (`checkout.js`):
     - Blindaje de `makeCopyBtn` codificando argumentos mediante `encodeURIComponent(...)` para evitar rompimiento de comillas y ejecución arbitraria en atributos inline `onclick`.
     - Sanitización rigurosa de cuentas y datos bancarios de productores (`pichinchaAcc`, `pichName`, `pichType`, `guayaquilAcc`, `guayName`, `guayType`, `deunaPhone`, `deunaName`) con `sanitizeHtml(...)`.
     - Sanitización de opciones desplegables de género y clave musical (`genreSelect`, `keySelect`) al renderizar el catálogo.
     - Validación de esquemas seguros de URLs para portadas en checkout (`getBeatArtwork`, `deunaQrBase64`, `producerLogo`) usando `isSafeArtworkUrl`.
  2. Consolidación de CORS y OPTIONS en confirmación de compras (`api/confirm-purchase.js`):
     - Sustitución de la política CORS permisiva por validación explícita mediante `isTrustedBeatssOrigin(origin)` y cabecera `Vary: Origin`.
     - Respuesta inmediata HTTP 204 ante preflights `OPTIONS`.
  3. Rate limiting, saneamiento de entradas y consolidación CORS en Deuna (`api/payments/deuna.js`):
     - Incorporación de `checkDeunaQrRateLimit` (30 req / 5 min por IP) con cabecera `Retry-After` para mitigar ataques de denegación de servicio y generación masiva no autorizada de QR.
     - Validación estricta del `purchaseId` (`/^[a-zA-Z0-9_-]{1,128}$/`) y monto positivo finito en la generación de códigos QR de pago.
     - Consolidación de CORS usando `isTrustedBeatssOrigin` y respuesta HTTP 204 en preflights `OPTIONS`.
  4. Suite de pruebas y aserciones de seguridad:
     - Nuevas aserciones estáticas en `scripts/security-check.mjs`.
     - Creada suite de pruebas unitarias `tests/security-hardening-batch10.test.mjs` (5 pruebas pasando).
- Verificación completada:
  - Suite de pruebas completa: 222 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Presentar resultados del Lote 10 a Sossa y consultar si desea publicar los lotes acumulados (8, 9 y 10) a producción en Vercel o seguir reforzando la seguridad.

## Remediación de seguridad (Lote 9) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 9): rate limiting public catalog/store/artwork, CORS public-store, sanitización accounting y validación artwork
- Archivos modificados/creados: `server-handlers/public-store.js`, `public-beat-utils.js`, `dashboard_modules/accounting.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch9.test.mjs`, `CURRENT_STATE.md`.
- Qué se implementó:
  1. Rate limiting y CORS en tienda y catálogo público (`server-handlers/public-store.js`):
     - Incorporación de `checkCatalogRateLimit` (60 req / 5 min) para proteger consultas globales (`catalogMode === 'global'`) y búsquedas de productores en Firestore contra denegación de servicio o agotamiento de cuota.
     - Incorporación de `checkArtworkRateLimit` (60 req / 5 min) para solicitudes de portadas en `/api/public-artwork`.
     - Manejo de cabecera `Retry-After` y saneamiento de IP del cliente con `getClientIp(req)`.
     - Consolidación de CORS usando `isTrustedBeatssOrigin` y respuesta inmediata HTTP 204 ante preflights `OPTIONS`.
  2. Validación estricta de URLs de portadas (`public-beat-utils.js`):
     - Nueva función `isSafeArtworkUrl` que valida protocolos seguros (`https://`, `http://`, `data:image/`, o rutas relativas `/`), descartando esquemas peligrosos como `javascript:`, `data:text/html`, `vbscript:`, etc.
     - `resolvePublicBeatArtwork` ahora valida las URLs de portadas y logos antes de usarlas, recurriendo a un SVG seguro si se detecta un valor no seguro.
  3. Sanitización de datos dinámicos contra DOM XSS (`dashboard_modules/accounting.js`):
     - Fallback seguro para `sanitizeHtml` en caso de invocaciones tempranas.
     - Sanitización de `favLabel` y `method` en los desgloses analíticos de ventas y métodos de pago.
     - Sanitización rigurosa de `producerName`, `refCode`, `date`, `beatName`, `buyerName`, `formData.buyerEmail`, `type` en la tabla de transacciones consolidadas.
     - Sanitización de `code.redeemedByEmail` y `code.id` (con `encodeURIComponent` en callbacks) en la tabla de códigos VIP.
     - Sanitización de mensajes de error en los estados de fallo.
  4. Suite de pruebas y aserciones de seguridad:
     - Actualizado `scripts/security-check.mjs` con aserciones estáticas de Lote 9.
     - Creada suite de pruebas unitarias `tests/security-hardening-batch9.test.mjs` (5 pruebas pasando).
- Verificación completada:
  - Suite de pruebas completa: 217 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Consultar con Sossa si desea continuar con más mejoras o proceder a publicar los lotes acumulados (8 y 9) a producción en Vercel.

## Remediación de seguridad (Lote 8) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 8): rate limiting activate-pro, cancel-subscription, convert-referral, payments/config y consolidación CORS
- Archivos en modificación/creación: `server-handlers/activate-pro.js`, `server-handlers/cancel-subscription.js`, `api/convert-referral.js`, `api/payments/config.js`, `server-handlers/create-pending-order.js`, `server-handlers/clearance.js`, `api/payments/payphone/confirm.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch8.test.mjs`, `CURRENT_STATE.md`.
- Verificación completada:
  - Suite de pruebas completa: 212 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente (`SECURITY CHECK PASSED`).
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Consultar con Sossa si desea publicar los cambios del Lote 8 a producción en Vercel.

## Despliegue a Producción Vercel (Lote 7) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (Vercel) con mejoras de seguridad del Lote 7
- Despliegue Vercel:
  - Deployment ID: `dpl_9mAMScHXpCq7FZMuriVhHW1ABata`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - Aliases secundarios: `https://generador-licencias.vercel.app`, `https://generador-licencias-27mzdppwr-masterjuego25-5300s-projects.vercel.app`
  - Build Duration: 36s (Vite build + gzip budget: 60.48 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK. Cabeceras de seguridad activas: CSP estricta, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(self), usb=(), screen-wake-lock=(), accelerometer=(), gyroscope=(), magnetometer=()`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `x-frame-options: DENY`, `x-content-type-options: nosniff`.
  - `POST https://beatss.app/api/beatstars-migration` -> Respuesta controlada con validación y mitigación de abuso.
  - `POST https://beatss.app/api/payments/stripe/create-checkout-session` -> Rate limiting y validación de entrada activos (`HTTP 400 Bad Request`, `access-control-allow-origin: https://beatss.app`).
  - `GET https://beatss.app/api/get-order-downloads?paymentId=fake123` -> Respuesta controlada y rate limiting activos (`HTTP 400 Bad Request`, `cache-control: private, no-store`).
- Siguiente acción: Informar a Sossa que el despliegue del Lote 7 a producción está completo y verificado.

## Remediación de seguridad (Lote 7) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 7): DOM XSS chatbot, rate limiting stripe-checkout, get-order-downloads, SRI, gdrive y migration
- Archivos en modificación/creación: `chatbot.js`, `server-handlers/get-order-downloads.js`, `server-handlers/stripe-create-checkout-session.js`, `api/_sri_download.js`, `api/payments/retry-sri.js`, `api/gdrive.js`, `api/beatstars-migration.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch7.test.mjs`.
- Verificación completada:
  - Suite de pruebas completa: 207 pruebas unitarias pasando al 100% (`node --test tests/*.test.mjs`).
  - Verificación de seguridad estática: `npm run security:check` pasando exitosamente.
  - Auditoría de dependencias: `npm run security:deps` con 0 vulnerabilidades altas o críticas.
  - Compilación y presupuesto de rendimiento: `npm run build` exitoso (index gzip 60.48 kB / presupuesto 65 kB).
- Siguiente acción: Consultar con Sossa si desea publicar los cambios del Lote 7 a producción en Vercel.

## Despliegue a Producción Vercel (Seguridad Lotes 4, 5 y 6) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (Vercel) con mejoras de seguridad de Lotes 4, 5 y 6
- Despliegue Vercel:
  - Deployment ID: `dpl_PdmaxWAwtcyU3SoMEUAE7S6BMYXJ`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - Aliases secundarios: `https://generador-licencias.vercel.app`
  - Build Duration: 35s (Vite build + gzip budget: 60.48 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK. Cabeceras de seguridad activas: CSP estricta, `permissions-policy: camera=(), microphone=(), geolocation=(), payment=(self), usb=(), screen-wake-lock=(), accelerometer=(), gyroscope=(), magnetometer=()`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`, `x-frame-options: DENY`, `x-content-type-options: nosniff`.
  - `GET https://beatss.app/clearance.html` -> HTTP 200 OK.
  - `POST https://beatss.app/api/clearance` -> Origen validado en servidor y respuesta controlada con código HTTP.
  - `GET https://beatss.app/api/proxy-audio?id=fake123` -> HTTP 403 Forbidden (`{"error":"Acceso denegado: este archivo es privado y requiere autenticación o una firma de descarga válida."}`).
- Siguiente acción: Informar a Sossa que la publicación a producción está completa y verificada.

## Remediación de seguridad (Lote 6) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 6): Revocación proxy audio, protección entrega licencias, rate limiting payment-status y clearance alerts
- Archivos modificados/creados: `api/proxy-audio.js`, `server-handlers/secure-license-delivery.js`, `server-handlers/payment-status.js`, `clearance.html`, `scripts/security-check.mjs`, `tests/security-hardening-batch6.test.mjs` (nuevo).
- Qué se implementó:
  1. Revocación activa en proxy de streaming de audio (`api/proxy-audio.js`): Añadida validación de pedidos cancelados, reembolsados, disputados o revocados (`terminalRevokedStatuses` y `payment?.accessRevoked === true`), denegando inmediatamente con HTTP 403 Forbidden descargas o streaming continuo mediante enlaces HMAC firmados previos; saneamiento de IP del cliente y limitación de frecuencia (120 req / 5 min).
  2. Protección de entrega de licencias (`server-handlers/secure-license-delivery.js`): Enmascaramiento de errores internos HTTP 500 para evitar fugas de nombres de buckets o rutas de almacenamiento; incorporación de rate limiting en memoria por IP (10 peticiones por 5 minutos) con cabecera `Retry-After`.
  3. Consolidación de CORS y rate limiting en estado de pagos (`server-handlers/payment-status.js`): Migración a `isTrustedBeatssOrigin` para validar dominios autorizados de forma unificada; limitación de consultas de estado por IP (60 req / 5 min).
  4. Propagación segura de mensajes de validación en `clearance.html`: Los manejadores de error en `verifyLicense` y `submitWhitelist` ahora propagan `err.message` mediante `alertText.textContent` (protegido contra XSS), permitiendo al usuario ver mensajes informativos del backend (por ejemplo, cuota máxima de canales de YouTube alcanzada).
  5. Puerta de seguridad y pruebas automatizadas: Actualizado `scripts/security-check.mjs` con aserciones estáticas de los nuevos controles. Creada suite `tests/security-hardening-batch6.test.mjs` con 5 pruebas unitarias cubriendo todas las funcionalidades.
- Verificación:
  - Pruebas automatizadas: 201/201 pruebas Node (`tests/*.test.mjs`) en verde (100% pass rate).
  - `npm run security:check`: PASSED.
  - `npm run security:deps`: PASSED (0 vulnerabilidades altas/críticas).
  - `npm run build` y presupuesto de rendimiento: PASSED (60.48 kB index gzip, dentro del límite de 65 kB).
- Siguiente acción: Esperar confirmación de Sossa para publicar en producción (Vercel) o continuar con mejoras adicionales.

## Remediación de seguridad (Lote 5) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 5): Enmascaramiento de errores 500, rate limiting en confirm/delete, log-download hardening y CORS SRI
- Archivos modificados/creados: `server-handlers/redeem-vip.js`, `server-handlers/cancel-subscription.js`, `server-handlers/activate-pro.js`, `api/convert-referral.js`, `api/confirm-purchase.js`, `server-handlers/account-deletion-request.js`, `server-handlers/log-download.js`, `api/_sri_download.js`, `api/payments/retry-sri.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch5.test.mjs` (nuevo).
- Qué se implementó:
  1. Enmascaramiento universal de errores internos en respuestas HTTP 500: Eliminada la fuga de `details: error.message` en `server-handlers/redeem-vip.js`, `server-handlers/cancel-subscription.js`, `server-handlers/activate-pro.js` y `api/convert-referral.js`, devolviendo mensajes de error opacos para mitigar divulgación de detalles internos de base de datos o APIs externas.
  2. Rate limiting en endpoints sensibles: Añadido control de frecuencia en memoria por IP en `api/confirm-purchase.js` (15 intentos por 5 minutos) y por IP en `server-handlers/account-deletion-request.js` (5 solicitudes por 10 minutos) con respuestas `429 Too Many Requests` y cabeceras `Retry-After`.
  3. Fortalecimiento de `server-handlers/log-download.js`: Integrada comprobación de estados terminales revocados (`refunded`, `disputed`, `chargeback`, `cancelled`, `cancelado`, `revoked` o `accessRevoked: true`), impidiendo que pedidos anulados registren descargas fantasmas (`403 Forbidden`); saneamiento de IPs extraídas y rate limiting (30 logs por 5 minutos por IP/pago).
  4. Consolidación de CORS estricto en SRI: Sustituido el filtrado de origen manual por el validador unificado `isTrustedBeatssOrigin` en `api/_sri_download.js` y `api/payments/retry-sri.js`.
  5. Puerta de seguridad y pruebas automatizadas: Agregadas aserciones estáticas en `scripts/security-check.mjs` para validar la ausencia de `details: error.message` en todos los archivos serverless y la presencia de rate limit y revocación. Creada suite `tests/security-hardening-batch5.test.mjs` con 5 pruebas unitarias.
- Verificación:
  - Pruebas automatizadas: 196/196 pruebas Node (`tests/*.test.mjs`) en verde (100% pass rate).
  - `npm run security:check`: PASSED.
  - `npm run security:deps`: PASSED (0 vulnerabilidades altas/críticas).
  - `npm run build` y presupuesto de rendimiento: PASSED (60.48 kB index gzip, holgadamente dentro del límite de 65 kB).
- Siguiente acción: Esperar confirmación de Sossa para publicar en producción (Vercel) o continuar con auditoría/mejoras adicionales.

## Remediación de seguridad (Lote 4) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 4): Límite clearance por licencia, revocación descargas, permissions-policy y pre-commit security
- Archivos modificados/creados: `server-handlers/clearance.js`, `server-handlers/get-order-downloads.js`, `vercel.json`, `scripts/security-check.mjs`, `tests/security-hardening-batch4.test.mjs` (nuevo).
- Qué se implementó:
  1. `server-handlers/clearance.js`: Añadida función modular `getMaxChannelsForLicense` con límites estrictos por tipo de licencia (`basic`: 1, `premium`: 2, `premium_plus`: 3, `unlimited`/`unlimited_flp`: 5, `exclusive`: 10, fallback: 1). Validación previa a la inserción en la colección `whitelist`, previniendo bypass por registro masivo de canales no autorizados en YouTube Content ID.
  2. `server-handlers/get-order-downloads.js`: Incorporada comprobación inmediata de revocación ante estados terminales (`refunded`, `disputed`, `chargeback`, `cancelled`, `cancelado`, `revoked`) o flag explícito `accessRevoked: true`, denegando acceso con `403 Forbidden` y bloqueando la generación de URLs firmadas para archivos de compras anuladas o reembolsadas.
  3. `vercel.json`: Endurecida cabecera `Permissions-Policy` con restricción a origen propio `payment=(self)` y bloqueo de APIs de hardware y sensores invasivos (`camera=(), microphone=(), geolocation=(), usb=(), screen-wake-lock=(), accelerometer=(), gyroscope=(), magnetometer=()`).
  4. `scripts/security-check.mjs`: Integradas aserciones estáticas automáticas para validar que `Permissions-Policy` contenga `payment=(self)`, que `get-order-downloads.js` compruebe estados terminales revocados y que `clearance.js` aplique límites de canales.
  5. `tests/security-hardening-batch4.test.mjs`: Nueva suite con 4 pruebas unitarias verificando la asignación de cuotas por licencia, el bloqueo de clearance ante cuota superada, la revocación de descargas en pedidos cancelados/reembolsados y la política de permisos en `vercel.json`.
- Verificación:
  - Pruebas automatizadas: 191/191 pruebas Node (`tests/*.test.mjs`) en verde (100% pass rate).
  - `npm run security:check`: PASSED.
  - `npm run security:deps`: PASSED (0 vulnerabilidades altas/críticas).
  - `npm run build` y presupuesto de rendimiento: PASSED (60.48 kB index gzip, holgadamente dentro del límite de 65 kB).
- Siguiente acción: Esperar confirmación de Sossa para publicar en producción (Vercel) o continuar con auditoría/mejoras adicionales.

## Despliegue a Producción Vercel (Seguridad Lote 3) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (Vercel) con mejoras de seguridad de Lote 3
- Despliegue Vercel:
  - Deployment ID: `dpl_9M1ri3aJaWzXAXhL7KVKUzngvAyU`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - Build Duration: 35s (Vite build + gzip budget: 60.68 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK. CSP activo, `x-frame-options: DENY`, `x-content-type-options: nosniff`.
  - `POST https://beatss.app/api/redeem-vip` -> HTTP 400 Bad Request (validación de parámetros activa en servidor Vercel).
  - `GET https://beatss.app/api/payments/webhook` -> HTTP 405 Method Not Allowed.
- Siguiente acción: Presentar informe de seguridad complementario y esperar siguientes instrucciones de Sossa.

## Remediación de seguridad (Lote 3) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 3): PII descargas, escape editor, rate limit VIP, sanitización checkout y error hiding
- Archivos modificados/creados: `server-handlers/get-order-downloads.js`, `editor.js`, `server-handlers/redeem-vip.js`, `checkout.js`, `api/payments/deuna.js`, `tests/security-hardening-batch3.test.mjs` (nuevo).
- Qué se implementó:
  1. `server-handlers/get-order-downloads.js`: Excluidos datos fiscales y personales sensibles (`invoiceRuc`, `invoiceCompany`, `invoiceAddress`, `invoiceEmail`, `sriAccessKey`, `sriAuthorization`, `clientIp`, `ip`, `userAgent`, `stripeCustomerId`) de la respuesta pública `publicPayment` del portal de descarga, protegiendo la privacidad del comprador si comparte su enlace.
  2. `editor.js`: Incorporada y exportada función `escapeHtml`; aplicados escapes a roles y nombres de firmas (`signatureRoleL`, `signatureNameL`, `signatureIdL`, `signatureAkaL`, `signatureRoleR`, `signatureNameR`, `signatureIdR`, marca del productor) en la compilación y previsualización de contratos.
  3. `server-handlers/redeem-vip.js`: Implementado rate limiting en memoria por IP y UID (6 intentos por ventana de 10 minutos) con respuesta `429 Too Many Requests` y cabecera `Retry-After` para mitigar ataques de fuerza bruta sobre códigos VIP.
  4. `checkout.js`: Fortalecida la función `sanitizeInput` eliminando caracteres de control y corchetes angulares; exportada función `sanitizeHtml` en `window`.
  5. `api/payments/deuna.js`: Ocultados los mensajes de error técnicos internos (`error.message`) en respuestas HTTP 500, devolviendo mensajes genéricos opacos y preservando el registro detallado en `console.error`.
  6. `tests/security-hardening-batch3.test.mjs`: Nueva suite con 5 pruebas unitarias verificando cada uno de estos controles.
- Verificación:
  - Pruebas automatizadas: 187/187 pruebas Node (`tests/*.test.mjs`) en verde.
  - `npm run security:check`: PASSED.
  - `npm run build` y presupuesto de rendimiento: PASSED (60.87 kB gzip index, dentro del límite de 65 kB).
- Siguiente acción: Esperar instrucciones de Sossa (publicar en Vercel o continuar con otra tarea).

## Despliegue a Producción Vercel (Seguridad Lote 1 y 2) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Publicar en producción (Vercel) con mejoras de seguridad de Lote 1 y Lote 2
- Despliegue Vercel:
  - Deployment ID: `dpl_9aqN7MS5pwn6Qf8nnxQUuaS2KhDA`
  - Estado: `READY`
  - Target: `production`
  - Canonical Alias: `https://beatss.app`
  - Build Duration: 36s (Vite build + gzip budget: 60.68 kB index, dentro del límite de 65 kB).
- Verificación Live en Producción:
  - `GET https://beatss.app` -> HTTP 200 OK. Cabecera `Content-Security-Policy` activa con todas las directivas seguras, `x-frame-options: DENY`, `x-content-type-options: nosniff`, `strict-transport-security: max-age=63072000; includeSubDomains; preload`.
  - `GET https://beatss.app/inicio` -> HTTP 200 OK. CSP y cabeceras de seguridad activas.
  - `GET https://beatss.app/api/payments/webhook` -> HTTP 405 Method Not Allowed (protección contra invocación GET confirmada).
  - `GET https://beatss.app/api/public-store?producer=sossa` -> HTTP 200 OK, campo `coupons` completamente privado y ausente del payload.
  - `GET https://beatss.app/api/payments/payphone/confirm%202` -> HTTP 404 Not Found (archivo huérfano duplicado eliminado y no servido).
  - `GET https://beatss.app/api/proxy-audio?id=fake123` -> HTTP 403 Forbidden ("Acceso denegado: este archivo es privado y requiere autenticación o una firma de descarga válida."), sin intentos no autorizados a Google Drive y sin bypass de PDFs.
- Siguiente acción: Esperar instrucciones de Sossa (revisión de estado, tareas de producto o próximos pasos).

## Remediación de seguridad (Lote 2) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 2): Content-Security-Policy en vercel.json y rate limiting en endpoints públicos
- Archivos modificados/creados: `vercel.json`, `server-handlers/stripe-session-status.js`, `server-handlers/public-store.js`, `scripts/security-check.mjs`, `tests/security-hardening-batch2.test.mjs` (nuevo).
- Qué se implementó:
  1. `vercel.json`: Incorporada cabecera `Content-Security-Policy` estricta y funcional que autoriza de forma explícita scripts, estilos, fuentes, imágenes, multimedia, conexiones de red (WebSockets/APIs) y frames requeridos por la plataforma (Firebase, Stripe, PayPal, PayPhone, Google Auth, cdnjs, jsDelivr, EmailJS), con `frame-ancestors 'self'`, `object-src 'none'` y `base-uri 'self'`.
  2. `server-handlers/stripe-session-status.js`: Implementado rate limiting en memoria por IP (30 solicitudes por ventana de 5 minutos) con cabecera `Retry-After` para proteger la API de Stripe y Firestore contra inundación de peticiones.
  3. `server-handlers/public-store.js`: Implementado rate limiting por IP (12 intentos por ventana de 10 minutos) en la validación individual de cupones para evitar ataques de diccionario y enumeración de promociones.
  4. `scripts/security-check.mjs`: Incorporada aserción obligatoria de publicación de `Content-Security-Policy` en `vercel.json`.
  5. `tests/security-hardening-batch2.test.mjs`: Suite con 3 pruebas verificando las directivas de CSP, límites de frecuencia por IP y reinicio de ventanas tras expiración.
- Verificación:
  - Pruebas automatizadas: 182/182 pruebas Node (`tests/*.test.mjs`), incluyendo 3 nuevas en `tests/security-hardening-batch2.test.mjs`.
  - `npm run security:check`: PASSED.
  - `npm run build` y presupuesto de rendimiento: PASSED.
- Siguiente acción: Esperar instrucciones de Sossa (revisión de cambios, deploy o siguiente requerimiento).

## Remediación de seguridad (Lote 1) — 2026-09-14

- Estado: `DONE`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Remediación de seguridad (Lote 1): bypass PDF, cupones públicos, DoS proxy, confirm 2 y XSS catálogo
- Archivos modificados/creados: `api/proxy-audio.js`, `server-handlers/public-store.js`, `catalog.js`, `checkout.js`, `api/convert-referral.js`, `firestore.rules`, `scripts/security-check.mjs`, `.gitignore`, `.vercelignore`, `tests/security-hardening-batch1.test.mjs` (nuevo), `api/payments/payphone/confirm 2.js` (eliminado).
- Qué se implementó:
  1. `api/proxy-audio.js`: Eliminado bypass de PDFs (`!contentType.toLowerCase().includes('pdf')`); se exige autorización previa antes de conectar con Google Drive; limitado escaneo en Firestore a `limit(30)` contra DoS; validación regex estricta en `fileId`.
  2. `api/payments/payphone/confirm 2.js`: Eliminado archivo duplicado huérfano; añadidos patrones `* 2.*`, `* 3.*`, `* copy*.*` a `.gitignore` y `.vercelignore`; aserción de no existencia agregada a `scripts/security-check.mjs`.
  3. `server-handlers/public-store.js` y `checkout.js`: Removido `'coupons'` de `PUBLIC_PRODUCER_FIELDS` para evitar fuga de códigos/descuentos privados en tiendas públicas; añadido endpoint de validación individual de cupón (`?coupon=CODE`); soporte asíncrono en `applyCheckoutCoupon` en `checkout.js`.
  4. `catalog.js`: Saneamiento de `beat.bpm`, `beat.key`, `beat.genre` con `sanitizeHtml` en `renderGlobalBeats` contra stored DOM XSS; sanitización de `safeBeatId` en llamadas de reproducción, compra y restauración.
  5. `firestore.rules` y `api/convert-referral.js`: Reglas de Firestore previenen auto-referidos (`referrerId != auth.uid`) y bloquean actualización de estado por clientes; backend verifica ausencia de auto-referido y exige compra aprobada en `payments` antes de otorgar 30 días Pro.
- Verificación:
  - Pruebas automatizadas: 179/179 pruebas Node (`tests/*.test.mjs`), incluyendo 5 nuevas en `tests/security-hardening-batch1.test.mjs`.
  - `npm run security:check`: PASSED.
  - `npm run build` y presupuesto de rendimiento: PASSED (60.48 kB gzip index, 0 kB overhead).
- Siguiente acción: Proponer y ejecutar Lote 2 de seguridad (cabeceras CSP en `vercel.json` y rate limiting de endpoints públicos) cuando Sossa lo autorice.


## Arquitectura C+B con A opt-in (apagada) — 2026-09-14

- Estado: `DONE` (publicado y apagado por feature flag).
- Agente: `OpenCode`.
- Qué se implementó, dormido por feature flag:
  - Nuevo resolutor puro `server-handlers/producer-settlement.js` con el modo de
    venta por productor: `paymentMode` = `platform_seller` (C: BEATSS cobra,
    factura y liquida) o `producer_gateway` (A: el productor usa su pasarela).
  - Monetización por plan (B): comisión **15% en `inicial`** y **5% en planes
    pagos**; **0%** en modo `producer_gateway`. `computeSettlement` reparte la
    venta en centavos con redondeo.
- Flag: `EXTERNAL_PRODUCERS_ENABLED` (por defecto `false`). Con el flag apagado
  **sólo el productor de plataforma (Sossa) vende**: los externos no exponen
  ningún método de cobro (`salesEnabled:false`) y el catálogo general sólo
  incluye a Sossa. No se usa Stripe Connect.
- Archivos: `server-handlers/producer-settlement.js` (nuevo),
  `server-handlers/public-store.js`, `producerDefaults.js`, `.env.example`,
  `tests/producer-settlement.test.mjs` (nuevo), `tests/public-store.test.mjs`.
- Verificación: 174/174 pruebas Node, `npm run security:check`, build +
  presupuesto de rendimiento.
- Publicado 2026-09-14: `dpl_551SZeKJrjwJrEZneL7NbxBuGRjb`, `READY`,
  `production`, alias `https://beatss.app`. Verificación Live: `/` 200,
  `/inicio` 200, webhook GET 405; tienda de Sossa `salesEnabled:true` (stripe y
  transfer); productores externos (CG Monarco, Mister Micua, Sauce Beats)
  `salesEnabled:false` y sin ningún método de cobro.
- Alcance: no se tocaron Stripe, Firestore ni cobros; no se expusieron secretos;
  el flag sigue apagado, por lo que el comportamiento público no cambió.
- Siguiente acción (sólo cuando Sossa decida activar): confirmar con el contador
  el modelo agregador (IVA/facturación), completar ledger y UI de configuración,
  poner `EXTERNAL_PRODUCERS_ENABLED=1` y hacer E2E sandbox.

## Publicación del árbol local y Google Drive — 2026-09-14

- Estado: `DONE`
- Agente: `OpenCode`.
- Publicado: se desplegó el árbol de trabajo completo (196 cambios locales) a
  producción con Vercel CLI: `dpl_6pEqNt7NQ5HXd1m7w5Avu2kEgw6z`, `READY`,
  `target: production`, alias `https://beatss.app` (verificado en `Aliases`).
- Pre-vuelo: 163/163 pruebas Node, `npm run security:check`, build + presupuesto
  de rendimiento; `.vercelignore` excluye `.env*`, claves, docs, scratch y SRI
  opcional. No se expusieron secretos.
- Verificación Live tras publicar: `/` 200, `/inicio` 200, `/tienda/sossa` 200,
  `/compra/gracias` 200 y webhook GET 405 esperado.
- Google Drive (Paso 103): Sossa confirmó que `sossamusic@gmail.com` ya aparece
  vinculado sin acción adicional y que una carga real a Drive se completó sin
  problemas antes de la venta de `Wow`. Evidencia reportada por el titular; no
  verificable de forma independiente desde esta máquina porque exige sesión
  autenticada. Los endpoints responden protegidos: `/api/gdrive-status` 401,
  `/api/gdrive-oauth-client` 401 y `/api/gdrive-setup` 405 ante GET.
- Siguiente acción exacta: ninguna para esta tarea. Pendientes reales en
  `task.md`.

## Conciliación Stripe Live — DONE (2026-09-14)

- Estado: `DONE`
- Agente: `Codex`
- Objetivo: conciliar, sin modificar claves, la cuenta Stripe Live de
  producción, el destino de webhook entregado y la Checkout Session reportada.
- Resumen: el panel Live de la cuenta `BeatSS` (cuenta cuyo identificador
  termina en `HDv5JT`) muestra una única compra exitosa de USD 30 y el destino
  activo `BeatSS Checkout producción` hacia
  `/api/payments/stripe/webhook`. El evento de esa compra es Live y fue
  recuperado con HTTP 200; la respuesta de la función indicó
  `alreadyFulfilled: true`.
- Verificación de clave/cuenta: sin leer ni cambiar secretos, se consultó desde
  producción la misma Checkout Session expuesta por dicho evento. Respondió
  HTTP 200 con `complete/paid`, una sola entrega y referencia contractual. Por
  tanto, la `STRIPE_SECRET_KEY` actual de Production sí recupera una sesión Live
  de la cuenta `BeatSS`; no hay evidencia de desalineación real de clave/cuenta.
- Límite de comparación: los logs del fallo redaccionan el valor exacto como
  `cs_live_<...>`, por lo que no permiten probar igualdad literal con la sesión
  auditada. El error sólo demuestra que se consultó un identificador que esa
  clave no encontró; pudo ser distinto, truncado o de otra cuenta. No justifica
  rotar la clave.
- Archivos modificados: `CURRENT_STATE.md`.
- Verificaciones: panel Stripe Live, destino de eventos, payload del evento,
  logs de Vercel y consulta controlada de `session-status`; sin deploy, cambio
  de claves, cobro, Firestore ni correo.
- Siguiente acción: conservar `STRIPE_SECRET_KEY`. Si hace falta identificar el
  fallo histórico, comparar un hash del identificador original antes de volver a
  consultarlo; no reemplazar la clave por inferencia de timestamps.

## Cierre de la verificación independiente — BLOCKED resueltos (2026-09-14)

- Estado: `DONE`.
- Agente: `OpenCode`.
- Resuelto por la conciliación de Codex de la sección anterior.
- Las verificaciones independientes de `OpenCode` y `Antigravity` que quedaron
  `BLOCKED` por el fallo de `session-status` quedan **superadas**: la causa fue un
  identificador `cs_live_` distinto, truncado o de otra cuenta, no una
  desalineación de clave/cuenta. La compra Live quedó verificada
  (`complete/paid`, una sola entrega, webhook HTTP 200 con `alreadyFulfilled:
  true`).
- No se rota `STRIPE_SECRET_KEY` y no se modificaron las secciones originales de
  OpenCode/Antigravity; esta nota sólo las marca como resueltas.

## Verificación independiente OpenCode — primera compra Live (2026-09-14)

- Estado: `BLOCKED` (verificación parcial; falta el identificador de la compra).
- Agente: `OpenCode`.
- Verificado de forma independiente desde esta máquina:
  - Endpoints públicos: `/` 200, `/inicio` 200, `/tienda/sossa` 200,
    `/compra/gracias` 200, `/descargas/example-payment` 200 y webhook GET 405
    esperado; `/api/public-store?producer=sossa` con 13 beats.
  - `node --test tests/*.test.mjs`: 163/163 pruebas aprobadas.
  - `npm run security:check`: aprobado. `npm run build`: aprobado con
    presupuesto de rendimiento.
  - Revisión estática: `_fulfill-beat-purchase.js` registra licencia, encola SRI,
    genera `deliveryToken` y notifica la entrega; `stripe-session-status.js`
    expone estado y entregas sin PII.
  - Vercel: el último despliegue de producción figura `Ready`; en Production
    existen los nombres `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (actualizado
    hace 1 h), `CRON_SECRET`, `DOWNLOAD_SIGNING_KEY` y las credenciales EmailJS.
    No se leyeron sus valores.
- No verificable desde aquí (sin credenciales ni MCP de Stripe/Firestore):
  estado real del pago en Stripe, documentos en Firestore, POST del webhook HTTP
  200, correo, PDF almacenado y descarga firmada de esa compra concreta.
- Vía disponible sin credenciales: `GET /api/payments/stripe/session-status?
  sessionId=<cs_live_...>` (público) devuelve `paymentStatus` y las entregas.
  Advertencia: si la orden no estuviera `fulfilled`, ese endpoint dispara el
  fulfillment (mutación); sólo debe usarse con consentimiento.
- Siguiente acción: Sossa proporciona el `sessionId`/URL de retorno de la compra
  (o autoriza la CLI de Stripe) y OpenCode completa la verificación; alternativa,
  que la complete Codex con acceso.

## Estado

- Estado: `BLOCKED`
- Agente activo: `Antigravity`
- Fecha: `2026-09-14`
- Objetivo: Verificar compra Live real (Stripe/entrega)
- Archivos modificados: `CURRENT_STATE.md`
- Resumen: Consulta en solo lectura a `/api/payments/stripe/session-status` con el identificador Live suministrado (`cs_live_...`) devolvió HTTP 500 (`{"error":"No se pudo consultar la sesión de Stripe."}`). La auditoría de logs en Vercel confirmó que la API de Stripe rechazó la llamada con `Stripe session-status error: No such checkout.session: cs_live_...`. La inspección de configuración en Vercel (`vercel env ls`) reveló que `STRIPE_SECRET_KEY` en producción figura creada hace 36 días (época de configuración inicial de sandbox) y no coincide con la cuenta o modo de la sesión Live generada. No se realizaron cobros, escrituras ni mutaciones.
- Verificaciones ejecutadas y resultado:
  - `GET https://beatss.app/api/payments/stripe/session-status?sessionId=cs_live_...`: HTTP 500.
  - Logs Vercel: `Stripe session-status error: No such checkout.session: cs_live_...` confirmando que el SDK de Stripe no encuentra la sesión con la clave configurada.
  - Inspección Vercel env: `STRIPE_SECRET_KEY` creada hace 36 días en Production (a diferencia de `STRIPE_WEBHOOK_SECRET` que fue renovada hace 1 h).
  - Entregas (`deliveries`): 0 recuperadas (la función abortó antes de procesar la respuesta).
  - Portal firmado y descarga MP3: No comprobables al no disponer de `paymentId` y `downloadToken` de la orden.
- Bloqueos: Desalineación entre `STRIPE_SECRET_KEY` en Vercel Production y la cuenta/entorno donde reside la sesión `cs_live_...`.
- Siguiente acción exacta: Sossa verifica y actualiza `STRIPE_SECRET_KEY` en Vercel Production con la clave secreta Live correspondiente a la cuenta Stripe emisora, o alternativamente proporciona la URL de entrega `/descargas/{paymentId}?token=...` enviada por correo al comprador para auditar portal y descarga MP3 directamente.

- Estado: `LIVE_STRIPE_FLOW_VERIFIED`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Compra Stripe Live auditada sin crear otro cargo: el estado autorizado del
  proveedor devolvió `complete/paid`; Firestore registra el pago aprobado, la
  licencia válida, la entrega enviada y el trabajo SRI separado como
  `PENDIENTE_AUTORIZACION`.
- Entrega comprobada: el portal firmado público, la API de pedido, el PDF
  almacenado de cuatro páginas y el MP3 privado respondieron correctamente.
  La licencia básica habilita sólo MP3, por lo que WAV y stems permanecen
  correctamente bloqueados.
- Calidad y seguridad: el PDF revisado no presenta encabezados duplicados,
  recortes ni páginas vacías. Las compras nuevas usan la referencia contractual
  `BS3`; la primera compra Live conserva su referencia histórica de Stripe por
  compatibilidad y el identificador del proveedor se guarda por separado en
  los registros nuevos.
- Verificación local de regresión: 163/163 pruebas completas (incluidos
  pagos, Stripe, entrega, PDF, referencias y descargas); además `npm run
  build` y el presupuesto de rendimiento aprobaron.
- Corrección de webhook: Stripe mostró tres intentos fallidos HTTP 400 por una
  firma no válida. Se sustituyó en Vercel Production el secreto de firma por
  el del destino activo, se publicó `dpl_34hRDd19RYqAY8VDZLUMaQbD6tL3` y se
  reenvió el mismo evento ya pagado. Stripe lo marcó `Entregado / Recuperado`
  con HTTP 200 y Vercel registró el POST con HTTP 200 en el despliegue
  publicado. El estado público confirmó una única entrega, por lo que no se
  duplicaron cobro, licencia ni correo.
- Alcance de la entrega: `deliveryStatus: sent` confirma que EmailJS aceptó el
  envío. La llegada o lectura en la bandeja del comprador no se puede medir
  desde BEATSS y no condiciona la validez de su portal firmado.

- Estado: `DONE`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Tarea terminada localmente: los audios comprados ya no dependen del nombre
  tecnico `proxy-audio.mp3`. El proxy obtiene el titulo y el productor desde la
  compra y la configuracion registradas en Firestore, y responde con nombres
  como `Wow - Sossa - MP3.mp3`; WAV y stems reciben su formato correspondiente.
  Se conserva reproduccion movil, soporte `Range`, firma, autorizacion y un
  nombre ASCII compatible junto al nombre UTF-8 con tildes. Las firmas antiguas
  no pueden manipular el tipo mediante la URL.
- Archivos: `api/proxy-audio.js`,
  `server-handlers/audio-download-filename.js`,
  `tests/audio-download-filename.test.mjs`,
  `tests/secure-license-delivery-regression.test.mjs`, `CURRENT_STATE.md` y
  `task.md`.
- Verificacion: 163/163 pruebas Node, security check, build, presupuesto de
  rendimiento, sintaxis y `git diff --check` aprobados.
- Publicacion completada: Vercel creo
  `dpl_8oMoGuaBHPMMiKZWvKdWPTQRge95`, estado `READY`, destino produccion y
  alias `https://beatss.app`. Inicio y tienda respondieron HTTP 200. La funcion
  Live expone `Content-Disposition` y, sin archivo, rechaza correctamente con
  HTTP 400; no se ejecuto una descarga firmada artificial para no registrar
  actividad a nombre del comprador. El correo existente aplicara el nombre
  comercial cuando el cliente vuelva a descargar, sin necesidad de reenviarlo.

- Estado: `REDELIVERY_COMPLETED`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Publicacion verificada: Vercel creo `dpl_46m9nFPDQQSNUu5KFURBJ9q7kac2`,
  estado `READY`, destino produccion y alias `https://beatss.app`.
- Reenvio completado: se registro la licencia Basica de `Wow` para Jefferson
  Andres Ambuludi Ordonez con referencia
  `BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN` y se envio el nuevo correo a
  `ordonezjeffer798@gmail.com`. Firestore conserva `deliveryStatus: sent` y
  `deliveryEmailSentAt: 2026-09-14T01:40:10.687Z`.
- Verificacion Live: portal publico HTTP 200, API firmada HTTP 200, contrato
  valido y MP3 disponible con HTTP 206 y `audio/mpeg`. No se expuso ninguna
  firma ni URL privada en el registro operativo.

- Estado: `READY_FOR_HANDOFF`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Tarea terminada localmente: los correos de entrega ya no exponen enlaces
  directos a MP3, WAV, stems ni al PDF almacenado. El Studio, las aprobaciones,
  DocuSign y la entrega automatizada convergen en `/api/license-delivery`, que
  autentica la compra o al productor, registra la entrega, conserva el PDF y
  envia exclusivamente el portal firmado `/descargas/{paymentId}?token=...`.
- Incidente verificado: los dos correos enviados a Jefferson contenian el mismo
  enlace MP3 sin firma; el correo manual de correccion si incluia el PDF nuevo,
  pero su boton de audio no era valido. El proxy lo rechazo correctamente. El
  beat `Wow` conserva MP3, WAV y stems privados registrados para una nueva
  entrega segura.
- Verificacion local: 159/159 pruebas Node, security check, build, presupuesto
  de rendimiento, sintaxis y `git diff --check` aprobados.
- Limite operativo: no desplegar, modificar pagos/Firestore ni reenviar correo
  sin autorizacion expresa posterior.

- Estado: `READY_FOR_HANDOFF`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Tarea terminada localmente: se corrigieron el ancho imprimible, el encabezado
  duplicado, los cortes de pagina, la localizacion y la distincion entre pago
  electronico y pago verificado manualmente en todos los generadores PDF.
- Licencia corregida: se regenero `Wow` con la referencia
  `BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN`; sus cinco hojas carta fueron
  revisadas visualmente y no presentan contenido recortado, clausulas omitidas,
  paginas vacias ni elementos partidos. La copia canonica fue reemplazada en
  `/Users/sossa/Documents/LICENCIAS/` y el archivo anterior se conservo alli
  como `RESPALDO FORMATO ANTERIOR`.
- Verificacion: 155/155 pruebas Node, security check, build, presupuesto de
  rendimiento, sintaxis JS/Python y `git diff --check` aprobados.
- Limite operativo: no publicar, modificar pagos/Firestore ni enviar el borrador
  de Gmail sin una autorizacion expresa posterior.

- Estado: `REDELIVERY_COMPLETED`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Publicación verificada: Vercel creó `dpl_9kSMUoxtWgk9XnsyuS1Hhc4BDfbL`, estado `READY`, con alias `https://beatss.app`. El build y las pruebas de referencias pasaron; el generador Live usa el formato `BS3` reforzado y elimina el fallo que podía producir segmentos `undefined`.
- Entrega identificada: se localizó inequívocamente el último envío manual del beat `Wow`, licencia Básica, realizado el 2026-09-13. El PDF anterior sólo mostraba `REF`, no tiene un registro de licencia válido ni un objeto de contrato recuperable y queda únicamente como rastro de auditoría.
- Corrección entregada: se generó y revisó visualmente el PDF corregido de cinco páginas con la referencia segura `BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN`. Tras la confirmación expresa de Sossa, Gmail mostró `Mensaje enviado` para el reenvío que contiene explicación, enlace MP3 y PDF adjunto.
- Siguiente acción: ninguna para esta corrección. Conservar el PDF anterior sólo como rastro de auditoría no válido y usar la nueva referencia para cualquier verificación futura.

- Estado: `LIVE_PENDING_PURCHASE_RETURN_VERIFICATION`
- Agente activo: `Codex`
- Fecha: `2026-09-13`
- Subtarea publicada 2026-09-13: Vercel creó
  `dpl_2BsmXnqah7kaTLmkE3ao2DZ3M9Dd`, estado `READY`, destino producción y
  alias `https://beatss.app`. La publicación contiene el retorno público de
  Stripe y las rutas de descarga firmada. Verificado Live sin iniciar un
  checkout: `/compra/gracias`, `/descargas/example-payment` y `/tienda/sossa`
  responden HTTP 200; la página de compra muestra la recuperación pública de
  confirmación y no el login. No se consultó la sesión ni el pago real, no se
  creó un cobro, ni se modificó Stripe, Firestore, SRI o correo. Siguiente
  acción: Sossa abre la URL de retorno de Stripe de la compra ya hecha (o el
  correo de entrega) y Codex verifica el estado de pago, webhook, Firestore,
  PDF, correo y descarga real por separado.
- Subtarea terminada localmente 2026-09-13: el retorno de Stripe ya no carga
  el Studio ni el acceso de BEATSS. Los Checkout nuevos vuelven a
  `/compra/stripe`, que muestra una página pública de agradecimiento, consulta
  el estado de pago de Stripe y espera hasta confirmar la compra antes de
  mostrar un portal firmado por beat. Las descargas, incluidos los enlaces
  enviados por correo y los enlaces históricos de raíz, usan ahora
  `/descargas/{paymentId}?token=...`; esa ruta abre el portal público sin
  pedir inicio de sesión. El estado público de la sesión dejó de devolver PII
  de facturación y contacto. Se actualizó el servidor local y se renovó la
  versión del bootstrap para evitar una caché antigua. Verificado: 143 de 143
  pruebas, build, presupuesto de rendimiento, security check y
  `git diff --check`; además se validó visualmente con una respuesta local
  simulada de Stripe la pantalla “Gracias por tu compra” y su enlace de
  entrega pública. No se desplegó, no se consultó el pago real, no se modificó
  Stripe, Firestore, SRI ni se creó otro cobro. Siguiente acción: Sossa
  autoriza publicar y, después, se prueba el retorno de la compra Live ya
  realizada o una compra controlada nueva.
- Subtarea en curso 2026-09-13: corregir el retorno posterior a un Checkout
  Live confirmado. La URL de éxito aún vuelve a la raíz con
  `stripe_session_id`; el bootstrap carga el Studio y puede presentar el
  inicio de sesión antes de la entrega. Se implementará una ruta pública de
  agradecimiento que consulta el estado de Stripe, espera el webhook/fulfillment
  sin exponer archivos prematuramente y enlaza al portal de descargas firmado,
  también público. No se desplegará ni se crearán cobros durante el cambio local.
- Subtarea publicada 2026-09-13: Sossa autorizó publicar la versión que
  retira temporalmente el marketplace general. Vercel creó
  `dpl_BjcKkbvJievgWg1Cm3kZMFKaAdCc`, quedó `READY` en producción y asignó
  `https://beatss.app`. La comprobación Live devolvió `/catalogo` HTTP 308
  hacia `/tienda/sossa`, tienda HTTP 200 y el endpoint público de Sossa
  respondió 13 beats con Stripe y transferencia habilitados. No se inició
  checkout, no se leyó ningún secreto y no hubo cobro, correo ni escritura
  Firestore por esta verificación. Siguiente acción: Sossa completa una
  compra Stripe Live controlada con sus propios datos y deja abierta la
  confirmación; Codex verificará pago, webhook, Firestore, SRI, correo, PDF y
  descargas.
- Subtarea terminada localmente 2026-09-13: el marketplace general queda
  desactivado sin borrar su código. Todos los CTA públicos de catálogo, el
  acceso interno, el atajo PWA y las recuperaciones de compra llevan ahora a
  `/tienda/sossa`; visitas antiguas a `/catalogo` reciben una redirección
  permanente de Vercel antes de cargar la aplicación y el cliente cubre
  marcadores desactualizados. `/catalogo` salió del sitemap y el build ya no
  genera el bundle del router público general. Archivos: `app-bootstrap.js`,
  `public-router.js`, `relay-home.js`, `main.js`, `public-store-router.js`,
  `public-storefront.js`, `checkout.js`, `beatss-ui.js`, `index.html`,
  `vercel.json`, `public/manifest.json`, `public/sitemap.xml` y pruebas.
  Verificado: 143/143 pruebas Node, build y presupuesto de rendimiento,
  seguridad (sólo la advertencia local esperada por `DOWNLOAD_SIGNING_KEY`),
  configuración del redirect y `git diff --check`. No se desplegó, no se
  modificó Firestore, Stripe ni se crearon cobros. El marketplace queda
  disponible en el código para reactivarlo cuando BEATSS admita productores
  múltiples.
- Subtarea terminada localmente 2026-09-13: las licencias comerciales nuevas
  incorporan la reserva que mantiene vigentes las licencias no exclusivas
  emitidas antes de una exclusiva y permite ampliarlas, únicamente por su
  titular y hasta Ilimitada. La aceptación de una oferta exclusiva ahora
  registra el corte (`exclusiveEffectiveAt`), cierra el beat a ventas públicas
  y conserva el derecho previo. El portal de la licencia anterior muestra las
  ampliaciones válidas y Stripe recalcula en servidor identidad, beat, fecha,
  tier y diferencia de precio; PayPal, PayPhone y métodos manuales no pueden
  eludir esa ruta. Se retiró el cambio directo de licencia desde el navegador.
  Archivos: `config.js`, `editor.js`, `checkout.js`,
  `server-handlers/license-upgrade-policy.js`,
  `server-handlers/stripe-create-checkout-session.js`,
  `server-handlers/get-order-downloads.js`, `api/_fulfill-beat-purchase.js`,
  `api/confirm-purchase.js`, `dashboard_modules/sales.js` y
  `tests/license-upgrade-policy.test.mjs`. Verificado: 143/143 pruebas Node,
  build, presupuesto de rendimiento, seguridad y `git diff --check`. No se
  desplegó ni se modificaron Firestore, Stripe o cobros reales. La siguiente
  verificación financiera sigue siendo una compra Stripe Live controlada.
- Bloqueo verificado 2026-09-13: tras tres comprobaciones Live consecutivas,
  Stripe continúa sin pagos y el destino webhook conserva 0 entregas. No se
  crea un cobro de prueba ni se usa una tarjeta sin una acción explícita del
  titular. Para reanudar, Sossa debe completar una compra Live controlada y
  conservar abierta la confirmación; Codex verificará inmediatamente proveedor,
  webhook, Firestore, SRI, correo, PDF y descargas.
- Auditoría de entrega corregida y publicada 2026-09-13: se detectó que el
  portal de descargas sólo resolvía MP3 desde el documento público, aunque los
  masters vigentes viven en `beats/{beat}/private/files`. El portal ahora usa
  la misma precedencia que fulfillment (`private/files.mp3` primero y sólo
  conserva el campo público como compatibilidad histórica). También conserva
  en Storage el mismo PDF oficial que el comprador descarga cuando vuelve al
  portal desde el correo, en lugar de depender del navegador que regresó de
  Stripe. Archivos: `server-handlers/get-order-downloads.js`, `checkout.js`,
  `tests/order-download-delivery.test.mjs`, `tests/pdf-delivery.test.mjs`.
  Verificado: 86/86 pruebas relevantes, `security:check`, build, presupuesto
  de rendimiento y `git diff --check`; el conjunto general dio 140 pruebas
  aplicables correctas y 8 de emulador no iniciadas porque este Mac no tiene
  Java (no se modificaron reglas Firebase). Vercel publicó
  `dpl_F79242psWhxCPKEiui3trF5W1uYm`, `READY` y alias `https://beatss.app`.
  La versión Live contiene `deliveryToken` y el guardado de PDF; Inicio HTTP
  200, catálogo Sossa 13 beats con Stripe habilitado y sin Haze, webhook GET
  405, cron sin secreto 401, creación Stripe incompleta 400 y PDF con token
  falso 401. Stripe Live confirma `charges_enabled` y `payouts_enabled`; el
  destino activo escucha `checkout.session.completed` y
  `checkout.session.async_payment_succeeded`, pero sigue en 0 entregas y no
  hay cobros Live. Siguiente acción: una compra Live controlada por Sossa y
  comprobar en ese orden el pago, HTTP 200 de webhook, Firestore
  (`stripe_checkouts`, pago, licencia y cola SRI), correo, PDF y descargas.
- Subtarea publicada 2026-09-13: el botón de eliminar del Studio ahora
  hace una baja reversible. Escribe `published: false` en el documento del
  beat, conserva la subcolección privada y sus archivos, lo excluye del
  catálogo activo, de nuevos contratos y de la venta pública, y lo muestra en
  la sección **Dados de baja** con restauración. Al restaurarlo se publica de
  nuevo. Archivos modificados: `catalog.js`, `index.html`, `beat-catalog.css`
  y pruebas. Verificado localmente con 45 pruebas específicas, `security:check`,
  build, presupuesto de rendimiento y `git diff --check`. Publicado en
  `https://beatss.app` mediante el despliegue de producción
  `generador-licencias-hbl4f34jm-masterjuego25-5300s.vercel.app`; el bundle
  Live contiene la sección y el endpoint público sigue devolviendo 13 beats
  sin Haze. No se modificó Firestore durante esta implementación.
- Catálogo Live 2026-09-13: Haze (`beat_haze`) quedó retirado de la venta al
  añadir `published: false` a su documento en Firestore. Se conservaron su
  metadata, archivos privados y subcolección `private`; no se borró nada. La
  lectura posterior de `https://beatss.app/api/public-store?producer=sossa`
  devolvió 13 beats y ningún Haze. La misma condición `published !== false` se
  aplica en el endpoint Stripe, así que tampoco puede iniciar ese checkout.
  No hubo despliegue ni cobro.
- Subtarea previa detectada el 2026-09-13: al revisar la tienda pública de
  Sossa se confirmó que muestra Magic, Now y OOUUHH, pero las tarjetas pueden
  rotular el precio básico como "Negociable" cuando el documento usa
  `basicPrice`. Antes de la compra Live, Codex endurecerá el filtro público y
  el endpoint Stripe para excluir beats vendidos/no publicados/sin preview,
  y alineará el precio visible. Archivos previstos: `checkout.js`,
  `server-handlers/public-store.js`,
  `server-handlers/stripe-create-checkout-session.js` y pruebas específicas.
- Corrección local terminada, aún sin publicar: `basicPrice` se muestra como
  USD en la tarjeta, y una misma regla canónica excluye beats vendidos, no
  publicados o sin preview tanto del escaparate como de Stripe. Se añadieron
  `server-handlers/beat-availability.js` y regresiones. Verificado: 61/61
  pruebas específicas, `security:check`, build, presupuesto de rendimiento y
  `git diff --check` correctos. Falta autorización explícita para publicar el
  árbol local actual en Vercel y luego repetir la comprobación visual Live.
- Subtarea activa 2026-09-13: al autenticarse como Sossa se verificó que el
  Studio contiene 14 beats (todos con archivo MP3 de entrega), mientras que la
  tienda Live muestra Magic, Now y OOUUHH. Los otros 11 guardan el MP3 en la
  subcolección privada de archivos; no se deben publicar como preview porque
  ese recurso se entrega tras la compra. Codex separará el campo de preview
  público del MP3 de entrega, conservará la defensa de disponibilidad y
  preparará previews etiquetados de los archivos locales identificados. Bubble
  no se encontró como master/previsualización local y no se publicará sin una
  fuente verificable. Archivos previstos: `catalog.js`, `index.html`,
  `server-handlers/public-store.js`, `server-handlers/beat-availability.js`,
  pruebas y esta bitácora. Verificación prevista: pruebas, build, revisión
  visual y lectura del endpoint Live. Cualquier subida de previews a Storage y
  publicación en Vercel requiere confirmación específica del titular en el
  momento de ejecutarla.
- Subtarea cerrada 2026-09-13: se comprobó que los 14 beats ya tienen un
  `preview` dedicado distinto de los archivos de entrega; Bubble también lo
  tenía registrado. Se publicó `dpl_3TnaLKiUoZZuhUPAxRsrDm8h8puJ` en
  `https://beatss.app`: el catálogo proyecta sólo ese preview, el proxy
  permite reproducir exclusivamente previews explícitos y jamás MP3/WAV/stems
  privados, y Stripe aplica la misma disponibilidad. Verificación Live:
  endpoint con 14 beats, `Range` HTTP 206 para los 14 previews, tienda visual
  con 14 tarjetas a USD 30 y selector de licencias Básica 30, Premium 60,
  Premium Plus 100, Ilimitada 200 y Exclusiva negociable desde 250. No se
  subieron archivos nuevos; previews de entrega y fuentes locales permanecen
  privados. La única tarea de pagos pendiente es una compra Live real
  autorizada por el titular y su entrega completa.
- Subtarea activa 2026-09-13: se detectó una causa técnica concreta de
  saturación en el reproductor público. Un único preview estéreo se enviaba a
  la vez por la señal original y por tres filtros de frecuencia, y las cuatro
  rutas se sumaban a ganancia unitaria; además podían añadirse rutas de
  reverb/delay al mismo destino. Se sustituirá por una ruta única y fiel del
  preview, con margen de seguridad y limitación de picos; no se presentará ese
  archivo estéreo como si fueran stems. La verificación incluirá regresiones,
  build y reproducción visual antes de solicitar autorización de publicación.
- Corrección local lista para publicación 2026-09-13: el reproductor usa una
  sola ruta `preview → margen de salida → limitador → altavoces`, inicia el
  volumen en 70 % y no reabre fuentes Web Audio al reanudar. Se retiró el
  panel que rotulaba incorrectamente un master estéreo como stems y que podía
  añadir ganancia/efectos. Verificado: 55 pruebas específicas, auditoría de
  seguridad, build, presupuesto de rendimiento y `git diff --check` correctos.
  La tienda local no cargó catálogo por no tener configuración local de datos;
  no afecta a la validación estática del reproductor. Falta autorización
  explícita para publicar el árbol local en Vercel y comprobar el preview Live.
- Subtarea activa 2026-09-13 (UI del reproductor): Sossa confirmó en captura
  que el bar Live todavía se ve oscuro y pidió retirar todo rastro del
  mezclador. Se reemplazará el markup heredado por una barra clara y compacta,
  aislada del CSS oscuro global mediante una hoja cargada sólo en la tienda.
  Se preservarán los IDs y eventos de título, transporte, progreso, volumen y
  compra. Archivos previstos: `index.html`, `public-store-router.js`, una
  hoja de estilos pública dedicada, pruebas de regresión y esta bitácora.
  Verificación prevista: build, seguridad, revisión de estilos y reproducción
  visual antes de pedir autorización de publicación.
- Corrección de UI publicada y verificada 2026-09-13: se retiraron del markup y del
  JavaScript el botón, panel, faders y efectos del mezclador. El reproductor
  conserva sus IDs de reproducción/compra, pero ahora es una barra clara,
  centrada y aislada en `store-player.css`, con progreso accesible por teclado
  y una versión móvil compacta. Se verificó visualmente en una composición
  local de la tienda a escritorio y 390 px; no se observaron fondos oscuros ni
  controles del mezclador. Verificado también: 55 pruebas específicas,
  `security:check`, build, presupuesto de rendimiento y `git diff --check`.
  Archivos: `index.html`, `player.js`, `public-store-router.js`,
  `store-player.css`, `tests/player-audio-safety.test.mjs` y esta bitácora.
  Vercel publicó `dpl_GCBAz1CUNMfHvpoBjQanQHFvwiiU`, estado `READY`, y asignó
  `https://beatss.app`. Verificación Live: la tienda expone 14 beats; Bubble
  reprodujo de 0:00 a 0:09 de 0:30 mediante la nueva barra clara, sin panel de
  mezclador, sin crear checkout ni cobrar.
- Subtarea local 2026-09-13 (aceptación obligatoria): antes de avanzar de la
  selección de licencia a los datos del comprador, los CTA de compra y carrito
  quedan deshabilitados hasta que se marque el click-wrap de Términos de
  Servicio y licencia seleccionada. Cambiar licencia, modificar carrito u
  oferta exclusiva invalida la aceptación y exige una nueva. La aceptación
  guarda versión `2026-08-14`, licencia(s) canónicas y fecha validada; se
  comprueba en los flujos Stripe, pedido pendiente y PayPhone, y se conserva
  durante la entrega de la licencia. Archivos: `checkout.js`, `index.html`,
  `public-store.css`, `server-handlers/legal-acceptance.js`, los handlers de
  pedido/Stripe/PayPhone, `api/_fulfill-beat-purchase.js` y regresiones.
  Verificado localmente: 68/68 pruebas, `security:check`, build, presupuesto
  de rendimiento y `git diff --check` correctos. Falta autorización explícita
  para publicar y comprobar el recorrido Live sin iniciar un cobro.
- Investigación de catálogo pendiente: la tienda Live confirmó sólo Magic,
  Now y OOUUHH. El endpoint público no descarta beats adicionales en el
  navegador; su condición de venta exige que el documento tenga preview MP3,
  esté publicado y no vendido. Falta comparar esos tres con la biblioteca
  autenticada de Sossa para enumerar los beats que carecen de ese dato o están
  marcados de otro modo. La automatización de Chrome quedó detenida porque hay
  una interfaz de extensión abierta sobre BeatSS; cerrar o descartar esa
  interfaz permitirá terminar la comparación sin cambiar datos.
- La entrega Stripe es resistente al cierre del navegador, con notificación
  desde webhook, idempotencia y recuperación diaria.
- El webhook registra pago/licencia/SRI y envía al comprador un enlace privado
  al portal sin depender del retorno de Stripe. Si el comprador vuelve, BeatSS
  genera y almacena el PDF; el correo previo no se duplica.
- Los carritos con varios beats generan un solo correo con todos los portales.
- Los fallos de EmailJS dejan un estado reintentable; Stripe reintenta el evento
  y un cron diario revisa checkouts `open` o `delivery_pending` sin recobrar.
- `CRON_SECRET` quedó creado como secreto de Producción en Vercel y nunca se
  mostró ni se guardó en el repositorio.
- La cuenta principal usa como respaldo los identificadores públicos de
  EmailJS configurados en Vercel; la entrega ya no depende de que esos campos
  estén presentes en el documento privado del productor.
- Verificación local: 126/126 pruebas Node, seguridad, build, presupuesto de
  rendimiento y `git diff --check` correctos.
- Producción: `dpl_616gKHYZajzdgaNfeYNGf5v2xLAZ`, estado `READY`, alias
  `https://beatss.app`; tienda HTTP 200, webhook GET HTTP 405 y recuperación sin
  autorización HTTP 401.
- El cron aparece registrado en Vercel con horario diario `0 10 * * *`.
- Stripe muestra 0 pagos y el webhook 0 entregas. La sesión Live abierta para
  la prueba continúa `open/unpaid`; no se envió correo ni se ejecutó un cobro.
- Próxima acción: completar una compra Live controlada y verificar evento HTTP
  200, pago/licencia, correo, portal, archivos y PDF antes de cerrar la tarea.
- El respaldo local con configuración sensible está ignorado por Git y excluido
  por `.vercelignore`; no fue incluido en el paquete publicado.

## Verificación complementaria OpenCode — wizard del Studio (2026-09-13)

- Agente: OpenCode. Alcance: verificación del flujo Tipo → Datos → Entrega del
  editor de contrato tras la corrección de paneles simultáneos.
- Método: Vite local en `127.0.0.1:5177` y Chrome 151 headless vía CDP,
  conduciendo `window.nextStep` (que expone `showEditorStep()` de `main.js`)
  sobre el DOM real, y leyendo `getComputedStyle`/`getBoundingClientRect` y los
  atributos `hidden`/`inert`/`aria-hidden`/`data-wizard-active`.
- Resultado en escritorio (1440×1000) y móvil (390×844), en 1 → 2 → 3 y
  3 → 2 → 1: en cada paso hay exactamente un panel visible (`visibleCount: 1`);
  los inactivos quedan `display:none` con `hidden`/`inert`/`aria-hidden=true` y
  rect 0×0, sin contenido montado debajo. El scroll se reinicia (198 → 0).
- Verificación de código: `npm run build` correcto; `git diff --check` correcto
  en `index.html`, `main.js` y las hojas del flujo. No se modificó ningún
  archivo de código en esta comprobación.
- Límite de evidencia: las capturas PNG quedaron como artefacto local, pero el
  modelo que verificó no puede abrir imágenes; la conclusión se apoya en la
  inspección DOM/CSS determinista. Queda una revisión ocular humana opcional.
- Nota de coordinación: `COLLABORATION_STATE.md` es histórico; esta es la
  referencia operativa. No se alteraron el estado `IN_PROGRESS` de Codex, sus
  subtareas ni los párrafos de la auditoría Stripe.

## Antecedente cerrado: selector de pagos Stripe

- Se completó la publicación y verificación en producción del selector
  de pagos rediseñado con el wordmark oficial Blurple de Stripe.
- Sossa autorizó explícitamente publicar todo el estado actual del árbol de
  trabajo después de ser informado de que incluye otros cambios locales.
- Bloqueo de alcance: Vercel empaqueta el árbol de trabajo completo y existen
  cambios locales adicionales todavía marcados como pendientes de publicación,
  entre ellos la protección de Configuración y el rediseño de Ventas. Se
  requiere autorización explícita para publicar todo ese estado conjunto.
- El SVG de `public/banks/stripe.svg` coincide por SHA-256 con el recurso del
  kit oficial descargado desde Stripe; no se modificó su forma ni color.
- Verificación: 29/29 pruebas relacionadas, build, presupuesto de rendimiento,
  seguridad y captura visual correctos; no se crearon pedidos ni cobros.
- Sossa autorizó publicar todo el árbol actual. Vercel creó
  `dpl_8zHz8okwDmb1hCBzbsUeydzVQ2cB`, lo marcó `READY` y asignó
  `https://beatss.app` a esa versión.
- Verificación de producción: `/tienda/sossa` respondió HTTP 200, el selector
  mostró Stripe y transferencia, y el SHA-256 del SVG servido coincide con el
  recurso oficial local. No se creó ninguna orden ni se inició un cobro.
- Se sustituyeron las tarjetas estrechas y las etiquetas flotantes por opciones
  horizontales con icono, nombre, descripción y estado seleccionado visible.
- Stripe y transferencia conservan sus IDs, disponibilidad dinámica y lógica de
  pago; los logos de Pichincha y Guayaquil tienen ahora un contenedor legible.
- Verificación: 29/29 pruebas relacionadas, build, presupuesto de rendimiento,
  seguridad y `git diff --check` correctos; revisión visual a 1280 px y 390 px
  sin desbordamiento, pedidos ni cobros.
- Cualquier publicación futura del árbol local completo requiere una nueva
  autorización explícita por sus cambios heredados todavía presentes.

## Activación Stripe Live cerrada — 2026-09-12

- Stripe mostró pagos y retiros activos para la cuenta BeatSS.
- Se creó el destino activo `BeatSS Checkout producción` con URL
  `https://beatss.app/api/payments/stripe/webhook` y escucha limitada a
  `checkout.session.completed` y `checkout.session.async_payment_succeeded`.
- Sossa introdujo directamente en Vercel Production los valores de
  `STRIPE_WEBHOOK_SECRET` y `STRIPE_SECRET_KEY`; Codex no leyó, copió ni
  registró esos secretos.
- Vercel creó `dpl_AMxeSCGm5LjhNhMMfkiGuJaRMiEN`, lo marcó `READY` con destino
  `production` y asignó `https://beatss.app` a esa versión.
- La tienda respondió HTTP 200 y el webhook respondió HTTP 405 ante GET, que es
  el comportamiento esperado para una ruta que sólo procesa POST firmado.
- Una compra de `Magic`, licencia básica de USD 30, abrió Stripe Checkout con
  una sesión `cs_live_`; no se introdujo tarjeta ni se realizó un cobro.
- No se repitió el sandbox: el Paso 99 ya demuestra E2E sin dinero real con
  webhook HTTP 200, pago aprobado, licencia, PDF, SRI en cola y descarga MP3.
- Límite de evidencia: todavía no existe un evento Live pagado ni una entrega
  Live real. Ese hecho sólo debe marcarse verificado cuando ocurra una venta
  real; no es necesario generar un autocobro para habilitar la operación.

## Antecedente cerrado: licencia exclusiva de Trip

- Registro confirmado: `users/paXbnNbHMMPC31X3hf0oTUx4bbr2/licencias/EXCL-BANDIDAJE-TRIP-20240101-ELVIS`.
- Se corrigieron `date` y `contractEffectiveDate` a `2026-05-16` en
  Firestore, conservando la referencia histórica como identificador estable.
- El registro incluye ahora una anotación de auditoría con la fecha anterior,
  la fecha corregida y el ID del documento firmado en Zoho Sign.
- Se alinearon `config.js` y `transacciones_consolidadas_globales.csv` con la
  fecha efectiva correcta.
- Verificación: lectura posterior de Firestore correcta; no queda la fecha
  `2024-01-01` asociada a la licencia en las dos fuentes locales; `config.js`
  pasa comprobación sintáctica; 117/117 pruebas Node aprobadas; `git diff
  --check` correcto para los archivos tocados.
- No fue necesario desplegar: el historial vigente obtiene el documento ya
  corregido directamente desde Firestore.

## Antecedente cerrado: Stripe

- Se corrigió `.agents/AGENTS.md`: la cuenta Stripe de Sossa está activa y la
  antigua dependencia de una LLC ya no aplica.
- La tienda publicada confirmó que Stripe estaba habilitado para Sossa, pero el
  checkout no conservaba esa capacidad al cargar el nuevo escaparate.
- Se corrigió `public-storefront.js` para conservar las capacidades de pago del
  productor al cargar el nuevo escaparate; se añadió una prueba de regresión en
  `tests/auth-bootstrap.test.mjs`.
- Verificaciones locales: 61/61 pruebas Node relacionadas, `npm run build`,
  presupuesto de rendimiento y `git diff --check` correctos.
- La compra sintética de `Magic`, licencia básica de USD 30, se completó con una
  sesión `cs_test_`: webhook y retorno HTTP 200, pago `approved`, PaymentIntent,
  licencia privada visible, SRI en `PENDIENTE_AUTORIZACION`, PDF válido de
  2,934,264 bytes y MP3 firmado HTTP 206 con descarga registrada.
- La identidad fue sintética con dominio `.test`; no hubo cargo ni correo real.

## Despliegue publicado

- Sossa autorizó explícitamente el 2026-09-11 publicar todos los cambios
  actuales del árbol de trabajo en Vercel.
- Vercel publicó `dpl_5CojxMn6amAA2441XjL5wiWtRm5d` con estado `READY` y
  asignó la versión a `https://beatss.app`.
- El build remoto y el presupuesto de rendimiento pasaron. Stripe volvió a
  aparecer en el checkout público y la compra sandbox E2E quedó verificada.
- No se mostraron ni modificaron credenciales. La prueba creó únicamente sus
  registros sintéticos de pago, licencia, PDF, SRI y descarga.

## Producción vigente

- URL: `https://beatss.app`
- Despliegue verificado: `dpl_AMxeSCGm5LjhNhMMfkiGuJaRMiEN`
- Estado: `READY` / `production`
- Última comprobación: 2026-09-12. La tienda respondió HTTP 200 y abrió una
  sesión Stripe Checkout `cs_live_` para Magic por USD 30; no hubo cobro.

## Pendientes reales

- Los pendientes técnicos y de negocio se mantienen exclusivamente en
  `task.md`. No activar cobros, secretos, Firestore, SRI, correos o despliegues
  por inferencia.
- Revisar cualquier registro histórico antes de retomarlo; no confiar en una
  etiqueta antigua de “Tarea activa”.

## Lectura mínima al iniciar

1. `AGENTS.md`
2. `CURRENT_STATE.md`
3. `COLLABORATION_PROTOCOL.md`
4. `task.md`
5. `.agents/AGENTS.md`

Consultar sólo si la tarea lo necesita:

- `CODEX_HANDOFF.md` para límites de la migración histórica.
- `OPEN_CODE_HANDOFF.md` para operación específica de OpenCode.
- `COLLABORATION_STATE.md` para evidencia e historial previo.

## Limpieza documentada

- `CURRENT_STATE.md` quedó como la única fuente breve del estado vigente.
- `COLLABORATION_STATE.md` conserva íntegro el historial como archivo de
  consulta; no se eliminó evidencia ni se alteraron sus registros históricos.
- Los handoffs, el protocolo y `AGENTS.md` ahora dirigen primero al estado
  actual y dejan el historial para consultas puntuales.
- Se actualizó el puntero de producción al despliegue verificado
  `dpl_29F7BamD4iRb6dNgUwmNeUozpV7U`.
- Verificación de cierre: no quedan encabezados de tarea activa en el archivo
  histórico y las comprobaciones de referencias y formato pasaron.

## Próximo inicio

La siguiente tarea real debe marcarse como `IN_PROGRESS` aquí. Stripe sandbox y
la activación Live quedan cerrados y verificados dentro de sus límites de
evidencia. Cualquier cobro real, rotación de credenciales o cambio posterior de
pagos requiere autorización explícita.
