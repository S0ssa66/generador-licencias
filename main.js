import { LICENSE_CONFIGS, SEED_LICENSES, DEFAULT_TEMPLATES } from './config.js';
import { TRANSLATIONS, UI_TRANSLATIONS } from './i18n.js';
import { 
    auth, 
    db, 
    storage,
    googleProvider,
    signOut,
    linkWithPopup,
    unlink,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "./firebase.js";
import './auth.js';
import './player.js';
import './catalog.js';
import './checkout.js';
import './editor.js';
import './dashboard.js';
import './chatbot.js';

// Alias locales para funciones en otros módulos asignadas al objeto global window
const checkDocuSignOAuth = (...args) => window.checkDocuSignOAuth(...args);
const loadTemplates = (...args) => window.loadTemplates(...args);
const loadContacts = (...args) => window.loadContacts(...args);
const initBeatsDB = (...args) => window.initBeatsDB(...args);
const selectLicenseType = (...args) => window.selectLicenseType(...args);
const loadFormDraft = (...args) => window.loadFormDraft(...args);
const loadReferralData = (...args) => window.loadReferralData(...args);
const loadSalesData = (...args) => window.loadSalesData(...args);
const requestNotificationPermission = (...args) => window.requestNotificationPermission(...args);
const loadPlatformGDriveStatus = (...args) => window.loadPlatformGDriveStatus(...args);
const updateGoogleLoginLinkStatus = (...args) => window.updateGoogleLoginLinkStatus(...args);
const getGdriveToken = (...args) => window.getGdriveToken(...args);
const getOrCreateDriveFolder = (...args) => window.getOrCreateDriveFolder(...args);
const triggerReferralConversion = (...args) => window.triggerReferralConversion(...args);
const registerLanguageToggle = (...args) => window.registerLanguageToggle(...args);
const renderBeatsGrid = (...args) => window.renderBeatsGrid(...args);
const updateGenreAndKeyFilters = (...args) => window.updateGenreAndKeyFilters(...args);
const loadConsolidatedAccounting = (...args) => window.loadConsolidatedAccounting(...args);
const updateDashboardView = (...args) => window.updateDashboardView(...args);
const handleFolderImport = (...args) => window.handleFolderImport(...args);
const dataURLtoBlob = (...args) => window.dataURLtoBlob(...args);
const uploadFileToStorage = (...args) => window.uploadFileToStorage(...args);
const loadTemplateToEditor = (...args) => window.loadTemplateToEditor(...args);
const saveTemplateCustom = (...args) => window.saveTemplateCustom(...args);
const resetTemplateCustom = (...args) => window.resetTemplateCustom(...args);
const generateReferenceCode = (...args) => window.generateReferenceCode(...args);
const checkPayphoneRedirectResult = (...args) => window.checkPayphoneRedirectResult(...args);
const renderGlobalBeats = (...args) => window.renderGlobalBeats(...args);
const renderStoreBeats = (...args) => window.renderStoreBeats(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const initPlatformGDriveOAuth = (...args) => window.initPlatformGDriveOAuth(...args);

// Estado global de la aplicación
let currentLang = 'es';
window.currentLang = currentLang;
Object.defineProperty(window, 'currentLang', {
    get: () => currentLang,
    set: (val) => { currentLang = val; }
});
let localBeats = [];
window.localBeats = localBeats;
Object.defineProperty(window, 'localBeats', {
    get: () => localBeats,
    set: (val) => { localBeats = val; }
});

// Cargar scripts externos de forma diferida (Lazy Loading)
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

const REAL_FEED_ITEMS = [
    {
        buyer: "Marlon Velez",
        type: "purchase",
        detail: "Choque",
        licenseType: "basic",
        value: "+$33.60",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Wilmer Reyes",
        type: "signature",
        detail: "Contrato firmado electrónicamente",
        value: "1m ago",
        icon: "edit_note",
        colorClass: "bg-neon-blue/10 text-neon-blue border-neon-blue/20"
    },
    {
        buyer: "LucDuck Aguilera",
        type: "purchase",
        detail: "Hot",
        licenseType: "premium",
        value: "+$67.20",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Hernán Jair Nogales",
        type: "delivery",
        detail: "WAV + Stems enviados",
        value: "3m ago",
        icon: "send",
        colorClass: "bg-elite-gold/10 text-elite-gold border-elite-gold/20"
    },
    {
        buyer: "Cristian Valderrama",
        type: "purchase",
        detail: "Type Beat Jombriel",
        licenseType: "basic",
        value: "+$33.60",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Mel Morales",
        type: "signature",
        detail: "Contrato firmado electrónicamente",
        value: "8m ago",
        icon: "edit_note",
        colorClass: "bg-neon-blue/10 text-neon-blue border-neon-blue/20"
    },
    {
        buyer: "ALEX OSORIO",
        type: "purchase",
        detail: "Fire",
        licenseType: "basic",
        value: "+$33.60",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Luis Tenorio Olaya",
        type: "purchase",
        detail: "Tussi",
        licenseType: "premium",
        value: "+$67.20",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Mvsul Beats",
        type: "purchase",
        detail: "Fire",
        licenseType: "basic",
        value: "+$16.80",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    },
    {
        buyer: "Bruno Rodriguez",
        type: "signature",
        detail: "Contrato firmado electrónicamente",
        value: "15m ago",
        icon: "edit_note",
        colorClass: "bg-neon-blue/10 text-neon-blue border-neon-blue/20"
    },
    {
        buyer: "Kevin Calderon",
        type: "purchase",
        detail: "Thoing",
        licenseType: "basic",
        value: "+$33.60",
        icon: "description",
        colorClass: "bg-electric-purple/10 text-electric-purple border-electric-purple/20"
    }
];

function getInitials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

function initializeFeedTimestamps() {
    let savedTimestamps = localStorage.getItem('beatss_feed_timestamps');
    const now = Date.now();
    
    if (!savedTimestamps) {
        // Desfases iniciales para compradores estáticos
        const offsets = {
            "Wilmer Reyes": 1,
            "Hernán Jair Nogales": 3,
            "Mel Morales": 8,
            "Bruno Rodriguez": 15
        };
        
        const timestamps = {};
        for (const [name, minOffset] of Object.entries(offsets)) {
            timestamps[name] = now - minOffset * 60 * 1000;
        }
        
        localStorage.setItem('beatss_feed_timestamps', JSON.stringify(timestamps));
        savedTimestamps = JSON.stringify(timestamps);
    }
    
    return JSON.parse(savedTimestamps);
}

function renderLiveLicensesFeed() {
    const feedContainer = document.getElementById('live-licenses-feed');
    if (!feedContainer) return;

    // Duplicar elementos para que el bucle de scroll sea infinito y fluido
    const doubledItems = [...REAL_FEED_ITEMS, ...REAL_FEED_ITEMS];
    const feedTimestamps = initializeFeedTimestamps();
    
    feedContainer.innerHTML = doubledItems.map(item => {
        let actionText = "";
        let descText = "";

        if (item.type === 'purchase') {
            const licName = item.licenseType === 'basic' 
                ? (currentLang === 'es' ? 'Licencia Básica' : 'Basic License')
                : (currentLang === 'es' ? 'Licencia Premium' : 'Premium License');
            actionText = currentLang === 'es' 
                ? `Adquirió ${licName}` 
                : `Purchased ${licName}`;
            descText = `Beat: "${item.detail}"`;
        } else if (item.type === 'signature') {
            actionText = currentLang === 'es' 
                ? 'Firmó Contrato Digital' 
                : 'Signed Digital Contract';
            descText = currentLang === 'es' 
                ? 'Validado vía DocuSign' 
                : 'Verified via DocuSign';
        } else if (item.type === 'delivery') {
            actionText = currentLang === 'es' 
                ? 'Entrega VIP: WAV + Stems' 
                : 'VIP Delivery: WAV + Stems';
            descText = currentLang === 'es' 
                ? 'Archivos de audio entregados' 
                : 'Audio files delivered';
        }

        const isGreenValue = item.type === 'purchase';
        let valueDisplay = item.value;

        if (!isGreenValue) {
            const itemTimestamp = feedTimestamps[item.buyer];
            if (itemTimestamp) {
                const diffMs = Date.now() - itemTimestamp;
                const diffMin = Math.floor(diffMs / (60 * 1000));
                
                if (diffMin < 1) {
                    valueDisplay = currentLang === 'es' ? 'Hace un momento' : 'Just now';
                } else if (diffMin < 60) {
                    valueDisplay = currentLang === 'es' ? `${diffMin}m atrás` : `${diffMin}m ago`;
                } else {
                    const diffHours = Math.floor(diffMin / 60);
                    if (diffHours < 24) {
                        valueDisplay = currentLang === 'es' ? `${diffHours}h atrás` : `${diffHours}h ago`;
                    } else {
                        const diffDays = Math.floor(diffHours / 24);
                        if (diffDays < 30) {
                            if (diffDays === 1) {
                                valueDisplay = currentLang === 'es' ? 'Ayer' : 'Yesterday';
                            } else {
                                valueDisplay = currentLang === 'es' ? `${diffDays} días atrás` : `${diffDays} days ago`;
                            }
                        } else {
                            const diffMonths = Math.floor(diffDays / 30);
                            if (diffMonths < 12) {
                                if (diffMonths === 1) {
                                    valueDisplay = currentLang === 'es' ? 'Hace 1 mes' : '1 month ago';
                                } else {
                                    valueDisplay = currentLang === 'es' ? `${diffMonths} meses atrás` : `${diffMonths} months ago`;
                                }
                            } else {
                                const diffYears = Math.floor(diffMonths / 12);
                                if (diffYears === 1) {
                                    valueDisplay = currentLang === 'es' ? 'Hace 1 año' : '1 year ago';
                                } else {
                                    valueDisplay = currentLang === 'es' ? `${diffYears} años atrás` : `${diffYears} years ago`;
                                }
                            }
                        }
                    }
                }
            } else {
                valueDisplay = currentLang === 'es' ? item.value.replace('ago', 'atrás') : item.value;
            }
        }


        return `
            <div class="relative z-10 p-5 bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.04] hover:border-white/[0.08] rounded-xl flex items-center gap-5 transition-all duration-300 transform hover:scale-[1.02] cursor-pointer group">
                <div class="relative flex-shrink-0">
                    <div class="w-14 h-14 rounded-full live-avatar-bubble border border-white/10 flex items-center justify-center font-bold text-base text-white shadow-inner" style="background-color: #181e2a !important;">
                        ${getInitials(item.buyer)}
                    </div>
                    <span class="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center border border-[#0b0e14] ${item.colorClass} shadow-md z-20" style="z-index: 20;">
                        <span class="material-symbols-outlined text-xs">${item.icon}</span>
                    </span>
                </div>
                <div class="min-w-0 flex-1">
                    <p class="text-lg font-bold text-on-surface truncate">${item.buyer}</p>
                    <p class="text-base text-on-surface-variant truncate">${actionText} • <span class="opacity-70">${descText}</span></p>
                </div>
                <span class="ml-auto flex-shrink-0 font-data-mono ${isGreenValue ? 'text-lg text-success-green font-bold drop-shadow-[0_0_12px_rgba(16,185,129,0.55)]' : 'text-sm text-on-surface-variant'}">
                    ${valueDisplay}
                </span>
            </div>
        `;
    }).join('');
}

function updateUILanguage() {
    if (!UI_TRANSLATIONS) return;
    const trans = UI_TRANSLATIONS[currentLang];
    if (!trans) return;

    // 1. Traducir elementos con data-i18n
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translation = trans[key];
        if (translation !== undefined) {
            if (translation.includes('<') && translation.includes('>')) {
                el.innerHTML = translation;
            } else {
                el.textContent = translation;
            }
        }
    });

    // 2. Traducir placeholders
    const placeholders = document.querySelectorAll('[data-i18n-placeholder]');
    placeholders.forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translation = trans[key];
        if (translation !== undefined) {
            el.setAttribute('placeholder', translation);
        }
    });

    // 3. Traducir títulos y tooltips
    const titles = document.querySelectorAll('[data-i18n-title]');
    titles.forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translation = trans[key];
        if (translation !== undefined) {
            el.setAttribute('title', translation);
            if (el.hasAttribute('data-tooltip')) {
                el.setAttribute('data-tooltip', translation);
            }
        }
    });

    // 4. Actualizar textos de conmutación de idioma
    const langLabel = currentLang.toUpperCase();
    ['landing-btn-language', 'catalog-btn-language', 'lang-icon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = langLabel;
        }
    });

    // 5. Refrescar vistas y datos que dependen del idioma
    if (typeof renderGlobalBeats === 'function' && window.filteredGlobalBeats) {
        renderGlobalBeats(window.filteredGlobalBeats);
    }
    if (typeof renderStoreBeats === 'function' && window.storeBeats) {
        renderStoreBeats(window.storeBeats);
    }
    if (typeof updateHistoryTable === 'function') {
        updateHistoryTable();
    }
    if (typeof generatePreview === 'function') {
        generatePreview();
    }
    if (typeof renderLiveLicensesFeed === 'function') {
        renderLiveLicensesFeed();
    }
}
window.updateUILanguage = updateUILanguage;

// Convertir enlaces de Google Drive a enlaces a través de nuestro proxy de audio (para evitar restricciones de CORS y CORP de Google)
function getGDriveDirectLink(url) {
    if (!url) return '';
    
    // Si ya es un enlace a nuestro proxy, devolverlo
    if (url.includes('/api/proxy-audio')) {
        return url;
    }
    
    let fileId = null;
    
    // Extraer fileId del enlace uc o docs
    if (url.includes('drive.google.com/uc') || url.includes('docs.google.com/uc')) {
        const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
        if (idMatch && idMatch[1]) fileId = idMatch[1];
    } else {
        const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
        if (match && match[1]) {
            fileId = match[1];
        } else {
            const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) fileId = idMatch[1];
        }
    }
    
    if (fileId) {
        return `/api/proxy-audio?id=${fileId}`;
    }
    
    return url;
}
window.getGDriveDirectLink = getGDriveDirectLink;

// Configuración de Productor por defecto
let producerConfig = {
    name: "Joao David Dominguez",
    aka: "Sossa",
    email: "masterjuego25@gmail.com",
    phone: "+593961201184",
    place: "Quito, Ecuador",
    id: "0803743111",
    pro: "BMI",
    ipi: "01170943066",
    publisher: "Songtrust",
    address: "Esmeraldas - Ecuador",
    birthdate: "2001-07-06",
    dsClientId: "",
    dsAccountId: "",
    dsEnv: "demo",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsPublicKey: "",
    gdriveClientId: "216966055009-03rjdnq87uh3h15e3qfglp2pnmos9t5k.apps.googleusercontent.com",
    storageProvider: "gdrive-central"
};
window.producerConfig = producerConfig;

// Historial de licencias
let licenseHistory = [];
window.licenseHistory = licenseHistory;
Object.defineProperty(window, 'licenseHistory', {
    get: () => licenseHistory,
    set: (val) => { licenseHistory = val; }
});

// Contactos de clientes
let contactsList = [];
window.contactsList = contactsList;
Object.defineProperty(window, 'contactsList', {
    get: () => contactsList,
    set: (val) => { contactsList = val; }
});

// Estado del plan de suscripción del usuario actual
let currentUploadedReceiptBase64 = null;
let activeTemplates = [];
window.activeTemplates = activeTemplates;
Object.defineProperty(window, 'activeTemplates', {
    get: () => activeTemplates,
    set: (val) => { activeTemplates = val; }
});
window.currentUserIsPro = false;

// Funciones globales de apertura y cierre del modal de pago (actualización a Pro)
window.openPaymentModal = function(warningMessage = null) {
    const modal = document.getElementById('payment-modal');
    const warningDiv = document.getElementById('payment-modal-warning');
    const warningText = document.getElementById('payment-modal-warning-text');
    
    if (warningDiv && warningText) {
        if (warningMessage) {
            warningText.textContent = warningMessage;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }
    }
    if (modal) {
        modal.style.display = 'flex';
        modal.scrollTop = 0;
    }
    safeCreateIcons();
};

