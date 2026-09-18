# Archivo histórico de colaboración de BEATSS

> Conserva evidencia y snapshots anteriores. Desde 2026-09-01 no es el punto
> de entrada operativo: usar `CURRENT_STATE.md` para la única tarea vigente,
> producción verificada y siguiente acción. No borrar ni reactivar una tarea
> desde este archivo sin contrastarla primero con el estado actual y `task.md`.

## Snapshot histórico más reciente

- Estado registrado: `DONE`
- Agente activo: `Codex`
- Fecha: `2026-09-01`

## Tarea completada y publicada: retorno seguro a Inicio tras expiración de sesión — 2026-09-01

- Objetivo: al cerrar el acceso mostrado después de una sesión expirada en
  `/inicio?session=expired`, la persona debe ver la portada pública de Inicio
  y nunca una pantalla vacía.
- Implementación: `app-bootstrap.js` reconoce `session=expired` y carga la
  portada pública junto con Auth. El aviso de expiración conserva su acceso;
  cuando se cierra, Inicio ya está montado detrás y no queda una pantalla
  vacía. Las rutas privadas normales no cambian.
- Regresión: `tests/auth-bootstrap.test.mjs` cubre expresamente ese retorno.
- Verificación local: la URL exacta `/inicio?session=expired` montó
  `#ledger-home`; tras cerrar el acceso, Inicio permaneció visible sin errores
  de página. Suite Node: 35/35 aprobadas. `npm run build` y el presupuesto de
  rendimiento aprobaron.
- Producción: publicada con Vercel como `dpl_29F7BamD4iRb6dNgUwmNeUozpV7U`,
  estado `READY`, destino `production` y alias `https://beatss.app`.
- Verificación en producción: la URL exacta
  `https://beatss.app/inicio?session=expired` mostró el acceso. Tras pulsar
  `Cerrar acceso`, `#ledger-home` siguió montado, la portada quedó visible y
  el modal pasó a `aria-hidden="true"`, sin errores de página.

## Tarea completada: auditoría de contexto y optimización con `token_optimizer` — 2026-09-01

- Solicitud: pedir al agente interno de optimización que identifique mejoras
  posibles para el uso de contexto, handoffs y documentación de BEATSS.
- Alcance: revisión de solo lectura mediante el agente canónico
  `knowledge_steward` (alias `token_optimizer`); no editar código, memoria,
  secretos, configuración, datos ni producción.
- Resultado: la primera ejecución no aportó evidencia y fue descartada. La
  segunda consulta usó un manifiesto saneado y limitado de `CODEX_HANDOFF.md`,
  `OPEN_CODE_HANDOFF.md`, la cabecera y los encabezados de
  `COLLABORATION_STATE.md`, y las tareas abiertas de `task.md`.
- Hallazgos verificados: la cabecera tenía fecha/estado obsoletos; el estado
  compartido aún conserva nueve tareas históricas marcadas como activas; y
  `OPEN_CODE_HANDOFF.md` referencia el deployment anterior
  `dpl_6wdHSvHNZXGgD4TC1nY1qbWk3vo3`, mientras la producción vigente se
  verificó como `dpl_29F7BamD4iRb6dNgUwmNeUozpV7U`.
- Límites: no se revisó la bóveda de Obsidian, el historial Git, secretos,
  ni el contenido completo de tareas históricas. No se aplicó limpieza,
  archivado ni modificación funcional alguna.
- Siguiente acción: si Sossa lo autoriza, preparar un plan de limpieza de
  documentación que conserve el historial, deje una sola tarea activa y
  actualice el puntero de producción; revisar el plan antes de editar.

## Tarea cerrada: migración controlada de la biblioteca BeatStars — 2026-08-29

- Objetivo: descargar desde BeatStars Studio todos los archivos disponibles de
  la biblioteca del productor (WAV, stems y preview etiquetado), preservar la
  descarga limpia de cliente como MP3 generado desde el WAV original, subirlos
  al Drive central de `sossamusic@gmail.com` y actualizar el catálogo privado.
- Navegador: la autenticación de Google/BeatStars funciona únicamente en el
  Chrome normal del productor. Chrome for Testing fue rechazado por Google y no
  debe usarse para iniciar sesión ni para esta migración.
- Producción: `dpl_GKRF5xVxQ7kW5JWATRgB8cFCrLmK` está `READY` y publicado en
  `https://beatss.app`; Inicio devolvió HTTP 200 y la ruta de migración devolvió
  el 405 esperado a una petición GET. Esta versión conserva MP3 de entrega y
  previews como datos privados y el fulfillment prioriza el MP3 privado firmado.
- MCP: se corrigió la detección de beats existentes y los nombres de archivos
  con sufijo `delivery`, evitando crear una ficha distinta por el MP3 generado.
  La suite del MCP pasó 7/7; seguridad de migración/Drive 9/9 y `npm run build`
  con presupuesto de rendimiento aprobaron antes de publicar.
- Migrados y verificados en Drive/catálogo durante esta sesión: `OOUUHH`,
  `VEN`, `Wiggle`, `Shatta`, `Latina`, `Bubble`, `Diamond`, `Loca`, `Model`,
  `GLUE`, `Fresh` y `Haze`. Para cada beat se validó el WAV con ffprobe y el
  ZIP de stems con `unzip -t` antes de subir las cuatro variantes: preview,
  stems, MP3 de entrega y WAV.
- Preparado para el siguiente registro: `Magic` (`TK24450348`) ya tiene sus
  cuatro recursos locales validados. En esta continuación se actualizará sólo
  esa ficha existente con la política `update_assets`, utilizando una nueva
  clave temporal de la sesión autenticada de Chrome normal; después se seguirá
  con `HIGH` (`TK24420552`).
- Incidencia corregida: una primera importación reconoció erróneamente
  `ven_delivery.mp3` como una ficha nueva por tratarse de un nombre de tres
  letras. Se eliminó la ficha accidental `ven delivery` mediante el flujo de
  confirmación del Studio y `VEN` se actualizó en su ID correcto. No se
  eliminaron beats de BeatStars, pagos, licencias ni correos. Un recurso de
  Drive creado por esa ficha no se ha borrado porque no existe todavía una
  operación de limpieza con ID confirmado; no afecta a la ficha correcta.
- Resultado de la continuación: `Magic` se registró mediante `update_assets`.
  La vista privada se recargó desde producción y muestra 14 beats totales, 14
  con MP3 y 13 con WAV y stems: los 13 beats migrados, más el registro anterior
  `Now` que sólo conserva MP3. No se alteraron precios ni condiciones de
  licencia.
- Resultado posterior: `HIGH` (`TK24420552`) se descargó desde BeatStars
  Studio en Chrome normal como WAV y se validó con ffprobe; se generó y validó
  `high_delivery.mp3` desde ese WAV. La ficha lista `RAR/ZIP`, pero el botón
  oficial `Descargar Stems` permaneció deshabilitado tras una recarga completa;
  el botón de preview etiquetado tampoco inició descarga mediante su flujo
  oficial. Por ello HIGH queda preparado sólo de forma local y no se subió ni
  se registró en el catálogo, para no prometer stems o preview inexistentes.
- Pausa solicitada por Sossa: no descargar, migrar ni modificar ningún beat
  posterior hasta recibir una nueva instrucción. Cuando se reanude, verificar
  primero si BeatStars habilita stems y preview para HIGH; sólo entonces emitir
  una clave temporal y ejecutarlo con `update_assets`. No reutilizar una clave
  de migración vencida ni imprimirla.

## Tarea cerrada: MCP de migración BeatStars → Google Drive central → catálogo — 2026-08-29

- Solicitud: crear una herramienta MCP que permita incorporar los archivos y metadatos exportados de BeatStars al Google Drive central y al catálogo privado de BEATSS.
- Alcance: servidor MCP local por `stdio`, inventario y plan de solo lectura, detección de duplicados por hash, y ejecución explícitamente confirmada mediante una clave temporal emitida por la sesión autenticada de BEATSS.
- Límites: no automatizar el inicio de sesión ni extraer contenido de BeatStars; no borrar, mover ni alterar archivos en BeatStars; no exponer secretos de Google, Firebase ni Vercel. La fuente será una exportación local (carpeta y CSV/JSON de metadatos) descargada por el productor.
- Implementación: `mcp/beatstars-drive-mcp-server/` ofrece las cuatro herramientas MCP por `stdio`: requisitos, inventario, plan y ejecución confirmada. El inventario calcula SHA-256, reconoce MP3/WAV/stems/portadas y los campos comunes de CSV/JSON; el plan no escribe datos; la ejecución requiere el código del plan y `BEATSS_MIGRATION_KEY` temporal.
- Endpoint: `api/beatstars-migration.js` crea una clave temporal asociada al productor autenticado, guarda sólo su hash en Firestore, limita archivos/bytes, crea subidas resumibles a Drive y separa MP3/portada públicos de WAV/stems privados. La clave sólo puede enviarse a `https://beatss.app` o `localhost`; nunca se muestra Client ID, Client Secret ni refresh token.
- Interfaz: Configuración crea y copia la clave únicamente tras cargar su módulo diferido, y la elimina de memoria al cerrar el modal.
- Alcance de datos: migra assets y metadata del catálogo. No importa ventas, compradores o contratos históricos porque pueden contener PII y necesitan un flujo de revisión separado.
- Archivos: `api/_beatstars-migration.js`, `api/beatstars-migration.js`, `index.html`, `main.js`, `editor.js`, `tests/beatstars-migration-security.test.mjs`, y `mcp/beatstars-drive-mcp-server/`.
- Beats existentes: el plan admite `existing_policy: "update_assets"` de forma explícita. Este modo sólo agrega los enlaces recién creados de Drive para los archivos seleccionados y mantiene precios, licencias, metadata, portada y cualquier archivo no incluido. Por defecto los beats existentes siguen omitiéndose.
- Corrección de producción: `catalog_status`, `create_upload_session` y `upsert_catalog_beat` inicializan Firebase Admin antes de solicitar Firestore. Esto corrige el error de la primera prueba, que se detenía antes de abrir una subida.
- Verificación: 6/6 pruebas del MCP (incluye protocolo `stdio`), 115/115 pruebas Node de BEATSS, `npm run security:check`, `npm run build` con presupuesto de rendimiento, comprobaciones sintácticas y `git diff --check` aprobados.
- Producción: publicada el 2026-08-29 en Vercel como `dpl_FqiRbV1fZENmPayjQCqMcWmV74wB`, estado `READY`, destino `production` y alias `https://beatss.app`. Vercel confirmó `api/beatstars-migration`.
- Primera prueba real: se creó un lote temporal de copias locales controladas de los tres primeros beats existentes: Now (MP3), OOUUHH (MP3 y WAV) y Magic (MP3 y WAV). El inventario encontró 3 beats, 5 archivos, 175,927,454 bytes, cero duplicados y cero archivos sin asignar. La primera llamada se detuvo antes de subir por la inicialización de Firebase; tras la corrección publicada se ejecutó el mismo plan `update_assets` con clave temporal. El catálogo confirma 1 enlace proxy de Drive para Now y 2 para OOUUHH y Magic. Las tres fichas muestran reproducción disponible. No se modificó Firebase como plataforma, no se eliminaron originales ni se importaron transacciones o datos de clientes.
- Siguiente acción: preparar una exportación descargada de BeatStars con audio, portadas y metadata para repetir el inventario por lotes. El flujo puede omitir los ya existentes o actualizar únicamente sus assets en Drive mediante la política explícita.

## Registro histórico: eliminar el falso error de EmailJS en Emails — 2026-08-29

- Solicitud: la pantalla de Emails carga el historial correctamente, pero muestra una alerta roja de sincronización automática fallida.
- Alcance: separar la carga del historial guardado de la importación histórica de EmailJS; no modificar credenciales, envíos, Firebase ni registros existentes.
- Archivos previstos: `dashboard_modules/email_history.js`, una prueba de regresión y este estado compartido.
- Verificación prevista: prueba Node del historial, suite Node completa, comprobación de seguridad, build y `git diff --check`.
- Resultado: la carga normal ya no intenta importar EmailJS en segundo plano ni cada cinco minutos. Por ello, una lista que cargó correctamente no mostrará una alerta roja ajena a sus registros. `Importar EmailJS` mantiene la importación bajo demanda y sus errores se muestran únicamente tras pulsarlo.
- Archivos modificados: `dashboard_modules/email_history.js`, `tests/email-history.test.mjs`, `COLLABORATION_STATE.md`.
- Verificación: prueba de regresión aprobada; 109/109 pruebas Node, `npm run security:check`, `npm run build` con presupuesto de rendimiento y `git diff --check` aprobados.
- Producción: publicada el 2026-08-29 en Vercel como `dpl_DF5vVQzH1cX3hRtCrh3UWsDJx3QT`, estado `READY`, destino `production` y alias `https://beatss.app`. La ruta pública `/emails` respondió HTTP 200 después del despliegue.
- Corrección en curso: al volver a la pestaña, la tabla no debe quedarse en `Cargando historial...` cuando el listener existente ya tiene los mismos registros.
- Resultado del retorno a Emails: si ya existe la suscripción en tiempo real para esa cuenta, `loadEmailHistory()` redibuja inmediatamente los registros y las estadísticas en vez de vaciar la tabla con un cargador sin un nuevo snapshot.
- Verificación adicional: dos pruebas específicas del historial y 110/110 pruebas Node, seguridad, build, presupuesto de rendimiento y `git diff --check` aprobados.
- Producción de esta corrección adicional: pendiente de autorización explícita.

## Registro histórico: recuperar la vista previa al entrar a Contrato desde otra sección — 2026-08-29

- Solicitud: la pantalla de Contrato muestra el papel, pero el documento no carga.
- Causa identificada: el editor sólo se cargaba durante el arranque directo de `/contrato`; una navegación desde Inicio mostraba `tab-preview` sin importar el módulo que compila el contenido.
- Alcance: cargar el módulo del editor y generar la vista previa al activar `tab-preview`, sin modificar formularios, plantillas, licencias ni datos guardados.
- Archivos: `main.js`, `tests/contract-preview.test.mjs`, `COLLABORATION_STATE.md`.
- Verificación prevista: prueba del acceso desde otra pestaña, suite Node, seguridad, build y revisión del diff.
- Resultado: al activar `tab-preview`, BEATSS carga `editor.js` si todavía no estaba disponible y ejecuta `generatePreview()`. Así la hoja no queda vacía al navegar desde Inicio u otra sección.
- Verificación: prueba específica del contrato, 111/111 pruebas Node, `npm run security:check`, build con presupuesto de rendimiento y `git diff --check` aprobados.
- Producción: publicada el 2026-08-29 en Vercel como `dpl_CyDLMYm42WXikvrbzvJYb53go4kB`, estado `READY`, destino `production` y alias `https://beatss.app`.

## Registro histórico: rediseñar la interfaz de Ventas — 2026-08-29

- Solicitud: corregir por completo la vista de Ventas, que aún mezcla tarjetas
  negras heredadas con el espacio de trabajo claro y oculta el encabezado bajo
  la navegación.
- Alcance: reemplazar únicamente la presentación del dashboard, conservando
  IDs, carga de analíticas, filtros, exportación, gráficos y Copilot.
- Dirección visual: superficie clara, un solo acento azul, métricas compactas,
  jerarquía legible y comportamiento adaptable sin degradados ni brillos.
- Implementación: el HTML oscuro se sustituyó por una estructura semántica
  propia; `sales-analytics.css` aísla encabezado, filtros, seis métricas,
  cuatro paneles analíticos y Copilot de las reglas heredadas. Los gráficos
  usan superficies claras, tooltips claros y una sola familia de azules.
