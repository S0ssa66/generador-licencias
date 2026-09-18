# Tareas de Ejecución

## Paso 114: Publicar y reenviar licencia segura de Wow — COMPLETADO

- [x] Publicar la ruta canónica de entrega segura.
- [x] Registrar la licencia corregida con su referencia BS3 y PDF revisado.
- [x] Enviar un nuevo correo al comprador con el portal privado.
- [x] Verificar correo, portal y descarga MP3 sin exponer credenciales.

## Paso 113: Reparar enlaces privados en correos de entrega — LISTO LOCALMENTE

- [x] Sustituir enlaces directos de MP3/WAV/Stems por el portal firmado.
- [x] Cubrir entrega manual, aprobaciones, DocuSign y entrega automatizada.
- [x] Mantener el proxy privado y rechazar accesos sin firma.
- [x] Añadir pruebas de regresion para impedir correos con enlaces inseguros.
- [x] Ejecutar pruebas, seguridad, build y revision del diff.
- [x] No publicar ni reenviar correos sin autorizacion expresa posterior.

## Paso 112: Corregir integralmente el PDF de licencias — LISTO LOCALMENTE

- [x] Ajustar el documento al ancho imprimible real de papel carta.
- [x] Eliminar el encabezado duplicado y los recortes del margen derecho.
- [x] Mantener juntas las clausulas, la aceptacion, el sello y el pie.
- [x] Corregir redaccion, localizacion y estado segun metodo de pago.
- [x] Regenerar la licencia de `Wow` y revisar visualmente todas sus paginas.
- [x] Ejecutar pruebas, seguridad, build y revision del diff.
- [x] No publicar ni enviar el correo hasta recibir autorizacion expresa.

- [x] Paso 1: Re-establecer y asegurar `/api/gdrive-token.js`
- [x] Paso 2: Revertir la subida forzada de Firebase Storage a Google Drive en `catalog.js`
- [x] Paso 3: Agregar importaciones faltantes de Firebase en `editor.js` (`auth`, `googleProvider`, `linkWithPopup`, `unlink`)
- [x] Paso 4: Agregar importaciones faltantes de Firebase en `dashboard.js` (`auth`, `onSnapshot`)
- [x] Paso 5: Exponer las funciones locales necesarias de `main.js` en `window`
- [x] Paso 6: Agregar alias locales en `main.js`, `dashboard.js` y `editor.js` para funciones de `window`
- [x] Paso 7: Verificar compilación y resolver ReferenceErrors en local
- [x] Paso 8: Desplegar cambios en producción en Vercel
- [x] Paso 9: Crear estructura de carpetas de documentación en `generador-licencias/docs/`
- [x] Paso 10: Mover y copiar los reportes técnicos, legales, de soporte y de subagentes a sus respectivas carpetas de categoría
- [x] Paso 11: Generar la nota central de control `Dashboard BEATSS.md`
- [x] Paso 12: Comitear la nueva estructura de documentación en el repositorio Git
- [x] Paso 13: Expandir subagentes a 17 e implementar prompts ReAct en `agente_coordinador.py`
- [x] Paso 14: Codificar funciones de lectura/escritura/listado seguras en Python
- [x] Paso 15: Implementar el loop ReAct interactivo con confirmación de escritura en consola
- [x] Paso 16: Probar y verificar la ejecución del script con consultas locales
- [x] Paso 17: Agregar subagente de tráfico y ventas (growth_hacker) a la base de código y documentación
- [x] Paso 18: Crear y registrar Producto y 4 Planes Mensuales en PayPal Live (Creador, Artista Pro, Pro, Elite)
- [x] Paso 19: Persistir los Plan IDs resultantes en Firestore para el administrador sossa
- [x] Paso 20: Actualizar `api/activate-pro.js` en producción para mapear los planes de artistas (`creator`, `pro_artist`)
- [x] Paso 21: Compilar y desplegar los cambios en producción en Vercel y refrescar caché del Service Worker
- [x] Paso 22: Generar reporte consolidado de mejoras de tokens, arquitectura, DevOps y datos (Token Optimizer, Refactor Expert, DevOps Admin, Data Engineer)

## Mejoras del BEATSS Project OS — 2026-07-25

- [x] Paso 23: Aislar memoria por usuario, tarea y proyecto con migración legacy no destructiva
- [x] Paso 24: Agregar locks, escritura atómica, validación y versionado de memorias
- [x] Paso 25: Persistir resúmenes y recuperar contexto relevante por consulta
- [x] Paso 26: Restringir herramientas de archivos y búsquedas para excluir secretos y artefactos
- [x] Paso 27: Reducir prompts del Director y subagentes, y actualizar la arquitectura a 24 roles
- [x] Paso 28: Añadir pruebas de aislamiento, seguridad y recuperación contextual

## Mejoras de Obsidian y Graphify — 2026-07-26

- [x] Paso 29: Corregir el Dashboard canónico y eliminar prefijos históricos de navegación
- [x] Paso 30: Separar la documentación curada de las salidas derivadas de Graphify
- [x] Paso 31: Añadir auditoría no destructiva de enlaces, duplicados, frontmatter y artefactos
- [x] Paso 32: Crear índices operativos en la bóveda Obsidian con respaldo temporal
- [x] Paso 33: Corregir referencias curadas y añadir frontmatter uniforme sin borrar duplicados

## Publicación móvil y Stripe sandbox — 2026-08-10

- [x] Paso 34: Corregir el borde/margen visible y la esquina superior derecha en móviles
- [x] Paso 35: Validar portada en producción a 320, 360 y 390 px sin overflow ni errores
- [x] Paso 36: Migrar la carga de la tienda pública a un endpoint server-side saneado
- [x] Paso 37: Publicar y verificar la tienda de Sossa con cuatro beats visibles
- [x] Paso 38: Completar una compra Stripe en modo test y verificar webhook, pago y licencia
- [x] Paso 39: Verificar la entrega MP3 firmada con HTTP 200, sin cargo ni email real
- [ ] Paso 40: Migrar la creación de pedidos `pending` a un endpoint canónico y retirar escrituras anónimas directas de Firestore
  - [x] Implementar endpoint con catálogo/precio/cupón canónicos, idempotencia y rate limit
  - [x] Validar y guardar comprobantes en Storage en vez de Base64 en Firestore
  - [x] Migrar transferencia, PayPal manual, ofertas y Deuna en `checkout.js`
  - [x] Retirar permisos anónimos de pagos en las reglas locales
  - [x] Pasar pruebas Node/Python, seguridad, rendimiento, build y checkout móvil
  - [ ] Configurar `DEUNA_WEBHOOK_SECRET` en Vercel
  - [x] Ejecutar reglas con Firebase Emulator usando OpenJDK 21: 7/7 pruebas de Firestore y Storage
  - [ ] Completar sandbox E2E de Deuna, transferencia y PayPal manual
  - [x] Desplegar funciones y reglas después de las verificaciones y autorización

