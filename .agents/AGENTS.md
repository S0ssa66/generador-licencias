# Reglas de Comportamiento y Memoria del Proyecto - BEATSS

Estas reglas definen el contexto operativo de la plataforma BEATSS. La dirección visual todavía está en exploración y no se considera aprobada ni definitiva.

## 🎨 Estado experimental del diseño
*   No tratar ninguna paleta, layout, sistema de componentes o regla de UI existente como definitiva hasta que Sossa apruebe explícitamente un diseño.
*   Mientras el diseño esté en exploración, se permite rehacer ampliamente la presentación de landing, workspace, catálogo, checkout y móvil para comparar propuestas.
*   La prioridad es que todas las vistas compartan una composición coherente y legible: nunca mezclar texto oscuro sobre superficies oscuras, fondos negros heredados con paneles claros, ni acentos incompatibles sin una razón visual clara.
*   Conservar siempre IDs, eventos, formularios, autenticación, pagos, generación de PDF, historial y entregas; el rediseño no autoriza cambiar la lógica de negocio.
*   Registrar las propuestas como experimentales. No convertir una propuesta en tokens, reglas permanentes o documentación de diseño aprobada hasta recibir confirmación de Sossa.

---

## 💳 1. Pasarelas de Pago Activas y Restricciones
*   **Stripe Activo:** La cuenta Stripe de Sossa está activa y la antigua espera por la constitución de una LLC ya no aplica. BEATSS integra Stripe Checkout, webhook firmado, registro del pago, licencia y entrega. Antes de cada prueba o cobro se debe confirmar explícitamente si las credenciales vigentes son de prueba o Live; nunca inferir el modo por la interfaz.
*   **Disponibilidad por productor:** Sossa puede cobrar mediante la cuenta Stripe de plataforma configurada. Los demás productores sólo pueden habilitar tarjetas después de completar y verificar su propia cuenta Stripe Connect; no usar la cuenta de Sossa como respaldo compartido.
*   **Otras pasarelas habilitadas:** **PayPal Live** (para suscripciones recurrentes de productores), **PayPhone** (para cobros con tarjetas) y **Deuna!** (para cobros locales con QR dinámico).
*   **Deuna! Negocios Activo:** El productor principal cuenta con cuenta activa de Deuna! Negocios asociada a su RUC.
    *   La automatización opera a través de códigos QR dinámicos autogenerados con el ID de compra (`BEATSS-{purchaseId}`).
    *   El procesamiento del pago se confirma mediante notificaciones webhooks enviadas a `/api/payments/deuna/webhook`.

---

## 🧾 2. Facturación Electrónica SRI y Privacidad
*   **Dirección Matriz:** Por instrucción expresa de Sossa (2026-09-23), la dirección de emisor en las facturas debe ser la dirección de matriz que consta en su RUC vigente. No reemplazarla por una ciudad genérica ni incrustarla en código público; mantenerla en la configuración privada del productor. Esta dirección se reflejará en las facturas entregadas a clientes.

---

## ⚙️ 3. Configuración y Credenciales del Productor
*   **Productor Principal:** Sossa (`admin@sossamusic.com`, con alias de acceso vigentes: `masterjuego25@gmail.com` y `sossabeatz1@gmail.com`).
*   **Resguardos de Seguridad (Firestore):** Las credenciales de APIs, claves de firmas electrónicas (`.p12` / `.pfx`) y contraseñas asociadas se almacenan estrictamente bajo la subcolección privada `/users/{uid}/private_config/producer`. Nunca deben exponerse en la configuración pública `/users/{uid}/config/producer`.

---

## 🧠 4. Memoria de Contexto y Persistencia
*   **Fuente operativa:** `AGENTS.md` en la raíz es el índice vigente. Al iniciar, leer `CODEX_HANDOFF.md`, `task.md` y estas reglas; consultar `Memoria del Proyecto.md` y `Dashboard BEATSS.md` solo cuando la tarea requiera antecedentes o navegación documental.
*   **Rutas vigentes:** La raíz actual es `/Users/sossa/Documents/Codex/BeatSS`. Las rutas de `/Users/sossa/IA/generador-licencias` son históricas y no deben usarse para leer ni escribir.
*   **Uso del Servidor MCP `memory`:** El agente debe usar el servidor `@modelcontextprotocol/server-memory` para almacenar y consultar hechos, hitos y variables críticas del usuario de forma persistente entre conversaciones.

---

## 🛠️ 5. Servidores MCP Habilitados (Herramientas de Agente)
Los siguientes conectores son referencias de configuración del proyecto. Antes de usarlos, el agente debe confirmar que están disponibles y autenticados en la sesión actual:
*   **`google-cloud-drive`**: Para buscar, organizar y descargar archivos en la nube del productor.
*   **`sqlite`**: Conectado a `sri_contingency.db` para consultar la cola de contingencia del SRI.
*   **`paypal`**: Conectado al entorno Sandbox para pruebas de cobros y facturación.
*   **`puppeteer`**: Para automatizar y realizar pruebas visuales E2E del checkout y landing page.
*   **`vercel`**: Para monitorizar deploys, logs y estado de la web en producción.
*   **`sentry`**: Para monitorización de excepciones y depuración de errores.
*   **`git`**: Para control de versiones local e inspección rápida de diffs.
*   **`stripe`**: (Placeholder) En espera para la facturación centralizada tras obtener la LLC.
*   **`github`, `email`, `slack`**: (Placeholders) Disponibles para conectarse a sus respectivos servicios.
