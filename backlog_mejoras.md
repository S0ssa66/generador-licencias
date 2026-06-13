# Backlog de Mejoras Recomendadas para BEATSS

Este backlog consolida todas las recomendaciones técnicas y de negocio sugeridas por nuestro escuadrón de agentes especialistas (**SecurityOps**, **LegalAdvisor**, **Designer**, **SeoOptimizer**, **BusinessAnalyst** y **DevOps**).

---

## 🔴 Prioridad Alta: Seguridad y Reglas Críticas (Completado)

Estas mejoras previenen la manipulación de precios, filtración de archivos premium y exposición de credenciales del lado del cliente.

- `[x]` **Hardening de `config/producer` (SecurityOps)**:
  - *Descripción:* Dividir el documento de configuración del productor en `/users/{userId}/config/public` (aka, logo, name) y `/users/{userId}/config/private` (firmas en Base64, datos bancarios y tokens de APIs).
  - *Acción:* Ajustar en `firestore.rules` para hacer el documento privado inaccesible al público general, y modificar la lectura en `main.js`.
- `[x]` **Protección de Enlaces de Audio Premium (SecurityOps & AudioDSP)**:
  - *Descripción:* Evitar que los archivos de alta definición (WAV y Stems) estén expuestos en documentos de Firestore accesibles públicamente.
  - *Acción:* Mover las rutas premium a una subcolección privada `/beats/{beatId}/private/files` y construir un endpoint de descarga temporizada/firmada.
- `[x]` **Protección de Pagos de PayPal/PayPhone (SecurityOps & Integrator)**:
  - *Descripción:* Evitar que un usuario malicioso pueda aprobar compras en Firestore enviando un parámetro `status: 'approved'` desde el frontend sin confirmación real.
  - *Acción:* Bloquear actualizaciones de estado a `'approved'` en `firestore.rules` para clientes no administradores. Usar webhooks a nivel de backend para aprobar transacciones en base a respuestas firmadas de PayPal.
- `[x]` **Blindaje de Token de Google Drive (SecurityOps & DevOps)**:
  - *Descripción:* Retirar el endpoint `/api/gdrive-token` que expone tokens de acceso al frontend.
  - *Acción:* Mover la subida de PDFs firmados al backend usando variables de entorno seguras (`GD_CLIENT_ID`, `GD_CLIENT_SECRET`).

---

## 🟡 Prioridad Media-Alta: Legal y Armonización del Contrato (Completado)

Mejoras legales para blindar al productor contra disputas de derechos de autor y reclamos económicos imprevistos.

- `[x]` **Resolución de Splits en Master (LegalAdvisor)**:
  - *Descripción:* Corregir la contradicción de regalías del Master en el contrato. La licencia otorga 100% de regalías al artista, mientras que el anexo de Splits estipula 50/50.
  - *Acción:* Inyectar una cláusula de prevalencia en los términos contractuales de `config.js` y ajustar el Split Sheet anexo.
- `[x]` **Control de Content ID en Licencia Exclusiva (LegalAdvisor)**:
  - *Descripción:* Prevenir que el comprador de la licencia Exclusiva registre la obra en sistemas de huella digital (Content ID / YouTube) y bloquee a los artistas que legítimamente adquirieron licencias no exclusivas previamente.
  - *Acción:* Obligar al licenciatario exclusivo por contrato a abstenerse de reclamaciones de Content ID global y exigir listas blancas de canciones derivadas.
- `[x]` **Limitación de Responsabilidad por Rescisión (LegalAdvisor)**:
  - *Descripción:* Asegurar que la penalidad de rescisión del productor (devolver el 200% del pago) se considere una compensación total y final, previniendo demandas por pérdidas en marketing del artista.
  - *Acción:* Agregar una sección de "Limitation of Liability" en la plantilla del contrato de `config.js`.

---

## 🟢 Prioridad Media: Diseño, Estética y Rendimiento (Completado)