## Optimización y endurecimiento publicado — 2026-08-10

- [x] Paso 70: Publicar limpieza de indexación y recursos heredados
  - [x] Añadir sitemap de Inicio, Catálogo y tienda de Sossa
  - [x] Marcar Clearance como no indexable y bloquear tres falsos PNG heredados
  - [x] Pasar 55 pruebas Node, seguridad y build local
  - [x] Publicar `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`; sitemap y rutas bloqueadas responden como corresponde

- [x] Paso 71: Retirar CDN de iconos de Clearance
  - [x] Resolver los siete iconos con SVG locales incluidos en el bundle
  - [x] Validar localmente 7 iconos, sin solicitudes a unpkg ni overflow
  - [x] Publicar dentro de `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`

- [ ] Paso 72: Hacer operativo y seguro el portal público de Clearance
  - [x] Mover verificación y registro de lista blanca a `/api/clearance`
  - [x] Validar origen, tamaño, IDs, enlace YouTube e IP; limitar reintentos
  - [x] Devolver sólo los datos mínimos de la licencia y evitar duplicados
  - [x] Pasar 58 pruebas Node, seguridad y build local con Firestore simulado
  - [x] Publicar el endpoint dentro de `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`
  - [ ] Ejecutar una verificación visual E2E sin datos reales cuando el navegador tenga acceso autorizado

- [x] Paso 73: Restringir CORS de los endpoints heredados
  - [x] Reemplazar la aceptación de cualquier `*.vercel.app` por dominios BEATSS, previews exactos del proyecto y localhost
  - [x] Cubrir Stripe, Deuna, cuentas, referencias, Drive y la ruta heredada de PayPhone
  - [x] Pasar 60 pruebas Node, seguridad y build local
  - [x] Publicar junto con los pasos 70–72 en `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`

- [x] Paso 74: Retirar recursos públicos residuales de pago
  - [x] Conservar localmente los cuatro recortes históricos del QR de Deuna
  - [x] Bloquear sus cuatro URLs estáticas y cubrirlas con prueba de regresión
  - [x] Publicar dentro de `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`

- [x] Paso 75: Retirar configuración de estilos de la superficie pública
  - [x] Mover los tokens de Tailwind fuera de `public/` sin cambiar su compilación
  - [x] Añadir regresión para evitar que vuelva a publicarse como JavaScript estático
  - [x] Publicar dentro de `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`

- [x] Paso 76: Alinear accesos PWA con las rutas públicas canónicas
  - [x] Dirigir el atajo de catálogo a `/catalogo` y corregir su descripción pública
  - [x] Añadir una prueba de regresión del manifiesto
  - [x] Publicar dentro de `dpl_sRfkJTr6tNB73nMnVovwh3kPktYZ`

- [x] Paso 77: Recuperar controles del modal de acceso
  - [x] Diferir el enlace de listeners si Auth carga antes del HTML del modal
  - [x] Hacer idempotente el enlace y la apertura del diálogo
  - [x] Validar y publicar la corrección sin iniciar sesión real en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`

- [x] Paso 78: Aplicar expiración segura a las sesiones privadas
  - [x] Cerrar tras 30 minutos de inactividad y 8 horas de duración absoluta
  - [x] Avisar 2 minutos antes y permitir continuar sólo ante inactividad
  - [x] Sincronizar actividad y cierre entre pestañas sin almacenar identidad ni tokens
  - [x] Unificar cierre manual y automático con `signOut` de Firebase
  - [x] Cargar el controlador después de autenticar para respetar el presupuesto del login
  - [x] Pasar 73 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Validar el aviso móvil, la extensión y la expiración en navegador local acelerado
  - [x] Publicar con autorización explícita en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`