window.closePaymentModal = function() {
    const modal = document.getElementById('payment-modal');
    if (modal) modal.style.display = 'none';
};

window.openSupportModal = function(tabName) {
    const modal = document.getElementById('support-info-modal');
    if (modal) {
        modal.style.display = 'flex';
        if (tabName) {
            window.switchSupportTab(tabName);
        }
        if (typeof window.safeCreateIcons === 'function') {
            window.safeCreateIcons();
        }
    }
};

window.closeSupportModal = function() {
    const modal = document.getElementById('support-info-modal');
    if (modal) modal.style.display = 'none';
};

window.switchSupportTab = function(tabName) {
    // Desactivar todas las pestañas y ocultar contenidos
    document.querySelectorAll('.support-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.support-tab-content').forEach(content => {
        content.style.display = 'none';
    });
    
    // Activar pestaña y mostrar contenido seleccionado
    const activeBtn = document.getElementById('btn-support-tab-' + tabName);
    const activeContent = document.getElementById('support-content-' + tabName);
    if (activeBtn && activeContent) {
        activeBtn.classList.add('active');
        activeContent.style.display = 'block';
    }
    if (typeof window.safeCreateIcons === 'function') {
        window.safeCreateIcons();
    }
};

// Contar licencias generadas este mes para Plan Inicial
function getLicensesThisMonthCount() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const prefix = `${year}-${month}`; // Ej: "2026-06"
    return licenseHistory.filter(lic => lic.date && lic.date.startsWith(prefix)).length;
}

// Comprobar si se ha excedido el límite del Plan Inicial
function checkPlanLimitExceeded(actionName = 'generar una nueva licencia') {
    if (window.currentUserIsPro) return false;
    
    const count = getLicensesThisMonthCount();
    if (count >= 3) {
        openPaymentModal(`Límite alcanzado: Has generado el límite de 3 licencias del Plan Inicial este mes (${count}/3 usadas). Mejora al Plan Pro hoy para generar licencias ilimitadas.`);
        return true;
    }
    return false;
}

// Actualizar la interfaz de usuario con la información de Plan Pro, Plan Elite o Plan Inicial
function updatePlanUI() {
    window.currentUserIsPro = (producerConfig && (producerConfig.plan === 'pro' || producerConfig.plan === 'elite')) || window.currentUserIsAdmin;
    
    // Aplicar tema de color al contrato PDF
    document.body.classList.remove('contract-theme-purple', 'contract-theme-red', 'contract-theme-cyan', 'contract-theme-blue', 'contract-theme-charcoal', 'contract-theme-gold');
    if (window.currentUserIsPro && producerConfig && producerConfig.contractColor && producerConfig.contractColor !== 'default') {
        document.body.classList.add(`contract-theme-${producerConfig.contractColor}`);
    }
    
    const container = document.getElementById('plan-badge-container');
    if (container) {
        if (producerConfig && producerConfig.plan === 'elite') {
            container.innerHTML = `
                <span class="plan-badge elite-badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(236, 72, 153, 0.15); border: 1px solid rgba(236, 72, 153, 0.35); border-radius: 100px; color: #ec4899; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i data-lucide="crown" style="width: 10px; height: 10px;"></i> Elite
                </span>
            `;
        } else if (window.currentUserIsPro) {
            container.innerHTML = `
                <span class="plan-badge pro-badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 100px; color: #a855f7; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    <i data-lucide="sparkles" style="width: 10px; height: 10px;"></i> Pro
                </span>
            `;
        } else {
            container.innerHTML = `
                <span class="plan-badge free-badge" style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: rgba(138, 145, 166, 0.1); border: 1px solid rgba(138, 145, 166, 0.25); border-radius: 100px; color: #8a91a6; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">
                    Inicial
                </span>
                <a href="#" id="lnk-upgrade-pro" style="color: #00ccff; font-size: 10px; font-weight: 600; text-decoration: none; margin-left: 6px; border-bottom: 1px dashed #00ccff;" onclick="openPaymentModal(); return false;">
                    Mejorar
                </a>
            `;
        }
    }

    const settingsPlanName = document.getElementById('settings-plan-name');
    const settingsPlanAction = document.getElementById('settings-plan-action');
    if (settingsPlanName && settingsPlanAction) {
        if (producerConfig && producerConfig.plan === 'elite') {
            settingsPlanName.innerHTML = `<span style="color: #ec4899;"><i data-lucide="crown" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Plan Elite Activo</span>`;
            settingsPlanAction.innerHTML = `<span style="font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle" style="width: 16px; height: 16px;"></i> Facturación Activa</span>`;
        } else if (window.currentUserIsPro) {
            settingsPlanName.innerHTML = `<span style="color: #a855f7;"><i data-lucide="sparkles" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Plan Pro Activo</span>`;
            settingsPlanAction.innerHTML = `<span style="font-size: 12px; color: #10b981; font-weight: 600; display: flex; align-items: center; gap: 4px;"><i data-lucide="check-circle" style="width: 16px; height: 16px;"></i> Facturación Activa</span>`;
        } else {
            settingsPlanName.innerHTML = `Plan Inicial (Gratuito)`;
            settingsPlanAction.innerHTML = `
                <button type="button" class="btn btn-primary" style="height: 32px; padding: 0 16px; font-size: 12px; font-weight: 700; border-radius: 8px; background: linear-gradient(135deg, #0055ee 0%, #00aacc 100%); border: none; color: #ffffff; cursor: pointer;" onclick="closeSettingsModal(); openPaymentModal();">
                    Mejorar a Pro
                </button>
            `;
        }
    }
    
    // Ajustar botón DocuSign
    const docusignBtn = document.getElementById('btn-docusign');
    if (docusignBtn) {
        if (!window.currentUserIsPro) {
            docusignBtn.innerHTML = '<i data-lucide="lock" style="width:14px; height:14px; margin-right:4px;"></i> Firmar DocuSign (Pro)';
            docusignBtn.title = 'Firma digital con DocuSign (Requiere Plan Pro)';
        } else {
            docusignBtn.innerHTML = '<i data-lucide="pen-tool"></i> Firmar DocuSign';
            docusignBtn.title = 'Enviar contrato a firmar por DocuSign';
        }
    }

    safeCreateIcons();
}

// Wrappers seguros para evitar fallos por red o bloqueos de navegador
function safeCreateIcons() {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn('Error al crear iconos de Lucide:', e);
        }
    }
}
window.safeCreateIcons = safeCreateIcons;

let autoBackupTimeout = null;

function safeGetItem(key) {
    try {
        return localStorage.getItem(key);
    } catch (e) {
        console.warn('No se pudo acceder a localStorage.getItem:', e);
        return null;
    }
}

// Guardar copia de seguridad en el archivo físico del servidor local (Mac)
async function saveToLocalServer() {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;
    try {
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const backupData = {};
        const configVal = localStorage.getItem(`${window.currentUser}_producer_config`);
        const historyVal = localStorage.getItem(`${window.currentUser}_license_history`);
        const contactsVal = localStorage.getItem(`${window.currentUser}_contacts`);
        const beatsVal = localStorage.getItem(`${window.currentUser}_beats`);

        backupData[`${window.currentUser}_producer_config`] = configVal;
        backupData[`${window.currentUser}_license_history`] = historyVal;
        backupData[`${window.currentUser}_contacts`] = contactsVal;
        backupData[`${window.currentUser}_beats`] = beatsVal;

        // Also write legacy keys for backward-compatibility with other scripts
        backupData[`${legacyUser}_producer_config`] = configVal;
        backupData[`${legacyUser}_license_history`] = historyVal;
        backupData[`${legacyUser}_contacts`] = contactsVal;
        backupData[`${legacyUser}_beats`] = beatsVal;

        const res = await fetch(`/api/save-local?user=${legacyUser}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(backupData)
        });
        if (res.ok) {
            console.log(`💾 Archivo local ${legacyUser}_backup_sincronizado.json actualizado automáticamente.`);
        } else {
            console.warn('Error al guardar archivo local:', await res.text());
        }
    } catch (e) {
        console.warn('No se pudo guardar el archivo local en el servidor:', e);
    }
}

// Cargar copia de seguridad desde el archivo físico del servidor local (Mac)
// EL ARCHIVO LOCAL SIEMPRE TIENE PRIORIDAD SOBRE GOOGLE DRIVE
window._localServerLoaded = false;
async function loadFromLocalServer() {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') return;
    try {
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const res = await fetch(`/api/load-local?user=${legacyUser}`);
        if (res.ok) {
            const backupData = await res.json();

            // Contar licencias y contactos
            let localCount = 0, diskCount = 0;
            let localContacts = 0, diskContacts = 0;
            try { localCount = JSON.parse(localStorage.getItem(`${window.currentUser}_license_history`) || '[]').length; } catch(e) {}
            
            const diskHistoryStr = backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]';
            try { diskCount = JSON.parse(diskHistoryStr).length; } catch(e) {}
            
            try { localContacts = JSON.parse(localStorage.getItem(`${window.currentUser}_contacts`) || '[]').length; } catch(e) {}
            
            const diskContactsStr = backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`] || '[]';
            try { diskContacts = JSON.parse(diskContactsStr).length; } catch(e) {}

            const localWeight = (localCount * 1000) + localContacts;
            const diskWeight = (diskCount * 1000) + diskContacts;

            // Siempre cargar del disco si tiene IGUAL O MÁS datos combinados que localStorage
            const shouldLoad = diskWeight >= localWeight;

            if (shouldLoad) {
                const setOrRemove = (key, val) => {
                    if (val === null || val === undefined || val === 'null') {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, val);
                    }
                };
                setOrRemove(`${window.currentUser}_producer_config`, backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]);
                setOrRemove(`${window.currentUser}_license_history`, backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]);
                setOrRemove(`${window.currentUser}_contacts`, backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]);
                setOrRemove(`${window.currentUser}_beats`, backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]);

                window._localServerLoaded = true;
                console.log(`🔄 Archivo local cargado: peso ${diskWeight} (localStorage tenía ${localWeight})`);

                if (diskWeight !== localWeight) {
                    showToast(`🔄 Datos sincronizados desde archivo local (${diskCount} licencias, ${diskContacts} contactos)`, false);
                    await new Promise(resolve => setTimeout(resolve, 800));
                    window.location.reload();
                }
            } else {
                // localStorage tiene más datos → guardar al disco para mantener sincronía
                console.log(`💾 localStorage tiene más datos (${localWeight}) que disco (${diskWeight}). Actualizando disco...`);
                await saveToLocalServer();
                window._localServerLoaded = true;
            }
        }
    } catch (e) {
        console.warn('No se pudo cargar el archivo local desde el servidor:', e);
    }
}

function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        // Si es una clave de base de datos, gatillar auto-respaldos
        if ([`${window.currentUser}_producer_config`, `${window.currentUser}_license_history`, `${window.currentUser}_contacts`, `${window.currentUser}_beats`].includes(key)) {
            // Respaldar en Google Drive en segundo plano si hay sesión
            autoBackupGoogleDrive();
            // Guardar en el archivo físico de la Mac en segundo plano si estamos en localhost
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                saveToLocalServer();
            }
        }
        return true;
    } catch (e) {
        console.warn('No se pudo acceder a localStorage.setItem:', e);
        return false;
    }
}

window.safeSetItem = safeSetItem;
window.initApp = initApp;;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initAuthAndApp());
} else {
    window.initAuthAndApp();
}

async function initApp(user) {
    window.currentUser = user;
    document.getElementById('app-container').style.display = 'grid';
    document.body.classList.add('admin-active');

    // Resetear modos globales y actualizar UI del carrito
    window.stateManager.setState('isGlobalCatalogMode', false);
    window.stateManager.setState('isPublicStoreMode', false);
    if (typeof window.updateCartUI === 'function') {
        window.updateCartUI();
    }

    // Ocultar y pausar reproductor de tienda pública al entrar al panel de administración
    const player = document.getElementById('store-audio-player');
    if (player) player.style.display = 'none';
    if (window.currentStoreAudio) {
        window.currentStoreAudio.pause();
        window.currentStoreAudio = null;
        window.currentStorePlayingBeatId = null;
        
        // Reset de iconos de botones en la tienda
        const allPlayButtons = document.querySelectorAll('[id^="btn-play-store-"]');
        allPlayButtons.forEach(btn => {
            btn.innerHTML = `<i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>`;
        });
        const mainPlayBtn = document.getElementById('player-btn-play');
        if (mainPlayBtn) {
            mainPlayBtn.innerHTML = `<i data-lucide="play" style="width: 18px; height: 18px; fill: #000; stroke: #000;"></i>`;
        }
        if (window.lucide) window.lucide.createIcons();
    }

    checkDocuSignOAuth();
    initDefaultDate();
    
    // Si estamos en localhost, cargar del servidor local antes de cargar en memoria
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        await loadFromLocalServer();
    }
    
    await loadProducerConfig();
    updatePlanUI();
    await loadTemplates();

    // Configurar logo y tema por defecto según el AKA cargado en el config
    const logoImg = document.getElementById('app-logo');
    const sidebarTitle = document.getElementById('app-sidebar-title');
    if (logoImg && sidebarTitle) {
        const akaName = (producerConfig.aka || "").toLowerCase();
        const isMonarco = akaName.includes('monarco') || (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === 'beatscgmonarco@gmail.com');
        const isMicua = akaName.includes('micua') || (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === 'mistermicua@gmail.com');
        const isSossa = akaName.includes('sossa') || window.currentUserIsAdmin;

        if (isSossa) {
            logoImg.innerHTML = '<i data-lucide="music"></i>';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco', 'theme-mrmicua');
        } else if (isMonarco) {
            logoImg.innerHTML = '<i data-lucide="headphones"></i>';
            document.body.classList.remove('theme-sossa', 'theme-mrmicua');
            document.body.classList.add('theme-cgmonarco');
        } else if (isMicua) {
            logoImg.innerHTML = '<img src="/producer_mrmicua.jpg" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">';
            document.body.classList.remove('theme-sossa', 'theme-cgmonarco');
            document.body.classList.add('theme-mrmicua');
        } else {
            logoImg.innerHTML = '<i data-lucide="music"></i>';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco', 'theme-mrmicua');
        }
        
        sidebarTitle.textContent = 'BEATSS';
        const sidebarSubtitle = document.getElementById('app-sidebar-subtitle');
        if (sidebarSubtitle) {
            sidebarSubtitle.textContent = `Panel: ${producerConfig.aka || 'Productor'}`;
        }
    }

    // Actualizar advertencia de Google Drive en configuración
    const driveWarning = document.getElementById('drive-folder-warning');
    if (driveWarning) {
        const folderName = `${producerConfig.aka || producerConfig.name || 'BEATSS'} Licencias`;
        driveWarning.innerHTML = `🔒 Los contratos PDF se guardarán automáticamente en tu Drive en la carpeta <strong>${folderName}/Contratos</strong>.`;
    }

    // Mostrar pestaña de administración si es Sossa Admin
    const adminTabBtn = document.getElementById('tab-admin-btn');
    if (adminTabBtn) {
        adminTabBtn.style.display = window.currentUserIsAdmin ? 'inline-flex' : 'none';
    }

    await loadHistory();
    await loadContacts(); // Cargar los contactos desde Firestore
    await initBeatsDB();
    setupEventListeners();
    window.isInitializing = true;
    selectLicenseType('basic'); // Cargar tipo básico al inicio
    loadFormDraft(); // Restaurar borrador si existe
    window.isInitializing = false;
    await loadReferralData(); // Cargar datos del programa de referidos
    await loadSalesData(); // Iniciar listener en tiempo real de pedidos de beats
    requestNotificationPermission(); // Solicitar permiso de notificaciones nativas
    safeCreateIcons();
    initTooltips();
    
    // Auto-sincronizar silenciosamente en segundo plano si hay sesión activa de Google
    setTimeout(autoSyncGoogleDrive, 600);
}