Mejoras para acelerar la carga de la página, mejorar el SEO y refinar la interfaz con una estética más profesional y coherente.

- `[x]` **Efecto de Tarjetas Glassmorphism (Designer)**:
  - *Descripción:* Aplicar un estilo oscuro translúcido a los contenedores y tarjetas del catálogo global (`bg-white/[0.02] backdrop-blur-xl border border-white/10`) con destellos suaves al pasar el cursor (hover).
- `[x]` **Consolidación de Jerarquía Tipográfica (Designer)**:
  - *Descripción:* Aplicar estrictamente las tipografías correspondientes: **Montserrat** para títulos/botones, **Inter** para textos generales e inputs, y **JetBrains Mono** para cifras, BPM y códigos de referencia.
- `[x]` **"Soft Paper Mode" en Contratos (Designer & DocumentExpert)**:
  - *Descripción:* Evitar la fatiga visual que genera la hoja blanca pura del contrato en previsualización de pantalla.
  - *Acción:* Mostrar el contrato sobre fondo oscuro con texto claro y aplicar el estilo blanco y negro con fondo puro solo durante el proceso de exportación a PDF.
- `[x]` **Lazy Loading de Scripts Bloqueantes (SeoOptimizer)**:
  - *Descripción:* Librerías pesadas como `html2pdf.bundle.min.js`, `chart.umd.min.js` y `jszip.min.js` cargan al iniciar la página, ralentizando el FCP/LCP.
  - *Acción:* Inyectar los scripts dinámicamente en el DOM únicamente cuando el usuario abre el editor de contratos, ve estadísticas o exporta archivos.
- `[x]` **Tailwind CSS Compilado Local (SeoOptimizer & DevOps)**:
  - *Descripción:* Actualmente se utiliza el script CDN de Tailwind, lo cual penaliza el rendimiento de carga y renderizado en el navegador.
  - *Acción:* Instalar Tailwind CSS estáticamente en la configuración de Vite usando PostCSS para generar archivos CSS purgados y optimizados.
- `[x]` **Estructura de Datos JSON-LD para Beats (SeoOptimizer)**:
  - *Descripción:* Permitir que Google y otros motores de búsqueda indexen de forma enriquecida (Rich Snippets) las instrumentales con sus precios y valoraciones.
  - *Acción:* Insertar etiquetas de microdatos estructurados Schema.org (`MusicRecording` y `Product`) de forma dinámica en la tienda.
- `[x]` **Modularización del Monolito `main.js` (DevOps & Integrator)**:
  - *Descripción:* `main.js` tiene más de 12,000 líneas de código, dificultando el mantenimiento y penalizando el bundle inicial.
  - *Acción:* Dividir el monolito en submódulos dedicados (`auth.js`, `marketplace.js`, `player.js`, `dashboard.js`) usando *dynamic imports* de JS.

---

## 🔵 Prioridad Estratégica: Modelo de Negocio y Monetización (Futuro)

Automatizaciones para erradicar la validación manual de comprobantes y cambiar a un modelo de suscripción recurrente real.

- [ ] **QR Dinámico para Deuna! y Pagos Locales (BusinessAnalyst)**:
  - *Descripción:* Automatizar los pagos manuales generando códigos QR dinámicos a través de API comercial, confirmando transacciones mediante webhooks para entregar los beats de inmediato.
- [ ] **Suscripción Recurrente para Productores (BusinessAnalyst)**:
  - *Descripción:* Integrar Stripe Billing o suscripciones recurrentes de PayPal para cobrar mensualmente de forma automática los planes Pro ($10/mes) o Elite ($30/mes).
- [ ] **Procesamiento de Pagos Centralizado (Stripe Connect)**:
  - *Descripción:* Permitir que la plataforma retenga automáticamente una comisión (v.g. 5% - 10%) en cada transacción de los productores y envíe el resto automáticamente a su cuenta de banco.