- [x] Paso 79: Recuperar el desplegable Más herramientas
  - [x] Confirmar en producción que el menú se abre pero queda detrás del contenido
  - [x] Elevar el contexto de apilado de la cabecera y conservar overflow visible
  - [x] Validar visibilidad, viewport y clics en 1440, 1024 y 901 px
  - [x] Añadir regresión y pasar 74 pruebas, seguridad, build y rendimiento
  - [x] Publicar con autorización explícita en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`

- [x] Paso 69: Reducir avatar de checkout sin cambiar su apariencia
  - [x] Sustituir el fallback PNG de Sossa por su WebP equivalente
  - [x] Conservar caché revalidable y prueba estática de regresión
  - [x] Publicar `dpl_BBb7maDG5yryEt9oVoRDHBfk9Fq7` y comprobar HTTP 200 WebP

- [x] Paso 68: Reducir revalidaciones de recursos de marca
  - [x] Dar caché revalidable de 24 horas a logo y avatares estáticos
  - [x] Mantener el QR de cobro con revalidación inmediata
  - [x] Publicar `dpl_GGkLyNjoUtnZ738Pu5o3Lkth6K51` y comprobar encabezados HTTP

- [x] Paso 67: Proteger documento interno expuesto como recurso estático
  - [x] Mantener el artefacto local y bloquear su descarga desde producción
  - [x] Añadir una prueba de regresión para la ruta restringida
  - [x] Publicar `dpl_JWLXcr6xskV5o25MseWENZQr5WFv` y verificar respuesta 404

- [x] Paso 66: Retirar prototipos públicos secundarios
  - [x] Eliminar siete prototipos del build, incluidos los conceptos de BEATSS Relay
  - [x] Retirar la página auxiliar pública `reset-local.html`
  - [x] Redirigir permanentemente las ocho URLs heredadas a Inicio
  - [x] Publicar `dpl_9GeU787ZaC8Z8q9YANqEoVhZpBDJ` y validar en móvil
  - [x] Mantener una prueba que limita los HTML públicos del build a Inicio y Clearance

- [x] Paso 65: Corregir recurso de notificaciones del panel de ventas
  - [x] Sustituir `favicon.ico` inexistente por el logo público vigente
  - [x] Proteger la API de notificaciones ausente en algunos navegadores
  - [x] Publicar `dpl_FLW8xCChkr8eATqJVM95shSSUGmz` y validar recurso HTTP 200

- [x] Paso 64: Retirar trabajo residual de Clearance y corregir logos rotos
  - [x] Dejar de registrar el Service Worker de retiro en cada visita
  - [x] Unificar los fallbacks de Clearance, Media Session y PDF en `logo.png`
  - [x] Publicar `dpl_3Liu9pAAzPkeSiTqydHf3aMBz3Xt` y validar 390 px sin 404 ni errores

- [x] Paso 63: Endurecer límite de pedidos pendientes tras proxy
  - [x] Priorizar la IP preservada por Vercel y normalizar el fallback
  - [x] Añadir prueba de regresión de encabezados reenviados
  - [x] Publicar `dpl_DPLuLbNzgdynRuFnvwT1qAtAX7ML` y comprobar endpoint no mutante

- [x] Paso 62: Corregir controles públicos móviles y su accesibilidad
  - [x] Asociar etiquetas reales a los cuatro filtros del catálogo
  - [x] Nombrar búsqueda, género y escala de la tienda para lectores de pantalla
  - [x] Garantizar 44 px en los controles superiores, búsqueda y filtros a 390 px
  - [x] Publicar `dpl_77unbcr5s7FfruLEwpM92TGyvfgS` y validar catálogo/tienda sin overflow ni errores

- [x] Paso 61: Diferir Studio completo para visitantes de rutas privadas
  - [x] Cargar Auth antes que Studio cuando no hay sesión conocida
  - [x] Mantener descargas y retornos transaccionales en arranque completo
  - [x] Publicar `dpl_F3wSGgekXompK2LKomoXjg5bwmmm` y verificar ausencia de Studio/Firestore/Lucide

- [x] Paso 60: Corregir el acceso móvil directo a Studio
  - [x] Cargar el estilo de Auth junto con Auth y no depender de la landing
  - [x] Restaurar tarjeta, pestañas, campos y controles táctiles a 390 px
  - [x] Retirar trazas informativas de Auth y Studio
  - [x] Publicar `dpl_EA97MxLpe9kb9NbnpcTheryQyga9` y validar login/registro sin envío

- [x] Paso 59: Garantizar áreas táctiles públicas de 44 px en móvil
  - [x] Corregir acciones compactas de la landing y su navegación en 320–390 px
  - [x] Ampliar retorno y compartir de la tienda sin alterar su funcionalidad
  - [x] Publicar `dpl_A6hwF4CAUboWq8PvVKpAxW8m268c` y validar Inicio/Tienda

- [x] Paso 58: Compactar los filtros del catálogo público en móvil
  - [x] Mostrar dos columnas a 360–560 px y conservar una a 320 px
  - [x] Verificar el filtrado Dancehall, cuatro/cero overflow y consola limpia
  - [x] Publicar `dpl_3W9sm1T2g7QodnW9psGdtuS5UeP6` y validar 320, 360 y 390 px

- [x] Paso 57: Diferir Lucide completo de las rutas públicas
  - [x] Sustituir los iconos visibles por SVG local mínimo
  - [x] Evitar la precarga del vendor de iconos en catálogo y tienda
  - [x] Publicar `dpl_4Mx8ekxWTgA8pBE5Y6YpWTE6Eexr` y validar el checkout móvil sin pago

- [x] Paso 56: Diferir la landing en catálogo y tiendas públicas
  - [x] Retirar su script y CSS del documento inicial
  - [x] Importarla únicamente para Inicio
  - [x] Publicar `dpl_FX4LZYVhwPPDNqU3TiTxVS3GEmJx` y verificar las tres rutas móviles

- [x] Paso 55: Evitar persistencia local innecesaria de checkout
  - [x] Restringir el registro de metadatos a diagnóstico explícito
  - [x] Mantener inalterado el flujo de compra y los errores reales
  - [x] Publicar `dpl_32FNRmo3W5CZpPnYVSb5ix5rEFn5` y verificar que no crea el registro

- [x] Paso 54: Limitar trazas del checkout en producción
  - [x] Ocultar datos de diagnóstico de la consola pública
  - [x] Conservar errores reales y diagnóstico local explícito
  - [x] Publicar `dpl_7L6Mbg9v1NGrUNBSW8tUsiU2hfjJ` y verificar checkout móvil sin pago

- [x] Paso 53: Evitar que la tienda pública cargue el catálogo global
  - [x] Extraer el resolvedor de portadas a una utilidad pública mínima
  - [x] Mantener catálogo y tienda sin Firebase de datos antes de comprar
  - [x] Publicar `dpl_38vZEHJaibuAwhiTir1mrYjDCKQo` y verificar tienda móvil real

- [x] Paso 52: Corregir los iconos de las rutas públicas
  - [x] Sustituir los controles visibles por Lucide local en catálogo y tienda
  - [x] Cargar Material Symbols únicamente al abrir checkout
  - [x] Publicar `dpl_Hs2uMr1YqjwzR1DLFPX3VnTsrHSf` y verificar 390 px sin errores

- [x] Paso 51: Diferir portadas fuera de la primera vista pública
  - [x] Priorizar la primera portada visible en catálogo y tienda
  - [x] Cargar diferidamente las restantes con decodificación asíncrona
  - [x] Publicar `dpl_3XkkA9tjLDXhsBm1oWdzwVGxdBpT` y validar 390 px sin advertencias

- [x] Paso 50: Separar la tienda pública individual del arranque de Studio
  - [x] Cargar escaparate, filtros, EPK, compartir y WhatsApp sin Firebase de datos
  - [x] Diferir reproductor y checkout hasta que se pulse una tarjeta
  - [x] Mantener tienda a 390 px sin overflow y con cuatro beats
  - [x] Publicar `dpl_FUumtMzpNQG5fXQeyyDH4obJhcDC` y validar el flujo sin pago ni advertencias

- [x] Paso 49: Separar el catálogo global público del arranque de Studio
  - [x] Cargar datos públicos, filtros, portadas y JSON-LD sin Firebase de datos
  - [x] Diferir reproductor y checkout hasta la interacción correspondiente
  - [x] Corregir contraste de títulos en móvil y mantener 390 px sin overflow
  - [x] Publicar `dpl_BAhBZkFNhJ6PeerdVEFPntFPHCrR` y verificar el catálogo real

- [x] Paso 48: Diferir el checkout en la exploración del catálogo
  - [x] Retirar inicialización anticipada que descargaba checkout al abrir catálogo
  - [x] Resolver portada pública sin depender de checkout
  - [x] Cargar checkout sólo al abrir selector de licencia
  - [x] Publicar `dpl_DmrfGDXuD2872s58V2sYhpRtoR8Y` y validar 390 px sin pagos

- [x] Paso 47: Servir carátulas públicas como recursos cacheables
  - [x] Extraer Base64 de catálogo y tienda, sin exponer datos de cobro
  - [x] Validar MIME, Base64 y límite de tamaño en `/api/public-artwork`
  - [x] Mantener checkout con configuración fresca y cachear sólo escaparates públicos
  - [x] Publicar `dpl_EkfiR7nNXY9HGBySjydB9FcdjBHQ` y validar 390 px sin pagos

- [x] Paso 46: Optimizar la transferencia y memoria del catálogo global público
  - [x] Respetar la caché HTTP de 60 segundos en el navegador
  - [x] Normalizar marca de productor por `producerUid` sin exponer pagos
  - [x] Evitar duplicar portadas Base64 dentro del JSON-LD
  - [x] Publicar `dpl_rMLyKWSawU43JQ3EXaGxV823NC6B` y validar móvil/check-out seguro

- [x] Paso 41: Alinear Firebase Web 12.17.1, Firebase Admin 13.6.0, Vite 8.2.1 y runtime Node 22
  - [x] Corregir el fallo de registro de Firebase Auth detectado únicamente en navegador
  - [x] Mantener un árbol coherente de `@firebase/app` y dividir Auth, Firestore y Storage en chunks independientes
  - [x] Evitar Firebase Admin 14.2.0 en Vercel por incompatibilidad CJS/ESM comprobada en la función de cuenta
- [x] Paso 42: Endurecer proveedores y publicar la versión final
  - [x] Exigir firma e idempotencia en PayPal sandbox y live
  - [x] Fijar precio, cupón, comprador y referencia PayPhone en el servidor
  - [x] Ocultar Deuna automáticamente mientras falte `DEUNA_WEBHOOK_SECRET`
  - [x] Impedir sobrescritura de comprobantes de suscripción en Storage
  - [x] Publicar reglas de Firestore y Storage y verificar el release activo
  - [x] Publicar Vercel `dpl_6wdHSvHNZXGgD4TC1nY1qbWk3vo3` y alias `https://beatss.app`
  - [x] Retirar la ruta y el token temporales utilizados para el release de reglas