- Funcionalidad preservada: continúan vigentes los mismos IDs para período,
  recarga, exportación, KPIs, Chart.js, compradores y Copilot.
- Verificación: 108/108 pruebas Node, sintaxis, `security:check`, build,
  presupuesto de rendimiento y `diff --check` aprobados. Chromium local midió
  1440 y 390 px sin desbordamiento horizontal, sin tarjetas negras y con la
  cabecera dentro del área visible. Las capturas se hicieron con datos vacíos
  y sin iniciar sesión real, compras, correos ni escrituras externas.
- Producción: no publicar sin una nueva autorización explícita.

## Registro histórico: proteger datos privados de Configuración — 2026-08-29

- Solicitud: los Client ID, tokens, identificadores de cuenta y datos privados
  no deben mostrarse en texto abierto al entrar al panel.
- Solución local: 27 campos sensibles quedan enmascarados al abrir
  Configuración. El encabezado ofrece `Mostrar datos privados`; la revelación
  requiere una acción explícita y todos los valores vuelven a ocultarse al
  cerrar el modal.
- Drive: `/api/gdrive-status` ya no entrega el Client ID de Google al abrir
  Configuración. El navegador lo solicita mediante un endpoint autenticado,
  exclusivo de administrador y sin caché únicamente cuando se pulsa la acción
  de vincular o volver a vincular. El Client Secret permanece siempre en el
  servidor.
- Estado comunicado por el usuario: Google Drive ya fue configurado con
  `sossamusic@gmail.com`. Esta corrección no cambia Firebase, Firestore, la
  cuenta autorizada ni el refresh token. La vinculación no se revalidó con una
  sesión administrativa en esta tarea.
- Verificación local: 107/107 pruebas Node, sintaxis, `security:check`, build,
  rendimiento y `diff --check` aprobados.
- Producción: pendiente de autorización explícita para publicar.

## Registro histórico: ordenar el menú Más herramientas — 2026-08-29

- Causa visual: el desplegable usaba sólo 230 px, mientras las reglas heredadas
  de `.tab-btn` permitían partir los nombres largos y desalineaban iconos y
  textos.
- Solución local: menú adaptable de 304 px, filas táctiles uniformes de 44 px,
  iconos de ancho fijo, texto en una sola línea con elipsis de seguridad y
  estados hover, foco y activo coherentes con el azul de BEATSS.
- Etiquetas: `Content ID Whitelist` pasó a `Lista blanca de Content ID` y se
  normalizó `Contabilidad general` para evitar mezclas innecesarias de idioma.
- Interacción: al elegir una herramienta el desplegable se cierra y deja visible
  la sección seleccionada.
- Verificación local: 106/106 pruebas Node, seguridad, build, rendimiento y
  `diff --check` aprobados. Medición del componente: 304 px de ancho y filas de
  44 px, sin cortes en las tres opciones visibles.
- Producción: publicada el 2026-08-29 en Vercel como
  `dpl_2gwxUsz25kE3ocUUSdKgXNv77bbK`, estado `READY`, destino `production` y
  alias `https://beatss.app`. La comprobación directa confirmó la etiqueta
  nueva, el acceso a Configuración y la hoja de estilos con ancho adaptable,
  texto en una línea y filas de 44 px.

## Registro histórico: reparar Inicio y recuperar Configuración — 2026-08-29

- Causa del bloque inferior: `checkout-legal-modal` formaba parte del HTML
  común, pero su `display: none` dependía de la hoja exclusiva de la tienda.
  En `/inicio` y en el acceso privado esa hoja no se carga, por lo que el
  navegador mostraba `Documento de compra` como texto sin estilos.
- Solución local: el diálogo legal nace con el atributo HTML `hidden`; al
  abrirlo, Checkout retira ese estado, y al cerrarlo lo restablece junto con
  `inert` y `aria-hidden`. Ya no depende de una hoja de estilos para permanecer
  oculto.
- Configuración: se añadió una acción explícita dentro de `Más herramientas`
  en escritorio/tablet y dentro de `Más` en móvil. Ambas reutilizan el modal y
  el manejador existentes; no se duplicó ni alteró la configuración guardada.
- Verificación: 106/106 pruebas Node, comprobaciones sintácticas, seguridad,
  build, rendimiento y `diff --check` aprobados. Navegador local confirmó que
  el acceso ocupa exactamente el viewport sin contenido inferior y que
  `Configuración` aparece en los menús de escritorio y 390 px.
- Producción: publicada el 2026-08-29 en Vercel como
  `dpl_BYBHSgkxoroHvAstQrmzLWEYe3hC`, estado `READY`, destino `production` y
  alias `https://beatss.app`. La comprobación directa de `/inicio` respondió
  HTTP 200, confirmó el diálogo legal oculto, el control de `Configuración`
  presente y una altura de documento igual al viewport, sin bloque inferior.

## Registro histórico: Google Drive central de Sossa — 2026-08-27

- Objetivo: vincular de forma segura el Google Drive de
  `sossamusic@gmail.com` para almacenar MP3, WAV, stems y carátulas,
  manteniendo Firebase/Firestore como fuente de verdad de usuarios, pedidos,
  licencias, contratos, pagos, permisos e historial.
- Separación de cuentas confirmada por Sossa: Firebase, Firestore, el proyecto
  de Google Cloud, la consola y las credenciales OAuth permanecen en la cuenta
  administrativa existente. No deben migrarse ni recrearse bajo
  `sossamusic@gmail.com`. Esa cuenta se autoriza solamente como propietaria del
  espacio de Google Drive donde BEATSS guarda los archivos pesados.
- Implementación local: la autorización usa el flujo OAuth de código. El
  navegador recibe sólo el Client ID público y envía el código de Google al
  servidor; nunca solicita ni transmite el Client Secret. El servidor verifica
  administrador y exige exactamente `sossamusic@gmail.com`.
- Almacenamiento: `gdrive-central` volvió a estar activo para Sossa, crea una
  carpeta aislada por productor, valida nombre/extensión/tamaño y mantiene
  Firebase Storage como respaldo seguro. Las descargas de Drive continúan por
  `/api/proxy-audio` con autenticación o firma.
- Seguridad heredada: `scratch/update_gdrive_config.py` parece contener material
  OAuth antiguo y estaba sin seguimiento. No se leyó, cambió ni eliminó; quedó
  excluido explícitamente en `.gitignore` para evitar un commit accidental.
- Verificación: 106/106 pruebas Node, `security:check`, build Vite, presupuesto
  de rendimiento, comprobación sintáctica de seis módulos y `diff --check`
  focalizado aprobados. No se cargaron archivos, no hubo compras, cargos,
  correos ni escrituras reales en Drive/Firestore.
- Verificación de consola del 2026-08-27: se accedió mediante la autenticación
  oficial de Google, se seleccionó el proyecto existente `Licencias Musicales`
  (`licencias-musicales`), se confirmó el cliente OAuth web ya creado y que sus
  orígenes incluyen Firebase, `beatss.app`, `www.beatss.app` y desarrollo local.
  Google Drive API ya está habilitada. No se guardaron cambios en Google Cloud.
- Variables Vercel configuradas el 2026-08-27 con autorización explícita del
  usuario: `GOOGLE_DRIVE_CLIENT_ID` y `GOOGLE_DRIVE_CLIENT_SECRET` quedaron como
  secretos de Production; `GOOGLE_DRIVE_ALLOWED_EMAIL` y
  `GOOGLE_DRIVE_ROOT_FOLDER` quedaron como configuración de Production. La
  verificación posterior confirmó los cuatro nombres y el entorno sin leer sus
  valores. No se envió el refresh token heredado y no se modificó Firebase.
- Producción: la corrección quedó publicada el 2026-08-27 en Vercel como
  `dpl_3gXCdoAEgKyo7TifoFkPemMD83P2`, estado `READY`, destino `production` y
  alias `https://beatss.app`. Inicio y tienda respondieron HTTP 200; el endpoint
  de estado de Drive rechazó correctamente la consulta no autenticada con 401.
- Verificación OAuth publicada: el flujo ya no reutiliza automáticamente la
  cuenta administrativa; solicita iniciar sesión con `sossamusic@gmail.com` y
  el servidor conserva la comprobación exacta del correo. Google bloqueó el
  inicio de sesión dentro del navegador automatizado, por lo que la contraseña
  o verificación debe completarse una sola vez desde el Chrome normal del
  usuario. No se escribió aún el refresh token ni se subieron archivos reales.
- Siguiente acción: en BEATSS abrir Configuración > Integraciones, pulsar
  `Vincular sossamusic@gmail.com` y completar el acceso privado de Google.
  Después se verificará el estado vinculado y una carga controlada sin compras
  ni correos.

## Corrección local del consentimiento legal del checkout — 2026-08-14

- Causa raíz: el enlace `Términos de Servicio` de `/tienda/:productor`
  llamaba `openSupportModal`, una función exclusiva del Studio que la ruta
  pública no carga. El checkbox también mezclaba el enlace dentro de su label,
  dependía del estilo nativo y mostraba errores temporales con color blanco del
  tema anterior.
- Solución: el checkout tiene ahora dos acciones propias: `Leer términos` y
  `Ver licencia seleccionada`. Ambas abren un modal claro, accesible y
  autocontenido. La licencia se genera desde la selección vigente e informa
  precio, formatos, límites, vigencia, créditos, composición, Content ID y
  entrega; el contrato PDF final continúa siendo el documento prevalente.
- Consentimiento: la casilla muestra `Pendiente` o `Aceptado`, conserva ayuda y
  error junto al control, usa `aria-invalid` y recibe foco cuando se intenta
  pagar sin aceptación. La navegación entre pasos ya no queda bloqueada; sólo
  se bloquean los proveedores de pago.
- Seguridad operativa: Deuna y PayPhone sólo se inicializan después de llegar
  al paso 3 y aceptar. Stripe y los demás puntos de entrada conservan la
  validación explícita de términos y el registro de aceptación de la orden.
- Evidencia: `output/playwright/public-store-checkout-terms.png` y
  `output/playwright/public-store-checkout-terms-mobile.png`. En 1440 px y
  390 px no hubo desbordamiento ni errores de consola; el foco regresó al
  botón que abrió el documento y todos los controles mantuvieron 44 px.
- Verificación: 101/101 pruebas Node, `security:check`, build Vite, presupuesto
  de rendimiento y `diff --check` aprobados.
- Producción: publicada el 2026-08-15 en Vercel como
  `dpl_EXJ8Z6KLnTCyWXHF1ioEovbcTNkg`, estado `READY`, destino `production` y
  alias activo `https://beatss.app`.
- Verificación en vivo: `/tienda/sossa` respondió HTTP 200. En escritorio y
  móvil se abrieron Términos de Servicio y Licencia Básica, el foco volvió al
  control de origen y el intento sin aceptación mostró el error junto al
  checkbox sin bloquear el avance del asistente. No hubo errores de consola ni
  desbordamiento. Evidencia: `output/playwright/live-checkout-terms-desktop.png`
  y `output/playwright/live-checkout-terms-mobile.png`.
- Límites: no se hicieron compras, cargos, envíos de email, escrituras en
  Firestore ni lecturas de secretos. El texto implementado es funcional y no
  sustituye una revisión jurídica profesional.

## Rediseño local de la tienda pública de Sossa — 2026-08-14

- Causa raíz: `/tienda/sossa` conservaba fondos, colores y estilos oscuros
  escritos dentro del HTML y de las tarjetas dinámicas. La ruta pública no
  cargaba el tema claro del Studio, por lo que los cambios de la aplicación
  privada nunca alcanzaban esta superficie.
- Solución: `public-store.css` define una identidad pública autocontenida con
  fondo claro, superficies blancas, azul BEATSS y texto azul marino. La nueva
  portada comunica el valor de la tienda, muestra el perfil de Sossa, señales
  de confianza y el número de beats disponibles.
- Catálogo: búsqueda, filtros y tarjetas se reconstruyeron con la carátula roja
  de cada beat, reproducción, metadatos, precio y CTA `Adquirir licencia`. En
  móvil se usa una sola columna sin desbordamiento horizontal.
- Checkout: se retiraron los nombres y controles oscuros incrustados de las
  licencias; selección, resumen, campos, acciones y cierre comparten ahora la
  paleta clara. No se cambió la lógica de cobro ni de entrega.
- Accesibilidad: controles táctiles de 44 px o más, foco visible, texto con
  contraste, estados seleccionados semánticos y sin animaciones, desenfoques o
  gradientes nuevos. La skill `baseline-ui` guió estas restricciones.
- Evidencia sintética: `output/playwright/public-store-light-desktop.png`,
  `public-store-light-cards-desktop.png`, `public-store-light-mobile.png`,
  `public-store-light-cards-mobile.png` y
  `public-store-light-checkout.png`.
- Verificación: escritorio y 390×844 sin overflow ni errores; cuatro tarjetas,
  perfil `/producer_sossa.webp`, botones de compra de 48 px y checkout claro.
  Aprobaron 101/101 pruebas Node, `security:check`, build Vite, presupuesto de
  rendimiento y `diff --check`.
- Producción: cambio únicamente local. No se desplegó porque esta tarea no
  incluyó una nueva autorización explícita de publicación.
- Límites: no se hicieron compras, cargos, emails ni escrituras en Firestore;
  no se leyeron ni mostraron secretos.

## Publicación verificada antes de nueva compra Stripe sandbox — 2026-08-14

- Producción: Vercel `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`, estado `READY`,
  destino `production` y alias activo `https://beatss.app`.
- Verificación en vivo sin caché: `/`, `/contrato` y `/tienda/sossa`
  respondieron HTTP 200. El webhook
  `/api/payments/stripe/webhook` respondió HTTP 405 por GET, que es el rechazo
  esperado porque sólo acepta eventos POST firmados por Stripe.
- Disponibilidad: la proyección pública de la tienda confirmó Stripe habilitado
  y cuatro beats con entrega pública, sin exponer valores de configuración.
- Interfaz publicada: el CSS servido contiene el texto e icono blancos de
  Continuar, su desaparición en el paso 3 y la disposición compacta de las
  acciones finales de Entrega.
- Próximo paso: completar una compra nueva con identidad sintética y tarjeta
  oficial de Stripe en modo de prueba; después comprobar sesión, webhook, pago,
  licencia y entrega antes de declarar el flujo cumplido.
- Límites respetados: no se creó ninguna compra, no hubo cargos, no se enviaron
  emails y no se mostraron secretos durante esta publicación.

## Correccion local: acciones del asistente de contrato — 2026-08-14

- Causa raiz: `viewport-coherence.css` forzaba `display: inline-flex !important`
  sobre el boton de avance, anulando el atributo `hidden` que `main.js` aplica
  en Entrega. Ademas, la regla global `.sidebar span` de `sonic-ledger.css`
  imponia el color de texto oscuro sobre la etiqueta del CTA azul.
- Solucion: el texto y el icono de Continuar ahora fijan blanco dentro del
  propio boton; el atributo `hidden` y el estado 3 tienen una regla explicita
  que retira el CTA. En Entrega, el pie cambia a una sola columna para que
  `Editar datos` ocupe todo el ancho disponible.
- Regresion: `tests/auth-bootstrap.test.mjs` exige el contraste interno, la
  desaparicion de Continuar y la columna unica del estado final. La prueba
  fallo sin el arreglo y aprobo despues de restaurarlo.
- Evidencia visual calculada: en escritorio y movil, Continuar conserva fondo
  `rgb(53, 88, 235)` con boton, texto, icono y trazo blancos. En Entrega su
  `display` es `none`, mientras `Editar datos` queda visible y ocupa la unica
  columna del pie.
- Verificacion: 99/99 pruebas Node, `security:check`, build Vite y presupuesto
  de rendimiento aprobados.
