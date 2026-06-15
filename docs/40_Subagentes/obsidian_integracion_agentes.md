# Propuesta de Integración de Obsidian para los 16 Subagentes de BEATSS

Este documento detalla la propuesta técnica y operativa de cómo cada uno de los subagentes especializados de la plataforma **BEATSS** utilizaría **Obsidian** para documentar, estructurar y potenciar sus flujos de trabajo individuales, convirtiendo la bóveda en el cerebro central de la plataforma.

---

## 🤖 1. Especialistas Técnicos y de Código

### 💻 `refactor_expert` (Arquitectura Frontend)
*   **Ámbito de Obsidian:** Mapeo de dependencias de la modularización y prevención de dependencias circulares.
*   **Cómo lo usaría:** 
    *   Creando notas para cada módulo del frontend (`[[auth.js]]`, `[[player.js]]`, `[[catalog.js]]`, `[[checkout.js]]`, `[[editor.js]]`, `[[dashboard.js]]`).
    *   Utilizando la **Vista Gráfica** de Obsidian para visualizar de manera interactiva cómo se conectan los módulos y qué variables globales exportadas en `window` son llamadas por cada archivo.
    *   Manteniendo una bitácora de refactorización para registrar optimizaciones del tamaño del bundle en cada commit.

### 🔌 `integrator` (Conectividad Firebase & APIs)
*   **Ámbito de Obsidian:** Catálogo de esquemas de colecciones de base de datos y endpoints de pasarelas de pago.
*   **Cómo lo usaría:** 
    *   Documentando las estructuras JSON de los documentos de Firestore (`users`, `beats`, `purchases`).
    *   Escribiendo guías de integración rápidas con payloads de ejemplo (Request/Response) de las APIs corporativas de **PayPhone** y **Deuna!** para consulta inmediata.
    *   Manteniendo plantillas Markdown del esquema de variables de entorno locales `.env` y secretos en Vercel.

### 🎨 `designer` (Diseño Visual y CSS)
*   **Ámbito de Obsidian:** Wiki de diseño visual y Tokens de CSS del sistema.
*   **Cómo lo usaría:** 
    *   Centralizando los valores del **Design System** (colores de la marca, degradados de neón, radios de bordes, reglas de glassmorphism) en una nota `[[Tokens CSS]]` con código reutilizable.
    *   Manteniendo un registro de la estructura visual del HTML para evitar alterar accidentalmente selectores o IDs interactivos requeridos por Javascript al rediseñar páginas.

---

## 🚀 2. Infraestructura, Datos y Calidad

### 📦 `devops_admin` (Operaciones e Infraestructura)
*   **Ámbito de Obsidian:** Runbooks de despliegues y bitácora de producción.
*   **Cómo lo usaría:** 
    *   Creando guías paso a paso (Runbooks) para el proceso de despliegue en Vercel (`npx vercel --prod`) y recuperación ante fallos.
    *   Manteniendo notas de la lista de índices compuestos necesarios en Firestore para optimizar costos de consulta en base de datos.
    *   Guardando un log de fallos, tiempos de latencia detectados y resoluciones aplicadas en producción.

### 🔒 `security_ops` (Ciberseguridad y Auditorías)
*   **Ámbito de Obsidian:** Bitácora de análisis de amenazas y cambios de firestore.rules.
*   **Cómo lo usaría:** 
    *   Diseñando diagramas de arquitectura de seguridad en formato Mermaid directo en las notas para mapear accesos de datos.
    *   Manteniendo una lista de comprobación de auditoría (Vulnerabilidades mitigadas, políticas de contraseñas, sanitización de inputs).
    *   Escribiendo notas históricas sobre cada cambio en `[[firestore.rules]]` para rastrear qué reglas de lectura/escritura se endurecieron y por qué.

### 🧪 `qa_tester` (Control de Calidad)
*   **Ámbito de Obsidian:** Plan de pruebas de integración y registro de bugs.
*   **Cómo lo usaría:** 
    *   Creando listas de chequeo interactivas en Markdown con los casos de prueba obligatorios antes de cada build (v.g. comprobar cupones de descuento, cálculo de comisiones de checkout, firma digital).
    *   Enlazando reportes de bugs directamente con las notas de código involucradas (`[[Bug #12 - Error de descarga]]` ➔ `[[checkout.js]]`), haciendo rastreable el ciclo de vida del fallo.

---

## 📄 3. Documentación y Soporte al Cliente

