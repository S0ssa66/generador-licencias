---
tipo: memoria_desarrollo
proyecto: BEATSS
estado: activo
ultima_revision: 2026-07-02
---
# 🧠 Memoria del Proyecto - BEATSS

Esta nota actúa como la memoria persistente de desarrollo de BEATSS. Tanto tú (desde Obsidian) como yo (el asistente de IA) podemos consultar y actualizar este archivo para que no se pierda el contexto entre sesiones o compactaciones de historial.

---

## 💳 1. Pasarelas de Pago Activas
*   **Stripe Deshabilitado:** No está disponible ni se debe reintroducir para esta cuenta.
*   **PayPhone:** Activo para cobros con tarjetas de crédito/débito.
*   **Deuna! Negocios:** Activo para cobros mediante códigos QR dinámicos y transferencias.
    *   **Identificador de Compra:** Formato `BEATSS-{purchaseId}`.
    *   **Webhook de Pago:** `/api/payments/deuna/webhook` para procesar la confirmación automática en tiempo real.

---

## 🧾 2. Facturación Electrónica SRI y Privacidad
*   **Dirección Oficial del Emisor:** **"Quito - Ecuador"** (registrado así en el facturador y los contratos de licencia para proteger la privacidad del domicilio del productor).
*   **Datos del Productor:**
    *   **Nombre:** Joao David Dominguez (Sossa)
    *   **Email:** `sossabeatz1@gmail.com`
    *   **Base de Datos:** Firestore en el proyecto `licencias-musicales`.
    *   **Credenciales Privadas:** Almacenadas de forma segura en Firestore en `/users/{uid}/private_config/producer`. No deben exponerse en archivos locales ni configs públicas.

---

## ⚙️ 3. Configuración del Entorno de Desarrollo
*   **Servidor Local:** Corriendo en `http://localhost:8000` (`server.py`) o `http://localhost:5173` (`npm run dev`).
*   **Google Auth (Firebase Auth):**
    *   `localhost` está autorizado por defecto en Firebase Console para desarrollo local (permite probar Google Login en cualquier puerto como `:5173` o `:8000`).
    *   `beatss.app` está plenamente autorizado para el entorno de producción.
    *   Las URLs dinámicas de previsualización de Vercel (`*-vercel.app`) están bloqueadas por las restricciones de origen dinámico de Google.
*   **Frontend Assets:** Compilados mediante Vite (`npm run build`) en la carpeta `/dist/` y servidos por el servidor Python.
*   **Base de Datos:** Firestore (Firebase).

---

## 📌 4. Notas de la Última Sesión
*   Validamos que el webhook de Deuna! (`server.py`) extrae correctamente el `purchaseId` del JSON anidado enviado por el Banco Pichincha.
*   Creamos las guías de configuración en `docs/10_Pagos/` (`guia_configuracion_deuna_negocios.md` y `guia_facturacion_sri.md`).
*   El usuario pospuso la prueba en vivo del portal de desarrollo de Deuna! hasta tener listos sus credenciales y RUC vinculados al portal de desarrolladores.