- [ ] Paso 43: Continuar optimización operativa sin activar métodos incompletos
  - [ ] Configurar el secreto Deuna y completar su sandbox E2E antes de volver a mostrarlo
  - [ ] Completar E2E controlado de transferencia y PayPal manual sin emails reales
  - [x] Confirmar que la corrección automática de las 8 alertas moderadas degrada Firebase Admin a una versión incompatible
  - [ ] Revisar las 8 alertas moderadas transitivas de Google Cloud cuando exista una actualización compatible con Vercel
- [x] Paso 44: Reducir el peso inicial de la portada y añadir límites de regresión
  - [x] Retirar 58,825 bytes de HTML histórico sin referencias activas
  - [x] Reducir la transferencia Lighthouse de la portada de 127,154 a 114,019 bytes
  - [x] Limitar HTML, CSS, JS inicial, app principal y chunks Firebase mediante `npm run performance:check`
  - [x] Integrar el presupuesto dentro de `npm run build` para bloquear regresiones antes de cualquier deploy
  - [x] Validar 320, 360 y 390 px sin overflow, errores de página ni elementos defectuosos en la esquina superior derecha
  - [x] Repetir checkout móvil, carga diferida, 34/34 pruebas Node, 9/9 Python y controles de seguridad
  - [x] Publicar esta optimización con autorización explícita en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`
- [x] Paso 45: Separar el acceso público del arranque completo del Studio
  - [x] Cargar únicamente Firebase Auth, Core e idioma al abrir el modal de acceso
  - [x] Diferir Firestore y Storage hasta cargar el Studio después de autenticar
  - [x] Reducir la transferencia local de abrir "Entrar" de 277,056 a 54,572 bytes
  - [x] Retirar el diccionario completo del modal y reducirlo de 54,572 a 37,071 bytes
  - [x] Añadir prueba estática y presupuesto gzip del chunk de acceso
  - [x] Revalidar panel diferido, checkout móvil, 36/36 pruebas Node, 9/9 Python y seguridad
  - [ ] Publicar esta optimización únicamente después de una nueva autorización explícita

- [x] Paso 80: Rediseñar Licencias y Pedidos dentro del Studio claro
  - [x] Sustituir las tarjetas grises heredadas por superficies blancas con acentos de estado
  - [x] Unificar encabezados, métricas, buscador, acciones, tablas y estados vacíos
  - [x] Corregir el conflicto que mostraba métricas y tablas vacías aunque estuvieran ocultas
  - [x] Convertir las tablas en tarjetas legibles a 390 px sin desbordamiento horizontal
  - [x] Validar ambos diseños con datos sintéticos, estados vacíos y revisión de accesibilidad
  - [x] Aprobar 75/75 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar con autorización explícita en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`

- [x] Paso 81: Dar una dirección propia a cada sección privada
  - [x] Definir rutas canónicas para Inicio, Contrato, Licencias, Beats, Ventas y Pedidos
  - [x] Cubrir también Emails, Facturación, Content ID y Contabilidad
  - [x] Convertir `/studio`, `/misbeats`, `/mis-beats` y `/dashboard` sin romper enlaces guardados
  - [x] Actualizar URL y título al hacer clic antes de cargar datos de la sección
  - [x] Validar clics, pestaña visible y navegación Atrás/Adelante en navegador local aislado
  - [x] Pasar 78/78 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar con autorización explícita en `dpl_4JQh58Yp1kJHZEV6zXyx5xbPTX7g`

- [x] Paso 82: Corregir el Studio comprimido al abrir una ruta privada directa
  - [x] Ubicar explícitamente el panel principal en la columna completa y el editor en su columna lateral
  - [x] Colapsar también la pista lateral cuando el editor está oculto
  - [x] Cubrir el puente responsivo de 901 a 920 px sin franja negra ni desbordamiento
  - [x] Validar Pedidos en 1440, 980, 921, 920, 900, 760 y 390 px
  - [x] Pasar 79/79 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar la corrección en `dpl_ngc8sKpUQSAsTB7jEQGCMA8ynbgM`

- [x] Paso 83: Rediseñar de verdad Licencias y Pedidos con la identidad BEATSS
  - [x] Retirar el encabezado negro, el activo morado y los acentos naranja/verde heredados
  - [x] Unificar navegación, títulos, métricas, acciones y tablas en azul BEATSS, blanco y azul noche
  - [x] Diferenciar Licencias como archivo privado y Pedidos como centro de comercio y entregas
  - [x] Hacer autosuficiente la navegación móvil y eliminar el fondo negro bajo vistas cortas
  - [x] Validar producción a 1440 y 390 px sin desbordamiento horizontal
  - [x] Pasar 79/79 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar el rediseño en `dpl_XymWoLt7W8mHkaRtuVvNS3aQivLw`

- [x] Paso 84: Recuperar los historiales de Licencias y Emails
  - [x] Eliminar la autorreferencia que impedía ejecutar el cargador real de Licencias
  - [x] Consultar licencias de cualquier cuenta autenticada y conservar documentos históricos sin fecha
  - [x] Esperar el render diferido antes de finalizar la carga y mostrar errores de consulta
  - [x] Añadir un control visible para recargar Licencias
  - [x] Restaurar Emails como pestaña principal en escritorio y como opción de Más en móvil
  - [x] Validar una fila sintética, contador, navegación móvil y cero desbordamiento
  - [x] Pasar 80/80 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar el hotfix en `dpl_3AFeKc1FHSwTHQDLB8p4qtngVmkr`

