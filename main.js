import { LICENSE_CONFIGS, SEED_LICENSES, DEFAULT_TEMPLATES } from './config.js';
import { TRANSLATIONS, UI_TRANSLATIONS } from './i18n.js';
import { getProducerDefault } from './producerDefaults.js';
import {
    normalizeWorkspacePathname,
    workspacePathForTab,
    workspaceTabForPath,
    workspaceTitleForTab
} from './workspace-routes.js';
import './tailwind-entry.css';
import './styles.css';
import './mobile.css';
import './settings-modern.css';
import './viewport-coherence.css';
import './workspace-theme.css?v=workspace-theme-1';
import './email-progress.css?v=email-progress-light-1';
import './email-history.css';
import './beatss-ui.js?v=boot-fix-6';
import './mobile-studio.js?v=boot-fix-6';
import './facturador.css?v=boot-fix-6';
import './dashboard-home.css?v=dashboard-home-1';
import './sales-analytics.css?v=sales-analytics-1';
import './contract-studio.css?v=contract-studio-1';
import './operations-ledger.css?v=operations-ledger-1';
import './license-library.css?v=license-library-1';
import './beat-catalog.css?v=beat-catalog-1';
import './accounting.css';
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

// Crea y mantiene el registro privado básico de cada productor autenticado.
// Está en el bundle del Studio porque usa Firestore; Auth lo invoca sólo una
// vez que el panel completo ya fue solicitado.
async function ensureUserIdentityRecord(user) {
    if (!user?.uid) return;
    const userRef = doc(db, 'users', user.uid);
    const now = new Date().toISOString();
    const providerIds = (user.providerData || [])
        .map(provider => provider.providerId)
        .filter(Boolean);
    const primaryProvider = providerIds.includes('google.com')
        ? 'google'
        : providerIds.includes('password')
            ? 'email_password'
            : (providerIds[0] || 'unknown');

    try {
        const existing = await getDoc(userRef);
        const auditData = {
            email: user.email || '',
            displayName: user.displayName || '',
            authProvider: primaryProvider,
            authProviders: providerIds,
            emailVerified: user.emailVerified === true,
            lastLoginAt: now
        };
        if (user.emailVerified === true) {
            auditData.requiresEmailVerification = false;
            auditData.onboardingStatus = existing.exists() && existing.data()?.onboardingStatus === 'completed'
                ? 'completed'
                : 'profile_pending';
        }
        if (!existing.exists()) {
            auditData.plan = 'inicial';
            auditData.registeredAt = user.metadata?.creationTime || now;
        }
        window.accountDeletionStatus = existing.exists()
            ? String(existing.data()?.accountDeletionStatus || '')
            : '';
        await setDoc(userRef, auditData, { merge: true });
        renderAccountDeletionStatus();
    } catch (error) {
        console.warn('No se pudo actualizar el registro de acceso del productor:', error.message);
    }
}
window.ensureUserIdentityRecord = ensureUserIdentityRecord;

// --- CONFIGURACIÓN DE LAZY LOADING Y PROXIES EN WINDOW ---
const lazyModules = {
    player: ['playBeat', 'togglePlay', 'initializeWaveformVisualizer', 'toggleStorePlay', 'setupStoreAudioPlayer'],
    catalog: [
        'renderBeatsGrid', 'updateGenreAndKeyFilters', 'renderGlobalBeats',
        'initBeatsDB', 'openBeatsModal', 'closeBeatsModal',
        'selectBeat', 'selectBeatForContract', 'initGlobalCatalog'
    ],
    checkout: [
        'openPaymentModal', 'closePaymentModal', 'switchPaymentPlan',
        'selectPaymentMethod', 'goToPaymentStep', 'simulatePaypalSubscription',
        'simulatePayphoneSubscription',
        'checkPayphoneRedirectResult', 'checkStripeReturn', 'closePayphoneOverlay', 'loadBuyerDownloadPage', 'initiateDeunaDynamicPayment',
        'initPublicStore', 'renderStoreBeats', 'shareBeat', 'openBeatCheckoutModal', 'setupStoreCheckout', 'switchStoreTab'
    ],
    editor: [
        'generatePreview', 'addCustomFieldRow', 'saveTemplateCustom', 'resetTemplateCustom',
        'loadTemplates', 'loadFormDraft', 'loadWhitelistData', 'selectLicenseType', 'checkDocuSignOAuth', 'updateGoogleLoginLinkStatus', 'loadPlatformGDriveStatus', 'linkGoogleAccountForLogin',
        'getCentralGdriveToken', 'getGdriveToken', 'getOrCreateDriveFolder',
        'uploadFileToStorage', 'dataURLtoBlob', 'loadTemplateToEditor', 'generateReferenceCode', 'initPlatformGDriveOAuth', 'createBeatStarsMigrationTicket', 'copyBeatStarsMigrationTicket', 'clearBeatStarsMigrationTicket',
        'handleFolderImport', 'handleZipSelect', 'analyzeSelectedZip', 'openTemplatesEditor', 'closeTemplatesEditor',
        'downloadPDF', 'copyMarkdown', 'sendEmailDelivery', 'sendToDocuSign', 'checkAndSendSignedDelivery', 'clearFormFields'
    ],
    history: [
        'updateHistoryTable', 'saveCurrentLicenseToHistory',
        'setupHistoryRowEvents', 'loadLicenseIntoEditor', 'clearAllHistory',
        'filterHistory', 'exportHistoryToCSV', 'exportHistoryToJSON'
    ],
    emailHistory: [
        'recordEmailEvent', 'loadEmailHistory', 'exportEmailHistoryToCSV', 'exportEmailHistoryToJSON'
    ],
    contacts: [
        'loadContacts', 'autoSaveContact', 'saveAllContacts',
        'openContactsModal', 'closeContactsModal', 'renderContactsTable'
    ],
    csvImporter: [
        'handleBeatStarsCsvImport'
    ],
    charts: [
        'updateDashboardView', 'exportDashboardToPDF'
    ],
    accounting: [
        'loadReferralData', 'loadConsolidatedAccounting', 'generateVipCodeAdmin', 'triggerReferralConversion'
    ],
    sales: [
        'loadSalesData', 'requestNotificationPermission'
    ],
    invoicing: [
        'initSriInvoicingView', 'renderSriInvoicingView'
    ],
    storageBackup: [
        'loadHistory', 'saveHistory', 'loadFromLocalServer', 'autoSyncGoogleDrive',
        'saveToLocalServer', 'backupToGoogleDrive', 'restoreFromGoogleDrive', 'safeSetItem', 'getLocalHeaders'
    ]
};

const moduleLoaders = {
    player: () => import('./player.js'),
    catalog: () => import('./catalog.js'),
    checkout: () => import('./checkout.js'),
    editor: () => import('./editor.js'),
    history: () => import('./dashboard_modules/history.js'),
    emailHistory: () => import('./dashboard_modules/email_history.js'),
    contacts: () => import('./dashboard_modules/contacts.js'),
    csvImporter: () => import('./dashboard_modules/csv_importer.js'),
    charts: () => import('./dashboard_modules/charts.js'),
    accounting: () => import('./dashboard_modules/accounting.js'),
    sales: () => import('./dashboard_modules/sales.js'),
    invoicing: () => import('./dashboard_modules/invoicing.js'),
    paymentPasarelas: () => import('./paymentPasarelas.js'),
    storageBackup: () => import('./storageBackup.js')
};

const loadedModules = new Set();
const modulePromises = new Map();

async function loadModule(name) {
    if (loadedModules.has(name)) return;
    if (!moduleLoaders[name]) throw new Error(`Módulo no registrado: ${name}`);
    if (modulePromises.has(name)) return modulePromises.get(name);

    const loadPromise = (async () => {
        await moduleLoaders[name]();
        loadedModules.add(name);
    })().finally(() => modulePromises.delete(name));

    modulePromises.set(name, loadPromise);
    return loadPromise;
}

// Inicializar proxies en window para todas las funciones lazy de forma segura
Object.entries(lazyModules).forEach(([moduleName, funcs]) => {
    funcs.forEach(funcName => {
        const proxy = async function(...args) {
            await loadModule(moduleName);
            if (typeof window[funcName] === 'function' && window[funcName] !== proxy) {
                return window[funcName](...args);
            } else {
                console.warn(`[LazyLoader] La función ${funcName} no fue redefinida tras cargar ${moduleName}`);
            }
        };
        window[funcName] = proxy;
    });
});

// El asistente se descarga únicamente cuando alguien lo abre. El proxy deja
// funcional el botón de soporte sin añadir JS, DOM ni timers al arranque.
let chatbotPromise = null;
const lazyChatbotProxy = {
    async toggleChat(...args) {
        if (!chatbotPromise) {
            chatbotPromise = import('./chatbot.js').then(() => {
                window.initChatbot?.();
                return window.beatssChatbot;
            });
        }
        const chatbot = await chatbotPromise;
        if (chatbot && chatbot !== lazyChatbotProxy) return chatbot.toggleChat(...args);
    }
};
window.beatssChatbot = window.beatssChatbot || lazyChatbotProxy;

const sanitizeHtml = window.sanitizeHtml || function(str) {
    return str == null ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
};

// Alias locales para funciones en otros módulos asignadas al objeto global window
const checkDocuSignOAuth = (...args) => window.checkDocuSignOAuth(...args);
const generatePreview = (...args) => window.generatePreview(...args);
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
const linkGoogleAccountForLogin = (...args) => window.linkGoogleAccountForLogin(...args);
const getGdriveToken = (...args) => window.getGdriveToken(...args);
const getOrCreateDriveFolder = (...args) => window.getOrCreateDriveFolder(...args);
const triggerReferralConversion = (...args) => window.triggerReferralConversion(...args);
const registerLanguageToggle = (...args) => window.registerLanguageToggle(...args);
const renderBeatsGrid = (...args) => window.renderBeatsGrid(...args);
const updateGenreAndKeyFilters = (...args) => window.updateGenreAndKeyFilters(...args);
const loadConsolidatedAccounting = async (...args) => {
    await loadModule('accounting');
    if (typeof window.loadConsolidatedAccounting === 'function') {
        return window.loadConsolidatedAccounting(...args);
    }
};
const saveCurrentLicenseToHistory = (...args) => window.saveCurrentLicenseToHistory(...args);
const clearAllHistory = (...args) => window.clearAllHistory(...args);
const openContactsModal = (...args) => window.openContactsModal(...args);
const closeContactsModal = (...args) => window.closeContactsModal(...args);
const renderContactsTable = (...args) => window.renderContactsTable(...args);
const exportHistoryToCSV = (...args) => window.exportHistoryToCSV(...args);
const exportHistoryToJSON = (...args) => window.exportHistoryToJSON(...args);
const handleFolderImport = (...args) => window.handleFolderImport(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
const loadHistory = async (...args) => {
    await loadModule('storageBackup');
    if (typeof window.loadHistory !== 'function' || window.loadHistory === loadHistory) {
        throw new Error('El cargador del historial de licencias no está disponible.');
    }
    return window.loadHistory(...args);
};
const saveHistory = async (...args) => {
    await loadModule('storageBackup');
    if (typeof window.saveHistory !== 'function' || window.saveHistory === saveHistory) {
        throw new Error('El guardado del historial de licencias no está disponible.');
    }
    return window.saveHistory(...args);
};
const loadFromLocalServer = (...args) => window.loadFromLocalServer(...args);
const autoSyncGoogleDrive = (...args) => window.autoSyncGoogleDrive(...args);
const saveToLocalServer = (...args) => window.saveToLocalServer(...args);
const backupToGoogleDrive = (...args) => window.backupToGoogleDrive(...args);
const restoreFromGoogleDrive = (...args) => window.restoreFromGoogleDrive(...args);

let activeEditorStep = 1;

const EDITOR_STEP_COPY = {
    1: { next: 'Continuar a datos' },
    2: { back: 'Volver a licencia', next: 'Revisar entrega' },
    3: { back: 'Editar datos' }
};

function updateEditorStepFooter(step) {
    const footer = document.getElementById('wizard-progress-actions');
    const backButton = document.getElementById('wizard-back');
    const nextButton = document.getElementById('wizard-next');
    const nextLabel = document.getElementById('wizard-next-label');
    const deliveryActions = document.getElementById('delivery-actions');

    if (footer) footer.dataset.editorStepState = String(step);
    if (backButton) {
        backButton.hidden = step === 1;
        const backLabel = backButton.querySelector('span');
        if (backLabel) backLabel.textContent = EDITOR_STEP_COPY[step]?.back || 'Volver';
    }
    if (nextButton) {
        nextButton.hidden = step === 3;
        if (nextLabel) nextLabel.textContent = EDITOR_STEP_COPY[step]?.next || 'Continuar';
    }
    if (deliveryActions) deliveryActions.hidden = step !== 3;
}

// Navegación estable del editor de licencias. Cada cambio de paso actualiza
// el panel, el selector y las acciones para impedir que dos etapas se mezclen.
function showEditorStep(step) {
    const normalizedStep = Number(step);
    if (![1, 2, 3].includes(normalizedStep)) return;
    activeEditorStep = normalizedStep;

    const wizardStage = document.getElementById('wizard-stage');
    if (wizardStage) wizardStage.dataset.activeStep = String(normalizedStep);

    for (let index = 1; index <= 3; index++) {
        const section = document.getElementById(`step-${index}`);
        const isActive = index === normalizedStep;
        if (section) {
            section.hidden = !isActive;
            section.classList.toggle('hidden', !isActive);
            section.dataset.wizardActive = String(isActive);
            section.toggleAttribute('inert', !isActive);
            section.setAttribute('aria-hidden', String(!isActive));

            // Los estilos heredados de versiones anteriores no pueden volver a
            // montar un paso inactivo debajo del actual. El atributo hidden y
            // este valor en línea se refuerzan entre sí para conservar un único
            // panel de trabajo visible en todas las vistas.
            if (isActive) {
                section.style.removeProperty('display');
            } else {
                section.style.setProperty('display', 'none', 'important');
            }
        }

        const nav = document.getElementById(`nav-step-${index}`);
        if (!nav) continue;
        nav.classList.toggle('is-active', isActive);
        nav.setAttribute('aria-selected', String(isActive));
        nav.tabIndex = isActive ? 0 : -1;
    }

    updateEditorStepFooter(normalizedStep);
    const sidebarScroll = document.querySelector('.sidebar-scroll');
    const sidebar = document.querySelector('#app-container .sidebar');
    const resetWizardScroll = () => {
        if (sidebarScroll) sidebarScroll.scrollTop = 0;
        if (sidebar) sidebar.scrollTop = 0;
    };
    resetWizardScroll();
    requestAnimationFrame(resetWizardScroll);
}
window.nextStep = showEditorStep;

// Función helper para debounce (limitar frecuencia de ejecución)
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const debouncedGeneratePreview = debounce((...args) => {
    if (typeof window.generatePreview === 'function') window.generatePreview(...args);
}, 300);
window.debouncedGeneratePreview = debouncedGeneratePreview;

export function dataURLtoBlob(dataurl) {
    const arr = dataurl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}
window.dataURLtoBlob = dataURLtoBlob;

export async function uploadFileToStorage(blob, path) {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, blob);

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            try {
                uploadTask.cancel();
                console.warn('Firebase Storage upload cancelado por timeout.');
            } catch (err) {
                console.error('Error al cancelar uploadTask:', err);
            }
            reject(new Error('Timeout al subir a Firebase Storage (30s)'));
        }, 30000);

        uploadTask.on('state_changed',
            null,
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            },
            async () => {
                clearTimeout(timeoutId);
                try {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadUrl);
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}
window.uploadFileToStorage = uploadFileToStorage;