// Establecer fecha de hoy por defecto
function initDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('effective-date').value = today;
}

async function loadProducerConfig() {
    const docRef = doc(db, "users", window.currentUser, "config", "producer");
    const privateDocRef = doc(db, "users", window.currentUser, "private_config", "producer");
    let firestoreLoaded = false;
    let publicData = null;
    let privateData = null;
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            publicData = docSnap.data();
        }
        
        try {
            const privateSnap = await getDoc(privateDocRef);
            if (privateSnap.exists()) {
                privateData = privateSnap.data();
            }
        } catch (e) {
            console.warn("No se pudo leer la configuración privada (puede que no esté inicializada o falten permisos):", e.message);
        }
        
        if (publicData) {
            // Migración automática de campos privados si están en el documento público
            const privateKeys = ['signature', 'dsClientId', 'dsAccountId', 'dsEnv', 'gdriveClientId', 'emailjsServiceId', 'emailjsTemplateId', 'emailjsPublicKey', 'paypalClientSecret'];
            let migrationNeeded = false;
            const migratedPrivate = { ...(privateData || {}) };
            const cleanPublic = { ...publicData };
            
            privateKeys.forEach(key => {
                if (key in cleanPublic && cleanPublic[key] !== undefined && cleanPublic[key] !== '') {
                    migratedPrivate[key] = cleanPublic[key];
                    delete cleanPublic[key];
                    migrationNeeded = true;
                }
            });
            
            if (migrationNeeded) {
                console.log("🛡️ Migrando credenciales y firma a configuración privada...");
                try {
                    await setDoc(privateDocRef, migratedPrivate);
                    await setDoc(docRef, cleanPublic);
                    publicData = cleanPublic;
                    privateData = migratedPrivate;
                } catch (migrationErr) {
                    console.error("Fallo en la migración de configuración:", migrationErr);
                }
            }
            
            producerConfig = { ...producerConfig, ...publicData, ...(privateData || {}) };
            firestoreLoaded = true;
        }
    } catch (err) {
        console.error("Error al cargar config de productor de Firestore:", err);
    }

    if (!firestoreLoaded) {
        // Intentar cargar de localStorage (migración de respaldo local)
        const saved = localStorage.getItem(`${window.currentUser}_producer_config`);
        if (saved) {
            try {
                const localConfig = JSON.parse(saved);
                producerConfig = { ...producerConfig, ...localConfig };
                console.log("Cargada configuración de productor desde localStorage:", producerConfig);
            } catch (e) {
                console.error("Error al parsear config de localStorage:", e);
            }
        } else {
            // Documento no existe ni en local, crear con defaults según el email del usuario actual de Firebase
            const currentEmail = auth.currentUser ? auth.currentUser.email : "";
            if (currentEmail.toLowerCase() === 'beatscgmonarco@gmail.com') {
                producerConfig = {
                    name: "Abrahan Cabezas Guerrero",
                    aka: "CG Monarco",
                    email: "beatscgmonarco@gmail.com",
                    phone: "+593991369247",
                    place: "Esmeraldas - Ecuador",
                    id: "0803188796",
                    pro: "BMI",
                    ipi: "01308301985",
                    publisher: "MH Musik",
                    address: "Esmeraldas - Ecuador",
                    birthdate: "2004-05-20",
                    dsClientId: "",
                    dsAccountId: "",
                    dsEnv: "demo",
                    emailjsServiceId: "",
                    emailjsTemplateId: "",
                    emailjsPublicKey: "",
                    emailjsPublicKey: "",
                    gdriveClientId: "",
                    storageProvider: "gdrive-central"
                };
            } else if (currentEmail.toLowerCase() === 'masterjuego25@gmail.com' || currentEmail.toLowerCase() === 'sossabeatz1@gmail.com') {
                producerConfig = {
                    name: "Joao David Dominguez",
                    aka: "Sossa",
                    email: currentEmail.toLowerCase(),
                    phone: "+593961201184",
                    place: "Quito, Ecuador",
                    id: "0803743111",
                    pro: "BMI",
                    ipi: "01170943066",
                    publisher: "Songtrust",
                    address: "Esmeraldas - Ecuador",
                    birthdate: "2001-07-06",
                    dsClientId: "",
                    dsAccountId: "",
                    dsEnv: "demo",
                    emailjsServiceId: "",
                    emailjsTemplateId: "",
                    emailjsPublicKey: "",
                    gdriveClientId: "216966055009-03rjdnq87uh3h15e3qfglp2pnmos9t5k.apps.googleusercontent.com",
                    storageProvider: "gdrive-central"
                };
            } else if (currentEmail.toLowerCase() === 'mistermicua@gmail.com') {
                producerConfig = {
                    name: "Mister Micua",
                    aka: "Mr. Micua",
                    email: "mistermicua@gmail.com",
                    phone: "",
                    place: "Quito, Ecuador",
                    id: "1724567890",
                    pro: "BMI",
                    ipi: "",
                    publisher: "Mr. Micua Music",
                    address: "Quito, Ecuador",
                    birthdate: "",
                    dsClientId: "",
                    dsAccountId: "",
                    dsEnv: "demo",
                    emailjsServiceId: "",
                    emailjsTemplateId: "",
                    emailjsPublicKey: "",
                    gdriveClientId: "",
                    storageProvider: "gdrive-central"
                };
            } else {
                // Nuevo productor (7-Day Pro Trial)
                const now = new Date();
                const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
                producerConfig = {
                    name: (auth.currentUser && auth.currentUser.displayName) || "Nuevo Productor",
                    aka: "Productor",
                    email: currentEmail,
                    phone: "",
                    place: "Quito, Ecuador",
                    id: "",
                    pro: "BMI",
                    ipi: "",
                    publisher: "",
                    address: "",
                    birthdate: "",
                    dsClientId: "",
                    dsAccountId: "",
                    dsEnv: "demo",
                    emailjsServiceId: "",
                    emailjsTemplateId: "",
                    emailjsPublicKey: "",
                    gdriveClientId: "",
                    storageProvider: "gdrive-central",
                    plan: 'pro',
                    expirationPro: sevenDaysLater.toISOString(),
                    trialStartedAt: now.toISOString()
                };
            }
            
            // Si fue referido por alguien, registrar el referido en la base de datos
            const referredBy = localStorage.getItem('beatss_referred_by');
            if (referredBy && referredBy !== window.currentUser) {
                try {
                    const refDocRef = doc(db, "referrals", window.currentUser);
                    await setDoc(refDocRef, {
                        referrerId: referredBy,
                        referredId: window.currentUser,
                        referredAka: producerConfig.aka || 'Productor',
                        createdAt: new Date().toISOString()
                    });
                    localStorage.removeItem('beatss_referred_by');
                    console.log("👥 Registro de referido guardado con éxito.");
                } catch (e) {
                    console.error("Error al registrar referido en Firestore:", e);
                }
            }
        }

        // Subir a Firestore y actualizar localStorage
        try {
            await setDoc(docRef, producerConfig);
            safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(producerConfig));
            // También guardar en el documento raíz del usuario para fácil consulta en consultas unificadas
            const userRef = doc(db, "users", window.currentUser);
            await setDoc(userRef, {
                plan: producerConfig.plan || 'inicial',
                planActivatedAt: new Date().toISOString(),
            }, { merge: true });
        } catch (err) {
            console.error("Error al guardar config de productor en Firestore:", err);
        }
    }

    // Comprobar expiración del Plan Pro o Elite
    const expDateStr = producerConfig.planExpirationDate || producerConfig.expirationPro;
    if ((producerConfig.plan === 'pro' || producerConfig.plan === 'elite') && expDateStr) {
        const expirationDate = new Date(expDateStr);
        if (expirationDate < new Date()) {
            const expiredPlan = producerConfig.plan;
            console.log(`El Plan ${expiredPlan} ha expirado. Degradando a Plan Inicial.`);
            producerConfig.plan = 'inicial'; // 'inicial' represents the free tier
            // Guardar cambio de plan en segundo plano para no demorar la carga inicial
            const userConfigRef = doc(db, "users", window.currentUser, "config", "producer");
            setDoc(userConfigRef, producerConfig).then(() => {
                safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(producerConfig));
                showToast(`Tu suscripción ${expiredPlan === 'elite' ? 'Elite' : 'Pro'} ha expirado. Volviendo al Plan Inicial.`, true);
                updatePlanUI();
                generatePreview();
            }).catch(err => {
                console.error("Error al guardar degradación de plan:", err);
            });
        }
    }
    
    // Rellenar campos del modal
    document.getElementById('cfg-producer-name').value = producerConfig.name;
    document.getElementById('cfg-producer-id').value = producerConfig.id || (window.currentUserIsAdmin ? "0803743111" : "0803188796");
    document.getElementById('cfg-producer-aka').value = producerConfig.aka;
    document.getElementById('cfg-default-place').value = producerConfig.place;
    document.getElementById('cfg-producer-email').value = producerConfig.email;
    document.getElementById('cfg-producer-phone').value = producerConfig.phone;
    document.getElementById('cfg-producer-pro').value = producerConfig.pro || "BMI";
    document.getElementById('cfg-producer-ipi').value = producerConfig.ipi || "";
    document.getElementById('cfg-producer-publisher').value = producerConfig.publisher || "";
    document.getElementById('cfg-ds-client-id').value = producerConfig.dsClientId || "";
    document.getElementById('cfg-ds-account-id').value = producerConfig.dsAccountId || "";
    document.getElementById('cfg-ds-env').value = producerConfig.dsEnv || "demo";
    document.getElementById('cfg-emailjs-service-id').value = producerConfig.emailjsServiceId || "";
    document.getElementById('cfg-emailjs-template-id').value = producerConfig.emailjsTemplateId || "";
    document.getElementById('cfg-emailjs-public-key').value = producerConfig.emailjsPublicKey || "";
    document.getElementById('cfg-gdrive-client-id').value = producerConfig.gdriveClientId || "";
    
    // Rellenar datos de cobro de tienda pública
    document.getElementById('cfg-bank-pichincha-acc').value = producerConfig.bankPichinchaAcc || "";
    document.getElementById('cfg-bank-pichincha-type').value = producerConfig.bankPichinchaType || "Ahorros";
    document.getElementById('cfg-bank-pichincha-name').value = producerConfig.bankPichinchaName || "";
    document.getElementById('cfg-bank-pichincha-dni').value = producerConfig.bankPichinchaDni || "";
    document.getElementById('cfg-bank-guayaquil-acc').value = producerConfig.bankGuayaquilAcc || "";
    document.getElementById('cfg-bank-guayaquil-type').value = producerConfig.bankGuayaquilType || "Corriente";
    document.getElementById('cfg-bank-guayaquil-name').value = producerConfig.bankGuayaquilName || "";
    document.getElementById('cfg-bank-guayaquil-dni').value = producerConfig.bankGuayaquilDni || "";
    document.getElementById('cfg-deuna-phone').value = producerConfig.deunaPhone || "";
    document.getElementById('cfg-deuna-name').value = producerConfig.deunaName || "";
    document.getElementById('cfg-paypal-email').value = producerConfig.paypalEmail || "";
    document.getElementById('cfg-paypal-client-id').value = producerConfig.paypalClientId || "";
    document.getElementById('cfg-paypal-client-secret').value = producerConfig.paypalClientSecret || "";
    document.getElementById('cfg-payphone-phone').value = producerConfig.payphonePhone || "";
    document.getElementById('cfg-payphone-client-id').value = producerConfig.payphoneClientId || "";
    document.getElementById('cfg-payphone-appid').value = producerConfig.payphoneAppId || "";

    // Cargar datos de Facturación Electrónica SRI (Ecuador)
    document.getElementById('cfg-sri-ruc').value = producerConfig.sriRuc || "";
    document.getElementById('cfg-sri-razon-social').value = producerConfig.sriRazonSocial || "";
    document.getElementById('cfg-sri-nombre-comercial').value = producerConfig.sriNombreComercial || "";
    document.getElementById('cfg-sri-dir-matriz').value = producerConfig.sriDirMatriz || "";
    document.getElementById('cfg-sri-estab').value = producerConfig.sriEstab || "001";
    document.getElementById('cfg-sri-pto-emi').value = producerConfig.sriPtoEmi || "001";
    document.getElementById('cfg-sri-ambiente').value = producerConfig.sriAmbiente || "1";
    document.getElementById('cfg-sri-rimpe').value = producerConfig.sriRimpe || "no_rimpe";
    document.getElementById('cfg-sri-contabilidad').value = producerConfig.sriContabilidad || "NO";
    document.getElementById('cfg-sri-p12-password').value = producerConfig.sriP12Password || "";
    
    // Mostrar estado del archivo .p12 subido
    const p12Status = document.getElementById('cfg-sri-p12-status');
    if (p12Status) {
        if (producerConfig.sriP12Base64) {
            p12Status.innerHTML = '✅ <strong style="color: #4ade80;">Firma electrónica (.p12) cargada.</strong> Puedes subir otra si deseas reemplazarla.';
        } else {
            p12Status.innerHTML = 'Firma electrónica (.p12 / .pfx) no cargada. Sube tu archivo para emitir facturas digitales oficiales.';
        }
    }

    const isProOrElite = (producerConfig.plan === 'pro' || producerConfig.plan === 'elite' || window.currentUserIsAdmin);
    
    // Configurar campos de PayPal
    const paypalEmailInput = document.getElementById('cfg-paypal-email');
    const paypalClientIdInput = document.getElementById('cfg-paypal-client-id');
    const paypalClientSecretInput = document.getElementById('cfg-paypal-client-secret');
    if (paypalEmailInput && paypalClientIdInput && paypalClientSecretInput) {
        paypalEmailInput.disabled = !isProOrElite;
        paypalClientIdInput.disabled = !isProOrElite;
        paypalClientSecretInput.disabled = !isProOrElite;
        if (!isProOrElite) {
            paypalEmailInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
            paypalClientIdInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
            paypalClientSecretInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
        } else {
            paypalEmailInput.placeholder = 'correo@paypal.com';
            paypalClientIdInput.placeholder = 'Client ID (Opcional)';
            paypalClientSecretInput.placeholder = 'Client Secret (Opcional)';
        }
    }

    // Configurar campos de PayPhone
    const payphonePhoneInput = document.getElementById('cfg-payphone-phone');
    const payphoneClientIdInput = document.getElementById('cfg-payphone-client-id');
    const payphoneAppIdInput = document.getElementById('cfg-payphone-appid');
    if (payphonePhoneInput && payphoneClientIdInput && payphoneAppIdInput) {
        payphonePhoneInput.disabled = !isProOrElite;
        payphoneClientIdInput.disabled = !isProOrElite;
        payphoneAppIdInput.disabled = !isProOrElite;
        if (!isProOrElite) {
            payphonePhoneInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
            payphoneClientIdInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
            payphoneAppIdInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
        } else {
            payphonePhoneInput.placeholder = 'Ej: 099xxxxxxx';
            payphoneClientIdInput.placeholder = 'Token / API Key';
            payphoneAppIdInput.placeholder = 'ID de la Aplicación';
        }
    }

    // Configurar campos de DocuSign
    const dsClientIdInput = document.getElementById('cfg-ds-client-id');
    const dsAccountIdInput = document.getElementById('cfg-ds-account-id');
    const dsEnvInput = document.getElementById('cfg-ds-env');
    if (dsClientIdInput && dsAccountIdInput && dsEnvInput) {
        dsClientIdInput.disabled = !isProOrElite;
        dsAccountIdInput.disabled = !isProOrElite;
        if (dsEnvInput) dsEnvInput.disabled = !isProOrElite;
        if (!isProOrElite) {
            dsClientIdInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
            dsAccountIdInput.placeholder = '⚠️ Requiere Plan Pro/Elite';
        } else {
            dsClientIdInput.placeholder = 'Client ID';
            dsAccountIdInput.placeholder = 'Account ID';
        }
    }

    if (document.getElementById('cfg-storage-provider')) {
        document.getElementById('cfg-storage-provider').value = producerConfig.storageProvider || "gdrive-central";
    }
    if (document.getElementById('cfg-contract-color')) {
        document.getElementById('cfg-contract-color').value = producerConfig.contractColor || "default";
    }

    // Rellenar datos del EPK
    if (document.getElementById('cfg-epk-bio')) {
        document.getElementById('cfg-epk-bio').value = producerConfig.epkBio || "";
    }
    if (document.getElementById('cfg-epk-pro')) {
        document.getElementById('cfg-epk-pro').value = producerConfig.epkPro || "";
    }
    if (document.getElementById('cfg-epk-collabs')) {
        document.getElementById('cfg-epk-collabs').value = producerConfig.epkCollabs || "";
    }
    if (document.getElementById('cfg-epk-sales')) {
        document.getElementById('cfg-epk-sales').value = producerConfig.epkSales || "";
    }
    if (document.getElementById('cfg-epk-streams')) {
        document.getElementById('cfg-epk-streams').value = producerConfig.epkStreams || "";
    }
    
    // Rellenar Brand Color y Cupones
    if (document.getElementById('cfg-brand-color-hex')) {
        document.getElementById('cfg-brand-color-hex').value = producerConfig.brandColor || "#00ccff";
        document.getElementById('cfg-brand-color').value = producerConfig.brandColor || "#00ccff";
        
        // Setup listener (solo si no se ha añadido, para no duplicar en cada apertura)
        if (!document.getElementById('cfg-brand-color').dataset.bound) {
            document.getElementById('cfg-brand-color').addEventListener('input', (e) => {
                document.getElementById('cfg-brand-color-hex').value = e.target.value;
            });
            document.getElementById('cfg-brand-color-hex').addEventListener('input', (e) => {
                document.getElementById('cfg-brand-color').value = e.target.value;
            });
            
            document.getElementById('btn-add-coupon').addEventListener('click', addCouponFromSettings);
            document.getElementById('cfg-brand-color').dataset.bound = "true";
        }
        
        if (producerConfig.plan !== 'elite') {
            document.getElementById('cfg-brand-color-container').style.opacity = '0.5';
            document.getElementById('cfg-brand-color-container').style.pointerEvents = 'none';
            document.getElementById('brand-color-warning').style.display = 'block';
        } else {
            document.getElementById('cfg-brand-color-container').style.opacity = '1';
            document.getElementById('cfg-brand-color-container').style.pointerEvents = 'auto';
            document.getElementById('brand-color-warning').style.display = 'none';
        }
    }
    
    renderCouponsSettings();
    
    // Toggle de campos de admin
    const adminFields = document.querySelectorAll('.admin-only-field');
    adminFields.forEach(el => {
        el.style.display = window.currentUserIsAdmin ? 'block' : 'none';
    });

    if (window.currentUserIsAdmin) {
        loadPlatformGDriveStatus();
    }
    
    // Rellenar firma manual
    if (producerConfig.signature) {
        document.getElementById('signature-preview-img').src = producerConfig.signature;
        document.getElementById('signature-preview-container').style.display = 'block';
        document.getElementById('btn-clear-signature').style.display = 'inline-block';
        window.tempSignatureBase64 = producerConfig.signature;
    } else {
        document.getElementById('signature-preview-img').src = '';
        document.getElementById('signature-preview-container').style.display = 'none';
        document.getElementById('btn-clear-signature').style.display = 'none';
        window.tempSignatureBase64 = null;
    }
    
    document.getElementById('celebration-place').value = producerConfig.place;
    updatePlanUI();

    // Rellenar logotipo manual (después de actualizar el plan)
    const logoPreviewImg = document.getElementById('logo-preview-img');
    const logoPreviewContainer = document.getElementById('logo-preview-container');
    const btnClearLogo = document.getElementById('btn-clear-logo');
    const btnUploadLogo = document.getElementById('btn-upload-logo');
    const logoPlanWarning = document.getElementById('logo-plan-warning');

    if (logoPreviewImg && logoPreviewContainer && btnClearLogo && btnUploadLogo && logoPlanWarning) {
        const isElite = (producerConfig.plan === 'elite' || window.currentUserIsAdmin);
        if (!isElite) {
            btnUploadLogo.disabled = true;
            logoPlanWarning.style.display = 'block';
            logoPlanWarning.textContent = '⚠️ Esta opción requiere el plan Elite.';
            logoPreviewContainer.style.display = 'none';
            btnClearLogo.style.display = 'none';
            window.tempLogoBase64 = null;
        } else {
            btnUploadLogo.disabled = false;
            logoPlanWarning.style.display = 'none';
            if (producerConfig.logoBase64) {
                logoPreviewImg.src = producerConfig.logoBase64;
                logoPreviewContainer.style.display = 'block';
                btnClearLogo.style.display = 'inline-block';
                window.tempLogoBase64 = producerConfig.logoBase64;
            } else {
                logoPreviewImg.src = '';
                logoPreviewContainer.style.display = 'none';
                btnClearLogo.style.display = 'none';
                window.tempLogoBase64 = null;
            }
        }
    }

    // Rellenar carátula predeterminada
    const defaultArtworkPreviewImg = document.getElementById('default-artwork-preview-img');
    const defaultArtworkPreviewContainer = document.getElementById('default-artwork-preview-container');
    const btnClearDefaultArtwork = document.getElementById('btn-clear-default-artwork');

    if (defaultArtworkPreviewImg && defaultArtworkPreviewContainer && btnClearDefaultArtwork) {
        if (producerConfig.defaultBeatArtwork) {
            defaultArtworkPreviewImg.src = producerConfig.defaultBeatArtwork;
            defaultArtworkPreviewContainer.style.display = 'block';
            btnClearDefaultArtwork.style.display = 'inline-block';
            window.tempDefaultArtworkBase64 = producerConfig.defaultBeatArtwork;
        } else {
            defaultArtworkPreviewImg.src = '';
            defaultArtworkPreviewContainer.style.display = 'none';
            btnClearDefaultArtwork.style.display = 'none';
            window.tempDefaultArtworkBase64 = null;
        }
    }

    // Rellenar Tag de Audio
    const audioTagNameSpan = document.getElementById('cfg-audio-tag-name');
    const audioTagPreviewContainer = document.getElementById('cfg-audio-tag-preview-container');
    const btnClearAudioTag = document.getElementById('btn-clear-audio-tag');

    if (audioTagNameSpan && audioTagPreviewContainer && btnClearAudioTag) {
        if (producerConfig.audioTagBase64) {
            audioTagNameSpan.textContent = producerConfig.audioTagName || "Producer_Tag.mp3";
            audioTagPreviewContainer.style.display = 'flex';
            window.tempAudioTagBase64 = producerConfig.audioTagBase64;
            window.tempAudioTagName = producerConfig.audioTagName;
        } else {
            audioTagNameSpan.textContent = '';
            audioTagPreviewContainer.style.display = 'none';
            window.tempAudioTagBase64 = null;
            window.tempAudioTagName = null;
        }
    }

    // Cargar estado de la vinculación de Google para iniciar sesión
    updateGoogleLoginLinkStatus();
    window.producerConfig = producerConfig;
}