### 📄 `document_expert` (Maquetación y Exportación de PDFs)
*   **Ámbito de Obsidian:** Estilos de impresión y plantillas de diseño digital.
*   **Cómo lo usaría:** 
    *   Documentando las reglas y hacks de CSS de impresión (`page-break-inside: avoid; @media print`) utilizados para evitar que los contratos corten las firmas en la mitad del PDF.
    *   Guardando logs de pruebas visuales de exportación realizadas en diferentes sistemas operativos y navegadores para mantener la consistencia visual.

### 🤝 `support_helper` (Soporte al Usuario y FAQs)
*   **Ámbito de Obsidian:** Respuestas rápidas (Canned Responses) y guías educativas.
*   **Cómo lo usaría:** 
    *   Creando notas individuales con respuestas prediseñadas ante problemas comunes de los clientes (disputas de Content ID, formatos de beats erróneos o problemas de descarga).
    *   Guardando borradores rápidos de las FAQ antes de implementarlas en el HTML, permitiendo realizar mejoras y revisiones de texto ágilmente.

---

## 🎼 4. Especialidades del Negocio Musical y Analítica

### ⚖️ `legal_advisor` (Derecho de Autor y Licenciamiento)
*   **Ámbito de Obsidian:** Archivo histórico de contratos de licencias y legislación musical.
*   **Cómo lo usaría:** 
    *   Borrando y comparando las cláusulas de los contratos (Básica, Premium, Unlimited, Exclusive) en formato de tablas Markdown.
    *   Documentando la legislación de PROs locales (SAYCO, SACM, BMI) y las configuraciones legales exactas del *Writer's Share* y *Composer Share* para los splits de regalías.

### ✉️ `marketing_copywriter` (Localización y Copywriting)
*   **Ámbito de Obsidian:** Glosario de términos bilingües y textos persuasivos.
*   **Cómo lo usaría:** 
    *   Creando un glosario dinámico de traducción ES/EN para garantizar que la interfaz de la tienda sea coherente en ambos idiomas.
    *   Guardando borradores y variantes de los correos automáticos de confirmación de compra y entrega de archivos.

### 📊 `business_analyst` (Analítica e Inteligencia de Negocio)
*   **Ámbito de Obsidian:** Reportes financieros y planes de expansión.
*   **Cómo lo usaría:** 
    *   Escribiendo y almacenando reportes de análisis de mercado, precios de licencias recomendados y estudios de viabilidad (como el informe `[[viabilidad_stripe_ecuador_llc]]`).
    *   Documentando las fórmulas matemáticas empleadas en el frontend para calcular métricas como LTV o MRR.

---

## ⚙️ 5. Especialistas Técnicos del Backend e Interfaces Nativas

### 🥁 `audio_dsp_expert` (Procesamiento de Audio en la Web)
*   **Ámbito de Obsidian:** Pipeline de Web Audio API y políticas de caché de sonido.
*   **Cómo lo usaría:** 
    *   Esquematizando la conexión de los nodos de audio en el navegador (fuentes, ganancia, ecualizador) para el reproductor interactivo.
    *   Registrando logs de latencias de reproducción en buffers de audio en diferentes dispositivos.

### 🔗 `automation_expert` (Notificaciones y Mensajería)
*   **Ámbito de Obsidian:** Mapeo de flujos de correo y webhooks transaccionales.
*   **Cómo lo usaría:** 
    *   Mapeando en formato visual el ciclo de vida del correo del cliente desde que paga hasta que recibe los archivos.
    *   Guardando ejemplos de respuestas HTTP de plataformas como Resend o SendGrid para depuración rápida de fallos de envío.

### 💾 `data_engineer` (Flujos de Datos e Importaciones)
*   **Ámbito de Obsidian:** Mapeos de bases de datos externas e históricos de migración.
*   **Cómo lo usaría:** 
    *   Documentando el flujo de los scripts de importación de CSVs de Beatstars.
    *   Registrando incidencias en los respaldos JSON de Firestore para evitar corrupciones de datos en las migraciones de cuentas.

### 📱 `mobile_developer` (Desarrollo Móvil iOS/Android)
*   **Ámbito de Obsidian:** Mapas de consumo de API de la aplicación móvil y estados del reproductor nativo.
*   **Cómo lo usaría:** 
    *   Especificando los endpoints que la app móvil consumirá de Firestore y del backend serverless de Vercel.
    *   Documentando la máquina de estados del reproductor en segundo plano nativo.
