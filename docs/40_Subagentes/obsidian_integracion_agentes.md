# Integración de Obsidian para los 21 Subagentes de BEATSS

Este documento detalla cómo cada uno de los 21 subagentes especializados de la plataforma **BEATSS** utiliza **Obsidian** para documentar, estructurar y potenciar sus flujos de trabajo individuales, convirtiendo la bóveda en el cerebro central de la plataforma.

Los subagentes están organizados en **6 Categorías Funcionales**.

---

## 💻 1. Desarrollo y Arquitectura Core (Core Software Engineering)

### `refactor_expert` (Arquitectura Frontend)
*   **Ámbito de Obsidian:** Mapeo de dependencias de la modularización y prevención de dependencias circulares.
*   **Cómo lo usaría:** 
    *   Creando notas para cada módulo del frontend (`[[auth.js]]`, `[[player.js]]`, `[[catalog.js]]`, `[[checkout.js]]`, `[[editor.js]]`, `[[dashboard.js]]`).
    *   Utilizando la **Vista Gráfica** de Obsidian para visualizar de manera interactiva cómo se conectan los módulos y qué variables globales exportadas en `window` son llamadas por cada archivo.
    *   Manteniendo una bitácora de refactorización para registrar optimizaciones del tamaño del bundle en cada commit.

### `integrator` (Conectividad Firebase & Pasarelas de Pago)
*   **Ámbito de Obsidian:** Catálogo de esquemas de colecciones de base de datos y endpoints de pasarelas de pago.
*   **Cómo lo usaría:** 
    *   Documentando las estructuras JSON de los documentos de Firestore (`users`, `beats`, `purchases`).
    *   Escribiendo guías de integración rápidas con payloads de ejemplo (Request/Response) de las APIs corporativas de **PayPhone** y **Deuna!** para consulta inmediata.
    *   Manteniendo plantillas Markdown del esquema de variables de entorno locales `.env` y secretos en Vercel.

### `automation_expert` (Notificaciones y Mensajería)
*   **Ámbito de Obsidian:** Mapeo de flujos de correo y webhooks transaccionales.
*   **Cómo lo usaría:** 
    *   Mapeando en formato visual el ciclo de vida del correo del cliente desde que paga hasta que recibe los archivos.
    *   Guardando ejemplos de respuestas HTTP de plataformas como Resend o SendGrid para depuración rápida de fallos de envío.

### `devops_admin` (Operaciones e Infraestructura)
*   **Ámbito de Obsidian:** Runbooks de despliegues y bitácora de producción.
*   **Cómo lo usaría:** 
    *   Creando guías paso a paso (Runbooks) para el proceso de despliegue en Vercel (`npx vercel --prod`) y recuperación ante fallos.
    *   Manteniendo notas de la lista de índices compuestos necesarios en Firestore para optimizar costos de consulta en base de datos.
    *   Guardando un log de fallos, tiempos de latencia detectados y resoluciones aplicadas en producción.

### `mobile_developer` (Desarrollo Móvil iOS/Android)
*   **Ámbito de Obsidian:** Mapas de consumo de API de la aplicación móvil y estados del reproductor nativo.
*   **Cómo lo usaría:** 
    *   Especificando los endpoints que la app móvil consumirá de Firestore y del backend serverless de Vercel.
    *   Documentando la máquina de estados del reproductor en segundo plano nativo.

---

## 🥁 2. Ingeniería de Audio y Datos (Audio & Data Engineering)

### `audio_dsp_expert` (Procesamiento de Audio en la Web)
*   **Ámbito de Obsidian:** Pipeline de Web Audio API y políticas de caché de sonido.
*   **Cómo lo usaría:** 
    *   Esquematizando la conexión de los nodos de audio en el navegador (fuentes, ganancia, ecualizador) para el reproductor interactivo.
    *   Registrando logs de latencias de reproducción en buffers de audio en diferentes dispositivos.

### `data_engineer` (Flujos de Datos e Importaciones)
*   **Ámbito de Obsidian:** Mapeos de bases de datos externas e históricos de migración.
*   **Cómo lo usaría:** 
    *   Documentando el flujo de los scripts de importación de CSVs de Beatstars.
    *   Registrando incidencias en los respaldos JSON de Firestore para evitar corrupciones de datos en las migraciones de cuentas.

