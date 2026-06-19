# Reglas de Comportamiento y Memoria del Proyecto - BEATSS

Estas reglas definen el contexto operativo y las decisiones de diseño aprobadas por el usuario para la plataforma BEATSS. Los agentes que trabajen en este repositorio deben seguir estas directrices de forma estricta.

---

## 💳 1. Pasarelas de Pago Activas y Restricciones
*   **Stripe Deshabilitado:** Stripe no está disponible ni configurado para la cuenta del productor principal. **Bajo ninguna circunstancia se debe sugerir, reintroducir o intentar integrar Stripe en el checkout o en el backlog de mejoras de cobros.**
*   **Pasarelas Habilitadas:** Las únicas pasarelas activas para transacciones son **PayPhone** (cobro con tarjetas) y **Deuna!** (cobro con QR y transferencias locales).
*   **Deuna! Negocios Activo:** El productor principal cuenta con cuenta activa de Deuna! Negocios asociada a su RUC.
    *   La automatización opera a través de códigos QR dinámicos autogenerados con el ID de compra (`BEATSS-{purchaseId}`).
    *   El procesamiento del pago se confirma mediante notificaciones webhooks enviadas a `/api/payments/deuna/webhook`.

---

## 🧾 2. Facturación Electrónica SRI y Privacidad
*   **Dirección Matriz Protegida:** Para proteger la privacidad del productor (Joao David Dominguez / Sossa), las facturas electrónicas y los contratos de licencia **nunca deben mostrar la dirección real de su domicilio**.
*   **Dirección Oficial del Emisor:** La dirección del emisor registrada por defecto en el facturador y contratos debe ser **"Quito - Ecuador"**. Esta configuración ya ha sido validada y es técnicamente aceptada por el validador del SRI.

---

## ⚙️ 3. Configuración y Credenciales del Productor
*   **Productor Principal:** Sossa (`sossabeatz1@gmail.com`).
*   **Resguardos de Seguridad (Firestore):** Las credenciales de APIs, claves de firmas electrónicas (`.p12` / `.pfx`) y contraseñas asociadas se almacenan estrictamente bajo la subcolección privada `/users/{uid}/private_config/producer`. Nunca deben exponerse en la configuración pública `/users/{uid}/config/producer`.