- [x] Paso 85: Reemplazar por completo el diseño del acceso
  - [x] Retirar la composición dividida, el panel promocional azul y sus clases visuales heredadas
  - [x] Crear una tarjeta de acceso original, compacta y autosuficiente con identidad musical propia
  - [x] Conservar los IDs y eventos de inicio de sesión, registro, recuperación, Google y cierre
  - [x] Validar pestañas, contraseña, recuperación segura y cierre sin enviar formularios reales
  - [x] Revisar el render a 1440×1000 y 390×844 sin desbordamiento horizontal
  - [x] Completar auditoría de accesibilidad sin infracciones automáticas
  - [x] Pasar 80/80 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [ ] Publicar únicamente después de una autorización explícita

- [x] Paso 86: Alinear la paleta del acceso con la página BEATSS
  - [x] Retirar negro, rosa, naranja y morado del símbolo, pestañas, botón, bordes y decoración
  - [x] Aplicar azul BEATSS, azul claro, blanco y verde suave sobre una superficie clara
  - [x] Mantener contraste legible sin convertir los textos principales en negro
  - [x] Verificar escritorio y teléfono sin desbordamiento horizontal
  - [x] Publicar con autorización explícita en `dpl_CbaFDmBEku45qDBkPu7fBymPZ7Pn`
  - [x] Verificar `https://beatss.app` en 1440×1000 y 390×844

- [x] Paso 87: Reconstruir Licencias como una biblioteca operativa
  - [x] Sustituir la cuadrícula horizontal de métricas y la gráfica lateral por un panel vertical de lectura
  - [x] Convertir cada fila administrativa en una ficha amplia con jerarquía visual propia
  - [x] Hacer visibles los nombres de las acciones Editar, PDF y Eliminar
  - [x] Integrar la tendencia con la paleta azul de BEATSS y retirar el verde heredado
  - [x] Verificar escritorio y teléfono con datos sintéticos y sin desbordamiento
  - [x] Pasar 80/80 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Mostrar el resultado local antes de publicar
  - [x] Publicar en producción con autorización explícita en `dpl_HPzxsMs1VbpZT6w1stBSxvvCcA4B`

- [x] Paso 88: Reemplazar el sistema activo por agentes BEATSS v2 verificables
  - [x] Auditar 25 roles, cuatro agentes Antigravity históricos y perfiles OpenCode
  - [x] Consolidar funciones en 10 agentes canónicos con aliases compatibles
  - [x] Definir objetivo, riesgo, herramientas, escritura, evidencia y límites por agente
  - [x] Crear cuatro skills nuevas propias de BEATSS sin reutilizar Antigravity Design Expert
  - [x] Crear un perfil OpenCode aislado por agente sobre DeepSeek V4 Flash
  - [x] Bloquear escritura en pagos, seguridad, derechos, SRI y Obsidian
  - [x] Pasar 27/27 pruebas, auditoría 10/10, seguridad, build y rendimiento
  - [x] Probar en vivo los contratos de diseño y comercio con entradas sintéticas
  - [x] Documentar arquitectura, funciones, compatibilidad y límites
  - [x] Conservar cambios y agentes históricos sin desplegar ni producir efectos externos

- [x] Paso 89: Eliminar la regresión que devolvía Inicio al tema negro
  - [x] Confirmar la dependencia accidental entre el Studio y los tokens de la portada pública
  - [x] Crear un tema privado autocontenido y limitado a `#app-container.saas-workspace`
  - [x] Fijar el área autenticada al sistema claro vigente y retirar el interruptor oscuro heredado
  - [x] Añadir una prueba que cubre orden de carga, alcance y totalidad de tokens privados
  - [x] Verificar colores calculados en un arranque directo que conserva el tema global oscuro
  - [x] Pasar 81/81 pruebas Node, 30/30 Python, seguridad, build y rendimiento
  - [x] Publicar con autorización explícita en `dpl_HPzxsMs1VbpZT6w1stBSxvvCcA4B`

- [x] Paso 90: Aclarar el estado SRI y mejorar la lectura de cada licencia
  - [x] Confirmar que `PROCESANDO` agrupaba estados pendientes y de contingencia del comprobante SRI
  - [x] Sustituir el texto ambiguo por `PENDIENTE SRI` y `EN COLA SRI` con explicación contextual
  - [x] Mantener el estado SRI separado del pago, la licencia y la entrega
  - [x] Reequilibrar título, datos, referencia, fecha, valor, estado y acciones
  - [x] Usar números tabulares y permitir que referencias largas se partan en móvil
  - [x] Añadir una barrera contra regresiones tipográficas y semánticas
  - [x] Pasar 81/81 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [ ] Publicar únicamente después de una nueva autorización explícita

- [x] Paso 91: Hacer visible todo el carril de resumen de Licencias
  - [x] Confirmar que el carril fijo era más alto que el espacio útil del navegador
  - [x] Retirar el comportamiento sticky que atrapaba `Ingresos mensuales` fuera de la ventana
  - [x] Mantener métricas, tendencia y gráfica dentro del desplazamiento normal de la página
  - [x] Evitar una barra de desplazamiento interna o contenido recortado
  - [x] Añadir una prueba que impide restaurar accidentalmente el carril sticky
  - [x] Pasar 81/81 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [ ] Publicar únicamente después de una nueva autorización explícita

- [x] Paso 92: Reconstruir la presentación del catálogo privado de Beats
  - [x] Recuperar la carátula predeterminada configurada como miniatura para la cuenta de Sossa
  - [x] Priorizar la portada propia de cada beat antes del respaldo del productor
  - [x] Sustituir las tarjetas verticales grises por fichas horizontales blancas
  - [x] Mostrar nombre, BPM, escala, género, etiquetas y estados separados de MP3, WAV y Stems
  - [x] Hacer visibles y accesibles Usar en licencia, Editar, Eliminar y Reproducir
  - [x] Rediseñar cabecera, búsqueda, filtros, conteos y estado vacío del catálogo
  - [x] Verificar visualmente 1440×1000 y 390×844 con datos sintéticos
  - [x] Pasar 82/82 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [ ] Publicar únicamente después de una nueva autorización explícita

- [x] Paso 93: Corregir la identidad de la miniatura de Sossa
  - [x] Confirmar que `/producer_sossa.webp` es la foto de perfil y no la carátula de beats
  - [x] Verificar de forma pública y sólo lectura la carátula predeterminada cuadrada de 500×500
  - [x] Priorizar portada del beat, configuración cargada y copia local verificada, en ese orden
  - [x] Conservar una copia local de la misma carátula para evitar tarjetas vacías por latencia de red
  - [x] Usar el logo BEATSS únicamente si la carátula real no puede cargarse
  - [x] Centrar la carátula cuadrada sin el recorte vertical de la antigua foto de perfil
  - [ ] Publicar únicamente después de una nueva autorización explícita