### `beatstars_sync_expert` (Sincronización de Catálogo)
*   **Ámbito de Obsidian:** Registros de discrepancias de sincronización, mapeo de IDs de Beats en Beatstars vs. BEATSS, y logs de tareas programadas.
*   **Cómo lo usaría:**
    *   Manteniendo la nota `[[Mapeo de Catálogo Beatstars]]` para rastrear qué beats se encuentran activos, pausados o vendidos en ambas plataformas.
    *   Documentando la resolución de conflictos cuando un beat se vende como exclusivo en BEATSS y requiere una desactivación rápida en Beatstars.

---

## 🎨 3. Diseño Creativo y UI/UX (Creative UI/UX & Design)

### `designer` (Diseño Visual y CSS)
*   **Ámbito de Obsidian:** Wiki de diseño visual y Tokens de CSS del sistema.
*   **Cómo lo usaría:** 
    *   Centralizando los valores del **Design System** (colores de la marca, degradados de neón, radios de bordes, reglas de glassmorphism) en una nota `[[Tokens CSS]]` con código reutilizable.
    *   Manteniendo un registro de la estructura visual del HTML para evitar alterar accidentalmente selectores o IDs interactivos requeridos por Javascript al rediseñar páginas.

### `document_expert` (Maquetación y Exportación de PDFs)
*   **Ámbito de Obsidian:** Estilos de impresión y plantillas de diseño digital.
*   **Cómo lo usaría:** 
    *   Documentando las reglas y hacks de CSS de impresión (`page-break-inside: avoid; @media print`) utilizados para evitar que los contratos corten las firmas en la mitad del PDF.
    *   Guardando logs de pruebas visuales de exportación realizadas en diferentes sistemas operativos y navegadores para mantener la consistencia visual.

---

## 🔒 4. Calidad, Optimización y Seguridad (QA, Performance & Security)

### `qa_tester` (Control de Calidad)
*   **Ámbito de Obsidian:** Plan de pruebas de integración y registro de bugs.
*   **Cómo lo usaría:** 
    *   Creando listas de chequeo interactivas en Markdown con los casos de prueba obligatorios antes de cada build (v.g. comprobar cupones de descuento, cálculo de comisiones de checkout, firma digital).
    *   Enlazando reportes de bugs directamente con las notas de código involucradas (`[[Bug #12 - Error de descarga]]` ➔ `[[checkout.js]]`), haciendo rastreable el ciclo de vida del fallo.

### `security_ops` (Seguridad, Vulnerabilidades y Auditorías)
*   **Ámbito de Obsidian:** Registro de mitigación de vulnerabilidades (SAST/SCA), bitácoras de dependencias vulnerables y control de firestore.rules.
*   **Cómo lo usaría:** 
    *   Manteniendo un log centralizado `[[Log de Vulnerabilidades]]` que documente vulnerabilidades detectadas en dependencias, su severidad (CVSS) y el estado de su resolución.
    *   Diseñando diagramas Mermaid de flujos de autenticación y autorización para auditorías visuales rápidas.
    *   Escribiendo notas históricas de control de cambios sobre el endurecimiento preventivo de `[[firestore.rules]]`.

### `token_optimizer` (Eficiencia de Tokens y Contexto)
*   **Ámbito de Obsidian:** Auditoría de densidad de información en notas y optimización de prompts del orquestador.
*   **Cómo lo usaría:**
    *   Estableciendo pautas de longitud máxima para notas de documentación a fin de evitar desperdicio de tokens al ser leídas.
    *   Diseñando resúmenes ejecutivos autocontenidos en las cabeceras de notas pesadas para que los agentes puedan leer solo el frontmatter o resumen en lugar de la nota completa.

---

## 📈 5. Crecimiento, Ventas y Marketing (Growth & Persuasion)

### `business_analyst` (Analítica e Inteligencia de Negocio)
*   **Ámbito de Obsidian:** Reportes financieros y planes de expansión.
*   **Cómo lo usaría:** 
    *   Escribiendo y almacenando reportes de análisis de mercado, precios de licencias recomendados y estudios de viabilidad (como el informe `[[viabilidad_stripe_ecuador_llc]]`).
    *   Documentando las fórmulas matemáticas empleadas en el frontend para calcular métricas como LTV o MRR.

### `growth_hacker` (Tráfico, Ventas y Conversión)
*   **Ámbito de Obsidian:** Planificación de embudos de ventas, calendarios editoriales de contenido y estadísticas de conversión.
*   **Cómo lo usaría:**
    *   Bocetando flujos de embudos de correo electrónico en formato Mermaid directas en notas.
    *   Manteniendo un registro dinámico de las tácticas de conversión de A/B testing ejecutadas en la pasarela de pagos.
    *   Diseñando listas de chequeo sobre los pasos necesarios para optimizar el SEO del catálogo musical en plataformas de terceros.