// Guardar configuración de productor
async function saveProducerConfig() {
    producerConfig.name = document.getElementById('cfg-producer-name').value.trim() || producerConfig.name || "Joao David Dominguez";
    producerConfig.id = document.getElementById('cfg-producer-id').value.trim() || producerConfig.id || "";
    producerConfig.aka = document.getElementById('cfg-producer-aka').value.trim() || producerConfig.aka || "Productor";
    producerConfig.place = document.getElementById('cfg-default-place').value.trim() || producerConfig.place || "Quito, Ecuador";
    producerConfig.email = document.getElementById('cfg-producer-email').value.trim() || producerConfig.email || (auth.currentUser ? auth.currentUser.email : "");
    producerConfig.phone = document.getElementById('cfg-producer-phone').value.trim() || producerConfig.phone || "";
    producerConfig.pro = document.getElementById('cfg-producer-pro').value.trim() || producerConfig.pro || "BMI";
    producerConfig.ipi = document.getElementById('cfg-producer-ipi').value.trim() || producerConfig.ipi || "";
    producerConfig.publisher = document.getElementById('cfg-producer-publisher').value.trim() || producerConfig.publisher || "";
    producerConfig.signature = window.tempSignatureBase64 || "";
    const isElite = (producerConfig.plan === 'elite' || window.currentUserIsAdmin);
    if (isElite) {
        producerConfig.logoBase64 = window.tempLogoBase64 || "";
    } else {
        producerConfig.logoBase64 = "";
    }
    producerConfig.defaultBeatArtwork = window.tempDefaultArtworkBase64 || "";
    producerConfig.audioTagBase64 = window.tempAudioTagBase64 || "";
    producerConfig.audioTagName = window.tempAudioTagName || "";
    // Guardar campos de DocuSign
    const oldClientId = producerConfig.dsClientId;
    const oldEnv = producerConfig.dsEnv;
    
    producerConfig.dsClientId = document.getElementById('cfg-ds-client-id').value.trim();
    producerConfig.dsAccountId = document.getElementById('cfg-ds-account-id').value.trim();
    producerConfig.dsEnv = document.getElementById('cfg-ds-env').value;

    // Si cambiaron las llaves o el entorno de DocuSign, forzar cierre de sesión previo
    if (oldClientId !== producerConfig.dsClientId || oldEnv !== producerConfig.dsEnv) {
        sessionStorage.removeItem('docusign_access_token');
        sessionStorage.removeItem('docusign_access_token_expiry');
    }

    // Guardar campos de EmailJS
    producerConfig.emailjsServiceId = document.getElementById('cfg-emailjs-service-id').value.trim();
    producerConfig.emailjsTemplateId = document.getElementById('cfg-emailjs-template-id').value.trim();
    producerConfig.emailjsPublicKey = document.getElementById('cfg-emailjs-public-key').value.trim();

    // Guardar Google Drive Client ID
    producerConfig.gdriveClientId = document.getElementById('cfg-gdrive-client-id').value.trim();
    if (document.getElementById('cfg-storage-provider')) {
        producerConfig.storageProvider = document.getElementById('cfg-storage-provider').value;
    }
    if (document.getElementById('cfg-contract-color')) {
        producerConfig.contractColor = document.getElementById('cfg-contract-color').value;
    }
    if (document.getElementById('cfg-brand-color-hex') && producerConfig.plan === 'elite') {
        producerConfig.brandColor = document.getElementById('cfg-brand-color-hex').value.trim() || "#00ccff";
    } else if (producerConfig.plan !== 'elite') {
        producerConfig.brandColor = "";
    }
    
    // Guardar datos del EPK
    if (document.getElementById('cfg-epk-bio')) {
        producerConfig.epkBio = document.getElementById('cfg-epk-bio').value.trim();
    }
    if (document.getElementById('cfg-epk-pro')) {
        producerConfig.epkPro = document.getElementById('cfg-epk-pro').value.trim();
    }
    if (document.getElementById('cfg-epk-collabs')) {
        producerConfig.epkCollabs = document.getElementById('cfg-epk-collabs').value.trim();
    }
    if (document.getElementById('cfg-epk-sales')) {
        producerConfig.epkSales = document.getElementById('cfg-epk-sales').value.trim();
    }
    if (document.getElementById('cfg-epk-streams')) {
        producerConfig.epkStreams = document.getElementById('cfg-epk-streams').value.trim();
    }
    
    // Guardar datos de cobro de tienda pública
    producerConfig.bankPichinchaAcc = document.getElementById('cfg-bank-pichincha-acc').value.trim();
    producerConfig.bankPichinchaType = document.getElementById('cfg-bank-pichincha-type').value;
    producerConfig.bankPichinchaName = document.getElementById('cfg-bank-pichincha-name').value.trim();
    producerConfig.bankPichinchaDni = document.getElementById('cfg-bank-pichincha-dni').value.trim();
    producerConfig.bankGuayaquilAcc = document.getElementById('cfg-bank-guayaquil-acc').value.trim();
    producerConfig.bankGuayaquilType = document.getElementById('cfg-bank-guayaquil-type').value;
    producerConfig.bankGuayaquilName = document.getElementById('cfg-bank-guayaquil-name').value.trim();
    producerConfig.bankGuayaquilDni = document.getElementById('cfg-bank-guayaquil-dni').value.trim();
    producerConfig.deunaPhone = document.getElementById('cfg-deuna-phone').value.trim();
    producerConfig.deunaName = document.getElementById('cfg-deuna-name').value.trim();
    producerConfig.paypalEmail = document.getElementById('cfg-paypal-email').value.trim();
    producerConfig.paypalClientId = document.getElementById('cfg-paypal-client-id').value.trim();
    producerConfig.paypalClientSecret = document.getElementById('cfg-paypal-client-secret').value.trim();
    producerConfig.payphonePhone = document.getElementById('cfg-payphone-phone').value.trim();
    producerConfig.payphoneClientId = document.getElementById('cfg-payphone-client-id').value.trim();
    producerConfig.payphoneAppId = document.getElementById('cfg-payphone-appid').value.trim();

    // Guardar datos de Facturación Electrónica SRI (Ecuador)
    producerConfig.sriRuc = document.getElementById('cfg-sri-ruc').value.trim();
    producerConfig.sriRazonSocial = document.getElementById('cfg-sri-razon-social').value.trim();
    producerConfig.sriNombreComercial = document.getElementById('cfg-sri-nombre-comercial').value.trim();
    producerConfig.sriDirMatriz = document.getElementById('cfg-sri-dir-matriz').value.trim();
    producerConfig.sriEstab = document.getElementById('cfg-sri-estab').value.trim() || "001";
    producerConfig.sriPtoEmi = document.getElementById('cfg-sri-pto-emi').value.trim() || "001";
    producerConfig.sriAmbiente = document.getElementById('cfg-sri-ambiente').value;
    producerConfig.sriRimpe = document.getElementById('cfg-sri-rimpe').value;
    producerConfig.sriContabilidad = document.getElementById('cfg-sri-contabilidad').value;
    producerConfig.sriP12Password = document.getElementById('cfg-sri-p12-password').value;
    if (window.tempSriP12Base64) {
        producerConfig.sriP12Base64 = window.tempSriP12Base64;
    }

    // Si cambió el Client ID, limpiar token cacheado de Drive
    if (producerConfig.gdriveClientId !== (JSON.parse(localStorage.getItem(`${window.currentUser}_producer_config`) || '{}').gdriveClientId || '')) {
        sessionStorage.removeItem('gdrive_access_token');
        sessionStorage.removeItem('gdrive_token_expiry');
    }
    
    // Guardar en Firestore
    const docRef = doc(db, "users", window.currentUser, "config", "producer");
    const privateDocRef = doc(db, "users", window.currentUser, "private_config", "producer");
    
    // Separar datos públicos y privados
    const privateKeys = ['signature', 'dsClientId', 'dsAccountId', 'dsEnv', 'gdriveClientId', 'emailjsServiceId', 'emailjsTemplateId', 'emailjsPublicKey', 'paypalClientSecret', 'sriP12Password', 'sriP12Base64'];
    const publicConfig = { ...producerConfig };
    const privateConfig = {};
    
    privateKeys.forEach(key => {
        if (key in publicConfig) {
            privateConfig[key] = publicConfig[key] || '';
            delete publicConfig[key];
        }
    });

    try {
        await setDoc(docRef, publicConfig);
        await setDoc(privateDocRef, privateConfig);
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(producerConfig));
        window.producerConfig = producerConfig;
        document.getElementById('celebration-place').value = producerConfig.place;
        
        closeSettingsModal();
        generatePreview();
        updatePlanUI();
        showToast('Configuración del productor actualizada en la nube');
    } catch (err) {
        console.error("Error al guardar config de productor en Firestore:", err);
        showToast("Error al guardar en la nube: " + err.message, true);
    }
}