- [x] Paso 94: Preparar BEATSS para operar con varios productores sin mezclar datos
  - [x] Exigir consentimiento versionado, contraseña reforzada y verificación de correo en cuentas nuevas
  - [x] Crear onboarding, almacenamiento Firebase y slug de tienda único por productor
  - [x] Retirar lectura anónima de la configuración completa y servir una proyección pública saneada
  - [x] Migrar DNI, configuración fiscal, cobros, certificados y credenciales a `private_config`
  - [x] Impedir que contratos nuevos hereden la identidad legal de Sossa
  - [x] Habilitar Stripe por productor de plataforma o cuenta Connect y cerrar proveedores incompletos
  - [x] Retirar fallbacks compartidos de email y pagos, y simulaciones visibles sin configuración
  - [x] Alinear el plan Inicial en cinco licencias mensuales y el almacenamiento predeterminado en Firebase
  - [x] Añadir solicitud autenticada y reversible de eliminación de cuenta
  - [x] Sustituir estados de servicio inventados por información verificable
  - [x] Pasar 94/94 pruebas Node, 30/30 Python, seguridad, build y rendimiento
  - [x] Ejecutar las reglas con Firebase Emulator: 8/8 casos correctos
  - [x] Configurar el productor Stripe de plataforma y completar pago sandbox con evidencia de webhook, licencia y entrega
  - [x] Verificar la configuración de correo de Sossa con entrega `.test` aislada y sin salida a EmailJS
  - [x] Publicar aplicación y reglas con autorización explícita
  - [ ] Completar el onboarding Stripe Connect individual de cada productor externo antes de habilitarle tarjetas
  - [ ] Activar alertas persistentes y formalizar el procedimiento humano de eliminación y retención legal

- [x] Paso 95: Cerrar Stripe sandbox y la entrega transaccional en producción
  - [x] Restringir el cobro de plataforma al productor Sossa mediante variable sensible de Vercel
  - [x] Confirmar que la Checkout Session es `cs_test_` antes de usar la tarjeta oficial de prueba
  - [x] Completar una compra básica de `Diamond` sin cargo real
  - [x] Verificar `checkout=fulfilled`, evento webhook, pago aprobado, PaymentIntent y trabajo SRI en cola
  - [x] Verificar la licencia aprobada en la subcolección privada del productor
  - [x] Corregir el arranque del retorno Stripe para que cargue el flujo de contrato y entrega
  - [x] Aceptar el data URI PDF real de html2pdf conservando Base64, límite y firma `%PDF`
  - [x] Guardar y descargar un PDF válido de 2,946,639 bytes desde Firebase Storage
  - [x] Registrar el correo sintético como `sandbox_complete` sin llamar a un proveedor externo
  - [x] Obtener el MP3 firmado y registrar una descarga de licencia en el historial
  - [x] Pasar 97/97 pruebas Node, 30/30 Python, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar Vercel `dpl_7FbhaDyYMUT9LGYVo7v5tvNnmDrY` y reglas Firestore/Storage
  - [x] Verificar portada, catálogo y acceso en 1440×1000 y 390×844 sin overflow ni errores de consola

- [x] Paso 96: Recuperar la vista previa del contrato
  - [x] Confirmar que la hoja vacia era causada por `activeTemplates` fuera del alcance de `editor.js`
  - [x] Inicializar plantillas predeterminadas dentro del modulo editor antes del primer render
  - [x] Sincronizar las personalizaciones con la interfaz global compatible
  - [x] Añadir y comprobar en rojo/verde una barrera contra la regresion modular
  - [x] Generar en Chrome un contrato sintetico con contenido HTML, texto y Markdown sin errores
  - [x] Pasar 98/98 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar con autorizacion explicita en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`

- [x] Paso 97: Corregir las acciones de avance del asistente de contrato
  - [x] Mantener fondo azul con texto e icono blancos en Continuar para los pasos 1 y 2
  - [x] Impedir que una regla global de la barra lateral oscurezca la etiqueta del CTA
  - [x] Ocultar Continuar por completo al llegar al paso 3 Entrega
  - [x] Dejar Editar datos como unica accion de navegacion y a todo el ancho disponible
  - [x] Comprobar la regresion en ciclo rojo/verde y render calculado de escritorio y movil
  - [x] Pasar 99/99 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar con autorizacion explicita en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`

- [x] Paso 98: Compactar las acciones finales de Entrega
  - [x] Reducir los controles sobredimensionados sin bajar de 44 px de area tactil
  - [x] Distribuir PDF y correo en una fila, y Copiar y Guardar en otra
  - [x] Mantener Limpiar campos como accion secundaria a todo el ancho
  - [x] Retirar margenes, sombras y rellenos heredados que alargaban el pie
  - [x] Verificar un pie de 238 px en escritorio y 234 px en movil
  - [x] Pasar 100/100 pruebas Node, seguridad, build y presupuesto de rendimiento
  - [x] Publicar con autorizacion explicita en `dpl_Bs7h3hzcuvj8DLUUycWRBppEzZWJ`

- [x] Paso 99: Verificar la publicación antes de una nueva compra Stripe sandbox
  - [x] Confirmar Vercel `READY`, destino `production` y alias `https://beatss.app`
  - [x] Confirmar HTTP 200 en Inicio, Contrato y la tienda pública de Sossa
  - [x] Confirmar que el webhook rechaza GET con HTTP 405 y conserva su ruta POST
  - [x] Confirmar que la tienda publica Stripe habilitado y tres beats disponibles
  - [x] Confirmar en el CSS servido el texto blanco, la desaparición de Continuar en Entrega y el pie compacto
  - [x] Completar una nueva compra sintética y verificar webhook, pago, licencia y entrega
    - Compra sandbox de `Magic`, licencia básica de USD 30, ejecutada el
      2026-09-11 (Ecuador) con identidad `.test` y sin cargo ni correo real.
    - Webhook Stripe POST y `session-status` respondieron HTTP 200; pago
      `approved`, PaymentIntent presente, licencia privada visible y trabajo SRI
      en `PENDIENTE_AUTORIZACION`.
    - PDF válido de 2,934,264 bytes; MP3 firmado respondió HTTP 206
      `audio/mpeg` y su descarga quedó registrada.

- [x] Paso 100: Reconstruir la tienda pública de Sossa con la identidad clara de BEATSS
  - [x] Aislar la tienda del tema oscuro heredado mediante una hoja propia cargada sólo en `/tienda/:productor`
  - [x] Crear una portada comercial blanca y azul con propuesta de valor, confianza, perfil de Sossa y conteo de catálogo
  - [x] Rediseñar filtros y tarjetas con carátulas reales, datos legibles, precio y una llamada a compra clara
  - [x] Convertir el checkout y las opciones de licencia a superficies claras sin texto blanco incrustado
  - [x] Conservar controles táctiles de 44 px o más y una columna sin desbordamiento a 390 px
  - [x] Verificar escritorio, móvil y checkout con cuatro beats y datos sintéticos, sin compras ni emails
  - [x] Pasar 101/101 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar con autorización explícita en `dpl_DPM2e4sxe7NCPkwfhzxuJ7WQaZyK`
  - [x] Verificar `https://beatss.app/tienda/sossa` en escritorio y móvil con cuatro beats, tema claro y cero errores

