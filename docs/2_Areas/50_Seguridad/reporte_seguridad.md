# 🔒 Reporte de Seguridad — BEATSS Licencias

## ¿Qué se revisó?

Toda la aplicación: el panel de admin, la tienda pública, las APIs del servidor, el servidor local de backups y la configuración de Vercel.

---

## Problemas encontrados y corregidos

### 🔴 Críticos (corregidos)

#### 1. Inyección de código malicioso (XSS) en el panel de Admin
**Problema:** Nombres de productores, emails, AKAs y mensajes de error se insertaban directamente en el HTML del panel de admin sin ningún filtrado. Un productor con un AKA como `<script>alert('hackeado')</script>` podría ejecutar código JavaScript en el navegador del administrador al abrir el panel de usuarios.

**Corrección:** Se agregó la función `sanitizeHtml()` que convierte los caracteres peligrosos (`<`, `>`, `"`, `'`, `&`) en versiones seguras antes de mostrarlos. Ahora ese AKA se vería simplemente como texto, no como código.

#### 2. Inyección de código en la tienda pública (XSS)
**Problema:** Nombres de beats, géneros musicales, etiquetas (tags) y escalas de los productores se mostraban sin filtrar en las tarjetas de la tienda. Un beat con nombre `<img src=x onerror=robar_contraseña()>` podría atacar a cualquier visitante de la tienda.

**Corrección:** Se aplicó `sanitizeHtml()` a todos esos datos en las tarjetas de beats.

#### 3. La API de descargas era pública para cualquiera
**Problema:** El endpoint `/api/get-order-downloads` devolvía todos los datos de un pedido (nombre del comprador, email, teléfono, DNI, ciudad, país y enlaces de descarga) con solo conocer el ID del pago. No pedía ninguna contraseña ni verificación.

**Corrección:** Ahora se requiere una de dos cosas para acceder:
- Un **token firmado** que viene incluido en el email de confirmación de compra (solo el comprador lo tiene)
- Una **sesión activa de Firebase** (admin o productor autenticado)

El token del email se genera con una firma criptográfica usando la clave secreta del servidor, y expira automáticamente.

#### 4. CORS abierto: cualquier sitio web podía pedir archivos privados
**Problema:** Las APIs de audio (`/api/proxy-audio`) y de descargas tenían `Access-Control-Allow-Origin: *`, lo que significa que cualquier página web en internet podía hacer solicitudes a estas APIs y obtener los archivos.

**Corrección:** Ahora solo el dominio propio (`generador-licencias.vercel.app`) puede hacer solicitudes a estas APIs.

#### 5. Clave de seguridad de descargas con valor por defecto inseguro
**Problema:** Si la variable de entorno `DOWNLOAD_SIGNING_KEY` no estaba configurada en el servidor, el sistema usaba `FIREBASE_PRIVATE_KEY` o el texto literal `'default_fallback_secret'` como clave de firma. Cualquiera que conociera este valor podría generar URLs de descarga válidas para cualquier compra.

**Corrección:** Si `DOWNLOAD_SIGNING_KEY` no está configurada, el servidor ahora lanza un error grave en el log y rechaza la operación, en vez de usar un valor inseguro.

---

### 🟠 Altos (corregidos)

#### 6. Sin headers de seguridad HTTP
**Problema:** La app no enviaba headers de seguridad básicos que todos los navegadores modernos entienden.

**Corrección:** Se agregaron en `vercel.json`:
- `X-Frame-Options: DENY` — impide que la app sea incrustada en otros sitios (clickjacking)
- `X-Content-Type-Options: nosniff` — evita que el navegador adivine el tipo de archivo
- `Referrer-Policy` — controla qué información se envía al navegar
- `Permissions-Policy` — desactiva acceso a cámara, micrófono y geolocalización
- `Strict-Transport-Security` — fuerza HTTPS por 2 años

#### 7. Servidor local sin límite de tamaño de payload
**Problema:** El servidor Python que se usa localmente para backups no limitaba el tamaño de los datos recibidos. Un atacante en la misma red WiFi podía enviar un archivo gigante y agotar la memoria del equipo.

**Corrección:** Se agregó un límite máximo de 50 MB. Si el payload es mayor, el servidor lo rechaza con un error 413.

#### 8. Servidor local podía escribir archivos fuera de la carpeta autorizada (Path Traversal)
**Problema:** El endpoint `/api/save-pdf` guardaba el PDF con el nombre que venía del cliente, sin verificar si ese nombre incluía secuencias como `../../etc/cron` que podrían escribir fuera de la carpeta `~/Documents/Licencias`.

**Corrección:** Ahora el nombre del archivo se sanitiza (se eliminan caracteres especiales) y se verifica que la ruta resultante esté dentro de la carpeta autorizada antes de escribir.

---

## ⚠️ Acción manual requerida

> [!IMPORTANT]
> Verifica que la variable de entorno **`DOWNLOAD_SIGNING_KEY`** esté configurada en Vercel con un valor aleatorio largo (mínimo 32 caracteres). Sin esta variable, las descargas firmadas no funcionarán.
>
> **Cómo hacerlo:** Vercel Dashboard → Tu proyecto → Settings → Environment Variables → Agregar `DOWNLOAD_SIGNING_KEY`

---

## Recomendaciones para mantener la app segura

1. **Nunca guardes secretos en el código** — Usa siempre variables de entorno en Vercel para API keys y claves de firma.

2. **Actualiza las dependencias regularmente** — Ejecuta `npm audit` periódicamente para detectar vulnerabilidades conocidas en paquetes de terceros.

3. **Siempre sanitiza datos de usuario** — Si en el futuro agregas nuevas secciones que muestren datos de usuarios (contratos, comentarios, etc.), usa siempre `sanitizeHtml()` o equivalente.

4. **Mantén los Firestore Security Rules estrictos** — Las reglas actuales son razonables. Si agregas nuevas colecciones, sigue el patrón de verificación `isAdmin()` para datos sensibles.

5. **Monitorea los logs de Vercel** — Las llamadas fallidas y los errores de autenticación quedan registrados. Revísalos periódicamente.