// Lógica de Cupones
function renderCouponsSettings() {
    const listEl = document.getElementById('cfg-coupons-list');
    if (!listEl) return;
    
    if (!producerConfig.coupons) {
        producerConfig.coupons = [];
    }
    
    if (producerConfig.coupons.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; color: #8a91a6; font-size: 11px; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.1);">No hay cupones creados</div>';
        return;
    }
    
    listEl.innerHTML = '';
    producerConfig.coupons.forEach((coupon, index) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'space-between';
        item.style.padding = '8px 12px';
        item.style.background = 'rgba(255,255,255,0.05)';
        item.style.border = '1px solid rgba(255,255,255,0.1)';
        item.style.borderRadius = '6px';
        
        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 12px; font-weight: 700; color: #fff; background: rgba(0, 204, 255, 0.1); padding: 4px 8px; border-radius: 4px; border: 1px dashed rgba(0, 204, 255, 0.3); text-transform: uppercase;">${coupon.code}</span>
                <span style="font-size: 12px; font-weight: 600; color: #10b981;">-${coupon.discount}%</span>
            </div>
            <button type="button" class="btn-icon-only" onclick="removeCoupon(${index})" style="background: rgba(239, 68, 68, 0.1); color: #ef4444; width: 28px; height: 28px; border-radius: 6px; border: 1px solid rgba(239, 68, 68, 0.2);">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
        `;
        listEl.appendChild(item);
    });
    lucide.createIcons();
}

function addCouponFromSettings() {
    const codeEl = document.getElementById('cfg-coupon-code');
    const descEl = document.getElementById('cfg-coupon-discount');
    const code = codeEl.value.trim().toUpperCase();
    const discount = parseInt(descEl.value, 10);
    
    if (!code || isNaN(discount) || discount < 1 || discount > 99) {
        showToast('Código inválido o descuento no válido (1-99).', true);
        return;
    }
    
    if (!producerConfig.coupons) {
        producerConfig.coupons = [];
    }
    
    if (producerConfig.coupons.find(c => c.code === code)) {
        showToast('Ya existe un cupón con ese código.', true);
        return;
    }
    
    producerConfig.coupons.push({ code, discount });
    codeEl.value = '';
    descEl.value = '';
    renderCouponsSettings();
    showToast('Cupón agregado. Guarda los cambios para aplicarlo en la nube.');
}

window.removeCoupon = function(index) {
    if (!producerConfig.coupons) return;
    producerConfig.coupons.splice(index, 1);
    renderCouponsSettings();
}

// Exponer función global para obtener el token de sesión de Firebase
window.getFirebaseIdToken = async function() {
    if (auth.currentUser) {
        try {
            return await auth.currentUser.getIdToken(true);
        } catch (err) {
            console.error("Error al obtener Firebase ID Token:", err);
            return null;
        }
    }
    return null;
};

// Canjear un código VIP en Firestore
async function redeemVIPCode() {
    const inputEl = document.getElementById('cfg-vip-code');
    const msgEl = document.getElementById('vip-status-message');
    if (!inputEl || !msgEl) return;
    
    const codeId = inputEl.value.trim().toUpperCase();
    if (!codeId) {
        msgEl.style.color = '#ef4444';
        msgEl.textContent = 'Por favor ingresa un código.';
        msgEl.style.display = 'block';
        return;
    }
    
    const btn = document.getElementById('btn-redeem-vip');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Validando...';
    
    msgEl.style.color = '#eab308';
    msgEl.textContent = 'Validando código VIP...';
    msgEl.style.display = 'block';
    
    try {
        const idToken = await window.getFirebaseIdToken();
        const response = await fetch('/api/redeem-vip', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                codeId: codeId,
                uid: window.currentUser
            })
        });

        const resData = await response.json();
        if (!response.ok) {
            msgEl.style.color = '#ef4444';
            msgEl.textContent = resData.error || 'Código VIP no válido.';
            btn.disabled = false;
            btn.textContent = originalText;
            return;
        }

        // Éxito: actualizar la configuración local con el plan retornado por el servidor
        producerConfig.plan = resData.plan || 'pro'; // puede ser 'pro' o 'elite'
        producerConfig.expirationPro = resData.expirationPro;
        if (!producerConfig.redeemedCodes) {
            producerConfig.redeemedCodes = [];
        }
        producerConfig.redeemedCodes.push(codeId);
        
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(producerConfig));
        
        msgEl.style.color = '#10b981';
        const formattedDate = new Date(resData.expirationPro).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const planLabel = producerConfig.plan === 'elite' ? 'Elite 👑' : 'Pro ⚡';
        msgEl.textContent = `¡Código canjeado con éxito! Plan ${planLabel} activado hasta el ${formattedDate}.`;
        inputEl.value = '';
        
        updatePlanUI();
        generatePreview();
        showToast(`Plan ${planLabel} activado mediante código VIP`);
        
    } catch (err) {
        console.error("Error al canjear código VIP:", err);
        msgEl.style.color = '#ef4444';
        msgEl.textContent = 'Ocurrió un error al procesar el código. Por favor inténtalo de nuevo.';
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}
window.redeemVIPCode = redeemVIPCode;

// Añadir una fila de campo personalizado a la barra lateral
function addCustomFieldRow(key = '', value = '') {
    const container = document.getElementById('custom-fields-container');
    if (!container) return;

    const row = document.createElement('div');
    row.className = 'custom-field-row';
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.alignItems = 'center';
    row.style.marginBottom = '4px';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'field-tag';
    keyInput.placeholder = 'Tag (e.g. proyecto)';
    keyInput.value = key;
    keyInput.style.flex = '1';
    keyInput.style.background = 'var(--bg-input)';
    keyInput.style.border = '1px solid var(--border-color)';
    keyInput.style.borderRadius = '8px';
    keyInput.style.color = '#fff';
    keyInput.style.padding = '6px 10px';
    keyInput.style.fontSize = '12px';
    keyInput.style.outline = 'none';

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.className = 'field-value';
    valueInput.placeholder = 'Valor';
    valueInput.value = value;
    valueInput.style.flex = '1.2';
    valueInput.style.background = 'var(--bg-input)';
    valueInput.style.border = '1px solid var(--border-color)';
    valueInput.style.borderRadius = '8px';
    valueInput.style.color = '#fff';
    valueInput.style.padding = '6px 10px';
    valueInput.style.fontSize = '12px';
    valueInput.style.outline = 'none';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'btn-delete-field';
    deleteBtn.style.background = 'rgba(239, 68, 68, 0.1)';
    deleteBtn.style.border = '1px solid rgba(239, 68, 68, 0.2)';
    deleteBtn.style.color = '#ef4444';
    deleteBtn.style.borderRadius = '8px';
    deleteBtn.style.width = '32px';
    deleteBtn.style.height = '32px';
    deleteBtn.style.display = 'flex';
    deleteBtn.style.alignItems = 'center';
    deleteBtn.style.justifyContent = 'center';
    deleteBtn.style.cursor = 'pointer';
    deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>';

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(deleteBtn);

    container.appendChild(row);

    // Event listeners
    keyInput.addEventListener('input', generatePreview);
    valueInput.addEventListener('input', generatePreview);
    deleteBtn.addEventListener('click', () => {
        row.remove();
        generatePreview();
    });

    safeCreateIcons();
    generatePreview();
}
window.addCustomFieldRow = addCustomFieldRow;

// Exportar respaldo completo de la aplicación (para iPhone)
function exportBackup() {
    try {
        const backupData = {};
        backupData[`${window.currentUser}_producer_config`] = localStorage.getItem(`${window.currentUser}_producer_config`);
        backupData[`${window.currentUser}_license_history`] = localStorage.getItem(`${window.currentUser}_license_history`);
        backupData[`${window.currentUser}_contacts`] = localStorage.getItem(`${window.currentUser}_contacts`);
        backupData[`${window.currentUser}_beats`] = localStorage.getItem(`${window.currentUser}_beats`);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        const dateStr = new Date().toISOString().slice(0,10);
        downloadAnchor.setAttribute("download", `${window.currentUser}_respaldo_completo_${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        showToast('Respaldo completo exportado con éxito');
    } catch (e) {
        showToast('Error al exportar respaldo: ' + e.message, true);
    }
}

// Importar respaldo completo de la aplicación
function importBackup(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const backupData = JSON.parse(e.target.result);
            let legacyUser = 'sossa';
            if (auth.currentUser && auth.currentUser.email) {
                const email = auth.currentUser.email.toLowerCase();
                if (email === 'beatscgmonarco@gmail.com') {
                    legacyUser = 'cgmonarco';
                } else if (email === 'mistermicua@gmail.com') {
                    legacyUser = 'mrmicua';
                }
            }

            const configKey = `${window.currentUser}_producer_config`;
            const historyKey = `${window.currentUser}_license_history`;
            const contactsKey = `${window.currentUser}_contacts`;
            const beatsKey = `${window.currentUser}_beats`;

            // Support both dynamic keys (new format) and legacy user keys
            if (backupData[configKey] !== undefined || backupData[`${legacyUser}_producer_config`] !== undefined) {
                const pc = backupData[configKey] || backupData[`${legacyUser}_producer_config`];
                const lh = backupData[historyKey] || backupData[`${legacyUser}_license_history`];
                const ct = backupData[contactsKey] || backupData[`${legacyUser}_contacts`];
                const bt = backupData[beatsKey] || backupData[`${legacyUser}_beats`];
                if (pc) safeSetItem(configKey, pc);
                if (lh) safeSetItem(historyKey, lh);
                if (ct) safeSetItem(contactsKey, ct);
                if (bt) safeSetItem(beatsKey, bt);
                
                showToast('✅ ¡Respaldo importado con éxito! Recargando...', false);
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                showToast('Archivo de respaldo no válido.', true);
            }
        } catch (err) {
            showToast('Error al parsear respaldo: ' + err.message, true);
        }
    };
    reader.readAsText(file);
}

// Subir copia de seguridad completa a Google Drive (Nube)
async function backupToGoogleDrive() {
    const btn = document.getElementById('btn-gdrive-backup');
    if (!btn) return;
    const originalText = btn.innerHTML;
    try {
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Subiendo...';
        btn.disabled = true;
        safeCreateIcons();

        const token = await getGdriveToken();
        const folderName = `${producerConfig.aka || 'Productor'} Licencias`;
        const backupFilename = `${window.currentUser}_backup_sincronizado.json`;
        const rootId = await getOrCreateDriveFolder(token, folderName);
        
        // Agrupar datos de localStorage
        const backupData = {};
        backupData[`${window.currentUser}_producer_config`] = localStorage.getItem(`${window.currentUser}_producer_config`);
        backupData[`${window.currentUser}_license_history`] = localStorage.getItem(`${window.currentUser}_license_history`);
        backupData[`${window.currentUser}_contacts`] = localStorage.getItem(`${window.currentUser}_contacts`);
        backupData[`${window.currentUser}_beats`] = localStorage.getItem(`${window.currentUser}_beats`);
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

        // Buscar si ya existe el archivo sincronizado
        const q = `name='${backupFilename}' and '${rootId}' in parents and trashed=false`;
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        if (existingFile) {
            // Actualizar contenido (PATCH)
            const uploadRes = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: blob
                }
            );
            if (!uploadRes.ok) throw new Error('Error al actualizar en Drive');
        } else {
            // Crear archivo (POST multipart)
            const metadata = { name: backupFilename, parents: [rootId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob, backupFilename);

            const uploadRes = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
            );
            if (!uploadRes.ok) throw new Error('Error al crear copia en Drive');
        }

        showToast('☁️ Copia de seguridad guardada en Drive con éxito');
    } catch (err) {
        console.error('Error de sincronización:', err);
        showToast('Error al respaldar en Drive: ' + err.message, true);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        safeCreateIcons();
    }
}

// Descargar copia de seguridad completa desde Google Drive (Nube)
async function restoreFromGoogleDrive() {
    const btn = document.getElementById('btn-gdrive-restore');
    if (!btn) return;
    const originalText = btn.innerHTML;
    try {
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Descargando...';
        btn.disabled = true;
        safeCreateIcons();

        const token = await getGdriveToken();
        const folderName = `${producerConfig.aka || 'Productor'} Licencias`;
        const backupFilename = `${window.currentUser}_backup_sincronizado.json`;
        const rootId = await getOrCreateDriveFolder(token, folderName);
        
        // Buscar el archivo
        const q = `name='${backupFilename}' and '${rootId}' in parents and trashed=false`;
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        if (!existingFile) {
            throw new Error('No se encontró copia sincronizada en Drive. Créala primero en tu Mac.');
        }

        // Descargar (media layout)
        const downloadRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!downloadRes.ok) throw new Error('Error al descargar archivo');

        const backupData = await downloadRes.json();
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const configKey2 = `${window.currentUser}_producer_config`;
        const historyKey2 = `${window.currentUser}_license_history`;
        const contactsKey2 = `${window.currentUser}_contacts`;
        const beatsKey2 = `${window.currentUser}_beats`;
        if (backupData[configKey2] !== undefined || backupData[`${legacyUser}_producer_config`] !== undefined) {
            const pc2 = backupData[configKey2] || backupData[`${legacyUser}_producer_config`];
            const lh2 = backupData[historyKey2] || backupData[`${legacyUser}_license_history`];
            const ct2 = backupData[contactsKey2] || backupData[`${legacyUser}_contacts`];
            const bt2 = backupData[beatsKey2] || backupData[`${legacyUser}_beats`];
            if (pc2) safeSetItem(configKey2, pc2);
            if (lh2) safeSetItem(historyKey2, lh2);
            if (ct2) safeSetItem(contactsKey2, ct2);
            if (bt2) safeSetItem(beatsKey2, bt2);
            
            showToast('✅ ¡Datos descargados e importados! Recargando...', false);
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error('El archivo descargado no es una copia de seguridad válida.');
        }
    } catch (err) {
        console.error('Error de descarga:', err);
        showToast('Error al restaurar desde Drive: ' + err.message, true);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        safeCreateIcons();
    }
}

