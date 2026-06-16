// Asistente Virtual y Centro de Ayuda para BEATSS
// Soporte bilingüe automático integrado con el historial de compras del usuario

const chatbotData = {
    es: {
        botName: "Soporte BEATSS",
        greeting: "¡Hola! Soy tu Asistente Virtual de BEATSS. ¿En qué puedo ayudarte hoy?",
        placeholder: "Escribe tu pregunta aquí...",
        onlineStatus: "En línea",
        quickReplies: [
            { text: "🛡️ Reclamo de Content ID", value: "content_id" },
            { text: "🎵 Formatos de Archivo", value: "formats" },
            { text: "📈 Splits y Regalías (PROs)", value: "royalties" },
            { text: "💳 Métodos de Pago", value: "payments" },
            { text: "🔑 Código VIP / Descuentos", value: "vip" }
        ],
        typing: "Escribiendo...",
        defaultReply: "No estoy seguro de haber entendido tu pregunta. Por favor, selecciona una de las opciones rápidas o intenta con palabras clave como 'contrato', 'exclusiva', 'streams' o 'pago'.",
        answers: {
            content_id: () => {
                const licenses = window.licenseHistory || [];
                let disputeText = "";
                if (licenses.length > 0) {
                    const latestLic = licenses[0];
                    disputeText = `\n\n**¡Detectamos tu licencia reciente!** Puedes usar el siguiente texto para tu disputa:\n\n*\"Tengo los derechos de explotación comercial de esta obra bajo una licencia de uso otorgada por el productor sossa en BEATSS. Código de referencia de licencia: ${latestLic.refCode} para el beat '${latestLic.beatName}'.\"*`;
                } else {
                    disputeText = `\n\nSi has comprado una licencia, puedes incluir tu código de factura/transacción en tu disputa de YouTube. Ej: *\"Licencia de BEATSS, Transacción ID: [TU_CÓDIGO_AQUÍ]\"*.`;
                }

                return `**Disputas de Derechos de Autor (Content ID)**:
                
                Si recibiste un reclamo en YouTube, ¡no te preocupes! Sigue estos pasos:
                1. Ve a **YouTube Studio > Reclamaciones**.
                2. Haz clic en **Disputar** en el video afectado.
                3. Selecciona **Tengo una licencia o permiso por escrito**.
                4. Pega la justificación del contrato:${disputeText}
                
                Las distribuidoras suelen retirar los reclamos de forma automática en 24-72 horas.`;
            },
            formats: () => `**Formatos de Archivo Entregados**:
            
            Depende de la licencia que elijas:
            * **Básica**: Archivo MP3 (320kbps).
            * **Premium**: MP3 y WAV de calidad de estudio (24-bit).
            * **Premium Plus**: MP3, WAV y Stems/Trackouts (pistas separadas por instrumento).
            * **Ilimitada**: MP3, WAV, Stems y el archivo de proyecto de FL Studio (.flp).
            * **Exclusiva**: Todos los anteriores de forma perpetua.`,
            
            royalties: () => `**Splits y Registro en PROs (ASCAP, BMI, etc.)**:
            
            Al registrar tu canción (obra derivada) en tu PRO (SAYCO, BMI, ASCAP, SACM):
            1. Regístrate como **Compositor de Letra (Writer)** con un **50%** de participación.
            2. Registra al productor **sossa** como **Compositor de Música (Composer)** con el **50%** restante.
            
            *La información de registro (IPI, PRO, Nombre Legal del productor) se autocompleta e inyecta al final de tu contrato PDF tras realizar la compra.*`,
            
            payments: () => `**Métodos de Pago Soportados**:
            
            * **Ecuador (Local)**: Aceptamos **Deuna!** y transferencias a Banco Pichincha/Guayaquil. Al pagar con Deuna!, el sistema lee la confirmación automáticamente y te entrega la licencia en segundos sin subir capturas.
            * **Internacional**: PayPal, Tarjetas de Crédito/Débito.
            * Puedes simular un pago Deuna! en desarrollo con el botón de simulación del checkout.`,
            
            vip: () => `**Códigos VIP y Promociones**:
            
            * Si tienes un código de cortesía o código VIP, puedes ingresarlo en el carrito de compras en la sección de código de descuento para obtener tu descuento o acceso instantáneo al plan Pro.
            * Los códigos VIP deben ser validados por el sistema antes de confirmar la orden.`
        },
        keywords: [
            { words: ["reclamo", "disputa", "copyright", "claim", "youtube", "content", "id"], answerKey: "content_id" },
            { words: ["formato", "mp3", "wav", "stems", "trackout", "flp", "fl studio", "calidad"], answerKey: "formats" },
            { words: ["regalia", "split", "pro", "ascap", "bmi", "sayco", "sacm", "compositor", "derechos"], answerKey: "royalties" },
            { words: ["pago", "deuna", "banco", "pichincha", "guayaquil", "tarjeta", "paypal", "efectivo"], answerKey: "payments" },
            { words: ["vip", "descuento", "codigo", "cupon", "gratis", "promocion"], answerKey: "vip" }
        ]
    },
    en: {
        botName: "BEATSS Support",
        greeting: "Hi! I am your BEATSS Virtual Assistant. How can I help you today?",
        placeholder: "Type your question here...",
        onlineStatus: "Online",
        quickReplies: [
            { text: "🛡️ Content ID Claim", value: "content_id" },
            { text: "🎵 File Formats", value: "formats" },
            { text: "📈 Splits & Royalties (PROs)", value: "royalties" },
            { text: "💳 Payment Methods", value: "payments" },
            { text: "🔑 VIP Code / Discounts", value: "vip" }
        ],
        typing: "Typing...",
        defaultReply: "I didn't quite catch that. Please select one of the quick options or try using keywords like 'contract', 'exclusive', 'streams', or 'payment'.",
        answers: {
            content_id: () => {
                const licenses = window.licenseHistory || [];
                let disputeText = "";
                if (licenses.length > 0) {
                    const latestLic = licenses[0];
                    disputeText = `\n\n**We detected your recent license!** You can use this text for your dispute:\n\n*\"I hold commercial exploitation rights for this work under a usage license granted by producer sossa via BEATSS. License reference code: ${latestLic.refCode} for the beat '${latestLic.beatName}'.\"*`;
                } else {
                    disputeText = `\n\nIf you have purchased a license, you can include your transaction/invoice code in your YouTube dispute. E.g.: *\"BEATSS License, Transaction ID: [YOUR_CODE_HERE]\"*.`;
                }

                return `**Copyright Claims (YouTube Content ID)**:
                
                If you received a claim on YouTube, don't worry! Follow these steps:
                1. Go to **YouTube Studio > Content > Claims**.
                2. Click on **Dispute** on the affected video.
                3. Choose **My use of this material does not infringe copyright / I have a license**.
                4. Paste the justification text:${disputeText}
                
                Distributors usually release claims automatically within 24-72 hours.`;
            },
            formats: () => `**Delivered File Formats**:
            
            Depending on your chosen license:
            * **Basic**: High-quality MP3 file (320kbps).
            * **Premium**: MP3 and studio-quality WAV (24-bit).
            * **Premium Plus**: MP3, WAV, and Stems/Trackouts (individual tracks separated by instrument).
            * **Unlimited**: MP3, WAV, Stems, and the FL Studio project file (.flp).
            * **Exclusive**: All formats with lifetime ownership.`,
            
            royalties: () => `**Splits & Registering in PROs (ASCAP, BMI, etc.)**:
            
            When registering your song (derivative work) in your PRO (BMI, ASCAP, PRS, etc.):
            1. Register yourself as the **Lyricist/Writer** with **50%** share.
            2. Register producer **sossa** as **Composer/Music Writer** with the remaining **50%**.
            
            *The registration info (IPI, PRO, Producer's Legal Name) is automatically generated and attached to the end of your contract PDF after purchase.*`,
            
            payments: () => `**Supported Payment Methods**:
            
            * **Ecuador (Local)**: We accept **Deuna!** and Pichincha/Guayaquil bank transfers. Payments made via Deuna! are automatically verified in seconds, unlocking download pages instantly without manual receipt uploads.
            * **International**: PayPal, Credit/Debit Cards.
            * You can test Deuna! payments in development using the simulator button in the checkout modal.`,
            
            vip: () => `**VIP Codes & Promotions**:
            
            * If you hold a promo code or a VIP code, you can input it in the cart discount code box to get your discount or gain instant access to the Pro tier.
            * VIP codes must be validated by the system before checkout completion.`
        },
        keywords: [
            { words: ["claim", "dispute", "copyright", "youtube", "content", "id", "strike", "reclamacion"], answerKey: "content_id" },
            { words: ["format", "mp3", "wav", "stems", "trackout", "flp", "fl studio", "quality", "files"], answerKey: "formats" },
            { words: ["royalty", "royalties", "split", "splits", "pro", "ascap", "bmi", "composer", "writer", "publishing"], answerKey: "royalties" },
            { words: ["payment", "pay", "deuna", "bank", "card", "paypal", "checkout", "transaction"], answerKey: "payments" },
            { words: ["vip", "discount", "coupon", "code", "free", "promo"], answerKey: "vip" }
        ]
    }
};