const loadTemplateToEditor = (...args) => window.loadTemplateToEditor(...args);
const saveTemplateCustom = (...args) => window.saveTemplateCustom(...args);
const resetTemplateCustom = (...args) => window.resetTemplateCustom(...args);
const generateReferenceCode = (...args) => window.generateReferenceCode(...args);
const checkPayphoneRedirectResult = (...args) => window.checkPayphoneRedirectResult(...args);
const checkStripeReturn = (...args) => typeof window.checkStripeReturn === 'function' ? window.checkStripeReturn(...args) : undefined;
const renderGlobalBeats = (...args) => window.renderGlobalBeats(...args);
const renderStoreBeats = (...args) => window.renderStoreBeats(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const initPlatformGDriveOAuth = (...args) => window.initPlatformGDriveOAuth(...args);
// Configuración puede abrirse desde Inicio, donde el editor aún no está
// descargado. Cargarlo aquí evita que los controles de migración fallen por
// intentar invocar un global que todavía no existe.
const createBeatStarsMigrationTicket = async (...args) => {
    await loadModule('editor');
    if (typeof window.createBeatStarsMigrationTicket !== 'function') {
        throw new Error('No se pudo cargar el control de migración de BeatStars.');
    }
    return window.createBeatStarsMigrationTicket(...args);
};
const copyBeatStarsMigrationTicket = async (...args) => {
    await loadModule('editor');
    if (typeof window.copyBeatStarsMigrationTicket !== 'function') {
        throw new Error('No se pudo cargar el control de migración de BeatStars.');
    }
    return window.copyBeatStarsMigrationTicket(...args);
};
const handleZipSelect = (...args) => window.handleZipSelect(...args);
const analyzeSelectedZip = (...args) => window.analyzeSelectedZip(...args);
const openTemplatesEditor = (...args) => window.openTemplatesEditor(...args);
const closeTemplatesEditor = (...args) => window.closeTemplatesEditor(...args);
const downloadPDF = (...args) => window.downloadPDF(...args);
const copyMarkdown = (...args) => window.copyMarkdown(...args);
const sendEmailDelivery = (...args) => window.sendEmailDelivery(...args);
const sendToDocuSign = (...args) => window.sendToDocuSign(...args);
const checkAndSendSignedDelivery = (...args) => window.checkAndSendSignedDelivery(...args);
const clearFormFields = (...args) => window.clearFormFields(...args);

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
// Compartir el cargador con los módulos lazy que se ejecutan fuera de main.js.
// Sin esta referencia, funciones como Reenviar EmailJS no podían cargar su SDK.
window.loadScript = loadScript;

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
    ['catalog-btn-language', 'lang-icon'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = langLabel;
        }
    });

    // 5. Refrescar vistas y datos que dependen del idioma. Estas funciones
    // son proxies lazy: no deben activarse durante la landing pública porque
    // traducir el HTML no requiere descargar el editor, historial ni backups.
    const appContainer = document.getElementById('app-container');
    const workspaceIsVisible = Boolean(
        window.currentUser &&
        appContainer &&
        getComputedStyle(appContainer).display !== 'none'
    );
    if (workspaceIsVisible) {
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
}
window.updateUILanguage = updateUILanguage;

function bindLanguageToggle(id) {
    const button = document.getElementById(id);
    if (!button || button.dataset.languageBound === 'true') return;
    button.addEventListener('click', () => {
        currentLang = currentLang === 'es' ? 'en' : 'es';
        window.currentLang = currentLang;
        localStorage.setItem('beatss_language', currentLang);
        updateUILanguage();
        window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: currentLang } }));
    });
    button.dataset.languageBound = 'true';
}

// El catálogo es público, por lo que su selector debe funcionar sin esperar a
// que exista una sesión o se inicialice el workspace privado.
bindLanguageToggle('catalog-btn-language');

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
const PRIVATE_CONFIG_KEYS = [
    'signature', 'dsClientId', 'dsAccountId', 'dsEnv', 'gdriveClientId',
    'emailjsServiceId', 'emailjsTemplateId', 'emailjsTemplatePendingId',
    'emailjsPublicKey', 'paypalClientSecret', 'sriP12Password',
    'sriP12Base64', 'sriSecuencial', 'audioTagBase64',
    'bankPichinchaAcc', 'bankPichinchaDni', 'bankPichinchaName', 'bankPichinchaType',
    'bankGuayaquilAcc', 'bankGuayaquilDni', 'bankGuayaquilName', 'bankGuayaquilType',
    'deunaName', 'deunaPhone', 'deunaQrBase64',
    'paypalClientId', 'paypalEmail', 'paypalPlanIdPro', 'paypalPlanIdElite',
    'paypalPlanIdCreator', 'paypalPlanIdProArtist',
    'payphoneAppId', 'payphoneClientId', 'payphonePhone',
    'stripePublishableKey', 'stripeConnectAccountId',
    'id', 'address', 'birthdate', 'sriRuc', 'sriRazonSocial', 'sriNombreComercial',
    'sriDirMatriz', 'sriEstab', 'sriPtoEmi', 'sriAmbiente', 'sriRimpe',
    'sriContabilidad', 'sriIvaTarifa', 'sriIvaIncluido', 'sriRucProveedor',
    'sriAutoQueueEnabled'
];

function getPublicProducerConfig(config) {
    const publicConfig = { ...(config || {}) };
    PRIVATE_CONFIG_KEYS.forEach(key => delete publicConfig[key]);
    return publicConfig;
}