// Auto-sincronizar de forma silenciosa en segundo plano si hay una sesión activa de Google
async function autoSyncGoogleDrive() {
    const cachedToken = sessionStorage.getItem('gdrive_access_token');
    const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
    
    // Si hay un token válido de Google Drive que dure al menos 2 minutos más
    if (cachedToken && Date.now() < expiry - 120000) {
        console.log('☁️ Auto-sincronizando silenciosamente con Google Drive...');
        try {
            const folderNameSync = `${producerConfig.aka || 'Productor'} Licencias`;
            const backupFilenameSync = `${window.currentUser}_backup_sincronizado.json`;
            const rootId = await getOrCreateDriveFolder(cachedToken, folderNameSync);
            const q = `name='${backupFilenameSync}' and '${rootId}' in parents and trashed=false`;
            const searchRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
                { headers: { 'Authorization': `Bearer ${cachedToken}` } }
            );
            
            if (!searchRes.ok) return;
            const searchData = await searchRes.json();
            const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

            if (existingFile) {
                const downloadRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
                    { headers: { 'Authorization': `Bearer ${cachedToken}` } }
                );
                if (downloadRes.ok) {
                    const backupData = await downloadRes.json();
                    let legacyUser = 'sossa';
                    if (auth.currentUser && auth.currentUser.email) {
                        const email = auth.currentUser.email.toLowerCase();
                        if (email === 'beatscgmonarco@gmail.com') {
                            legacyUser = 'cgmonarco';
                        } else if (email === 'mistermicua@gmail.com') {
                            legacyUser = 'mrmicua';
                        }
                    }

                    // ── PRIORIDAD: archivo local > Google Drive ─────────────────
                    // Contar licencias y contactos en cada fuente
                    let localCount = 0, driveCount = 0;
                    let localContacts = 0, driveContacts = 0;
                    try { localCount = JSON.parse(localStorage.getItem(`${window.currentUser}_license_history`) || '[]').length; } catch(e) {}
                    try { driveCount = JSON.parse(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]').length; } catch(e) {}
                    try { localContacts = JSON.parse(localStorage.getItem(`${window.currentUser}_contacts`) || '[]').length; } catch(e) {}
                    try { driveContacts = JSON.parse(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`] || '[]').length; } catch(e) {}

                    const localWeight = (localCount * 1000) + localContacts;
                    const driveWeight = (driveCount * 1000) + driveContacts;

                    // Si el archivo local tiene MÁS datos combinados que Drive → actualizar Drive con los datos locales
                    if (localWeight > driveWeight) {
                        console.log(`☁️ Local (${localWeight}) > Drive (${driveWeight}): actualizando Google Drive con datos locales...`);
                        autoBackupGoogleDrive();
                        return;
                    } else if (localWeight === driveWeight) {
                        const norm = (v) => (v === null || v === undefined || v === 'null') ? '' : v;
                        if (norm(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]) !== norm(localStorage.getItem(`${window.currentUser}_license_history`)) ||
                            norm(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]) !== norm(localStorage.getItem(`${window.currentUser}_contacts`))) {
                             // Si hay igual peso pero diferentes datos, subimos los locales para asegurar que lo último editado quede guardado
                             console.log(`☁️ Pesos iguales pero datos diferentes. Forzando backup a Drive...`);
                             autoBackupGoogleDrive();
                        }
                        return;
                    }

                    // Solo si Drive tiene MAYOR PESO que local → restaurar desde Drive
                    console.log(`☁️ Drive (${driveWeight}) > Local (${localWeight}): restaurando desde Google Drive...`);
                    const norm = (v) => (v === null || v === undefined || v === 'null') ? '' : v;

                    let changed = false;
                    if (norm(backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]) !== norm(localStorage.getItem(`${window.currentUser}_producer_config`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]) !== norm(localStorage.getItem(`${window.currentUser}_license_history`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]) !== norm(localStorage.getItem(`${window.currentUser}_contacts`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]) !== norm(localStorage.getItem(`${window.currentUser}_beats`))) changed = true;
                    
                    if (changed) {
                        const setOrRemove = (key, val) => {
                            if (val === null || val === undefined || val === 'null') {
                                localStorage.removeItem(key);
                            } else {
                                safeSetItem(key, val);
                            }
                        };
                        
                        setOrRemove(`${window.currentUser}_producer_config`, backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]);
                        setOrRemove(`${window.currentUser}_license_history`, backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]);
                        setOrRemove(`${window.currentUser}_contacts`, backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]);
                        setOrRemove(`${window.currentUser}_beats`, backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]);
                        
                        showToast(`🔄 Datos actualizados desde Google Drive (${driveCount} licencias)`, false);
                        setTimeout(() => {
                            window.location.reload();
                        }, 1200);
                    }
                }
            } else {
                // No existe el archivo en Drive → subirlo ahora con los datos locales
                console.log('☁️ No existe backup en Drive. Creando backup inicial...');
                autoBackupGoogleDrive();
            }
        } catch (e) {
            console.warn('Auto-sync silencioso falló:', e);
        }
    }
}

// Auto-respaldar de forma silenciosa en segundo plano en Google Drive si hay sesión activa (Debounced)
async function autoBackupGoogleDrive() {
    if (autoBackupTimeout) clearTimeout(autoBackupTimeout);
    
    autoBackupTimeout = setTimeout(async () => {
        const cachedToken = sessionStorage.getItem('gdrive_access_token');
        const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
        
        // Si hay un token válido de Google Drive que dure al menos 2 minutos más
        if (cachedToken && Date.now() < expiry - 120000) {
            console.log('☁️ Auto-guardando copia de seguridad en Google Drive (debounced)...');
            try {
                const folderNameAuto = `${producerConfig.aka || 'Productor'} Licencias`;
                const backupFilenameAuto = `${window.currentUser}_backup_sincronizado.json`;
                const rootId = await getOrCreateDriveFolder(cachedToken, folderNameAuto);
                
                // Agrupar datos de localStorage
                const backupData = {};
                backupData[`${window.currentUser}_producer_config`] = localStorage.getItem(`${window.currentUser}_producer_config`);
                backupData[`${window.currentUser}_license_history`] = localStorage.getItem(`${window.currentUser}_license_history`);
                backupData[`${window.currentUser}_contacts`] = localStorage.getItem(`${window.currentUser}_contacts`);
                backupData[`${window.currentUser}_beats`] = localStorage.getItem(`${window.currentUser}_beats`);
                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

                // Buscar si ya existe el archivo sincronizado
                const q = `name='${backupFilenameAuto}' and '${rootId}' in parents and trashed=false`;
                const searchRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
                    { headers: { 'Authorization': `Bearer ${cachedToken}` } }
                );
                
                if (!searchRes.ok) return;
                const searchData = await searchRes.json();
                const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

                if (existingFile) {
                    // Actualizar contenido (PATCH)
                    await fetch(
                        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
                        {
                            method: 'PATCH',
                            headers: { 'Authorization': `Bearer ${cachedToken}`, 'Content-Type': 'application/json' },
                            body: blob
                        }
                    );
                } else {
                    // Crear archivo (POST multipart)
                    const metadata = { name: backupFilenameAuto, parents: [rootId] };
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    form.append('file', blob, backupFilenameAuto);

                    await fetch(
                        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                        { method: 'POST', headers: { 'Authorization': `Bearer ${cachedToken}` }, body: form }
                    );
                }
                console.log('☁️ Auto-respaldo en Google Drive completado con éxito (debounced).');
            } catch (err) {
                console.warn('Auto-respaldo silencioso en Drive falló:', err);
            }
        }
    }, 2000);
}




// Cargar historial de Firestore (con fallback a localStorage) e inyectar siempre las licencias semilla para Sossa Admin
async function loadHistory() {
    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUserIsPro) {
        try {
            const colRef = collection(db, "users", window.currentUser, "licencias");
            const querySnapshot = await getDocs(colRef);
            querySnapshot.forEach((docSnap) => {
                savedList.push(docSnap.data());
            });
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar historial de Firestore:", err);
        }
    }

    // Cargar de localStorage para fusionar
    let localList = [];
    const saved = localStorage.getItem(`${window.currentUser}_license_history`);
    if (saved) {
        try {
            localList = JSON.parse(saved);
            if (!Array.isArray(localList)) localList = [];
        } catch (e) {
            localList = [];
        }
    }

    // Fusionar listas usando refCode como clave única
    let mergedList = [...savedList];
    let needsSaveToFirestore = false;
    
    localList.forEach(localLic => {
        if (localLic && localLic.refCode) {
            const exists = mergedList.some(l => l.refCode === localLic.refCode);
            if (!exists) {
                mergedList.push(localLic);
                needsSaveToFirestore = true;
            }
        }
    });

    // Ordenar por fecha descendente
    mergedList.sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        return dateB.localeCompare(dateA);
    });

    licenseHistory = mergedList;

    // Manejo de licencias semilla (solo para sossa admin)
    let changed = false;
    if (window.currentUserIsAdmin) {
        SEED_LICENSES.forEach(seed => {
            if (!licenseHistory.some(l => l.refCode === seed.refCode)) {
                licenseHistory.push(seed);
                changed = true;
            }
        });
    } else {
        // Limpiar si se inyectaron por error en otra cuenta previamente
        const originalLength = licenseHistory.length;
        const seedCodes = SEED_LICENSES.map(s => s.refCode);
        licenseHistory = licenseHistory.filter(l => !seedCodes.includes(l.refCode));
        if (licenseHistory.length !== originalLength) changed = true;
    }
    
    if (changed || needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_license_history`, JSON.stringify(licenseHistory));
        if (firestoreLoaded) {
            console.log("Subiendo licencias locales combinadas a Firestore...");
            for (const lic of licenseHistory) {
                if (!lic.refCode) continue;
                try {
                    const licDocRef = doc(db, "users", window.currentUser, "licencias", lic.refCode);
                    await setDoc(licDocRef, lic);
                } catch (err) {
                    console.error("Error al guardar licencia en Firestore:", err);
                }
            }
        }
    }

    updateHistoryTable();
}

// Guardar historial en Firestore y localStorage
async function saveHistory() {
    safeSetItem(`${window.currentUser}_license_history`, JSON.stringify(licenseHistory));
    
    // Si el historial no está vacío, intentar convertir el referido de este usuario
    if (licenseHistory.length > 0) {
        triggerReferralConversion();
    }
    
    if (!window.currentUserIsPro) {
        updateHistoryTable();
        return;
    }
    
    // Guardar cada documento en Firestore de forma asíncrona
    for (const lic of licenseHistory) {
        if (!lic.refCode) continue;
        try {
            const licDocRef = doc(db, "users", window.currentUser, "licencias", lic.refCode);
            await setDoc(licDocRef, lic);
        } catch (err) {
            console.error("Error al guardar licencia en Firestore:", err);
        }
    }
    updateHistoryTable();
}

// Configurar los manejadores de eventos
function setupEventListeners() {
    // Botones de tipo de licencia
    const licenseBtns = document.querySelectorAll('.license-btn');
    licenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            licenseBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            selectLicenseType(targetBtn.dataset.type);
        });
    });

    // Interacción con campos del formulario principal
    const inputIds = [
        'beat-name', 'buyer-name', 'buyer-id', 'buyer-email', 'buyer-phone', 
        'buyer-city', 'buyer-country', 'license-value', 'effective-date', 
        'celebration-place', 'payment-method', 'clause-formats', 'clause-streams',
        'clause-physical', 'clause-videos', 'clause-video-duration', 'clause-years',
        'clause-termination-fee', 'clause-writer-share', 'clause-producer-share',
        'clause-credits'
    ];
    
    // Función helper para debounce (limitar frecuencia de ejecución)
    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }
    const debouncedGeneratePreview = debounce(generatePreview, 300);

    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', debouncedGeneratePreview);
    });

    document.getElementById('payment-method').addEventListener('change', generatePreview);
    document.getElementById('clause-content-id').addEventListener('change', generatePreview);

    // Botones Header (Idioma y Tema)
    const registerLanguageToggle = (id) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', () => {
                currentLang = currentLang === 'es' ? 'en' : 'es';
                localStorage.setItem('beatss_language', currentLang);
                updateUILanguage();
            });
        }
    };
    registerLanguageToggle('btn-language');
    registerLanguageToggle('landing-btn-language');
    registerLanguageToggle('catalog-btn-language');

    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            const isLight = document.body.classList.contains('light-theme');
            document.getElementById('theme-icon').setAttribute('data-lucide', isLight ? 'sun' : 'moon');
            safeCreateIcons();
            localStorage.setItem(`${window.currentUser}_theme`, isLight ? 'light' : 'dark');
        });
        
        // Cargar tema guardado por usuario
        if (localStorage.getItem(`${window.currentUser}_theme`) === 'light') {
            document.body.classList.add('light-theme');
            document.getElementById('theme-icon').setAttribute('data-lucide', 'sun');
            safeCreateIcons();
        }
    }

    // Botón de configuración (modal)
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-cancel-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-save-settings').addEventListener('click', saveProducerConfig);
    document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
    
    // Vinculación de Google Drive Central (Admin)
    const btnLinkCentralGDrive = document.getElementById('btn-link-central-gdrive');
    if (btnLinkCentralGDrive) {
        btnLinkCentralGDrive.addEventListener('click', initPlatformGDriveOAuth);
    }

    // Vinculación de Google Account para Login
    const btnLinkGoogleLogin = document.getElementById('btn-link-google-login');
    if (btnLinkGoogleLogin) {
        btnLinkGoogleLogin.addEventListener('click', linkGoogleAccountForLogin);
    }

    // Evento Canjear Código VIP
    const btnRedeemVip = document.getElementById('btn-redeem-vip');
    if (btnRedeemVip) {
        btnRedeemVip.addEventListener('click', redeemVIPCode);
    }

    // Evento Añadir Campo Personalizado
    const btnAddCustomField = document.getElementById('btn-add-custom-field');
    if (btnAddCustomField) {
        btnAddCustomField.addEventListener('click', () => addCustomFieldRow('', ''));
    }
    
    // Eventos de firma manual
    document.getElementById('btn-upload-signature').addEventListener('click', () => {
        document.getElementById('cfg-producer-signature-file').click();
    });
    document.getElementById('cfg-producer-signature-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 400;
                if (width > maxDim || height > maxDim) {
                    if (width > height) {
                        height = Math.round((height * maxDim) / width);
                        width = maxDim;
                    } else {
                        width = Math.round((width * maxDim) / height);
                        height = maxDim;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                const compressedBase64 = canvas.toDataURL('image/png');
                document.getElementById('signature-preview-img').src = compressedBase64;
                document.getElementById('signature-preview-container').style.display = 'block';
                document.getElementById('btn-clear-signature').style.display = 'inline-block';
                window.tempSignatureBase64 = compressedBase64;
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    });
    document.getElementById('btn-clear-signature').addEventListener('click', () => {
        document.getElementById('cfg-producer-signature-file').value = '';
        document.getElementById('signature-preview-img').src = '';
        document.getElementById('signature-preview-container').style.display = 'none';
        document.getElementById('btn-clear-signature').style.display = 'none';
        window.tempSignatureBase64 = null;
    });

    // Eventos de logotipo personalizado (Planes Pro / Elite)
    const btnUploadLogoEl = document.getElementById('btn-upload-logo');
    const fileLogoInputEl = document.getElementById('cfg-producer-logo-file');
    const btnClearLogoEl = document.getElementById('btn-clear-logo');

    if (btnUploadLogoEl && fileLogoInputEl && btnClearLogoEl) {
        btnUploadLogoEl.addEventListener('click', () => {
            const isElite = (producerConfig.plan === 'elite' || window.currentUserIsAdmin);
            if (!isElite) {
                showToast("⚠️ Esta función requiere el plan Elite.", true);
                return;
            }
            fileLogoInputEl.click();
        });

        fileLogoInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validar tipo de archivo
            if (!file.type.startsWith('image/')) {
                showToast("❌ Por favor selecciona un archivo de imagen válido.", true);
                fileLogoInputEl.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 300; // Ancho/alto máximo de 300px para el logotipo
                    
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Comprimir y codificar en PNG base64
                    const compressedBase64 = canvas.toDataURL('image/png');
                    
                    document.getElementById('logo-preview-img').src = compressedBase64;
                    document.getElementById('logo-preview-container').style.display = 'block';
                    btnClearLogoEl.style.display = 'inline-block';
                    window.tempLogoBase64 = compressedBase64;
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });

        btnClearLogoEl.addEventListener('click', () => {
            fileLogoInputEl.value = '';
            document.getElementById('logo-preview-img').src = '';
            document.getElementById('logo-preview-container').style.display = 'none';
            btnClearLogoEl.style.display = 'none';
            window.tempLogoBase64 = null;
        });
    }

    // Eventos de Tag de Audio del Productor
    const btnUploadAudioTagEl = document.getElementById('btn-upload-audio-tag');
    const fileAudioTagInputEl = document.getElementById('cfg-producer-audio-tag-file');
    const btnClearAudioTagEl = document.getElementById('btn-clear-audio-tag');
    const audioTagNameSpanEl = document.getElementById('cfg-audio-tag-name');
    const audioTagPreviewContainerEl = document.getElementById('cfg-audio-tag-preview-container');

    if (btnUploadAudioTagEl && fileAudioTagInputEl && btnClearAudioTagEl) {
        btnUploadAudioTagEl.addEventListener('click', () => {
            fileAudioTagInputEl.click();
        });

        fileAudioTagInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validar tipo de archivo (audio)
            if (!file.type.startsWith('audio/')) {
                showToast("❌ Por favor selecciona un archivo de audio válido.", true);
                fileAudioTagInputEl.value = '';
                return;
            }

            // Validar tamaño de archivo (máximo 1.5 MB para el tag)
            const MAX_SIZE = 1.5 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
                showToast("❌ El archivo es demasiado grande (máximo 1.5 MB).", true);
                fileAudioTagInputEl.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                window.tempAudioTagBase64 = evt.target.result;
                window.tempAudioTagName = file.name;
                if (audioTagNameSpanEl) audioTagNameSpanEl.textContent = file.name;
                if (audioTagPreviewContainerEl) audioTagPreviewContainerEl.style.display = 'flex';
                showToast("🎵 Tag de audio cargado localmente (se guardará al actualizar configuración).");
            };
            reader.readAsDataURL(file);
        });

        btnClearAudioTagEl.addEventListener('click', () => {
            fileAudioTagInputEl.value = '';
            if (audioTagNameSpanEl) audioTagNameSpanEl.textContent = '';
            if (audioTagPreviewContainerEl) audioTagPreviewContainerEl.style.display = 'none';
            window.tempAudioTagBase64 = null;
            window.tempAudioTagName = null;
            showToast("🗑️ Tag de audio de la marca eliminado.");
        });
    }

    // Eventos para subir archivo de firma electrónica (.p12) para SRI
    const btnUploadSriP12El = document.getElementById('btn-upload-sri-p12');
    const fileSriP12InputEl = document.getElementById('cfg-sri-p12-file');
    const sriP12StatusEl = document.getElementById('cfg-sri-p12-status');

    if (btnUploadSriP12El && fileSriP12InputEl) {
        btnUploadSriP12El.addEventListener('click', () => {
            fileSriP12InputEl.click();
        });

        fileSriP12InputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validar extensión
            const ext = file.name.split('.').pop().toLowerCase();
            if (ext !== 'p12' && ext !== 'pfx') {
                showToast("❌ Por favor selecciona un archivo de firma electrónica válido (.p12 o .pfx).", true);
                fileSriP12InputEl.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                // El resultado es un DataURL tipo data:application/x-pkcs12;base64,.....
                window.tempSriP12Base64 = evt.target.result;
                if (sriP12StatusEl) {
                    sriP12StatusEl.innerHTML = `✅ <strong style="color: #4ade80;">Firma seleccionada localmente: ${file.name}</strong>. Recuerda guardar la configuración.`;
                }
                showToast("🔑 Archivo de firma .p12 cargado en memoria (se guardará al actualizar configuración).");
            };
            reader.readAsDataURL(file);
        });
    }

    // Eventos de carátula predeterminada (para todos los beats)
    const btnUploadDefaultArtworkEl = document.getElementById('btn-upload-default-artwork');
    const fileDefaultArtworkInputEl = document.getElementById('cfg-default-beat-artwork-file');
    const btnClearDefaultArtworkEl = document.getElementById('btn-clear-default-artwork');

    if (btnUploadDefaultArtworkEl && fileDefaultArtworkInputEl && btnClearDefaultArtworkEl) {
        btnUploadDefaultArtworkEl.addEventListener('click', () => {
            fileDefaultArtworkInputEl.click();
        });

        fileDefaultArtworkInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            // Validar tipo de archivo
            if (!file.type.startsWith('image/')) {
                showToast("❌ Por favor selecciona un archivo de imagen válido.", true);
                fileDefaultArtworkInputEl.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const size = 500; // Cuadrado de 500x500 píxeles para excelente calidad y rendimiento
                    canvas.width = size;
                    canvas.height = size;
                    
                    const ctx = canvas.getContext('2d');
                    
                    // Calcular recorte proporcional para centrado (crop cover)
                    let srcX = 0;
                    let srcY = 0;
                    let srcWidth = img.width;
                    let srcHeight = img.height;
                    
                    if (img.width > img.height) {
                        // Horizontal (paisaje): recortar laterales
                        srcWidth = img.height;
                        srcX = (img.width - img.height) / 2;
                    } else if (img.height > img.width) {
                        // Vertical (retrato): recortar superior/inferior
                        srcHeight = img.width;
                        srcY = (img.height - img.width) / 2;
                    }
                    
                    ctx.drawImage(img, srcX, srcY, srcWidth, srcHeight, 0, 0, size, size);
                    
                    // Comprimir y codificar en JPEG con calidad premium (0.85)
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    
                    document.getElementById('default-artwork-preview-img').src = compressedBase64;
                    document.getElementById('default-artwork-preview-container').style.display = 'block';
                    btnClearDefaultArtworkEl.style.display = 'inline-block';
                    window.tempDefaultArtworkBase64 = compressedBase64;
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });

        btnClearDefaultArtworkEl.addEventListener('click', () => {
            fileDefaultArtworkInputEl.value = '';
            document.getElementById('default-artwork-preview-img').src = '';
            document.getElementById('default-artwork-preview-container').style.display = 'none';
            btnClearDefaultArtworkEl.style.display = 'none';
            window.tempDefaultArtworkBase64 = null;
        });
    }

    document.getElementById('input-import-backup').addEventListener('change', importBackup);
    // Analizador de ZIP
    document.getElementById('input-import-zip').addEventListener('change', handleZipSelect);
    document.getElementById('btn-analyze-zip').addEventListener('click', analyzeSelectedZip);

    // Función global para cambio de pestañas (escritorio y móviles)
    window.switchTab = function(tabId) {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const sidebarEl = document.querySelector('aside.sidebar');
        const mobileSelect = document.getElementById('mobile-tab-select');

        // Sincronizar select de móvil si existe
        if (mobileSelect && mobileSelect.value !== tabId) {
            mobileSelect.value = tabId;
        }

        // Sincronizar botones de escritorio
        tabBtns.forEach(btn => {
            if (btn.dataset.tab === tabId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // Ocultar todos los contenidos y mostrar el activo
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        const targetContent = document.getElementById(tabId);
        if (targetContent) {
            targetContent.classList.add('active');
        }

        // Mostrar/ocultar sidebar según el tab activo
        if (tabId === 'tab-history' || tabId === 'tab-dashboard' || tabId === 'tab-admin' || tabId === 'tab-beats' || tabId === 'tab-sales' || tabId === 'tab-whitelist') {
            sidebarEl && sidebarEl.classList.add('sidebar-hidden');
        } else {
            sidebarEl && sidebarEl.classList.remove('sidebar-hidden');
        }

        // Acciones específicas por pestaña
        if (tabId === 'tab-beats') {
            renderBeatsGrid();
            updateGenreAndKeyFilters();
        }
        if (tabId === 'tab-admin' && window.currentUserIsAdmin) {
            loadConsolidatedAccounting();
        }
        if (tabId === 'tab-dashboard') {
            updateDashboardView();
        }
        if (tabId === 'tab-sales') {
            loadSalesData();
        }
        if (tabId === 'tab-whitelist') {
            if (typeof window.loadWhitelistData === 'function') {
                window.loadWhitelistData();
            }
        }
    };

    // Cambio de pestañas (escritorio)
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetBtn = e.currentTarget;
            window.switchTab(targetBtn.dataset.tab);
        });
    });

    // Cambio de pestañas (selector móvil)
    const mobileSelect = document.getElementById('mobile-tab-select');
    if (mobileSelect) {
        mobileSelect.addEventListener('change', (e) => {
            window.switchTab(e.target.value);
        });
    }

    // Cambio de modo de previsualización (Rendered vs Markdown)
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const mode = btn.dataset.mode;
            const renderedEl = document.getElementById('rendered-contract-content');
            const markdownEl = document.getElementById('markdown-contract-content');
            
            if (mode === 'rendered') {
                renderedEl.style.display = 'block';
                markdownEl.style.display = 'none';
            } else {
                renderedEl.style.display = 'none';
                markdownEl.style.display = 'block';
            }
        });
    });

    // Acciones principales
    document.getElementById('btn-download-pdf').addEventListener('click', downloadPDF);
    document.getElementById('btn-send-email').addEventListener('click', sendEmailDelivery);
    document.getElementById('btn-docusign').addEventListener('click', sendToDocuSign);
    document.getElementById('btn-send-signed-delivery').addEventListener('click', checkAndSendSignedDelivery);
    document.getElementById('btn-copy-md').addEventListener('click', copyMarkdown);
    document.getElementById('btn-save').addEventListener('click', saveCurrentLicenseToHistory);

    // Refresh de admin consolidado
    const adminRefreshBtn = document.getElementById('btn-admin-refresh');
    if (adminRefreshBtn) {
        adminRefreshBtn.addEventListener('click', loadConsolidatedAccounting);
    }

    // Generar código VIP (Solo Admin Sossa)
    const adminGenerateVipBtn = document.getElementById('btn-admin-generate-vip');
    if (adminGenerateVipBtn) {
        adminGenerateVipBtn.addEventListener('click', () => {
            if (window.generateVipCodeAdmin) window.generateVipCodeAdmin();
        });
    }

    // Importar CSV de transacciones de BeatStars
    const btnImportBeatstarsCsv = document.getElementById('btn-import-beatstars-csv');
    const beatstarsCsvInput = document.getElementById('beatstars-csv-input');
    if (btnImportBeatstarsCsv && beatstarsCsvInput) {
        btnImportBeatstarsCsv.addEventListener('click', () => beatstarsCsvInput.click());
        beatstarsCsvInput.addEventListener('change', handleBeatStarsCsvImport);
    }

    // Dashboard listeners
    const dbPeriodSelect = document.getElementById('dashboard-period');
    if (dbPeriodSelect) {
        dbPeriodSelect.addEventListener('change', updateDashboardView);
    }
    const dbRefreshBtn = document.getElementById('btn-dashboard-refresh');
    if (dbRefreshBtn) {
        dbRefreshBtn.addEventListener('click', updateDashboardView);
    }

    document.getElementById('btn-clear-fields').addEventListener('click', clearFormFields);
    document.getElementById('btn-clear-history').addEventListener('click', clearAllHistory);

    // Directorio de Contactos
    document.getElementById('btn-contacts-modal').addEventListener('click', openContactsModal);
    document.getElementById('btn-close-contacts').addEventListener('click', closeContactsModal);
    document.getElementById('btn-cancel-contacts').addEventListener('click', closeContactsModal);
    document.getElementById('search-contacts').addEventListener('input', renderContactsTable);
    document.getElementById('btn-export-csv').addEventListener('click', exportHistoryToCSV);
    document.getElementById('btn-export-json').addEventListener('click', exportHistoryToJSON);

    // Logout
    const switchBtn = document.getElementById('btn-switch-user');
    if (switchBtn) {
        switchBtn.addEventListener('click', () => {
            // Cancelar listener de pagos en tiempo real antes de cerrar sesión
            if (typeof window._salesUnsubscribe === 'function') {
                window._salesUnsubscribe();
                window._salesUnsubscribe = null;
            }
            
            // Indicar que estamos cerrando sesión para omitir actualizaciones del DOM
            window.isLoggingOut = true;
            
            signOut(auth).then(() => {
                localStorage.removeItem('active_user');
                console.log("Sesión de Firebase cerrada con éxito.");
                window.location.reload();
            }).catch(err => {
                console.error("Error al cerrar sesión de Firebase:", err);
                localStorage.removeItem('active_user');
                window.location.reload();
            });
        });
    }

    // Importador de Carpeta (PDF por nombre de archivo)
    const folderInput = document.getElementById('folder-import-input');
    document.getElementById('btn-import-folder').addEventListener('click', () => {
        folderInput.click();
    });
    folderInput.addEventListener('change', (e) => {
        handleFolderImport(e.target.files);
    });
    
    // Buscador
    document.getElementById('history-search').addEventListener('input', filterHistory);

    // Modal: Añadir licencia manualmente
    document.getElementById('btn-add-manual').addEventListener('click', openManualAddModal);
    document.getElementById('btn-close-manual-modal').addEventListener('click', closeManualAddModal);
    document.getElementById('btn-cancel-manual-modal').addEventListener('click', closeManualAddModal);
    document.getElementById('btn-confirm-manual-add').addEventListener('click', confirmManualAdd);
    document.getElementById('manual-add-modal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) closeManualAddModal();
    });

    // Eventos de comprobante de pago local (Ecuador)
    const btnUploadReceipt = document.getElementById('btn-upload-receipt-img');
    const inputReceiptFile = document.getElementById('receipt-img-file');
    const spanReceiptName = document.getElementById('receipt-img-name');
    const previewContainer = document.getElementById('receipt-preview-container');
    const previewImg = document.getElementById('receipt-preview-img');

    if (btnUploadReceipt && inputReceiptFile) {
        btnUploadReceipt.addEventListener('click', () => {
            inputReceiptFile.click();
        });
        
        inputReceiptFile.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) {
                if (spanReceiptName) spanReceiptName.textContent = 'No se ha seleccionado archivo';
                if (previewContainer) previewContainer.style.display = 'none';
                currentUploadedReceiptBase64 = null;
                return;
            }
            
            if (spanReceiptName) spanReceiptName.textContent = file.name;
            
            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 800;
                    if (width > maxDim || height > maxDim) {
                        if (width > height) {
                            height = Math.round((height * maxDim) / width);
                            width = maxDim;
                        } else {
                            width = Math.round((width * maxDim) / height);
                            height = maxDim;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Comprimir como JPEG para ahorrar espacio (~50-100KB), calidad 0.85
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    
                    if (previewImg) previewImg.src = compressedBase64;
                    if (previewContainer) previewContainer.style.display = 'block';
                    currentUploadedReceiptBase64 = compressedBase64;
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    const formSubmitReceipt = document.getElementById('frm-submit-receipt');
    if (formSubmitReceipt) {
        formSubmitReceipt.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            if (!auth.currentUser) {
                alert('Debes iniciar sesión para registrar un pago.');
                return;
            }
            
            if (!currentUploadedReceiptBase64) {
                alert('Por favor selecciona una captura de tu comprobante de pago.');
                return;
            }
            
            const method = document.getElementById('receipt-method').value;
            const ref = document.getElementById('receipt-ref').value.trim();
            const submitBtn = formSubmitReceipt.querySelector('button[type="submit"]');
            const originalBtnHtml = submitBtn.innerHTML;
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ Subiendo captura a Storage...';
            
            try {
                // Convertir base64 de la captura a un Blob
                const blob = await dataURLtoBlob(currentUploadedReceiptBase64);
                
                // Subir a Firebase Storage en la ruta receipts/saas/UID_timestamp.jpg
                const storagePath = `receipts/saas/${auth.currentUser.uid}_${Date.now()}.jpg`;
                const downloadUrl = await uploadFileToStorage(blob, storagePath);
                
                submitBtn.innerHTML = '⏳ Registrando comprobante...';

                // Importamos addDoc en la cabecera de firebase.js
                const paymentsCol = collection(db, "payments");
                const docData = {
                    userId: auth.currentUser.uid,
                    userEmail: auth.currentUser.email,
                    aka: producerConfig.aka || '',
                    method: method,
                    reference: ref,
                    status: 'pending',
                    plan: window.selectedPaymentPlan || 'pro',
                    receiptUrl: downloadUrl,
                    timestamp: new Date().toISOString()
                };
                
                // addDoc
                await addDoc(paymentsCol, docData);
                
                alert('¡Comprobante enviado con éxito! Sossa lo revisará para activar tu cuenta Pro.');
                
                // Limpiar
                formSubmitReceipt.reset();
                if (spanReceiptName) spanReceiptName.textContent = 'No se ha seleccionado archivo';
                if (previewContainer) previewContainer.style.display = 'none';
                if (previewImg) previewImg.src = '';
                currentUploadedReceiptBase64 = null;
                
                // Cerrar modal
                closePaymentModal();
            } catch (err) {
                console.error("Error al guardar comprobante de pago:", err);
                alert('Error al enviar el comprobante: ' + err.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalBtnHtml;
            }
        });
    }

    // Eventos de visualización y edición de plantillas de contrato
    const templateSelect = document.getElementById('contract-template-select');
    if (templateSelect) {
        templateSelect.addEventListener('change', () => {
            generatePreview();
        });
    }

    const btnEditTemplates = document.getElementById('btn-edit-templates');
    if (btnEditTemplates) {
        btnEditTemplates.addEventListener('click', openTemplatesEditor);
    }

    const btnCloseTemplatesEditor = document.getElementById('btn-close-templates-editor');
    if (btnCloseTemplatesEditor) {
        btnCloseTemplatesEditor.addEventListener('click', closeTemplatesEditor);
    }

    const editTemplateSelect = document.getElementById('edit-template-select');
    if (editTemplateSelect) {
        editTemplateSelect.addEventListener('change', (e) => {
            loadTemplateToEditor(e.target.value);
        });
    }

    const btnSaveTemplate = document.getElementById('btn-save-template');
    if (btnSaveTemplate) {
        btnSaveTemplate.addEventListener('click', async () => {
            const selectEl = document.getElementById('edit-template-select');
            const textareaEl = document.getElementById('template-editor-textarea');
            if (selectEl && textareaEl) {
                const templateId = selectEl.value;
                const markdown = textareaEl.value;
                
                const originalHTML = btnSaveTemplate.innerHTML;
                btnSaveTemplate.disabled = true;
                btnSaveTemplate.textContent = 'Guardando...';
                
                try {
                    await saveTemplateCustom(templateId, markdown);
                    showToast('Plantilla guardada correctamente.');
                    
                    const activeSel = document.getElementById('contract-template-select');
                    if (activeSel && activeSel.value === templateId) {
                        generatePreview();
                    }
                } catch (err) {
                    console.error(err);
                    showToast('Error al guardar la plantilla.', true);
                } finally {
                    btnSaveTemplate.disabled = false;
                    btnSaveTemplate.innerHTML = originalHTML;
                }
            }
        });
    }

    const btnResetTemplate = document.getElementById('btn-reset-template');
    if (btnResetTemplate) {
        btnResetTemplate.addEventListener('click', async () => {
            const selectEl = document.getElementById('edit-template-select');
            if (selectEl && confirm('¿Estás seguro de que deseas restaurar esta plantilla a los valores por defecto? Se perderán todos tus cambios personalizados.')) {
                const templateId = selectEl.value;
                
                const originalHTML = btnResetTemplate.innerHTML;
                btnResetTemplate.disabled = true;
                btnResetTemplate.textContent = 'Restaurando...';
                
                try {
                    await resetTemplateCustom(templateId);
                    loadTemplateToEditor(templateId);
                    showToast('Plantilla restaurada a los valores por defecto.');
                    
                    const activeSel = document.getElementById('contract-template-select');
                    if (activeSel && activeSel.value === templateId) {
                        generatePreview();
                    }
                } catch (err) {
                    console.error(err);
                    showToast('Error al restaurar la plantilla.', true);
                } finally {
                    btnResetTemplate.disabled = false;
                    btnResetTemplate.innerHTML = originalHTML;
                }
            }
        });
    }

    initTooltips();
}