### `marketing_copywriter` (Localización y Copywriting)
*   **Ámbito de Obsidian:** Glosario de términos bilingües y textos persuasivos.
*   **Cómo lo usaría:** 
    *   Creando un glosario dinámico de traducción ES/EN para garantizar que la interfaz de la tienda sea coherentemente bilingüe.
    *   Guardando borradores y variantes de los correos automáticos de confirmación de compra y entrega de archivos.

### `seo_optimizer` (SEO Técnico y Rendimiento)
*   **Ámbito de Obsidian:** Auditorías de Lighthouse, estructura de metatags y optimización de imágenes.
*   **Cómo lo usaría:**
    *   Escribiendo bitácoras de rendimiento de carga web en diferentes navegadores y reportes de optimización de imágenes (WebP).
    *   Documentando los esquemas JSON-LD (Schema.org) empleados para estructurar los beats y mejorar la visibilidad orgánica en Google.

### `branding_specialist` (Marca Personal y Relaciones Públicas)
*   **Ámbito de Obsidian:** Wiki de identidad de marca, guiones de outreach para colaboraciones y calendarios de lanzamientos de EPs/Álbumes.
*   **Cómo lo usaría:**
    *   Redactando notas de marca (v.g. manual de estilo, tipografías y paletas visuales para redes).
    *   Escribiendo y perfeccionando borradores de mensajes de acercamiento para Instagram o correo dirigidos a artistas urbanos.
    *   Organizando la bitácora de lanzamiento de singles y coproducciones en formato de tableros de tareas.

---

## 📚 6. Operaciones, Legalidad y Conocimiento (Operations, Law & Knowledge)

### `legal_advisor` (Derecho de Autor y Licenciamiento)
*   **Ámbito de Obsidian:** Archivo histórico de contratos de licencias y legislación musical.
*   **Cómo lo usaría:** 
    *   Borrando y comparando las cláusulas de los contratos (Básica, Premium, Unlimited, Exclusive) en formato de tablas Markdown.
    *   Documentando la legislación de PROs locales (SAYCO, SACM, BMI) y las configuraciones legales exactas del *Writer's Share* y *Composer Share* para los splits de regalías.

### `rights_manager` (Gestor de Derechos y Reclamaciones)
*   **Ámbito de Obsidian:** Logs de apelaciones de copyright, registro de disputas y lista de canales en lista blanca.
*   **Cómo lo usaría:**
    *   Manteniendo tablas Markdown con el histórico de disputas resueltas para identificar patrones de falsas reclamaciones de Content ID.
    *   Escribiendo notas con plantillas de apelación legal optimizadas según los lineamientos de YouTube.
    *   Guardando las listas de canales autorizados (whitelist) para sincronización con herramientas de automatización.

### `support_helper` (Soporte al Usuario y FAQs)
*   **Ámbito de Obsidian:** Respuestas rápidas (Canned Responses) y guías educativas.
*   **Cómo lo usaría:** 
    *   Creando notas individuales con respuestas prediseñadas ante problemas comunes de los clientes (disputas de Content ID, formatos de beats erróneos o problemas de descarga).
    *   Guardando borradores rápidos de las FAQ antes de implementarlas en el HTML, permitiendo realizar mejoras y revisiones de texto ágilmente.

### `obsidian_expert` (Gestión de Conocimiento y Vault)
*   **Ámbito de Obsidian:** Curaduría, mantenimiento e indexación de la bóveda completa.
*   **Cómo lo usaría:** 
    *   Supervisando y actualizando el panel central `[[Dashboard BEATSS]]`.
    *   Manteniendo estructurada la base de conocimientos y aplicando la taxonomía de carpetas para evitar la entropía de archivos.
    *   Creando y distribuyendo plantillas Markdown de notas técnicas para los demás subagentes.

### `licensing_negotiator` (Negociador de Licencias)
*   **Ámbito de Obsidian:** Historial de ofertas de exclusivas recibidas, tablas de valoración y plantillas de contrapropuestas.
*   **Cómo lo usaría:**
    *   Manteniendo la nota `[[Bitácora de Negociaciones Exclusivas]]` para registrar las ofertas aceptadas, rechazadas y las tasas promedio de contrapropuestas.
    *   Documentando las reglas de valoración de beats en la nota `[[Fórmula de Valoración Exclusiva]]` para tener un punto de referencia dinámico sobre el precio de reserva.
