# Pasarelas de Pago Integradas en BEATSS

Este módulo documenta las integraciones y flujos de cobro soportados en la plataforma.

## 💰 Pasarelas Activas

### 1. PayPal (Suscripciones y Legacy Checkout)
*   **Identificador del Plan Pro:** Configurado en `paypalPlanIdPro` (admin config).
*   **Identificador del Plan Elite:** Configurado en `paypalPlanIdElite` (admin config).
*   **Endpoints del Backend:**
    *   `/api/activate-pro`: Valida órdenes y suscripciones contra la API oficial de PayPal.
*   **Manejo Seguro de Credenciales:**
    *   Leídas de `admin_config` desde Firestore y variables de entorno del `.env`.

### 2. PayPhone (Tarjetas de Crédito / Débito)
*   **Confirmación de Transacciones:**
    *   `/api/payments/payphone/confirm`: Flujo de compra directa de licencias.
    *   `/api/payments/payphone/subscription/confirm`: Flujo de suscripción a planes.
*   **Endpoints de API Externa:**
    *   `POST https://pay.payphonetodoesposible.com/api/button/V2/Confirm` para validar el estado `Approved` de la transacción.

### 3. Deuna! (Billetera Digital - Ecuador)
*   **Generación de QR Dinámico:**
    *   `/api/payments/deuna/qr`: Retorna un QR de Google Charts con el deeplink `deuna://payment?...`.
*   **Webhook de Notificación:**
    *   `/api/payments/deuna/webhook`: Escucha y valida firmas del webhook de Deuna! para confirmar la transacción en Firestore.

---
*Relacionado:* [[docs/30_SRI/README]] | [[Dashboard BEATSS]]
