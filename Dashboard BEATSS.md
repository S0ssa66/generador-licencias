# 🎛️ Panel de Control - BEATSS

Bienvenido a la Bóveda de Documentación de **BEATSS**. Este panel sirve como el punto central de navegación para todos los análisis, reportes de viabilidad, auditorías de seguridad, y estados operativos de la plataforma.

---

## 🗂️ Categorías de Documentación

### 💳 10. Pagos y Viabilidad Financiera
Documentos relacionados con la integración de pasarelas de pago y la viabilidad del cobro internacional desde Ecuador.
*   **[[generador-licencias/docs/10_Pagos/viabilidad_stripe_ecuador_llc|Viabilidad Stripe Ecuador (LLC)]]**: Análisis detallado sobre la creación de una LLC en EE.UU. para acceder a Stripe.
*   **[[generador-licencias/docs/10_Pagos/opciones_pago_con_ruc_ecuador|Opciones de Pago con RUC de Ecuador]]**: Alternativas locales (PayPhone, PayPal, Deuna!, Kushki) para operar comercialmente en el país.

### 🤝 20. Soporte y Educación al Cliente
Guías y recursos estructurados para optimizar la experiencia de soporte de BEATSS.
*   **[[generador-licencias/docs/20_Soporte/propuesta_ayuda_soporte|Propuesta de Soporte y FAQs]]**: Diseño de módulos educativos sobre derechos de autor, regalías y preguntas frecuentes de los usuarios.

### 📜 30. Contratos y Licenciamiento
Análisis de la legalidad de los contratos generados y su formato de impresión.
*   **[[generador-licencias/docs/30_Contratos/analisis_contratos_pdf|Análisis de Contratos PDF]]**: Auditoría de las plantillas contractuales, saltos de página y estilo de la firma digital en PDF.

### 🤖 40. Organización de Subagentes
El funcionamiento, roles y estructura de integración con Obsidian de los 18 subagentes de la plataforma (incluyendo los nuevos agentes `token_optimizer` y `growth_hacker`).
*   **[[generador-licencias/docs/40_Subagentes/agents_analysis|Roles de los 18 Subagentes]]**: Definición y funciones de los especialistas que componen el equipo de BEATSS.
*   **[[generador-licencias/docs/40_Subagentes/obsidian_integracion_agentes|Integración de Subagentes con Obsidian]]**: Detalle de cómo cada agente utiliza esta bóveda de notas para interactuar y registrar sus tareas.

### 🔒 50. Seguridad de Datos
Análisis de vulnerabilidades y seguridad del backend.
*   **[[generador-licencias/docs/50_Seguridad/firebase_security_audit|Auditoría de Seguridad de Firestore]]**: Evaluación del endurecimiento de las reglas de seguridad de la base de datos de Firebase.

---

## ⚙️ Progreso y Bitácoras de Desarrollo

*   **[[generador-licencias/backlog_mejoras|Backlog de Mejoras]]**: Lista de prioridades pendientes y completadas para la evolución técnica y de negocio de BEATSS.
*   **[[generador-licencias/task|Bitácora de Tareas (task.md)]]**: Registro detallado de tareas operativas realizadas durante la sesión de desarrollo actual.
*   **[[generador-licencias/walkthrough|Walkthrough de Cambios (walkthrough.md)]]**: Resumen del proceso de modularización de `main.js`, corrección de bugs de UI y optimización de checkout.

---

## 💡 Consejo Premium de Obsidian
Para mantener esta bóveda visualmente limpia y enfocarte solo en la documentación, te recomendamos excluir las carpetas de código y dependencias. En Obsidian, ve a:
1. **Configuración** (icono de engranaje) ➔ **Archivos y enlaces (Files and Links)**.
2. Busca la opción **Archivos excluidos (Excluded files)**.
3. Añade las siguientes rutas para ocultar el ruido del código:
   - `generador-licencias/node_modules/`
   - `generador-licencias/dist/`
   - `generador-licencias/.venv/`
   - `generador-licencias/.git/`
   - `generador-licencias/.vercel/`