- [x] Paso 101: Hacer la tienda pública más directa y compacta
  - [x] Reducir la portada a un mensaje de tres acciones: escuchar, elegir y lanzar
  - [x] Acercar el catálogo reduciendo espacios, títulos y controles secundarios
  - [x] Mostrar cuatro fichas compactas por fila en escritorio
  - [x] Convertir cada beat móvil en una ficha horizontal con carátula, precio, reproducción y compra
  - [x] Limitar etiquetas decorativas y conservar sólo los datos útiles para decidir
  - [x] Mantener acciones táctiles de 44 px, tema claro y cero desbordamiento
  - [x] Pasar 101/101 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar con autorización explícita en `dpl_rUJ3W6t5cro1PkKxfkNBmGNVK51v`
  - [x] Verificar la versión activa en escritorio y móvil desde `https://beatss.app/tienda/sossa`

- [x] Paso 102: Reparar la aceptación legal del checkout público
  - [x] Sustituir el enlace roto que dependía del Studio por documentos legales autocontenidos en la tienda pública
  - [x] Separar el checkbox de los botones para evitar interacciones ambiguas y mejorar el acceso por teclado
  - [x] Añadir vistas legibles para Términos de Servicio y para el resumen dinámico de la licencia seleccionada
  - [x] Mostrar estados Pendiente, Aceptado y error junto al control, con foco y anuncio accesible
  - [x] Mantener libre la navegación del asistente y bloquear únicamente las acciones de pago sin aceptación
  - [x] Evitar que Deuna o PayPhone se preparen antes del paso final de pago
  - [x] Verificar escritorio y móvil con datos sintéticos, sin desbordamiento, compras ni correos
  - [x] Pasar 101/101 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar con autorización explícita en `dpl_EXJ8Z6KLnTCyWXHF1ioEovbcTNkg`
  - [x] Verificar la versión servida desde `https://beatss.app/tienda/sossa` en escritorio y móvil

- [ ] Paso 103: Integrar Google Drive central para los archivos pesados de BEATSS
  - [x] Conservar sin migraciones la consola, Google Cloud, Firebase y Firestore de la cuenta administrativa existente
  - [x] Reservar Firebase para usuarios, pedidos, pagos, licencias y contratos transaccionales
  - [x] Reactivar `gdrive-central` para Sossa sin exponer Client Secret ni refresh token al navegador
  - [x] Limitar la vinculación a la cuenta `sossamusic@gmail.com` y al administrador de la plataforma
  - [x] Crear carpetas aisladas por productor y validar nombre, extensión y tamaño antes de subir
  - [x] Mantener Firebase Storage como respaldo seguro si Drive no está disponible
  - [x] Servir previews y entregas de Drive mediante URLs controladas y firmadas
  - [x] Guardar en Vercel Production el Client ID y Client Secret del cliente OAuth existente sin exponer sus valores
  - [x] Publicar la integración segura en `dpl_3gXCdoAEgKyo7TifoFkPemMD83P2` y verificar `READY`, HTTP 200 y protección 401 del endpoint
  - [x] Forzar el acceso de Google a la cuenta de almacenamiento configurada sin reutilizar la sesión administrativa
  - [ ] Autorizar `sossamusic@gmail.com` únicamente como almacenamiento de Drive
  - [ ] Publicar y comprobar una carga real autorizada sin ejecutar compras ni enviar correos

- [x] Paso 104: Reparar la superficie de Inicio y recuperar Configuración
  - [x] Ocultar el documento legal mediante estado HTML nativo en todas las rutas
  - [x] Mantener apertura, cierre, foco, `inert` y `aria-hidden` del diálogo legal
  - [x] Añadir Configuración a Más herramientas en escritorio y tablet
  - [x] Añadir Configuración al menú Más de la navegación móvil
  - [x] Verificar visualmente acceso, Inicio y menú móvil a 390 px sin datos reales
  - [x] Pasar 106/106 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar en `dpl_BYBHSgkxoroHvAstQrmzLWEYe3hC` y verificar HTTP 200, diálogo legal oculto y Configuración presente en `https://beatss.app/inicio`

- [x] Paso 105: Ordenar visualmente el menú Más herramientas
  - [x] Dar al desplegable un ancho adaptable que conserve las etiquetas en una línea
  - [x] Unificar filas, iconos, espaciado y estados interactivos con el diseño claro de BEATSS
  - [x] Renombrar Content ID y Contabilidad con etiquetas coherentes en español
  - [x] Cerrar el menú después de seleccionar una herramienta
  - [x] Pasar 106/106 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [x] Publicar en `dpl_2gwxUsz25kE3ocUUSdKgXNv77bbK` y verificar etiquetas y estilos servidos por producción

- [ ] Paso 106: Proteger datos privados del panel de Configuración
  - [x] Enmascarar Client ID, tokens, cuentas y datos privados al abrir el modal
  - [x] Añadir una acción accesible para mostrar u ocultar temporalmente los valores
  - [x] Volver a ocultar todos los valores al cerrar Configuración
  - [x] Retirar el Client ID de Google de la respuesta normal de estado de Drive
  - [x] Solicitar el Client ID sólo al iniciar voluntariamente la vinculación OAuth
  - [x] Pasar 107/107 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [ ] Publicar y verificar en producción con autorización explícita

- [ ] Paso 107: Rediseñar la interfaz completa de Ventas
  - [x] Retirar tarjetas negras, degradados y utilidades visuales heredadas
  - [x] Crear una cabecera visible con período, recarga y exportación accesibles
  - [x] Ordenar seis métricas compactas en una cuadrícula clara y adaptable
  - [x] Unificar gráficos, ranking y compradores con el azul vigente de BEATSS
  - [x] Integrar Copilot como un panel claro sin cambiar su lógica ni sus IDs
  - [x] Verificar 1440 y 390 px sin desbordamiento ni tarjetas oscuras
  - [x] Pasar 108/108 pruebas Node, seguridad, build, rendimiento y `diff --check`
  - [ ] Publicar y verificar en producción con autorización explícita

- [x] Paso 108: Rediseñar el selector de métodos de pago del checkout público
  - [x] Dar a los métodos visibles un ancho equilibrado y adaptable
  - [x] Unificar iconos, títulos, descripciones y estado seleccionado
  - [x] Verificar escritorio y móvil sin crear pedidos ni cobros
  - [x] Pasar 29/29 pruebas relacionadas, seguridad, build, rendimiento y `diff --check`
  - [x] Sustituir el monograma provisional por el logotipo oficial de Stripe
  - [x] Publicar con autorización explícita en `dpl_8zHz8okwDmb1hCBzbsUeydzVQ2cB` y verificar HTTP 200, selector visible y SVG oficial idéntico

