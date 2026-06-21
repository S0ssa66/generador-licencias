// BEATSS Dashboard Copilot Controller
// Integrates local AI (Ollama/LM Studio) and Gemini Cloud as business copilot inside the admin panel.

class DashboardCopilot {
    constructor() {
        this.inputForm = null;
        this.inputField = null;
        this.messageContainer = null;
        this.providerStatus = null;
        this.isTyping = false;
    }

    init() {
        this.inputForm = document.getElementById('copilot-input-form');
        this.inputField = document.getElementById('copilot-input');
        this.messageContainer = document.getElementById('copilot-chat-messages');
        this.providerStatus = document.getElementById('copilot-provider-status');

        if (!this.inputForm || !this.inputField || !this.messageContainer) {
            console.warn('[Copilot] UI elements not found. Delaying initialization...');
            return;
        }

        // Bind form submit
        this.inputForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSend();
        });

        // Bind suggestion buttons click
        document.querySelectorAll('.copilot-suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const query = btn.textContent.trim().replace(/^[📈🎵💳💡]\s*/, '');
                this.sendQuery(query);
            });
        });

        // Initial connection check status text
        if (this.providerStatus) {
            this.providerStatus.textContent = 'IA Copilot Lista';
        }
    }

    appendMessage(text, sender) {
        if (!this.messageContainer) return;

        const msgWrapper = document.createElement('div');
        msgWrapper.className = 'flex items-start gap-2';

        const isUser = sender === 'user';
        
        let avatarHTML = '';
        if (isUser) {
            avatarHTML = `
                <div class="w-7 h-7 rounded-full bg-neon-blue/20 border border-neon-blue/30 flex items-center justify-center text-neon-blue mt-0.5 flex-shrink-0 order-2">
                    <span class="material-symbols-outlined text-[14px]">person</span>
                </div>
            `;
        } else {
            avatarHTML = `
                <div class="w-7 h-7 rounded-full bg-electric-purple/20 border border-electric-purple/30 flex items-center justify-center text-electric-purple mt-0.5 flex-shrink-0">
                    <span class="material-symbols-outlined text-[14px]">psychology</span>
                </div>
            `;
        }

        // Parse simple markdown rules (bold, italic, lists, and line breaks)
        let formattedText = window.sanitizeHtml ? window.sanitizeHtml(text) : text;
        
        // Restore formatting safely after sanitization
        formattedText = formattedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc">$1</li>')
            .replace(/\n/g, '<br/>');

        const bubbleHTML = `
            <div class="${isUser ? 'bg-neon-blue/10 border border-neon-blue/20' : 'bg-white/5 border border-white/5'} text-on-surface text-[13px] rounded-lg px-3 py-2 max-w-[85%] leading-relaxed ${isUser ? 'order-1 ml-auto' : ''}">
                ${formattedText}
            </div>
        `;

        msgWrapper.innerHTML = isUser ? bubbleHTML + avatarHTML : avatarHTML + bubbleHTML;
        
        // Remove typing indicator if active
        this.hideTyping();

        this.messageContainer.appendChild(msgWrapper);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    showTyping() {
        if (this.isTyping || !this.messageContainer) return;
        this.isTyping = true;

        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'flex items-start gap-2';
        typingIndicator.id = 'copilot-typing-indicator';
        typingIndicator.innerHTML = `
            <div class="w-7 h-7 rounded-full bg-electric-purple/20 border border-electric-purple/30 flex items-center justify-center text-electric-purple mt-0.5 flex-shrink-0">
                <span class="material-symbols-outlined text-[14px]">psychology</span>
            </div>
            <div class="bg-white/5 border border-white/5 text-on-surface-variant text-[13px] rounded-lg px-3 py-2 flex items-center gap-1">
                <span class="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce" style="animation-delay: 0.1s"></span>
                <span class="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce" style="animation-delay: 0.2s"></span>
                <span class="w-1.5 h-1.5 bg-on-surface-variant rounded-full animate-bounce" style="animation-delay: 0.3s"></span>
            </div>
        `;

        this.messageContainer.appendChild(typingIndicator);
        this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
    }

    hideTyping() {
        const ind = document.getElementById('copilot-typing-indicator');
        if (ind) ind.remove();
        this.isTyping = false;
    }

    async sendQuery(text) {
        if (!text.trim()) return;

        this.showTyping();

        try {
            const response = await fetch('/api/admin/copilot', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message: text })
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            this.hideTyping();

            if (data && data.status === 'success' && data.response) {
                this.appendMessage(data.response, 'bot');
                
                // Update active provider name in status UI
                if (this.providerStatus && data.provider) {
                    this.providerStatus.textContent = `IA: ${data.provider}`;
                }
            } else {
                throw new Error('Respuesta inválida del servidor');
            }

        } catch (error) {
            console.error('[Copilot] Error sending query:', error);
            this.hideTyping();
            this.appendMessage('Lo siento sossa, hubo un problema al conectar con tu Copiloto Financiero local. Por favor verifica que Ollama esté encendido.', 'bot');
            if (this.providerStatus) {
                this.providerStatus.textContent = 'IA Desconectada';
            }
        }
    }

    handleSend() {
        if (!this.inputField) return;
        const text = this.inputField.value.trim();
        if (!text) return;

        this.inputField.value = '';
        this.appendMessage(text, 'user');
        this.sendQuery(text);
    }
}

// Global instantiation
window.beatssDashboardCopilot = new DashboardCopilot();

// Automatically init Copilot when dashboard is loaded/pushed
document.addEventListener('DOMContentLoaded', () => {
    window.beatssDashboardCopilot.init();
});

// Fallback init trigger in case dashboard tabs dynamically reload content
const tabDashboardBtn = document.getElementById('tab-dashboard-btn');
if (tabDashboardBtn) {
    tabDashboardBtn.addEventListener('click', () => {
        setTimeout(() => {
            window.beatssDashboardCopilot.init();
        }, 100);
    });
}
export default window.beatssDashboardCopilot;