- Produccion: publicada y verificada en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`.
- Limites: no hubo pagos, emails, cambios en Firestore ni lectura de secretos.

## Correccion local: pie compacto de Entrega — 2026-08-14

- Problema: las acciones finales heredaban alturas fluidas de hasta 58 px,
  margenes verticales y disposicion de una accion por fila. El pie ocupaba una
  parte excesiva de la barra y reducia el espacio visible del formulario.
- Solucion: `delivery-actions` usa dos columnas. Descargar PDF y Enviar por
  correo comparten la primera fila; Copiar MD y Guardar, la segunda; Limpiar
  campos conserva una fila completa. Las acciones condicionales de firma
  tambien conservan ancho completo cuando aparecen.
- Accesibilidad: todos los botones mantienen 44 px de altura tactil, texto de
  12 px e iconos de 18 px. No se agregaron animaciones, gradientes ni brillos.
- Evidencia visual calculada: el pie completo mide 238 px en 1440x900 y 234 px
  en 390x844; presenta dos columnas de 167.5 px y 179 px respectivamente, sin
  mostrar Continuar en Entrega.
- Verificacion: 100/100 pruebas Node, `security:check`, build Vite y presupuesto
  de rendimiento aprobados.
- Produccion: publicada y verificada en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`.

## Correccion local: vista previa del contrato vacia — 2026-08-14

- Causa raiz: `editor.js` usaba `activeTemplates` como si pudiera acceder a la
  variable lexical declarada en `main.js`. Al ser dos ES modules distintos, el
  primer `selectLicenseType('basic')` terminaba en `ReferenceError` y la hoja
  quedaba montada sin contenido.
- Solucion: el editor inicializa una copia propia de `DEFAULT_TEMPLATES` antes
  del primer render y la sincroniza con `window.activeTemplates` al recargar
  personalizaciones. El respaldo de plantilla predeterminada sigue activo.
- Regresion: `tests/auth-bootstrap.test.mjs` exige que el editor conserve la
  propiedad de las plantillas y que inyecte el HTML compilado. La prueba se
  verifico en ciclo rojo/verde.
- Evidencia de navegador: Chrome aislado genero 16.759 caracteres de HTML,
  13.815 de texto y 13.218 de Markdown; mostro `Licencia Basica` y `Diamond`,
  cargo cuatro plantillas y no registro errores de pagina.
- Verificacion: 98/98 pruebas Node, `security:check`, build Vite, presupuesto de
  rendimiento y comprobacion focalizada de diff correctos.
- Produccion: publicada y verificada en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`.
- Limites: no hubo pagos, emails, cambios en Firestore ni lectura de secretos.

## Trabajo local anterior: catalogo privado de Beats y Licencias

- Tarea completada: reconstruir el catálogo privado de Beats con una nueva
  cabecera operativa, tarjetas horizontales, miniaturas reales y disponibilidad
  visible de MP3, WAV y Stems; conservar también las correcciones recientes de
  Licencias.
- Miniatura: `catalog.js` prioriza la portada propia del beat y después la
  carátula predeterminada del productor. Para Sossa, si esa configuración aún
  no llegó al navegador, usa una copia local de la misma ilustración roja en
  `/beat-thumbnail-sossa.jpg`. La foto de perfil `/producer_sossa.webp` ya no
  se usa como portada; un fallo real de imagen termina en el logo BEATSS.
- Diseño de Beats: `beat-catalog.css` reemplaza las tarjetas grises y verticales
  por fichas blancas compactas con portada 4:5, nombre, BPM, escala, género,
  etiquetas, estados separados de MP3/WAV/Stems y acciones `Usar en licencia`,
  editar y eliminar. El encabezado `Mis beats` integra búsqueda, filtros,
  conteos y la acción principal.
- Móvil: una ficha horizontal por beat, controles de 44 px, filtros apilados a
  390 px y carátulas centradas. No se añadieron gradientes ni animaciones
  nuevas.
- Evidencia visual aislada: `output/beat-catalog-desktop.png` y
  `output/beat-catalog-mobile.png`, generadas con datos sintéticos. La captura
  actual usa la copia local de la carátula pública ya verificada.
- Causa de la columna izquierda: `license-library-rail` permanecía fija con
  `position: sticky` aunque el conjunto de métricas y tendencia era más alto
  que el espacio útil del navegador. Su zona inferior quedaba atrapada fuera
  de la ventana durante el desplazamiento.
- Solución de disposición: el carril vuelve al flujo normal con
  `position: static` y `align-self: start`. El resumen, `Ingresos mensuales` y
  la gráfica avanzan con el documento y pueden recorrerse completos, sin un
  segundo scroll interno.
- Resultado local: el texto ambiguo `PROCESANDO` ya no aparece. Los comprobantes
  pendientes muestran `PENDIENTE SRI` y los estados de contingencia muestran
  `EN COLA SRI`; ambos incluyen una explicación contextual. Esto describe sólo
  la facturación SRI, no el pago, la licencia ni la entrega.
- Jerarquía: título del beat a 23 px; datos principales a 15 px; valor a 18 px;
  referencia monoespaciada a 13 px; etiquetas a 10 px; acciones a 12 px con
  iconos de 16 px. Valores monetarios, fechas y referencias usan números
  tabulares. En móvil, la referencia puede partirse sin desbordar la ficha.
- Barrera: `tests/auth-bootstrap.test.mjs` impide perder la miniatura de Sossa,
  la hoja propia del catálogo, los estados de archivos, el diseño móvil, el
  carril normal de Licencias o la semántica SRI corregida.
- Verificación: 82/82 pruebas Node, `security:check`, build Vite y presupuesto
  de rendimiento aprobados.
- Producción: estos ajustes de Beats y Licencias permanecen locales; requieren una
  nueva autorización explícita para desplegar. El release activo confirmado
  sigue siendo `dpl_HPzxsMs1VbpZT6w1stBSxvvCcA4B`.
- Límites respetados: no se iniciaron compras, no se enviaron emails, no se
  escribieron datos de producción y no se mostraron secretos.

## Publicación anterior confirmada: biblioteca de Licencias e Inicio claro

- Tarea completada: publicar en producción el rediseño reciente de Licencias junto
  con el hotfix que impide que Inicio vuelva al fondo negro; verificar el alias
  `beatss.app` después de que Vercel confirme el release.
- Resultado local listo: Inicio ya no adopta el fondo negro del tema histórico al
  abrir el Studio directamente. El tema privado quedó autocontenido y cubierto
  por una prueba de regresión de importación, alcance y variables.
- Causa raíz: `styles.css` conserva un tema oscuro histórico como valor global,
  mientras `dashboard-home.css` consumía tokens `--ledger-*` definidos sólo en
  `sonic-ledger.css`, la hoja de la portada pública. Una sesión conocida omite
  la portada durante el arranque directo; los tokens faltaban y reaparecían los
  fondos oscuros antiguos. El interruptor de tema aún podía guardar ese estado.
- Solución: `workspace-theme.css` define y limita la paleta del Studio dentro de
  `#app-container.saas-workspace`, fija superficies claras de respaldo y carga
  antes de las vistas privadas. Se retiró el interruptor oscuro heredado y el
  inicio autenticado aplica el tema claro de forma determinista.
- Barrera: `tests/auth-bootstrap.test.mjs` falla si el tema privado deja de
  importarse antes de Inicio, vuelve a depender de `:root`/la portada, falta un
  token Ledger consumido por una vista o reaparece el interruptor oscuro.
- Evidencia: el fixture directo sin `light-theme` calculó lienzo
  `rgb(244, 245, 248)`, tarjeta `rgb(255, 255, 255)`, texto
  `rgb(23, 34, 56)` y `color-scheme: light`. Capturas locales:
  `output/playwright/workspace-theme-direct-desktop.png` y
  `output/playwright/workspace-theme-direct-mobile.png`.
- Verificación: 81/81 pruebas Node, 30/30 pruebas Python, `security:check`,
  build Vite y presupuesto de rendimiento aprobados.
- Límites: no transmitir contenido de la bóveda, ejecutar pagos, enviar emails,
  escribir en Firestore ni desplegar. No leer ni mostrar secretos.
- Autorización: el usuario solicitó explícitamente publicar el 2026-08-14.
- Producción: Vercel `dpl_HPzxsMs1VbpZT6w1stBSxvvCcA4B`, destino
  `production`, estado `READY` y alias activo `https://beatss.app`.
- Verificación posterior: `/`, `/inicio` y `/licencias` respondieron HTTP 200.
  El HTML de `/licencias` contiene el título `Tus acuerdos, en orden` y las
  clases `license-library`; el CSS servido contiene los estilos
  `license-library-hero` y el token privado claro `--workspace-canvas`.
- Controles previos: 81/81 pruebas Node, `security:check`, build Vite y
  presupuesto de rendimiento aprobados. No se ejecutaron compras, emails ni
  escrituras manuales en Firestore durante el release.

## Último trabajo local completado: agentes v2 — 2026-08-13

- Registro y motor: `.agents/agent-registry-v2.json`, `agent_registry.py`,
  `agent_manager.py` y `prompt_manager.py`.
- Grupos activos: producto, plataforma, comercio, calidad/seguridad,
  derechos, SRI, crecimiento/catálogo, conocimiento, audio y soporte.
- Skills nuevas: Evidence Gates, Interface Lab, Sensitive Actions y Knowledge
  Hygiene. Las cuatro pasaron el validador oficial de skill-creator.
- Seguridad: comercio, QA/seguridad, derechos, SRI y Knowledge Steward son de
  solo lectura. La prueba adversarial confirmó que una solicitud `write_file`
  del agente de comercio se bloquea antes de llegar al escritor local.
- Compatibilidad: se conservan los agentes Antigravity históricos ocultos, pero
  no están conectados al motor v2. No se borraron archivos heredados.
- Verificación: 27/27 pruebas específicas de agentes, auditoría estructural de
  10/10 perfiles, `security:check`, compilación Python, build Vite y presupuesto
  de rendimiento aprobados.
- Proveedor real: OpenCode 1.18.16 con `deepseek/deepseek-v4-flash`. Dos pruebas
  sintéticas reales confirmaron los contratos de diseño y pagos sin usar
  herramientas, datos reales o servicios externos.
- Alcance honesto: la suite completa del repositorio alcanzó 24 pruebas antes
  de detenerse por `lxml` ausente en el Python local para la prueba SRI; la
  suite específica de agentes sí terminó completa. Las pruebas estructurales y
  dos inferencias no significan perfección probabilística universal.
- Documentación: `.agents/AGENT_SYSTEM_V2.md` contiene funciones, aliases,
  permisos, flujo y comandos de auditoría.
- Producción: no se desplegó ni se cambió Firestore; no hubo pagos ni emails.

## Trabajo local previo: biblioteca de Licencias

- Tarea completada: reconstruir la arquitectura visual de Licencias como una
  biblioteca operativa, sin reutilizar la cuadrícula horizontal de métricas,
  la tabla administrativa ni la gráfica lateral del diseño anterior.
- Alcance: conservar datos, IDs, búsqueda, importaciones, exportaciones,
  acciones de PDF/editor/eliminación y estados SRI. Validación únicamente con
  datos sintéticos; sin desplegar, cobrar, enviar emails ni escribir datos de
  producción.
- Resultado: Licencias dejó la cuadrícula horizontal de cuatro métricas, la
  tabla administrativa y la gráfica lateral. Ahora usa una cabecera editorial,
  comandos ordenados, un carril vertical de resumen/tendencia y fichas amplias
  por licencia con Editar, PDF y Eliminar visibles.
- Móvil: composición de una columna, comandos en dos columnas, registros sin
  desbordamiento y tres acciones de 44 px en una misma fila.
- Verificación local: 80/80 pruebas Node, `security:check`, build, presupuesto
  de rendimiento, cero desbordamiento horizontal a 1440 y 390 px y auditoría
  automática con cero infracciones sobre la sección visible.
- Evidencia visual: `output/license-library-desktop.png`,
  `output/license-library-mobile.png` y
  `output/license-library-mobile-actions.png`.
- Producción: no publicada; `https://beatss.app` conserva el release anterior.

## Último estado publicado confirmado

- Agente que cerró el estado: `Codex`
- Tarea principal completada: acceso corregido en azul/blanco publicado y
  verificado en `https://beatss.app` en escritorio y móvil.
- Producción: Vercel `dpl_CbaFDmBEku45qDBkPu7fBymPZ7Pn`, destino `production`,
  estado `READY` y alias activo `https://beatss.app`.
- Verificación real: Inicio y `/inicio` respondieron HTTP 200; el login mostró
  símbolo, pestaña activa, botón y bordes azules, sin desbordamiento a 390 px.
  Crear cuenta, volver a Entrar, mostrar contraseña y cerrar respondieron sin
  enviar formularios ni usar credenciales.
- Resultado: el portal conserva su composición nueva de una sola tarjeta, pero
  ahora utiliza exclusivamente azul BEATSS, azules claros, blanco y verde suave.
  Se retiraron negro, rosa, naranja y morado de la identidad del acceso.
- Funciones verificadas: alternar inicio/registro, mostrar y ocultar contraseña,
  recuperación con validación previa, cierre por botón y adaptación a 390 px.
- Verificación: 80/80 pruebas Node, seguridad, build, presupuesto de rendimiento,
  cero desbordamiento horizontal y auditoría automática sin infracciones.
- Alcance: cambios locales sin desplegar; no se usaron cuentas reales, no se
  enviaron correos, no hubo pagos ni escrituras de producción.
- Estado anterior confirmado: carga del historial de Licencias recuperada y
  Emails enviados restaurado como sección visible en escritorio y móvil.
- Archivos modificados: `main.js`, `storageBackup.js`, `index.html`,
  `mobile-studio.js`, estilos y pruebas relacionadas.
- Verificación completada: prueba del cargador lazy sin recursión, consulta y
  render con datos sintéticos, navegación por clic en escritorio/móvil, suite
  Node, seguridad, build y presupuesto de rendimiento.
- Producción actual: Vercel `dpl_3AFeKc1FHSwTHQDLB8p4qtngVmkr`, estado
  `READY` y alias `https://beatss.app`.
- Se publicaron sitemap, noindex de Clearance, iconos locales, endpoint seguro
  de Clearance, endurecimiento CORS, rutas de recursos residuales, tokens de
  estilos privados y el atajo PWA canónico de catálogo.
- La comprobación HTTP externa confirmó Inicio, Catálogo y Clearance con 200;
  prototipos y recursos retirados devuelven redirección 308 y el antiguo
  archivo público de Tailwind devuelve 404. El endpoint de Clearance rechaza
  una petición sin origen con 403, sin exponer datos.
- La revisión visual móvil del release no pudo iniciarse porque el control de
  navegador fue bloqueado automáticamente. No se eludió ese bloqueo; queda
  como verificación pendiente y no se hicieron pagos, correos ni escrituras.

## Registro histórico: expiración segura de sesiones — 2026-08-12

- Implementado: cerrar Firebase Auth tras 30 minutos de inactividad o 8 horas de
  duración total, avisar 2 minutos antes y sincronizar el cierre entre
  pestañas sin guardar UID, correo, tokens ni credenciales en el temporizador.
- Archivos: `session-security.js`, `auth.js`, `auth-access.css`, `main.js`,
  `index.html` y `tests/session-security.test.mjs`.
- El aviso permite extender únicamente el límite de inactividad; el máximo de
  8 horas siempre obliga a autenticarse otra vez. El cierre manual y automático
  se propagan a otras pestañas del mismo navegador.
- Verificación local completada: 73/73 pruebas Node, `security:check`, build y
  presupuesto de rendimiento aprobados. En navegador móvil 390×844 se mostró
  el aviso, se confirmó el botón para continuar y se confirmó el callback de
  expiración con tiempos acelerados, sin iniciar sesión ni usar cuentas reales.