// Abrir el modal de añadir manualmente
function openManualAddModal() {
    // Poner fecha de hoy por defecto
    document.getElementById('m-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('m-beat-name').value = '';
    document.getElementById('m-buyer-name').value = '';
    document.getElementById('m-buyer-id').value = '';
    document.getElementById('m-buyer-email').value = '';
    document.getElementById('m-value').value = '';
    document.getElementById('m-ref-code').value = '';
    document.getElementById('m-license-type').value = 'premium';
    document.getElementById('m-payment').value = 'Transferencia Bancaria';
    // Limpiar campos de audio para evitar datos de sesiones anteriores
    const mpEl = document.getElementById('m-audio-mp3');
    const wvEl = document.getElementById('m-audio-wav');
    const stEl = document.getElementById('m-audio-stems');
    if (mpEl) mpEl.value = '';
    if (wvEl) wvEl.value = '';
    if (stEl) stEl.value = '';
    document.getElementById('manual-add-modal').style.display = 'flex';
    safeCreateIcons();
    document.getElementById('m-beat-name').focus();
}

// Cerrar modal
function closeManualAddModal() {
    document.getElementById('manual-add-modal').style.display = 'none';
}

// Confirmar y guardar licencia manual en el historial
function confirmManualAdd() {
    const beatName  = document.getElementById('m-beat-name').value.trim();
    const buyerName = document.getElementById('m-buyer-name').value.trim();
    const valueRaw  = document.getElementById('m-value').value.trim();
    const type      = document.getElementById('m-license-type').value;

    if (!beatName) {
        showToast('El nombre del Beat es obligatorio', true);
        document.getElementById('m-beat-name').focus();
        return;
    }
    if (!buyerName) {
        showToast('El nombre del Comprador es obligatorio', true);
        document.getElementById('m-buyer-name').focus();
        return;
    }
    if (!valueRaw) {
        showToast('El valor en USD es obligatorio', true);
        document.getElementById('m-value').focus();
        return;
    }

    const value       = parseFloat(valueRaw) || 0;
    const buyerId     = document.getElementById('m-buyer-id').value.trim();
    const buyerEmail  = document.getElementById('m-buyer-email').value.trim();
    const date        = document.getElementById('m-date').value || new Date().toISOString().split('T')[0];
    const paymentMethod = document.getElementById('m-payment').value;
    const config      = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;

    // Usar refCode personalizado o generar uno automático
    let refCode = document.getElementById('m-ref-code').value.trim();
    if (!refCode) {
        refCode = generateReferenceCode(type);
    }

    const licenseData = {
        refCode,
        date,
        beatName,
        buyerName,
        type,
        value,
        paymentMethod,
        audioLinks: {
            mp3: document.getElementById('m-audio-mp3').value.trim(),
            wav: document.getElementById('m-audio-wav').value.trim(),
            stems: document.getElementById('m-audio-stems').value.trim()
        },
        formData: {
            buyerId,
            buyerEmail,
            buyerPhone: '',
            buyerCity: '',
            buyerCountry: '',
            celebrationPlace: '',
            formats: config.formats,
            streams: config.streams,
            physical: config.physical,
            videos: config.videos,
            videoDuration: config.videoDuration,
            years: config.years,
            terminationFee: type === 'exclusive'
                ? 'No aplica'
                : `200% ($${(value * 2).toFixed(2)} USD)`,
            writerShare: 50,
            producerShare: 50,
            credits: config.credits,
            contentId: config.contentId
        }
    };

    // Actualizar si ya existe ese refCode, o agregar nuevo
    const existingIdx = licenseHistory.findIndex(l => l.refCode === refCode);
    if (existingIdx !== -1) {
        licenseHistory[existingIdx] = licenseData;
        showToast(`Licencia actualizada: ${beatName} - ${buyerName}`);
    } else {
        licenseHistory.unshift(licenseData);
        showToast(`Licencia guardada: ${beatName} - ${buyerName}`);
    }

    saveHistory();
    updateHistoryTable();
    closeManualAddModal();
}

// Selección de tipo de licencia y auto-completado de campos

// Funciones del Modal de Configuración
function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn('Error al crear iconos en modal:', e);
        }
    }
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