function createProducerStoreSlug(value, uid = '') {
    const base = String(value || 'productor')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'productor';
    const suffix = String(uid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toLowerCase();
    return suffix ? `${base}-${suffix}` : base;
}

let producerConfig = {
    name: "Productor",
    aka: "Productor",
    email: "",
    phone: "",
    place: "Quito, Ecuador",
    id: "",
    pro: "BMI",
    ipi: "",
    publisher: "Songtrust",
    address: "",
    birthdate: "",
    dsClientId: "",
    dsAccountId: "",
    dsEnv: "demo",
    emailjsServiceId: "",
    emailjsTemplateId: "",
    emailjsTemplatePendingId: "",
    emailjsPublicKey: "",
    gdriveClientId: "",
    storageProvider: "firebase",
    pdfStorageProvider: "firebase"
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
window.openPaymentModal = function(warningMessage = null, mode = 'producers') {
    const modal = document.getElementById('payment-modal');
    const warningDiv = document.getElementById('payment-modal-warning');
    const warningText = document.getElementById('payment-modal-warning-text');
    
    const namePro = document.getElementById('pay-plan-name-pro');
    const pricePro = document.getElementById('pay-plan-price-pro');
    const nameElite = document.getElementById('pay-plan-name-elite');
    const priceElite = document.getElementById('pay-plan-price-elite');
    const btnPro = document.getElementById('pay-select-pro');
    const btnElite = document.getElementById('pay-select-elite');
    
    if (namePro && pricePro && nameElite && priceElite && btnPro && btnElite) {
        if (mode === 'artists') {
            namePro.textContent = 'Plan Creador';
            pricePro.innerHTML = '$9.99<span style="font-size:12px; font-weight:400; color:rgba(255,255,255,0.4);">/mes</span>';
            nameElite.innerHTML = 'Plan Artista Pro';
            priceElite.innerHTML = '$19.99<span style="font-size:12px; font-weight:400; color:rgba(255,255,255,0.4);">/mes</span>';
            btnPro.setAttribute('onclick', "switchPaymentPlan('creator')");
            btnElite.setAttribute('onclick', "switchPaymentPlan('pro_artist')");
        } else {
            namePro.textContent = 'Plan Pro';
            pricePro.innerHTML = '$10.00<span style="font-size:12px; font-weight:400; color:rgba(255,255,255,0.4);">/mes</span>';
            nameElite.innerHTML = 'Plan Elite';
            priceElite.innerHTML = '$30.00<span style="font-size:12px; font-weight:400; color:rgba(255,255,255,0.4);">/mes</span>';
            btnPro.setAttribute('onclick', "switchPaymentPlan('pro')");
            btnElite.setAttribute('onclick', "switchPaymentPlan('elite')");
        }
    }
    
    if (warningDiv && warningText) {
        if (warningMessage) {
            warningText.textContent = warningMessage;
            warningDiv.style.display = 'block';
        } else {
            warningDiv.style.display = 'none';
        }
    }
    // Prefill RUC Invoice fields in subscription form if config is available
    const subInvoiceRuc = document.getElementById('sub-invoice-ruc');
    if (subInvoiceRuc && window.producerConfig) {
        subInvoiceRuc.value = window.producerConfig.sriRuc || '';
        const subInvoiceCompany = document.getElementById('sub-invoice-company');
        if (subInvoiceCompany) subInvoiceCompany.value = window.producerConfig.sriRazonSocial || window.producerConfig.name || '';
        const subInvoiceAddress = document.getElementById('sub-invoice-address');
        if (subInvoiceAddress) subInvoiceAddress.value = window.producerConfig.sriDirMatriz || window.producerConfig.place || '';
        const subInvoiceEmail = document.getElementById('sub-invoice-email');
        if (subInvoiceEmail) subInvoiceEmail.value = window.producerConfig.email || '';
    }

    // Reiniciar al paso 1 del wizard y seleccionar PayPal por defecto
    if (typeof window.selectPaymentMethod === 'function') {
        window.selectPaymentMethod('paypal');
    }
    if (typeof window.goToPaymentStep === 'function') {
        window.goToPaymentStep(1);
    }

    if (modal) {
        modal.style.display = 'flex';
        modal.scrollTop = 0;
    }
    // El módulo y la configuración de pagos se piden sólo cuando el modal se
    // abre, nunca durante el primer paint de la página.
    loadModule('paymentPasarelas')
        .then(() => window.initPaymentModalPasarelas?.())
        .catch((error) => console.warn('[BEATSS] No se pudo cargar el módulo de pagos:', error?.message || error));
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
const INITIAL_PLAN_MONTHLY_LICENSE_LIMIT = 5;

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
    if (count >= INITIAL_PLAN_MONTHLY_LICENSE_LIMIT) {
        openPaymentModal(`Límite alcanzado: Has generado el límite de ${INITIAL_PLAN_MONTHLY_LICENSE_LIMIT} licencias del Plan Inicial este mes (${count}/${INITIAL_PLAN_MONTHLY_LICENSE_LIMIT} usadas). Mejora al Plan Pro para generar licencias ilimitadas.`);
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

    const settingsPlanName  = document.getElementById('settings-plan-name');
    const settingsPlanAction = document.getElementById('settings-plan-action');
    const subStatusBadge    = document.getElementById('sub-status-badge');
    const subExpiryLabel    = document.getElementById('sub-expiry-label');
    const subExpiryDate     = document.getElementById('sub-expiry-date');
    const subProgressWrap   = document.getElementById('sub-progress-wrap');
    const subProgressBar    = document.getElementById('sub-progress-bar');
    const subProgressStart  = document.getElementById('sub-progress-start');
    const subProgressEnd    = document.getElementById('sub-progress-end');
    const subDaysRemaining  = document.getElementById('sub-days-remaining');

    if (settingsPlanName && settingsPlanAction) {
        const plan       = producerConfig?.plan || 'free';
        const status     = producerConfig?.planStatus || '';
        const expiryStr  = producerConfig?.planExpirationDate || producerConfig?.expirationPro || '';
        const activatedStr = producerConfig?.planActivatedAt || '';
        const hasSub     = !!(producerConfig?.planPayPalSubscriptionId);
        const now        = new Date();

        // ── Nombre del plan ──────────────────────────────────────────────
        if (plan === 'elite') {
            settingsPlanName.innerHTML = `<span style="color:var(--settings-primary, #3157e8);"><i data-lucide="crown" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"></i>Elite</span>`;
        } else if (plan === 'pro') {
            settingsPlanName.innerHTML = `<span style="color:var(--settings-primary, #3157e8);"><i data-lucide="sparkles" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;"></i>Pro</span>`;
        } else {
            settingsPlanName.innerHTML = `<span style="color:var(--settings-muted, #697993);">Gratuito</span>`;
        }

        // ── Badge de estado ───────────────────────────────────────────────
        if (subStatusBadge) {
            const badgeStyles = {
                active:    { bg: 'rgba(16,185,129,0.15)', color: '#10b981', label: '● Activa' },
                cancelled: { bg: 'rgba(239,68,68,0.12)',  color: '#ef4444', label: '✕ Cancelada' },
                suspended: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b', label: '⚠ Suspendida' },
                expired:   { bg: 'rgba(100,100,100,0.15)', color: '#8a91a6', label: 'Expirada' },
                free:      { bg: 'rgba(100,100,100,0.12)', color: '#8a91a6', label: 'Gratis' },
            };
            const s = (plan === 'free' || !status) ? 'free' : (status || 'active');
            const b = badgeStyles[s] || badgeStyles.free;
            subStatusBadge.style.background = b.bg;
            subStatusBadge.style.color = b.color;
            subStatusBadge.textContent = b.label;
        }

        // ── Fechas y barra de progreso ────────────────────────────────────
        if (expiryStr && subExpiryDate) {
            const expiry = new Date(expiryStr);
            const diffMs = expiry - now;
            const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const fmtDate = expiry.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

            if (status === 'cancelled') {
                subExpiryLabel.textContent = 'Acceso hasta:';
                subExpiryDate.textContent = fmtDate;
            } else if (diffDays > 0) {
                subExpiryLabel.textContent = hasSub ? 'Próxima renovación:' : 'Acceso hasta:';
                subExpiryDate.textContent = fmtDate;
            } else {
                subExpiryLabel.textContent = 'Venció el:';
                subExpiryDate.textContent = fmtDate;
                subExpiryDate.style.color = '#ef4444';
            }

            // Barra de progreso del ciclo (solo si tenemos fecha de activación)
            if (subProgressWrap && activatedStr && diffDays > 0) {
                const activated = new Date(activatedStr);
                const totalMs = expiry - activated;
                const usedMs  = now - activated;
                const pct = Math.max(0, Math.min(100, (usedMs / totalMs) * 100));
                subProgressWrap.style.display = 'block';
                subProgressBar.style.width = `${pct.toFixed(1)}%`;
                subProgressStart.textContent = activated.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                subProgressEnd.textContent   = expiry.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
                subDaysRemaining.textContent = diffDays > 0 ? `${diffDays} días restantes` : 'Vence hoy';
            }
        }

        // ── Botones de acción ─────────────────────────────────────────────
        if (plan === 'free' || !plan) {
            settingsPlanAction.innerHTML = `
                <button type="button" class="btn btn-primary" style="height:36px;padding:0 18px;font-size:12px;font-weight:700;border-radius:10px;" onclick="closeSettingsModal(); openPaymentModal();">
                    <i data-lucide="zap" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></i>Mejorar a Pro
                </button>`;
        } else if (status === 'cancelled') {
            // Cancelado pero con acceso hasta fecha — ofrecer reactivar
            settingsPlanAction.innerHTML = `
                <button type="button" class="btn btn-primary" style="height:36px;padding:0 18px;font-size:12px;font-weight:700;border-radius:10px;" onclick="closeSettingsModal(); openPaymentModal();">
                    <i data-lucide="refresh-cw" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></i>Reactivar
                </button>`;
        } else if (hasSub && status === 'active') {
            // Suscripción activa con PayPal — mostrar botón de cancelar
            settingsPlanAction.innerHTML = `
                <button type="button" id="btn-cancel-subscription" style="height:36px;padding:0 16px;font-size:11px;font-weight:700;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);color:#ef4444;cursor:pointer;transition:all 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.18)'" onmouseout="this.style.background='rgba(239,68,68,0.08)'" onclick="cancelPayPalSubscription()">
                    <i data-lucide="x-circle" style="width:14px;height:14px;margin-right:5px;vertical-align:middle;"></i>Cancelar suscripción
                </button>`;
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
function safeCreateIcons(rootElement = null) {
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try {
            if (rootElement) {
                lucide.createIcons({ root: rootElement });
            } else {
                lucide.createIcons();
            }
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


window.initApp = initApp;;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.initAuthAndApp());
} else {
    window.initAuthAndApp();
}

async function initApp(user) {
    window.currentUser = user;
    // El Studio vigente es un producto de superficie clara. El selector de
    // tema heredado dejaba el modo oscuro como valor por defecto y hacía que
    // una ruta privada directa dependiera de haber cargado antes la portada.
    // Mantener esta clase al iniciar vuelve determinista el tema del área
    // autenticada, incluso si existe una preferencia antigua en localStorage.
    document.body.classList.add('light-theme');
    document.getElementById('app-container').style.display = 'grid';
    document.getElementById('app-container').setAttribute('aria-hidden', 'false');
    document.body.classList.add('admin-active');

    // Arranque por ruta: el Studio no necesita descargar el dashboard,
    // catálogo e historial antes del primer render.
    const bootPath = normalizedPathname();
    const bootTab = workspaceTabForPath(bootPath) || 'tab-home';
    const bootRouteByTab = {
        'tab-home': 'home',
        'tab-preview': 'studio',
        'tab-history': 'history',
        'tab-email-history': 'email-history',
        'tab-invoicing': 'invoicing',
        'tab-beats': 'catalog',
        'tab-dashboard': 'dashboard',
        'tab-sales': 'sales',
        'tab-whitelist': 'whitelist',
        'tab-admin': 'accounting'
    };
    const bootRoute = bootRouteByTab[bootTab] || 'home';
    const runWhenIdle = (task, timeout = 1800) => {
        const run = () => Promise.resolve().then(task).catch((error) => {
            console.warn('[BEATSS] Tarea secundaria diferida falló:', error?.message || error);
        });
        if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(run, { timeout });
        } else {
            window.setTimeout(run, 0);
        }
    };

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

    // Solo se necesita cargar el editor para procesar el retorno OAuth de
    // DocuSign; en el resto de rutas no debe arrastrar ese módulo pesado.
    if (window.location.hash.includes('access_token=')) {
        checkDocuSignOAuth();
    }
    initDefaultDate();
    
    // Los endpoints del servidor Python solo existen en desarrollo local.
    // Consultarlos en producción retrasaba a administradores con una petición
    // que nunca podía aportar datos al primer render.
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocal) {
        await loadFromLocalServer();
    }

    // El Studio necesita el editor antes de cargar la configuración porque
    // esta última prepara algunos controles que pertenecen al editor. Hacer
    // explícita esa dependencia evita que el primer render quede a medias
    // mientras un proxy lazy intenta resolver una función global.
    if (bootRoute === 'studio') {
        await loadModule('editor');
    }
    
    await loadProducerConfig();
    updatePlanUI();
    if (bootRoute === 'studio') {
        await loadTemplates();
    }
    // Configurar logo y tema por defecto según el AKA cargado en el config
    const logoImg = document.getElementById('app-logo');
    const sidebarTitle = document.getElementById('app-sidebar-title');
    if (logoImg && sidebarTitle) {
        const akaName = (producerConfig.aka || "").toLowerCase();
        const isMonarco = akaName.includes('monarco') || (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === 'beatscgmonarco@gmail.com');
        const isMicua = akaName.includes('micua') || (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === 'mistermicua@gmail.com');
        const isSossa = akaName.includes('sossa') || window.currentUserIsAdmin;

        if (isSossa) {
            logoImg.innerHTML = '<img src="/logo.png" style="width: 24px; height: 24px; object-fit: contain;">';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco', 'theme-mrmicua');
        } else if (isMonarco) {
            logoImg.innerHTML = '<img src="/logo.png" style="width: 24px; height: 24px; object-fit: contain;">';
            document.body.classList.remove('theme-sossa', 'theme-mrmicua');
            document.body.classList.add('theme-cgmonarco');
        } else if (isMicua) {
            logoImg.innerHTML = '<img src="/producer_mrmicua.jpg?v=2" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%; object-position: center 10%;">';
            document.body.classList.remove('theme-sossa', 'theme-cgmonarco');
            document.body.classList.add('theme-mrmicua');
        } else {
            logoImg.innerHTML = '<img src="/logo.png" style="width: 24px; height: 24px; object-fit: contain;">';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco', 'theme-mrmicua');
        }
        
        sidebarTitle.textContent = 'Beatss';
        const sidebarSubtitle = document.getElementById('app-sidebar-subtitle');
        if (sidebarSubtitle) {
            sidebarSubtitle.textContent = `Panel: ${producerConfig.aka || 'Productor'}`;
        }
    }

    const driveWarning = document.getElementById('drive-folder-warning');
    if (driveWarning) {
        driveWarning.textContent = producerConfig.storageProvider === 'gdrive-central'
            ? 'Los archivos pesados de cada beat se guardarán en el Drive central de BEATSS. Los pedidos, licencias y contratos transaccionales permanecen protegidos en Firebase.'
            : 'Los archivos se guardarán en Firebase hasta que el Drive central de BEATSS esté vinculado.';
    }

    // Mostrar pestaña de administración si es Sossa Admin
    const adminTabBtn = document.getElementById('tab-admin-btn');
    if (adminTabBtn) {
        adminTabBtn.style.display = window.currentUserIsAdmin ? 'inline-flex' : 'none';
    }
    if (window.currentUserIsAdmin) {
        const currentPath = window.location.pathname.replace(/\/+$/, '');
        if (currentPath === '/contabilidad' || document.getElementById('tab-admin')?.classList.contains('active')) {
            loadConsolidatedAccounting();
        }
    }

    if (bootRoute === 'studio') {
        window.isInitializing = true;
        try {
            await Promise.resolve(selectLicenseType('basic')); // Cargar tipo básico al inicio
            await Promise.resolve(loadFormDraft()); // Restaurar borrador si existe

            // Un borrador antiguo o una carga parcial nunca deben dejar el
            // papel vacío. Si no se produjo HTML, regenerar una vez con los
            // valores actuales del formulario.
            const preview = document.getElementById('rendered-contract-content');
            if (preview && !preview.innerHTML.trim()) {
                await Promise.resolve(generatePreview());
            }
        } catch (error) {
            console.error('[BEATSS] No se pudo inicializar la previsualización del Studio:', error);
        } finally {
            window.isInitializing = false;
        }
    }

    // Los listeners son importantes para la interacción, pero un control
    // opcional no debe impedir que el contrato ya renderizado sea visible.
    try {
        setupEventListeners();
        // La ruta es la única fuente de verdad al arrancar. Esto garantiza
        // que nunca queden dos paneles activos por clases heredadas del HTML
        // o por una navegación privada pendiente durante la autenticación.
        selectWorkspaceTab(window.beatssPendingWorkspaceTab || bootTab);
        if (bootRoute === 'studio') showEditorStep(1);
    } catch (error) {
        console.error('[BEATSS] Error al registrar controles de la interfaz:', error);
    }

    // selectWorkspaceTab ya dispara la carga específica de la vista activa.
    // No repetimos aquí las mismas consultas a historial, ventas, catálogo o
    // facturación; las funciones lazy continúan disponibles para cada acción.
    if (bootRoute === 'studio') runWhenIdle(() => loadHistory(), 1200);
    if (bootRoute === 'studio') runWhenIdle(() => loadReferralData(), 4000);
    safeCreateIcons();
    initTooltips();
    
    // Google Drive ya no forma parte del flujo principal. Solo intentamos
    // sincronizar si existe una sesión de Drive válida y, además, después de
    // que la interfaz quedó libre; así no se descarga storageBackup ni se
    // consulta Drive en cada inicio normal.
    runWhenIdle(() => {
        if (!sessionStorage.getItem('gdrive_access_token')) return;
        return autoSyncGoogleDrive();
    }, 5000);

    if (producerConfig.onboardingCompleted === false) {
        window.setTimeout(() => {
            openSettingsModal();
            showToast('Completa tu perfil y guarda los cambios para activar tu espacio de productor.');
        }, 250);
    }
}

// Establecer fecha de hoy por defecto
function initDefaultDate() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const field = document.getElementById('effective-date');
    if (field) field.value = today;
}

async function loadSriProfileFromServer() {
    if (!auth.currentUser) return {};
    try {
        const response = await fetch('/api/payments/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${await auth.currentUser.getIdToken()}`
            },
            body: JSON.stringify({ action: 'sri-profile', producerId: window.currentUser })
        });
        if (!response.ok) return {};
        const payload = await response.json();
        return payload?.sri && typeof payload.sri === 'object' ? payload.sri : {};
    } catch (error) {
        console.warn('No se pudo consultar el estado protegido del SRI:', error.message);
        return {};
    }
}

async function saveSriConfigToServer(sri) {
    if (!auth.currentUser) throw new Error('Sesión requerida para guardar la configuración SRI.');
    const response = await fetch('/api/payments/config', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await auth.currentUser.getIdToken()}`
        },
        body: JSON.stringify({ action: 'save-sri-config', producerId: window.currentUser, sri })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No se pudo guardar la configuración SRI.');
    return payload?.sri || {};
}

async function loadProducerConfig() {
    const docRef = doc(db, "users", window.currentUser, "config", "producer");
    let firestoreLoaded = false;
    let publicData = null;
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            publicData = docSnap.data();
        }
        
        if (publicData) {
            // La proyección pública se limpia también en el navegador para no
            // volver a conservar valores heredados de firma/certificado.
            producerConfig = { ...producerConfig, ...getPublicProducerConfig(publicData), ...(await loadSriProfileFromServer()) };
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
                // El almacenamiento local nunca debe conservar credenciales ni
                // certificados, aunque provengan de una versión antigua.
                safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(getPublicProducerConfig(producerConfig)));
            } catch (e) {
                console.error("Error al parsear config de localStorage:", e);
            }
        } else {
            const currentEmail = auth.currentUser ? auth.currentUser.email : "";
            const displayName = auth.currentUser ? auth.currentUser.displayName : "";
            producerConfig = getProducerDefault(currentEmail, displayName);
        }

        if (producerConfig.storageProvider === 'gdrive') producerConfig.storageProvider = 'gdrive-central';
            
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
                } catch (e) {
                    console.error("Error al registrar referido en Firestore:", e);
                }
            }

        // Subir a Firestore y actualizar localStorage
        try {
            const publicConfig = getPublicProducerConfig(producerConfig);
            await setDoc(docRef, publicConfig);
            safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(publicConfig));
            // También guardar en el documento raíz del usuario para fácil consulta en consultas unificadas
            const userRef = doc(db, "users", window.currentUser);
            await setDoc(userRef, {
                plan: producerConfig.plan || 'inicial'
            }, { merge: true });
        } catch (err) {
            console.error("Error al guardar config de productor en Firestore:", err);
        }
    }

    if (!producerConfig.storeSlug) {
        producerConfig.storeSlug = createProducerStoreSlug(producerConfig.aka || producerConfig.name, window.currentUser);
        const publicConfig = getPublicProducerConfig(producerConfig);
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(publicConfig));
        setDoc(docRef, { storeSlug: producerConfig.storeSlug }, { merge: true })
            .catch((error) => console.warn('No se pudo guardar el identificador de tienda:', error.message));
    }

    if (producerConfig.storageProvider === 'gdrive') {
        producerConfig.storageProvider = 'gdrive-central';
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(getPublicProducerConfig(producerConfig)));
        setDoc(docRef, { storageProvider: 'gdrive-central' }, { merge: true })
            .catch((error) => console.warn('No se pudo guardar la migración de almacenamiento:', error.message));
    }

    // Comprobar expiración del Plan Pro o Elite
    const expDateStr = producerConfig.planExpirationDate || producerConfig.expirationPro;
    if ((producerConfig.plan === 'pro' || producerConfig.plan === 'elite') && expDateStr) {
        const expirationDate = new Date(expDateStr);
        if (expirationDate < new Date()) {
            const expiredPlan = producerConfig.plan;
            producerConfig.plan = 'inicial'; // 'inicial' represents the free tier
            // Guardar cambio de plan en segundo plano para no demorar la carga inicial
            const userConfigRef = doc(db, "users", window.currentUser, "config", "producer");
            setDoc(userConfigRef, getPublicProducerConfig(producerConfig), { merge: true }).then(() => {
                safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(getPublicProducerConfig(producerConfig)));
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
    document.getElementById('cfg-producer-id').value = producerConfig.id || "";
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
    document.getElementById('cfg-emailjs-template-pending-id').value = producerConfig.emailjsTemplatePendingId || "";
    document.getElementById('cfg-emailjs-public-key').value = producerConfig.emailjsPublicKey || "";
    
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
    
    // Cargar QR de Deuna
    const deunaQrPreviewImg = document.getElementById('deuna-qr-preview-img');
    const deunaQrPreviewContainer = document.getElementById('deuna-qr-preview-container');
    const btnClearDeunaQr = document.getElementById('btn-clear-deuna-qr');
    if (deunaQrPreviewImg && deunaQrPreviewContainer && btnClearDeunaQr) {
        if (producerConfig.deunaQrBase64) {
            deunaQrPreviewImg.src = producerConfig.deunaQrBase64;
            deunaQrPreviewContainer.style.display = 'block';
            btnClearDeunaQr.style.display = 'inline-block';
            window.tempDeunaQrBase64 = producerConfig.deunaQrBase64;
        } else {
            deunaQrPreviewImg.src = '';
            deunaQrPreviewContainer.style.display = 'none';
            btnClearDeunaQr.style.display = 'none';
            window.tempDeunaQrBase64 = null;
        }
    }
    document.getElementById('cfg-paypal-email').value = producerConfig.paypalEmail || "";
    document.getElementById('cfg-paypal-client-id').value = producerConfig.paypalClientId || "";
    document.getElementById('cfg-paypal-client-secret').value = producerConfig.paypalClientSecret || "";
    if (document.getElementById('cfg-paypal-plan-id-pro')) {
        document.getElementById('cfg-paypal-plan-id-pro').value = producerConfig.paypalPlanIdPro || "";
    }
    if (document.getElementById('cfg-paypal-plan-id-elite')) {
        document.getElementById('cfg-paypal-plan-id-elite').value = producerConfig.paypalPlanIdElite || "";
    }
    if (document.getElementById('cfg-stripe-publishable-key')) {
        document.getElementById('cfg-stripe-publishable-key').value = producerConfig.stripePublishableKey || "";
    }
    if (document.getElementById('cfg-stripe-connect-account-id')) {
        document.getElementById('cfg-stripe-connect-account-id').value = producerConfig.stripeConnectAccountId || "";
    }
    document.getElementById('cfg-payphone-phone').value = producerConfig.payphonePhone || "";
    document.getElementById('cfg-payphone-client-id').value = producerConfig.payphoneClientId || "";
    document.getElementById('cfg-payphone-appid').value = producerConfig.payphoneAppId || "";

    // Cargar datos de Facturación Electrónica SRI (Ecuador)
    document.getElementById('cfg-sri-ruc').value = producerConfig.sriRuc || "";
    document.getElementById('cfg-sri-razon-social').value = producerConfig.sriRazonSocial || "";
    document.getElementById('cfg-sri-nombre-comercial').value = producerConfig.sriNombreComercial || "";
    document.getElementById('cfg-sri-dir-matriz').value = producerConfig.sriDirMatriz || "Quito - Ecuador";
    document.getElementById('cfg-sri-estab').value = producerConfig.sriEstab || "001";
    document.getElementById('cfg-sri-pto-emi').value = producerConfig.sriPtoEmi || "001";
    document.getElementById('cfg-sri-ambiente').value = producerConfig.sriAmbiente || "1";
    document.getElementById('cfg-sri-rimpe').value = producerConfig.sriRimpe || "no_rimpe";
    document.getElementById('cfg-sri-contabilidad').value = producerConfig.sriContabilidad || "NO";
    const sriIvaTarifaEl = document.getElementById('cfg-sri-iva-tarifa');
    if (sriIvaTarifaEl) {
        sriIvaTarifaEl.value = producerConfig.sriIvaTarifa || (producerConfig.sriRimpe === 'rimpe_popular' ? '0' : '15');
    }
    const sriIvaIncluidoEl = document.getElementById('cfg-sri-iva-incluido');
    if (sriIvaIncluidoEl) {
        sriIvaIncluidoEl.checked = producerConfig.sriIvaIncluido !== false && producerConfig.sriIvaIncluido !== 'false';
    }
    if (document.getElementById('cfg-sri-ruc-proveedor')) {
        document.getElementById('cfg-sri-ruc-proveedor').value = producerConfig.sriRucProveedor || "";
    }
    document.getElementById('cfg-sri-p12-password').value = '';
    const sriAutoQueueEl = document.getElementById('cfg-sri-auto-queue');
    if (sriAutoQueueEl) sriAutoQueueEl.checked = producerConfig.sriAutoQueueEnabled === true;
    
    // Mostrar estado del archivo .p12 subido
    const p12Status = document.getElementById('cfg-sri-p12-status');
    if (p12Status) {
        if (producerConfig.sriSignatureConfigured === true) {
            p12Status.innerHTML = '✅ <strong style="color: #4ade80;">Firma electrónica protegida y configurada.</strong> Puedes subir otra para reemplazarla; la actual no se descarga al navegador.';
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

    const stripePublishableKeyInput = document.getElementById('cfg-stripe-publishable-key');
    if (stripePublishableKeyInput) {
        stripePublishableKeyInput.disabled = !isProOrElite;
        stripePublishableKeyInput.placeholder = isProOrElite ? 'pk_test_... o pk_live_...' : '⚠️ Requiere Plan Pro/Elite';
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
        document.getElementById('cfg-storage-provider').value = producerConfig.storageProvider || "firebase";
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
        const isGrid = el.classList.contains('input-row');
        const isFlex = el.classList.contains('input-group');
        el.style.display = window.currentUserIsAdmin ? (isGrid ? 'grid' : (isFlex ? 'flex' : 'block')) : 'none';
    });

    if (window.currentUserIsAdmin && loadedModules.has('editor')) {
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

    // Cargar estado de la vinculación de Google para iniciar sesión solo
    // cuando el módulo del editor ya está disponible. En rutas como Dashboard
    // no se debe descargar el editor solo por abrir el panel.
    if (loadedModules.has('editor')) {
        updateGoogleLoginLinkStatus();
    }
    window.producerConfig = producerConfig;
}

function validarRucSri(value) {
    const ruc = String(value || '').trim();
    if (!/^\d{13}$/.test(ruc) || /^0+$/.test(ruc) || ruc.slice(-3) === '000') return false;
    const province = Number(ruc.slice(0, 2));
    const third = Number(ruc[2]);
    if (!((province >= 1 && province <= 24) || province === 30)) return false;

    if (third < 6) {
        const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2];
        const sum = weights.reduce((total, weight, index) => {
            const product = Number(ruc[index]) * weight;
            return total + (product >= 10 ? product - 9 : product);
        }, 0);
        return ((10 - (sum % 10)) % 10) === Number(ruc[9]);
    }
    if (third === 9) {
        const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(ruc[index]) * weight, 0);
        return ((11 - (sum % 11)) % 11) % 10 === Number(ruc[9]);
    }
    if (third === 6) {
        const weights = [3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(ruc[index]) * weight, 0);
        return ((11 - (sum % 11)) % 11) % 10 === Number(ruc[8]);
    }
    return false;
}

function validateSriProducerConfig(config) {
    const value = (key) => String(config?.[key] ?? '').trim();
    const secretFields = ['sriP12Base64', 'sriP12Password', 'sriSecuencial'];
    const hasSriData = [
        'sriRuc', 'sriRazonSocial', 'sriNombreComercial',
        'sriRucProveedor', ...secretFields
    ].some((key) => value(key)) ||
        (value('sriDirMatriz') !== '' && value('sriDirMatriz') !== 'Quito - Ecuador') ||
        value('sriEstab') !== '' && value('sriEstab') !== '001' ||
        value('sriPtoEmi') !== '' && value('sriPtoEmi') !== '001' ||
        value('sriAmbiente') !== '' && value('sriAmbiente') !== '1' ||
        value('sriRimpe') !== '' && value('sriRimpe') !== 'no_rimpe' ||
        value('sriContabilidad') !== '' && value('sriContabilidad') !== 'NO' ||
        value('sriIvaTarifa') !== '' && value('sriIvaTarifa') !== '15';

    // Dejar todos los campos vacíos sigue siendo válido: significa que el
    // productor aún no activó la facturación electrónica. El backend lo
    // marcará como NO_CONFIGURADO en una compra aprobada.
    if (!hasSriData) return { ok: true };

    const errors = [];
    const ruc = value('sriRuc');
    const providerRuc = value('sriRucProveedor');
    const estab = value('sriEstab');
    const ptoEmi = value('sriPtoEmi');
    const ambiente = value('sriAmbiente');
    const iva = value('sriIvaTarifa');

    if (!validarRucSri(ruc)) {
        errors.push({ fieldId: 'cfg-sri-ruc', message: 'El RUC del emisor no supera la validación ecuatoriana del SRI.' });
    }
    if (!value('sriRazonSocial')) {
        errors.push({ fieldId: 'cfg-sri-razon-social', message: 'Ingresa la razón social oficial del emisor.' });
    }
    if (!value('sriDirMatriz')) {
        errors.push({ fieldId: 'cfg-sri-dir-matriz', message: 'Ingresa la dirección de la matriz.' });
    }
    if (!/^\d{3}$/.test(estab)) {
        errors.push({ fieldId: 'cfg-sri-estab', message: 'El establecimiento debe tener 3 dígitos, por ejemplo 001.' });
    }
    if (!/^\d{3}$/.test(ptoEmi)) {
        errors.push({ fieldId: 'cfg-sri-pto-emi', message: 'El punto de emisión debe tener 3 dígitos, por ejemplo 001.' });
    }
    if (!['1', '2'].includes(ambiente)) {
        errors.push({ fieldId: 'cfg-sri-ambiente', message: 'Selecciona un ambiente SRI válido: pruebas o producción.' });
    }
    if (!['0', '5', '12', '13', '14', '15', 'NO_OBJETO', 'EXENTO'].includes(iva)) {
        errors.push({ fieldId: 'cfg-sri-iva-tarifa', message: 'Selecciona una tarifa IVA válida.' });
    }
    if (providerRuc && !validarRucSri(providerRuc)) {
        errors.push({ fieldId: 'cfg-sri-ruc-proveedor', message: 'El RUC del proveedor no supera la validación ecuatoriana del SRI.' });
    }

    return errors.length ? { ok: false, ...errors[0] } : { ok: true };
}

// Guardar configuración de productor
async function saveProducerConfig() {
    producerConfig.name = document.getElementById('cfg-producer-name').value.trim() || producerConfig.name || "Productor";
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
    producerConfig.emailjsTemplatePendingId = document.getElementById('cfg-emailjs-template-pending-id').value.trim();
    producerConfig.emailjsPublicKey = document.getElementById('cfg-emailjs-public-key').value.trim();

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
    producerConfig.deunaQrBase64 = window.tempDeunaQrBase64 || "";
    producerConfig.paypalEmail = document.getElementById('cfg-paypal-email').value.trim();
    producerConfig.paypalClientId = document.getElementById('cfg-paypal-client-id').value.trim();
    producerConfig.paypalClientSecret = document.getElementById('cfg-paypal-client-secret').value.trim();
    if (document.getElementById('cfg-paypal-plan-id-pro')) {
        producerConfig.paypalPlanIdPro = document.getElementById('cfg-paypal-plan-id-pro').value.trim();
    }
    if (document.getElementById('cfg-paypal-plan-id-elite')) {
        producerConfig.paypalPlanIdElite = document.getElementById('cfg-paypal-plan-id-elite').value.trim();
    }
    if (document.getElementById('cfg-stripe-publishable-key')) {
        producerConfig.stripePublishableKey = document.getElementById('cfg-stripe-publishable-key').value.trim();
    }
    if (document.getElementById('cfg-stripe-connect-account-id')) {
        const connectAccountId = document.getElementById('cfg-stripe-connect-account-id').value.trim();
        if (connectAccountId && !/^acct_[A-Za-z0-9]{8,}$/.test(connectAccountId)) {
            showToast('El identificador de Stripe Connect no es válido.', true);
            document.getElementById('cfg-stripe-connect-account-id').focus();
            return;
        }
        producerConfig.stripeConnectAccountId = connectAccountId;
    }
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
    if (document.getElementById('cfg-sri-iva-tarifa')) {
        producerConfig.sriIvaTarifa = document.getElementById('cfg-sri-iva-tarifa').value || '15';
    }
    if (document.getElementById('cfg-sri-iva-incluido')) {
        producerConfig.sriIvaIncluido = document.getElementById('cfg-sri-iva-incluido').checked;
    }
    if (document.getElementById('cfg-sri-ruc-proveedor')) {
        producerConfig.sriRucProveedor = document.getElementById('cfg-sri-ruc-proveedor').value.trim();
    }
    const sriSecrets = {
        sriP12Password: document.getElementById('cfg-sri-p12-password').value,
        sriP12Base64: window.tempSriP12Base64 || ''
    };
    const sriAutoQueueEl = document.getElementById('cfg-sri-auto-queue');
    producerConfig.sriAutoQueueEnabled = sriAutoQueueEl?.checked === true;

    const sriValidation = validateSriProducerConfig(producerConfig);
    if (!sriValidation.ok) {
        showToast(sriValidation.message, true);
        const invalidField = document.getElementById(sriValidation.fieldId);
        const panel = invalidField?.closest('[data-settings-panel]');
        if (panel && typeof window.activateSettingsSection === 'function') {
            window.activateSettingsSection(panel.dataset.settingsPanel);
        }
        invalidField?.focus();
        return;
    }

    producerConfig.onboardingCompleted = true;

    // Guardar en Firestore
    const docRef = doc(db, "users", window.currentUser, "config", "producer");
    
    // Separar datos públicos y privados
    const privateKeys = PRIVATE_CONFIG_KEYS;
    const publicConfig = { ...producerConfig };
    const privateConfig = {};
    
    privateKeys.forEach(key => {
        if (key in publicConfig) {
            privateConfig[key] = publicConfig[key] || '';
            delete publicConfig[key];
        }
    });

    const sriPrivateConfig = {};
    Object.keys(privateConfig).forEach(key => {
        if (key.startsWith('sri')) {
            sriPrivateConfig[key] = privateConfig[key];
            delete privateConfig[key];
        }
    });
    sriPrivateConfig.sriAutoQueueEnabled = producerConfig.sriAutoQueueEnabled;
    if (sriSecrets.sriP12Password) sriPrivateConfig.sriP12Password = sriSecrets.sriP12Password;
    if (sriSecrets.sriP12Base64) sriPrivateConfig.sriP12Base64 = sriSecrets.sriP12Base64;

    try {
        await setDoc(docRef, publicConfig);
        await setDoc(doc(db, "users", window.currentUser, "private_config", "producer"), privateConfig, { merge: true });
        const savedSri = await saveSriConfigToServer(sriPrivateConfig);
        Object.keys(sriSecrets).forEach(key => delete producerConfig[key]);
        producerConfig = { ...producerConfig, ...savedSri };
        window.tempSriP12Base64 = '';
        await setDoc(doc(db, 'users', window.currentUser), {
            onboardingStatus: 'completed',
            onboardingCompletedAt: new Date().toISOString()
        }, { merge: true });
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(publicConfig));
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
                <span style="font-size: 12px; font-weight: 700; color: #fff; background: rgba(0, 204, 255, 0.1); padding: 4px 8px; border-radius: 4px; border: 1px dashed rgba(0, 204, 255, 0.3); text-transform: uppercase;">${sanitizeHtml(coupon.code)}</span>
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
        
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(getPublicProducerConfig(producerConfig)));
        
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

    // Event listeners utilizando la versión debounced para evitar congelamientos al escribir
    keyInput.addEventListener('input', debouncedGeneratePreview);
    valueInput.addEventListener('input', debouncedGeneratePreview);
    deleteBtn.addEventListener('click', () => {
        row.remove();
        debouncedGeneratePreview();
    });

    safeCreateIcons(row); // Optimización Lucide: compilar solo los iconos de esta fila
    debouncedGeneratePreview();
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



// Configurar los manejadores de eventos
function setupEventListeners() {
    // Navegación del flujo del editor sin depender de handlers inline. Esto
    // mantiene Tipo → Datos → Entrega funcional incluso bajo CSP estricta.
    document.querySelectorAll('[data-editor-step]').forEach(control => {
        control.addEventListener('click', (event) => {
            event.preventDefault();
            showEditorStep(control.dataset.editorStep);
        });
    });

    document.getElementById('wizard-next')?.addEventListener('click', () => {
        showEditorStep(Math.min(3, activeEditorStep + 1));
    });
    document.getElementById('wizard-back')?.addEventListener('click', () => {
        showEditorStep(Math.max(1, activeEditorStep - 1));
    });

    // Botones de tipo de licencia
    const licenseBtns = document.querySelectorAll('.license-btn');
    licenseBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            licenseBtns.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-pressed', 'false');
            });
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');
            targetBtn.setAttribute('aria-pressed', 'true');
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
    
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', debouncedGeneratePreview);
    });

    document.getElementById('payment-method').addEventListener('change', generatePreview);
    document.getElementById('clause-content-id').addEventListener('change', generatePreview);

    // Botón de idioma. El Studio ya no expone el interruptor de tema legado:
    // todas sus vistas comparten una única base clara y accesible.
    bindLanguageToggle('btn-language');
    bindLanguageToggle('catalog-btn-language');

    // Mientras la plataforma opera con un único productor, el acceso del
    // Studio abre directamente la tienda pública de Sossa.
    document.getElementById('btn-global-catalog')?.addEventListener('click', () => {
        window.location.assign('/tienda/sossa');
    });

    // Botón de configuración (modal)
    document.getElementById('btn-settings').addEventListener('click', openSettingsModal);
    document.getElementById('workspace-settings-btn')?.addEventListener('click', (event) => {
        event.currentTarget.closest('details')?.removeAttribute('open');
        openSettingsModal();
    });
    document.getElementById('btn-toggle-private-settings')?.addEventListener('click', (event) => {
        const isVisible = event.currentTarget.getAttribute('aria-pressed') === 'true';
        setSettingsPrivateValuesVisible(!isVisible);
    });
    document.getElementById('btn-close-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-cancel-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('btn-save-settings').addEventListener('click', saveProducerConfig);
    document.getElementById('btn-export-backup').addEventListener('click', exportBackup);
    document.getElementById('btn-account-deletion-request')?.addEventListener('click', requestAccountDeletionChange);
    
    // Vinculación de Google Drive Central (Admin)
    const btnLinkCentralGDrive = document.getElementById('btn-link-central-gdrive');
    if (btnLinkCentralGDrive) {
        btnLinkCentralGDrive.addEventListener('click', initPlatformGDriveOAuth);
    }

    document.getElementById('btn-create-beatstars-migration-ticket')?.addEventListener('click', createBeatStarsMigrationTicket);
    document.getElementById('btn-copy-beatstars-migration-ticket')?.addEventListener('click', copyBeatStarsMigrationTicket);

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

    // Eventos de Código QR de Deuna!
    const btnUploadDeunaQrEl = document.getElementById('btn-upload-deuna-qr');
    const fileDeunaQrInputEl = document.getElementById('cfg-deuna-qr-file');
    const btnClearDeunaQrEl = document.getElementById('btn-clear-deuna-qr');
    const deunaQrPreviewImgEl = document.getElementById('deuna-qr-preview-img');
    const deunaQrPreviewContainerEl = document.getElementById('deuna-qr-preview-container');

    if (btnUploadDeunaQrEl && fileDeunaQrInputEl && btnClearDeunaQrEl) {
        btnUploadDeunaQrEl.addEventListener('click', () => {
            fileDeunaQrInputEl.click();
        });

        fileDeunaQrInputEl.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            if (!file.type.startsWith('image/')) {
                showToast("❌ Por favor selecciona un archivo de imagen válido.", true);
                fileDeunaQrInputEl.value = '';
                return;
            }

            const reader = new FileReader();
            reader.onload = function(evt) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;
                    const maxDim = 400; // Ancho/alto máximo de 400px para el QR
                    
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
                    
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85); // Usar JPEG con buena compresión
                    
                    if (deunaQrPreviewImgEl) deunaQrPreviewImgEl.src = compressedBase64;
                    if (deunaQrPreviewContainerEl) deunaQrPreviewContainerEl.style.display = 'block';
                    btnClearDeunaQrEl.style.display = 'inline-block';
                    window.tempDeunaQrBase64 = compressedBase64;
                };
                img.src = evt.target.result;
            };
            reader.readAsDataURL(file);
        });

        btnClearDeunaQrEl.addEventListener('click', () => {
            fileDeunaQrInputEl.value = '';
            if (deunaQrPreviewImgEl) deunaQrPreviewImgEl.src = '';
            if (deunaQrPreviewContainerEl) deunaQrPreviewContainerEl.style.display = 'none';
            btnClearDeunaQrEl.style.display = 'none';
            window.tempDeunaQrBase64 = null;
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
                    sriP12StatusEl.innerHTML = `✅ <strong style="color: #4ade80;">Firma seleccionada localmente: ${sanitizeHtml(file.name)}</strong>. Recuerda guardar la configuración.`;
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
        const appContainer = document.getElementById('app-container');
        const mobileSelect = document.getElementById('mobile-tab-select');
        const targetContent = document.getElementById(tabId);

        if (!targetContent || !targetContent.classList.contains('tab-content')) {
            console.warn('Pestaña inválida:', tabId);
            return;
        }

        // La dirección identifica la sección seleccionada, incluso si una
        // carga de datos posterior falla o tarda. Atrás/Adelante aplica la
        // pestaña con __beatssApplyingRoute y evita entradas duplicadas.
        if (!window.__beatssApplyingRoute && typeof window.syncBeatssPathForTab === 'function') {
            window.syncBeatssPathForTab(tabId);
        }

        if (appContainer) appContainer.dataset.activeTab = tabId;

        const secondaryNav = document.querySelector('.workspace-secondary-nav');
        if (secondaryNav) secondaryNav.open = false;

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

        // Aislar la vista activa tanto visual como semánticamente. La clase
        // por sí sola era insuficiente porque reglas heredadas podían volver a
        // dar display:flex a una pestaña anterior.
        document.querySelectorAll('.tab-content').forEach((content) => {
            const isActive = content === targetContent;
            content.classList.toggle('active', isActive);
            content.hidden = !isActive;
            content.setAttribute('aria-hidden', String(!isActive));
            if (!isActive) content.scrollTop = 0;
        });
        targetContent.hidden = false;
        targetContent.scrollTop = 0;
        document.querySelector('.main-panel')?.scrollTo({ top: 0, behavior: 'auto' });

        // Mostrar/ocultar sidebar según el tab activo
        if (tabId === 'tab-home' || tabId === 'tab-history' || tabId === 'tab-email-history' || tabId === 'tab-invoicing' || tabId === 'tab-dashboard' || tabId === 'tab-admin' || tabId === 'tab-beats' || tabId === 'tab-sales' || tabId === 'tab-whitelist') {
            sidebarEl && sidebarEl.classList.add('sidebar-hidden');
        } else {
            sidebarEl && sidebarEl.classList.remove('sidebar-hidden');
        }

        // Acciones específicas por pestaña
        if (tabId === 'tab-preview') {
            // El Studio puede abrirse desde Inicio después de que la app ya
            // arrancó. En ese caso el editor no formó parte del arranque por
            // ruta y la hoja de papel quedaba visible, pero vacía.
            Promise.resolve(loadModule('editor'))
                .then(() => window.generatePreview?.())
                .catch((error) => console.warn('[BEATSS] No se pudo cargar la vista previa del contrato:', error?.message || error));
        }
        if (tabId === 'tab-beats') {
            // La base de beats se inicializa al entrar a la pestaña, no al
            // arrancar cualquier otra vista privada. Reutilizamos la carga
            // completada o en curso al volver a esta pestaña.
            const activeUser = window.currentUser || null;
            const beatDataReady = window._beatsDBLoaded && window._beatsDBLoadedFor === activeUser
                ? Promise.resolve()
                : (window._beatsDBLoadingPromise || (window._beatsDBLoadingPromise = initBeatsDB().finally(() => {
                    window._beatsDBLoadingPromise = null;
                })));
            beatDataReady.then(() => {
                renderBeatsGrid();
                updateGenreAndKeyFilters();
            }).catch((error) => console.warn('[BEATSS] No se pudo iniciar el catálogo:', error?.message || error));
        }
        if (tabId === 'tab-history') {
            loadHistory().catch((error) => console.warn('[BEATSS] No se pudo cargar el historial:', error?.message || error));
            Promise.resolve(loadModule('editor')).catch(() => {});
        }
        if (tabId === 'tab-email-history') {
            Promise.resolve(loadModule('emailHistory'))
                .then(() => window.loadEmailHistory?.())
                .catch((error) => console.warn('[BEATSS] No se pudo cargar el historial de emails:', error?.message || error));
        }
        if (tabId === 'tab-invoicing') {
            Promise.resolve(loadModule('invoicing'))
                .then(() => window.initSriInvoicingView?.())
                .catch((error) => console.warn('[BEATSS] No se pudo cargar el facturador SRI:', error?.message || error));
        }
        if (tabId === 'tab-admin') {
            loadConsolidatedAccounting();
        }
        if (tabId === 'tab-dashboard') {
            Promise.resolve(loadHistory())
                .then(() => updateDashboardView())
                .catch((error) => console.warn('[BEATSS] No se pudo cargar el dashboard:', error?.message || error));
        }
        if (tabId === 'tab-sales') {
            loadSalesData();
        }
        if (tabId === 'tab-whitelist') {
            if (typeof window.loadWhitelistData === 'function') {
                window.loadWhitelistData();
            }
        }

        // Permite que la navegación móvil refleje rutas directas como
        // /ventas, /pedidos y /content-id sin duplicar la lógica de tabs.
        window.dispatchEvent(new CustomEvent('beatss:tabchange', { detail: { tabId } }));
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

    document.querySelectorAll('[data-home-tab]').forEach((button) => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.homeTab;
            if (window.matchMedia('(max-width: 760px)').matches && (targetTab === 'tab-preview' || targetTab === 'editor')) {
                if (typeof window.setMobileStudioView === 'function') {
                    window.setMobileStudioView('editor');
                    return;
                }
            }
            window.switchTab(targetTab);
        });
    });

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

    const closeProgressBtn = document.getElementById('btn-close-progress');
    if (closeProgressBtn) {
        closeProgressBtn.addEventListener('click', () => {
            const progressModal = document.getElementById('email-progress-modal');
            if (progressModal) window.closeEmailProgressModal?.();
        });
    }

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
    const dbExportPdfBtn = document.getElementById('btn-dashboard-export-pdf');
    if (dbExportPdfBtn) {
        dbExportPdfBtn.addEventListener('click', () => {
            if (typeof window.exportDashboardToPDF === 'function') {
                window.exportDashboardToPDF();
            }
        });
    }

    document.getElementById('btn-clear-fields').addEventListener('click', clearFormFields);
    document.getElementById('btn-clear-history').addEventListener('click', clearAllHistory);
    document.getElementById('btn-refresh-history').addEventListener('click', () => {
        loadHistory().catch((error) => {
            console.warn('[BEATSS] No se pudo recargar el historial:', error?.message || error);
        });
    });

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
        let logoutInProgress = false;

        switchBtn.addEventListener('click', async () => {
            if (logoutInProgress) return;
            logoutInProgress = true;

            const previousLabel = switchBtn.getAttribute('aria-label');
            switchBtn.disabled = true;
            switchBtn.setAttribute('aria-busy', 'true');
            switchBtn.setAttribute('aria-label', 'Cerrando sesión');
            switchBtn.title = 'Cerrando sesión…';
            switchBtn.innerHTML = '<i data-lucide="loader-circle" class="animate-spin"></i>';
            if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
            if (typeof window.showToast === 'function') window.showToast('Cerrando sesión…');

            // Cancelar listener de pagos en tiempo real antes de cerrar sesión
            if (typeof window._salesUnsubscribe === 'function') {
                window._salesUnsubscribe();
                window._salesUnsubscribe = null;
            }
            
            // Indicar que estamos cerrando sesión para omitir actualizaciones del DOM
            window.isLoggingOut = true;

            const returnToLanding = () => {
                window.clearBeatssSessionSecurityState?.({ broadcast: true, reason: 'manual' });
                localStorage.removeItem('active_user');
                localStorage.removeItem('beatss_has_session');
                sessionStorage.removeItem('beatss_manual_login');
                window.currentUser = null;
                window.currentUserEmail = null;
                window.currentUserIsAdmin = false;
                window.location.replace(`${window.location.origin}/`);
            };

            try {
                // Firebase normalmente elimina la sesión local enseguida. El
                // límite evita que una red lenta deje el botón bloqueado.
                await Promise.race([
                    signOut(auth),
                    new Promise(resolve => setTimeout(resolve, 1800))
                ]);
            } catch (err) {
                console.error('Error al cerrar sesión de Firebase:', err);
            } finally {
                returnToLanding();
            }
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
    document.getElementById('btn-confirm-manual-add').addEventListener('click', () => confirmManualAdd());
    document.getElementById('btn-prepare-manual-delivery').addEventListener('click', () => confirmManualAdd({ prepareDelivery: true }));
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

            const allowedReceiptTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
            if (!allowedReceiptTypes.has(file.type) || file.size > 8 * 1024 * 1024) {
                inputReceiptFile.value = '';
                if (spanReceiptName) spanReceiptName.textContent = 'No se ha seleccionado archivo';
                if (previewContainer) previewContainer.style.display = 'none';
                currentUploadedReceiptBase64 = null;
                alert(file.size > 8 * 1024 * 1024
                    ? 'La imagen supera el límite de 8 MB.'
                    : 'Usa una imagen JPEG, PNG o WebP.');
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
                img.onerror = function() {
                    inputReceiptFile.value = '';
                    if (spanReceiptName) spanReceiptName.textContent = 'No se ha seleccionado archivo';
                    if (previewContainer) previewContainer.style.display = 'none';
                    currentUploadedReceiptBase64 = null;
                    alert('No se pudo leer la imagen del comprobante.');
                };
                img.src = evt.target.result;
            };
            reader.onerror = function() {
                inputReceiptFile.value = '';
                if (spanReceiptName) spanReceiptName.textContent = 'No se ha seleccionado archivo';
                if (previewContainer) previewContainer.style.display = 'none';
                currentUploadedReceiptBase64 = null;
                alert('No se pudo leer el comprobante.');
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
                
                // Subir a Firebase Storage en un espacio aislado por usuario.
                const storagePath = `receipts/saas/${auth.currentUser.uid}/${Date.now()}.jpg`;
                const downloadUrl = await uploadFileToStorage(blob, storagePath);
                
                submitBtn.innerHTML = '⏳ Registrando comprobante...';

                // Importamos addDoc en la cabecera de firebase.js
                const paymentsCol = collection(db, "payments");
                const needInvoice = document.getElementById('sub-chk-need-invoice')?.checked;
                const invoiceRuc = document.getElementById('sub-invoice-ruc')?.value.trim() || '';
                const invoiceCompany = document.getElementById('sub-invoice-company')?.value.trim() || '';
                const invoiceAddress = document.getElementById('sub-invoice-address')?.value.trim() || '';
                const invoiceEmail = document.getElementById('sub-invoice-email')?.value.trim() || '';
                if (needInvoice && (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !/^\S+@\S+\.\S+$/.test(invoiceEmail))) {
                    throw new Error('Completa correctamente los datos de facturación.');
                }
                const docData = {
                    type: 'subscription_payment',
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
                
                if (needInvoice) {
                    docData.needInvoice = true;
                    docData.invoiceRuc = invoiceRuc;
                    docData.invoiceCompany = invoiceCompany;
                    docData.invoiceAddress = invoiceAddress;
                    docData.invoiceEmail = invoiceEmail;
                }
                
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
function confirmManualAdd({ prepareDelivery = false } = {}) {
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
    const mp3Link     = document.getElementById('m-audio-mp3').value.trim();
    const wavLink     = document.getElementById('m-audio-wav').value.trim();
    const stemsLink   = document.getElementById('m-audio-stems').value.trim();

    if (prepareDelivery) {
        const emailInput = document.getElementById('m-buyer-email');
        if (!buyerEmail || !emailInput.checkValidity()) {
            showToast('Ingresa un correo válido para preparar la entrega', true);
            emailInput.focus();
            return null;
        }
        if (!mp3Link) {
            showToast('La entrega requiere al menos el archivo o enlace MP3', true);
            document.getElementById('m-audio-mp3').focus();
            return null;
        }
        if (type !== 'basic' && !wavLink) {
            showToast('Esta licencia requiere el archivo o enlace WAV', true);
            document.getElementById('m-audio-wav').focus();
            return null;
        }
        if (!['basic', 'premium'].includes(type) && !stemsLink) {
            showToast('Esta licencia requiere el archivo o enlace de stems', true);
            document.getElementById('m-audio-stems').focus();
            return null;
        }
    }

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
            mp3: mp3Link,
            wav: wavLink,
            stems: stemsLink
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

    if (prepareDelivery) {
        if (typeof window.loadLicenseIntoEditor === 'function') {
            window.loadLicenseIntoEditor(licenseData);
        }
        if (typeof window.nextStep === 'function') {
            window.nextStep(2);
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('Licencia preparada. Completa cualquier dato faltante, revisa el PDF y pulsa “Enviar por correo”.');
    }

    return licenseData;
}

// Selección de tipo de licencia y auto-completado de campos

// Funciones del Modal de Configuración
const SETTINGS_PRIVATE_FIELD_IDS = Object.freeze([
    'cfg-producer-id',
    'cfg-producer-phone',
    'cfg-producer-ipi',
    'cfg-ds-client-id',
    'cfg-ds-account-id',
    'cfg-bank-pichincha-acc',
    'cfg-bank-pichincha-dni',
    'cfg-bank-guayaquil-acc',
    'cfg-bank-guayaquil-dni',
    'cfg-deuna-phone',
    'cfg-paypal-client-id',
    'cfg-paypal-client-secret',
    'cfg-paypal-plan-id-pro',
    'cfg-paypal-plan-id-elite',
    'cfg-payphone-phone',
    'cfg-payphone-client-id',
    'cfg-payphone-appid',
    'cfg-sri-ruc',
    'cfg-sri-dir-matriz',
    'cfg-sri-p12-password',
    'cfg-sri-ruc-proveedor',
    'cfg-stripe-publishable-key',
    'cfg-stripe-connect-account-id',
    'cfg-emailjs-service-id',
    'cfg-emailjs-public-key',
    'cfg-emailjs-template-id',
    'cfg-emailjs-template-pending-id'
]);

function setSettingsPrivateValuesVisible(visible = false) {
    const shouldReveal = visible === true;
    SETTINGS_PRIVATE_FIELD_IDS.forEach((fieldId) => {
        const input = document.getElementById(fieldId);
        if (!input) return;
        input.type = shouldReveal ? 'text' : 'password';
        input.autocomplete = 'off';
        input.spellcheck = false;
    });

    const toggle = document.getElementById('btn-toggle-private-settings');
    if (!toggle) return;
    toggle.setAttribute('aria-pressed', String(shouldReveal));
    toggle.setAttribute('aria-label', shouldReveal ? 'Ocultar datos privados' : 'Mostrar datos privados');
    toggle.title = shouldReveal ? 'Ocultar datos privados' : 'Mostrar datos privados';
    const label = toggle.querySelector('span');
    if (label) label.textContent = shouldReveal ? 'Ocultar datos privados' : 'Mostrar datos privados';
    const icon = toggle.querySelector('[data-lucide]');
    if (icon) icon.setAttribute('data-lucide', shouldReveal ? 'eye-off' : 'eye');
    safeCreateIcons();
}

function initSettingsSections() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    const buttons = Array.from(modal.querySelectorAll('[data-settings-section]'));
    const panels = Array.from(modal.querySelectorAll('[data-settings-panel]'));
    if (!buttons.length || !panels.length) return;

    const activate = (section, shouldFocus = false) => {
        const nextSection = panels.some(panel => panel.dataset.settingsPanel === section)
            ? section
            : panels[0].dataset.settingsPanel;

        buttons.forEach(button => {
            const isActive = button.dataset.settingsSection === nextSection;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', String(isActive));
        });
        panels.forEach(panel => {
            const isActive = panel.dataset.settingsPanel === nextSection;
            panel.classList.toggle('is-active', isActive);
            panel.hidden = !isActive;
        });
        modal.dataset.settingsSection = nextSection;

        if (shouldFocus) {
            const activeButton = buttons.find(button => button.dataset.settingsSection === nextSection);
            activeButton?.focus({ preventScroll: true });
        }
    };

    buttons.forEach(button => {
        if (button.dataset.settingsBound === 'true') return;
        button.addEventListener('click', () => activate(button.dataset.settingsSection));
        button.addEventListener('keydown', event => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(event.key)) return;
            event.preventDefault();
            const index = buttons.indexOf(button);
            const direction = ['ArrowDown', 'ArrowRight'].includes(event.key) ? 1 : -1;
            const nextButton = buttons[(index + direction + buttons.length) % buttons.length];
            activate(nextButton.dataset.settingsSection, true);
        });
        button.dataset.settingsBound = 'true';
    });

    modal.activateSettingsSection = activate;
    window.activateSettingsSection = activate;
    activate(modal.dataset.settingsSection || 'account');
}

function setSettingsIntegrationLoading() {
    const googleStatus = document.getElementById('cfg-google-login-status');
    const googleButton = document.getElementById('btn-link-google-login');
    const driveStatus = document.getElementById('cfg-gdrive-central-status');
    const driveButton = document.getElementById('btn-link-central-gdrive');

    if (googleStatus) {
        googleStatus.textContent = 'Verificando acceso con Google...';
        googleStatus.style.color = '#8a91a6';
    }
    if (googleButton) googleButton.disabled = true;

    if (driveStatus) {
        driveStatus.textContent = 'Verificando estado de Google Drive...';
        driveStatus.style.color = '#8a91a6';
    }
    if (driveButton) driveButton.disabled = true;
}

function setSettingsIntegrationUnavailable() {
    const googleStatus = document.getElementById('cfg-google-login-status');
    const googleButton = document.getElementById('btn-link-google-login');
    const driveStatus = document.getElementById('cfg-gdrive-central-status');
    const driveButton = document.getElementById('btn-link-central-gdrive');

    if (googleStatus) {
        googleStatus.textContent = 'No se pudo comprobar el acceso con Google. Cierra y vuelve a abrir Configuración.';
        googleStatus.style.color = '#e53e3e';
    }
    if (googleButton) googleButton.disabled = true;

    if (driveStatus) {
        driveStatus.textContent = 'No se pudo comprobar Google Drive en este momento.';
        driveStatus.style.color = '#e53e3e';
    }
    if (driveButton) driveButton.disabled = true;
}

async function refreshSettingsIntegrationStatuses() {
    setSettingsIntegrationLoading();

    try {
        // Configuración es un flujo privado bajo demanda: cargar el módulo aquí
        // evita dejar los estados iniciales visibles en rutas que no usan Editor.
        await loadModule('editor');
        updateGoogleLoginLinkStatus();

        if (window.currentUserIsAdmin) {
            await loadPlatformGDriveStatus();
            return;
        }

        const driveStatus = document.getElementById('cfg-gdrive-central-status');
        const driveButton = document.getElementById('btn-link-central-gdrive');
        if (driveStatus) {
            driveStatus.textContent = 'Disponible sólo para el administrador de BEATSS.';
            driveStatus.style.color = '#8a91a6';
        }
        if (driveButton) driveButton.disabled = true;
    } catch (error) {
        console.warn('[BEATSS] No se pudieron cargar los estados de Integraciones:', error);
        setSettingsIntegrationUnavailable();
    }
}

function openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    initSettingsSections();
    renderAccountDeletionStatus();
    setSettingsPrivateValuesVisible(false);
    modal.style.display = 'flex';
    void refreshSettingsIntegrationStatuses();
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        try {
            lucide.createIcons();
        } catch (e) {
            console.warn('Error al crear iconos en modal:', e);
        }
    }
}

function renderAccountDeletionStatus() {
    const status = document.getElementById('account-deletion-status');
    const button = document.getElementById('btn-account-deletion-request');
    if (!status || !button) return;
    const requested = window.accountDeletionStatus === 'requested';
    status.textContent = requested
        ? 'Tu solicitud está registrada. Puedes cancelarla mientras la revisión de seguridad y retención legal siga pendiente.'
        : 'Puedes solicitar la eliminación de tu cuenta y sus datos. La solicitud pasa por una revisión de seguridad y retención legal antes del borrado definitivo.';
    button.textContent = requested ? 'Cancelar solicitud' : 'Solicitar eliminación';
    button.classList.toggle('is-cancel', requested);
}

async function requestAccountDeletionChange() {
    const user = auth.currentUser;
    if (!user) {
        showToast('Debes iniciar sesión de nuevo para administrar tu cuenta.', true);
        return;
    }
    const requested = window.accountDeletionStatus === 'requested';
    const action = requested ? 'cancel' : 'request';
    if (!requested && !window.confirm('Esta acción registrará una solicitud de eliminación. No borrará tu cuenta inmediatamente. ¿Deseas continuar?')) return;

    const button = document.getElementById('btn-account-deletion-request');
    if (button) button.disabled = true;
    try {
        const token = await user.getIdToken(true);
        const response = await fetch('/api/account/deletion-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ action })
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo registrar la solicitud.');
        window.accountDeletionStatus = result.status;
        renderAccountDeletionStatus();
        showToast(result.message);
    } catch (error) {
        showToast(error.message || 'No se pudo administrar la solicitud.', true);
    } finally {
        if (button) button.disabled = false;
    }
}

function closeSettingsModal() {
    setSettingsPrivateValuesVisible(false);
    // Una clave temporal sólo vive en memoria. Si el administrador cierra el
    // panel, se elimina de la interfaz para reducir una exposición accidental.
    if (loadedModules.has('editor')) window.clearBeatStarsMigrationTicket?.();
    document.getElementById('settings-modal').style.display = 'none';
}

// Crear un Toast (Notificación flotante) premium
function showToast(message, isError = false) {
    // Remover notificaciones anteriores
    const oldToasts = document.querySelectorAll('.toast');
    oldToasts.forEach(t => t.remove());

    // Algunos módulos históricos llaman a showToast(..., 'error') en lugar de
    // pasar un booleano. Normalizamos ambos formatos para que el estado visual
    // nunca dependa de un valor de CSS inexistente.
    const errorState = isError === true || isError === 'error' || isError === 'danger';
    const toast = document.createElement('div');
    toast.className = `toast ${errorState ? 'error' : 'success'}`;
    toast.innerHTML = `
        <i data-lucide="${errorState ? 'alert-triangle' : 'check-circle-2'}" aria-hidden="true"></i>
        <span class="toast-message"></span>
    `;
    toast.querySelector('.toast-message').textContent = String(message ?? '');
    document.body.appendChild(toast);
    safeCreateIcons();

    // Estilo en JS para la animación. El sistema activo es claro; usar
    // `color: #fff` sobre `var(--bg-card)` hacía que los mensajes de éxito
    // desaparecieran y `var(--danger)` sin declarar dejaba los errores sin
    // fondo. Ambos estados usan ahora una superficie oscura de alto contraste
    // y un acento semántico distinto.
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        maxWidth: 'min(420px, calc(100vw - 32px))',
        backgroundColor: 'var(--ledger-ink, #172238)',
        color: '#ffffff',
        border: `1px solid ${errorState ? 'var(--ledger-orange, #ff6b42)' : 'var(--ledger-blue, #3157e8)'}`,
        padding: '14px 18px',
        borderRadius: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 16px 38px rgba(23, 34, 56, .22)',
        zIndex: '2000',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        fontFamily: 'var(--font-sans)',
        fontSize: '13px',
        fontWeight: '600',
        lineHeight: '1.45'
    });
    const icon = toast.querySelector('svg');
    if (icon) {
        icon.style.flex = '0 0 auto';
        icon.style.color = errorState ? 'var(--ledger-orange, #ff6b42)' : 'var(--ledger-mint, #b7f0d4)';
        icon.style.width = '19px';
        icon.style.height = '19px';
        icon.setAttribute('aria-hidden', 'true');
    }

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
            .toast-message {
                min-width: 0;
                overflow-wrap: anywhere;
            }
            @media (max-width: 760px) {
                .toast {
                    right: 16px !important;
                    bottom: calc(82px + env(safe-area-inset-bottom)) !important;
                    left: 16px !important;
                    max-width: none !important;
                }
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

// Los controles del Studio usan ayudas nativas: son accesibles y no invaden
// la maqueta con los tooltips oscuros heredados.
function initTooltips() {
    document.querySelectorAll('button[title], a[title], .btn-icon-only[title], .btn[title]').forEach(el => {
        const titleText = el.getAttribute('title');
        if (titleText) {
            if (el.closest('#app-container.saas-workspace')) {
                if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', titleText);
                return;
            }
            el.setAttribute('data-tooltip', titleText);
            el.removeAttribute('title');
        }
    });
}

// Exponer como global para uso en onclick inline
window.showToast = showToast;
window.initTooltips = initTooltips;
window.checkPlanLimitExceeded = checkPlanLimitExceeded;
window.openSettingsModal = openSettingsModal;
window.addCustomFieldRow = addCustomFieldRow;
window.initDefaultDate = initDefaultDate;
window.safeGetItem = safeGetItem;

export function switchPlanCategory(category) {
    const producersGrid = document.getElementById('pricing-grid-producers');
    const artistsGrid = document.getElementById('pricing-grid-artists');
    const toggleProducers = document.getElementById('toggle-plan-producers');
    const toggleArtists = document.getElementById('toggle-plan-artists');
    
    if (!producersGrid || !artistsGrid || !toggleProducers || !toggleArtists) return;
    
    if (category === 'artists') {
        producersGrid.style.display = 'none';
        artistsGrid.style.display = 'grid';
        
        toggleProducers.classList.remove('bg-electric-purple', 'text-white');
        toggleProducers.classList.add('text-on-surface-variant', 'hover:text-white');
        
        toggleArtists.classList.remove('text-on-surface-variant', 'hover:text-white');
        toggleArtists.classList.add('bg-electric-purple', 'text-white');
    } else {
        producersGrid.style.display = 'grid';
        artistsGrid.style.display = 'none';
        
        toggleArtists.classList.remove('bg-electric-purple', 'text-white');
        toggleArtists.classList.add('text-on-surface-variant', 'hover:text-white');
        
        toggleProducers.classList.remove('text-on-surface-variant', 'hover:text-white');
        toggleProducers.classList.add('bg-electric-purple', 'text-white');
    }
}
window.switchPlanCategory = switchPlanCategory;

// ─── Cancelar Suscripción PayPal desde la UI ──────────────────────────────────
window.cancelPayPalSubscription = async function() {
    const uid = window.currentUser;
    if (!uid) {
        alert('Debes iniciar sesión para realizar esta acción.');
        return;
    }

    const confirmed = window.confirm(
        '¿Estás seguro de que quieres cancelar tu suscripción?\n\n' +
        'Seguirás teniendo acceso a tu plan hasta la fecha de expiración actual. ' +
        'Después de eso, tu plan volverá a Gratuito.'
    );
    if (!confirmed) return;

    const btn = document.getElementById('btn-cancel-subscription');
    if (btn) {
        btn.textContent = 'Cancelando...';
        btn.disabled = true;
    }

    try {
        const idToken = window.getFirebaseIdToken ? await window.getFirebaseIdToken() : '';
        const response = await fetch('/api/payments/cancel-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`,
            },
            body: JSON.stringify({ uid })
        });

        const result = await response.json();

        if (result.success) {
            // Actualizar el config local para reflejar la cancelación inmediatamente
            if (window.producerConfig) {
                window.producerConfig.planStatus = 'cancelled';
                window.producerConfig.planCancelledAt = new Date().toISOString();
            }

            // Refrescar el panel de suscripción
            if (typeof updateProducerUI === 'function') updateProducerUI();

            // Toast de confirmación
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;border:1px solid rgba(239,68,68,0.3);color:#fff;padding:18px 28px;border-radius:14px;font-weight:700;font-size:15px;z-index:99999;box-shadow:0 12px 32px rgba(0,0,0,0.5);text-align:center;max-width:90vw;';
            const accessUntil = result.accessUntil
                ? new Date(result.accessUntil).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })
                : '';
            toast.innerHTML = `🚫 <strong>Suscripción cancelada</strong><br><span style="font-weight:400;font-size:12px;">Tendrás acceso hasta el ${accessUntil}</span>`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 5000);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (err) {
        console.error('Error al cancelar suscripción:', err);
        alert(`Error al cancelar: ${err.message}`);
        if (btn) {
            btn.textContent = 'Cancelar suscripción';
            btn.disabled = false;
        }
    }
};
window.paperZoom = 100;
window.changeZoom = function(action) {
    const paper = document.getElementById('license-paper');
    if (!paper) return;

    let newZoom = window.paperZoom || 100;

    if (action === 'fit') {
        const container = paper.parentElement;
        if (container) {
            // El papel ahora es fluido y puede medir 920px en escritorio.
            // Calculamos el ajuste con su ancho real para evitar que el zoom
            // conserve la referencia antigua de 800px.
            const containerStyles = window.getComputedStyle(container);
            const horizontalPadding =
                (parseFloat(containerStyles.paddingLeft) || 0) +
                (parseFloat(containerStyles.paddingRight) || 0);
            const availableWidth = Math.max(1, container.clientWidth - horizontalPadding - 16);
            const paperWidth = parseFloat(window.getComputedStyle(paper).width) || paper.offsetWidth || 800;
            const fitScale = Math.min(1, availableWidth / Math.max(1, paperWidth));
            newZoom = Math.floor(fitScale * 100);
        }
    } else if (typeof action === 'number') {
        newZoom += action;
    }

    if (newZoom < 50) newZoom = 50;
    if (newZoom > 200) newZoom = 200;
    window.paperZoom = newZoom;

    // Aplicar zoom usando la propiedad 'zoom' si es compatible, de lo contrario transform scale
    if ('zoom' in paper.style) {
        paper.style.zoom = `${newZoom}%`;
    } else {
        paper.style.transform = `scale(${newZoom / 100})`;
        paper.style.transformOrigin = 'top center';
        
        // Ajustar margen para evitar espacio vacío por el escalado de transform
        const scaledHeight = paper.offsetHeight * (newZoom / 100);
        paper.style.marginBottom = `${scaledHeight - paper.offsetHeight + 32}px`;
    }

    const val = document.getElementById('zoom-value');
    if (val) val.innerText = `${newZoom}%`;
};