- Rendimiento: el controlador se carga después de autenticar; el chunk de Auth
  quedó en 4,550 bytes gzip, por debajo del límite de 5,000.
- Alcance honesto: este control cierra Firebase en el navegador. Un token ID ya
  emitido puede conservar vigencia hasta su expiración; una aplicación que
  requiera inactividad estrictamente impuesta por servidor necesitaría un
  registro backend de sesión o cookies de sesión HttpOnly. No se revocaron
  sesiones de otros dispositivos.
- Límite: no usar cuentas reales, no revocar otros dispositivos, no cambiar
  Firestore y no desplegar sin una autorización nueva y explícita. Producción
  todavía no contiene esta política.

## Corrección local: desplegable Más herramientas — 2026-08-12

- Diagnóstico confirmado en la pestaña publicada: el `<details>` sí se abría y
  su menú medía 230×205 px, pero la pestaña activa se pintaba encima por el
  contexto de apilado creado por `backdrop-filter`; sólo asomaba el borde.
- Corrección: la cabecera privada ahora es un contexto posicionado con
  `z-index: 60`, overflow visible y el menú usa `z-index: 61`.
- Verificación local: el menú completo quedó visible, dentro del viewport y
  con eventos de puntero en 1440, 1024 y 901 px. A 900 px sigue entrando la
  navegación móvil prevista.
- Regresión añadida a `tests/auth-bootstrap.test.mjs`. Resultado completo:
  74/74 pruebas Node, `security:check`, build y presupuesto aprobados.
- Producción aún conserva el defecto hasta una publicación autorizada. No se
  usaron datos, pagos, correos ni escrituras externas.

## Rediseño local: Licencias y Pedidos — 2026-08-12

- Causa confirmada: ambas vistas seguían consumiendo `--bg-card`, un token
  oscuro translúcido del tema heredado, sobre el nuevo lienzo claro. Además,
  reglas antiguas con `!important` anulaban `hidden` y mostraban métricas y
  tablas vacías como bloques grises.
- Se creó una superficie operativa común con encabezados claros, métricas
  blancas con acentos por estado, acciones ordenadas, tablas legibles y estados
  vacíos coherentes. Se conservaron los IDs y flujos existentes de búsqueda,
  importación, exportación, SRI, aprobación y rechazo.
- En móvil, las acciones se apilan y cada fila se convierte en una tarjeta sin
  ancho de escritorio ni desbordamiento. La revisión se hizo a 390×844 con
  datos totalmente sintéticos y también sin datos; no se accedió a cuentas,
  pagos, correos, entregas ni Firestore reales.
- Verificación local completada: 75/75 pruebas Node, `security:check`, build,
  presupuesto de rendimiento y revisión de accesibilidad sin infracciones en
  las superficies comprobadas.
- Producción todavía conserva el diseño anterior. No se desplegó.

## Corrección local: rutas por sección privada — 2026-08-12

- Cada sección tiene ahora una ruta canónica: `/inicio`, `/contrato`,
  `/licencias`, `/beats`, `/ventas`, `/pedidos`, `/emails`, `/facturacion`,
  `/content-id` y `/contabilidad`.
- Los enlaces históricos `/studio`, `/misbeats`, `/mis-beats` y `/dashboard`
  siguen resolviendo y se sustituyen por `/contrato`, `/beats` y `/ventas`
  antes de iniciar sesión. Una fuente de rutas sin Firebase es compartida por
  el arranque público, el Studio y las reglas de Vercel.
- La URL y el título se actualizan antes de iniciar la carga de datos de una
  pestaña. Atrás/Adelante cambia la pestaña visible sin crear entradas
  duplicadas y recargar una ruta conserva la sección solicitada.
- Navegador local aislado a `127.0.0.1`: se hicieron clics reales en Licencias,
  Beats, Ventas, Pedidos, Contrato e Inicio; en cada caso coincidieron URL,
  título, pestaña activa y único panel visible. Atrás/Adelante también coincidió
  y los cuatro alias antiguos fueron canonizados. No se permitió tráfico fuera
  del servidor local ni se usaron credenciales o datos reales.
- Verificación: 78/78 pruebas Node, `security:check`, build y presupuesto de
  rendimiento aprobados. Producción aún no contiene esta corrección.

## Preparado localmente: controles de acceso resilientes — 2026-08-10

- Se detectó que Auth puede inicializarse desde el `<head>` antes de que el
  modal exista en el DOM. Antes, esa carrera dejaba al modal visible pero sin
  listeners en sus pestañas, cierre, formularios y botón Google.
- El enlace ahora se difiere a `DOMContentLoaded`, es idempotente y
  `openAuthModal` siempre intenta enlazar antes de mostrar el diálogo. Queda
  pendiente de pruebas y publicación sin usar credenciales reales.

## Preparado localmente: CORS limitado a BEATSS — 2026-08-10

- Los endpoints heredados de Stripe, Deuna, activación/cancelación de cuentas,
  referidos, Drive y el PayPhone histórico ya no reflejan cualquier subdominio
  de Vercel en `Access-Control-Allow-Origin`.
- Comparten una lista limitada: dominios BEATSS, previews con el nombre y
  equipo exactos del proyecto y puertos locales. Un dominio Vercel de tercero
  vuelve a la respuesta de origen predeterminado y no puede leer la respuesta.
- Se añadió una prueba de regresión contra variantes de host engañosas.
  Verificación local completa: 60 pruebas Node, `security:check`, build y
  presupuesto correctos; sin llamadas externas, pagos, correos ni datos reales.

## Auditoría de superficies HTML públicas — 2026-08-10

- El build de Vite declara únicamente `index.html` y `clearance.html`; no hay
  otros HTML en la raíz. Un contrato bajo `work/` se conserva como artefacto de
  trabajo y no forma parte del build ni de la publicación.
- La prueba estática ahora bloquea que una tercera página HTML entre al build
  público por error. El cambio queda dentro del release local pendiente.

## Preparado localmente: recursos residuales de QR bloqueados — 2026-08-10

- Los cuatro recortes históricos de `deuna-qr.jpg` no son utilizados por
  ninguna ruta de aplicación. Se conservan localmente como artefactos, pero
  sus URLs estáticas quedan redirigidas a 404 para evitar una superficie pública
  sin función operativa.
- La regla está incluida en la prueba de recursos estáticos y queda dentro del
  mismo release pendiente; no se hicieron pagos, llamadas externas ni cambios
  de datos.

## Preparado localmente: configuración de estilos privada — 2026-08-10

- Los tokens usados por Tailwind se movieron fuera de `public/`. El build los
  sigue evaluando como configuración, pero Vite ya no los copia como un
  JavaScript accesible desde la web.
- Una prueba exige que el archivo no vuelva a existir dentro de `public/` y que
  la compilación continúe leyendo la copia privada. Queda incluido en el
  release local pendiente.

## Preparado localmente: atajo PWA de catálogo canónico — 2026-08-10

- El acceso de la PWA al catálogo apunta ahora a `/catalogo`, la ruta pública
  canónica, en vez del hash histórico. El texto deja claro que es un catálogo
  público.
- La prueba de recursos estáticos verifica ruta y descripción. El ajuste queda
  pendiente de la misma publicación autorizada.

## Preparado localmente: Clearance con servidor seguro — 2026-08-10

- La verificación de licencia y el registro de lista blanca ya no dependen de
  lecturas o escrituras anónimas directas de Firestore. El navegador llama a
  `/api/clearance`; el handler valida origen, tamaño, IDs, URL de YouTube e IP,
  y solo devuelve los campos necesarios de la licencia.
- El registro usa un ID determinista por licencia/canal para que los reintentos
  no creen duplicados. La prueba con Firestore simulado confirma que el
  endpoint no devuelve el correo del comprador y escribe únicamente los campos
  permitidos de la lista blanca.
- Verificación local: 58 pruebas Node, seguridad y build correctos. No hubo
  datos, reglas, pagos, correos, entregas ni escrituras Firestore reales. Queda
  incluido en el mismo release pendiente.

## Preparado localmente: Clearance sin CDN de iconos — 2026-08-10

- Clearance ya no descarga `lucide@latest` desde `unpkg`; sus siete iconos se
  resuelven con el renderer SVG local que utiliza la superficie pública.
- Verificación local real: siete SVG locales, cero solicitudes a `unpkg` y sin
  overflow. Se cerró el servidor temporal usado para esa comprobación; no se
  enviaron formularios ni hubo pagos, correos, entregas o escrituras Firestore.
- Queda incluido en el siguiente release pendiente junto con el sitemap y las
  rutas bloqueadas; no se reintentó el despliegue rechazado por capacidad.

## Registro completado: avatar de checkout en WebP — 2026-08-10

- Producción: Vercel deployment `dpl_BBb7maDG5yryEt9oVoRDHBfk9Fq7` quedó
  `READY` y aliasado a `https://beatss.app`.
- El fallback público de imagen para Sossa en checkout pasó de PNG a WebP.
  Ambas variantes tienen 682×1024 píxeles, no usan transparencia y fueron
  comparadas visualmente; WebP reduce la transferencia de 218,200 a 120,934
  bytes (97,266 bytes menos).
- Verificación: 55 pruebas Node, seguridad y build correctos. El recurso
  publicado respondió HTTP 200 como `image/webp` con caché revalidable. No se
  abrió checkout ni hubo pagos, correos, entregas o escrituras Firestore.

## Registro completado: caché revalidable para recursos de marca — 2026-08-10

- Producción: Vercel deployment `dpl_GGkLyNjoUtnZ738Pu5o3Lkth6K51` quedó
  `READY` y aliasado a `https://beatss.app`.
- Logo e imágenes estáticas de productores ahora se conservan 24 horas en el
  navegador y se revalidan en segundo plano durante siete días. Esto elimina
  revalidaciones innecesarias en visitas repetidas sin inmovilizar la marca a
  largo plazo. El QR de Deuna conserva `max-age=0` para no retrasar cambios de
  cobro.
- Verificación: 55 pruebas Node, seguridad y build correctos. En producción,
  `logo.png` y `producer_sossa.png` devolvieron el encabezado de caché esperado;
  `deuna-qr.jpg` mantuvo `public, max-age=0, must-revalidate`. No hubo pagos,
  correos, entregas ni escrituras Firestore.

## Registro completado: documento interno fuera de la superficie pública — 2026-08-10

- Producción: Vercel deployment `dpl_JWLXcr6xskV5o25MseWENZQr5WFv` quedó
  `READY` y aliasado a `https://beatss.app`.
- Se bloqueó en producción la ruta del documento interno
  `Analisis_Codigo_BEATSS.pdf`; el archivo local se conserva como artefacto de
  documentación y ya no puede descargarse desde el sitio.
- Verificación: 55 pruebas Node, seguridad y build correctos. Una navegación
  real a la URL bloqueada terminó en la respuesta `404: NOT_FOUND` de Vercel,
  sin descargar ni leer el PDF. No hubo pagos, correos, entregas ni escrituras
  Firestore.

## Registro completado: prototipos secundarios retirados de producción — 2026-08-10

- Producción: Vercel deployment `dpl_9GeU787ZaC8Z8q9YANqEoVhZpBDJ` quedó
  `READY` y aliasado a `https://beatss.app`.
- Se retiraron del build los prototipos aislados Concept, Dashboard Concept,
  Webflow Concept, Flow Dashboard, Prompt Demo y las dos vistas de BEATSS
  Relay, junto con sus estilos y scripts exclusivos, además de la página
  auxiliar de reinicio local. Sus ocho URLs heredadas
  redirigen permanentemente a la portada, de modo que ya no exponen interfaces
  de demostración ni recursos rotos.
- Verificación: 55 pruebas Node, seguridad y build correctos. Vercel confirmó
  las ocho rutas con redirección 308; navegaciones reales de
  `/prompt-demo.html`, `/beatss-vision.html` y `/reset-local.html` terminaron
  en Inicio. A 390×844 Inicio no tuvo overflow ni errores visibles. No hubo
  pagos, correos, entregas ni escrituras Firestore.

## Registro completado: recurso de notificaciones de ventas válido — 2026-08-10

- Producción: Vercel deployment `dpl_FLW8xCChkr8eATqJVM95shSSUGmz` quedó
  `READY` y aliasado a `https://beatss.app`.
- Las notificaciones del panel de ventas ya usan `public/logo.png` en vez del
  `favicon.ico` inexistente, y la API se consulta mediante `window.Notification`
  para no fallar en navegadores que no la exponen.
- Verificación: 55 pruebas Node, seguridad y build correctos; `logo.png` en
  producción respondió HTTP 200. No se abrió Studio ni se mostraron o enviaron
  notificaciones; no hubo pagos, correos, entregas o escrituras Firestore.

## Registro completado: Clearance sin registro residual ni recursos rotos — 2026-08-10

- Producción: Vercel deployment `dpl_3Liu9pAAzPkeSiTqydHf3aMBz3Xt` quedó
  `READY` y aliasado a `https://beatss.app`.
- Clearance ya no vuelve a registrar el Service Worker global retirado; este
  permanece publicado únicamente para que instalaciones antiguas se limpien.
  Se corrigieron además los fallbacks de logo de Clearance, Media Session y
  PDF para usar el recurso existente `public/logo.png`.
- Verificación real a 390×844: favicon `/logo.png`, cero registros de Service
  Worker, cero overflow y cero mensajes de consola. No se verificó ni envió
  ningún formulario; no hubo pagos, correos, entregas ni escrituras Firestore.

## Registro completado: rate limit de pedidos robusto ante proxies — 2026-08-10

- Producción: Vercel deployment `dpl_DPLuLbNzgdynRuFnvwT1qAtAX7ML` quedó
  `READY` y aliasado a `https://beatss.app`.
- `/api/orders/pending` prioriza `X-Vercel-Forwarded-For`, la IP que Vercel
  preserva si un proxy adicional modifica `X-Forwarded-For`. El fallback usa
  el último salto recibido, por lo que el límite por IP no queda anclado a un
  valor antepuesto por el cliente.
- Verificación: 53 pruebas Node, `npm run security:check` y build pasaron;
  el endpoint publicado respondió `405`, `POST, OPTIONS` y `private, no-store`
  ante una consulta no mutante. No se creó pedido, no hubo pagos, correos,
  entregas ni escrituras Firestore.

## Registro completado: filtros públicos táctiles y accesibles — 2026-08-10

- Producción: Vercel deployment `dpl_77unbcr5s7FfruLEwpM92TGyvfgS` quedó
  `READY` y aliasado a `https://beatss.app`.
- Los filtros del catálogo están vinculados a sus etiquetas reales, y la
  búsqueda, género y escala de las tiendas ya exponen un nombre accesible.
  Además, los controles superiores, búsqueda y filtros públicos conservan un
  área táctil mínima de 44 px en teléfono.
- Verificación real a 390×844: catálogo y `/tienda/sossa` sin overflow ni
  mensajes de consola; los ocho controles revisados del catálogo y los tres
  de tienda midieron 44 px. La tienda conserva cuatro beats. No se abrió el
  checkout ni hubo pagos, correos, entregas o escrituras Firestore.

## Registro completado: Studio diferido para visitantes — 2026-08-10

- Producción: Vercel deployment `dpl_F3wSGgekXompK2LKomoXjg5bwmmm` quedó
  `READY` y aliasado a `https://beatss.app`.
- Las rutas privadas sin sesión ahora cargan primero Auth. Studio completo,
  Firestore y Lucide solo se importan cuando Firebase confirma una sesión;
  descargas y retornos transaccionales continúan usando el arranque completo.
