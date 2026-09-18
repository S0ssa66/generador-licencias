# Módulo de Soporte y Chatbot Inteligente en BEATSS

El sistema cuenta con un chatbot flotante impulsado por IA para guiar a los clientes en la compra de licencias y resolver dudas técnicas.

## 🤖 Componentes del Chatbot

### 1. Interfaz del Usuario (`chatbot.js`)
*   Se carga de forma diferida (*lazy load*) con un delay de `2000ms` tras el evento `load` de la página para acelerar la carga de la tienda principal.
*   **Funcionalidades:**
    *   `beatssChatbot.toggleChat(show)`: Abre/cierra la ventana flotante del chat.
    *   Renderiza mensajes del sistema, usuario y la IA de forma asíncrona.

### 2. Controlador Backend (`/api/support-chat`)
*   Recibe la consulta del usuario y la procesa usando el modelo Gemini (`call_gemini` en `llm_utils.py`).
*   **Personalidad del Asistente:**
    *   Consultor experto en licencias musicales y procesos del SRI (facturación ecuatoriana).

---
*Relacionado:* [[docs/10_Pagos/README]] | [[Dashboard BEATSS]]