- [x] Paso 109: Activar Stripe Live para Sossa sin ejecutar un cobro real
  - [x] Confirmar en Stripe que pagos y retiros están activos
  - [x] Crear el destino `BeatSS Checkout producción` para `checkout.session.completed` y `checkout.session.async_payment_succeeded`
  - [x] Registrar en Vercel Production `STRIPE_SECRET_KEY` y `STRIPE_WEBHOOK_SECRET` sin leer ni documentar sus valores
  - [x] Redesplegar con autorización explícita en `dpl_AMxeSCGm5LjhNhMMfkiGuJaRMiEN`
  - [x] Verificar estado `READY`, destino `production` y alias `https://beatss.app`
  - [x] Confirmar HTTP 200 en la tienda y HTTP 405 esperado ante GET del webhook
  - [x] Abrir `Magic · Licencia Básica` por USD 30 en Stripe Checkout con sesión `cs_live_`, sin introducir tarjeta ni efectuar un cobro
  - [x] Conservar como evidencia E2E sin dinero real la compra sandbox ya cerrada en el Paso 99
## Paso 110: Entrega Stripe independiente del regreso del comprador — COMPLETADO

- [x] Hacer que el webhook complete o programe la entrega sin depender de `checkout.js`.
- [x] Garantizar idempotencia ante webhook y consulta de retorno concurrentes.
- [x] Cubrir reintentos y estados de error recuperables sin duplicar licencias, correos o SRI.
- [x] Añadir pruebas del caso en que el comprador paga y cierra la pestaña.
- [x] Ejecutar pruebas relacionadas, build, seguridad y revisión de secretos antes de publicar.
- [x] Verificar producción sin ejecutar un cobro real; una venta real seguirá siendo la única evidencia de entrega Live real.

### Evidencia de cierre del Paso 110

- El webhook envía un portal privado inmediatamente después del pago y Stripe
  recibe HTTP 500 si la notificación queda pendiente, de modo que conserva sus
  reintentos automáticos.
- Una transacción Firestore con arrendamiento temporal evita correos duplicados
  ante webhooks o retornos concurrentes.
- Un carrito de varios beats produce un solo correo con todos sus enlaces, sin
  exceder el límite de envío de EmailJS por cada elemento.
- Vercel ejecutará diariamente `/api/payments/stripe/retry-deliveries`, protegido
  mediante `CRON_SECRET`, para recuperar pagos abiertos o entregas pendientes.
- Verificación: 126/126 pruebas Node, `npm run security:check`, `npm run build`,
  presupuesto de rendimiento y `git diff --check` correctos.
- Despliegue `dpl_616gKHYZajzdgaNfeYNGf5v2xLAZ` `READY` en producción y alias
  `https://beatss.app`; tienda HTTP 200, webhook GET HTTP 405 y cron sin secreto
  HTTP 401. No se realizó un cobro real ni se envió un correo real.
- EmailJS quedó respaldado mediante identificadores de servidor en Vercel; el
  webhook no depende de los campos privados del productor para notificar.

## Paso 111: Validar la primera compra Stripe Live — COMPLETADO

- [x] Confirmar que Stripe Live y el destino de webhook están activos.
- [x] Confirmar que la tienda crea una sesión `cs_live_` y que la sesión abierta
  permanece `open/unpaid` mientras no se introduce una tarjeta.
- [x] Confirmar que el cron de recuperación está registrado en Vercel.
- [x] Confirmar que la configuración server-only de EmailJS está completa.
- [x] Corregir y verificar el precio básico visible y la exclusión canónica de
  beats vendidos/no publicados antes del cobro Live.
  - [x] Implementar la corrección local y validar 61/61 pruebas relacionadas,
    seguridad, build, presupuesto y formato.
  - [x] Publicar con autorización explícita y comprobar la tienda Live
    (`dpl_3TnaLKiUoZZuhUPAxRsrDm8h8puJ`).
- [x] Separar previews públicos de archivos de entrega y completar el
  catálogo público de Sossa.
  - [x] Verificar Studio: 14 beats, 14 MP3 de entrega, 13 WAV y 13 stems.
  - [x] Verificar tienda Live inicial: Magic, Now y OOUUHH son los únicos tres con
    preview público; el MP3 privado de Haze y los demás no responde sin
    autorización (HTTP 403), por lo que no debe reutilizarse como preview.
  - [x] Añadir el flujo explícito de preview público separado del MP3 de
    entrega y conservar los controles de disponibilidad de Stripe.
  - [x] Confirmar que las 14 subcolecciones privadas ya tenían un campo
    `preview` dedicado, incluido Bubble; no se publicó ni se reutilizó ningún
    MP3/WAV/stems de entrega.
  - [x] Publicar y comprobar por endpoint y visualmente los 14 beats
    disponibles: 14 respuestas de audio HTTP 206, reproductor y selector de
    licencias funcionales, con precio base uniforme de USD 30.
- [x] Completar una compra Live controlada con autorización del titular.
  - [x] La sesión Live confirmó `complete/paid` sin exponer su identificador.
- [x] Verificar en Stripe Dashboard la entrega del evento y su HTTP 200.
  - El destino activo reveló tres respuestas HTTP 400 de firma no válida para
    el evento Live. Se actualizó su secreto correspondiente en Vercel
    Production, se publicó `dpl_34hRDd19RYqAY8VDZLUMaQbD6tL3` y el reenvío
    manual quedó `Entregado / Recuperado` con HTTP 200; Vercel también
    registró el POST con HTTP 200 en producción.
  - El retorno de estado posterior conserva una sola entrega de la compra, por
    lo que el reenvío no duplicó cobro, licencia ni notificación.
- [x] Verificar pago/licencia, una entrega, portal, archivos y PDF reales.
  - [x] Pago aprobado, licencia válida y entrega `sent` en Firestore.
  - [x] Portal y API firmada HTTP 200; PDF de cuatro páginas íntegro y MP3
    privado HTTP 206 `audio/mpeg`.
  - [x] La licencia Básica sólo habilita MP3; WAV y stems se mantienen
    bloqueados.
  - [x] 163/163 pruebas completas de regresión y build aprobados.
  - [x] EmailJS aceptó la entrega. La lectura en la bandeja del comprador no
    puede medirse desde BEATSS, pero el portal firmado permanece disponible.
# Paso 115 — Nombre comercial seguro para descargas de audio — LISTO LOCALMENTE

- [x] Corregir `proxy-audio.mp3` para que los archivos comprados se guarden con el
  titulo real del beat, el productor y el formato entregado.
- [x] Obtener el nombre de fuentes autoritativas en Firestore; no confiar en texto
  suministrado por la URL firmada.
- [x] Mantener reproduccion movil, solicitudes `Range`, firmas y controles de
  acceso. Validar nombres con caracteres especiales y tipos MP3/WAV/stems.
- [x] No publicar sin autorizacion expresa.
- [x] Publicado con autorizacion en Vercel; despliegue
  `dpl_8oMoGuaBHPMMiKZWvKdWPTQRge95` en estado `READY` y alias
  `https://beatss.app`.