- Verificación real a 390×844 en `/studio`: modal visible y accesible, sin
  overflow ni mensajes de consola. No se descargaron el bundle de Studio de
  ~112 KB, Firestore ni Lucide; quedó solo el bootstrap de ~4 KB y Auth.
  No hubo inicio de sesión, pagos, correos, entregas o escrituras Firestore.

## Registro completado: acceso móvil directo a Studio — 2026-08-10

- Producción: Vercel deployment `dpl_EA97MxLpe9kb9NbnpcTheryQyga9` quedó
  `READY` y aliasado a `https://beatss.app`.
- El modal de Auth ya no depende del CSS de la landing, que se difiere para
  rutas públicas. `auth-access.css` se carga solo con Auth, por lo que
  `/studio` como visitante conserva tarjeta, pestañas, campos y cierre
  correctamente renderizados.
- Se retiraron trazas informativas de Auth y `main.js`, incluidas las que
  exponían email/UID de sesión. El bundle principal de Studio bajó de 30,366 a
  30,140 bytes gzip en la validación local.
- Verificación real a 390×844: modal de 354 px, campos de 312 px, cero
  controles inferiores a 44 px, overflow, errores o advertencias. Se verificó
  también el formulario de registro sin enviar datos. No hubo inicio de
  sesión, pagos, correos, entregas ni escrituras Firestore.

## Registro completado: controles táctiles públicos — 2026-08-10

- Producción: Vercel deployment `dpl_A6hwF4CAUboWq8PvVKpAxW8m268c` quedó
  `READY` y aliasado a `https://beatss.app`.
- Los enlaces y acciones de Inicio tienen un área táctil mínima de 44 px. En
  la tienda, el retorno y cada botón circular de compartir también pasaron de
  32/38 px a 44 px sin modificar reproducción, checkout ni pagos.
- Verificación real: Inicio a 320, 360 y 390 px, y tienda a 320 y 360 px,
  sin controles interactivos menores de 44 px, sin overflow ni errores de
  consola; la tienda conserva cuatro beats. No se abrió checkout ni hubo
  cobros, correos, entregas o escrituras Firestore.

## Registro completado: filtros compactos del catálogo móvil — 2026-08-10

- Producción: Vercel deployment `dpl_3W9sm1T2g7QodnW9psGdtuS5UeP6` quedó
  `READY` y aliasado a `https://beatss.app`.
- Entre 360 y 560 px, los cuatro filtros del catálogo usan una cuadrícula de
  dos columnas; a 320 px regresan a una columna para conservar etiquetas y
  opciones nativas legibles.
- Verificación real: a 390 px el panel mide 146 px (antes ocupaba cuatro
  filas), la primera portada ya comienza en la pantalla, sin overflow ni
  mensajes de consola. El filtro Dancehall devolvió tres beats; se repitió la
  comprobación a 360 y 320 px. No se abrió checkout ni hubo pagos, correos,
  entregas o escrituras Firestore.

## Registro completado: iconos públicos bajo demanda — 2026-08-10

- Producción: Vercel deployment `dpl_4Mx8ekxWTgA8pBE5Y6YpWTE6Eexr` quedó
  `READY` y aliasado a `https://beatss.app`.
- Catálogo y tiendas ahora dibujan los iconos públicos con un SVG local mínimo.
  La librería Lucide completa (66 KB gzip) se descarga solo al reproducir o
  abrir el checkout; Vite ya no la precarga desde las rutas públicas.
- Verificación real a 390×844: `/catalogo` mostró 14 iconos y `/tienda/sossa`
  18 iconos con cuatro beats, sin la librería completa, overflow ni mensajes
  de consola. Al abrir el checkout, la librería se cargó bajo demanda, el
  selector funcionó y los términos continuaron sin aceptar. No hubo pagos,
  cobros, correos, entregas ni escrituras Firestore.

## Registro completado: diferir landing fuera de rutas públicas — 2026-08-10

- Producción: Vercel deployment `dpl_FX4LZYVhwPPDNqU3TiTxVS3GEmJx` quedó
  `READY` y aliasado a `https://beatss.app`.
- `relay-home.js` y su CSS ya no son scripts iniciales de `index.html`; el
  bootstrap los importa solo para Inicio. Catálogo y tiendas dejan de montar y
  ocultar la landing antes de mostrar su propia interfaz.
- El presupuesto de arranque bajó de 4,455 a 2,241 bytes gzip de JavaScript y
  de 11,039 a 0 bytes gzip de CSS inicial medido en el HTML de arranque.
- Verificación real a 390×844: `/catalogo` y `/tienda/sossa` muestran cuatro
  beats, sin módulo de landing ni overflow; `/` conserva la landing. No hubo
  pagos, correos, entregas ni escrituras Firestore.

## Registro completado: minimizar datos locales de checkout — 2026-08-10

- Producción: Vercel deployment `dpl_32FNRmo3W5CZpPnYVSb5ix5rEFn5` quedó
  `READY` y aliasado a `https://beatss.app`.
- `beatss_checkout_log` era exclusivamente diagnóstico y retenía metadatos de
  compra en `localStorage`. Producción ya no lo crea ni actualiza; queda
  disponible solo en desarrollo local o con diagnóstico explícito.
- Verificación real a 390×844: selector de licencia abierto, registro local
  ausente, sin overflow y con 0 errores/advertencias. No se aceptaron términos
  ni se iniciaron pagos, correos, entregas o escrituras Firestore.

## Registro completado: checkout sin trazas de producción — 2026-08-10

- Producción: Vercel deployment `dpl_7L6Mbg9v1NGrUNBSW8tUsiU2hfjJ` quedó
  `READY` y aliasado a `https://beatss.app`.
- Las trazas detalladas de checkout ya no exponen en la consola de producción
  IDs de beats o pagos, configuración de productores, respuestas de pago ni
  enlaces de entrega. Se conservan errores reales; el diagnóstico detallado
  solo está disponible en desarrollo local o mediante `?checkout_debug`.
- Verificación real a 390×844: el selector de licencia abre correctamente,
  términos sin aceptar, sin overflow y con 0 errores/advertencias de consola.
  No se inició pago, cobro, correo, entrega ni escritura Firestore.

## Registro completado: desacoplar utilidades de tienda pública — 2026-08-10

- Producción: Vercel deployment `dpl_38vZEHJaibuAwhiTir1mrYjDCKQo` quedó
  `READY` y aliasado a `https://beatss.app`.
- La resolución de portadas pasó a `public-beat-utils.js`. La tienda pública
  ya no importa el módulo completo del catálogo global para una sola utilidad;
  así se evita una descarga adicional de aproximadamente 11 KB sin comprimir
  en `/tienda/:productor`.
- Verificación real a 390×844 en `/tienda/sossa`: cuatro beats, interfaz sin
  desbordamiento, 0 errores y 0 advertencias. Antes de interacción no cargan
  el módulo de catálogo global, Firestore ni checkout. No hubo compra, cobro,
  correo ni escritura Firestore.

## Registro completado: iconos públicos locales — 2026-08-10

- Producción: Vercel deployment `dpl_Hs2uMr1YqjwzR1DLFPX3VnTsrHSf` quedó
  `READY` y aliasado a `https://beatss.app`.
- Catálogo global y tiendas públicas usan los iconos Lucide incluidos en la
  aplicación; ya no cargan la fuente externa Material Symbols durante la
  visita inicial. Material Symbols se solicita únicamente al abrir checkout,
  donde todavía lo necesita la interfaz de compra.
- Verificación en producción: a 390×844 el encabezado y su esquina superior
  derecha se ven correctamente, sin símbolos rotos, overflow, errores ni
  advertencias. Al tocar `ADQUIRIR`, el selector de licencia abre y carga los
  iconos requeridos sin iniciar ni confirmar pago.

## Registro completado: tienda pública independiente de Studio — 2026-08-10

- Producción final: Vercel deployment `dpl_FUumtMzpNQG5fXQeyyDH4obJhcDC`
  quedó `READY` y aliasado a `https://beatss.app`.
- `/tienda/:productor` carga el escaparate, filtros, EPK, compartir, WhatsApp
  y reproducción sin arrancar Studio, Firestore, Storage ni checkout. El
  selector de licencia importa checkout sólo al tocar `Adquirir Licencia`.
- Medición limpia a 390×844: cuatro beats visibles, EPK y WhatsApp operativos,
  sin overflow; transferencia inicial de ~778 KB a ~241 KB. La apertura del
  checkout se validó sin confirmar ningún pago. Build, seguridad y 46/46
  pruebas Node correctas; la comprobación final de consola tuvo 0 errores y
  0 advertencias. No hubo cobros, emails ni escrituras Firestore.

## Registro completado: carga diferida de portadas públicas — 2026-08-10

- Producción: Vercel deployment `dpl_3XkkA9tjLDXhsBm1oWdzwVGxdBpT` quedó
  `READY` y aliasado a `https://beatss.app`.
- Catálogo global y tiendas individuales priorizan la primera portada visible;
  las restantes usan `loading="lazy"` y decodificación asíncrona. Esto limita
  solicitudes en catálogos extensos sin degradar la primera tarjeta.
- Verificación real a 390×844: una portada `eager/high`, tres `lazy/auto`,
  cuatro tarjetas visibles y 0 errores o advertencias. Build y 7 pruebas
  focalizadas correctas; no hubo pago, correo ni escritura Firestore.

## Registro completado: catálogo público independiente de Studio — 2026-08-10

- Producción: Vercel deployment `dpl_BAhBZkFNhJ6PeerdVEFPntFPHCrR` quedó
  `READY` y aliasado a `https://beatss.app`.
- `/catalogo` carga ahora un router y catálogo públicos sin arrancar `main.js`,
  Firestore, Storage ni checkout. El checkout y su configuración individual se
  importan sólo al tocar `ADQUIRIR`; Studio y las tiendas individuales conservan
  su flujo existente.
- Corrección visual móvil: el título de cada beat usa contraste claro explícito
  sobre el fondo oscuro, sin desbordamiento horizontal a 390 px.
- Validación en producción a 390×844: cuatro beats y portadas visibles, cero
  errores de consola/página, `checkout`, Firestore y Storage ausentes antes de
  comprar; el selector de licencia se había validado en el release inmediato
  anterior sin confirmar pago. Validación local: build, presupuesto, seguridad
  y 45/45 pruebas Node. No se realizó cargo, email ni escritura en Firestore.

## Registro completado: checkout diferido desde catálogo — 2026-08-10

- Producción: Vercel deployment `dpl_DmrfGDXuD2872s58V2sYhpRtoR8Y` quedó
  `READY`; el flujo se verificó directamente en `https://beatss.app`.
- El catálogo dejó de inicializar checkout al abrirse. El resolvedor público de
  carátulas vive ahora en `catalog.js`, por lo que las tarjetas no dependen de
  descargar código de compra para mostrarse.
- Medición móvil limpia a 390 px: antes de interactuar no llega el chunk de
  checkout; cuatro tarjetas y cuatro portadas cargaron sin overflow. Al tocar
  `ADQUIRIR`, el chunk se cargó bajo demanda y el selector de licencia abrió
  correctamente, con UID de productor seleccionado y cero errores.
- Validación local: build, presupuesto, seguridad y 45/45 pruebas Node. No se
  ejecutó pago, no se envió correo ni se modificó Firestore.

## Registro completado: medios y caché de tienda pública — 2026-08-10

- Producción: Vercel deployment `dpl_EkfiR7nNXY9HGBySjydB9FcdjBHQ` quedó
  `READY`; la comprobación posterior se realizó directamente en
  `https://beatss.app`.
- La portada predeterminada ya no viaja como Base64 en `/api/public-catalog` ni
  `/api/public-store`. `/api/public-artwork` valida UID y formato de imagen,
  limita tamaño y devuelve únicamente bytes de imagen con caché pública.
- El JSON global pasó de 91,598 a 1,179 bytes; el de la tienda de Sossa quedó
  en 1,804 bytes. Ninguno incluye archivos de entrega ni la portada Base64.
- En un viewport de 390 px, catálogo y tienda conservaron las cuatro tarjetas,
  portadas cargadas, checkout abierto sin pago, cero errores y cero overflow.
- La segunda entrada a la tienda usó memoria caché para catálogo (0 B, 3 ms) e
  imagen (0 B, 0 ms). Validación local: build, presupuesto, seguridad y 45/45
  pruebas Node correctas. No hubo cargos, emails ni escrituras en Firestore.

## Registro completado: catálogo público eficiente — 2026-08-10

- Producción: Vercel deployment `dpl_rMLyKWSawU43JQ3EXaGxV823NC6B` quedó
  `READY` y aliasado a `https://beatss.app`.
- El catálogo global ya respeta su caché HTTP pública de 60 segundos. En una
  comprobación móvil de 390 px, la segunda navegación reutilizó la respuesta
  desde memoria (0 B, 3 ms), conservando las cuatro tarjetas y sin overflow.
- La respuesta normaliza la marca del productor una vez por `producerUid` en
  lugar de repetirla por beat. La respuesta actual pasó de 363,430 a 91,598
  bytes sin datos de cobro ni configuraciones embebidas por beat.
- El cliente mantiene compatibilidad con la respuesta anterior durante la
  propagación del deployment y solicita los datos de checkout sólo tras elegir
  un beat.
- Los metadatos JSON-LD ya no duplican portadas Base64; solo exponen imágenes
  con URL HTTPS pública. La portada visual sigue cargando en las cuatro tarjetas.
- Validación: build y presupuesto correctos, 42/42 pruebas Node, seguridad,
  catálogo móvil a 390 px y apertura de checkout sin confirmar pago. No hubo
  cargo, email ni escritura en Firestore.

## Registro histórico: creación server-side de pedidos pendientes

- Implementación local terminada: `/api/orders/pending` crea transferencia,
  PayPal manual, ofertas y referencias Deuna mediante Firebase Admin. El
  servidor valida origen, términos, productor, disponibilidad del beat,
  licencia, precio y cupón canónicos; ignora precios/descuentos del cliente;
  aplica idempotencia y límites por IP/correo; valida MIME, bytes mágicos y
  tamaño del comprobante; y guarda la imagen en Storage, no como Base64 en
  Firestore.
- Checkout migrado: ya no existe creación ni actualización directa anónima en
  `payments`; Deuna solo crea la referencia después de aceptar términos y
  adjunta el comprobante con una credencial opaca. Transferencia y PayPal
  manual usan el mismo contrato server-side. Cambiar el comprobante renueva la
  clave de idempotencia y el botón vuelve a quedar habilitado al terminar.
- Reglas locales: se retiraron las excepciones anónimas de `payments`. El
  productor autenticado solo puede cambiar el estado de un pedido propio
  pendiente; los comprobantes de suscripción conservan una creación cliente
  autenticada y validada por esquema. Storage ahora aísla esos comprobantes
  por UID, limita tipo/tamaño y el cliente valida imagen y factura antes de
  subir. Deuna se rechaza con seguridad si falta el secreto de webhook.
- Verificación local correcta: 22/22 pruebas Node, 9/9 pruebas Python, build,
  seguridad y presupuesto de rendimiento. Checkout móvil completo sin pagos y
  portada a 320/360/390 px sin overflow, errores de consola ni errores de
  página. No se enviaron emails ni se escribió en Firestore.
- Bloqueos de publicación: la consulta de solo lectura a Vercel confirmó que
  `DEUNA_WEBHOOK_SECRET` no está configurado. El emulador de reglas tampoco
  puede ejecutarse porque este Mac no tiene un runtime Java. Falta configurar
  el secreto, ejecutar reglas en emulador y completar sandbox E2E de Deuna,
  transferencia y PayPal manual.