class BEATSSChatbot {
    constructor() {
        this.isOpen = false;
        this.lang = window.currentLang || 'es';
    }

    init() {
        this.lang = window.currentLang || 'es';
        
        // Remove existing if any (avoid duplicate injections)
        const existingContainer = document.getElementById('beatss-chatbot-container');
        if (existingContainer) existingContainer.remove();

        const container = document.createElement('div');
        container.id = 'beatss-chatbot-container';
        container.innerHTML = `
            <!-- Chat Widget Trigger (FAB) -->
            <button id="chatbot-fab" class="chatbot-fab" title="${this.lang === 'es' ? 'Ayuda y Soporte' : 'Help & Support'}">
                <i data-lucide="message-square" class="fab-icon-open"></i>
                <i data-lucide="x" class="fab-icon-close" style="display: none;"></i>
            </button>

            <!-- Chat Window -->
            <div id="chatbot-window" class="chatbot-window" style="display: none;">
                <div class="chatbot-header">
                    <div class="chatbot-header-info">
                        <div class="chatbot-avatar">
                            <i data-lucide="shield-check" class="avatar-icon"></i>
                            <span class="avatar-status"></span>
                        </div>
                        <div>
                            <h4 id="chatbot-header-title">${chatbotData[this.lang].botName}</h4>
                            <p class="chatbot-status">${chatbotData[this.lang].onlineStatus}</p>
                        </div>
                    </div>
                    <button id="chatbot-close-btn" class="chatbot-close-btn">
                        <i data-lucide="minus"></i>
                    </button>
                </div>
                
                <div id="chatbot-messages" class="chatbot-messages">
                    <!-- Messages will appear here -->
                </div>
                
                <div class="chatbot-quick-replies" id="chatbot-quick-replies">
                    <!-- Quick replies buttons -->
                </div>

                <form id="chatbot-input-form" class="chatbot-input-container">
                    <input type="text" id="chatbot-input" placeholder="${chatbotData[this.lang].placeholder}" autocomplete="off" />
                    <button type="submit" id="chatbot-send-btn">
                        <i data-lucide="send"></i>
                    </button>
                </form>
            </div>
        `;
        document.body.appendChild(container);

        // Bind events
        document.getElementById('chatbot-fab').addEventListener('click', () => this.toggleChat());
        document.getElementById('chatbot-close-btn').addEventListener('click', () => this.toggleChat(false));
        document.getElementById('chatbot-input-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSend();
        });