function normalizedPathname() {
    return normalizeWorkspacePathname(window.location.pathname);
}

function publicStorePath(producerAka) {
    return `/tienda/${encodeURIComponent(String(producerAka || '').trim())}`;
}

function buyerDownloadPath(paymentId, downloadToken = '') {
    const query = downloadToken ? `?token=${encodeURIComponent(downloadToken)}` : '';
    return `/descargas/${encodeURIComponent(String(paymentId || '').trim())}${query}`;
}

window.syncBeatssPathForTab = function(tabId) {
    const path = workspacePathForTab(tabId);
    if (!path) return;

    document.title = workspaceTitleForTab(tabId);
    if (normalizedPathname() === path) {
        history.replaceState({ view: 'home', tabId }, '', `${path}${window.location.search}${window.location.hash}`);
        return;
    }

    history.pushState({ view: 'home', tabId }, '', path);
};

function selectWorkspaceTab(tabId) {
    if (!tabId) return;
    window.__beatssApplyingRoute = true;
    window.switchTab?.(tabId);
    window.__beatssApplyingRoute = false;
    document.title = workspaceTitleForTab(tabId);
}

function openPrivateWorkspaceRoute(tabId) {
    window.beatssPendingWorkspaceTab = tabId;
    window.showAppView('home', null, false);

    if (window.currentUser) {
        // showAppView consume la pestaña pendiente y la aplica una sola vez.
        return;
    }

    // Mantiene la URL solicitada y abre el acceso. Evitamos delegar al botón
    // heredado de la landing: el callback inicial de Firebase puede terminar
    // después del click y ocultar ese modal antes de que el usuario lo vea.
    // Al completar Google/email, showAppView('home') aplicará la pestaña
    // pendiente.
    const openPendingLogin = () => {
        if (typeof window.openAuthModal === 'function') {
            window.openAuthModal('login');
            return;
        }
        window.openAuthModal?.('login');
    };
    setTimeout(openPendingLogin, 0);
}