- Siguiente acción exacta: configurar `DEUNA_WEBHOOK_SECRET` sin exponerlo,
  instalar/habilitar Java para el emulador, ejecutar las pruebas E2E sandbox y
  solo entonces desplegar funciones más reglas con autorización expresa.
- Límite: no desplegar este lote ni las reglas locales hasta completar esos
  bloqueos. La versión actualmente publicada sigue siendo el despliegue móvil
  y Stripe limpio descrito abajo.

## Registro completado: móvil, tienda pública y Stripe sandbox — 2026-08-10

- Producción limpia: Vercel deployment `dpl_G8LNHKWwPMgzL44ipNdq28paM2zc`
  quedó `READY` y aliasado a `https://beatss.app` después de retirar el endpoint
  temporal de comprobación. Ese endpoint devuelve 404 en el despliegue final.
- Corrección móvil: se eliminó el margen predeterminado del `body`, se aplicaron
  insets de safe area al contenedor y el CTA superior derecho quedó estable en
  80×44 px con la etiqueta `Entrar`. En 320, 360 y 390 px, el documento mide
  exactamente el viewport, no hay overflow horizontal ni errores de consola o
  de página. Captura final: `/private/tmp/beatss-production-iphone-390-top.png`.
- Tienda pública: `server-handlers/public-store.js` entrega un subconjunto
  permitido de productor y beats, sin secretos ni WAV/Stems. `checkout.js`
  consume `/api/public-store` en vez de una consulta `collectionGroup` desde el
  navegador. `https://beatss.app/tienda/sossa` devuelve HTTP 200, muestra a
  Sossa, Stripe configurado y cuatro tarjetas: Diamond, Exotic, Shatta y
  OOUUHH, sin errores de consola ni desbordamiento a 390 px.
- Stripe E2E: una Checkout Session `cs_test_…` aceptó la tarjeta oficial de
  prueba. Los logs de Vercel registraron HTTP 200 para creación de sesión y
  webhook. Una comprobación server-side efímera y sin PII confirmó
  `livemode=false`, `payment_status=paid`, `stripeEventId`, checkout
  `fulfilled`, pago `approved`, licencia `approved` y entrega segura MP3 con
  HTTP 200. El comprador usó `@example.com` y no existe registro de email.
- Seguridad: no hubo cargo real, correo real ni exposición de claves. El
  comprobador efímero fue retirado inmediatamente y el despliegue limpio fue
  verificado después. No se desplegaron reglas Firestore en este ciclo.
- Validación local: `npm run build`, 11 pruebas Node, 9 pruebas Python,
  `npm run security:check`, `npm run performance:check`, auditoría pública,
  checkout móvil y estado mínimo de pagos pasaron. La advertencia conocida
  sobre escrituras anónimas de pedidos `pending` sigue siendo la tarea activa.
- Cambios principales: `sonic-ledger.css`, `checkout.js`, `vercel.json`,
  `api/order.js`, `server-handlers/public-store.js` y
  `tests/public-store.test.mjs`. Se preservó el worktree heredado y no se hizo
  commit, stage ni push.

## Registro completado: estado mínimo y webhook Deuna

- `server-handlers/payment-status.js` expone únicamente `paymentId`, `status`
  y `updatedAt`. Acepta un secreto aleatorio cuyo hash queda en el pedido, el
  token HMAC de descarga o una sesión Firebase autorizada; el secreto viaja en
  `X-Beatss-Status-Token`, nunca en la URL.
- `checkout.js` reemplaza los listeners Firestore del portal del comprador y
  de Deuna por polling acotado; detiene el ciclo ante aprobación, estado
  terminal, 401 o timeout. El secreto Deuna solo vive en memoria.
- `firestore.rules` ya no permite `get` anónimo del documento de pago ni deja
  que cualquier usuario autenticado lea pagos de invitados ajenos.
- `get-order-downloads` solo genera enlaces firmados para pagos `approved` o
  `completed`; un pedido pendiente, fallido o cancelado no recibe archivos.
- `api/payments/deuna.js` conserva el cuerpo crudo, valida HMAC-SHA256 mediante
  `X-Deuna-Signature`, exige `signed_at` reciente, comprueba USD/monto y evita
  fulfillment repetido. `simulate-confirm` queda cerrado en producción y en
  local exige habilitación más un secreto de al menos 32 caracteres.
- Verificación: 9 pruebas Node de token, serialización sin PII, firma, tiempo y
  simulación; prueba Playwright pendiente→aprobado en dos consultas y rechazo
  401 en una sola; suites pública y checkout móvil sin fallos; 9 pruebas Python;
  build, presupuesto de rendimiento y control de seguridad correctos.
- Archivos principales: `checkout.js`, `firestore.rules`, `vercel.json`,
  `api/order.js`, `api/payments/deuna.js`,
  `server-handlers/payment-status.js`,
  `server-handlers/get-order-downloads.js`, `scripts/security-check.mjs` y
  `tests/{payment-status,deuna-webhook-security}.test.mjs`.
- Producción: cambios solo locales. No se procesaron cobros, no se enviaron
  emails, no se escribió en Firestore y no se desplegaron reglas ni funciones.

## Registro completado: rendimiento, accesibilidad y reproducibilidad

- Línea base de producción: Lighthouse móvil 98 rendimiento, 89 accesibilidad,
  100 buenas prácticas y 90 SEO; escritorio 100/95/100/90.
- Hallazgos confirmados: falta descripción SEO; nombre accesible de la marca no
  incluye su texto visible; vistas ocultas conservan descendientes enfocables;
  varios textos secundarios no llegan a contraste AA; y la landing descarga
  Firebase y todo el Studio 2,5 segundos después de `load` aunque no haya
  interacción, desperdiciando aproximadamente 127 KiB de JavaScript móvil.
- Implementación: la portada anónima ya no descarga Firebase ni el Studio a los
  2,5 segundos; los carga al entrar en una acción o ruta privada. Las vistas y
  el modal de autenticación sincronizan `aria-hidden` e `inert`; se corrigieron
  contraste, nombre accesible, descripción SEO, `charset`, `robots.txt` y el
  acabado claro del checkout, incluyendo checkbox y botón Stripe legibles.
- Archivos: `app-bootstrap.js`, `relay-home.js`, `index.html`, `main.js`,
  `auth.js`, `sonic-ledger.css`, `dashboard-home.css`, `public/robots.txt` y
  `COLLABORATION_STATE.md`.
- Lighthouse local final: móvil 99/100/100/100 (FCP 1,2 s, LCP 1,8 s, TBT 0 ms,
  CLS 0, 122 KiB transferidos); escritorio 100/100/100/100 (FCP 0,3 s, LCP
  0,4 s, TBT 0 ms, CLS 0). El JavaScript sin uso dejó de ser una oportunidad.
- Validación funcional: suites pública y workspace sin casos fallidos;
  checkout móvil recorrió tres pasos, cinco licencias, factura, tres métodos,
  términos, Atrás y Cerrar sin confirmar un pago. 320/390/430 px no presentan
  overflow horizontal ni errores de consola; capturas revisadas visualmente.
- Reproducibilidad: suite Python completa en un virtualenv temporal con las
  dependencias fijadas de `requirements.txt`: 9 pruebas, todas correctas.
  `npm run build`, `npm run performance:check` y `npm run security:check`
  pasaron; este último conserva la advertencia del listener anónimo indicada en
  la tarea activa.
- Producción: este lote permanece local y no se ha desplegado. No se procesaron
  cobros, no se enviaron emails y no se modificó Firestore.

## Registro completado: controles móviles y mapa de arquitectura

- Objetivo: comprobar en teléfonos que portada, autenticación, navegación,
  Studio, catálogo, historial, pedidos, ajustes, modales y checkout responden a
  sus botones sin desbordamientos, errores de JavaScript ni vistas bloqueadas.
- Alcance seguro: no confirmar pagos, no enviar emails, no borrar datos, no
  subir archivos y no ejecutar mutaciones externas durante la automatización.
- Fallos corregidos: primer toque de Studio perdido durante la resolución de
  autenticación; idioma del catálogo público sin listener; globo del Studio
  sin destino; barra móvil sobre Guardar/Cancelar en el formulario de beats;
  asistente virtual oculto tras abrirlo desde Soporte; y métodos de pago no
  configurados visibles por un `display:flex !important` heredado.
- Archivos modificados para esta corrección: `relay-home.js`, `auth.js`,
  `main.js`, `sonic-ledger.css`, `chatbot.js` y `styles.css`.
- Auditoría móvil segura: portada y autenticación; todas las acciones públicas;
  navegación Inicio/Crear/Registro/Catálogo/Más; seis accesos del dashboard;
  wizard y cinco licencias; ajustes y sus cinco secciones; contactos, selector
  de beats, licencia manual, formulario de beats, seis pestañas de Soporte y
  chatbot; checkout de tres pasos, cinco licencias, factura, términos, Atrás y
  Cerrar. Stripe/transferencia/PayPhone solo se cambiaron de panel; no se pulsó
  ningún botón de pago, no se subieron archivos y no hubo escrituras externas.
- Verificación local sobre el build: las tres suites móviles pasaron sin casos
  fallidos; `npm run build`, `npm run performance:check` y
  `npm run security:check` pasaron. En 320/390/430 px el ancho del documento
  coincide con el viewport y no hay overflow horizontal ni errores de consola
  en portada/autenticación. Las capturas se revisaron visualmente.
- Producción: Vercel deployment `dpl_AYbBjUhFfYtgU2iMAaUAumsGSYeH` quedó
  `READY` y fue aliasado a `https://beatss.app` el 2026-08-09.
- Verificación de producción: `GET /` devolvió HTTP 200 con los assets del build
  nuevo; la suite pública pasó completa; el checkout móvil pasó sus tres pasos,
  cinco licencias, métodos disponibles, términos, Atrás y Cerrar; las capturas
  nuevas en 320/390/430 px no mostraron overflow ni errores de consola.
- Evidencia visual: `beatss-home-{320,390,430}.png`,
  `beatss-auth-{320,390,430}.png`, `mobile-buttons-workspace.png` y
  `mobile-checkout-step3.png` bajo el directorio de visualizaciones de Codex.
- Límite mantenido: no se confirmó ningún pago, no se hizo un cargo real, no se
  envió email, no se subió comprobante ni se modificaron datos de producción.

## Registro anterior: Inicio del dashboard del productor

- Objetivo: ofrecer una entrada más simple y legible al workspace privado, con
  acciones principales claras, accesos agrupados y una guía breve para quien
  entra por primera vez.
- Implementación local: `index.html` añade `#tab-home` como vista inicial;
  `dashboard-home.css` contiene la capa visual responsive; `main.js` conserva
  la navegación existente y conecta los botones de inicio a las pestañas
  actuales; `mobile-studio.js` añade Inicio a la navegación móvil.
- Navegación: Inicio, creación de licencia, historial, catálogo, ventas y
  pedidos quedan como destinos principales. Emails, Facturador SRI, Content ID
  y Contabilidad General se agrupan bajo `Más herramientas`; ninguno fue
  eliminado.
- Estado: `EXPERIMENTAL / PENDIENTE DE APROBACIÓN VISUAL DE SOSSA`.
- Límite: solo cambios locales; no se desplegó, no se tocó Firestore, no se
  procesaron cobros y no se enviaron emails.

## Registro completado: Stripe Checkout (sandbox)

- Objetivo: añadir un flujo de pago Stripe seguro, server-side y compatible con
  la entrega actual de licencias y archivos de BeatSS.
- Checkout de pago único, endpoints server-side, webhook aislado y despliegue
  de producción ya preparados. Sossa confirmó que las claves de prueba están
  configuradas en Vercel y que el endpoint ya está registrado.
- Archivos previstos: endpoints bajo `api/payments/stripe/`, integración del
  checkout existente, `vercel.json`, `package.json` y pruebas relacionadas.
- Verificación realizada: se creó una Checkout Session `cs_test_…`, Stripe
  aceptó una única tarjeta de prueba `4242…4242`, la redirección de éxito fue
  capturada sin ejecutar el retorno cliente, y el documento público del pago
  apareció como `beat_purchase` / `approved` / `stripe` antes de consultar
  `session-status`. La consulta posterior devolvió estado `complete`, pago
  `paid` y una entrega con token de PDF. No se enviaron emails ni se hizo un
  cargo real.
- Corrección local aplicada: separar el token HMAC de descarga del token de
  autorización de PDF en las entregas Stripe para que el portal de descargas
  no intente usar el token de PDF. La corrección quedó desplegada en
  producción y fue verificada con una segunda compra sandbox.
- Límite: no leer ni modificar `.env`, no exponer secretos, no enviar emails
  reales ni procesar cargos reales.

## Paquete BMI preparado

- `docs/2_Areas/30_Contratos/BMI_Correcciones/00_README.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/01_BMI_Work_Update_Request_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/02_BMI_Letter_of_Direction_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/03_BMI_Correction_Matrix.csv`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/04_BMI_Email_Draft_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/05_BMI_Submission_Checklist.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/00_README.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/01_Flow_Cali_BMI_Work_Update_Request_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/02_Flow_Cali_BMI_Letter_of_Direction_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/03_Flow_Cali_BMI_Correction_Matrix.csv`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/04_Flow_Cali_BMI_Email_Draft_EN.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/05_Flow_Cali_Corrected_Split_Sheet_ES.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/FLOW_CALI_SPLIT_CORREGIDO_IPI_KELLIUM.pdf`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/06_Flow_Cali_IPI_Correction_Addendum_ES.md`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/FLOW_CALI_IPI_CORRECTION_ADDENDUM.pdf`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/FLOW_CALI_SPLIT_IPI_CORREGIDO_FIRMADO_APLANADO.pdf`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/FLOW_CALI_BMI_LETTER_OF_DIRECTION.pdf`
- `docs/2_Areas/30_Contratos/BMI_Correcciones/Flow_Cali/Flow_Cali_BMI_Current_Record.png`

## Último trabajo técnico — iteración UI

- `npm run build`: correcto; queda únicamente el warning conocido de
  `dashboard_modules/email_history.js` sobre importación estática y dinámica.
- `node --check main.js` y `node --check mobile-studio.js`: correctos.
- Revisión visual local con Vite en 1440×1000 y 390×844: portada con dos
  acciones principales, cuatro accesos rápidos, guía de tres pasos y menú
  secundario visible sin recorte.
- Responsive: en 390 px `document.body.scrollWidth` coincidió con el viewport;
  el contenido largo se desplaza dentro de `#tab-home` sin overflow horizontal.
- La capa nueva oculta los adornos heredados del home, mantiene un solo acento
  azul y deja intactos los IDs de las vistas y acciones existentes.
- Evidencia visual local: `/private/tmp/beatss-home-desktop.png`,
  `/private/tmp/beatss-home-mobile.png`,
  `/private/tmp/beatss-home-mobile-bottom.png` y
  `/private/tmp/beatss-home-secondary-nav.png`.

## Trabajo técnico anterior — wizard del estudio

- Se verificó de forma determinista el flujo del wizard del estudio conduciendo
  `window.nextStep` (que expone `showEditorStep()` de `main.js`) sobre el DOM
  real servido por Vite, usando Chrome 151 headless vía CDP.
- `showEditorStep()` en `main.js` mantiene un único panel activo, actualiza
  `hidden`, `inert`, `aria-hidden` y `data-wizard-active`, refuerza el ocultado
  con `display:none !important` en línea y reinicia el scroll.
- `viewport-coherence.css` (reglas bajo `#app-container.saas-workspace`) oculta
  los paneles inactivos y muestra únicamente el activo.
- La sección anterior documenta una verificación histórica del wizard; la
  iteración UI actual sí modifica los archivos indicados arriba.

## Archivos relevantes