        if (window.lucide) window.lucide.createIcons();

        // Render initial greeting and quick replies
        this.resetChat();
    }

    toggleChat(show = null) {
        const chatWindow = document.getElementById('chatbot-window');
        const fab = document.getElementById('chatbot-fab');
        const openIcon = fab.querySelector('.fab-icon-open');
        const closeIcon = fab.querySelector('.fab-icon-close');

        this.isOpen = show !== null ? show : !this.isOpen;

        if (this.isOpen) {
            chatWindow.style.display = 'flex';
            openIcon.style.display = 'none';
            closeIcon.style.display = 'block';
            chatWindow.classList.add('active');
            document.getElementById('chatbot-input').focus();
        } else {
            chatWindow.style.display = 'none';
            openIcon.style.display = 'block';
            closeIcon.style.display = 'none';
            chatWindow.classList.remove('active');
        }
    }

    resetChat() {
        this.lang = window.currentLang || 'es';
        const msgArea = document.getElementById('chatbot-messages');
        msgArea.innerHTML = '';
        
        // Greet
        this.appendMessage(chatbotData[this.lang].greeting, 'bot');
        this.renderQuickReplies();
    }

    renderQuickReplies() {
        const container = document.getElementById('chatbot-quick-replies');
        container.innerHTML = '';
        
        chatbotData[this.lang].quickReplies.forEach(qr => {
            const btn = document.createElement('button');
            btn.className = 'chatbot-qr-btn';
            btn.textContent = qr.text;
            btn.addEventListener('click', () => {
                this.appendMessage(qr.text, 'user');
                this.triggerTyping(() => {
                    const ansFn = chatbotData[this.lang].answers[qr.value];
                    if (ansFn) {
                        this.appendMessage(ansFn(), 'bot');
                    }
                });
            });
            container.appendChild(btn);
        });
    }

    appendMessage(text, sender) {
        const msgArea = document.getElementById('chatbot-messages');
        const msg = document.createElement('div');
        msg.className = `chatbot-msg chatbot-msg-${sender}`;
        
        // Formato simple Markdown para negritas
        let formattedText = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br/>');

        msg.innerHTML = formattedText;
        msgArea.appendChild(msg);
        msgArea.scrollTop = msgArea.scrollHeight;
    }

    triggerTyping(callback) {
        const msgArea = document.getElementById('chatbot-messages');
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'chatbot-msg chatbot-msg-bot chatbot-typing';
        typingIndicator.id = 'chatbot-typing-indicator';
        typingIndicator.innerHTML = `
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        `;
        msgArea.appendChild(typingIndicator);
        msgArea.scrollTop = msgArea.scrollHeight;

        setTimeout(() => {
            const ind = document.getElementById('chatbot-typing-indicator');
            if (ind) ind.remove();
            callback();
        }, 900);
    }

    handleSend() {
        const input = document.getElementById('chatbot-input');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        this.appendMessage(text, 'user');

        this.triggerTyping(() => {
            const response = this.findResponse(text);
            this.appendMessage(response, 'bot');
        });
    }

    findResponse(text) {
        this.lang = window.currentLang || 'es';
        const lowerText = text.toLowerCase();

        // Search in keywords
        const list = chatbotData[this.lang].keywords;
        for (const item of list) {
            if (item.words.some(word => lowerText.includes(word))) {
                const ansFn = chatbotData[this.lang].answers[item.answerKey];
                if (ansFn) return ansFn();
            }
        }

        return chatbotData[this.lang].defaultReply;
    }

    // Adapt window translation toggle triggers to rebuild chatbot content dynamically
    updateLanguage() {
        const currentLang = window.currentLang || 'es';
        if (this.lang !== currentLang) {
            this.lang = currentLang;
            this.init();
        }
    }
}

// Instantiate and bind to window
window.beatssChatbot = new BEATSSChatbot();

export function initChatbot() {
    window.beatssChatbot.init();
}

window.initChatbot = initChatbot;

// Listener to check language changes dynamically
window.addEventListener('languageChanged', () => {
    if (window.beatssChatbot) {
        window.beatssChatbot.updateLanguage();
    }
});
