# Lista de Tareas: Migración, Modularización y Ciberseguridad BEATSS

## ⚡ Modularización Completa (Fase 3 & 4)
- `[x]` Refactorizar Firebase Authentication a `auth.js`
- `[x]` Refactorizar reproductor de audio y eventos a `player.js`
- `[x]` Refactorizar render y base de datos local a `catalog.js`
- `[x]` Refactorizar carrito, PayPal y pasarelas a `checkout.js`
- `[x]` Refactorizar compilador de PDF, firmas y correos a `editor.js`
- `[x]` Refactorizar estadísticas, CRM e historial a `dashboard.js`
- `[x]` Sincronizar reactividad bidireccional usando descriptores de propiedad (`Object.defineProperty`) en `window`
- `[x]` Compactar monolito principal `main.js` a ~3,000 líneas legibles

## 🛡️ Ciberseguridad & Hardening (Backlog)
- `[x]` Hardening de `config/producer` (División de datos públicos y datos privados seguros)
- `[x]` Protección de enlaces premium WAV/Stems (Ocultación del catálogo público e inyección server-side vía API en correos de compra)
- `[x]` Blindaje de transacciones de pago (Restricción de escrituras directas de estado 'approved' a Firestore rules, delegación a la API de confirmación de PayPal)
- `[x]` Retiro del endpoint `/api/gdrive-token` (Desactivación de endpoint expuesto, retorno de código 403)
- `[x]` Migración de subidas a Firebase Storage (Sustitución de subidas de beats a Drive central por subidas nativas y seguras en Firebase Storage)

## 🎨 UI/UX, Legal & Optimización (Backlog)
- `[x]` Resolución de Splits contradictorios en Master y Composición (Cláusula de Prevalencia)
- `[x]` Control de reclamos abusivos de Content ID (Restricción contractual en licencia exclusiva y whitelisting obligatorio)
- `[x]` Cláusula de Limitación de Responsabilidad ante rescisiones unilaterales del productor
- `[x]` Glassmorphism y sombras premium en las tarjetas del catálogo
- `[x]` Integración estricta de tipografías y fuentes mono (JetBrains Mono para cifras y BPM)
- `[x]` Lazy Loading de scripts pesados (`Chart.js`, `jszip`, `pdf.js`, `html2pdf`)
- `[x]` Generación dinámica de Rich Snippets SEO (Estructuras JSON-LD para Beats)

## 🚀 Compilación y Despliegue
- `[x]` Compilar assets de producción localmente con Vite (`npm run build`)
- `[x]` Confirmar y desplegar en producción mediante Vercel