- `index.html` (paneles `#step-1/2/3` en `#wizard-stage`)
- `main.js` (`showEditorStep`, `window.nextStep`, listeners `[data-editor-step]`)
- `mobile.css`, `sonic-ledger.css`, `viewport-coherence.css`,
  `beatss-coherence.css`, `saas-premium.css`
- `OPEN_CODE_HANDOFF.md`, `COLLABORATION_PROTOCOL.md`

## Evidencia disponible

- `npm run build` (Vite): correcto.
- `node --check main.js`: correcto (verificado previamente por Codex).
- `git diff --check` en los archivos del flujo (`index.html`, `main.js`,
  `mobile.css`, `sonic-ledger.css`, `viewport-coherence.css`,
  `beatss-coherence.css`, `saas-premium.css`): correcto.
  - Nota: `git diff --check` reporta un espacio final preexistente en
    `styles.css:4653` (`background-image:`), heredado de un cambio local
    anterior y ajeno a este flujo; no fue tocado.
- Prueba DOM/CSS en escritorio (1440×1000): en cada transición
  1 → 2 → 3 → 2 → 1 solo hay **un panel visible** (`visibleCount: 1`); los
  otros quedan con `display:none` + `hidden` + `inert` + `aria-hidden=true`;
  el panel activo mide altura real (p. ej. paso 2: h=854, paso 3: h=956) y no
  queda contenido montado debajo (los inactivos miden 0×0).
- Prueba DOM/CSS en móvil (390×844): misma invariante en los pasos 1, 2 y 3
  (un solo panel visible, resto oculto).
- Scroll: con `.sidebar-scroll` en 198 px, `nextStep(3)` lo reinicia a 0.
- Capturas PNG guardadas como artefacto en
  `/var/folders/.../T/opencode/beatss_shots/` (desktop_step1/2/3,
  desktop_back_step1/2, desktop_scroll_pre, mobile_step1/2/3).
- Límite de la verificación: las capturas se tomaron con Chrome headless; el
  modelo actual no puede abrir imágenes, por lo que la conclusión se apoya en
  la inspección DOM/CSS determinista (computed display, rects, atributos), no
  en una revisión ocular de las PNG. Queda abierta una revisión ocular humana
  opcional de las capturas para el cierre definitivo.

## Siguiente acción exacta — Stripe sandbox

1. No queda una acción técnica pendiente para este ciclo sandbox.
2. Mantener Stripe en modo test hasta autorizar expresamente un cambio a
   producción/live.

## Verificaciones de esta sesión

### Stripe sandbox — 2026-08-08

- `GET https://beatss.app/`: HTTP 200.
- Catálogo público Firestore: productor Sossa localizado y `Diamond`
  (`beat_1780894341530`) disponible; clave pública Stripe confirmada solo por
  prefijo `pk_test_` y longitud, sin registrar su valor.
- `POST /api/payments/stripe/create-checkout-session`: HTTP 200; Checkout
  Session de prueba creada para una licencia básica de `$30.00`.
- Stripe Checkout: una única tarjeta oficial de prueba `4242…4242` fue
  aceptada; se bloqueó la redirección cliente para no ejecutar generación de
  PDF ni EmailJS.
- Antes de llamar a `session-status`, el documento `payments/{paymentId}` fue
  visible con `type=beat_purchase`, `status=approved`, `method=stripe`,
  `deliveryStatus=awaiting_contract`, referencia `cs_test_…` y PaymentIntent
  `pi_…`. Esto demuestra que el webhook ejecutó `fulfillBeatPurchase`; el
  acceso anónimo directo a `users/{uid}/licencias/{paymentId}` devolvió 403,
  como exige la privacidad.
- `GET /api/payments/stripe/session-status`: HTTP 200; devolvió `complete`,
  `paid`, un ítem Diamond y una entrega con token de PDF.
- El portal desplegado rechazó ese token con HTTP 401, confirmando el fallo de
  separación corregido localmente.
- Código local: `node --check` de los cuatro archivos Stripe/checkout, contrato
  estático de tokens, `git diff --check` y `npm run build`: correctos.
- No se hizo cargo real, no se envió email, no se generó PDF remoto, no se
  modificó Firestore manualmente y no se desplegó la corrección.

### Stripe sandbox E2E después del despliegue — 2026-08-08

- Vercel deployment `dpl_81fKA8jbwf5c1jdewdo3Pjb15EeJ` quedó `Ready` y aliasado
  a `https://beatss.app`.
- Se creó una segunda Checkout Session `cs_test_…` con correo sintético
  `example.test`; Stripe aceptó una única tarjeta oficial de prueba.
- Antes de consultar `session-status`, `payments/{paymentId}` apareció como
  `beat_purchase`, `approved`, método `stripe`, con referencia `cs_test_…`,
  PaymentIntent `pi_…` y `sriJobId`, confirmando el fulfillment del webhook.
- `session-status` devolvió HTTP 200, `complete`, `paid`, una entrega y ambos
  tokens separados: PDF y descarga HMAC de 64 caracteres.
- `/api/get-order-downloads` con el token de descarga devolvió HTTP 200,
  `approved`, método `stripe`, `Diamond` y enlace MP3 firmado.
- El portal mostró la licencia básica y generó un PDF local válido de 2,981,052
  bytes (`%PDF`). `/api/log-download` devolvió HTTP 200 y el historial quedó
  con una descarga `license`.
- No se llamó al endpoint de subida de PDF que envía EmailJS; no se envió
  ningún email real. El `deliveryStatus` server-side conserva
  `awaiting_contract` hasta que se autorice una política de envío de correo.

- `git diff --check` sobre el estado y el paquete BMI: correcto.
- Revisión de placeholders y contenido sensible: no se encontraron
  credenciales, tokens, contraseñas ni archivos `.env`.
- El split sheet de `Flow Cali` sí fue localizado y queda como anexo de esta
  obra; no se asumieron splits de otras canciones.
- Se eliminaron referencias que presentaban un split sheet de otra obra como
  si correspondiera a `Flow Cali`.
- Se localizó y revisó visualmente `/Users/sossa/Downloads/FLOW CALI SPLIT.pdf`.
- El split está firmado por cuatro partes; el reparto de composición acordado
  es Tyrone 25%, Kellium 25%, Joao 45% y Saskya 5%; el reparto de máster se
  excluyó del paquete BMI.
- La matriz Flow Cali fue validada con cuatro filas de compositores, un total
  solicitado de 200% en la escala BMI y una fila separada para retirar la
  editora.
- Se resolvió la discrepancia: para BMI se usará `Tyrone Jossimar Simisterra`,
  según la confirmación de Sossa.
- Se incorporó el número de cuenta BMI proporcionado por Sossa: `551101274`.
- Se incorporó el número de obra BMI proporcionado por Sossa: `59413068`.
- Se incorporó la captura `Flow_Cali_BMI_Current_Record.png`, donde se verificó
  que BMI muestra a Kellium al 100%, a Joao al 50%, a `ONERPM SONGS` al 50%,
  el IPI actual de Kellium `01172310200`, y no muestra a Tyrone ni a Saskya.
- La solicitud corregida pide los porcentajes de escritores Tyrone 25%, Kellium
  25%, Joao 45% y Saskya 5%, con 50%, 50%, 90% y 10% combinados esperados en la
  escala BMI de 200%, el IPI de Kellium `01172310200` y el retiro de `ONERPM
  SONGS`; Joao conserva IPI `01170943066`.
- El split firmado final está en `/Users/sossa/Downloads/FLOW CALI SPLIT - IPI
  y reparto corregido.pdf`; usa `01172310200`, composición/publishing 25% / 25%
  / 45% / 5%, conserva el máster y mantiene las cuatro firmas.
- Se creó la copia vectorial `FLOW_CALI_SPLIT_FIRMADO_CORREGIDO_VECTOR.pdf` y la
  copia aplanada `FLOW_CALI_SPLIT_IPI_CORREGIDO_FIRMADO_APLANADO.pdf`, sin capa
  de texto oculta, para usar esta última como anexo principal.
- No se realizó ningún envío externo a BMI.

## Bloqueos y límites

- No leer ni copiar `.env`.
- No hacer nuevos deploys, cobros, cambios de datos en Firestore ni envíos de emails sin una nueva autorización explícita.
- No borrar los cambios locales existentes.
- `styles.css:4653` tiene un espacio final heredado sin resolver; no se tocó
  por estar fuera del alcance del flujo del estudio.

## Publicación final móvil, pagos y reglas — 2026-08-10

- Producción Vercel final: `dpl_6wdHSvHNZXGgD4TC1nY1qbWk3vo3`, estado
  `READY`, alias `https://beatss.app`.
- La portada y el checkout se validaron directamente en producción a 320, 360
  y 390 px: HTTP 200, ancho del documento igual al viewport, cero overflow,
  cero errores de página y sin errores significativos de consola.
- El flujo completo del modal móvil recorrió las cinco licencias, datos del
  comprador, factura, Stripe, transferencia y PayPhone; el click-wrap bloquea
  el pago antes de aceptar términos y habilita Stripe después.
- PayPhone se probó con SDK y API interceptados: cero preparaciones antes de
  términos, una después, precio y descuento ausentes del cuerpo cliente,
  importe tomado del servidor y almacenamiento local sin PII.
- Deuna permanece oculto y cerrado en producción porque
  `DEUNA_WEBHOOK_SECRET` no está configurado; no se habilitó un flujo que no
  pueda verificar su webhook.
- Firestore y Storage pasaron 7/7 pruebas en Emulator Suite con OpenJDK 21.
  El emulador encontró y permitió corregir una sobrescritura de comprobantes;
  la regla final exige `resource == null` al crear.
- Las reglas finales se publicaron mediante la Firebase Rules API con los
  hashes exactos auditados y se verificó que ambos releases apuntaran a los
  nuevos rulesets. No se modificaron documentos de producción.
- La ruta de una sola ejecución usada para publicar reglas se eliminó del
  código y en producción devuelve 404. Su variable temporal también fue
  eliminada de Vercel.
- Firebase CLI exigía reautenticación y la sesión local se cerró después del
  diagnóstico; no conservar ni registrar tokens de esa sesión.
- Firebase Admin 14.2.0 produjo `ERR_REQUIRE_ESM` dentro del empaquetado
  serverless de Vercel. La versión final usa 13.6.0 con `jwks-rsa` 3.2.2 y
  `jose` 4.15.9; `/api/account` volvió a responder 405 en lugar de 500.
- Verificación final: 34/34 pruebas Node, 9/9 Python, 7/7 reglas, security
  check, build de Vercel, presupuesto de rendimiento y carga de 28/28 módulos
  serverless correctos.
- Auditoría de dependencias: cero vulnerabilidades altas o críticas; quedan
  ocho moderadas transitivas en la cadena opcional de Google Cloud. No usar
  `npm audit fix --force`, porque propone una actualización incompatible con
  el runtime serverless comprobado.
- No se realizó ningún cargo real, no se envió ningún email y no se activó
  Deuna. La compra Stripe sandbox y su entrega ya constan verificadas en la
  sección anterior.

## Optimización local posterior al release — 2026-08-10

- Esta sección describe cambios locales todavía no publicados. Producción sigue
  en `dpl_6wdHSvHNZXGgD4TC1nY1qbWk3vo3` hasta recibir una nueva autorización.
- Se retiró de `index.html` un template histórico sin consumidores activos:
  58,825 bytes sin comprimir y 11,017 bytes gzip que se enviaban a cada visita.
- El HTML compilado bajó de 446.14 KB a 387.30 KB y el CSS privado de 135.48 KB
  a 127.64 KB; Lighthouse transfirió 114,019 bytes frente a 127,154 en la
  línea base de producción.
- `scripts/performance-budget.mjs` ahora limita además el chunk JS más grande y
  el total Firebase, y reduce el máximo permitido de HTML gzip a 66,000 bytes.
- `npm run build` ejecuta el presupuesto automáticamente después de Vite, por
  lo que una publicación futura no puede omitir esa validación.
- Mediana de tres pasadas Lighthouse móviles locales: rendimiento 99,
  accesibilidad 100, buenas prácticas 100, SEO 100, FCP 1,205 ms, LCP 1,805 ms,
  TBT 0 ms y CLS 0. Escritorio: 100/100/100/100, FCP 324 ms, LCP 444 ms.
- La comprobación visual y geométrica de 320, 360 y 390 px confirmó ancho del
  documento igual al viewport, cero overflow y una esquina superior derecha
  limpia. El checkout recorrió las cinco licencias, factura, métodos, términos
  y cierre sin errores significativos.
- Regresión local correcta: build Vite, presupuesto, 34/34 pruebas Node, 9/9
  Python y `security:check`. `npm audit` conserva ocho alertas moderadas
  transitivas. La simulación de `npm audit fix` propone Firebase Admin 10.3.0,
  una degradación incompatible; no aplicarla. `npm ci --dry-run` confirma que
  el lockfile actual coincide con las dependencias declaradas.
- La máquina local tiene Node 26 mientras `package.json` exige Node 22 para el
  runtime de Vercel. El build y las pruebas pasaron; repetirlos con Node 22 si
  se modifica la cadena de dependencias.
- No se hizo deploy, cargo, envío de email ni escritura en datos de producción.

## Acceso diferido del Studio — 2026-08-10

- Esta mejora también es local y no está publicada. `firebase-core.js` contiene
  App/Auth; `firebase-data.js` contiene Firestore/Storage; `firebase.js` los
  mantiene como interfaz compatible para el Studio.
- Al tocar "Entrar", `relay-home.js` carga `auth.js` y el modal; la sesión
  confirmada trae después el Studio mediante `ensureBeatssApp`. La auditoría
  de identidad sigue existiendo, pero vive en `main.js` y no bloquea Auth.
- La comprobación de navegador final midió 37,071 bytes para abrir el modal
  (Auth y Core), frente a 277,056 bytes del arranque completo anterior. Se
  retiró el diccionario completo porque el modal sólo necesitaba dos etiquetas
  ES/EN equivalentes. No se solicitó idioma, Firestore ni Storage antes de
  cargar el Studio; el modal abrió en 31 ms en la vista previa local.
- `vite.config.js` mantiene separados los wrappers Firebase y limita el
  modulepreload del chunk Auth para impedir que Firestore/Storage vuelvan a
  adelantarse. `tests/auth-bootstrap.test.mjs` y el presupuesto `authGzip`
  protegen esta decisión.
- El import programático del Studio posterior al modal, checkout móvil y la
  revisión 320/360/390 px no tuvieron errores significativos. No se usó una
  cuenta real ni se escribieron datos Firebase; la transición de sesión real
  queda cubierta por código y pruebas de regresión, no por una autenticación
  externa nueva.
- Regresión: build + presupuesto, 36/36 Node, 9/9 Python, security check y
  diff check correctos. Siguen ocho alertas moderadas transitivas sin arreglo
  compatible conocido; no aplicar `npm audit fix --force`.

## Publicación del Studio, acceso y rutas — 2026-08-12

- Producción final en Vercel: `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`, destino
  `production`, estado `READY` y alias `https://beatss.app`.
- Se publicaron el nuevo diseño de Licencias y Pedidos, la corrección visual de
  Más herramientas, el acceso diferido, el cierre de sesión por inactividad y
  las rutas privadas canónicas.
- `/misbeats` se comprobó en producción y redirige a `/beats`; no carga el
  módulo privado antes de autenticar.
- `/beats`, `/licencias`, `/ventas`, `/pedidos` y `/contrato` se comprobaron en
  un navegador aislado: cada ruta conserva su dirección y título propios,
  muestra el modal de acceso con `aria-hidden=false` y mantiene el Studio sin
  cargar hasta que exista una sesión válida.