// Crear un Toast (Notificación flotante) premium
function showToast(message, isError = false) {
    // Remover notificaciones anteriores
    const oldToasts = document.querySelectorAll('.toast');
    oldToasts.forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerHTML = `
        <i data-lucide="${isError ? 'alert-triangle' : 'check-circle-2'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    safeCreateIcons();

    // Estilo en JS para la animación
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        backgroundColor: isError ? 'var(--danger)' : 'var(--bg-card)',
        color: '#fff',
        border: isError ? 'none' : '1px solid var(--border-color)',
        padding: '12px 20px',
        borderRadius: '8px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: 'var(--shadow-lg)',
        zIndex: '2000',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px',
        fontWeight: '500'
    });

    // Agregar estilos de animación si no existen
    if (!document.getElementById('toast-animation-styles')) {
        const style = document.createElement('style');
        style.id = 'toast-animation-styles';
        style.textContent = `
            @keyframes slideUp {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
            .animate-spin {
                animation: spin 1s linear infinite;
            }
            @keyframes spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
            }
        `;
        document.head.appendChild(style);
    }

    // Auto-eliminar después de 3.5 segundos
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// Inicializar tooltips premium reemplazando el atributo 'title' nativo
function initTooltips() {
    document.querySelectorAll('button[title], a[title], .btn-icon-only[title], .btn[title]').forEach(el => {
        const titleText = el.getAttribute('title');
        if (titleText) {
            el.setAttribute('data-tooltip', titleText);
            el.removeAttribute('title');
        }
    });
}

// Exponer como global para uso en onclick inline
window.showToast = showToast;
window.initTooltips = initTooltips;
window.checkPlanLimitExceeded = checkPlanLimitExceeded;
window.saveHistory = saveHistory;
window.loadHistory = loadHistory;
window.openSettingsModal = openSettingsModal;
window.addCustomFieldRow = addCustomFieldRow;
window.initDefaultDate = initDefaultDate;
window.safeGetItem = safeGetItem;

window.showAppView = function(viewName, params = null, pushState = true) {
    console.log("🚦 Cambiando a vista:", viewName, "con parámetros:", params);
    
    // Toggle class active de administración en el body para el chatbot
    if (viewName === 'home' && window.currentUser) {
        document.body.classList.add('admin-active');
    } else {
        document.body.classList.remove('admin-active');
    }
    
    // Resetear modos globales por defecto para evitar fugas visuales (como el carrito de compras)
    window.stateManager.setState('isGlobalCatalogMode', false);
    window.stateManager.setState('isPublicStoreMode', false);
    
    // 1. Ocultar todos los contenedores principales
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    
    const appContainer = document.getElementById('app-container');
    if (appContainer) appContainer.style.display = 'none';
    
    const globalCatalog = document.getElementById('global-catalog-view');
    if (globalCatalog) globalCatalog.style.display = 'none';
    
    const publicStore = document.getElementById('public-store-view');
    if (publicStore) publicStore.style.display = 'none';
    
    const buyerDownload = document.getElementById('buyer-download-view');
    if (buyerDownload) buyerDownload.style.display = 'none';
    
    const loginModal = document.getElementById('login-modal');
    if (loginModal) loginModal.style.display = 'none';

    // 2. Mostrar y configurar el contenedor de la vista solicitada
    if (viewName === 'home') {
        if (window.currentUser) {
            if (appContainer) appContainer.style.display = 'grid';
        } else {
            if (landing) landing.style.display = 'block';
        }
        if (pushState) {
            history.pushState({ view: 'home' }, '', window.location.pathname);
        }
        // Ocultar reproductor si se vuelve a home
        const player = document.getElementById('store-audio-player');
        if (player) player.style.display = 'none';
    } 
    else if (viewName === 'catalog') {
        window.stateManager.setState('isGlobalCatalogMode', true);
        window.stateManager.setState('isPublicStoreMode', false);
        
        if (globalCatalog) globalCatalog.style.display = 'block';
        
        if (pushState) {
            history.pushState({ view: 'catalog' }, '', '?catalogo=1');
        }
        
        if (typeof window.initGlobalCatalog === 'function') {
            window.initGlobalCatalog();
        }
    } 
    else if (viewName === 'store') {
        window.stateManager.setState('isGlobalCatalogMode', false);
        window.stateManager.setState('isPublicStoreMode', true);
        
        if (publicStore) publicStore.style.display = 'block';
        
        const producerAka = params?.producer;
        if (producerAka) {
            if (pushState) {
                history.pushState({ view: 'store', producer: producerAka }, '', '?p=' + encodeURIComponent(producerAka));
            }
            if (window.initPublicStore) {
                window.initPublicStore(producerAka);
            }
        }
    }
    else if (viewName === 'download') {
        window.stateManager.setState('isGlobalCatalogMode', false);
        window.stateManager.setState('isPublicStoreMode', false);
        
        if (buyerDownload) buyerDownload.style.display = 'block';
        
        const paymentId = params?.paymentId;
        const downloadToken = params?.downloadToken || '';
        if (paymentId) {
            if (pushState) {
                const qs = downloadToken
                    ? `?download=${encodeURIComponent(paymentId)}&token=${encodeURIComponent(downloadToken)}`
                    : `?download=${encodeURIComponent(paymentId)}`;
                history.pushState({ view: 'download', paymentId }, '', qs);
            }
            if (typeof window.loadBuyerDownloadPage === 'function') {
                window.loadBuyerDownloadPage(paymentId, downloadToken);
            }
        }
    }
    
    // Actualizar la interfaz del carrito
    if (typeof window.updateCartUI === 'function') {
        window.updateCartUI();
    }
};

// Escuchar el evento de recarga del dashboard de ventas en el panel
document.getElementById('btn-sales-refresh')?.addEventListener('click', loadSalesData);

function handleInitialRouting() {
    if (typeof window.checkPayphoneSubscriptionRedirectResult === 'function') {
        window.checkPayphoneSubscriptionRedirectResult();
    }
    checkPayphoneRedirectResult();
    const urlParams = new URLSearchParams(window.location.search);
    const downloadId = urlParams.get('download') || urlParams.get('order');
    const downloadToken = urlParams.get('token') || '';
    const producerAka = urlParams.get('p') || urlParams.get('producer');
    if (downloadId) {
        window.showAppView('download', { paymentId: downloadId, downloadToken }, false);
    } else if (producerAka) {
        window.showAppView('store', { producer: producerAka }, false);
    } else if (urlParams.has('catalogo') || window.location.hash === '#catalogo') {
        window.showAppView('catalog', null, false);
    } else {
        window.showAppView('home', null, false);
    }
}

// Escuchar popstate para navegación del navegador (Atrás/Adelante)
window.addEventListener('popstate', (event) => {
    const urlParams = new URLSearchParams(window.location.search);
    const downloadId = urlParams.get('download') || urlParams.get('order');
    const downloadToken = urlParams.get('token') || '';
    const producerAka = urlParams.get('p') || urlParams.get('producer');
    if (downloadId) {
        window.showAppView('download', { paymentId: downloadId, downloadToken }, false);
    } else if (producerAka) {
        window.showAppView('store', { producer: producerAka }, false);
    } else if (urlParams.has('catalogo')) {
        window.showAppView('catalog', null, false);
    } else {
        window.showAppView('home', null, false);
    }
});

setTimeout(handleInitialRouting, 500);

// ==========================================================================
// MEJORAS DE INTERACCIÓN PREMIUM Y ERGONOMÍA (ASIGNACIONES GLOBALES)
// ==========================================================================

// 1. Efecto Tilt 3D y brillo dinámico en las tarjetas de beats
window.apply3DTiltEffect = function() {
    const cards = document.querySelectorAll('.store-beat-card');
    cards.forEach(card => {
        card.style.transformStyle = "preserve-3d";
        
        let glare = card.querySelector('.card-glare');
        if (!glare) {
            glare = document.createElement('div');
            glare.className = 'card-glare';
            card.appendChild(glare);
        }
        
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const width = rect.width;
            const height = rect.height;
            const xVal = (x / width) - 0.5;
            const yVal = (y / height) - 0.5;
            const rotateY = xVal * 16; 
            const rotateX = -yVal * 16;
            
            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
            glare.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.08) 0%, transparent 60%)`;
        });
        
        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
            glare.style.background = 'transparent';
        });
    });
};

// 2. Controlador de la barra táctil fija inferior en dispositivos móviles
document.addEventListener('DOMContentLoaded', () => {
    const mobileBtns = document.querySelectorAll('.mobile-nav-btn');
    const sidebar = document.querySelector('.sidebar');
    const mainPanel = document.querySelector('.main-panel');
    
    if (mobileBtns.length > 0) {
        mobileBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                mobileBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const target = btn.dataset.target;
                if (target === 'form') {
                    if (sidebar) sidebar.style.setProperty('display', 'block', 'important');
                    if (mainPanel) mainPanel.style.setProperty('display', 'none', 'important');
                } else if (target === 'preview') {
                    if (sidebar) sidebar.style.setProperty('display', 'none', 'important');
                    if (mainPanel) mainPanel.style.setProperty('display', 'block', 'important');
                    if (typeof window.switchTab === 'function') {
                        window.switchTab('tab-preview');
                    }
                } else if (target === 'history') {
                    if (sidebar) sidebar.style.setProperty('display', 'none', 'important');
                    if (mainPanel) mainPanel.style.setProperty('display', 'block', 'important');
                    if (typeof window.switchTab === 'function') {
                        window.switchTab('tab-history');
                    }
                }
            });
        });
    }

    // Inicializar chatbot virtual
    if (typeof window.initChatbot === 'function') {
        window.initChatbot();
    }
});