window.showAppView = function(viewName, params = null, pushState = true) {
    // El marketplace general está retirado temporalmente. Incluso si algún
    // módulo heredado solicita "catalog", nunca debe volver a mostrarlo.
    if (viewName === 'catalog') {
        window.location.assign('/tienda/sossa');
        return;
    }
    document.body.dataset.beatssView = viewName;
    document.body.classList.remove('beatss-view-home', 'beatss-view-catalog', 'beatss-view-store', 'beatss-view-download');
    document.body.classList.add(`beatss-view-${viewName}`);
    
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

    [landing, appContainer, globalCatalog, publicStore, buyerDownload, loginModal].forEach((element) => {
        if (!element) return;
        element.setAttribute('aria-hidden', 'true');
        element.inert = true;
    });

    // 2. Mostrar y configurar el contenedor de la vista solicitada
    if (viewName === 'home') {
        if (window.currentUser) {
            if (appContainer) {
                appContainer.style.display = 'grid';
                appContainer.setAttribute('aria-hidden', 'false');
                appContainer.inert = false;
            }
        } else {
            if (landing) {
                landing.style.display = 'block';
                landing.setAttribute('aria-hidden', 'false');
                landing.inert = false;
            }
        }
        if (pushState) {
            const pendingTab = window.beatssPendingWorkspaceTab;
            const pendingPath = pendingTab ? workspacePathForTab(pendingTab) : '';
            history.pushState({ view: 'home', tabId: pendingTab || null }, '', pendingPath || '/');
        }

        if (window.currentUser && window.beatssPendingWorkspaceTab) {
            const pendingTab = window.beatssPendingWorkspaceTab;
            window.beatssPendingWorkspaceTab = null;
            requestAnimationFrame(() => selectWorkspaceTab(pendingTab));
        }
        // Ocultar reproductor si se vuelve a home
        const player = document.getElementById('store-audio-player');
        if (player) player.style.display = 'none';
    } 
    else if (viewName === 'catalog') {
        window.stateManager.setState('isGlobalCatalogMode', true);
        window.stateManager.setState('isPublicStoreMode', false);
        
        if (globalCatalog) {
            globalCatalog.style.display = 'block';
            globalCatalog.setAttribute('aria-hidden', 'false');
            globalCatalog.inert = false;
        }
        
        if (pushState) {
            history.pushState({ view: 'catalog' }, '', '/catalogo');
        }
        
        void loadModule('catalog')
            .then(() => window.initGlobalCatalog?.())
            .catch((error) => {
                console.error('[BEATSS] No se pudo iniciar el catálogo público:', error?.message || error);
                const grid = document.getElementById('global-beats-grid');
                if (grid) grid.innerHTML = '<p class="global-catalog-error" role="status">No se pudo cargar el catálogo. Inténtalo de nuevo.</p>';
            });
    } 
    else if (viewName === 'store') {
        window.stateManager.setState('isGlobalCatalogMode', false);
        window.stateManager.setState('isPublicStoreMode', true);
        
        if (publicStore) {
            publicStore.style.display = 'block';
            publicStore.setAttribute('aria-hidden', 'false');
            publicStore.inert = false;
        }
        
        const producerAka = params?.producer;
        if (producerAka) {
            if (pushState) {
                history.pushState({ view: 'store', producer: producerAka }, '', publicStorePath(producerAka));
            }
            if (window.initPublicStore) {
                window.initPublicStore(producerAka);
            }
        }
    }
    else if (viewName === 'download') {
        window.stateManager.setState('isGlobalCatalogMode', false);
        window.stateManager.setState('isPublicStoreMode', false);
        
        if (buyerDownload) {
            buyerDownload.style.display = 'block';
            buyerDownload.setAttribute('aria-hidden', 'false');
            buyerDownload.inert = false;
        }
        
        const paymentId = params?.paymentId;
        const downloadToken = params?.downloadToken || '';
        if (paymentId) {
            if (pushState) {
                history.pushState({ view: 'download', paymentId }, '', buyerDownloadPath(paymentId, downloadToken));
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
    const pathname = normalizedPathname();
    const urlParams = new URLSearchParams(window.location.search);
    const hasPayphoneReturn = Boolean(urlParams.get('id') && urlParams.get('clientTransactionId'));
    // PayPhone solo necesita el módulo de checkout cuando realmente volvemos
    // de su redirección. Evita descargar más de 1 MB de código en cada visita
    // normal al Studio o a la landing.
    if (hasPayphoneReturn) {
        if (typeof window.checkPayphoneSubscriptionRedirectResult === 'function') {
            window.checkPayphoneSubscriptionRedirectResult();
        }
        checkPayphoneRedirectResult();
    }
    if (urlParams.get('stripe_session_id')) {
        checkStripeReturn();
    } else if (urlParams.get('stripe_cancelled')) {
        urlParams.delete('stripe_cancelled');
        const cleanUrl = `${window.location.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ''}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);
        if (typeof window.showToast === 'function') window.showToast('El pago con Stripe fue cancelado.');
    }
    const downloadId = urlParams.get('download') || urlParams.get('order');
    const downloadToken = urlParams.get('token') || '';
    const producerAka = urlParams.get('p') || urlParams.get('producer');
    const routeDownloadId = pathname.startsWith('/descargas/')
        ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '')
        : '';
    const routeProducerAka = pathname.startsWith('/tienda/')
        ? decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '')
        : '';
    const workspaceTab = workspaceTabForPath(pathname);

    if (routeDownloadId || downloadId) {
        window.showAppView('download', { paymentId: routeDownloadId || downloadId, downloadToken }, false);
    } else if (routeProducerAka || producerAka) {
        window.showAppView('store', { producer: routeProducerAka || producerAka }, false);
    } else if (workspaceTab) {
        const canonicalPath = workspacePathForTab(workspaceTab);
        if (canonicalPath && pathname !== canonicalPath) {
            window.history.replaceState(
                { view: 'home', tabId: workspaceTab },
                '',
                `${canonicalPath}${window.location.search}${window.location.hash}`
            );
        }
        openPrivateWorkspaceRoute(workspaceTab);
    } else if (pathname === '/catalogo' || urlParams.has('catalogo') || window.location.hash === '#catalogo') {
        window.location.replace('/tienda/sossa');
    } else {
        window.showAppView('home', null, false);
    }
}

window.applyBeatssRoute = handleInitialRouting;

// Escuchar popstate para navegación del navegador (Atrás/Adelante)
window.addEventListener('popstate', () => {
    handleInitialRouting();
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

// Inicialización de componentes auxiliares que no pertenecen a la navegación móvil.
// La navegación móvil vive exclusivamente en mobile-studio.js.
document.addEventListener('DOMContentLoaded', () => {
    // Inicializar chatbot virtual
    if (typeof window.initChatbot === 'function') {
        window.initChatbot();
    }

    // Inicializar la rotación de productores destacados
    initFeaturedProducerRotation();
});

function initFeaturedProducerRotation() {
    const imgEl = document.getElementById('featured-producer-img');
    const cardEl = document.getElementById('featured-producer-card');
    const nameEl = document.getElementById('featured-producer-name');
    const descEl = document.getElementById('featured-producer-desc');
    const artistLabelEl = document.getElementById('featured-producer-label');

    if (!imgEl || !cardEl || !nameEl || !descEl) return;

    const FEATURED_PRODUCERS = [
        {
            name: "Sossa",
            img: "producer_sossa.webp",
            desc: {
                es: "Productor de Elite • +1M Streams",
                en: "Elite Producer • +1M Streams"
            },
            position: "center 5%",
            borderColor: "border-electric-purple",
            labelColor: "text-electric-purple",
            duration: 8000 // Sossa appears for 8 seconds
        },
        {
            name: "CG Monarco",
            img: "producer_monarco.jpg?v=4",
            desc: {
                es: "Productor Elite • Trap & Reggaeton",
                en: "Elite Producer • Trap & Reggaeton"
            },
            position: "center 65%",
            borderColor: "border-elite-gold",
            labelColor: "text-elite-gold",
            duration: 4000 // Others appear for 4 seconds
        },
        {
            name: "Mr. Micua",
            img: "producer_mrmicua.jpg?v=3",
            desc: {
                es: "Productor Elite • Dancehall & Trap",
                en: "Elite Producer • Dancehall & Trap"
            },
            position: "center 20%",
            borderColor: "border-elite-gold",
            labelColor: "text-elite-gold",
            duration: 4000
        },
        {
            name: "Sauce Beats",
            img: "producer_sauce.jpg",
            desc: {
                es: "Productor Elite • Dancehall & Trap",
                en: "Elite Producer • Dancehall & Trap"
            },
            position: "center 25%",
            borderColor: "border-elite-gold",
            labelColor: "text-elite-gold",
            duration: 4000
        }
    ];

    let currentIndex = 0;
    let timeoutId = null;

    function showProducer(index) {
        const prod = FEATURED_PRODUCERS[index];
        const lang = window.currentLang || 'es';

        // 1. Transición suave de salida
        imgEl.style.opacity = '0.1';
        cardEl.style.opacity = '0.1';

        setTimeout(() => {
            // 2. Cambiar contenidos
            imgEl.src = prod.img;
            imgEl.style.objectPosition = prod.position;
            nameEl.textContent = prod.name;
            descEl.textContent = prod.desc[lang] || prod.desc['es'];

            // Actualizar clases de bordes
            cardEl.classList.remove('border-electric-purple', 'border-neon-blue', 'border-elite-gold');
            cardEl.classList.add(prod.borderColor);

            // Actualizar color de la etiqueta de arriba
            if (artistLabelEl) {
                artistLabelEl.classList.remove('text-electric-purple', 'text-neon-blue', 'text-elite-gold');
                artistLabelEl.classList.add(prod.labelColor);
            }

            // 3. Transición suave de entrada
            imgEl.style.opacity = '1';
            cardEl.style.opacity = '1';
        }, 300);

        // Programar la siguiente rotación
        timeoutId = setTimeout(() => {
            currentIndex = (currentIndex + 1) % FEATURED_PRODUCERS.length;
            showProducer(currentIndex);
        }, prod.duration);
    }

    // Iniciar
    showProducer(0);

    // Traducir descripción si cambia el idioma
    window.addEventListener('languageChanged', () => {
        const prod = FEATURED_PRODUCERS[currentIndex];
        const lang = window.currentLang || 'es';
        descEl.textContent = prod.desc[lang] || prod.desc['es'];
    });
}
// Rotation configuration completed