- La regresión final pasó 78/78 pruebas Node, `security:check`, build Vite y
  presupuesto de rendimiento antes de publicar. La documentación añadida no
  introduce errores de espacios; el árbol completo conserva avisos heredados
  en archivos ajenos a esta corrección.
- No se inició sesión con una cuenta real, no se hicieron cargos, no se
  enviaron emails y no se escribieron datos de producción durante la
  verificación.

## Hotfix de ancho del Studio — 2026-08-12

- La recarga directa de `/pedidos` podía colocar el panel principal en la
  segunda columna implícita del grid. El editor oculto ocupaba la columna
  grande y Pedidos quedaba comprimido a la derecha sobre un fondo negro.
- `viewport-coherence.css` define ahora de forma autosuficiente la colocación
  de `.main-panel` y `.sidebar`, y colapsa la segunda pista cuando el editor
  está oculto. La regla también cubre el puente de 901 a 920 px entre los
  puntos de quiebre heredados.
- Regresión añadida en `tests/auth-bootstrap.test.mjs`. Validación local en
  1440, 980, 921, 920, 900, 760 y 390 px: panel a ancho completo y cero
  desbordamiento horizontal.
- Producción corregida: `dpl_ngc8sKpUQSAsTB7jEQGCMA8ynbgM`, estado `READY` y
  alias `https://beatss.app`.
- Verificación final en producción a 980 y 390 px: `/pedidos` conserva su
  título, el panel ocupa todo el viewport y el documento no desborda.
- 79/79 pruebas Node, `security:check`, build y presupuesto de rendimiento
  correctos. No se inició sesión real ni se modificaron datos, pagos o emails.

## Rediseño visual real de Licencias y Pedidos — 2026-08-12

- El hotfix anterior corrigió la compresión del panel, pero todavía conservaba
  la composición y los colores heredados. Esta entrega reemplaza de forma
  visible esa interfaz en las dos secciones solicitadas.
- La navegación privada ahora usa superficie blanca y activo azul BEATSS. Se
  retiraron el encabezado negro, el subrayado morado y los acentos naranja,
  verde y violeta que no pertenecían al sistema visual principal.
- Licencias se presenta como `Archivo de licencias`; Pedidos como `Centro de
  pedidos`. Cada vista tiene encabezado, métricas, acciones y tablas propios,
  con una jerarquía común en azul, blanco y azul noche.
- `mobile.css` contiene la navegación móvil privada completa, sin depender de
  estilos de la portada pública. Las vistas cortas mantienen fondo claro y no
  dejan aparecer el lienzo negro del documento.
- Regresión correcta: 79/79 pruebas Node, `security:check`, build Vite,
  presupuesto de rendimiento y `diff --check` de los archivos modificados.
- Producción: `dpl_XymWoLt7W8mHkaRtuVvNS3aQivLw`, destino `production`, estado
  `READY` y alias `https://beatss.app`.
- Verificación pública aislada: a 1440 px el encabezado es blanco, el activo es
  `rgb(49, 87, 232)`, el título visible es `Centro de pedidos` y no existe
  overflow horizontal. A 390 px el panel y la vista conservan fondo claro, la
  barra móvil es blanca y el documento mantiene ancho exacto del viewport.
- La revisión no inició sesión real ni escribió datos; tampoco procesó pagos ni
  envió emails.

## Recuperación de Licencias y Emails — 2026-08-12

- Causa de Licencias: `main.js` reemplazaba el cargador lazy real con un alias
  que volvía a llamarse a sí mismo. La vista quedaba en cero antes de llegar a
  `storageBackup.js`, Firestore o el respaldo local.
- Se retiró esa sobrescritura, se dejó `storageBackup` como único propietario
  de `loadHistory`/`saveHistory` y el wrapper local carga explícitamente ese
  módulo antes de delegar.
- La consulta de licencias ya no depende del plan Pro: toda cuenta autenticada
  puede leer su propia subcolección conforme a las reglas vigentes. También se
  retiró el `orderBy(date)` para incluir documentos históricos sin ese campo;
  el orden final se resuelve en el cliente.
- La promesa de carga espera ahora el render diferido. La vista muestra estado
  de carga/error y ofrece el botón `Recargar`.
- Emails volvió a `workspace-primary-tabs`; en móvil aparece dentro de `Más`.
  Conserva su ruta canónica `/emails` y su cargador privado existente.
- Navegador local aislado: un registro sintético produjo una fila, contador 1 y
  contenido correcto; a 390 px el menú mostró Emails y no hubo overflow. No se
  consultaron ni escribieron datos reales.
- Regresión final: 80/80 pruebas Node, `security:check`, build Vite, presupuesto
  de rendimiento y `diff --check` correctos.
- Producción: `dpl_3AFeKc1FHSwTHQDLB8p4qtngVmkr`, destino `production`, estado
  `READY` y alias `https://beatss.app`. La inspección pública confirmó Emails
  en escritorio y móvil, el botón Recargar, el estado de carga y cero overflow
  a 390 px.
- No se inició una sesión real, no se enviaron emails, no se procesaron pagos y
  no se modificaron documentos de producción durante la comprobación.

## Preparación multi-productor y cierre de riesgos — 2026-08-14

- Estado: implementación local terminada; no desplegada.
- El alta por correo exige contraseña reforzada, aceptación versionada de
  términos y verificación de email antes de entrar. Las cuentas nuevas reciben
  identidad inicial propia, almacenamiento Firebase, slug de tienda único y
  onboarding pendiente.
- La configuración completa del productor dejó de ser legible de forma
  anónima. La tienda obtiene una proyección saneada por servidor; DNI,
  direcciones privadas, datos fiscales, cuentas de cobro, certificados y
  credenciales se migran a `private_config/producer`.
- Stripe sólo se habilita para el productor de plataforma definido por
  `STRIPE_PLATFORM_PRODUCER_ID` o para una cuenta Stripe Connect válida. Los
  demás proveedores se anuncian únicamente cuando esa tienda tiene una
  configuración completa. Se eliminaron respaldos compartidos y simulaciones
  visibles sin configurar.
- Los contratos de productores nuevos ya no heredan nombre, DNI, correo o IPI
  de Sossa. La facturación SRI y las descargas autorizadas pueden leer los datos
  ya migrados al documento privado.
- La configuración individual de cobro usa `private, no-store`. El estado de
  soporte ya no inventa disponibilidad o latencia. Se añadió una solicitud
  autenticada y reversible de eliminación de cuenta, sujeta a revisión antes
  del borrado definitivo.
- Validación local: 94/94 pruebas Node, 30/30 pruebas Python,
  `security:check`, build Vite y presupuesto de rendimiento correctos. El
  emulador de reglas no se ejecutó porque Firebase CLI no está instalado; las
  reglas quedaron cubiertas por pruebas estáticas y casos preparados para el
  emulador.
- Pendiente antes de registro público abierto: desplegar aplicación y reglas
  con autorización; configurar el productor de plataforma y onboarding real de
  Stripe Connect; completar una compra sandbox verificando webhook, pago,
  licencia y entrega; probar correo transaccional por productor; activar
  monitoreo/alertas y definir el procedimiento humano de eliminación y
  retención legal.
- No se mostraron secretos, no se hicieron cargos, no se enviaron emails y no
  se escribieron datos de producción.

## Cierre Stripe sandbox, entrega y publicación — 2026-08-14

- Se configuró en Vercel el productor Sossa como único productor de plataforma
  autorizado para Stripe. Las demás cuentas siguen cerradas salvo que tengan
  una cuenta Stripe Connect propia; no existe un fallback de cobro compartido.
- Firebase Emulator ejecutó 8/8 casos de Firestore y Storage. Después de
  renovar la sesión administrativa y definir el proyecto de cuota, ambas reglas
  compilaron y fueron liberadas en `licencias-musicales`.
- Se creó una Checkout Session `cs_test_` para `Diamond`, licencia básica de
  USD 30, con comprador y correo sintéticos. Stripe aceptó únicamente la tarjeta
  oficial de prueba; no hubo cargo real.
- La evidencia independiente confirmó `checkout=fulfilled`, evento webhook,
  pago `beat_purchase/approved/stripe`, PaymentIntent, trabajo SRI en cola y
  licencia privada `approved`.
- Se corrigió una regresión del bootstrap: el parámetro `stripe_session_id` se
  detectaba, pero la raíz pública no cargaba el Studio que procesa el contrato.
  Una prueba nueva protege ese retorno transaccional.
- Se corrigió la validación del PDF para aceptar el encabezado generado por
  html2pdf con parámetro `filename`, sin relajar Base64, tamaño máximo ni firma
  `%PDF`. El PDF final se guardó en Firebase Storage, respondió
  `application/pdf`, conservó firma válida y midió 2,946,639 bytes.
- Los destinatarios reservados `.test` ahora se procesan como entrega sandbox:
  se exige que el productor tenga su servicio configurado, se guarda el PDF y
  se registra `sandbox_complete`, pero no se llama a EmailJS ni a otro proveedor
  externo. Los correos reales conservan el flujo normal.
- El portal de descargas devolvió HTTP 200, pago aprobado, `Diamond` y MP3
  firmado. La licencia básica no expuso WAV ni stems y el historial registró
  una descarga de tipo `license`.
- Validación final: 97/97 pruebas Node, 30/30 Python, `security:check`, build,
  presupuesto de rendimiento y `git diff --check` correctos. En producción,
  portada, catálogo y acceso respondieron HTTP 200; 1440×1000 y 390×844 no
  mostraron overflow horizontal ni errores de consola.
- Producción vigente: Vercel `dpl_7FbhaDyYMUT9LGYVo7v5tvNnmDrY`, estado
  `READY`, alias `https://beatss.app`; reglas Firestore y Storage publicadas.
- Pendiente externo para abrir tarjetas a cada productor nuevo: completar su
  onboarding individual de Stripe Connect y verificar que su cuenta y país
  estén habilitados. También quedan como operación de negocio las alertas
  persistentes y el procedimiento humano de eliminación/retención legal.
- No se mostraron secretos, no se hizo ningún cargo real y no se envió ningún
  correo real.

## Tienda pública clara de Sossa publicada — 2026-08-14

- Se publicó el nuevo escaparate blanco y azul de BEATSS para
  `https://beatss.app/tienda/sossa`, con propuesta comercial, perfil real de
  Sossa, cuatro beats, filtros, carátulas y llamadas de compra legibles.
- La primera compilación permitió detectar en producción una colisión de orden
  con reglas oscuras heredadas. Se retiraron esas reglas y se añadió una barrera
  de tema limitada a la tienda pública para impedir que el Studio vuelva a
  teñirla de negro.
- Producción vigente: Vercel `dpl_DPM2e4sxe7NCPkwfhzxuJ7WQaZyK`, estado
  `READY`, destino `production` y alias `https://beatss.app`.
- Verificación directa sin caché: escritorio y móvil muestran fondo
  `rgb(244, 246, 251)`, encabezado y tarjetas blancos, cuatro beats, título
  correcto, cero desbordamiento horizontal y cero errores de página.
- Validación previa al despliegue: 101/101 pruebas Node, `security:check`, build
  Vite, presupuesto de rendimiento y `git diff --check` correctos.
- Esta publicación no abrió checkout, no hizo compras ni cargos y no envió
  emails.

## Tienda pública directa y compacta — 2026-08-14

- Estado: publicado y verificado en producción.
- La portada pasa de una explicación extensa a `Escucha. Elige. Lanza.` y el
  catálogo aparece mucho antes en la navegación.
- En escritorio se muestran cuatro beats compactos por fila. En móvil cada beat
  usa una ficha horizontal corta con carátula, reproducción, nombre, precio,
  BPM, escala, género y CTA de licencia sin información redundante.
- La cabecera móvil resume el perfil de Sossa y los filtros comparten una fila;
  el primer beat entra en la primera pantalla útil a 390×844.
- Verificación aislada: cuatro beats, fondo claro, checkout legible, controles
  de 44 px, cero overflow y cero errores de página en 1440×1000 y 390×844.
- Validación final: 101/101 pruebas Node, `security:check`, build Vite,
  presupuesto de rendimiento y `git diff --check` correctos.
- Producción vigente: Vercel `dpl_rUJ3W6t5cro1PkKxfkNBmGNVK51v`, estado
  `READY`, destino `production` y alias `https://beatss.app`.
- Verificación directa: cuatro columnas en escritorio; en 390×844 el primer
  beat comienza a 589 px y su ficha mide 213 px. Fondo, encabezado y tarjetas
  claros, cuatro beats, cero overflow y cero errores de página.
- No se abrió un pago, no se hicieron cargos, no se enviaron emails y no se
  modificaron datos de producción.

## Limpieza del catálogo tras migración de prueba — 2026-08-29

- Se revisaron en producción los 10 registros del catálogo por ID, fuente de
  archivo y respuesta de la previsualización, sin exponer URLs ni credenciales.
- Se retiraron siete fichas residuales: dos `Magic` sin MP3 con rutas GoFile
  fallidas, un `Now` sin MP3, un `OOUUHH` duplicado con rutas GoFile fallidas y
  `Shatta`, `Exotic` y `Diamond`, cuyas rutas ya no se resolvían desde el
  almacenamiento activo.
- Quedaron tres registros sin nombres duplicados: `OOUUHH`, `Now` y `Magic`.
  Las tres previsualizaciones MP3 respondieron HTTP 200. Los WAV de OOUUHH y
  Magic permanecen privados por diseño y devuelven 403 sin autorización.
- La eliminación usó el flujo del Studio, que borra tanto el documento del beat
  como su documento privado de archivos. No se eliminaron archivos de Drive ni
  se modificaron Firebase, pagos, licencias o correos.
- Tras una primera ejecución que solamente actualizó la vista local de algunos
  elementos, se repitió el borrado esperando la escritura de Firestore tras
  cada confirmación. Una recarga limpia posterior confirmó los tres documentos
  restantes y sus MP3 con HTTP 200.

## Borrado de beats confirmado antes de actualizar la interfaz — 2026-08-29

- `deleteBeat` ahora ejecuta un lote atómico de Firestore para borrar el beat y
  su documento privado de archivos. La ficha y el respaldo local se actualizan
  únicamente después de `batch.commit()`.
- Mientras se procesa el borrado, la acción de eliminar se bloquea para evitar
  doble clic. Si Firestore falla, la ficha se mantiene visible y el Studio
  informa que sigue en el catálogo.
- Validación local: comprobación sintáctica, build Vite, presupuesto de
  rendimiento, revisión de seguridad, regresión estática del orden de borrado
  y `git diff --check` correctos.
- Publicado con autorización explícita: Vercel `dpl_BBNL44gT7uvHCecFKT5XWNHKa8pe`,
  estado `READY`, alias `https://beatss.app`. La comprobación sin caché de
  producción confirmó HTTP 200 y el texto de error de la versión con borrado
  confirmado.

## Catálogo: Firestore como fuente única al cargar — 2026-08-29

- Se corrigió la reaparición de beats eliminados: antes, al entrar al catálogo,
  una copia obsoleta de `localStorage` se combinaba con Firestore y se volvía a
  guardar, recreando documentos ya eliminados. Ahora, si Firestore responde,
  sus datos sustituyen el caché local; el caché solo se usa si no hay conexión.
- Se eliminaron nuevamente y de forma secuencial los siete registros residuales
  creados por esa conducta. Tras la limpieza quedaron `Magic`, `Now` y
  `OOUUHH`.
- Verificación de producción con sesión autenticada: recarga completa del
  catálogo, tres fichas visibles y los tres MP3 respondieron HTTP 200. No se
  eliminaron archivos de Drive ni se alteraron pagos, licencias o correos.
- Publicado con autorización explícita: Vercel `dpl_AAvnc9b6R9AZSW2LoNLXkLvqkhau`,
  estado `READY`, alias `https://beatss.app`.
