import { LICENSE_CONFIGS, SEED_LICENSES, DEFAULT_TEMPLATES } from './config.js';
import { TRANSLATIONS } from './i18n.js';
import { 
    auth, 
    db, 
    storage,
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
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
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "./firebase.js";

// Estado global de la aplicación
let currentLang = 'es';
let salesChartInstance = null;

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
    storageProvider: "gdrive"
};

// Historial de licencias
let licenseHistory = [];

// Contactos de clientes
let contactsList = [];

// Estado del plan de suscripción del usuario actual
let currentUploadedReceiptBase64 = null;
let activeTemplates = [];
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
    document.body.classList.remove('contract-theme-purple', 'contract-theme-red', 'contract-theme-blue', 'contract-theme-charcoal', 'contract-theme-gold');
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

window.currentUser = null;

// Configurar los controles del modal de login/registro de Firebase
function setupAuthModalEvents() {
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const googleBtn = document.getElementById('btn-google-auth');
    const errorMsg = document.getElementById('auth-error-msg');

    if (!tabLoginBtn) return;

    tabLoginBtn.addEventListener('click', () => {
        tabLoginBtn.classList.add('active');
        tabLoginBtn.style.color = 'var(--accent)';
        tabLoginBtn.style.borderBottomColor = 'var(--accent)';
        
        tabRegisterBtn.classList.remove('active');
        tabRegisterBtn.style.color = 'var(--text-secondary)';
        tabRegisterBtn.style.borderBottomColor = 'transparent';

        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        errorMsg.style.display = 'none';
    });

    tabRegisterBtn.addEventListener('click', () => {
        tabRegisterBtn.classList.add('active');
        tabRegisterBtn.style.color = 'var(--accent)';
        tabRegisterBtn.style.borderBottomColor = 'var(--accent)';
        
        tabLoginBtn.classList.remove('active');
        tabLoginBtn.style.color = 'var(--text-secondary)';
        tabLoginBtn.style.borderBottomColor = 'transparent';

        registerForm.style.display = 'flex';
        loginForm.style.display = 'none';
        errorMsg.style.display = 'none';
    });

    // Formulario de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-login-email').value.trim();
        const password = document.getElementById('auth-login-password').value;
        errorMsg.style.display = 'none';

        try {
            showToast('Iniciando sesión...');
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error(err);
            errorMsg.innerText = 'Error al iniciar sesión: ' + parseAuthError(err.code);
            errorMsg.style.display = 'block';
            showToast('Fallo al iniciar sesión', true);
        }
    });

    // Formulario de registro
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-register-email').value.trim();
        const password = document.getElementById('auth-register-password').value;
        errorMsg.style.display = 'none';

        try {
            showToast('Registrando cuenta...');
            await createUserWithEmailAndPassword(auth, email, password);
            showToast('Registro exitoso');
        } catch (err) {
            console.error(err);
            errorMsg.innerText = 'Error al registrar: ' + parseAuthError(err.code);
            errorMsg.style.display = 'block';
            showToast('Fallo al registrar cuenta', true);
        }
    });

    // Login con Google
    googleBtn.addEventListener('click', async () => {
        errorMsg.style.display = 'none';
        try {
            showToast('Iniciando sesión con Google...');
            // Usar signInWithPopup como método primario porque signInWithRedirect suele fallar
            // o resolver como null en navegadores modernos (Safari/Chrome macOS/iOS) debido
            // a restricciones de cookies de terceros en dominios personalizados de Vercel.
            const result = await signInWithPopup(auth, googleProvider);
            if (result && result.user) {
                console.log("Sesión de Google iniciada mediante popup para:", result.user.email);
                showToast("Sesión iniciada con Google");
            }
        } catch (err) {
            console.error('Popup falló o fue bloqueado, intentando redirección...', err);
            // Si el popup es bloqueado o no se soporta, intentar redirect como fallback
            try {
                showToast('Redirigiendo a Google...');
                await signInWithRedirect(auth, googleProvider);
            } catch (redirectErr) {
                console.error('Redirección también falló:', redirectErr);
                errorMsg.innerText = 'Error de Google: ' + redirectErr.message;
                errorMsg.style.display = 'block';
                showToast('Fallo al iniciar sesión con Google', true);
            }
        }
    });

    // Abrir modal de login desde la Landing Page
    document.getElementById('landing-btn-login')?.addEventListener('click', () => {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.style.display = 'flex';
            tabLoginBtn.click(); // Cambiar a pestaña iniciar sesión
        }
    });

    document.getElementById('landing-btn-start')?.addEventListener('click', () => {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.style.display = 'flex';
            tabRegisterBtn.click(); // Cambiar a pestaña registrarse
        }
    });

    document.querySelectorAll('.landing-btn-action-start').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = document.getElementById('login-modal');
            if (modal) {
                modal.style.display = 'flex';
                tabRegisterBtn.click(); // Cambiar a pestaña registrarse
            }
        });
    });

    // Cerrar modal de login
    document.getElementById('btn-close-login-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('login-modal');
        if (modal) modal.style.display = 'none';
    });

    // Cerrar al hacer click en el backdrop
    document.getElementById('login-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('login-modal')) {
            document.getElementById('login-modal').style.display = 'none';
        }
    });
}

function parseAuthError(code) {
    switch (code) {
        case 'auth/invalid-email': return 'El correo electrónico no es válido.';
        case 'auth/user-disabled': return 'Esta cuenta ha sido inhabilitada.';
        case 'auth/user-not-found': return 'No existe ninguna cuenta con este correo.';
        case 'auth/wrong-password': return 'Contraseña incorrecta.';
        case 'auth/email-already-in-use': return 'Este correo ya está registrado por otro usuario.';
        case 'auth/weak-password': return 'La contraseña debe tener al menos 6 caracteres.';
        case 'auth/invalid-credential': return 'Credenciales de acceso no válidas.';
        default: return 'Ocurrió un error inesperado. Revisa tu conexión.';
    }
}

// Inicialización de la aplicación
document.addEventListener('DOMContentLoaded', () => {
    // Registrar Service Worker para soporte PWA offline
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js')
            .then((reg) => console.log('🟢 Service Worker registrado con éxito. Scope:', reg.scope))
            .catch((err) => console.error('🔴 Falló el registro del Service Worker:', err));
    }

    // Capturar código de referido si viene en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
        localStorage.setItem('beatss_referred_by', refCode);
        console.log("🔗 Guardado código de referido:", refCode);
    }

    // Configurar manejadores del modal de Login/Registro
    setupAuthModalEvents();

    // Manejar el resultado de redirección si viene de un flujo de redirect
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                console.log("Sesión de Google iniciada mediante redirección para:", result.user.email);
                showToast("Sesión iniciada con Google");
            }
        })
        .catch((err) => {
            console.error("Error al procesar redirección de Google:", err);
            
            // Abrir el modal de inicio de sesión para que el usuario pueda ver el mensaje de error
            const modal = document.getElementById('login-modal');
            if (modal) {
                modal.style.display = 'flex';
            }
            
            // Usar el ID correcto de index.html (auth-error-msg)
            const errorMsg = document.getElementById('auth-error-msg');
            if (errorMsg) {
                errorMsg.innerText = 'Error de Google (Redirección): ' + err.message;
                errorMsg.style.display = 'block';
            }
            showToast('Fallo al iniciar sesión con Google', true);
        });

    // Escuchar el estado de autenticación de Firebase
    onAuthStateChanged(auth, async (user) => {
        if (window.isPublicStoreMode) {
            console.log("🛒 Tienda pública activa. Omitiendo flujo normal de control de sesión.");
            if (user) {
                window.currentUser = user.uid;
                window.currentUserIsAdmin = (user.email && user.email.toLowerCase() === 'masterjuego25@gmail.com');
            }
            return;
        }
        if (user) {
            console.log("Sesión activa de Firebase:", user.email, user.uid);
            document.getElementById('login-modal').style.display = 'none';
            const landing = document.getElementById('landing-page');
            if (landing) landing.style.display = 'none';
            
            // Sossa Admin es quien ingresa con sossabeatz1@gmail.com
            window.currentUserIsAdmin = (user.email && user.email.toLowerCase() === 'masterjuego25@gmail.com');
            
            // Auto-desvincular Google antiguo si el usuario inicia sesión con email y contraseña masterjuego25
            // pero el proveedor Google sigue apuntando a sossabeatz1
            if (user.email && user.email.toLowerCase() === 'masterjuego25@gmail.com' && user.providerData) {
                const googleProv = user.providerData.find(p => p.providerId === 'google.com');
                if (googleProv && googleProv.email && googleProv.email.toLowerCase() === 'sossabeatz1@gmail.com') {
                    console.log("Detectado proveedor de Google antiguo. Desvinculando...");
                    unlink(user, 'google.com')
                        .then(() => console.log("🔒 Cuenta de Google antigua (sossabeatz1) desvinculada con éxito. Listo para vincular la nueva en la próxima sesión con Google."))
                        .catch(err => console.error("Error al desvincular Google antiguo:", err));
                }
            }
            
            await initApp(user.uid);
        } else {
            console.log("Sin sesión de Firebase. Mostrando landing page.");
            window.currentUser = null;
            window.currentUserIsAdmin = false;
            document.getElementById('app-container').style.display = 'none';
            
            const landing = document.getElementById('landing-page');
            if (landing) {
                landing.style.display = 'block';
                document.getElementById('login-modal').style.display = 'none';
                setTimeout(safeCreateIcons, 100);
            } else {
                document.getElementById('login-modal').style.display = 'flex';
            }
        }
    });
});

async function initApp(user) {
    window.currentUser = user;
    document.getElementById('app-container').style.display = 'grid';

    checkDocuSignOAuth();
    initDefaultDate();
    
    // Si estamos en localhost, cargar del servidor local antes de cargar en memoria
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        await loadFromLocalServer();
    }
    
    await loadProducerConfig();
    await loadTemplates();

    // Configurar logo y tema por defecto según el AKA cargado en el config
    const logoImg = document.getElementById('app-logo');
    const sidebarTitle = document.getElementById('app-sidebar-title');
    if (logoImg && sidebarTitle) {
        const akaName = (producerConfig.aka || "").toLowerCase();
        const isMonarco = akaName.includes('monarco') || (auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === 'beatscgmonarco@gmail.com');
        const isSossa = akaName.includes('sossa') || window.currentUserIsAdmin;

        if (isSossa) {
            logoImg.innerHTML = '<i data-lucide="music"></i>';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco');
        } else if (isMonarco) {
            logoImg.innerHTML = '<i data-lucide="headphones"></i>';
            document.body.classList.remove('theme-sossa');
            document.body.classList.add('theme-cgmonarco');
        } else {
            logoImg.innerHTML = '<i data-lucide="music"></i>';
            document.body.classList.add('theme-sossa');
            document.body.classList.remove('theme-cgmonarco');
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
    let firestoreLoaded = false;
    try {
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            producerConfig = { ...producerConfig, ...docSnap.data() };
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
                    storageProvider: "gdrive"
                };
            } else if (currentEmail.toLowerCase() === 'masterjuego25@gmail.com') {
                producerConfig = {
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
                    storageProvider: "gdrive"
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
                    storageProvider: "gdrive",
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
    if ((producerConfig.plan === 'pro' || producerConfig.plan === 'elite') && producerConfig.expirationPro) {
        const expirationDate = new Date(producerConfig.expirationPro);
        if (expirationDate < new Date()) {
            const expiredPlan = producerConfig.plan;
            console.log(`El Plan ${expiredPlan} ha expirado. Degradando a Plan Inicial.`);
            producerConfig.plan = 'inicial';
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
    document.getElementById('cfg-bank-pichincha-name').value = producerConfig.bankPichinchaName || "";
    document.getElementById('cfg-bank-pichincha-dni').value = producerConfig.bankPichinchaDni || "";
    document.getElementById('cfg-bank-guayaquil-acc').value = producerConfig.bankGuayaquilAcc || "";
    document.getElementById('cfg-bank-guayaquil-name').value = producerConfig.bankGuayaquilName || "";
    document.getElementById('cfg-bank-guayaquil-dni').value = producerConfig.bankGuayaquilDni || "";
    document.getElementById('cfg-deuna-phone').value = producerConfig.deunaPhone || "";
    document.getElementById('cfg-deuna-name').value = producerConfig.deunaName || "";
    document.getElementById('cfg-paypal-email').value = producerConfig.paypalEmail || "";
    document.getElementById('cfg-paypal-client-id').value = producerConfig.paypalClientId || "";

    if (document.getElementById('cfg-storage-provider')) {
        document.getElementById('cfg-storage-provider').value = producerConfig.storageProvider || "gdrive-central";
    }
    if (document.getElementById('cfg-contract-color')) {
        document.getElementById('cfg-contract-color').value = producerConfig.contractColor || "default";
    }
    
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
        if (!window.currentUserIsPro) {
            btnUploadLogo.disabled = true;
            logoPlanWarning.style.display = 'block';
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
}

// Guardar configuración de productor
async function saveProducerConfig() {
    producerConfig.name = document.getElementById('cfg-producer-name').value.trim() || "Joao David Dominguez";
    producerConfig.id = document.getElementById('cfg-producer-id').value.trim() || "0803743111";
    producerConfig.aka = document.getElementById('cfg-producer-aka').value.trim() || "Sossa";
    producerConfig.place = document.getElementById('cfg-default-place').value.trim() || "Quito, Ecuador";
    producerConfig.email = document.getElementById('cfg-producer-email').value.trim() || "masterjuego25@gmail.com";
    producerConfig.phone = document.getElementById('cfg-producer-phone').value.trim() || "+593961201184";
    producerConfig.pro = document.getElementById('cfg-producer-pro').value.trim() || "BMI";
    producerConfig.ipi = document.getElementById('cfg-producer-ipi').value.trim() || "01170943066";
    producerConfig.publisher = document.getElementById('cfg-producer-publisher').value.trim() || "Songtrust";
    producerConfig.signature = window.tempSignatureBase64 || "";
    if (window.currentUserIsPro) {
        producerConfig.logoBase64 = window.tempLogoBase64 || "";
    } else {
        producerConfig.logoBase64 = "";
    }
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
    
    // Guardar datos de cobro de tienda pública
    producerConfig.bankPichinchaAcc = document.getElementById('cfg-bank-pichincha-acc').value.trim();
    producerConfig.bankPichinchaName = document.getElementById('cfg-bank-pichincha-name').value.trim();
    producerConfig.bankPichinchaDni = document.getElementById('cfg-bank-pichincha-dni').value.trim();
    producerConfig.bankGuayaquilAcc = document.getElementById('cfg-bank-guayaquil-acc').value.trim();
    producerConfig.bankGuayaquilName = document.getElementById('cfg-bank-guayaquil-name').value.trim();
    producerConfig.bankGuayaquilDni = document.getElementById('cfg-bank-guayaquil-dni').value.trim();
    producerConfig.deunaPhone = document.getElementById('cfg-deuna-phone').value.trim();
    producerConfig.deunaName = document.getElementById('cfg-deuna-name').value.trim();
    producerConfig.paypalEmail = document.getElementById('cfg-paypal-email').value.trim();
    producerConfig.paypalClientId = document.getElementById('cfg-paypal-client-id').value.trim();

    // Si cambió el Client ID, limpiar token cacheado de Drive
    if (producerConfig.gdriveClientId !== (JSON.parse(localStorage.getItem(`${window.currentUser}_producer_config`) || '{}').gdriveClientId || '')) {
        sessionStorage.removeItem('gdrive_access_token');
        sessionStorage.removeItem('gdrive_token_expiry');
    }
    
    // Guardar en Firestore
    const docRef = doc(db, "users", window.currentUser, "config", "producer");
    try {
        await setDoc(docRef, producerConfig);
        safeSetItem(`${window.currentUser}_producer_config`, JSON.stringify(producerConfig));
        document.getElementById('celebration-place').value = producerConfig.place;
        
        closeSettingsModal();
        generatePreview();
        updatePlanUI();
        showToast('Configuración del productor actualizada en la nube');

        // Autenticar automáticamente con Google Drive si hay un Client ID y no hay token activo
        if (producerConfig.gdriveClientId) {
            const cachedToken = sessionStorage.getItem('gdrive_access_token');
            const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
            if (!cachedToken || Date.now() >= expiry - 120000) {
                getGdriveToken().then(() => {
                    console.log('☁️ Auto-autenticado con Google Drive con éxito al guardar configuración.');
                    autoBackupGoogleDrive();
                }).catch(err => {
                    console.warn('Auto-autenticación con Google Drive falló:', err.message);
                });
            }
        }
    } catch (err) {
        console.error("Error al guardar config de productor en Firestore:", err);
        showToast("Error al guardar en la nube: " + err.message, true);
    }
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
    const btnLang = document.getElementById('btn-language');
    if (btnLang) {
        btnLang.addEventListener('click', () => {
            currentLang = currentLang === 'es' ? 'en' : 'es';
            document.getElementById('lang-icon').textContent = currentLang.toUpperCase();
            generatePreview();
        });
    }

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
            if (!window.currentUserIsPro) {
                showToast("⚠️ Esta función requiere el plan Pro o Elite.", true);
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

    document.getElementById('input-import-backup').addEventListener('change', importBackup);
    // Analizador de ZIP
    document.getElementById('input-import-zip').addEventListener('change', handleZipSelect);
    document.getElementById('btn-analyze-zip').addEventListener('click', analyzeSelectedZip);

    // Cambio de pestañas
    const tabBtns = document.querySelectorAll('.tab-btn');
    const sidebarEl = document.querySelector('aside.sidebar');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            tabBtns.forEach(b => b.classList.remove('active'));
            const targetBtn = e.currentTarget;
            targetBtn.classList.add('active');

            // Ocultar todos los contenidos
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(targetBtn.dataset.tab).classList.add('active');

            // Mostrar/ocultar sidebar según el tab activo
            if (targetBtn.dataset.tab === 'tab-history' || targetBtn.dataset.tab === 'tab-dashboard' || targetBtn.dataset.tab === 'tab-admin' || targetBtn.dataset.tab === 'tab-beats' || targetBtn.dataset.tab === 'tab-sales') {
                sidebarEl && sidebarEl.classList.add('sidebar-hidden');
            } else {
                sidebarEl && sidebarEl.classList.remove('sidebar-hidden');
            }

            // Renderizar catálogo de beats si se selecciona la pestaña de beats
            if (targetBtn.dataset.tab === 'tab-beats') {
                renderBeatsGrid();
                updateGenreAndKeyFilters();
            }

            // Cargar contabilidad si entra a pestaña admin
            if (targetBtn.dataset.tab === 'tab-admin' && window.currentUserIsAdmin) {
                loadConsolidatedAccounting();
            }

            // Cargar dashboard si entra a pestaña dashboard
            if (targetBtn.dataset.tab === 'tab-dashboard') {
                updateDashboardView();
            }

            // Cargar ventas si entra a pestaña de ventas/pedidos
            if (targetBtn.dataset.tab === 'tab-sales') {
                loadSalesData();
            }
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
            if (typeof _salesUnsubscribe === 'function') {
                _salesUnsubscribe();
                _salesUnsubscribe = null;
            }
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
                    
                    // Comprimir como JPEG para ahorrar espacio (~30KB), calidad 0.8
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
                    
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
            submitBtn.innerHTML = '⏳ Enviando comprobante...';
            
            try {
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
                    receiptUrl: currentUploadedReceiptBase64,
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
function selectLicenseType(type) {
    const config = LICENSE_CONFIGS[type];
    if (!config) return;

    // Actualizar campos principales
    document.getElementById('license-value').value = config.price;
    
    // Auto-generar código de referencia
    const refCode = generateReferenceCode(type);
    document.getElementById('ref-code').value = refCode;

    // Actualizar cláusulas avanzadas
    document.getElementById('clause-formats').value = config.formats;
    document.getElementById('clause-streams').value = config.streams;
    document.getElementById('clause-physical').value = config.physical;
    document.getElementById('clause-videos').value = config.videos;
    document.getElementById('clause-video-duration').value = config.videoDuration;
    document.getElementById('clause-years').value = config.years;
    
    // Calcular multa de rescisión (200% del precio)
    const doublePrice = (config.price * 2).toFixed(2);
    let terminationFeeText = "";
    if (type === 'exclusive') {
        terminationFeeText = "No aplica (Exclusivo)";
    } else {
        terminationFeeText = `200% de la Tarifa de Licencia pagada originalmente (un total de $${doublePrice} USD)`;
    }
    document.getElementById('clause-termination-fee').value = terminationFeeText;
    
    document.getElementById('clause-writer-share').value = config.writerShare;
    document.getElementById('clause-producer-share').value = config.producerShare;
    
    // Hacer dinámico según el aka del productor actual
    const producerAka = producerConfig.aka || 'Productor';
    const creditsStr = `"Producido por ${producerAka}" o "Prod. por ${producerAka}"`;
    document.getElementById('clause-credits').value = creditsStr;
    document.getElementById('clause-content-id').checked = config.contentId;

    // Mostrar/ocultar botón DocuSign según el tipo
    const docusignBtn = document.getElementById('btn-docusign');
    if (docusignBtn) {
        docusignBtn.style.display = (type === 'exclusive') ? 'flex' : 'none';
    }

    generatePreview();
}

// Generar código de referencia formal y entendible en español
function generateReferenceCode(type) {
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                    String(today.getMonth() + 1).padStart(2, '0') + 
                    String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    
    // Mapear los tipos de licencia a abreviaciones claras en español
    const typeMap = {
        basic: 'BAS',           // Básica
        premium: 'PREM',        // Premium
        premium_plus: 'PPLUS',  // Premium Plus
        unlimited_flp: 'ULFLP', // Ilimitada (STEMS + FLP)
        exclusive: 'EXCL'       // Exclusiva
    };
    
    const typeCode = typeMap[type] || 'PERS'; // PERS para Personalizada
    return `LIC-${typeCode}-${dateStr}-${random}`;
}

// Convertir número a texto en español para contratos legales
function numeroALetras(num) {
    const decs = Math.round((num - Math.floor(num)) * 100);
    const entero = Math.floor(num);
    
    const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const especiales = {
        11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
        16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
        21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro',
        25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve'
    };
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

    function convertirGrupo(n) {
        if (n === 0) return 'cero';
        if (n === 100) return 'cien';
        let output = '';
        if (n >= 100) {
            output += centenas[Math.floor(n / 100)] + ' ';
            n %= 100;
        }
        if (n > 0) {
            if (especiales[n]) {
                output += especiales[n];
            } else {
                let dec = Math.floor(n / 10);
                let uni = n % 10;
                if (dec > 0) {
                    output += decenas[dec];
                    if (uni > 0) output += ' y ';
                }
                if (uni > 0) {
                    output += unidades[uni];
                }
            }
        }
        return output.trim();
    }

    let result = '';
    if (entero === 0) {
        result = 'cero';
    } else if (entero < 1000) {
        result = convertirGrupo(entero);
    } else {
        let mil = Math.floor(entero / 1000);
        let resto = entero % 1000;
        if (mil === 1) {
            result = 'mil ';
        } else {
            result = convertirGrupo(mil) + ' mil ';
        }
        if (resto > 0) {
            result += convertirGrupo(resto);
        }
    }
    
    result = result.trim();
    
    if (decs > 0) {
        let decsTexto = especiales[decs] || (decenas[Math.floor(decs / 10)] + (decs % 10 > 0 ? ' y ' + unidades[decs % 10] : ''));
        return `${result} con ${decsTexto.trim()} centavos`;
    }
    return result;
}

// Formatear fecha en formato formal en español
function formatFechaEspanol(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const diaSemana = dias[date.getDay()];
    const diaMes = String(date.getDate()).padStart(2, '0');
    const mes = meses[date.getMonth()];
    const anio = date.getFullYear();
    
    return `${diaSemana}, ${diaMes} de ${mes} de ${anio}`;
}

// Obtener nombre del tipo de licencia activo
function getActiveLicenseType() {
    const activeBtn = document.querySelector('.license-btn.active');
    return activeBtn ? activeBtn.dataset.type : 'basic';
}

// ==========================================================================
// SISTEMA DE PLANTILLAS Y MOTOR MARKDOWN
// ==========================================================================

function parseInlineMarkdown(text) {
    let parsed = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    // Bold: **text** or __text__
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    parsed = parsed.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code: `code`
    parsed = parsed.replace(/`(.*?)`/g, '<code>$1</code>');
    
    return parsed;
}

function parseMarkdownToHTML(markdown) {
    if (!markdown) return '';
    
    const lines = markdown.split('\n');
    let html = [];
    let inList = false;
    let inBlockquote = false;
    
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Handle table rows
        if (line.startsWith('|')) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            
            const cells = line.split('|').map(c => c.trim()).filter((c, index, arr) => index > 0 && index < arr.length - 1);
            
            if (!inTable) {
                inTable = true;
                tableHeaders = cells;
            } else {
                const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
                if (!isSeparator) {
                    tableRows.push(cells);
                }
            }
            continue;
        } else if (inTable) {
            html.push('<table class="limits-table">');
            html.push('<thead><tr>');
            tableHeaders.forEach(h => html.push(`<th>${parseInlineMarkdown(h)}</th>`));
            html.push('</tr></thead>');
            html.push('<tbody>');
            tableRows.forEach(row => {
                html.push('<tr>');
                row.forEach(cell => html.push(`<td>${parseInlineMarkdown(cell)}</td>`));
                html.push('</tr>');
            });
            html.push('</tbody></table>');
            inTable = false;
            tableHeaders = [];
            tableRows = [];
        }
        
        // Handle horizontal rules
        if (line === '---' || line === '***') {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            html.push('<hr>');
            continue;
        }
        
        // Handle Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            const level = headingMatch[1].length;
            const content = parseInlineMarkdown(headingMatch[2]);
            html.push(`<h${level}>${content}</h${level}>`);
            continue;
        }
        
        // Handle List Items
        const listMatch = line.match(/^[\*\-\+]\s+(.*)$/);
        if (listMatch) {
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            const content = parseInlineMarkdown(listMatch[1]);
            html.push(`<li>${content}</li>`);
            continue;
        }
        
        // Handle Blockquotes
        const quoteMatch = line.match(/^>\s+(.*)$/);
        if (quoteMatch) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (!inBlockquote) {
                html.push('<blockquote><div>');
                inBlockquote = true;
            }
            const content = parseInlineMarkdown(quoteMatch[1]);
            html.push(content + '<br>');
            continue;
        }
        
        // Handle Empty Lines
        if (line === '') {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            continue;
        }
        
        // Regular Paragraph
        if (inList) { html.push('</ul>'); inList = false; }
        if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
        
        const content = parseInlineMarkdown(line);
        html.push(`<p>${content}</p>`);
    }
    
    if (inTable) {
        html.push('<table class="limits-table">');
        html.push('<thead><tr>');
        tableHeaders.forEach(h => html.push(`<th>${parseInlineMarkdown(h)}</th>`));
        html.push('</tr></thead>');
        html.push('<tbody>');
        tableRows.forEach(row => {
            html.push('<tr>');
            row.forEach(cell => html.push(`<td>${parseInlineMarkdown(cell)}</td>`));
            html.push('</tr>');
        });
        html.push('</tbody></table>');
    }
    if (inList) html.push('</ul>');
    if (inBlockquote) html.push('</div></blockquote>');
    
    return html.join('\n');
}

async function loadTemplates() {
    activeTemplates = DEFAULT_TEMPLATES.map(t => ({ ...t }));
    
    if (!window.currentUser) {
        console.warn("No hay usuario autenticado, usando plantillas por defecto.");
        return;
    }

    if (window.currentUserIsPro) {
        console.log("Cargando plantillas desde Firestore para Plan Pro...");
        try {
            const templatesRef = collection(db, "users", window.currentUser, "templates");
            const qSnap = await getDocs(templatesRef);
            qSnap.forEach(doc => {
                const data = doc.data();
                const tid = doc.id;
                const activeT = activeTemplates.find(t => t.id === tid);
                if (activeT && data.markdown) {
                    activeT.markdown = data.markdown;
                }
            });
            console.log("Plantillas cargadas desde Firestore.");
        } catch (err) {
            console.error("Error al cargar plantillas desde Firestore:", err);
        }
    } else {
        console.log("Cargando plantillas desde localStorage para Plan Inicial...");
        activeTemplates.forEach(t => {
            const saved = localStorage.getItem(`${window.currentUser}_template_${t.id}`);
            if (saved) {
                t.markdown = saved;
            }
        });
        console.log("Plantillas cargadas desde localStorage.");
    }
}

async function saveTemplateCustom(templateId, markdown) {
    const activeT = activeTemplates.find(t => t.id === templateId);
    if (activeT) {
        activeT.markdown = markdown;
    }
    
    if (!window.currentUser) return;
    
    if (window.currentUserIsPro) {
        const docRef = doc(db, "users", window.currentUser, "templates", templateId);
        await setDoc(docRef, { markdown: markdown }, { merge: true });
    } else {
        localStorage.setItem(`${window.currentUser}_template_${templateId}`, markdown);
    }
}

async function resetTemplateCustom(templateId) {
    const defaultT = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    const activeT = activeTemplates.find(t => t.id === templateId);
    if (defaultT && activeT) {
        activeT.markdown = defaultT.markdown;
        
        if (window.currentUser) {
            if (window.currentUserIsPro) {
                const docRef = doc(db, "users", window.currentUser, "templates", templateId);
                await deleteDoc(docRef);
            } else {
                localStorage.removeItem(`${window.currentUser}_template_${templateId}`);
            }
        }
    }
}

function openTemplatesEditor() {
    const modal = document.getElementById('templates-editor-modal');
    if (modal) {
        modal.style.display = 'flex';
        const activeSel = document.getElementById('contract-template-select');
        const editSel = document.getElementById('edit-template-select');
        if (activeSel && editSel) {
            editSel.value = activeSel.value;
        }
        loadTemplateToEditor(editSel.value);
    }
}

function closeTemplatesEditor() {
    const modal = document.getElementById('templates-editor-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function loadTemplateToEditor(templateId) {
    const textarea = document.getElementById('template-editor-textarea');
    if (textarea) {
        const template = activeTemplates.find(t => t.id === templateId);
        textarea.value = template ? template.markdown : '';
    }
}

// COMPILAR CONTRATO (Generación de contenido de texto Markdown y HTML)
function compileContract() {
    const type = getActiveLicenseType();
    const isExclusive = type === 'exclusive';
    
    const beatName = document.getElementById('beat-name').value.trim() || "[Nombre del Beat]";
    const beatBpm = document.getElementById('beat-bpm') ? document.getElementById('beat-bpm').value.trim() : "";
    const beatKey = document.getElementById('beat-key') ? document.getElementById('beat-key').value.trim() : "";
    const buyerName = document.getElementById('buyer-name').value.trim() || "[Nombre del Comprador]";
    const buyerId = document.getElementById('buyer-id').value.trim() || "[Cédula/DNI]";
    const buyerEmail = document.getElementById('buyer-email').value.trim() || "[Correo del Comprador]";
    const buyerPhone = document.getElementById('buyer-phone').value.trim();
    const buyerCity = document.getElementById('buyer-city').value.trim() || "[Ciudad]";
    const buyerCountry = document.getElementById('buyer-country').value.trim() || "[País]";
    const value = parseFloat(document.getElementById('license-value').value) || 0;
    const refCode = document.getElementById('ref-code').value.trim() || "[Código Referencia]";
    const effectiveDate = document.getElementById('effective-date').value;
    const dateFormatted = formatFechaEspanol(effectiveDate) || "[Fecha]";
    const celebrationPlace = document.getElementById('celebration-place').value.trim() || "[Lugar de Celebración]";
    const paymentMethod = document.getElementById('payment-method').value;
    
    // Cláusulas editadas
    const formats = document.getElementById('clause-formats').value.trim() || "[Formatos]";
    const streams = document.getElementById('clause-streams').value.trim() || "[Límite Streams]";
    const physical = document.getElementById('clause-physical').value.trim() || "[Límite Físicas]";
    const videos = document.getElementById('clause-videos').value.trim() || "[Videos]";
    const videoDuration = document.getElementById('clause-video-duration').value.trim() || "[Duración Video]";
    const years = document.getElementById('clause-years').value.trim() || "[Años de Vigencia]";
    const terminationFee = document.getElementById('clause-termination-fee').value.trim() || "[Multa Rescisión]";
    const writerShare = document.getElementById('clause-writer-share').value;
    const producerShare = document.getElementById('clause-producer-share').value;
    const credits = document.getElementById('clause-credits').value.trim() || "[Créditos]";
    const contentIdProhibited = document.getElementById('clause-content-id').checked;

    const valueLetters = numeroALetras(value);
    const tierName = LICENSE_CONFIGS[type] ? LICENSE_CONFIGS[type].name : "Personalizada";

    // Extraer ciudad del lugar de firma para la jurisdicción
    const cityParts = celebrationPlace.split(',');
    const cityOfJurisdiction = cityParts[0].trim();

    // Obtener la plantilla activa
    const activeTemplateSelect = document.getElementById('contract-template-select');
    const activeTemplateId = activeTemplateSelect ? activeTemplateSelect.value : 'licencia_uso';
    let activeTemplate = activeTemplates.find(t => t.id === activeTemplateId);
    if (!activeTemplate) {
        activeTemplate = DEFAULT_TEMPLATES.find(t => t.id === activeTemplateId) || DEFAULT_TEMPLATES[0];
    }

    // Resolver cláusulas condicionales
    const clause_rescission_rules = isExclusive 
        ? 'Una vez vencido o perpetuo el acuerdo, los derechos se mantendrán según lo estipulado sin necesidad de renovación.'
        : 'En consecuencia, esta licencia expirará automáticamente al cumplirse el término estipulado contados a partir de la fecha estipulada en el encabezado.';

    const clause_content_id_rules = contentIdProhibited
        ? 'El Licenciatario tiene **estrictamente prohibido** registrar el Beat o la Nueva Canción en cualquier plataforma de identificación automatizada de contenido (*Content ID*, *Facebook Rights Manager*, *Identifyy*, o herramientas de distribución digital automáticas como TuneCore, CD Baby o DistroKid que indexen huellas de audio). Esta medida es obligatoria para resguardar los derechos de otros licenciatarios legítimos del mismo Beat. El material original ya ha sido indexado y protegido preventivamente por el Productor. El incumplimiento de esta norma provocará la revocación inmediata de la licencia.'
        : 'Al tratarse de una Licencia Exclusiva, el Licenciatario está facultado para la distribución digital estándar y el uso del sistema Content ID de manera controlada sobre su versión final (la Nueva Canción) siempre y cuando no reclame derechos de autoría exclusiva sobre la pista instrumental en sí misma.';

    // Configurar variables de reemplazo
    const vars = {
        producer_name: producerConfig.name || "Joao David Dominguez",
        producer_aka: producerConfig.aka || "Sossa",
        producer_id: producerConfig.id || "0803743111",
        producer_email: producerConfig.email || "masterjuego25@gmail.com",
        producer_phone: producerConfig.phone || "",
        producer_pro: producerConfig.pro || "BMI",
        producer_ipi: producerConfig.ipi || "01170943066",
        producer_publisher: producerConfig.publisher || "Songtrust",
        
        buyer_name: buyerName,
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        buyer_city: buyerCity,
        buyer_country: buyerCountry,
        
        beat_name: beatName,
        beat_bpm: beatBpm ? beatBpm + ' BPM' : '',
        beat_key: beatKey,
        license_value: value.toFixed(2),
        license_value_letters: valueLetters,
        ref_code: refCode,
        effective_date: dateFormatted,
        celebration_place: celebrationPlace,
        payment_method: paymentMethod,
        jurisdiction_city: cityOfJurisdiction,
        current_year: effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear(),
        
        clause_formats: formats,
        clause_streams: streams,
        clause_physical: physical,
        clause_videos: videos,
        clause_video_duration: videoDuration,
        clause_years: years,
        clause_termination_fee: terminationFee,
        clause_writer_share: writerShare,
        clause_producer_share: producerShare,
        clause_credits: credits,
        
        license_type: tierName,
        license_exclusivity: isExclusive ? 'Exclusiva' : 'No Exclusiva',
        license_exclusivity_lower: isExclusive ? 'exclusiva' : 'no exclusiva',
        clause_rescission_rules: clause_rescission_rules,
        clause_content_id_rules: clause_content_id_rules
    };

    // Leer campos personalizados de la barra lateral
    const customContainer = document.getElementById('custom-fields-container');
    if (customContainer) {
        const rows = customContainer.querySelectorAll('.custom-field-row');
        rows.forEach(row => {
            const tagInput = row.querySelector('.field-tag');
            const valInput = row.querySelector('.field-value');
            if (tagInput && valInput) {
                const key = tagInput.value.trim().toLowerCase();
                if (key) {
                    vars[key] = valInput.value;
                }
            }
        });
    }

    // Compilar Markdown
    let md = activeTemplate.markdown.replace(/\{\{(\w+)\}\}/g, (match, tag) => {
        const tagLower = tag.toLowerCase();
        return tagLower in vars ? vars[tagLower] : match;
    });

    // Compilar HTML
    const t = TRANSLATIONS[currentLang] || {};
    const isMonarco = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('monarco'));
    const isSossa = (window.currentUserIsAdmin || (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')));
    const hasCustomLogo = window.currentUserIsPro && producerConfig.logoBase64;
    const logoHtml = hasCustomLogo
            ? `<div style="text-align: center; margin-bottom: 15px;"><img src="${producerConfig.logoBase64}" alt="Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
            : (isMonarco
                ? `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">CG MONARCO</div>` 
                : (isSossa 
                    ? `<div style="text-align: center; margin-bottom: 15px;"><img src="/logo-sossa.png" alt="SOSSA Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
                    : `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">${(producerConfig.aka || 'PRODUCTOR').toUpperCase()}</div>`
                  )
              );

    const bodyHtml = parseMarkdownToHTML(md);

    // Determinar firmas requeridas
    const needsBuyerSignature = (activeTemplateId === 'split_sheet' || activeTemplateId === 'coproduccion' || isExclusive);
    
    let signatureRoleL = t.producerRole || 'El Licenciante (Productor)';
    let signatureNameL = producerConfig.name;
    let signatureIdL = `${t.buyerId || 'Identificación/RUT:'} ${producerConfig.id || "0803743111"}`;
    let signatureAkaL = `AKA: ${producerConfig.aka}`;
    
    if (activeTemplateId === 'coproduccion') {
        signatureRoleL = 'Productor Principal';
    }
    
    let signatureRoleR = t.buyerRole || 'El Licenciatario (Usuario)';
    let signatureNameR = buyerName;
    let signatureIdR = `${t.buyerId || 'Identificación/RUT:'} ${buyerId}`;
    
    if (activeTemplateId === 'coproduccion') {
        signatureRoleR = 'Coproductor / Colaborador';
    } else if (activeTemplateId === 'split_sheet') {
        signatureRoleR = 'Autor/Letra/Voz';
    }

    const signatureLeftHtml = `
        <div class="signature-block">
            <div class="signature-img-wrap">
                ${producerConfig.signature
                    ? `<img src="${producerConfig.signature}" alt="Firma ${producerConfig.aka}" class="signature-img">`
                    : (isMonarco 
                        ? `<img src="/firma-cgmonarco.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                        : (isSossa
                            ? `<img src="/firma-sossa.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                            : `<div class="signature-placeholder" style="font-family:'Brush Script MT', cursive; font-size:24px; color:var(--accent); text-align:center; padding-top:15px; border-bottom:1px solid #718096; width:150px; margin:0 auto;">${producerConfig.name}</div>`
                          )
                      )
                }
            </div>
            <div class="signature-line"></div>
            <div class="signature-role">${signatureRoleL}</div>
            <div class="signature-name">${signatureNameL}</div>
            <div class="signature-aka">${signatureIdL}</div>
            <div class="signature-aka">${signatureAkaL}</div>
        </div>
    `;
    
    const signatureRightHtml = needsBuyerSignature ? `
        <div class="signature-block">
            <div class="signature-img-wrap">
                <!-- Espacio en blanco reservado para alineación de firmas -->
            </div>
            <div class="signature-line"></div>
            <div class="signature-role">${signatureRoleR}</div>
            <div class="signature-name">${signatureNameR}</div>
            <div class="signature-aka">${signatureIdR}</div>
            <div class="signature-aka">${t.buyerSignatureDocusign || 'Firma vía DocuSign'}</div>
        </div>
    ` : '';

    let html = `
        <div class="contract-doc">
            ${isSossa 
                ? `<div class="contract-watermark" style="background-image: url('/logo-sossa.png');"></div>` 
                : (!window.currentUserIsPro ? `<div class="contract-watermark free-watermark"></div>` : '')
            }
            <div class="doc-header" style="text-align: center; margin-bottom: 30px;">
                <div class="doc-logo-container" style="margin-bottom: 15px;">
                    ${logoHtml}
                </div>
            </div>
            
            <div class="doc-body">
                ${bodyHtml}
            </div>

            <div class="signature-section" style="margin-top: 30px;">
                ${signatureLeftHtml}
                ${signatureRightHtml}
            </div>
            
            <div class="digital-seal-container" style="margin-top: 25px;">
                <div class="digital-seal">
                    <div class="seal-icon">✓</div>
                    <div class="seal-text">
                        <strong>${t.sealVerified || 'DOCUMENTO INTEGRAL VERIFICADO'}</strong><br>
                        ${t.sealRef || 'Ref:'} ${refCode}<br>
                        ${t.sealStatus || 'Estado: Firmado y Vigente'}
                    </div>
                </div>
            </div>
            
            <hr style="margin: 15px 0;">
            
            <div class="doc-footer" style="text-align: center; font-size: 11px; color: #8a91a6;">
                <p><em>${t.footerText || 'Este documento fue generado por la plataforma BEATSS.'} ${tierName} — ${producerConfig.aka} ${effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear()}.</em></p>
            </div>
        </div>
    `;

    return { md, html };
}

// Actualizar la previsualización en vivo en la pantalla
function generatePreview() {
    const { md, html } = compileContract();
    
    // Inyectar en el HTML renderizado
    document.getElementById('rendered-contract-content').innerHTML = html;
    
    // Inyectar en el contenedor de Markdown
    document.getElementById('markdown-contract-content').textContent = md;
    
    // Guardar borrador del formulario
    saveFormDraft();
}

// Descargar el contrato en PDF usando html2pdf.js
function downloadPDF() {
    const refCode = document.getElementById('ref-code').value.trim();
    const isNew = !licenseHistory.some(l => l.refCode === refCode);
    if (isNew && checkPlanLimitExceeded('descargar esta nueva licencia')) {
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();

    const btn = document.getElementById('btn-download-pdf');
    const originalText = btn.innerHTML;

    if (typeof html2pdf === 'undefined') {
        showToast('La librería PDF no está cargada. Por favor, conéctate a Internet y vuelve a intentarlo.', true);
        return;
    }

    const beatName = document.getElementById('beat-name').value.trim() || "Beat";
    const buyerName = document.getElementById('buyer-name').value.trim() || "Comprador";
    const type = getActiveLicenseType();
    const finalRef = refCode || "REF";
    
    // Auto-guardar en historial al descargar si tiene nombre de comprador
    const buyerNameField = document.getElementById('buyer-name').value.trim();
    if (buyerNameField) {
        saveCurrentLicenseToHistory(true);
    }

    const element = document.getElementById('rendered-contract-content');
    
    // Configuración para html2pdf
    const opt = {
        margin:       [15, 20, 15, 20], // Margen en mm [arriba, izquierda, abajo, derecha]
        filename:     `Licencia_${type.toUpperCase()}_${finalRef} - ${beatName} - ${buyerName}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
    };
    
    // Mostrar cargando en el botón
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Generando PDF...';
    safeCreateIcons();
    btn.disabled = true;

    // Generar PDF y guardarlo
    const worker = html2pdf().from(element).set(opt);

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        worker.outputPdf('datauristring').then(async (pdfDataUri) => {
            try {
                // Guardar en el servidor local (Carpeta Documentos/Licencias)
                const res = await fetch('/api/save-pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: opt.filename,
                        pdfData: pdfDataUri
                    })
                });
                if (res.ok) {
                    showToast('📄 PDF guardado directamente en Documentos/Licencias');
                } else {
                    console.warn('Error al guardar PDF en servidor local, forzando descarga web...');
                    // Fallback a descarga nativa
                    await worker.save();
                }
            } catch (e) {
                console.warn('Error de conexión con el servidor local para guardar PDF:', e);
                // Fallback a descarga nativa
                await worker.save();
            } finally {
                btn.innerHTML = originalText;
                btn.disabled = false;
                safeCreateIcons();
            }
        }).catch(err => {
            console.error('Error al generar PDF:', err);
            btn.innerHTML = originalText;
            btn.disabled = false;
            safeCreateIcons();
            showToast('Error al generar el PDF', true);
        });
    } else {
        // En producción / Vercel: Descarga nativa del navegador
        worker.save().then(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
            safeCreateIcons();
            showToast('PDF descargado con éxito');
        }).catch(err => {
            console.error('Error al generar PDF:', err);
            btn.innerHTML = originalText;
            btn.disabled = false;
            safeCreateIcons();
            showToast('Error al generar el PDF', true);
        });
    }
}

// Copiar formato markdown al portapapeles
function copyMarkdown() {
    const text = document.getElementById('markdown-contract-content').textContent;
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('Contrato copiado al portapapeles en formato Markdown');
        })
        .catch(err => {
            console.error('Error al copiar:', err);
            showToast('No se pudo copiar el contrato', true);
        });
}

// Guardar licencia actual en el historial de localStorage
function saveCurrentLicenseToHistory(silent = false) {
    // Guardar contacto automáticamente
    autoSaveContact();

    const beatName = document.getElementById('beat-name').value.trim();
    const buyerName = document.getElementById('buyer-name').value.trim();
    const value = parseFloat(document.getElementById('license-value').value) || 0;
    const refCode = document.getElementById('ref-code').value.trim();
    const effectiveDate = document.getElementById('effective-date').value;
    const type = getActiveLicenseType();

    if (!buyerName) {
        if (silent !== true) {
            showToast('Por favor escribe el nombre de quien compra antes de guardar', true);
        }
        return;
    }

    const licenseData = {
        refCode,
        date: effectiveDate,
        beatName,
        buyerName,
        type,
        value,
        paymentMethod: document.getElementById('payment-method').value,
        audioLinks: {
            mp3: document.getElementById('audio-link-mp3').value.trim(),
            wav: document.getElementById('audio-link-wav').value.trim(),
            stems: document.getElementById('audio-link-stems').value.trim()
        },
        formData: {
            buyerId: document.getElementById('buyer-id').value.trim(),
            buyerEmail: document.getElementById('buyer-email').value.trim(),
            buyerPhone: document.getElementById('buyer-phone').value.trim(),
            buyerCity: document.getElementById('buyer-city').value.trim(),
            buyerCountry: document.getElementById('buyer-country').value.trim(),
            celebrationPlace: document.getElementById('celebration-place').value.trim(),
            formats: document.getElementById('clause-formats').value.trim(),
            streams: document.getElementById('clause-streams').value.trim(),
            physical: document.getElementById('clause-physical').value.trim(),
            videos: document.getElementById('clause-videos').value.trim(),
            videoDuration: document.getElementById('clause-video-duration').value.trim(),
            years: document.getElementById('clause-years').value.trim(),
            terminationFee: document.getElementById('clause-termination-fee').value.trim(),
            writerShare: document.getElementById('clause-writer-share').value,
            producerShare: document.getElementById('clause-producer-share').value,
            credits: document.getElementById('clause-credits').value.trim(),
            contentId: document.getElementById('clause-content-id').checked
        }
    };

    const isSilent = silent === true;

    // Verificar si ya existe una con ese mismo código de referencia para actualizarla
    const index = licenseHistory.findIndex(l => l.refCode === refCode);
    if (index !== -1) {
        licenseHistory[index] = licenseData;
        if (!isSilent) showToast('Licencia actualizada en el historial');
    } else {
        // Límite del Plan Inicial
        if (checkPlanLimitExceeded('guardar esta nueva licencia en el historial')) {
            return;
        }
        licenseHistory.unshift(licenseData);
        if (!isSilent) showToast('Licencia guardada en el historial');
    }

    saveHistory();
}

// Actualizar tabla del historial
function updateHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const emptyEl = document.getElementById('history-empty');
    const badgeEl = document.getElementById('history-count');
    const statsContainer = document.getElementById('history-stats-container');
    
    tbody.innerHTML = '';
    badgeEl.textContent = licenseHistory.length;

    if (licenseHistory.length === 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = 'No hay licencias registradas';
        emptyEl.querySelector('p').textContent = 'Las licencias que guardes aparecerán en esta lista para descargarlas o copiarlas rápidamente.';
        document.querySelector('.history-table').style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    document.querySelector('.history-table').style.display = 'table';

    if (statsContainer) {
        statsContainer.style.display = 'grid';
        const totalCollected = licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
        document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
        document.getElementById('stat-total-licenses').textContent = licenseHistory.length;
        const avg = licenseHistory.length > 0 ? (totalCollected / licenseHistory.length) : 0;
        document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;

        // ── Promedio Mensual ─────────────────────────────────────────────
        const monthlyMap = {};
        licenseHistory.forEach(lic => {
            if (!lic.date) return;
            const monthKey = lic.date.slice(0, 7); // "2026-04"
            if (!monthlyMap[monthKey]) monthlyMap[monthKey] = 0;
            monthlyMap[monthKey] += Number(lic.value) || 0;
        });
        const activeMonths = Object.keys(monthlyMap).length;
        const monthlyAvg = activeMonths > 0 ? (totalCollected / activeMonths) : 0;
        const monthlyAvgEl = document.getElementById('stat-monthly-avg');
        const monthlyMonthsEl = document.getElementById('stat-monthly-months');
        if (monthlyAvgEl) monthlyAvgEl.textContent = `$${monthlyAvg.toFixed(2)}`;
        if (monthlyMonthsEl) monthlyMonthsEl.textContent = activeMonths === 1 ? '1 mes activo' : `${activeMonths} meses activos`;

        // ── Renderizar Gráfico de Ventas (Chart.js) ──────────────────────
        const chartContainer = document.getElementById('history-chart-container');
        if (chartContainer && window.Chart) {
            chartContainer.style.display = 'block';
            const ctx = document.getElementById('salesChart').getContext('2d');
            
            // Ordenar cronológicamente
            const sortedMonths = Object.keys(monthlyMap).sort();
            const dataValues = sortedMonths.map(m => monthlyMap[m]);
            
            // Formatear etiquetas de mes (ej. "2026-04" -> "Abr 2026")
            const labels = sortedMonths.map(m => {
                const [year, month] = m.split('-');
                const date = new Date(year, parseInt(month) - 1);
                return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' });
            });

            if (salesChartInstance) {
                salesChartInstance.data.labels = labels;
                salesChartInstance.data.datasets[0].data = dataValues;
                salesChartInstance.update();
            } else {
                salesChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Ingresos Mensuales ($)',
                            data: dataValues,
                            borderColor: '#00e676',
                            backgroundColor: 'rgba(0, 230, 118, 0.2)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: {
                                beginAtZero: true,
                                ticks: {
                                    callback: function(value) {
                                        return '$' + value;
                                    }
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            }
                        }
                    }
                });
            }
        }
    }

    licenseHistory.forEach(lic => {
        const tr = document.createElement('tr');

        const typeLabels = {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Prem. Plus',
            unlimited_flp: 'Ilim. + FLP',
            unlimited: 'Ilimitada',
            exclusive: 'Exclusiva'
        };
        const typeKey = lic.type || 'basic';
        const licenseValue = Number(lic.value) || 0;
        tr.dataset.value = licenseValue;

        // Sanitize: usar textContent para datos de usuario, evitar XSS
        const refCode = lic.refCode || '';
        const date    = lic.date || '';
        const beat    = lic.beatName || '';
        const buyer   = lic.buyerName || '';

        const tdRef   = document.createElement('td'); tdRef.dataset.label = 'Referencia';
        const spanRef = document.createElement('span'); spanRef.className = 'ref-code-cell'; spanRef.title = refCode; spanRef.textContent = refCode;
        tdRef.appendChild(spanRef);

        const tdDate = document.createElement('td'); tdDate.dataset.label = 'Fecha'; tdDate.textContent = date;
        const tdBeat = document.createElement('td'); tdBeat.dataset.label = 'Beat';
        const strongBeat = document.createElement('strong'); strongBeat.textContent = beat; tdBeat.appendChild(strongBeat);
        const tdBuyer = document.createElement('td'); tdBuyer.dataset.label = 'Comprador'; tdBuyer.textContent = buyer;

        const tdType  = document.createElement('td'); tdType.dataset.label = 'Tipo';
        const spanType = document.createElement('span'); spanType.className = `type-badge ${typeKey}`; spanType.textContent = typeLabels[typeKey] || typeKey;
        tdType.appendChild(spanType);

        const tdValue = document.createElement('td'); tdValue.dataset.label = 'Valor'; tdValue.textContent = `$${licenseValue.toFixed(2)}`;

        const tdActions = document.createElement('td'); tdActions.className = 'actions-cell';
        const safeRef = refCode.replace(/"/g, '&quot;');
        tdActions.innerHTML = `
            <button class="btn-icon-only btn-row-load" data-ref="${safeRef}" title="Cargar en el editor"><i data-lucide="edit-3"></i></button>
            <button class="btn-icon-only btn-row-pdf" data-ref="${safeRef}" title="Descargar PDF"><i data-lucide="file-text"></i></button>
            <button class="btn-icon-only btn-row-delete text-danger tooltip-left" data-ref="${safeRef}" title="Eliminar"><i data-lucide="trash-2"></i></button>
        `;

        tr.appendChild(tdRef); tr.appendChild(tdDate); tr.appendChild(tdBeat);
        tr.appendChild(tdBuyer); tr.appendChild(tdType); tr.appendChild(tdValue); tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    safeCreateIcons();
    setupHistoryRowEvents();
    initTooltips();
}

// Eventos para botones dentro del historial
function setupHistoryRowEvents() {
    // Cargar en el editor
    document.querySelectorAll('.btn-row-load').forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.dataset.ref;
            const lic = licenseHistory.find(l => l.refCode === ref);
            if (lic) {
                loadLicenseIntoEditor(lic);
                // Cambiar a la pestaña de previsualización
                document.querySelector('.tab-btn[data-tab="tab-preview"]').click();
                showToast(`Licencia ${lic.refCode} cargada en el editor`);
            }
        });
    });

    // Descargar PDF del historial directamente
    document.querySelectorAll('.btn-row-pdf').forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.dataset.ref;
            const lic = licenseHistory.find(l => l.refCode === ref);
            if (lic) {
                // Cargar temporalmente, generar y descargar
                loadLicenseIntoEditor(lic);
                downloadPDF();
            }
        });
    });

    // Eliminar fila
    document.querySelectorAll('.btn-row-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ref = btn.dataset.ref;
            if (confirm(`¿Estás seguro de eliminar la licencia con referencia ${ref}?`)) {
                licenseHistory = licenseHistory.filter(l => l.refCode !== ref);
                saveHistory();
                showToast('Licencia eliminada del historial');

                // Eliminar de Firestore
                if (ref) {
                    try {
                        const licDocRef = doc(db, "users", window.currentUser, "licencias", ref);
                        await deleteDoc(licDocRef);
                    } catch (err) {
                        console.error("Error al eliminar licencia de Firestore:", err);
                    }
                }
            }
        });
    });

    // Sincronizar y actualizar el dashboard de ventas
    updateDashboardView();
}

// Cargar datos de licencia al editor
function loadLicenseIntoEditor(lic) {
    // Activar botón de tipo de licencia correspondiente
    document.querySelectorAll('.license-btn').forEach(btn => {
        if (btn.dataset.type === lic.type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const fd = lic.formData || {};

    // Llenar inputs principales
    document.getElementById('beat-name').value = lic.beatName || "";
    document.getElementById('buyer-name').value = lic.buyerName || "";
    document.getElementById('buyer-email').value = fd.buyerEmail || lic.buyerEmail || "";
    document.getElementById('buyer-phone').value = fd.buyerPhone || lic.buyerPhone || "";
    document.getElementById('buyer-id').value = fd.buyerId || lic.buyerId || "";
    document.getElementById('license-value').value = lic.value !== undefined ? lic.value : 29.99;
    document.getElementById('buyer-city').value = fd.buyerCity || lic.buyerCity || "";
    document.getElementById('buyer-country').value = fd.buyerCountry || lic.buyerCountry || "Ecuador";
    document.getElementById('ref-code').value = lic.refCode || "";
    document.getElementById('effective-date').value = lic.date || "";
    document.getElementById('celebration-place').value = fd.celebrationPlace || lic.celebrationPlace || "";
    document.getElementById('payment-method').value = lic.paymentMethod || "Transferencia Bancaria";

    // Llenar enlaces de audio
    const al = lic.audioLinks || {};
    document.getElementById('audio-link-mp3').value = al.mp3 || "";
    document.getElementById('audio-link-wav').value = al.wav || "";
    document.getElementById('audio-link-stems').value = al.stems || "";

    // Llenar avanzados
    document.getElementById('clause-formats').value = fd.formats || "";
    document.getElementById('clause-streams').value = fd.streams || "";
    document.getElementById('clause-physical').value = fd.physical || "";
    document.getElementById('clause-videos').value = fd.videos || "";
    document.getElementById('clause-video-duration').value = fd.videoDuration || "";
    document.getElementById('clause-years').value = fd.years || "";
    document.getElementById('clause-termination-fee').value = fd.terminationFee || "";
    document.getElementById('clause-writer-share').value = fd.writerShare !== undefined ? fd.writerShare : 50;
    document.getElementById('clause-producer-share').value = fd.producerShare !== undefined ? fd.producerShare : 50;
    document.getElementById('clause-credits').value = fd.credits || "";
    document.getElementById('clause-content-id').checked = fd.contentId !== undefined ? fd.contentId : true;

    generatePreview();
}

// Borrar todo el historial
async function clearAllHistory() {
    if (confirm('¿Estás seguro de que deseas eliminar todo el historial?')) {
        try { localStorage.removeItem(`${window.currentUser}_license_history`); } catch(e) {}
        
        // Eliminar todos de Firestore en users/{uid}/licencias
        const colRef = collection(db, "users", window.currentUser, "licencias");
        try {
            const querySnapshot = await getDocs(colRef);
            const deletePromises = [];
            querySnapshot.forEach((docSnap) => {
                deletePromises.push(deleteDoc(docSnap.ref));
            });
            await Promise.all(deletePromises);
        } catch (err) {
            console.error("Error al borrar historial en Firestore:", err);
        }
        
        licenseHistory = [];
        await loadHistory(); // reinyecta semillas solo para sossa
        showToast('Historial borrado con éxito.');
    }
}

// Filtrar historial por texto (búsqueda)
function filterHistory(e) {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#history-table-body tr');
    let matches = 0;
    let filteredTotal = 0;

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const value = Number(row.dataset.value) || 0;
        if (text.includes(query)) {
            row.style.display = 'table-row';
            matches++;
            filteredTotal += value;
        } else {
            row.style.display = 'none';
        }
    });

    const tableEl = document.querySelector('.history-table');
    const emptyEl = document.getElementById('history-empty');
    const statsContainer = document.getElementById('history-stats-container');

    // Actualizar tarjetas de estadísticas en base al filtro en tiempo real
    if (statsContainer && licenseHistory.length > 0) {
        if (query !== '') {
            document.getElementById('stat-total-collected').textContent = `$${filteredTotal.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = `${matches} (filtradas)`;
            const avg = matches > 0 ? (filteredTotal / matches) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        } else {
            const totalCollected = licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
            document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = licenseHistory.length;
            const avg = licenseHistory.length > 0 ? (totalCollected / licenseHistory.length) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        }
    }

    if (matches === 0 && licenseHistory.length > 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = 'No se encontraron resultados';
        emptyEl.querySelector('p').textContent = 'Prueba con otra palabra clave o limpia el buscador.';
        tableEl.style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
    } else if (licenseHistory.length > 0) {
        emptyEl.style.display = 'none';
        tableEl.style.display = 'table';
        if (statsContainer) statsContainer.style.display = 'grid';
    }
}

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
// Exponer como global para uso en onclick inline
window.showToast = showToast;

// Exportar historial de licencias a formato CSV para Excel
function exportHistoryToCSV() {
    if (licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    
    // Cabecera del CSV con BOM UTF-8 para compatibilidad de acentos en Excel
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Referencia,Fecha,Beat,Comprador,Cedula DNI,Email,Telefono,Ciudad,Pais,Tipo Licencia,Valor USD,Metodo Pago\r\n";
    
    licenseHistory.forEach(lic => {
        const fd = lic.formData || {};
        const beatName = lic.beatName || "";
        const buyerName = lic.buyerName || "";
        const type = lic.type || "basic";
        const val = lic.value !== undefined ? lic.value : 0;

        const row = [
            lic.refCode || "",
            lic.date || "",
            `"${beatName.replace(/"/g, '""')}"`,
            `"${buyerName.replace(/"/g, '""')}"`,
            `"${(fd.buyerId || lic.buyerId || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerEmail || lic.buyerEmail || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerPhone || lic.buyerPhone || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerCity || lic.buyerCity || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerCountry || lic.buyerCountry || '').replace(/"/g, '""')}"`,
            type.toUpperCase(),
            val,
            lic.paymentMethod || "Transferencia Bancaria"
        ].join(",");
        csvContent += row + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Contabilidad_Licencias_${producerConfig.aka}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Historial exportado para Excel con éxito');
}

// Exportar historial completo como JSON (backup)
function exportHistoryToJSON() {
    if (licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    const jsonStr = JSON.stringify(licenseHistory, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Historial_Licencias_${producerConfig.aka}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Historial exportado como JSON con éxito');
}


// ==========================================================================
// IMPORTACIÓN DE PDFs — LEE TEXTO CON PDF.js + FALLBACK POR NOMBRE
// ==========================================================================

async function handleFolderImport(filesList) {
    if (!filesList || filesList.length === 0) {
        showToast('No se seleccionaron archivos', true);
        return;
    }

    const pdfFiles = Array.from(filesList).filter(f =>
        f.name.split('.').pop().toLowerCase() === 'pdf'
    );

    if (pdfFiles.length === 0) {
        showToast('No se encontraron archivos PDF en la carpeta', true);
        document.getElementById('folder-import-input').value = '';
        return;
    }

    showToast(`Leyendo ${pdfFiles.length} PDF(s)...`);

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const file of pdfFiles) {
        try {
            const fileDate = new Date(file.lastModified).toISOString().split('T')[0];
            let lic = null;

            // Intentar 1: leer el texto del PDF con PDF.js
            try {
                const text = await extractPdfText(file);
                if (text && text.length > 100) {
                    lic = parsePdfText(text, fileDate);
                }
            } catch (e) {
                console.warn('PDF.js no pudo leer:', file.name, e);
            }

            // Intentar 2: fallback por nombre de archivo
            if (!lic) {
                lic = parsePdfFilename(file.name, fileDate);
            }

            if (lic && lic.refCode && lic.buyerName && lic.beatName) {
                const existingIdx = licenseHistory.findIndex(l => l.refCode === lic.refCode);
                if (existingIdx !== -1) {
                    licenseHistory[existingIdx] = lic;
                    duplicateCount++;
                } else {
                    licenseHistory.push(lic);
                    importedCount++;
                }
            } else {
                console.warn('No se pudo interpretar:', file.name);
                errorCount++;
            }
        } catch (err) {
            console.error('Error procesando', file.name, err);
            errorCount++;
        }
    }

    if (importedCount > 0 || duplicateCount > 0) {
        saveHistory();
        updateHistoryTable();
        let msg = `Importación finalizada. `;
        if (importedCount > 0) msg += `Añadidas ${importedCount}. `;
        if (duplicateCount > 0) msg += `Actualizadas ${duplicateCount}. `;
        if (errorCount > 0) msg += `${errorCount} no reconocidos.`;
        showToast(msg);
    } else {
        showToast('No se pudo interpretar ningún PDF', true);
    }

    document.getElementById('folder-import-input').value = '';
}

// Variables globales para el ZIP cargado temporalmente
let selectedZipPdfEntries = [];
let isAnalyzingZip = false;

// Manejar la selección del archivo ZIP
async function handleZipSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusPanel = document.getElementById('zip-status-panel');
    const statusText = document.getElementById('zip-status-text');

    try {
        statusPanel.style.display = 'block';
        statusText.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i> Leyendo archivo ZIP...';
        safeCreateIcons();

        // Cargar ZIP usando la librería JSZip
        if (typeof JSZip === 'undefined') {
            throw new Error('Librería JSZip no cargada. Revisa tu conexión a internet.');
        }

        const zip = await JSZip.loadAsync(file);
        selectedZipPdfEntries = [];

        // Buscar todos los PDFs dentro del ZIP
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && relativePath.split('.').pop().toLowerCase() === 'pdf') {
                selectedZipPdfEntries.push(zipEntry);
            }
        });

        if (selectedZipPdfEntries.length === 0) {
            statusText.innerText = '⚠️ No se encontraron archivos PDF dentro del archivo ZIP.';
            document.getElementById('btn-analyze-zip').style.display = 'none';
        } else {
            statusText.innerText = `📦 Se encontraron ${selectedZipPdfEntries.length} archivo(s) PDF de licencias en el ZIP.`;
            document.getElementById('btn-analyze-zip').style.display = 'block';
        }
    } catch (err) {
        console.error('Error al abrir el ZIP:', err);
        statusText.innerText = '❌ Error al leer el archivo ZIP: ' + err.message;
        document.getElementById('btn-analyze-zip').style.display = 'none';
    } finally {
        safeCreateIcons();
    }
}

// Analizar y cargar los PDFs del ZIP
async function analyzeSelectedZip() {
    if (selectedZipPdfEntries.length === 0 || isAnalyzingZip) return;

    isAnalyzingZip = true;
    const btn = document.getElementById('btn-analyze-zip');
    const originalText = btn.innerHTML;
    const statusText = document.getElementById('zip-status-text');

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:12px;height:12px;margin-right:4px;"></i> Analizando...';
    safeCreateIcons();

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selectedZipPdfEntries.length; i++) {
        const entry = selectedZipPdfEntries[i];
        statusText.innerText = `⏳ Analizando archivo ${i + 1} de ${selectedZipPdfEntries.length}: ${entry.name.split('/').pop()}`;
        
        try {
            // Leer el archivo como ArrayBuffer
            const arrayBuffer = await entry.async('arraybuffer');
            const fileDate = new Date().toISOString().split('T')[0]; // fecha por defecto
            
            let lic = null;

            // Intentar 1: leer el texto del PDF con PDF.js
            try {
                if (typeof pdfjsLib !== 'undefined') {
                    // Configurar worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let fullText = '';
                    for (let pIdx = 1; pIdx <= Math.min(pdf.numPages, 4); pIdx++) {
                        const page = await pdf.getPage(pIdx);
                        const content = await page.getTextContent();
                        const pageText = content.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    
                    if (fullText && fullText.length > 100) {
                        lic = parsePdfText(fullText, fileDate);
                    }
                }
            } catch (e) {
                console.warn('PDF.js no pudo leer del ZIP:', entry.name, e);
            }

            // Intentar 2: fallback por nombre de archivo
            if (!lic) {
                const baseFilename = entry.name.split('/').pop();
                lic = parsePdfFilename(baseFilename, fileDate);
            }

            if (lic && lic.refCode && lic.buyerName && lic.beatName) {
                const existingIdx = licenseHistory.findIndex(l => l.refCode === lic.refCode);
                if (existingIdx !== -1) {
                    licenseHistory[existingIdx] = lic;
                    duplicateCount++;
                } else {
                    licenseHistory.push(lic);
                    importedCount++;
                }
            } else {
                console.warn('No se pudo interpretar la licencia del ZIP:', entry.name);
                errorCount++;
            }
        } catch (err) {
            console.error('Error procesando entrada del ZIP:', entry.name, err);
            errorCount++;
        }
    }

    // Guardar cambios e informar
    if (importedCount > 0 || duplicateCount > 0) {
        saveHistory();
        let msg = `Análisis de ZIP finalizado. `;
        if (importedCount > 0) msg += `Añadidas ${importedCount}. `;
        if (duplicateCount > 0) msg += `Actualizadas ${duplicateCount}. `;
        if (errorCount > 0) msg += `${errorCount} no reconocidos.`;
        showToast(msg);
        statusText.innerHTML = `✅ ¡Análisis completado! Añadidas: ${importedCount}, Actualizadas: ${duplicateCount}, Errores: ${errorCount}`;
    } else {
        showToast('No se pudo interpretar ningún PDF del ZIP', true);
        statusText.innerHTML = `⚠️ No se cargó ninguna licencia. Errores: ${errorCount}`;
    }

    // Resetear
    selectedZipPdfEntries = [];
    document.getElementById('input-import-zip').value = '';
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.display = 'none';
    isAnalyzingZip = false;
    safeCreateIcons();
}

// Extraer todo el texto de un PDF usando PDF.js
async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') return null;

    // Configurar worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

// Parsear texto de contrato extraído del PDF
// Funciona con: sossa.pdf, LICENCIA 60$.pdf, contratos en español e inglés
function parsePdfText(text, fileDate) {
    const t = text;

    // ── TIPO DE LICENCIA ─────────────────────────────────────────
    let type = 'basic';
    if (/premium[\s_]?plus/i.test(t)) type = 'premium_plus';
    else if (/premium/i.test(t))   type = 'premium';
    if (/ilimitad|unlimited/i.test(t)) type = 'unlimited_flp';
    if (/exclusiv/i.test(t))  type = 'exclusive';

    // ── BEAT NAME ────────────────────────────────────────────────
    let beatName = '';
    const beatPatterns = [
        // Formato exclusivo: LICENCIA EXCLUSIVA BANDIDAJE Y TRIP en encabezado
        /LICENCIA EXCLUSIVA\s+([A-ZÁÉÍÓÚ][^"\n]{2,50})/i,
        // Formato estándar español: titulado "Beat"
        /titulado\s+["«]([^"»\n]+)["»]/i,
        // Formato exclusivo: composiciones tituladas "X" y "Y"
        /composiciones? musicales? tituladas?\s+["«]([^"»\n]+)["»]/i,
        // Formato inglés: entitled Beat
        /entitled\s+([^\s(\n]+)/i,
        // Formato fallback: la Obra "..."
        /la Obra\s+["«]([^"»\n]+)["»]/i,
        /Explotaci[oó]n de la Obra\s+"([^"]+)"/i,
        // Beat: "nombre" — capturer genérico
        /[Bb]eat["\s:]+["«]?([^"»\n,\.]{2,40})["»]?/i,
    ];
    for (const p of beatPatterns) {
        const m = t.match(p);
        if (m && m[1].trim().length > 1) { beatName = m[1].trim(); break; }
    }

    // ── COMPRADOR / ARTISTA ───────────────────────────────────────
    let buyerName = '';
    const buyerPatterns = [
        // Formato exclusivo: "Sossa ... y NOMBRE ( el "Artista")"
        /[Ss]ossa[^\n]*?y\s+([A-ZÁÉÍÓÚ][a-záéíóúA-Z][^(\n]{5,50})\s*\(/,
        // Formato exclusivo: "Acuerdo entre: Sossa ... y Nombre"
        /Acuerdo entre[:\s]+[^\n]+?y\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+){1,4})/i,
        // Formato estándar español
        /El Licenciatario \(Usuario\):\*\*\s+([^,\n]+)/i,
        // Formato inglés
        /Licensee \(Artist\):\s+\[?([^\]\n]+)\]?/i,
        // Licenciatario genérico
        /Licenciatario[^:]*:\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+){1,4})/,
    ];
    for (const p of buyerPatterns) {
        const m = t.match(p);
        if (m) {
            buyerName = (m[1] || m[0]).trim()
                .replace(/\*+/g, '').replace(/^\[|\]$/g, '').trim();
            if (buyerName.length > 3) break;
        }
    }

    // ── CEDULA / ID ───────────────────────────────────────────────
    let buyerId = '';
    const idMatch = t.match(/identidad Nro\.?\s+([\d\w-]+)/i) ||
                    t.match(/C[eé]dula[:\s]+(\d{6,12})/i);
    if (idMatch) buyerId = idMatch[1].trim();

    // ── EMAIL ─────────────────────────────────────────────────────
    let buyerEmail = '';
    const emailMatch = t.match(/correo electr[oó]nico[^:]*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) buyerEmail = emailMatch[1].trim();

    // ── CIUDAD / PAÍS ─────────────────────────────────────────────
    let buyerCity = '', buyerCountry = '';
    const cityMatch = t.match(/ciudad de ([^,\n]+),\s*([A-Z][a-záéíóú]+)/i);
    if (cityMatch) { buyerCity = cityMatch[1].trim(); buyerCountry = cityMatch[2].trim(); }

    // ── LUGAR DE CELEBRACIÓN ──────────────────────────────────────
    let celebrationPlace = '';
    const placeMatch = t.match(/Lugar de Celebraci[oó]n[*:\s]+([^\n*]+)/i);
    if (placeMatch) celebrationPlace = placeMatch[1].trim();

    // ── FECHA ─────────────────────────────────────────────────────
    let date = fileDate;
    const datePatterns = [
        /Fecha de Entrada en Vigor[*:\s]+([^\n*]+)/i,
        /Effective Date:\s+([^\n]+)/i,
        /having been made on and effective as of\s+([^-\n]+)/i,
    ];
    for (const p of datePatterns) {
        const m = t.match(p);
        if (m) { const d = parseEspanolDate(m[1].trim()); if (d) { date = d; break; } }
    }

    // ── VALOR ─────────────────────────────────────────────────────
    let value = LICENSE_CONFIGS[type]?.price || 29.99;
    const valueMatch = t.match(/tarifa[^$]*\$\s*([\d,]+(?:\.\d{2})?)\s*USD/i) ||
                       t.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*USD/i) ||
                       t.match(/License Fee[^$]*\$\s*\[?([\d,]+(?:\.\d{2})?)\]?/i) ||
                       t.match(/cantidad de[^$]*\$\s*([\d.]+)\s*USD/i);
    if (valueMatch) value = parseFloat(valueMatch[1].replace(',', '')) || value;

    // ── LUGAR (exclusivo usa "leyes de CIUDAD") ───────────────────
    if (!celebrationPlace) {
        const lawMatch = t.match(/leyes de ([^,\n]+),\s*([A-Z]+)/i);
        if (lawMatch) celebrationPlace = `${lawMatch[1].trim()}, ${lawMatch[2].trim()}`;
    }

    // ── CÓDIGO DE REFERENCIA ──────────────────────────────────────
    let refCode = '';
    const refMatch = t.match(/Invoice\s*#\s*([A-Za-z0-9_\-]+)/i) ||
                     t.match(/C[oó]digo de Referencia[^#]*#\s*([A-Za-z0-9_\-]+)/i) ||
                     t.match(/(LIC-[A-Z]+-\d{8}-\d+)/i);
    if (refMatch) refCode = refMatch[1].trim();
    if (!refCode) refCode = generateReferenceCode(type);

    // ── MÉTODO DE PAGO ────────────────────────────────────────────
    let paymentMethod = 'Transferencia Bancaria';
    const payMatch = t.match(/M[eé]todo de Pago[*:\s]+([^\n*]+)/i);
    if (payMatch) paymentMethod = payMatch[1].trim();

    // Validación mínima
    if (!beatName || !buyerName) return null;

    const config = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;
    return {
        refCode, date, beatName, buyerName, type, value, paymentMethod,
        formData: {
            buyerId, buyerEmail,
            buyerPhone: '',
            buyerCity, buyerCountry, celebrationPlace,
            formats: config.formats,
            streams: config.streams,
            physical: config.physical,
            videos: config.videos,
            videoDuration: config.videoDuration,
            years: config.years,
            terminationFee: type === 'exclusive'
                ? 'No aplica'
                : `200% ($${(value * 2).toFixed(2)} USD)`,
            writerShare: 50, producerShare: 50,
            credits: config.credits,
            contentId: config.contentId
        }
    };
}

// Convertir fecha en español o inglés a YYYY-MM-DD
function parseEspanolDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const months = {
        enero:'01',february:'02',feb:'02',febrero:'02',march:'03',marzo:'03',
        april:'04',abril:'04',may:'05',mayo:'05',june:'06',junio:'06',
        july:'07',julio:'07',august:'08',agosto:'08',september:'09',
        septiembre:'09',october:'10',octubre:'10',november:'11',noviembre:'11',
        december:'12',diciembre:'12',jan:'01',jun:'06',jul:'07',aug:'08',
        sep:'09',oct:'10',nov:'11',dec:'12'
    };

    // DD de MES de YYYY / Day, DD de MES de YYYY
    const m1 = str.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    if (m1) {
        const mm = months[m1[2].toLowerCase()] || '01';
        return `${m1[3]}-${mm}-${m1[1].padStart(2,'0')}`;
    }
    // Month DD, YYYY (English)
    const m2 = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (m2) {
        const mm = months[m2[1].toLowerCase()] || '01';
        return `${m2[3]}-${mm}-${m2[2].padStart(2,'0')}`;
    }
    // DD/MM/YYYY
    const m3 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m3) return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`;

    return null;
}

// Parsear SOLO por nombre de archivo (fallback)
function parsePdfFilename(filename, fileDate) {
    let name = filename.replace(/\.pdf$/i, '');
    let type = 'basic', refCode = '', beatName = '', buyerName = '', date = fileDate;

    // Formato: Licencia_PREMIUM_LIC-PREM-20260525-2872 - Beat - Comprador
    const m1 = name.match(
        /^Licencia[_ ](BASICA|B[AÁ]SICA|PREMIUM|ILIMITADA|EXCLUSIVA)[_ ](LIC-[A-Z]+-\d{8}-\d+)\s*-\s*(.+?)\s*-\s*(.+)$/i
    );
    if (m1) {
        type = mapTypeWord(m1[1]); refCode = m1[2].trim();
        beatName = m1[3].trim(); buyerName = m1[4].trim();
        date = extractDateFromRefCode(refCode) || fileDate;
        return buildLicenseRecord(refCode, date, beatName, buyerName, type);
    }

    // Formato: Licencia_PREMIUM_LIC-PREM-20260525-2872_Pa_Un_Lao_Comprador
    const parts = name.split('_');
    const refIdx = parts.findIndex(p => /^LIC-[A-Z]+-\d{8}-\d+$/i.test(p));
    if (refIdx !== -1) {
        refCode = parts[refIdx];
        type = mapTypeWord(parts[refIdx - 1] || '');
        date = extractDateFromRefCode(refCode) || fileDate;
        const rem = parts.slice(refIdx + 1).filter(p => p.length > 0);
        if (rem.length >= 5) {
            beatName  = rem.slice(0, rem.length - 4).join(' ');
            buyerName = rem.slice(rem.length - 4).join(' ');
        } else if (rem.length >= 2) {
            const mid = Math.ceil(rem.length / 2);
            beatName = rem.slice(0, mid).join(' ');
            buyerName = rem.slice(mid).join(' ');
        } else {
            beatName = rem[0] || 'Beat'; buyerName = 'Comprador';
        }
        return buildLicenseRecord(refCode, date, beatName, buyerName, type);
    }

    return null;
}

function extractDateFromRefCode(rc) {
    const m = rc.match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function mapTypeWord(w) {
    w = w.toUpperCase();
    if (w.includes('PPLUS')) return 'premium_plus';
    if (w.includes('PREM')) return 'premium';
    if (w.includes('ILIM') || w.includes('ULFLP') || w.includes('UNLIM')) return 'unlimited_flp';
    if (w.includes('EXCL')) return 'exclusive';
    return 'basic';
}

function buildLicenseRecord(refCode, date, beatName, buyerName, type) {
    const config = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;
    return {
        refCode, date, beatName, buyerName, type,
        value: config.price,
        paymentMethod: 'Transferencia Bancaria',
        formData: {
            buyerId: '', buyerEmail: '', buyerPhone: '',
            buyerCity: '', buyerCountry: '', celebrationPlace: '',
            formats: config.formats, streams: config.streams,
            physical: config.physical, videos: config.videos,
            videoDuration: config.videoDuration, years: config.years,
            terminationFee: type === 'exclusive'
                ? 'No aplica' : `200% ($${(config.price * 2).toFixed(2)} USD)`,
            writerShare: 50, producerShare: 50,
            credits: config.credits, contentId: config.contentId
        }
    };
}

// ==========================================================================
// INTEGRACIÓN DOCUSIGN - OAUTH Y REST API (CLIENT-SIDE)
// ==========================================================================

// Detección y lectura del Token OAuth de DocuSign
function checkDocuSignOAuth() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1)); // remover el '#'
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');
        
        if (accessToken) {
            // Guardar token en sessionStorage (válido para la pestaña actual)
            sessionStorage.setItem('docusign_access_token', accessToken);
            // Calcular fecha de expiración
            const expiryTime = Date.now() + (Number(expiresIn) || 28800) * 1000;
            sessionStorage.setItem('docusign_access_token_expiry', expiryTime);
            
            // Limpiar el hash de la URL para estética y seguridad
            history.pushState("", document.title, window.location.pathname + window.location.search);
            
            // Mostrar confirmación
            setTimeout(() => {
                showToast('Sesión con DocuSign iniciada con éxito');
            }, 1000);
        }
    }
}

// Iniciar sesión en DocuSign (OAuth Implicit Grant)
function loginToDocuSign() {
    const clientId = producerConfig.dsClientId;
    if (!clientId) {
        showToast('Por favor, ingresa tu Integration Key (Client ID) en la Configuración de Productor.', true);
        openSettingsModal();
        return;
    }

    const env = producerConfig.dsEnv || "demo";
    // Determinar la URL de autenticación
    const authUrl = env === "live" 
        ? "https://account.docusign.com/oauth/auth"
        : "https://account-d.docusign.com/oauth/auth";

    // Registrar esta misma página como redirect_uri
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    
    // Armar URL de redirección OAuth
    const loginUrl = `${authUrl}?response_type=token&scope=signature%20cors&client_id=${clientId}&redirect_uri=${redirectUri}&state=docusign`;
    
    // Redirigir a DocuSign
    window.location.href = loginUrl;
}

// Generar PDF y enviar sobre a DocuSign
function sendToDocuSign() {
    if (!window.currentUserIsPro) {
        openPaymentModal('La firma digital con DocuSign es una característica exclusiva del Plan Pro.');
        return;
    }

    // Validaciones de formulario necesarias
    const buyerName = document.getElementById('buyer-name').value.trim();
    const buyerEmail = document.getElementById('buyer-email').value.trim();
    if (!buyerName || !buyerEmail) {
        showToast('Por favor escribe el Nombre y Correo del comprador antes de firmar con DocuSign', true);
        document.getElementById('buyer-name').focus();
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();

    // Validar configuración de DocuSign
    const clientId = producerConfig.dsClientId;
    if (!clientId) {
        showToast('Configura tu Integration Key (Client ID) de DocuSign antes de enviar a firmar.', true);
        openSettingsModal();
        return;
    }

    // Comprobar token activo en la sesión
    const token = sessionStorage.getItem('docusign_access_token');
    const expiry = sessionStorage.getItem('docusign_access_token_expiry');
    
    if (!token || (expiry && Date.now() > Number(expiry))) {
        showToast('Iniciando sesión en tu cuenta de DocuSign...');
        setTimeout(() => {
            loginToDocuSign();
        }, 1000);
        return;
    }

    if (typeof html2pdf === 'undefined') {
        showToast('Librería PDF no cargada. Conéctate a Internet e inténtalo de nuevo.', true);
        return;
    }

    const btn = document.getElementById('btn-docusign');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Generando PDF...';
    btn.disabled = true;
    safeCreateIcons();

    // Generar el PDF en memoria y obtener base64
    const element = document.getElementById('rendered-contract-content');
    const opt = {
        margin:       [15, 20, 15, 20],
        filename:     'Contrato.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'] }
    };

    html2pdf().from(element).set(opt).outputPdf('datauristring')
        .then(dataUriStr => {
            const base64Str = dataUriStr.split(',')[1];
            postEnvelopeToDocuSign(token, base64Str);
        })
        .catch(err => {
            console.error('Error al compilar base64 para DocuSign:', err);
            showToast('Error al procesar el PDF para DocuSign', true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// Limpiar y extraer mensajes útiles de respuestas de error HTML de DocuSign
function cleanHtmlError(htmlStr) {
    if (!htmlStr) return '';
    if (htmlStr.includes('<html') || htmlStr.includes('<HTML') || htmlStr.includes('<!DOCTYPE') || htmlStr.includes('<!doctype')) {
        const titleMatch = htmlStr.match(/<title>([\s\S]*?)<\/title>/i);
        const h1Match = htmlStr.match(/<h1>([\s\S]*?)<\/h1>/i);
        let extracted = '';
        if (titleMatch && titleMatch[1]) {
            extracted += 'Título: ' + titleMatch[1].trim() + '. ';
        }
        if (h1Match && h1Match[1]) {
            extracted += 'Detalle: ' + h1Match[1].trim() + '. ';
        }
        if (extracted) {
            let clean = extracted.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            if (clean.length > 300) clean = clean.substring(0, 300) + '...';
            return clean;
        }
        let clean = htmlStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length > 300) clean = clean.substring(0, 300) + '...';
        return clean;
    }
    let clean = htmlStr.trim();
    if (clean.length > 300) clean = clean.substring(0, 300) + '...';
    return clean;
}

// Llamar a la REST API de sobres de DocuSign
async function postEnvelopeToDocuSign(token, base64Str) {
    const btn = document.getElementById('btn-docusign');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Conectando DocuSign...';
    safeCreateIcons();

    const env = producerConfig.dsEnv || "demo";
    const userinfoUrl = env === "live"
        ? "https://account.docusign.com/oauth/userinfo"
        : "https://account-d.docusign.com/oauth/userinfo";

    try {
        // 1. Obtener información de cuenta del usuario
        const userinfoRes = await fetch(userinfoUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userinfoRes.ok) {
            throw new Error('Token expirado o no autorizado. Por favor, vuelve a iniciar sesión en DocuSign.');
        }
        
        let userInfo;
        const userinfoType = userinfoRes.headers.get("content-type");
        if (userinfoType && userinfoType.includes("application/json")) {
            userInfo = await userinfoRes.json();
        } else {
            const textErr = await userinfoRes.text();
            console.error('Respuesta no-JSON de UserInfo:', textErr);
            const cleanErr = cleanHtmlError(textErr);
            throw new Error(`Error de DocuSign (HTTP ${userinfoRes.status}) al obtener datos del usuario: ${cleanErr || 'Respuesta HTML no válida'}`);
        }
        
        const account = userInfo.accounts.find(acc => acc.is_default) || userInfo.accounts[0];
        
        if (!account) {
            throw new Error('No se encontró ninguna cuenta de DocuSign vinculada a tus credenciales.');
        }

        const accountId = account.account_id;
        const baseUri = account.base_uri + "/restapi";

        // 2. Definir datos de sobre
        const buyerName = document.getElementById('buyer-name').value.trim();
        const buyerEmail = document.getElementById('buyer-email').value.trim();
        const beatName = document.getElementById('beat-name').value.trim() || "Beat";
        const type = getActiveLicenseType();
        const refCode = document.getElementById('ref-code').value.trim() || "REF";

        btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Enviando sobre...';
        safeCreateIcons();

        const envelopeData = {
            emailSubject: `Firma Requerida: Licencia de Uso Musical - ${beatName} (${buyerName})`,
            documents: [
                {
                    documentBase64: base64Str,
                    name: `Licencia_${type.toUpperCase()}_${refCode}.pdf`,
                    fileExtension: "pdf",
                    documentId: "1"
                }
            ],
            recipients: {
                signers: [
                    {
                        email: buyerEmail,
                        name: buyerName,
                        recipientId: "1",
                        routingOrder: "1",
                        tabs: {
                            signHereTabs: [
                                {
                                    anchorString: "Firma del Licenciatario",
                                    anchorXOffset: "10",
                                    anchorYOffset: "20",
                                    anchorIgnoreIfNotPresent: "true",
                                    anchorUnits: "pixels"
                                }
                            ]
                        }
                    }
                ]
            },
            status: "sent"
        };

        // 3. POST a Envelopes Endpoint
        const envelopesUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes`;
        const envelopesRes = await fetch(envelopesUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(envelopeData)
        });

        let results;
        const envelopesType = envelopesRes.headers.get("content-type");
        if (envelopesType && envelopesType.includes("application/json")) {
            results = await envelopesRes.json();
        } else {
            const textErr = await envelopesRes.text();
            console.error('Respuesta de error no-JSON de DocuSign:', textErr);
            const cleanErr = cleanHtmlError(textErr);
            throw new Error(`Error de DocuSign (HTTP ${envelopesRes.status}) al llamar a ${envelopesUrl}: ${cleanErr || 'Respuesta HTML no válida'}`);
        }
        
        if (!envelopesRes.ok) {
            console.error('Error de API DocuSign:', results);
            throw new Error(results.message || 'Error al procesar el sobre en DocuSign.');
        }

        showToast('¡Contrato de licencia enviado con éxito vía DocuSign! El comprador recibirá el email de firma en breve.');
        console.log('Envelope ID generado:', results.envelopeId);

        // Guardar la licencia en el historial automáticamente
        saveCurrentLicenseToHistory(true);

        // Guardar datos del sobre para el envío posterior de entrega
        const currentBuyerName  = document.getElementById('buyer-name').value.trim();
        const currentBuyerEmail = document.getElementById('buyer-email').value.trim();
        sessionStorage.setItem('ds_pending_envelope', JSON.stringify({
            envelopeId:  results.envelopeId,
            accountId:   accountId,
            baseUri:     baseUri,
            buyerName:   currentBuyerName,
            buyerEmail:  currentBuyerEmail
        }));

        // Mostrar el botón de entrega con PDF firmado
        const signedBtn = document.getElementById('btn-send-signed-delivery');
        if (signedBtn) {
            signedBtn.style.display = 'block';
            safeCreateIcons();
        }

    } catch (err) {
        console.error('Fallo en la integración de DocuSign:', err);
        showToast(err.message, true);
        
        // Limpiar sesión en caso de expiración o fallo de credenciales (incluyendo 401 y 403)
        if (err.message.includes('Token') || err.message.includes('autenticar') || err.message.includes('autorizado') || err.message.includes('401') || err.message.includes('403')) {
            sessionStorage.removeItem('docusign_access_token');
            sessionStorage.removeItem('docusign_access_token_expiry');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// Convertir data URI (base64) de html2pdf a un objeto Blob usando fetch nativo
async function dataURLtoBlob(dataurl) {
    const res = await fetch(dataurl);
    return await res.blob();
}

// ============================================================
// INTEGRACIÓN GOOGLE DRIVE
// ============================================================

// Cargar estado de la cuenta central de Google Drive (Admin)
async function loadPlatformGDriveStatus() {
    const statusEl = document.getElementById('cfg-gdrive-central-status');
    if (!statusEl) return;
    statusEl.textContent = 'Verificando estado...';
    try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/gdrive-status', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await res.json();
        if (res.ok && data.linked) {
            statusEl.innerHTML = `<span style="color: #48bb78; font-weight: 600;">✓ Vinculado a:</span> ${data.email}`;
            // Rellenar Client ID si está vacío
            const idInput = document.getElementById('cfg-gdrive-client-id');
            if (idInput && !idInput.value.trim()) {
                idInput.value = data.clientId || '';
            }
            const secretInput = document.getElementById('cfg-gdrive-client-secret');
            if (secretInput) {
                secretInput.placeholder = '•••••••••••••••••••••••• (Guardado)';
            }
        } else {
            statusEl.innerHTML = `<span style="color: #e53e3e; font-weight: 600;">✗ No vinculado</span>`;
            const secretInput = document.getElementById('cfg-gdrive-client-secret');
            if (secretInput) {
                secretInput.placeholder = 'Ingresa el Client Secret de Google Cloud';
            }
        }
    } catch (e) {
        console.error('Error al cargar estado de Drive Central:', e);
        statusEl.textContent = 'Error al obtener estado.';
    }
}

// Iniciar flujo de vinculación OAuth (Admin)
function initPlatformGDriveOAuth() {
    const clientId = document.getElementById('cfg-gdrive-client-id').value.trim();
    const clientSecret = document.getElementById('cfg-gdrive-client-secret').value.trim();
    if (!clientId) {
        showToast('Por favor, ingresa el Client ID de Google para vincular.', true);
        return;
    }
    if (!clientSecret) {
        showToast('Por favor, ingresa el Client Secret de Google para vincular.', true);
        return;
    }
    
    showToast('☁️ Abriendo ventana de Google para vinculación central...');
    
    const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        ux_mode: 'popup',
        callback: async (response) => {
            if (response.error) {
                showToast('Error de Google: ' + response.error, true);
                return;
            }
            const code = response.code;
            
            // Mostrar cargando
            const statusEl = document.getElementById('cfg-gdrive-central-status');
            if (statusEl) statusEl.textContent = 'Guardando vinculación en el servidor...';
            
            try {
                const idToken = await auth.currentUser.getIdToken();
                const res = await fetch('/api/gdrive-setup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        code: code,
                        clientId: clientId,
                        clientSecret: clientSecret
                    })
                });
                const resData = await res.json();
                if (res.ok && resData.success) {
                    showToast(`¡Google Drive Central vinculado con éxito a ${resData.email}!`);
                    loadPlatformGDriveStatus();
                } else {
                    showToast('Error al vincular: ' + (resData.error || 'error desconocido'), true);
                    loadPlatformGDriveStatus();
                }
            } catch (e) {
                console.error(e);
                showToast('Error de red al conectar con el servidor', true);
                loadPlatformGDriveStatus();
            }
        }
    });
    client.requestCode();
}

// Obtener token de acceso para la cuenta central de Google Drive de Sossa
async function getCentralGdriveToken() {
    const cachedToken = sessionStorage.getItem('gdrive_central_access_token');
    const expiry = parseInt(sessionStorage.getItem('gdrive_central_token_expiry') || '0', 10);
    if (cachedToken && Date.now() < expiry - 60000) return cachedToken;

    try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/gdrive-token', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await res.json();
        if (res.ok && data.success) {
            sessionStorage.setItem('gdrive_central_access_token', data.accessToken);
            sessionStorage.setItem('gdrive_central_token_expiry', String(Date.now() + data.expiresIn * 1000));
            return data.accessToken;
        } else {
            throw new Error(data.error || 'Error al obtener token central');
        }
    } catch (e) {
        console.error('Error en getCentralGdriveToken:', e);
        throw new Error('No se pudo autenticar con el Google Drive de la plataforma: ' + e.message);
    }
}

// Obtener token de acceso de Google Drive (abre popup si es necesario)
async function getGdriveToken() {
    const cachedToken = sessionStorage.getItem('gdrive_access_token');
    const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
    if (cachedToken && Date.now() < expiry - 60000) return cachedToken;

    const clientId = producerConfig.gdriveClientId;
    if (!clientId) throw new Error('Google Drive Client ID no configurado.');
    if (typeof google === 'undefined' || !google.accounts) {
        throw new Error('Google Identity Services no cargó. Verifica tu conexión a Internet.');
    }

    showToast('☁️ Abriendo ventana de Google Drive... (acepta el permiso en el popup)');

    return new Promise((resolve, reject) => {
        // Timeout de 20 segundos para no quedar colgado si Chrome bloquea el popup
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout de autenticación con Google Drive. Asegúrate de permitir popups para el dominio activo (${window.location.host}) y vuelve a intentarlo.`));
        }, 20000);

        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response) => {
                clearTimeout(timeoutId);
                if (response.error) {
                    reject(new Error('Error de autenticación con Google Drive: ' + response.error));
                    return;
                }
                sessionStorage.setItem('gdrive_access_token', response.access_token);
                sessionStorage.setItem('gdrive_token_expiry', String(Date.now() + response.expires_in * 1000));
                resolve(response.access_token);
            },
            error_callback: (err) => {
                clearTimeout(timeoutId);
                if (err.type === 'popup_closed') {
                    reject(new Error('Cerraste la ventana de Google sin autorizar. Vuelve a intentarlo.'));
                } else if (err.type === 'popup_failed_to_open') {
                    reject(new Error(`Chrome bloqueó el popup de Google Drive. Haz clic en el ícono de popup bloqueado en la barra de dirección y permite popups para el dominio activo (${window.location.host}).`));
                } else {
                    reject(new Error('Error en popup de Google: ' + (err.type || JSON.stringify(err))));
                }
            }
        });
        tokenClient.requestAccessToken({ prompt: '' });
    });
}

// Buscar o crear una carpeta en Drive
async function getOrCreateDriveFolder(token, folderName, parentId = null) {
    const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

    const meta = { name: folderName, mimeType: 'application/vnd.google-apps.folder', ...(parentId && { parents: [parentId] }) };
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(meta)
    });
    const folder = await createRes.json();
    if (!folder.id) throw new Error('No se pudo crear la carpeta en Google Drive.');
    return folder.id;
}

// Subir archivo a Google Drive y devolver link compartible
async function uploadToGoogleDrive(dataUri, filename) {
    const token = await getGdriveToken();
    const blob = await dataURLtoBlob(dataUri);

    // Crear estructura dinámica basada en el productor
    const folderName = `${producerConfig.aka || producerConfig.name || 'BEATSS'} Licencias`;
    const rootId = await getOrCreateDriveFolder(token, folderName);
    const contractsId = await getOrCreateDriveFolder(token, 'Contratos', rootId);

    // Subida multipart
    const metadata = { name: filename, parents: [contractsId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob, filename);

    const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
    );
    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Error al subir a Google Drive (HTTP ${uploadRes.status}): ${err}`);
    }
    const fileData = await uploadRes.json();
    const fileId = fileData.id;

    // Hacer el archivo público (cualquiera con el link puede verlo)
    try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'anyone', role: 'reader' })
        });
    } catch (permErr) {
        console.warn("No se pudieron cambiar los permisos del archivo en Google Drive (posible restricción de la cuenta):", permErr);
    }

    const shareLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    console.log('☁️ Subido a Google Drive:', shareLink);
    return shareLink;
}

// Subir PDF a la nube usando Google Drive > GoFile > PixelDrain > file.io > tmpfiles.org
async function uploadPDFToCloud(base64DataUri, filename) {
    const blob = await dataURLtoBlob(base64DataUri);

    // 0. Intentar con Google Drive (prioritario si está configurado)
    if (producerConfig.gdriveClientId) {
        try {
            const driveUrl = await uploadToGoogleDrive(base64DataUri, filename);
            return driveUrl;
        } catch (driveErr) {
            console.warn('Google Drive falló, intentando con servidores alternativos:', driveErr.message);
        }
    }
    
    // 1. Intentar con GoFile (Recomendado, sin límites de descarga)
    try {
        console.log('Subiendo a GoFile...');
        const serverResponse = await fetch('https://api.gofile.io/getServer');
        let server = 'store1';
        if (serverResponse.ok) {
            const serverData = await serverResponse.json();
            if (serverData.status === 'ok' && serverData.data && serverData.data.server) {
                server = serverData.data.server;
            }
        }
        
        const formData = new FormData();
        formData.append('file', blob, filename);
        
        const uploadResponse = await fetch(`https://${server}.gofile.io/uploadFile`, {
            method: 'POST',
            body: formData
        });
        
        if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            if (uploadData.status === 'ok' && uploadData.data && uploadData.data.downloadPage) {
                console.log('Subido a GoFile con éxito:', uploadData.data.downloadPage);
                return uploadData.data.downloadPage;
            }
        }
    } catch (e) {
        console.error('Error al subir a GoFile:', e);
    }

    // 2. Intentar con PixelDrain (Limpio, sin cookies ni credenciales locales para evitar 401)
    try {
        console.log('Subiendo a PixelDrain...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetch('https://pixeldrain.com/api/file', {
            method: 'POST',
            body: formData,
            credentials: 'omit'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido a PixelDrain con éxito ID:', data.id);
                return `https://pixeldrain.com/api/file/${data.id}`;
            }
        }
    } catch (e) {
        console.error('Error al subir a PixelDrain:', e);
    }

    // 3. Intentar con file.io (1 sola descarga, pero muy fiable)
    try {
        console.log('Subiendo a file.io...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetch('https://file.io/', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido a file.io con éxito:', data.link);
                return data.link;
            }
        }
    } catch (e) {
        console.error('Error al subir a file.io:', e);
    }

    // 4. Intentar con tmpfiles.org
    try {
        console.log('Subiendo a tmpfiles.org...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const viewerUrl = data.data.url;
                const downloadUrl = viewerUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log('Subido a tmpfiles.org con éxito:', downloadUrl);
                return downloadUrl;
            }
        }
    } catch (e) {
        console.error('Error al subir a tmpfiles.org:', e);
    }

    throw new Error('No se pudo subir el PDF del contrato a ningún servidor de almacenamiento temporal.');
}

// Enviar correo de entrega usando EmailJS (Subiendo PDF a la nube para plan gratis)
async function sendEmailDelivery() {
    const refCode = document.getElementById('ref-code').value.trim();
    const isNew = !licenseHistory.some(l => l.refCode === refCode);
    if (isNew && checkPlanLimitExceeded('enviar esta nueva licencia por correo')) {
        return;
    }

    const buyerName = document.getElementById('buyer-name').value.trim();
    const buyerEmail = document.getElementById('buyer-email').value.trim();
    const beatName = document.getElementById('beat-name').value.trim();
    
    if (!buyerName || !buyerEmail) {
        showToast('Por favor escribe el Nombre y Correo del comprador antes de enviar', true);
        document.getElementById('buyer-name').focus();
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();
    
    // Auto-guardar en historial al enviar por correo
    saveCurrentLicenseToHistory(true);
    
    if (!beatName) {
        showToast('Por favor escribe el nombre del Beat antes de enviar', true);
        document.getElementById('beat-name').focus();
        return;
    }

    const serviceId = producerConfig.emailjsServiceId || 'service_7ofza2v';
    const templateId = producerConfig.emailjsTemplateId || 'template_mlimkld';
    const publicKey = producerConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

    if (typeof emailjs === 'undefined') {
        showToast('El cargador de EmailJS no está disponible. Conéctate a Internet.', true);
        return;
    }

    if (typeof html2pdf === 'undefined') {
        showToast('La librería PDF no está disponible. Conéctate a Internet.', true);
        return;
    }

    const btn = document.getElementById('btn-send-email');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Generando PDF...';
    btn.disabled = true;
    safeCreateIcons();

    try {
        showProgressModal('Enviando Licencia', 'Preparando archivos y contrato...', 'Generar PDF de Licencia', 'Subir contrato a la nube', 'Enviar correo de entrega');
        updateProgressStep('step-pdf', 'Procesando...', false);

        // 1. Compilar el PDF en memoria y obtener su datauristring
        const element = document.getElementById('rendered-contract-content');
        const opt = {
            margin:       [15, 20, 15, 20],
            filename:     'Contrato.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        const base64DataUri = await html2pdf().from(element).set(opt).outputPdf('datauristring');
        updateProgressStep('step-pdf', 'Completado', true);
        
        // 2. Subir el PDF a la nube
        updateProgressStep('step-cloud', 'Procesando...', false);
        
        const type = getActiveLicenseType();
        const refCode = document.getElementById('ref-code').value.trim() || "REF";
        const pdfFilename = `Licencia_${type.toUpperCase()}_${refCode}.pdf`;
        
        let pdfUrl = "";
        try {
            pdfUrl = await uploadPDFToCloud(base64DataUri, pdfFilename);
            updateProgressStep('step-cloud', 'Completado', true);
        } catch (uploadError) {
            console.error('Error al subir PDF:', uploadError);
            updateProgressStep('step-cloud', 'Error (Se omitirá)', false, true);
        }

        // 3. Inicializar EmailJS con la llave pública
        emailjs.init(publicKey);

        // 4. Preparar los enlaces de descarga en base al tipo de licencia
        const mp3 = document.getElementById('audio-link-mp3').value.trim();
        const wav = document.getElementById('audio-link-wav').value.trim();
        const stems = document.getElementById('audio-link-stems').value.trim();

        const typeLabels = {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Premium Plus',
            unlimited_flp: 'Ilimitada + FLP',
            unlimited: 'Ilimitada',
            exclusive: 'Exclusiva'
        };

        const producerDisplayName = producerConfig.aka || producerConfig.name || "Productor";
        let linksText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${pdfUrl ? `
    <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; text-align: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 10px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Documento Oficial y Legal</div>
        <a href="${pdfUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0055ee; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #0044cc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">📄 Descargar Contrato (PDF)</a>
    </div>
    ` : ''}
    
    <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 12px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Archivos de Audio de Alta Calidad</div>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            ${mp3 ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental MP3 (320kbps)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${mp3}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${wav && (type !== 'basic') ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental WAV (Master)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${wav}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${stems && (type !== 'basic' && type !== 'premium') ? `
            <tr>
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Pistas Separadas (Stems)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${stems}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
        </table>
    </div>
</div>
        `;

        const templateParams = {
            to_name: buyerName,
            to_email: buyerEmail,
            beat_name: beatName,
            license_type: typeLabels[type] || type,
            delivery_links: linksText,
            producer_name: "BEATSS",
            producer_email: producerConfig.email,
            pdf_filename: pdfFilename
        };

        // 5. Enviar usando emailjs.send
        updateProgressStep('step-email', 'Procesando...', false);

        const response = await emailjs.send(serviceId, templateId, templateParams);
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Enviada!', 'El comprador recibió el correo con el contrato PDF y los archivos de audio.');
        console.log('SUCCESS!', response.status, response.text);

    } catch (err) {
        console.error('Error al enviar correo por EmailJS:', err);
        showProgressError('Fallo en el Envío', err.message || 'Ocurrió un error inesperado al enviar el email.');
        
        const steps = ['step-pdf', 'step-cloud', 'step-email'];
        steps.forEach(stepId => {
            const stepEl = document.getElementById(stepId);
            const statusEl = stepEl?.querySelector('.step-status');
            if (statusEl && (statusEl.textContent === 'Esperando...' || statusEl.textContent === 'Procesando...')) {
                updateProgressStep(stepId, 'Cancelado', false, true);
            }
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// Guardar borrador actual del formulario en localStorage
function saveFormDraft() {
    if (window.isInitializing) return;
    try {
        const customFields = [];
        const customContainer = document.getElementById('custom-fields-container');
        if (customContainer) {
            const rows = customContainer.querySelectorAll('.custom-field-row');
            rows.forEach(row => {
                const tagInput = row.querySelector('.field-tag');
                const valInput = row.querySelector('.field-value');
                if (tagInput && valInput) {
                    customFields.push({
                        key: tagInput.value,
                        value: valInput.value
                    });
                }
            });
        }

        const draft = {
            activeLicenseType: getActiveLicenseType(),
            beatName: document.getElementById('beat-name').value,
            beatBpm: document.getElementById('beat-bpm') ? document.getElementById('beat-bpm').value : '',
            beatKey: document.getElementById('beat-key') ? document.getElementById('beat-key').value : '',
            buyerName: document.getElementById('buyer-name').value,
            buyerId: document.getElementById('buyer-id').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            licenseValue: document.getElementById('license-value').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            audioLinkMp3: document.getElementById('audio-link-mp3').value,
            audioLinkWav: document.getElementById('audio-link-wav').value,
            audioLinkStems: document.getElementById('audio-link-stems').value,
            refCode: document.getElementById('ref-code').value,
            paymentMethod: document.getElementById('payment-method').value,
            effectiveDate: document.getElementById('effective-date').value,
            celebrationPlace: document.getElementById('celebration-place').value,
            clauseFormats: document.getElementById('clause-formats').value,
            clauseStreams: document.getElementById('clause-streams').value,
            clausePhysical: document.getElementById('clause-physical').value,
            clauseVideos: document.getElementById('clause-videos').value,
            clauseVideoDuration: document.getElementById('clause-video-duration').value,
            clauseYears: document.getElementById('clause-years').value,
            clauseTerminationFee: document.getElementById('clause-termination-fee').value,
            clauseWriterShare: document.getElementById('clause-writer-share').value,
            clauseProducerShare: document.getElementById('clause-producer-share').value,
            clauseCredits: document.getElementById('clause-credits').value,
            clauseContentId: document.getElementById('clause-content-id').checked,
            customFields: customFields
        };
        safeSetItem(`${window.currentUser}_form_draft`, JSON.stringify(draft));
    } catch (e) {
        console.error('Error al guardar borrador de formulario:', e);
    }
}

// Restaurar borrador del formulario desde localStorage si existe
function loadFormDraft() {
    const saved = localStorage.getItem(`${window.currentUser}_form_draft`);
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        
        // 1. Restaurar tipo de licencia activa si existe
        if (draft.activeLicenseType) {
            const cards = document.querySelectorAll('.license-card');
            cards.forEach(card => {
                if (card.dataset.type === draft.activeLicenseType) {
                    cards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                }
            });
            const btns = document.querySelectorAll('.license-btn');
            btns.forEach(btn => {
                if (btn.dataset.type === draft.activeLicenseType) {
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }
        
        // 2. Restaurar campos de texto y número
        const fields = {
            'beat-name': draft.beatName,
            'beat-bpm': draft.beatBpm || '',
            'beat-key': draft.beatKey || '',
            'buyer-name': draft.buyerName,
            'buyer-id': draft.buyerId,
            'buyer-email': draft.buyerEmail,
            'buyer-phone': draft.buyerPhone,
            'license-value': draft.licenseValue,
            'buyer-city': draft.buyerCity,
            'buyer-country': draft.buyerCountry,
            'audio-link-mp3': draft.audioLinkMp3,
            'audio-link-wav': draft.audioLinkWav,
            'audio-link-stems': draft.audioLinkStems,
            'ref-code': draft.refCode,
            'payment-method': draft.paymentMethod,
            'effective-date': draft.effectiveDate,
            'celebration-place': draft.celebrationPlace,
            'clause-formats': draft.clauseFormats,
            'clause-streams': draft.clauseStreams,
            'clause-physical': draft.clausePhysical,
            'clause-videos': draft.clauseVideos,
            'clause-video-duration': draft.clauseVideoDuration,
            'clause-years': draft.clauseYears,
            'clause-termination-fee': draft.clauseTerminationFee,
            'clause-writer-share': draft.clauseWriterShare,
            'clause-producer-share': draft.clauseProducerShare,
            'clause-credits': draft.clauseCredits
        };

        for (const [id, value] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el && value !== undefined) {
                el.value = value;
            }
        }

        // 3. Restaurar checkbox
        const cb = document.getElementById('clause-content-id');
        if (cb && draft.clauseContentId !== undefined) {
            cb.checked = draft.clauseContentId;
        }

        // 4. Restaurar campos personalizados
        const container = document.getElementById('custom-fields-container');
        if (container) {
            container.innerHTML = '';
            if (draft.customFields && Array.isArray(draft.customFields)) {
                draft.customFields.forEach(field => {
                    addCustomFieldRow(field.key, field.value);
                });
            }
        }

        // 5. Actualizar previsualización
        generatePreview();

    } catch (e) {
        console.error('Error al cargar borrador de formulario:', e);
    }
}

// Limpiar todos los campos del formulario y borrar el borrador
function clearFormFields() {
    if (confirm('¿Estás seguro de que deseas limpiar todos los campos del formulario?')) {
        document.getElementById('beat-name').value = '';
        document.getElementById('buyer-name').value = '';
        document.getElementById('buyer-id').value = '';
        document.getElementById('buyer-email').value = '';
        document.getElementById('buyer-phone').value = '';
        document.getElementById('buyer-city').value = '';
        document.getElementById('buyer-country').value = 'Ecuador';
        document.getElementById('audio-link-mp3').value = '';
        document.getElementById('audio-link-wav').value = '';
        document.getElementById('audio-link-stems').value = '';
        
        initDefaultDate();
        
        try {
            localStorage.removeItem(`${window.currentUser}_form_draft`);
            localStorage.removeItem('sossa_form_draft'); // legacy
        } catch (e) {
            console.error(e);
        }

        const container = document.getElementById('custom-fields-container');
        if (container) {
            container.innerHTML = '';
        }
        
        selectLicenseType('basic');
        showToast('Campos del formulario limpiados');
    }
}

// Guardar automáticamente el comprador actual como contacto en localStorage
// Cargar contactos desde Firestore
async function loadContacts() {
    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUserIsPro) {
        try {
            const colRef = collection(db, "users", window.currentUser, "contacts");
            const querySnapshot = await getDocs(colRef);
            querySnapshot.forEach((docSnap) => {
                savedList.push(docSnap.data());
            });
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar contactos de Firestore:", err);
        }
    }

    let localList = [];
    try {
        const saved = localStorage.getItem(`${window.currentUser}_contacts`);
        if (saved) {
            localList = JSON.parse(saved);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    let mergedList = [...savedList];
    let needsSaveToFirestore = false;

    localList.forEach(localCont => {
        if (localCont && localCont.email) {
            const exists = mergedList.some(c => c.email && c.email.toLowerCase() === localCont.email.toLowerCase());
            if (!exists) {
                mergedList.push(localCont);
                needsSaveToFirestore = true;
            }
        }
    });

    contactsList = mergedList;

    if (needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
        if (firestoreLoaded && window.currentUserIsPro) {
            console.log("Subiendo contactos locales combinados a Firestore...");
            for (const cont of contactsList) {
                if (!cont.email) continue;
                try {
                    const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
                    const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                    await setDoc(contDocRef, cont);
                } catch (err) {
                    console.error("Error al guardar contacto en Firestore:", err);
                }
            }
        }
    }
}

// Guardar automáticamente el comprador actual como contacto
async function autoSaveContact() {
    const name = document.getElementById('buyer-name').value.trim();
    const email = document.getElementById('buyer-email').value.trim();
    const id = document.getElementById('buyer-id').value.trim();
    const phone = document.getElementById('buyer-phone').value.trim();
    const city = document.getElementById('buyer-city').value.trim();
    const country = document.getElementById('buyer-country').value.trim();

    // Solo guardar si se provee nombre y correo electrónico
    if (!name || !email) return;

    const contactData = {
        name,
        email,
        id,
        phone,
        city,
        country,
        updatedAt: Date.now()
    };

    const index = contactsList.findIndex(c => c.email.toLowerCase() === email.toLowerCase());

    if (index !== -1) {
        contactsList[index] = { ...contactsList[index], ...contactData };
    } else {
        contactsList.push(contactData);
    }

    try {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
    } catch (e) {
        console.error('Error al guardar contactos localmente:', e);
    }

    if (!window.currentUserIsPro) return;

    // Guardar en Firestore: coleccion users/{uid}/contacts con email sanitizado como documentID
    const contactId = email.toLowerCase().replace(/[/.]/g, '_');
    try {
        const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
        await setDoc(docRef, contactData);
    } catch (err) {
        console.error("Error al guardar contacto en Firestore:", err);
    }
}

// Abrir modal de contactos
function openContactsModal() {
    document.getElementById('contacts-modal').style.display = 'flex';
    document.getElementById('search-contacts').value = '';
    renderContactsTable();
}

// Cerrar modal de contactos
function closeContactsModal() {
    document.getElementById('contacts-modal').style.display = 'none';
}

// Cargar y mostrar contactos en la tabla del modal
function renderContactsTable() {
    const searchQuery = document.getElementById('search-contacts').value.toLowerCase().trim();
    let contacts = [...contactsList];

    // Ordenar por fecha de actualización descendente (últimos modificados primero)
    contacts.sort((a, b) => b.updatedAt - a.updatedAt);

    // Filtrar si hay búsqueda
    if (searchQuery) {
        contacts = contacts.filter(c => 
            c.name.toLowerCase().includes(searchQuery) ||
            c.email.toLowerCase().includes(searchQuery) ||
            (c.id && c.id.includes(searchQuery))
        );
    }

    // Actualizar cantidad en la etiqueta
    document.getElementById('contacts-count-label').textContent = `${contacts.length} contacto(s) guardado(s)`;

    const tbody = document.getElementById('contacts-table-body');
    tbody.innerHTML = '';

    if (contacts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="padding: 20px; text-align: center; color: #718096;">
                    No se encontraron contactos.
                </td>
            </tr>
        `;
        return;
    }

    contacts.forEach(contact => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2e39';
        tr.style.cursor = 'pointer';
        
        // Al hacer clic en la fila se selecciona el contacto (excepto si hace clic en eliminar)
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.delete-contact-btn')) return;
            selectContact(contact);
        });

        tr.innerHTML = `
            <td style="padding: 10px 10px;">
                <div style="font-weight: bold; color: #fff;">${contact.name}</div>
                <div style="font-size: 11px; color: #718096;">Cédula/DNI: ${contact.id || 'N/A'}</div>
            </td>
            <td style="padding: 10px 10px;">
                <div style="color: #cbd5e0;">${contact.email}</div>
                <div style="font-size: 11px; color: #718096;">Telf: ${contact.phone || 'N/A'}</div>
            </td>
            <td style="padding: 10px 10px; text-align: right; white-space: nowrap;">
                <button class="btn btn-secondary contact-action-btn select-contact-btn" title="Seleccionar" style="padding: 4px 8px; font-size: 12px; margin-right: 4px; background-color: #2d3748; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn btn-danger-outline contact-action-btn delete-contact-btn" data-email="${contact.email}" title="Eliminar" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        
        tr.querySelector('.select-contact-btn').addEventListener('click', () => {
            selectContact(contact);
        });

        tr.querySelector('.delete-contact-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteContact(contact.email);
        });

        tbody.appendChild(tr);
    });

    safeCreateIcons();
    initTooltips();
}

// Seleccionar un contacto y rellenar el formulario
function selectContact(contact) {
    document.getElementById('buyer-name').value = contact.name || '';
    document.getElementById('buyer-email').value = contact.email || '';
    document.getElementById('buyer-id').value = contact.id || '';
    document.getElementById('buyer-phone').value = contact.phone || '';
    document.getElementById('buyer-city').value = contact.city || '';
    document.getElementById('buyer-country').value = contact.country || 'Ecuador';
    
    // Regenerar la previsualización
    generatePreview();
    
    // Cerrar modal
    closeContactsModal();
    showToast(`Contacto "${contact.name}" cargado con éxito`);
}

// Eliminar un contacto
async function deleteContact(email) {
    if (confirm(`¿Estás seguro de que deseas eliminar este contacto (${email})?`)) {
        contactsList = contactsList.filter(c => c.email.toLowerCase() !== email.toLowerCase());

        try {
            safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
            renderContactsTable();
            showToast('Contacto eliminado');
        } catch (e) {
            console.error(e);
        }

        // Delete from Firestore
        const contactId = email.toLowerCase().replace(/[/.]/g, '_');
        try {
            const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
            await deleteDoc(docRef);
        } catch (err) {
            console.error("Error al eliminar contacto de Firestore:", err);
        }
    }
}

// ==========================================================================
// VERIFICAR FIRMA DOCUSIGN Y ENVIAR ENTREGA COMPLETA (PDF FIRMADO + LINKS)
// ==========================================================================
async function checkAndSendSignedDelivery() {
    const btn = document.getElementById('btn-send-signed-delivery');
    const originalText = btn.innerHTML;

    // Recuperar datos del sobre guardado
    const pendingRaw = sessionStorage.getItem('ds_pending_envelope');
    if (!pendingRaw) {
        showToast('No se encontró ningún sobre pendiente de DocuSign. Primero envía el contrato a firmar.', true);
        return;
    }
    const pending = JSON.parse(pendingRaw);
    const { envelopeId, accountId, baseUri, buyerName, buyerEmail } = pending;

    // Recuperar token de sesión
    const token = sessionStorage.getItem('docusign_access_token');
    if (!token) {
        showToast('Sesión de DocuSign expirada. Haz clic en "Firmar DocuSign" para volver a iniciar sesión.', true);
        return;
    }

    // Validar credenciales de EmailJS
    const serviceId  = 'service_7ofza2v';
    const templateId = 'template_mlimkld';
    const publicKey  = 'Xwfa8Ai2WcXXGThLI';

    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Verificando firma...';
    btn.disabled = true;
    safeCreateIcons();

    try {
        showProgressModal('Verificando Firma', 'Consultando DocuSign...', 'Verificar firma en DocuSign', 'Descargar y subir PDF firmado', 'Enviar correo de entrega');
        updateProgressStep('step-pdf', 'Procesando...', false);

        // 1. Verificar el estado del sobre
        const statusUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`;
        const statusRes = await fetch(statusUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!statusRes.ok) {
            const errText = await statusRes.text();
            throw new Error(`Error al consultar el estado del sobre (HTTP ${statusRes.status}): ${cleanHtmlError(errText)}`);
        }

        const statusData = await statusRes.json();
        const envelopeStatus = statusData.status;

        if (envelopeStatus !== 'completed') {
            const statusLabels = {
                sent:      'enviado y esperando firma',
                delivered: 'abierto por el firmante',
                declined:  'rechazado por el firmante',
                voided:    'anulado',
                created:   'creado pero no enviado'
            };
            const label = statusLabels[envelopeStatus] || envelopeStatus;
            throw new Error(`El contrato aún no ha sido firmado. Estado: "${label}". Vuelve a intentar cuando el comprador haya firmado.`);
        }

        updateProgressStep('step-pdf', 'Completado', true);

        // 2. Descargar el PDF firmado de DocuSign
        updateProgressStep('step-cloud', 'Procesando...', false);

        const pdfDownloadUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`;
        const pdfRes = await fetch(pdfDownloadUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/pdf'
            }
        });

        if (!pdfRes.ok) {
            const errText = await pdfRes.text();
            throw new Error(`Error al descargar el PDF firmado (HTTP ${pdfRes.status}): ${cleanHtmlError(errText)}`);
        }

        const pdfBlob = await pdfRes.blob();

        const reader = new FileReader();
        const dataUri = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
        });

        const beatName = document.getElementById('beat-name').value.trim() || 'Beat';
        const type     = getActiveLicenseType();
        const refCode  = document.getElementById('ref-code').value.trim() || 'REF';
        const filename = `Contrato_FIRMADO_${type.toUpperCase()}_${refCode}.pdf`;

        let cloudUrl = '';
        try {
            cloudUrl = await uploadPDFToCloud(dataUri, filename);
            updateProgressStep('step-cloud', 'Completado', true);
        } catch (uploadErr) {
            console.warn('No se pudo subir el PDF firmado a la nube:', uploadErr);
            updateProgressStep('step-cloud', 'Error (Se omitirá)', false, true);
        }

        // 3. Enviar email de entrega via EmailJS
        updateProgressStep('step-email', 'Procesando...', false);

        const mp3   = document.getElementById('audio-link-mp3').value.trim();
        const wav   = document.getElementById('audio-link-wav').value.trim();
        const stems = document.getElementById('audio-link-stems').value.trim();

        const typeLabels = {
            basic: 'Básica', premium: 'Premium',
            premium_plus: 'Premium Plus', unlimited_flp: 'Ilimitada + FLP',
            unlimited: 'Ilimitada', exclusive: 'Exclusiva'
        };

        const producerDisplayName = producerConfig.aka || producerConfig.name || "Productor";
        let linksText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${cloudUrl ? `
    <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; text-align: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 10px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Contrato Oficial Firmado</div>
        <a href="${cloudUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #0f9f67; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">✅ Descargar Contrato Firmado (PDF)</a>
    </div>
    ` : ''}
    
    <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 12px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Archivos de Audio de Alta Calidad</div>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            ${mp3 ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental MP3 (320kbps)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${mp3}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${wav && (type !== 'basic') ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental WAV (Master)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${wav}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${stems && (type !== 'basic' && type !== 'premium') ? `
            <tr>
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Pistas Separadas (Stems)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${stems}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
        </table>
    </div>
</div>
        `;

        emailjs.init(publicKey);
        const templateParams = {
            to_name:        buyerName,
            to_email:       buyerEmail,
            beat_name:      beatName,
            license_type:   typeLabels[type] || type,
            delivery_links: linksText,
            producer_name:  "BEATSS",
            producer_email: producerConfig.email,
            pdf_filename:   filename
        };

        await emailjs.send(serviceId, templateId, templateParams);
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Completada!', 'El comprador recibió el PDF firmado y sus archivos de audio.');
        console.log('Entrega con PDF firmado enviada. EnvelopeId:', envelopeId);

        btn.style.display = 'none';
        sessionStorage.removeItem('ds_pending_envelope');

    } catch (err) {
        console.error('Error en checkAndSendSignedDelivery:', err);
        showProgressError('Fallo en la Entrega', err.message || 'Ocurrió un error al procesar o enviar el PDF firmado.');
        
        const steps = ['step-pdf', 'step-cloud', 'step-email'];
        steps.forEach(stepId => {
            const stepEl = document.getElementById(stepId);
            const statusEl = stepEl?.querySelector('.step-status');
            if (statusEl && (statusEl.textContent === 'Esperando...' || statusEl.textContent === 'Procesando...')) {
                updateProgressStep(stepId, 'Cancelado', false, true);
            }
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// ============================================================
// BASE DE DATOS LOCAL DE BEATS
// ============================================================

let localBeats = [];

// Inicializar y cargar beats (con Firestore sync)
async function initBeatsDB() {
    // Eventos de la UI
    if (!window._beatsDBEventsConfigured) {
        document.getElementById('btn-beats-modal')?.addEventListener('click', openBeatsModal);
        document.getElementById('close-beats-modal')?.addEventListener('click', closeBeatsModal);
        document.getElementById('btn-add-beat')?.addEventListener('click', openBeatForm);
        document.getElementById('btn-cancel-beat')?.addEventListener('click', closeBeatForm);
        document.getElementById('btn-save-beat')?.addEventListener('click', saveBeat);
        document.getElementById('search-beats')?.addEventListener('input', renderBeatsList);
        
        // Eventos del Catálogo de la pestaña principal
        document.getElementById('tab-btn-add-beat')?.addEventListener('click', () => openTabBeatForm());
        document.getElementById('tab-btn-close-form')?.addEventListener('click', closeTabBeatForm);
        document.getElementById('tab-btn-cancel-beat')?.addEventListener('click', closeTabBeatForm);
        document.getElementById('tab-btn-save-beat')?.addEventListener('click', saveTabBeat);
        document.getElementById('tab-search-beats')?.addEventListener('input', renderBeatsGrid);
        document.getElementById('tab-filter-genre')?.addEventListener('change', renderBeatsGrid);
        document.getElementById('tab-filter-key')?.addEventListener('change', renderBeatsGrid);
        
        window._beatsDBEventsConfigured = true;
    }

    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUser) {
        try {
            const colRef = collection(db, "users", window.currentUser, "beats");
            const querySnapshot = await getDocs(colRef);
            querySnapshot.forEach((docSnap) => {
                savedList.push(docSnap.data());
            });
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar beats de Firestore:", err);
        }
    }

    // Cargar de localStorage para fusionar
    let localList = [];
    try {
        const stored = localStorage.getItem(`${window.currentUser}_beats`);
        if (stored) {
            localList = JSON.parse(stored);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    // Fusionar listas usando id como clave única
    let mergedList = [...savedList];
    let needsSaveToFirestore = false;

    localList.forEach(localBeat => {
        if (localBeat && localBeat.id) {
            const exists = mergedList.some(b => b.id === localBeat.id);
            if (!exists) {
                mergedList.push(localBeat);
                needsSaveToFirestore = true;
            }
        }
    });

    localBeats = mergedList;

    if (needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
        if (firestoreLoaded) {
            console.log("Subiendo beats locales combinados a Firestore...");
            let count = 0;
            for (const beat of localBeats) {
                if (!beat.id) continue;
                // Si no es PRO, limitamos la subida a 10 beats máximo
                if (!window.currentUserIsPro && count >= 10) {
                    break;
                }
                try {
                    const beatDocRef = doc(db, "users", window.currentUser, "beats", beat.id);
                    await setDoc(beatDocRef, beat);
                    count++;
                } catch (err) {
                    console.error("Error al guardar beat en Firestore:", err);
                }
            }
        }
    }
}

// Abrir Modal
function openBeatsModal() {
    document.getElementById('modal-beats').style.display = 'flex';
    document.getElementById('search-beats').value = '';
    closeBeatForm();
    renderBeatsList();
}

// Cerrar Modal
function closeBeatsModal() {
    document.getElementById('modal-beats').style.display = 'none';
}

// Mostrar/Ocultar Formulario
function openBeatForm(editId = null) {
    document.getElementById('beat-form-container').style.display = 'block';
    
    if (editId) {
        const beat = localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('beat-form-title').innerText = 'Editar Beat';
            document.getElementById('edit-beat-id').value = beat.id;
            document.getElementById('db-beat-name').value = beat.name;
            document.getElementById('db-beat-mp3').value = beat.mp3 || '';
            document.getElementById('db-beat-wav').value = beat.wav || '';
            document.getElementById('db-beat-stems').value = beat.stems || '';
            document.getElementById('db-beat-artwork').value = beat.artwork || '';
            document.getElementById('db-beat-bpm').value = beat.bpm || '';
            document.getElementById('db-beat-key').value = beat.key || '';
            document.getElementById('db-beat-genre').value = beat.genre || '';
            document.getElementById('db-beat-tags').value = beat.tags || '';
        }
    } else {
        document.getElementById('beat-form-title').innerText = 'Agregar Nuevo Beat';
        document.getElementById('edit-beat-id').value = '';
        document.getElementById('db-beat-name').value = '';
        document.getElementById('db-beat-mp3').value = '';
        document.getElementById('db-beat-wav').value = '';
        document.getElementById('db-beat-stems').value = '';
        document.getElementById('db-beat-artwork').value = '';
        document.getElementById('db-beat-bpm').value = '';
        document.getElementById('db-beat-key').value = '';
        document.getElementById('db-beat-genre').value = '';
        document.getElementById('db-beat-tags').value = '';
    }
    updateClearButtonsVisibility();
}

function closeBeatForm() {
    document.getElementById('beat-form-container').style.display = 'none';
}

// Guardar Beat (con Firestore sync)
async function saveBeat() {
    const id = document.getElementById('edit-beat-id').value;
    const name = document.getElementById('db-beat-name').value.trim();
    const mp3 = document.getElementById('db-beat-mp3').value.trim();
    const wav = document.getElementById('db-beat-wav').value.trim();
    const stems = document.getElementById('db-beat-stems').value.trim();
    const artwork = document.getElementById('db-beat-artwork').value.trim();
    const bpm = document.getElementById('db-beat-bpm').value ? parseInt(document.getElementById('db-beat-bpm').value, 10) : null;
    const key = document.getElementById('db-beat-key').value.trim();
    const genre = document.getElementById('db-beat-genre').value.trim();
    const tags = document.getElementById('db-beat-tags').value.trim();

    if (!name) {
        showToast('El nombre del beat es obligatorio', true);
        return;
    }

    const beatId = id || 'beat_' + Date.now();
    const beatData = {
        id: beatId,
        name,
        mp3,
        wav,
        stems,
        artwork,
        bpm,
        key,
        genre,
        tags,
        updatedAt: Date.now()
    };

    const isNew = !id;
    if (!window.currentUserIsPro && isNew && localBeats.length >= 10) {
        window.openPaymentModal("Límite alcanzado: Has alcanzado el límite de 10 beats del Plan Inicial. ¡Actualízate a PRO hoy para subir beats ilimitados!");
        return;
    }

    if (id) {
        const index = localBeats.findIndex(b => b.id === id);
        if (index !== -1) localBeats[index] = beatData;
    } else {
        localBeats.push(beatData);
    }

    try {
        safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
        
        // Guardar en Firestore para todos
        const beatDocRef = doc(db, "users", window.currentUser, "beats", beatId);
        await setDoc(beatDocRef, beatData);
        
        showToast(id ? 'Beat actualizado' : 'Nuevo beat guardado');
        closeBeatForm();
        renderBeatsList();
        if (document.getElementById('tab-beats-grid')) {
            renderBeatsGrid();
            updateGenreAndKeyFilters();
        }
    } catch (e) {
        console.error('Error saving beat:', e);
        showToast('Error al guardar el beat en la base de datos', true);
    }
}

// Eliminar Beat (con Firestore sync)
async function deleteBeat(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este beat?')) {
        localBeats = localBeats.filter(b => String(b.id) !== String(id));
        try {
            safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
            
            // Eliminar de Firestore
            const beatDocRef = doc(db, "users", window.currentUser, "beats", id);
            await deleteDoc(beatDocRef);
            
            renderBeatsList();
            if (document.getElementById('tab-beats-grid')) {
                renderBeatsGrid();
                updateGenreAndKeyFilters();
            }
            showToast('Beat eliminado correctamente');
        } catch (e) {
            console.error('Error deleting beat:', e);
            showToast('Error al eliminar el beat de la base de datos', true);
        }
    }
}

// Auto-llenar campos del formulario principal
function selectBeat(id) {
    const beat = localBeats.find(b => String(b.id) === String(id));
    if (!beat) return;

    document.getElementById('beat-name').value = beat.name;
    document.getElementById('audio-link-mp3').value = beat.mp3 || '';
    document.getElementById('audio-link-wav').value = beat.wav || '';
    document.getElementById('audio-link-stems').value = beat.stems || '';

    if (document.getElementById('beat-bpm')) {
        document.getElementById('beat-bpm').value = beat.bpm || '';
    }
    if (document.getElementById('beat-key')) {
        document.getElementById('beat-key').value = beat.key || '';
    }

    closeBeatsModal();
    generatePreview(); // Actualizar la vista del contrato al instante
    showToast(`Beat "${beat.name}" cargado en el contrato.`);
}

// Renderizar la lista
function renderBeatsList() {
    const listContainer = document.getElementById('beats-list');
    const query = document.getElementById('search-beats').value.toLowerCase().trim();
    
    let filtered = localBeats;
    if (query) {
        filtered = localBeats.filter(b => b.name.toLowerCase().includes(query));
    }

    // Sort by name
    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #8a91a6; font-size: 13px; background: #1a1d24; border-radius: 8px;">No se encontraron beats. Clic en 'Nuevo Beat' para agregar.</div>`;
        return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(beat => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #1a1d24; border: 1px solid #2a2e39; border-radius: 8px; transition: all 0.2s;';
        
        // Count how many links it has
        let linksCount = 0;
        if (beat.mp3) linksCount++;
        if (beat.wav) linksCount++;
        if (beat.stems) linksCount++;

        const linksBadge = linksCount > 0 
            ? `<span style="font-size: 10px; background: #2a2e39; color: #a0aec0; padding: 2px 6px; border-radius: 4px; margin-left: 8px;"><i data-lucide="link" style="width:10px;height:10px;display:inline-block;margin-right:3px;"></i>${linksCount}</span>` 
            : '';

        const artworkImg = beat.artwork
            ? `<img src="${beat.artwork}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
            : `<i data-lucide="music" style="width: 18px; height: 18px; color: #a0aec0;"></i>`;

        let detailsText = '';
        if (beat.bpm) detailsText += `${beat.bpm} BPM`;
        if (beat.key) {
            if (detailsText) detailsText += ' • ';
            detailsText += beat.key;
        }
        if (beat.genre) {
            if (detailsText) detailsText += ' • ';
            detailsText += beat.genre;
        }
        const detailsHtml = detailsText 
            ? `<div style="font-size: 11px; color: #8a91a6; margin-top: 2px;">${detailsText}</div>`
            : '';

        item.innerHTML = `
            <div style="flex: 1; cursor: pointer; display: flex; align-items: center;" onclick="selectBeat('${beat.id}')">
                <div style="width: 44px; height: 44px; border-radius: 6px; background: #2a2e39; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; overflow: hidden;">
                    ${artworkImg}
                </div>
                <div>
                    <div style="font-weight: 500; font-size: 14px; color: #fff; display: flex; align-items: center;">${beat.name} ${linksBadge}</div>
                    ${detailsHtml}
                </div>
            </div>
            <div style="display: flex; gap: 5px; margin-left: 10px;">
                <button class="btn btn-secondary" title="Seleccionar para el contrato" onclick="selectBeat('${beat.id}')" style="padding: 6px 12px; background: var(--bs-blue-60); border-color: var(--bs-blue-60); color: #fff; font-size: 12px; height: 32px;">Usar</button>
                <button class="btn btn-secondary" title="Editar" onclick="openBeatForm('${beat.id}')" style="padding: 6px 10px; height: 32px;"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                <button class="btn btn-secondary" title="Eliminar" onclick="deleteBeat('${beat.id}')" style="padding: 6px 10px; height: 32px; color: var(--bs-red-50);"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
            </div>
        `;
        listContainer.appendChild(item);
    });

    safeCreateIcons();
    initTooltips();
}

// DOMContentLoaded: solo tooltips y subidas (initBeatsDB se mueve a initApp para que ocurra despues de que el usuario este establecido)
document.addEventListener('DOMContentLoaded', () => {
    initTooltips();
    initFileUploads();
    initClearInputHandlers();
    setupAdminPlanModalEvents();
    document.getElementById('btn-close-progress')?.addEventListener('click', () => {
        document.getElementById('email-progress-modal').style.display = 'none';
    });
});

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

// Variables para el control de subidas de archivos
let activeUploadTarget = null;
let activeUploadButton = null;

// Inicializar la funcionalidad de subida de archivos (MP3, WAV, Stems) con Google Drive como prioritario y Firebase como fallback
function initFileUploads() {
    const fileUploader = document.getElementById('shared-file-uploader');
    if (!fileUploader) return;

    // Escuchar clicks en cualquier botón de subida
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-upload-file');
        if (!btn) return;

        e.preventDefault();
        
        // Guardar destino y botón activo
        activeUploadTarget = btn.getAttribute('data-target');
        activeUploadButton = btn;
        
        // Configurar los tipos de archivo permitidos y disparar el selector
        const accept = btn.getAttribute('data-accept') || '*/*';
        fileUploader.setAttribute('accept', accept);
        fileUploader.value = ''; // Resetear
        fileUploader.click();
    });

    // Escuchar el cambio en el input de archivo (cuando el usuario selecciona un archivo)
    fileUploader.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !activeUploadTarget || !activeUploadButton) return;

        const originalBtnHTML = activeUploadButton.innerHTML;
        
        // Desactivar botón y cambiar a estado de carga
        activeUploadButton.disabled = true;
        activeUploadButton.style.opacity = '0.7';
        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando...`;
        if (window.lucide) window.lucide.createIcons();

        try {
            if (producerConfig.storageProvider === 'alternative') {
                throw new Error("Preferencia de almacenamiento establecida a servidores alternativos.");
            }
            
            let token;
            if (producerConfig.storageProvider === 'gdrive-central') {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Central...`;
                if (window.lucide) window.lucide.createIcons();
                token = await getCentralGdriveToken();
            } else {
                // Google Drive Personal (abrir popup)
                token = await getGdriveToken();
            }
            
            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo a Drive...`;
            
            // Subir usando Google Drive API
            const folderName = `${producerConfig.aka || producerConfig.name || 'BEATSS'} Licencias`;
            const rootId = await getOrCreateDriveFolder(token, folderName);
            const beatsFolderId = await getOrCreateDriveFolder(token, 'Beats', rootId);

            // Subir con barra de progreso
            const downloadURL = await uploadFileToDriveWithProgress(file, token, beatsFolderId, (progress) => {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${progress}%`;
            });

            // Escribir el enlace público en el input correspondiente
            const targetInput = document.getElementById(activeUploadTarget);
            if (targetInput) {
                targetInput.value = downloadURL;
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (typeof generatePreview === 'function') {
                    generatePreview();
                }
            }
            
            showToast("¡Archivo guardado en Google Drive con éxito!");
            
            // Mostrar estado exitoso brevemente
            activeUploadButton.disabled = false;
            activeUploadButton.style.opacity = '1';
            activeUploadButton.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: #48bb78;"></i> ¡Subido!`;
            if (window.lucide) window.lucide.createIcons();
            
            const btnRef = activeUploadButton;
            setTimeout(() => {
                if (btnRef.innerHTML.includes('check')) {
                    btnRef.innerHTML = originalBtnHTML;
                    if (window.lucide) window.lucide.createIcons();
                }
            }, 3000);

        } catch (driveErr) {
            console.warn("Fallo en la subida a Google Drive, intentando fallback a servidores alternativos:", driveErr);
            showToast("Usando servidores alternativos de respaldo...", false);
            
            // Fallback a servidores alternativos
            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo...`;
            if (window.lucide) window.lucide.createIcons();

            try {
                const downloadURL = await uploadAudioToAlternativeCloud(file);
                
                const targetInput = document.getElementById(activeUploadTarget);
                if (targetInput) {
                    targetInput.value = downloadURL;
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof generatePreview === 'function') {
                        generatePreview();
                    }
                }
                
                showToast("¡Archivo guardado en servidor alternativo!");
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: #48bb78;"></i> ¡Subido!`;
                if (window.lucide) window.lucide.createIcons();
                
                const btnRef = activeUploadButton;
                setTimeout(() => {
                    if (btnRef.innerHTML.includes('check')) {
                        btnRef.innerHTML = originalBtnHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }
                }, 3000);
            } catch (altErr) {
                console.error("Error al subir a servidores alternativos:", altErr);
                showToast("Error al subir el archivo.", true);
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = originalBtnHTML;
                if (window.lucide) window.lucide.createIcons();
            }
        }
    });
}

// Inicializar manejadores para borrar y volver a elegir archivos
function initClearInputHandlers() {
    // Escuchar el click en los botones de limpiar
    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                input.value = '';
                // Disparar eventos para actualizar cualquier vista/previsualización vinculada
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            btn.style.display = 'none';
        });
    });

    // Escuchar cambios en los inputs para mostrar/ocultar los botones dinámicamente
    const targets = [
        'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
        'audio-link-mp3', 'audio-link-wav', 'audio-link-stems'
    ];
    targets.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            const btn = document.querySelector(`.btn-clear-input[data-target="${id}"]`);
            if (btn) {
                const checkVisibility = () => {
                    if (input.value.trim() !== '') {
                        btn.style.display = 'flex';
                    } else {
                        btn.style.display = 'none';
                    }
                };
                input.addEventListener('input', checkVisibility);
                input.addEventListener('change', checkVisibility);
            }
        }
    });
    
    // Ejecutar verificación inicial
    updateClearButtonsVisibility();
}

// Actualizar la visibilidad de todos los botones de limpiar según si sus inputs tienen contenido
function updateClearButtonsVisibility() {
    const targets = [
        'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
        'audio-link-mp3', 'audio-link-wav', 'audio-link-stems'
    ];
    targets.forEach(id => {
        const input = document.getElementById(id);
        const btn = document.querySelector(`.btn-clear-input[data-target="${id}"]`);
        if (input && btn) {
            if (input.value.trim() !== '') {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        }
    });
}

// Subir un archivo binario a Google Drive usando XMLHttpRequest para monitorear el progreso
async function uploadFileToDriveWithProgress(file, token, folderId, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        // Construir la petición multipart estructurada
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: file.name,
            parents: [folderId]
        };

        const reader = new FileReader();
        reader.onload = function(e) {
            const fileData = e.target.result;
            const contentType = file.type || 'application/octet-stream';
            
            const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n';
            const mediaPart = 'Content-Type: ' + contentType + '\r\n\r\n';

            // Combinar partes en binario
            const ui8Metadata = new TextEncoder().encode(delimiter + metadataPart + delimiter + mediaPart);
            const ui8Close = new TextEncoder().encode(close_delim);
            
            const combined = new Uint8Array(ui8Metadata.length + fileData.byteLength + ui8Close.length);
            combined.set(ui8Metadata, 0);
            combined.set(new Uint8Array(fileData), ui8Metadata.length);
            combined.set(ui8Close, ui8Metadata.length + fileData.byteLength);

            xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);

            // Reportar progreso
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    if (onProgress) onProgress(percent);
                }
            });

            xhr.onreadystatechange = async () => {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const resJson = JSON.parse(xhr.responseText);
                            const fileId = resJson.id;
                            
                            // Hacer el archivo público para que cualquiera pueda descargarlo
                            try {
                                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'anyone', role: 'reader' })
                                });
                            } catch (permErr) {
                                console.warn("No se pudieron cambiar los permisos del archivo en Google Drive (posible restricción de la cuenta):", permErr);
                            }

                            const shareLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
                            resolve(shareLink);
                        } catch (err) {
                            reject(new Error("Error al hacer el archivo público o parsear la respuesta: " + err.message));
                        }
                    } else {
                        reject(new Error(`Error de subida a Google Drive (HTTP ${xhr.status}): ${xhr.responseText}`));
                    }
                }
            };

            xhr.send(combined);
        };
        
        reader.onerror = function(err) {
            reject(err);
        };

        reader.readAsArrayBuffer(file);
    });
}

// Subir archivo de audio a servidores alternativos como fallback si falla Google Drive
async function uploadAudioToAlternativeCloud(file) {
    // 1. Intentar con GoFile
    try {
        console.log('Subiendo audio a GoFile...');
        const serverResponse = await fetch('https://api.gofile.io/getServer');
        let server = 'store1';
        if (serverResponse.ok) {
            const serverData = await serverResponse.json();
            if (serverData.status === 'ok' && serverData.data && serverData.data.server) {
                server = serverData.data.server;
            }
        }
        
        const formData = new FormData();
        formData.append('file', file, file.name);
        
        const uploadResponse = await fetch(`https://${server}.gofile.io/uploadFile`, {
            method: 'POST',
            body: formData
        });
        
        if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            if (uploadData.status === 'ok' && uploadData.data && uploadData.data.downloadPage) {
                console.log('Subido audio a GoFile con éxito:', uploadData.data.downloadPage);
                return uploadData.data.downloadPage;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a GoFile:', e);
    }

    // 2. Intentar con PixelDrain
    try {
        console.log('Subiendo audio a PixelDrain...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://pixeldrain.com/api/file', {
            method: 'POST',
            body: formData,
            credentials: 'omit'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido audio a PixelDrain con éxito ID:', data.id);
                return `https://pixeldrain.com/api/file/${data.id}`;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a PixelDrain:', e);
    }

    // 3. Intentar con file.io
    try {
        console.log('Subiendo audio a file.io...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://file.io/', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido audio a file.io con éxito:', data.link);
                return data.link;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a file.io:', e);
    }

    // 4. Intentar con tmpfiles.org
    try {
        console.log('Subiendo audio a tmpfiles.org...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const viewerUrl = data.data.url;
                const downloadUrl = viewerUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log('Subido audio a tmpfiles.org con éxito:', downloadUrl);
                return downloadUrl;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a tmpfiles.org:', e);
    }

    throw new Error('No se pudo subir el archivo de audio a ningún servidor de almacenamiento alternativo.');
}

// Cargar la contabilidad consolidada de todos los productores (Sossa Admin)
async function loadConsolidatedAccounting() {
    if (!window.currentUserIsAdmin) return;
    
    // Cargar también las solicitudes de pago pendientes
    await loadPendingPaymentsAdmin();
    
    // Cargar también los códigos VIP
    await loadVipCodesAdmin();
    
    const tbody = document.getElementById('admin-table-body');
    const emptyEl = document.getElementById('admin-empty');
    const usersTbody = document.getElementById('admin-users-table-body');
    
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando datos consolidados...
            </td>
        </tr>
    `;
    if (emptyEl) emptyEl.style.display = 'none';

    if (usersTbody) {
        usersTbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 20px; text-align: center; color: #a0aec0;">
                    <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                    Cargando productores registrados...
                </td>
            </tr>
        `;
    }

    let allLicenses = [];
    let uniqueUsers = new Set();
    let totalRevenue = 0;
    let producerConfigs = [];

    try {
        // Query across all "licencias" subcollections
        const licenciasQuery = collectionGroup(db, "licencias");
        const querySnapshot = await getDocs(licenciasQuery);
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allLicenses.push(data);
            
            // Extraer el uid del path para contar productores únicos
            const pathSegments = docSnap.ref.path.split('/');
            if (pathSegments.length >= 2 && pathSegments[0] === 'users') {
                uniqueUsers.add(pathSegments[1]);
            }
        });

        // Ordenar por fecha descendente
        allLicenses.sort((a, b) => {
            const dateA = a.date || "";
            const dateB = b.date || "";
            return dateB.localeCompare(dateA);
        });

        // Calcular ingresos totales y poblar la tabla
        tbody.innerHTML = '';
        
        if (allLicenses.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            allLicenses.forEach(lic => {
                // Sumar valor
                const valueNum = parseFloat(lic.value) || 0;
                totalRevenue += valueNum;

                // Crear fila
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                // Obtener nombre del productor o usar aka
                const producerName = lic.producerConfig?.aka || lic.producerConfig?.name || "Desconocido";

                tr.innerHTML = `
                    <td style="padding: 12px 10px;">
                        <span style="font-weight: 500; color: #fff;">${producerName}</span>
                    </td>
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 12px; color: #a0aec0;">
                        ${lic.refCode || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${lic.date || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px;">
                        <div style="font-weight: 500; color: #fff;">${lic.beatName || 'N/A'}</div>
                    </td>
                    <td style="padding: 12px 10px;">
                        <div style="color: #cbd5e0;">${lic.buyerName || 'N/A'}</div>
                        <div style="font-size: 11px; color: #718096;">${lic.formData?.buyerEmail || ''}</div>
                    </td>
                    <td style="padding: 12px 10px;">
                        <span style="font-size: 11px; background: #2d3748; color: #cbd5e0; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                            ${lic.type || 'N/A'}
                        </span>
                    </td>
                    <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: var(--bs-green-50);">
                        $${valueNum.toFixed(2)}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Obtener todos los productores (config) registrados
        const configQuery = collectionGroup(db, "config");
        const configSnapshot = await getDocs(configQuery);
        
        configSnapshot.forEach((docSnap) => {
            if (docSnap.id === 'producer') {
                const data = docSnap.data();
                const pathSegments = docSnap.ref.path.split('/');
                let userId = '';
                if (pathSegments.length >= 2 && pathSegments[0] === 'users') {
                    userId = pathSegments[1];
                } else {
                    userId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : '';
                }
                producerConfigs.push({
                    userId,
                    ...data
                });
            }
        });

        // Ordenar productores: Sossa siempre primero, luego alfabéticamente por AKA o nombre
        producerConfigs.sort((a, b) => {
            const emailA = (a.email || "").toLowerCase();
            const emailB = (b.email || "").toLowerCase();
            if (emailA === 'masterjuego25@gmail.com') return -1;
            if (emailB === 'masterjuego25@gmail.com') return 1;
            
            const akaA = (a.aka || a.name || a.email || "").toLowerCase();
            const akaB = (b.aka || b.name || b.email || "").toLowerCase();
            return akaA.localeCompare(akaB);
        });


        // Poblar la tabla de productores registrados
        if (usersTbody) {
            usersTbody.innerHTML = '';
            if (producerConfigs.length === 0) {
                usersTbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="padding: 20px; text-align: center; color: #8a91a6;">
                            No hay productores registrados.
                        </td>
                    </tr>
                `;
            } else {
                producerConfigs.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #2a2e39';

                    // Formatear plan
                    const plan = (user.plan || 'inicial').toLowerCase();
                    let planBadge = '';
                    if (plan === 'pro') {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(0, 102, 255, 0.2); color: #33b5ff; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(0, 102, 255, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">Pro ⚡</span>`;
                    } else if (plan === 'elite') {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(212, 175, 55, 0.2); color: #ffd700; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(212, 175, 55, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Elite 👑</span>`;
                    } else {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(138, 145, 166, 0.2); color: #8a91a6; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(138, 145, 166, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">Inicial</span>`;
                    }

                    // Formatear fecha de vencimiento
                    let expStr = 'No aplica';
                    if ((plan === 'pro' || plan === 'elite') && user.expirationPro) {
                        const expDate = new Date(user.expirationPro);
                        if (!isNaN(expDate.getTime())) {
                            const formattedDate = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            if (expDate < new Date()) {
                                expStr = `<span style="color: #f56565; font-weight: 500;">${formattedDate} (Expirado)</span>`;
                            } else {
                                expStr = `<span style="color: #cbd5e0;">${formattedDate}</span>`;
                            }
                        } else {
                            expStr = `<span style="color: #718096;">Sin fecha</span>`;
                        }
                    }

                    tr.innerHTML = `
                        <td style="padding: 12px 10px;">
                            <span style="font-weight: 600; color: #fff;">${user.aka || 'Sin AKA'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0;">${user.name || 'Sin Nombre'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #a0aec0; font-size: 13px;">${user.email || 'N/A'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0; font-size: 13px;">${user.phone || 'N/A'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            ${planBadge}
                        </td>
                        <td style="padding: 12px 10px;">
                            ${expStr}
                        </td>
                        <td style="padding: 12px 10px; text-align: right;">
                            <button class="btn btn-secondary btn-icon-only btn-admin-edit-plan tooltip-left" data-user-id="${user.userId}" data-user-email="${user.email || ''}" data-user-name="${user.name || ''}" data-user-aka="${user.aka || ''}" data-user-plan="${plan}" data-user-exp="${user.expirationPro || ''}" title="Modificar plan de este productor" style="display: inline-flex; width: 28px; height: 28px; border-radius: 6px; padding: 0; justify-content: center; align-items: center;">
                                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                            </button>
                        </td>
                    `;
                    usersTbody.appendChild(tr);
                });

                // Vincular eventos de click para cambiar plan
                document.querySelectorAll('.btn-admin-edit-plan').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget;
                        const userId = target.getAttribute('data-user-id');
                        const userEmail = target.getAttribute('data-user-email');
                        const userName = target.getAttribute('data-user-name');
                        const userAka = target.getAttribute('data-user-aka');
                        const userPlan = target.getAttribute('data-user-plan');
                        const userExp = target.getAttribute('data-user-exp');
                        
                        openAdminPlanModal(userId, userEmail, userName, userAka, userPlan, userExp);
                    });
                });
            }
        }

        // Actualizar widgets de resumen
        const totalCollectedEl = document.getElementById('admin-stat-total-collected');
        const totalLicensesEl = document.getElementById('admin-stat-total-licenses');
        const totalUsersEl = document.getElementById('admin-stat-total-users');

        if (totalCollectedEl) totalCollectedEl.textContent = `$${totalRevenue.toFixed(2)} USD`;
        if (totalLicensesEl) totalLicensesEl.textContent = allLicenses.length;
        if (totalUsersEl) totalUsersEl.textContent = producerConfigs.length;

    } catch (err) {
        console.error("Error al cargar contabilidad consolidada:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar datos consolidados de la nube: ${err.message}
                </td>
            </tr>
        `;
        if (usersTbody) {
            usersTbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                        Error al cargar productores registrados: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
    
    safeCreateIcons();
    initTooltips();
}

// Variable global y funciones para asignación manual de planes (Solo Sossa Admin)
let adminSelectedUserId = '';

function openAdminPlanModal(userId, email, name, aka, plan, expirationPro) {
    adminSelectedUserId = userId;
    
    const modal = document.getElementById('admin-plan-modal');
    const nameEl = document.getElementById('admin-plan-user-name');
    const emailEl = document.getElementById('admin-plan-user-email');
    const planSelect = document.getElementById('admin-plan-select');
    const durationSelect = document.getElementById('admin-plan-duration');
    const dateInput = document.getElementById('admin-plan-date');
    const dateContainer = document.getElementById('admin-plan-date-container');
    const durationContainer = document.getElementById('admin-plan-duration-container');
    const statusEl = document.getElementById('admin-plan-status');
    
    if (!modal) return;
    
    nameEl.textContent = `${aka || 'Sin AKA'} (${name || 'Sin Nombre'})`;
    emailEl.textContent = email;
    planSelect.value = plan || 'inicial';
    
    // Configurar campos según el plan
    if (plan === 'inicial') {
        durationContainer.style.display = 'none';
        dateContainer.style.display = 'none';
    } else {
        durationContainer.style.display = 'block';
        if (expirationPro) {
            durationSelect.value = 'custom';
            try {
                const d = new Date(expirationPro);
                if (!isNaN(d.getTime())) {
                    dateInput.value = d.toISOString().split('T')[0];
                    dateContainer.style.display = 'block';
                } else {
                    dateInput.value = '';
                    dateContainer.style.display = 'none';
                }
            } catch (err) {
                dateInput.value = '';
                dateContainer.style.display = 'none';
            }
        } else {
            durationSelect.value = 'no-expire';
            dateInput.value = '';
            dateContainer.style.display = 'none';
        }
    }
    
    statusEl.style.display = 'none';
    modal.style.display = 'flex';
    safeCreateIcons();
}

function setupAdminPlanModalEvents() {
    const modal = document.getElementById('admin-plan-modal');
    const closeBtn = document.getElementById('btn-close-admin-plan');
    const cancelBtn = document.getElementById('btn-cancel-admin-plan');
    const saveBtn = document.getElementById('btn-save-admin-plan');
    const planSelect = document.getElementById('admin-plan-select');
    const durationSelect = document.getElementById('admin-plan-duration');
    const dateInput = document.getElementById('admin-plan-date');
    const dateContainer = document.getElementById('admin-plan-date-container');
    const durationContainer = document.getElementById('admin-plan-duration-container');
    const statusEl = document.getElementById('admin-plan-status');
    
    if (!modal) return;
    
    const hideModal = () => {
        modal.style.display = 'none';
    };
    
    closeBtn.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);
    
    planSelect.addEventListener('change', () => {
        const val = planSelect.value;
        if (val === 'inicial') {
            durationContainer.style.display = 'none';
            dateContainer.style.display = 'none';
        } else {
            durationContainer.style.display = 'block';
            if (durationSelect.value === 'custom') {
                dateContainer.style.display = 'block';
            } else {
                dateContainer.style.display = 'none';
            }
        }
    });
    
    durationSelect.addEventListener('change', () => {
        if (durationSelect.value === 'custom') {
            dateContainer.style.display = 'block';
        } else {
            dateContainer.style.display = 'none';
        }
    });
    
    saveBtn.addEventListener('click', async () => {
        if (!adminSelectedUserId) return;
        
        statusEl.textContent = 'Guardando cambios...';
        statusEl.style.color = '#ffd700';
        statusEl.style.display = 'block';
        saveBtn.disabled = true;
        
        try {
            const selectedPlan = planSelect.value;
            let expirationPro = null;
            
            if (selectedPlan !== 'inicial') {
                const durationVal = durationSelect.value;
                if (durationVal === 'no-expire') {
                    expirationPro = null;
                } else if (durationVal === 'custom') {
                    if (!dateInput.value) {
                        throw new Error('Por favor, selecciona una fecha de vencimiento.');
                    }
                    expirationPro = new Date(dateInput.value).toISOString();
                } else {
                    const months = parseInt(durationVal) || 1;
                    const d = new Date();
                    d.setMonth(d.getMonth() + months);
                    expirationPro = d.toISOString();
                }
            }
            
            // 1. Actualizar en config/producer
            const configRef = doc(db, 'users', adminSelectedUserId, 'config', 'producer');
            const configUpdates = {
                plan: selectedPlan,
                planActivatedAt: new Date().toISOString(),
                planPayPalOrderId: 'manual_admin_activation',
                planPayerEmail: document.getElementById('admin-plan-user-email').textContent
            };
            
            // Si es inicial o no expira, expirationPro es null
            configUpdates.expirationPro = expirationPro;
            
            await setDoc(configRef, configUpdates, { merge: true });
            
            // 2. Actualizar en el documento principal del usuario
            const userRef = doc(db, 'users', adminSelectedUserId);
            const userUpdates = {
                plan: selectedPlan,
                planActivatedAt: new Date().toISOString()
            };
            await setDoc(userRef, userUpdates, { merge: true });
            
            statusEl.textContent = '¡Plan actualizado exitosamente!';
            statusEl.style.color = '#10b981';
            
            setTimeout(() => {
                hideModal();
                saveBtn.disabled = false;
                loadConsolidatedAccounting();
            }, 1000);
            
        } catch (err) {
            console.error('Error al actualizar plan manual:', err);
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#ef4444';
            saveBtn.disabled = false;
        }
    });
}

// ==========================================
// DASHBOARD DE VENTAS Y ANALÍTICAS (JS LOGIC)
// ==========================================

async function updateDashboardView() {
    const periodVal = document.getElementById('dashboard-period')?.value || 'all';
    
    // 1. Filtrar el historial según el periodo seleccionado
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthPrefix = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = `${currentYear}`;

    const filtered = licenseHistory.filter(lic => {
        if (!lic.date) return false;
        
        // Formato esperado de fecha: YYYY-MM-DD
        const licDate = new Date(lic.date);
        
        if (periodVal === '30') {
            const diffTime = Math.abs(now - licDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        } else if (periodVal === 'month') {
            return lic.date.startsWith(currentMonthPrefix);
        } else if (periodVal === 'year') {
            return lic.date.startsWith(currentYearPrefix);
        }
        return true; // 'all'
    });

    // 2. Calcular Métricas KPI
    let totalRevenue = 0;
    let beatsSet = new Set();
    let buyersMap = {}; // nombre -> { count: 0, total: 0, email: '' }

    filtered.forEach(lic => {
        const val = parseFloat(lic.value) || 0;
        totalRevenue += val;
        if (lic.beatName) beatsSet.add(lic.beatName);
        
        if (lic.buyerName) {
            const bName = lic.buyerName;
            if (!buyersMap[bName]) {
                buyersMap[bName] = { count: 0, total: 0, email: lic.formData?.buyerEmail || '' };
            }
            buyersMap[bName].count++;
            buyersMap[bName].total += val;
        }
    });

    // Determinar Top Buyer
    let topBuyerName = 'N/A';
    let topBuyerVal = 0;
    Object.keys(buyersMap).forEach(name => {
        if (buyersMap[name].total > topBuyerVal) {
            topBuyerVal = buyersMap[name].total;
            topBuyerName = name;
        }
    });

    // 3. Renderizar KPIs en el DOM
    const revenueEl = document.getElementById('db-stat-revenue');
    const licensesEl = document.getElementById('db-stat-licenses');
    const beatsEl = document.getElementById('db-stat-beats');
    const topClientEl = document.getElementById('db-stat-top-client');

    if (revenueEl) revenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
    if (licensesEl) licensesEl.textContent = filtered.length;
    if (beatsEl) beatsEl.textContent = beatsSet.size;
    if (topClientEl) {
        topClientEl.textContent = topBuyerName !== 'N/A' 
            ? `${topBuyerName} ($${topBuyerVal.toFixed(2)})`
            : 'N/A';
        topClientEl.setAttribute('title', topBuyerName);
    }

    // 4. Renderizar Gráficos y Tablas
    renderMonthlySalesChart(filtered);
    renderLicenseTypesChart(filtered);
    renderTopBeatsChart(filtered);
    renderTopBuyersTable(buyersMap);

    // Reinicializar iconos y tooltips
    safeCreateIcons();
    initTooltips();
}

// GRAFICO 1: Historial de Ventas Mensuales (SVG interactivo de línea/área)
function renderMonthlySalesChart(licenses) {
    const container = document.getElementById('monthly-sales-chart-container');
    if (!container) return;

    // Obtener los últimos 6 meses cronológicos
    const monthsData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const monthLabel = d.toLocaleString('es', { month: 'short' });
        monthsData.push({
            prefix: `${yyyy}-${mm}`,
            label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            revenue: 0,
            count: 0
        });
    }

    // Sumar ingresos de licencias por mes
    licenses.forEach(lic => {
        if (!lic.date) return;
        const licPrefix = lic.date.substring(0, 7);
        const mData = monthsData.find(m => m.prefix === licPrefix);
        if (mData) {
            mData.revenue += parseFloat(lic.value) || 0;
            mData.count++;
        }
    });

    // Calcular dimensiones del gráfico
    const width = 500;
    const height = 220;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    // Calcular valores Y max
    const maxVal = Math.max(...monthsData.map(d => d.revenue), 10);
    const yMax = Math.ceil(maxVal / 10) * 10; // Redondear hacia arriba

    // Generar líneas de cuadrícula y etiquetas Y
    let yGridHtml = '';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
        const yVal = (yMax / yTicks) * i;
        const yPos = height - paddingBottom - ((height - paddingTop - paddingBottom) / yTicks) * i;
        yGridHtml += `
            <line class="chart-grid-line" x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" />
            <text class="chart-axis-text" x="${paddingLeft - 8}" y="${yPos + 4}" text-anchor="end">$${yVal.toFixed(0)}</text>
        `;
    }

    // Calcular puntos de datos
    const points = [];
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    monthsData.forEach((d, i) => {
        const x = paddingLeft + (chartWidth / 5) * i;
        const y = height - paddingBottom - (d.revenue / yMax) * chartHeight;
        points.push({ x, y, label: d.label, revenue: d.revenue, count: d.count });
    });

    // Construir trazado del área y de la línea
    let linePathStr = '';
    let areaPathStr = '';

    if (points.length > 0) {
        linePathStr = `M ${points[0].x} ${points[0].y}`;
        areaPathStr = `M ${points[0].x} ${height - paddingBottom} L ${points[0].x} ${points[0].y}`;
        
        for (let i = 1; i < points.length; i++) {
            linePathStr += ` L ${points[i].x} ${points[i].y}`;
            areaPathStr += ` L ${points[i].x} ${points[i].y}`;
        }
        areaPathStr += ` L ${points[points.length - 1].x} ${height - paddingBottom} Z`;
    }

    // Dibujar X axis labels
    let xLabelsHtml = '';
    points.forEach(p => {
        xLabelsHtml += `
            <text class="chart-axis-text" x="${p.x}" y="${height - 10}" text-anchor="middle">${p.label}</text>
        `;
    });

    // Dibujar los círculos interactivos
    let dotsHtml = '';
    points.forEach((p, idx) => {
        dotsHtml += `
            <circle class="chart-dot" cx="${p.cx || p.x}" cy="${p.cy || p.y}" r="5" 
                    data-month="${p.label}" data-revenue="${p.revenue}" data-count="${p.count}"
                    onmouseover="showChartTooltip(event)" onmouseout="hideChartTooltip()" />
        `;
    });

    // Renderizar el SVG completo
    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
            <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            
            <!-- Cuadrícula e Ejes -->
            ${yGridHtml}
            <line class="chart-axis-line" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" />
            
            <!-- Área y Línea -->
            <path class="chart-area" d="${areaPathStr}" />
            <path class="chart-line" d="${linePathStr}" />
            
            <!-- Textos y Círculos -->
            ${xLabelsHtml}
            ${dotsHtml}
        </svg>
        <div class="chart-tooltip-bubble" id="sales-chart-tooltip"></div>
    `;
}

// Tooltips flotantes interactivos de SVG
window.showChartTooltip = function(e) {
    const dot = e.target;
    const tooltip = document.getElementById('sales-chart-tooltip');
    if (!tooltip) return;

    const month = dot.getAttribute('data-month');
    const revenue = parseFloat(dot.getAttribute('data-revenue')).toFixed(2);
    const count = dot.getAttribute('data-count');

    tooltip.innerHTML = `
        <div style="font-weight:700; color:#fff;">${month}</div>
        <div style="color:var(--accent); margin-top:2px;">Ventas: $${revenue}</div>
        <div style="font-size:10px; color:#a0aec0; margin-top:2px;">${count} Licencia(s)</div>
    `;

    // Posicionar tooltip relativo al contenedor
    const rect = dot.getBoundingClientRect();
    const containerRect = dot.closest('.chart-container').getBoundingClientRect();
    
    tooltip.style.left = `${rect.left - containerRect.left + (rect.width / 2)}px`;
    tooltip.style.top = `${rect.top - containerRect.top}px`;
    tooltip.style.opacity = '1';
};

window.hideChartTooltip = function() {
    const tooltip = document.getElementById('sales-chart-tooltip');
    if (tooltip) tooltip.style.opacity = '0';
};

// GRAFICO 2: Distribución por Tipo de Licencia (Donut SVG + Leyenda)
function renderLicenseTypesChart(licenses) {
    const container = document.getElementById('license-types-chart-container');
    if (!container) return;

    if (licenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096;">
                <i data-lucide="pie-chart" style="width: 48px; height: 48px; stroke-width: 1.5; color: #4a5568; margin-bottom: 8px;"></i>
                <div style="font-size: 13px;">Sin datos para clasificar</div>
            </div>
        `;
        return;
    }

    // Contar tipos de licencia
    const typesCount = {};
    licenses.forEach(lic => {
        const type = lic.type || "Desconocido";
        typesCount[type] = (typesCount[type] || 0) + 1;
    });

    // Definir colores y mapear segmentos
    const colors = {
        "Básica": "#3b82f6",     // Azul
        "Premium": "#10b981",    // Verde
        "Ilimitada": "#f59e0b",  // Naranja
        "Exclusiva": "#a855f7",   // Violeta
        "Desconocido": "#718096" // Gris
    };

    const segments = Object.keys(typesCount).map(type => {
        const count = typesCount[type];
        const pct = (count / licenses.length) * 100;
        return {
            type,
            count,
            pct,
            color: colors[type] || "#718096"
        };
    });

    // Dibujar Donut SVG
    let svgHtml = '';
    let accumulatedAngle = 0;
    const r = 50;
    const cx = 80;
    const cy = 100;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * r; // ~314.16

    segments.forEach(seg => {
        const dashArray = `${circ}`;
        const dashOffset = circ - (seg.pct / 100) * circ;
        const rotate = (accumulatedAngle * 3.6) - 90; // Convertir a grados y girar 90
        
        svgHtml += `
            <circle cx="${cx}" cy="${cy}" r="${r}" 
                    fill="none" 
                    stroke="${seg.color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${dashArray}" 
                    stroke-dashoffset="${dashOffset}"
                    transform="rotate(${rotate} ${cx} ${cy})"
                    style="transition: stroke-dashoffset 0.6s ease;"
                    data-tooltip="${seg.type}: ${seg.count} (${seg.pct.toFixed(1)}%)" />
        `;
        accumulatedAngle += seg.pct;
    });

    // Si solo hay un tipo, o para cerrar el fondo
    if (segments.length === 0) {
        svgHtml = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2d3748" stroke-width="${strokeWidth}" />`;
    }

    // Construir la leyenda
    let legendHtml = '<div style="display:flex; flex-direction:column; gap:10px; margin-left: 20px; flex: 1;">';
    segments.forEach(seg => {
        legendHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #cbd5e0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${seg.color};"></span>
                    <span style="font-weight: 500;">${seg.type}</span>
                </div>
                <div style="font-weight: 700; color: #fff;">
                    ${seg.count} <span style="font-size: 11px; font-weight: 500; color: #718096; margin-left: 2px;">(${seg.pct.toFixed(0)}%)</span>
                </div>
            </div>
        `;
    });
    legendHtml += '</div>';

    container.innerHTML = `
        <div style="display: flex; width: 100%; align-items: center;">
            <svg viewBox="0 0 160 200" style="width: 140px; height: 140px;">
                <!-- Fondo vacío para el donut -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1d2026" stroke-width="${strokeWidth}" />
                ${svgHtml}
                <!-- Texto en el centro -->
                <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">${licenses.length}</text>
                <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#718096" font-size="8" font-weight="600" text-transform="uppercase" letter-spacing="0.5">Ventas</text>
            </svg>
            ${legendHtml}
        </div>
    `;
}

// GRAFICO 3: Top 5 Beats Más Vendidos (Progress Bars horizontales)
function renderTopBeatsChart(licenses) {
    const container = document.getElementById('top-beats-chart-container');
    if (!container) return;

    if (licenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096; padding: 20px 0;">
                <i data-lucide="music-4" style="width: 48px; height: 48px; stroke-width: 1.5; color: #4a5568; margin-bottom: 8px;"></i>
                <div style="font-size: 13px;">No hay ventas registradas</div>
            </div>
        `;
        return;
    }

    // Contar beats
    const beatsCount = {};
    licenses.forEach(lic => {
        if (lic.beatName) {
            beatsCount[lic.beatName] = (beatsCount[lic.beatName] || 0) + 1;
        }
    });

    // Ordenar y tomar los top 5
    const topBeats = Object.keys(beatsCount)
        .map(name => ({ name, count: beatsCount[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const maxCount = topBeats.length > 0 ? topBeats[0].count : 1;

    let barsHtml = '';
    topBeats.forEach((beat, index) => {
        const pct = (beat.count / maxCount) * 100;
        
        // Asignar colores dinámicos basados en la posición
        const colors = [
            "linear-gradient(90deg, #a855f7 0%, #d8b4fe 100%)", // Top 1: Violeta Sparkle
            "linear-gradient(90deg, #3b82f6 0%, #93c5fd 100%)", // Top 2: Azul Neon
            "linear-gradient(90deg, #10b981 0%, #6ee7b7 100%)", // Top 3: Esmeralda
            "linear-gradient(90deg, #f59e0b 0%, #fcd34d 100%)", // Top 4: Ámbar
            "linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)"  // Top 5: Gris
        ];
        const barColor = colors[index] || colors[4];

        barsHtml += `
            <div class="horizontal-bar-row">
                <div class="horizontal-bar-label-container">
                    <span style="font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">
                        ${index + 1}. ${beat.name}
                    </span>
                    <span style="font-weight: 700; color: var(--accent);">${beat.count} venta(s)</span>
                </div>
                <div class="horizontal-bar-track">
                    <div class="horizontal-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = barsHtml;
}

// TABLA 4: Compradores Destacados
function renderTopBuyersTable(buyersMap) {
    const tbody = document.getElementById('db-top-buyers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const buyers = Object.keys(buyersMap)
        .map(name => ({
            name,
            count: buyersMap[name].count,
            total: buyersMap[name].total,
            email: buyersMap[name].email
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    if (buyers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 20px; color: #718096; font-size: 13px;">
                    No hay registros de clientes en este período.
                </td>
            </tr>
        `;
        return;
    }

    buyers.forEach(buyer => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.03)';
        tr.innerHTML = `
            <td style="padding: 10px 0;">
                <div style="font-weight: 600; color: #fff;">${buyer.name}</div>
                <div style="font-size: 11px; color: #718096; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${buyer.email || 'Sin correo'}</div>
            </td>
            <td style="padding: 10px 0; text-align: center; font-weight: 600; color: #cbd5e0;">
                ${buyer.count}
            </td>
            <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #10b981;">
                $${buyer.total.toFixed(2)}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Helper functions for Visual Mailing Progress Modal
function showProgressModal(title, subtitle, step1Text = "Generar PDF de Licencia", step2Text = "Subir contrato a la nube", step3Text = "Enviar correo de entrega") {
    const modal = document.getElementById('email-progress-modal');
    if (!modal) return;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    // Reset steps
    resetProgressStep('step-pdf', 'file-text', step1Text);
    resetProgressStep('step-cloud', 'cloud-lightning', step2Text);
    resetProgressStep('step-email', 'send', step3Text);
    
    // Hide close button
    const closeBtn = document.getElementById('btn-close-progress');
    closeBtn.style.display = 'none';
    
    // Reset spinner / icon
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid rgba(0, 102, 255, 0.1); border-top-color: var(--accent); animation: spin 1s linear infinite; position: absolute;"></div>
            <i data-lucide="mail" style="width: 28px; height: 28px; color: var(--accent);"></i>
        </div>
    `;
    
    modal.style.display = 'flex';
    safeCreateIcons();
}

function resetProgressStep(stepId, iconName, labelText) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    stepEl.style.color = '#626475';
    stepEl.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: #626475;"></i>
            <span>${labelText}</span>
        </span>
        <span class="step-status" style="font-weight: 700;">Esperando...</span>
    `;
}

function updateProgressStep(stepId, statusText, isCompleted, isError = false) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    
    const statusEl = stepEl.querySelector('.step-status');
    const iconEl = stepEl.querySelector('i');
    
    if (isError) {
        stepEl.style.color = 'var(--danger)';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--danger)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--danger)';
            iconEl.setAttribute('data-lucide', 'alert-triangle');
        }
    } else if (isCompleted) {
        stepEl.style.color = '#f5f5f9';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--success)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--success)';
            iconEl.setAttribute('data-lucide', 'check-circle-2');
        }
    } else {
        stepEl.style.color = '#f5f5f9';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--accent)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--accent)';
        }
    }
    safeCreateIcons();
}

function showProgressSuccess(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(0, 230, 118, 0.1); border: 2px solid var(--success); display: flex; align-items: center; justify-content: center; animation: scaleUp 0.3s ease-out;">
            <i data-lucide="check" style="width: 40px; height: 40px; color: var(--success);"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    closeBtn.style.display = 'inline-flex';
    
    safeCreateIcons();
}

function showProgressError(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 79, 112, 0.1); border: 2px solid var(--danger); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="x" style="width: 40px; height: 40px; color: var(--danger);"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    closeBtn.style.display = 'inline-flex';
    
    safeCreateIcons();
}

// Cargar solicitudes de pago local pendientes para Sossa Admin
async function loadPendingPaymentsAdmin() {
    if (!window.currentUserIsAdmin) return;
    
    const container = document.getElementById('admin-payments-container');
    const tbody = document.getElementById('admin-payments-table-body');
    const emptyEl = document.getElementById('admin-payments-empty');
    
    if (!container || !tbody) return;
    
    // Mostrar el contenedor para el administrador
    container.style.display = 'block';
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando solicitudes de pago...
            </td>
        </tr>
    `;
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        const paymentsCol = collection(db, "payments");
        // Consulta para obtener solicitudes pendientes
        const q = query(paymentsCol, where("status", "==", "pending"), orderBy("timestamp", "desc"));
        
        let querySnapshot;
        try {
            querySnapshot = await getDocs(q);
        } catch (indexErr) {
            console.warn("Fallo orderBy en pagos, intentando consulta simple sin orden", indexErr);
            const simpleQ = query(paymentsCol, where("status", "==", "pending"));
            querySnapshot = await getDocs(simpleQ);
        }

        const pendingPayments = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            pendingPayments.push({ id: docSnap.id, ...data });
        });

        // Ordenar en memoria si falló la consulta ordenada
        if (pendingPayments.length > 0 && !q.toString().includes('orderBy')) {
            pendingPayments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        }

        tbody.innerHTML = '';
        
        if (pendingPayments.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            pendingPayments.forEach(pay => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                // Formatear fecha
                const dateStr = pay.timestamp ? pay.timestamp.split('T')[0] : 'N/A';
                
                tr.innerHTML = `
                    <td style="padding: 12px 10px;">
                        <div style="font-weight: 600; color: #fff;">${pay.userEmail}</div>
                        <div style="font-size: 11px; color: #718096; font-family: monospace;">UID: ${pay.userId}</div>
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0;">
                        ${pay.aka || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        <span style="display:inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${pay.plan === 'elite' ? 'rgba(236,72,153,0.15)' : 'rgba(168,85,247,0.15)'}; color: ${pay.plan === 'elite' ? '#ec4899' : '#a855f7'}; border: 1px solid ${pay.plan === 'elite' ? 'rgba(236,72,153,0.3)' : 'rgba(168,85,247,0.3)'};">
                            ${pay.plan ? pay.plan.toUpperCase() : 'PRO'}
                        </span>
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${pay.method || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 12px; color: #a0aec0;">
                        ${pay.reference || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${dateStr}
                    </td>
                    <td style="padding: 12px 10px; text-align: center;">
                        <button type="button" class="btn btn-secondary" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;" onclick="viewReceiptLarge('${pay.receiptUrl}')">
                            <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Ver
                        </button>
                    </td>
                    <td style="padding: 12px 10px; text-align: right;">
                        <div style="display: inline-flex; gap: 6px;">
                            <button type="button" class="btn btn-success" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #10b981; color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="approvePaymentAdmin('${pay.id}', '${pay.userId}', '${pay.userEmail}')">
                                <i data-lucide="check" style="width: 12px; height: 12px;"></i> Aprobar
                            </button>
                            <button type="button" class="btn btn-danger" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #ef4444; color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="rejectPaymentAdmin('${pay.id}')">
                                <i data-lucide="x" style="width: 12px; height: 12px;"></i> Rechazar
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Error al cargar solicitudes de pago pendientes:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar pagos pendientes: ${err.message}
                </td>
            </tr>
        `;
    }
    
    safeCreateIcons();
}

// Funciones globales para que onclick de HTML las pueda usar
window.viewReceiptLarge = function(receiptUrl) {
    const modal = document.getElementById('admin-receipt-preview-modal');
    const img = document.getElementById('admin-receipt-preview-large-img');
    if (modal && img) {
        img.src = receiptUrl;
        modal.style.display = 'flex';
    }
};

window.approvePaymentAdmin = async function(paymentId, userId, userEmail) {
    if (!confirm(`¿Estás seguro de aprobar este pago y activar la suscripción del usuario?`)) return;
    
    try {
        // 1. Obtener detalles del pago para saber qué plan se solicitó
        const paymentDocRef = doc(db, "payments", paymentId);
        const paymentSnap = await getDoc(paymentDocRef);
        const paymentData = paymentSnap.exists() ? paymentSnap.data() : {};
        const targetPlan = paymentData.plan || 'pro';
        
        // 2. Actualizar el plan del usuario en Firestore en su config
        const configDocRef = doc(db, "users", userId, "config", "producer");
        const docSnap = await getDoc(configDocRef);
        
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        let newConfig = {};
        if (docSnap.exists()) {
            newConfig = { 
                ...docSnap.data(), 
                plan: targetPlan, 
                expirationPro: thirtyDaysLater.toISOString() 
            };
        } else {
            newConfig = {
                plan: targetPlan,
                expirationPro: thirtyDaysLater.toISOString(),
                name: "Productor",
                email: userEmail,
                aka: "Productor"
            };
        }
        
        await setDoc(configDocRef, newConfig);
        
        // 3. Actualizar en el documento raíz del usuario
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            plan: targetPlan,
            planActivatedAt: now.toISOString(),
        }, { merge: true });
        
        // 4. Actualizar el estado del pago en la colección payments a 'approved'
        await updateDoc(paymentDocRef, {
            status: 'approved',
            approvedAt: now.toISOString()
        });
        
        alert(`Plan ${targetPlan.toUpperCase()} activado con éxito para ${userEmail}.`);
        
        // 3. Recargar datos del panel admin
        await loadPendingPaymentsAdmin();
        await loadConsolidatedAccounting();
    } catch (err) {
        console.error("Error al aprobar pago:", err);
        alert('Error al aprobar pago: ' + err.message);
    }
};

window.rejectPaymentAdmin = async function(paymentId) {
    if (!confirm('¿Estás seguro de rechazar este pago? El usuario no recibirá el plan Pro.')) return;
    
    try {
        const paymentDocRef = doc(db, "payments", paymentId);
        await updateDoc(paymentDocRef, {
            status: 'rejected',
            rejectedAt: new Date().toISOString()
        });
        
        alert('Pago rechazado.');
        
        // Recargar datos
        await loadPendingPaymentsAdmin();
    } catch (err) {
        console.error("Error al rechazar pago:", err);
        alert('Error al rechazar pago: ' + err.message);
    }
};

// Bind module functions to global window object for inline onclick attributes
window.selectBeat = selectBeat;
window.openBeatForm = openBeatForm;
window.deleteBeat = deleteBeat;
window.closeSettingsModal = closeSettingsModal;
window.openTabBeatForm = openTabBeatForm;
window.selectBeatForContract = selectBeatForContract;
window.togglePlayBeat = togglePlayBeat;

// Cargar datos del programa de referidos del usuario
async function loadReferralData() {
    const linkInput = document.getElementById('referral-link-input');
    const countBox = document.getElementById('referrals-count-box');
    const countVal = document.getElementById('referrals-count-val');
    if (!linkInput) return;

    // 1. Generar enlace de referido basado en el URL actual y el UID del usuario
    const baseUrl = window.location.origin + window.location.pathname;
    linkInput.value = `${baseUrl}?ref=${window.currentUser}`;

    // 2. Copiar enlace al hacer clic
    const copyBtn = document.getElementById('btn-copy-referral');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(linkInput.value).then(() => {
                showToast('Enlace de referido copiado al portapapeles');
                copyBtn.textContent = '✓';
                setTimeout(() => copyBtn.textContent = '⧉', 1500);
            });
        };
    }

    // 3. Consultar referidos en Firestore
    try {
        const q = query(collection(db, "referrals"), where("referrerId", "==", window.currentUser));
        const snap = await getDocs(q);
        const count = snap.size;
        if (count > 0 && countBox && countVal) {
            countVal.textContent = count;
            countBox.style.display = 'block';
        } else if (countBox) {
            countBox.style.display = 'none';
        }
    } catch (err) {
        console.error("Error al cargar referidos:", err);
    }
}
window.loadReferralData = loadReferralData;

// ==========================================
// CÓDIGOS VIP Y REFERIDOS (SOSA ADMIN & SaaS)
// ==========================================

// Desactivar un código VIP
window.deactivateVipCodeAdmin = async function(codeId) {
    if (!confirm(`¿Estás seguro de desactivar el código ${codeId}?`)) return;
    try {
        const docRef = doc(db, "vip_codes", codeId);
        await updateDoc(docRef, { active: false });
        alert(`Código ${codeId} desactivado.`);
        await loadVipCodesAdmin();
    } catch (err) {
        console.error("Error al desactivar código VIP:", err);
        alert("Error al desactivar código: " + err.message);
    }
};

// Generar un nuevo código VIP aleatorio
window.generateVipCodeAdmin = async function() {
    const planType = document.getElementById('admin-vip-plan').value;
    const months = parseInt(document.getElementById('admin-vip-months').value) || 1;
    
    // Formato VIP-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randStr = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const codeId = `VIP-${randStr(4)}-${randStr(4)}`;
    
    try {
        const docRef = doc(db, "vip_codes", codeId);
        await setDoc(docRef, {
            active: true,
            planType: planType,
            planDurationMonths: months,
            createdAt: new Date().toISOString()
        });
        alert(`Código VIP generado con éxito: ${codeId}`);
        await loadVipCodesAdmin();
    } catch (err) {
        console.error("Error al generar código VIP:", err);
        alert("Error al generar código: " + err.message);
    }
};

// Cargar y listar todos los códigos VIP generados
async function loadVipCodesAdmin() {
    const tbody = document.getElementById('admin-vip-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando códigos VIP...
            </td>
        </tr>
    `;
    
    try {
        const querySnapshot = await getDocs(collection(db, "vip_codes"));
        const vipCodes = [];
        querySnapshot.forEach(docSnap => {
            vipCodes.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        vipCodes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        
        tbody.innerHTML = '';
        if (vipCodes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 20px; text-align: center; color: #8a91a6;">
                        No se han generado códigos VIP aún.
                    </td>
                </tr>
            `;
        } else {
            vipCodes.forEach(code => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                let statusDetails = '';
                if (!code.active && code.redeemedByEmail) {
                    const dateStr = code.redeemedAt ? new Date(code.redeemedAt).toLocaleDateString('es-ES', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '';
                    statusDetails = `<div style="font-size: 10px; color: #8a91a6; margin-top: 4px; line-height: 1.2;">
                        Por: ${code.redeemedByEmail}<br>${dateStr}
                    </div>`;
                }

                const statusBadge = code.active 
                    ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">Activo</span>`
                    : `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">Inactivo</span>${statusDetails}`;
                
                const actionsHtml = code.active
                    ? `<button type="button" class="btn btn-danger" style="height: 26px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 6px;" onclick="deactivateVipCodeAdmin('${code.id}')">Desactivar</button>`
                    : `<span style="color: #718096; font-size: 11px;">N/A</span>`;
                
                tr.innerHTML = `
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 13px; font-weight: 700; color: #fff;">
                        ${code.id}
                    </td>
                    <td style="padding: 12px 10px; font-weight: 600; color: ${code.planType === 'elite' ? '#ffd700' : '#33b5ff'}; text-transform: uppercase;">
                        ${code.planType === 'elite' ? 'Elite 👑' : 'Pro ⚡'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0;">
                        ${code.planDurationMonths} ${code.planDurationMonths === 1 ? 'Mes' : 'Meses'}
                    </td>
                    <td style="padding: 12px 10px;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 12px 10px; text-align: right;">
                        ${actionsHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Error al cargar códigos VIP:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar códigos VIP: ${err.message}
                </td>
            </tr>
        `;
    }
}
window.loadVipCodesAdmin = loadVipCodesAdmin;

// Disparar la llamada a la API para convertir el referido cuando el usuario tiene licencias
async function triggerReferralConversion() {
    const referralProcessed = localStorage.getItem('beatss_referral_processed');
    if (referralProcessed) return;

    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const response = await fetch('/api/convert-referral', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ uid: window.currentUser })
        });
        const resData = await response.json();
        if (resData.success) {
            localStorage.setItem('beatss_referral_processed', 'true');
            console.log("👥 Conversión de referido registrada con éxito:", resData.message);
        }
    } catch (err) {
        console.error("Error al convertir referido:", err);
    }
}

// ==========================================
// IMPORTADOR VISUAL DE CSV DE BEATSTARS
// ==========================================

async function saveAllContacts() {
    safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
    if (window.currentUserIsPro) {
        for (const cont of contactsList) {
            if (!cont.email) continue;
            try {
                const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
                const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                await setDoc(contDocRef, cont);
            } catch (err) {
                console.error("Error al guardar contacto:", err);
            }
        }
    }
}

async function saveAllBeats() {
    safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
    if (window.currentUserIsPro) {
        for (const beat of localBeats) {
            if (!beat.id) continue;
            try {
                const beatDocRef = doc(db, "users", window.currentUser, "beats", beat.id);
                await setDoc(beatDocRef, beat);
            } catch (err) {
                console.error("Error al guardar beat:", err);
            }
        }
    }
}

async function handleBeatStarsCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('⏳ Procesando archivo CSV...');
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const text = evt.target.result;
            const rows = parseCSV(text);
            if (rows.length === 0) {
                showToast('El archivo CSV está vacío o no es válido.', true);
                return;
            }

            // Mapeos rápidos para evitar duplicados
            const existingRefs = new Set(licenseHistory.map(h => h.refCode));
            const existingEmails = new Set(contactsList.map(c => (c.email || '').toLowerCase()));
            const existingBeats = new Set(localBeats.map(b => (b.name || '').toLowerCase()));

            let newContactsCount = 0;
            let newBeatsCount = 0;
            let newLicensesCount = 0;

            let lastInvoice = "";
            let lastDate = "";
            let lastCustomerName = "";
            let lastCustomerEmail = "";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                const invoice = row["Invoice Number"] || lastInvoice;
                const dateRaw = row["Date"] || lastDate;
                const customerName = row["Customer Name"] || lastCustomerName;
                const customerEmail = row["Customer Email"] || lastCustomerEmail;

                lastInvoice = invoice;
                lastDate = dateRaw;
                lastCustomerName = customerName;
                lastCustomerEmail = customerEmail;

                if (!invoice) continue;

                const itemName = row["Item Name"] || "";
                if (!itemName) continue;

                const cleanedBeat = cleanBeatName(itemName);
                const salePrice = parseFloat(row["Sale Price"]) || 0.0;

                // 1. Agregar Contacto
                const emailLower = (customerEmail || '').trim().toLowerCase();
                if (emailLower && !existingEmails.has(emailLower)) {
                    const newContact = {
                        name: customerName || "Comprador Beatstars",
                        email: customerEmail,
                        phone: "",
                        city: "",
                        country: "",
                        id: "",
                        updatedAt: Date.now()
                    };
                    contactsList.push(newContact);
                    existingEmails.add(emailLower);
                    newContactsCount++;
                }

                // 2. Agregar Beat
                const beatLower = cleanedBeat.toLowerCase();
                if (beatLower && !existingBeats.has(beatLower)) {
                    const newBeat = {
                        id: makeBeatId(cleanedBeat),
                        name: cleanedBeat,
                        mp3: "",
                        wav: "",
                        stems: "",
                        updatedAt: Date.now()
                    };
                    localBeats.push(newBeat);
                    existingBeats.add(beatLower);
                    newBeatsCount++;
                }

                // 3. Agregar Licencia
                let refCode = invoice;
                if (existingRefs.has(refCode)) {
                    refCode = `${invoice}-${cleanedBeat.toUpperCase().replace(/\s+/g, '_')}`;
                }

                if (!existingRefs.has(refCode)) {
                    const formattedDate = parseBeatStarsDate(dateRaw);
                    
                    let licType = "basic";
                    let formats = "MP3";
                    let streams = "100,000";
                    let physical = "3,000";
                    let videos = "1";

                    if (salePrice <= 35) {
                        licType = "basic";
                        formats = "MP3";
                        streams = "100,000";
                        physical = "3,000";
                        videos = "1";
                    } else if (salePrice <= 65) {
                        licType = "premium";
                        formats = "MP3 y WAV";
                        streams = "500,000";
                        physical = "10,000";
                        videos = "2";
                    } else {
                        licType = "premium_plus";
                        formats = "MP3, WAV y STEMS";
                        streams = "Ilimitado";
                        physical = "Ilimitado";
                        videos = "Ilimitado";
                    }

                    const currentAka = producerConfig.aka || "Productor";

                    const newLicense = {
                        refCode: refCode,
                        date: formattedDate,
                        beatName: cleanedBeat,
                        buyerName: customerName || "Comprador Beatstars",
                        type: licType,
                        value: salePrice > 0 ? salePrice : 30.0,
                        paymentMethod: "PayPal (Beatstars)",
                        formData: {
                            buyerId: "",
                            buyerEmail: customerEmail,
                            buyerPhone: "",
                            buyerCity: "",
                            buyerCountry: "",
                            celebrationPlace: producerConfig.place || "Quito, Ecuador",
                            formats: formats,
                            streams: streams,
                            physical: physical,
                            videos: videos,
                            videoDuration: licType !== "premium_plus" ? "cinco (5) minutos" : "Sin límite",
                            years: licType !== "premium_plus" ? "diez (10) años" : "Perpetuo",
                            terminationFee: `200% ($${2 * (salePrice > 0 ? Math.floor(salePrice) : 30)}.00 USD)`,
                            writerShare: 50,
                            producerShare: 50,
                            credits: `"Producido por ${currentAka}" o "Prod. por ${currentAka}"`,
                            contentId: true
                        }
                    };
                    licenseHistory.unshift(newLicense);
                    existingRefs.add(refCode);
                    newLicensesCount++;
                }
            }

            licenseHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            if (newContactsCount > 0) await saveAllContacts();
            if (newBeatsCount > 0) await saveAllBeats();
            if (newLicensesCount > 0) {
                await saveHistory();
                updateHistoryTable();
            }

            showToast(`🚀 Importación completa:\n- ${newLicensesCount} licencias\n- ${newBeatsCount} beats\n- ${newContactsCount} contactos.`);
            
            if (window.currentUserIsAdmin) {
                await loadConsolidatedAccounting();
            }

            e.target.value = '';

        } catch (err) {
            console.error('Error al procesar el archivo CSV:', err);
            showToast('Error al parsear el archivo CSV. Verifica su formato.', true);
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let headers = [];
    
    let parsedHeader = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line === "Transactions") continue;
        
        const row = [];
        let insideQuote = false;
        let currentCell = '';
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                row.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        row.push(currentCell.trim());
        
        if (!parsedHeader) {
            headers = row.map(h => h.replace(/^"|"$/g, '').trim());
            parsedHeader = true;
        } else {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] || '';
                val = val.replace(/^"|"$/g, '').trim();
                obj[header] = val;
            });
            result.push(obj);
        }
    }
    return result;
}

function cleanBeatName(name) {
    if (!name) return "Beat";
    name = name.replace(/\s*\(collaborator\)\s*/gi, "");
    name = name.replace(/^type beat\s+/gi, "");
    return name.trim();
}

function makeBeatId(name) {
    const normalized = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
    return "beat_" + normalized.replace(/\s+/g, "_");
}

function parseBeatStarsDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const monthsMap = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
        "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
        "jan": 1, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sept": 9, "oct": 10, "nov": 11, "dec": 12
    };
    const match = dateStr.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/);
    if (match) {
        const monthName = match[1].toLowerCase();
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const monthNum = monthsMap[monthName] || 1;
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
}

// ============================================================
// CATÁLOGO DE BEATS PREMIUM (ESTILO BEATSTARS)
// ============================================================

let currentPlayingAudio = null;
let currentPlayingBeatId = null;

// Reproducir/Pausar audio de beat en el catálogo
function togglePlayBeat(beatId, mp3Url) {
    if (!mp3Url) {
        showToast("Este beat no tiene archivo MP3 para previsualizar.", true);
        return;
    }

    if (currentPlayingBeatId === beatId) {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
            currentPlayingAudio = null;
            currentPlayingBeatId = null;
            renderBeatsGrid();
            showToast("Audio pausado");
        }
    } else {
        if (currentPlayingAudio) {
            currentPlayingAudio.pause();
        }
        
        showToast("Cargando vista previa de audio...");
        currentPlayingAudio = new Audio(mp3Url);
        currentPlayingBeatId = beatId;
        
        currentPlayingAudio.play().then(() => {
            renderBeatsGrid();
        }).catch(err => {
            console.error("Error al reproducir audio:", err);
            showToast("Error al reproducir audio previa", true);
            currentPlayingAudio = null;
            currentPlayingBeatId = null;
            renderBeatsGrid();
        });

        currentPlayingAudio.addEventListener('ended', () => {
            currentPlayingAudio = null;
            currentPlayingBeatId = null;
            renderBeatsGrid();
        });
    }
}

// Actualizar filtros de Género y Escala basados en los beats cargados
function updateGenreAndKeyFilters() {
    const genreSelect = document.getElementById('tab-filter-genre');
    const keySelect = document.getElementById('tab-filter-key');
    if (!genreSelect || !keySelect) return;

    const currentGenre = genreSelect.value;
    const currentKey = keySelect.value;

    // Obtener valores únicos
    const genres = new Set();
    const keys = new Set();

    localBeats.forEach(b => {
        if (b.genre) genres.add(b.genre.trim());
        if (b.key) keys.add(b.key.trim());
    });

    // Rellenar géneros
    genreSelect.innerHTML = '<option value="">Todos los géneros</option>';
    Array.from(genres).sort().forEach(g => {
        genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
    });
    genreSelect.value = currentGenre;

    // Rellenar escalas
    keySelect.innerHTML = '<option value="">Todas las escalas</option>';
    Array.from(keys).sort().forEach(k => {
        keySelect.innerHTML += `<option value="${k}">${k}</option>`;
    });
    keySelect.value = currentKey;
}

// Renderizar la cuadrícula de beats en la pestaña principal
function renderBeatsGrid() {
    const gridContainer = document.getElementById('tab-beats-grid');
    const emptyState = document.getElementById('tab-beats-empty');
    if (!gridContainer) return;

    const query = document.getElementById('tab-search-beats').value.toLowerCase().trim();
    const genreFilter = document.getElementById('tab-filter-genre').value;
    const keyFilter = document.getElementById('tab-filter-key').value;

    let filtered = [...localBeats];

    // Aplicar filtros
    if (query) {
        filtered = filtered.filter(b => 
            b.name.toLowerCase().includes(query) || 
            (b.genre && b.genre.toLowerCase().includes(query)) ||
            (b.tags && b.tags.toLowerCase().includes(query)) ||
            (b.key && b.key.toLowerCase().includes(query))
        );
    }
    if (genreFilter) {
        filtered = filtered.filter(b => b.genre && b.genre.trim() === genreFilter.trim());
    }
    if (keyFilter) {
        filtered = filtered.filter(b => b.key && b.key.trim() === keyFilter.trim());
    }

    // Ordenar por fecha de actualización descendente
    filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // Actualizar estadísticas rápidas
    let mp3Count = 0;
    let wavCount = 0;
    let stemsCount = 0;

    localBeats.forEach(b => {
        if (b.mp3) mp3Count++;
        if (b.wav) wavCount++;
        if (b.stems) stemsCount++;
    });

    document.getElementById('tab-stats-total').textContent = localBeats.length;
    document.getElementById('tab-stats-mp3').textContent = mp3Count;
    document.getElementById('tab-stats-wav').textContent = wavCount;
    document.getElementById('tab-stats-stems').textContent = stemsCount;

    if (filtered.length === 0) {
        gridContainer.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    gridContainer.innerHTML = '';

    filtered.forEach(beat => {
        const card = document.createElement('div');
        card.className = 'beat-card-premium';

        const isPlaying = currentPlayingBeatId === beat.id;
        const playIcon = isPlaying ? 'pause' : 'play';

        const artworkHtml = beat.artwork
            ? `<img src="${beat.artwork}" class="beat-cover-img" alt="${beat.name}">`
            : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #222530; color: #8a91a6; min-height: 180px;"><i data-lucide="music" style="width: 32px; height: 32px;"></i></div>`;

        // Tags badges
        let tagsHtml = '';
        if (beat.tags) {
            const tagList = beat.tags.split(',').map(t => t.trim()).filter(t => t.length > 0).slice(0, 3);
            tagList.forEach(t => {
                tagsHtml += `<span class="tag-badge-premium">#${t}</span>`;
            });
        }

        // Details pills
        let detailsHtml = '';
        if (beat.bpm) detailsHtml += `<span class="beat-stat-pill"><i data-lucide="activity" style="width: 10px; height: 10px;"></i>${beat.bpm} BPM</span>`;
        if (beat.key) detailsHtml += `<span class="beat-stat-pill"><i data-lucide="music" style="width: 10px; height: 10px;"></i>${beat.key}</span>`;
        if (beat.genre) detailsHtml += `<span class="beat-stat-pill">${beat.genre}</span>`;

        card.innerHTML = `
            <div class="beat-cover-wrapper">
                ${artworkHtml}
                <div class="beat-play-overlay" onclick="togglePlayBeat('${beat.id}', '${beat.mp3 || ''}')">
                    <div class="play-btn-circle play-btn-${beat.id}">
                        <i data-lucide="${playIcon}" style="width: 20px; height: 20px; ${playIcon === 'play' ? 'margin-left: 2px;' : ''}"></i>
                    </div>
                </div>
            </div>
            
            <div style="flex: 1; display: flex; flex-direction: column; gap: 6px; cursor: pointer;" onclick="openTabBeatForm('${beat.id}')">
                <div style="font-weight: 700; font-size: 14px; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${beat.name}">${beat.name}</div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap;">
                    ${detailsHtml}
                </div>
                <div class="beat-badge-row" style="margin-top: 4px;">
                    <span class="file-status-badge ${beat.mp3 ? 'active' : 'inactive'}">MP3</span>
                    <span class="file-status-badge ${beat.wav ? 'active' : 'inactive'}">WAV</span>
                    <span class="file-status-badge ${beat.stems ? 'active' : 'inactive'}">Stems</span>
                </div>
                <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px;">
                    ${tagsHtml}
                </div>
            </div>

            <div style="display: flex; gap: 6px; border-top: 1px solid var(--border-color); padding-top: 10px; margin-top: auto;">
                <button class="btn btn-secondary" onclick="selectBeatForContract('${beat.id}')" style="flex: 1; font-size: 11px; padding: 6px; height: 28px; background: var(--bs-blue-60); border-color: var(--bs-blue-60); color: #fff; border-radius: 6px; border: none; cursor: pointer; font-weight: 600;">Usar</button>
                <button class="btn btn-secondary" onclick="openTabBeatForm('${beat.id}')" style="padding: 6px; height: 28px; border-radius: 6px; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Editar"><i data-lucide="edit-2" style="width: 12px; height: 12px;"></i></button>
                <button class="btn btn-secondary" onclick="deleteBeat('${beat.id}')" style="padding: 6px; height: 28px; border-radius: 6px; width: 28px; display: flex; align-items: center; justify-content: center; color: var(--bs-red-50); cursor: pointer;" title="Eliminar"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
            </div>
        `;

        gridContainer.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

// Cargar un beat en el contrato directamente desde la pestaña
function selectBeatForContract(id) {
    selectBeat(id);
    // Cambiar de pestaña al preview del contrato
    document.querySelector('.tab-btn[data-tab="tab-preview"]').click();
}

// Abrir formulario de beat en el catálogo principal
function openTabBeatForm(editId = null) {
    document.getElementById('tab-beat-form-empty-state').style.display = 'none';
    document.getElementById('tab-beat-form-fields').style.display = 'block';

    if (editId) {
        const beat = localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('tab-beat-form-title').innerText = 'Editar Beat: ' + beat.name;
            document.getElementById('tab-edit-beat-id').value = beat.id;
            document.getElementById('tab-db-beat-name').value = beat.name || '';
            document.getElementById('tab-db-beat-mp3').value = beat.mp3 || '';
            document.getElementById('tab-db-beat-wav').value = beat.wav || '';
            document.getElementById('tab-db-beat-stems').value = beat.stems || '';
            document.getElementById('tab-db-beat-artwork').value = beat.artwork || '';
            document.getElementById('tab-db-beat-bpm').value = beat.bpm || '';
            document.getElementById('tab-db-beat-key').value = beat.key || '';
            document.getElementById('tab-db-beat-genre').value = beat.genre || '';
            document.getElementById('tab-db-beat-moods').value = beat.moods || '';
            document.getElementById('tab-db-beat-tags').value = beat.tags || '';
            document.getElementById('tab-db-beat-description').value = beat.description || '';
            document.getElementById('tab-db-beat-free-download').checked = !!beat.freeDownload;
        }
    } else {
        document.getElementById('tab-beat-form-title').innerText = 'Agregar Nuevo Beat';
        document.getElementById('tab-edit-beat-id').value = '';
        document.getElementById('tab-db-beat-name').value = '';
        document.getElementById('tab-db-beat-mp3').value = '';
        document.getElementById('tab-db-beat-wav').value = '';
        document.getElementById('tab-db-beat-stems').value = '';
        document.getElementById('tab-db-beat-artwork').value = '';
        document.getElementById('tab-db-beat-bpm').value = '';
        document.getElementById('tab-db-beat-key').value = '';
        document.getElementById('tab-db-beat-genre').value = '';
        document.getElementById('tab-db-beat-moods').value = '';
        document.getElementById('tab-db-beat-tags').value = '';
        document.getElementById('tab-db-beat-description').value = '';
        document.getElementById('tab-db-beat-free-download').checked = false;
    }
    
    if (window.lucide) window.lucide.createIcons();
    updateClearButtonsVisibility();
}

// Cerrar formulario
function closeTabBeatForm() {
    document.getElementById('tab-beat-form-empty-state').style.display = 'block';
    document.getElementById('tab-beat-form-fields').style.display = 'none';
}

// Guardar beat desde el catálogo principal (local y Firestore sync)
async function saveTabBeat() {
    const id = document.getElementById('tab-edit-beat-id').value;
    const name = document.getElementById('tab-db-beat-name').value.trim();
    const mp3 = document.getElementById('tab-db-beat-mp3').value.trim();
    const wav = document.getElementById('tab-db-beat-wav').value.trim();
    const stems = document.getElementById('tab-db-beat-stems').value.trim();
    const artwork = document.getElementById('tab-db-beat-artwork').value.trim();
    const bpm = document.getElementById('tab-db-beat-bpm').value ? parseInt(document.getElementById('tab-db-beat-bpm').value, 10) : null;
    const key = document.getElementById('tab-db-beat-key').value.trim();
    const genre = document.getElementById('tab-db-beat-genre').value.trim();
    const moods = document.getElementById('tab-db-beat-moods').value.trim();
    const tags = document.getElementById('tab-db-beat-tags').value.trim();
    const description = document.getElementById('tab-db-beat-description').value.trim();
    const freeDownload = document.getElementById('tab-db-beat-free-download').checked;

    if (!name) {
        showToast('El nombre del beat es obligatorio', true);
        return;
    }

    const beatId = id || 'beat_' + Date.now();
    const beatData = {
        id: beatId,
        name,
        mp3,
        wav,
        stems,
        artwork,
        bpm,
        key,
        genre,
        moods,
        tags,
        description,
        freeDownload,
        updatedAt: Date.now()
    };

    const isNew = !id;
    if (!window.currentUserIsPro && isNew && localBeats.length >= 10) {
        window.openPaymentModal("Límite alcanzado: Has alcanzado el límite de 10 beats del Plan Inicial. ¡Actualízate a PRO hoy para subir beats ilimitados!");
        return;
    }

    if (id) {
        const index = localBeats.findIndex(b => b.id === id);
        if (index !== -1) localBeats[index] = beatData;
    } else {
        localBeats.push(beatData);
    }

    try {
        safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
        
        // Guardar en Firestore para todos
        const beatDocRef = doc(db, "users", window.currentUser, "beats", beatId);
        await setDoc(beatDocRef, beatData);
        
        showToast(id ? 'Beat actualizado' : 'Nuevo beat guardado');
        closeTabBeatForm();
        renderBeatsGrid();
        renderBeatsList();
        updateGenreAndKeyFilters();
    } catch (e) {
        console.error('Error saving beat from tab:', e);
        showToast('Error al guardar el beat en la base de datos', true);
    }
}


// ==========================================================================
// TIENDA PÚBLICA DE BEATS & PROCESAMIENTO DE PEDIDOS (STOREFRONT)
// ==========================================================================

window.isPublicStoreMode = false;
window.storeProducerUid = null;
window.storeProducerConfig = {};
window.storeBeats = [];
window.storePayments = [];

let currentStoreAudio = null;
let currentStorePlayingBeatId = null;

let checkoutSelectedBeatId = null;
let checkoutSelectedLicense = 'basic';
let checkoutCurrentStep = 1;
let storePaymentReceiptBase64 = null;
let checkoutIsOfferMode = false;

// Inicialización de Tienda Pública
async function initPublicStore(producerAka) {
    console.log("🛒 Cargando tienda de beats para:", producerAka);
    const storeView = document.getElementById('public-store-view');
    const grid = document.getElementById('store-beats-grid');
    
    // Ocultar otras pantallas
    document.getElementById('login-modal').style.display = 'none';
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    
    storeView.style.display = 'block';
    grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 60px;">
            <div class="animate-spin" style="display: inline-block; width: 32px; height: 32px; border: 4px solid rgba(255,255,255,0.1); border-top-color: var(--accent, #00ccff); border-radius: 50%;"></div>
            <p style="margin-top: 15px; color: #8a91a6; font-size: 14px;">Cargando catálogo...</p>
        </div>
    `;

    try {
        // Consultar todos los documentos "config" para buscar el AKA localmente (evitando errores por falta de índice)
        const allConfigs = await getDocs(collectionGroup(db, "config"));
        let producerDoc = null;
        let producerUid = null;

        for (const doc of allConfigs.docs) {
            const akaVal = (doc.data().aka || '').toLowerCase();
            if (akaVal === producerAka.toLowerCase()) {
                producerDoc = doc;
                const docPath = doc.ref.path;
                const pathParts = docPath.split('/');
                producerUid = pathParts[1];
                break;
            }
        }

        if (!producerUid || !producerDoc) {
            grid.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
                    <i data-lucide="alert-circle" style="width: 36px; height: 36px;"></i>
                    <p style="margin-top: 10px; font-weight: 600;">Productor "${producerAka}" no encontrado.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const configData = producerDoc.data();
        window.storeProducerUid = producerUid;
        window.storeProducerConfig = configData;

        // Renderizar cabecera de la tienda
        document.getElementById('store-producer-name').textContent = configData.aka || configData.name || "Productor";
        document.getElementById('store-producer-aka-sub').textContent = `Catálogo Oficial de ${configData.aka || "Beats"}`;

        // Aplicar branding de color
        const akaLower = (configData.aka || '').toLowerCase();
        if (akaLower.includes('monarco')) {
            document.documentElement.style.setProperty('--accent', '#ff4d4d');
            document.documentElement.style.setProperty('--accent-rgb', '255, 77, 77');
        } else if (akaLower.includes('sossa')) {
            document.documentElement.style.setProperty('--accent', '#b28eff');
            document.documentElement.style.setProperty('--accent-rgb', '178, 142, 255');
        } else {
            document.documentElement.style.setProperty('--accent', '#00ccff');
            document.documentElement.style.setProperty('--accent-rgb', '0, 204, 255');
        }

        // Cargar logotipo si existe
        const logoImg = document.getElementById('store-logo-img');
        const logoIcon = document.getElementById('store-logo-icon');
        if (configData.logoBase64) {
            logoImg.src = configData.logoBase64;
            logoImg.style.display = 'block';
            logoIcon.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoIcon.style.display = 'flex';
        }

        // Redes sociales
        document.getElementById('store-email-link').href = `mailto:${configData.email || 'soporte@beatss.com'}`;
        document.getElementById('store-phone-link').href = `https://wa.me/${(configData.phone || '').replace(/\+/g, '').replace(/\s/g, '')}`;

        // Obtener beats de la base de datos
        const beatsCol = collection(db, "users", producerUid, "beats");
        const beatsSnapshot = await getDocs(beatsCol);
        window.storeBeats = [];
        
        beatsSnapshot.forEach(doc => {
            const data = doc.data();
            if (data.mp3) { // Sólo beats con preescucha MP3
                window.storeBeats.push({
                    id: doc.id,
                    ...data
                });
            }
        });

        // Renderizar grilla y configurar eventos
        renderStoreBeats(window.storeBeats);
        setupStoreFilters();
        setupStoreAudioPlayer();
        setupStoreCheckout();

    } catch (err) {
        console.error("Error cargando la tienda:", err);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
                <p>Error de conexión al cargar la tienda. Intenta nuevamente.</p>
            </div>
        `;
    }
}

function renderStoreBeats(beats) {
    const grid = document.getElementById('store-beats-grid');
    const emptyState = document.getElementById('store-empty-state');
    
    if (beats.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = beats.map(beat => {
        const artworkUrl = beat.artwork || getDefaultBeatArtwork();
        const bpmText = beat.bpm ? `${beat.bpm} BPM` : 'N/A';
        const keyText = beat.key ? `${beat.key}` : 'N/A';
        
        // Formatear etiquetas de tags
        const tagsList = (beat.tags || '')
            .split(/[\s,]+/)
            .filter(t => t.trim().length > 0)
            .map(t => t.startsWith('#') ? t : `#${t}`);
        const tagsHtml = tagsList.length > 0
            ? `<div class="store-beat-tags-container">${tagsList.map(tag => `<span class="store-beat-tag">${tag}</span>`).join('')}</div>`
            : '';

        // Formatear badges de género y moods
        const genreBadge = beat.genre ? `<span class="store-genre-badge">${beat.genre}</span>` : '';
        const moodBadge = beat.moods ? `<span class="store-mood-badge">${beat.moods}</span>` : '';
        const badgesHtml = (genreBadge || moodBadge)
            ? `<div style="display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap;">${genreBadge}${moodBadge}</div>`
            : '';
        
        return `
            <div class="store-beat-card" data-id="${beat.id}" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box;">
                <div>
                    <div class="store-beat-cover">
                        <img src="${artworkUrl}" alt="${beat.name}" style="width:100%; height:100%; object-fit:cover; border-radius:12px;">
                        <div class="store-play-overlay" onclick="window.toggleStorePlay('${beat.id}')">
                            <button class="store-play-btn" id="btn-play-store-${beat.id}">
                                <i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>
                            </button>
                        </div>
                    </div>
                    <div class="store-beat-title" style="margin-top: 10px; font-size: 15px; font-weight: 700; color: #fff;">${beat.name}</div>
                    <div class="store-beat-meta" style="margin-top: 4px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 12px; color: #8a91a6;">${bpmText} • ${keyText}</span>
                        <span style="color: var(--accent, #00ccff); font-weight: 800; background: rgba(var(--accent-rgb, 0, 204, 255), 0.08); padding: 3px 10px; border-radius: 8px; font-size: 13px;">$${(LICENSE_CONFIGS.basic.price || 30.00).toFixed(2)}</span>
                    </div>
                    ${badgesHtml}
                    ${tagsHtml}
                </div>
                <div style="margin-top: 16px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">
                    <button class="btn btn-primary" onclick="window.openBeatCheckoutModal('${beat.id}')" style="width: 100%; height: 38px; font-weight: 700; border-radius: 10px; font-size: 13px; margin: 0;">Adquirir Licencia</button>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function setupStoreFilters() {
    const searchInput = document.getElementById('store-search-input');
    const genreSelect = document.getElementById('store-genre-select');
    const keySelect = document.getElementById('store-key-select');

    const genres = new Set();
    const keys = new Set();
    window.storeBeats.forEach(b => {
        if (b.genre) genres.add(b.genre);
        if (b.key) keys.add(b.key);
    });

    genreSelect.innerHTML = '<option value="">Todos los géneros</option>' + Array.from(genres).map(g => `<option value="${g}">${g}</option>`).join('');
    keySelect.innerHTML = '<option value="">Todas las escalas</option>' + Array.from(keys).map(k => `<option value="${k}">${k}</option>`).join('');

    function filterBeats() {
        const query = searchInput.value.toLowerCase();
        const genre = genreSelect.value;
        const key = keySelect.value;

        const filtered = window.storeBeats.filter(b => {
            const matchesSearch = b.name.toLowerCase().includes(query) || (b.tags || '').toLowerCase().includes(query);
            const matchesGenre = !genre || b.genre === genre;
            const matchesKey = !key || b.key === key;
            return matchesSearch && matchesGenre && matchesKey;
        });

        renderStoreBeats(filtered);
    }

    searchInput.addEventListener('input', filterBeats);
    genreSelect.addEventListener('change', filterBeats);
    keySelect.addEventListener('change', filterBeats);
}

// Lógica de Reproducción de Audio en Tienda
window.toggleStorePlay = function(beatId) {
    const beat = window.storeBeats.find(b => b.id === beatId);
    if (!beat || !beat.mp3) return;

    const player = document.getElementById('store-audio-player');
    const playBtn = document.getElementById('player-btn-play');
    const volumeSlider = document.getElementById('player-volume');

    if (currentStorePlayingBeatId === beatId) {
        if (currentStoreAudio.paused) {
            currentStoreAudio.play();
            setPlayButtonState(beatId, true);
        } else {
            currentStoreAudio.pause();
            setPlayButtonState(beatId, false);
        }
    } else {
        if (currentStoreAudio) {
            currentStoreAudio.pause();
            setPlayButtonState(currentStorePlayingBeatId, false);
        }

        currentStorePlayingBeatId = beatId;
        currentStoreAudio = new Audio(beat.mp3);
        currentStoreAudio.volume = parseFloat(volumeSlider.value || 0.8);

        currentStoreAudio.addEventListener('timeupdate', updatePlayerProgress);
        currentStoreAudio.addEventListener('loadedmetadata', () => {
            document.getElementById('player-time-duration').textContent = formatAudioTime(currentStoreAudio.duration);
        });
        currentStoreAudio.addEventListener('ended', () => {
            setPlayButtonState(beatId, false);
            playNextBeat();
        });

        document.getElementById('player-title').textContent = beat.name;
        document.getElementById('player-info').textContent = `${beat.bpm ? beat.bpm + ' BPM' : ''} ${beat.key ? '• ' + beat.key : ''} ${beat.genre ? '• ' + beat.genre : ''}`;
        document.getElementById('player-artwork').src = beat.artwork || 'https://images.unsplash.com/photo-1614680376593-902f74fa0d41?q=80&w=100&auto=format&fit=crop';
        player.style.display = 'block';

        document.getElementById('player-btn-buy').onclick = () => window.openBeatCheckoutModal(beatId);

        currentStoreAudio.play();
        setPlayButtonState(beatId, true);
    }
};

function setupStoreAudioPlayer() {
    const playBtn = document.getElementById('player-btn-play');
    const prevBtn = document.getElementById('player-btn-prev');
    const nextBtn = document.getElementById('player-btn-next');
    const volumeSlider = document.getElementById('player-volume');
    const progressContainer = document.getElementById('player-progress-container');

    playBtn.addEventListener('click', () => {
        if (currentStorePlayingBeatId) {
            window.toggleStorePlay(currentStorePlayingBeatId);
        }
    });

    prevBtn.addEventListener('click', () => {
        playPrevBeat();
    });

    nextBtn.addEventListener('click', () => {
        playNextBeat();
    });

    volumeSlider.addEventListener('input', (e) => {
        if (currentStoreAudio) {
            currentStoreAudio.volume = parseFloat(e.target.value);
        }
    });

    progressContainer.addEventListener('click', (e) => {
        if (currentStoreAudio && currentStoreAudio.duration) {
            const rect = progressContainer.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            currentStoreAudio.currentTime = percentage * currentStoreAudio.duration;
        }
    });
}

function playNextBeat() {
    if (!currentStorePlayingBeatId || !window.storeBeats || window.storeBeats.length === 0) return;
    const currentIndex = window.storeBeats.findIndex(b => b.id === currentStorePlayingBeatId);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= window.storeBeats.length) nextIndex = 0;
    window.toggleStorePlay(window.storeBeats[nextIndex].id);
}
function playPrevBeat() {
    if (!currentStorePlayingBeatId || !window.storeBeats || window.storeBeats.length === 0) return;
    const currentIndex = window.storeBeats.findIndex(b => b.id === currentStorePlayingBeatId);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = window.storeBeats.length - 1;
    window.toggleStorePlay(window.storeBeats[prevIndex].id);
}

window.getCheckoutPrice = function() {
    if (checkoutSelectedLicense === 'exclusive') {
        const input = document.getElementById('exclusive-price-input');
        if (input) {
            const val = parseFloat(input.value);
            if (!isNaN(val)) return val;
        }
        return window.checkoutExclusivePrice || 500;
    }
    return LICENSE_CONFIGS[checkoutSelectedLicense] ? LICENSE_CONFIGS[checkoutSelectedLicense].price : 0;
};

window.updateExclusivePrice = function(val) {
    const parsed = parseFloat(val);
    if (!parsed || parsed < 0) return;
    
    window.checkoutExclusivePrice = parsed;
    const priceStr = '$' + parsed.toFixed(2) + ' USD';
    const deunaTotal = document.getElementById('deuna-total-price');
    const transferTotal = document.getElementById('transfer-total-price');
    const offerInput = document.getElementById('offer-price-input');
    
    if (deunaTotal) deunaTotal.textContent = priceStr;
    if (transferTotal) transferTotal.textContent = priceStr;
    if (offerInput) offerInput.value = parsed;
    
    // Recargar PayPal para reflejar monto
    const activeTab = getSelectedStorePaymentMethod();
    if (activeTab === 'paypal') {
        const clientId = window.storeProducerConfig.paypalClientId || "";
        if (clientId) {
            renderStorePayPalButton(clientId);
        }
    }
};

function formatAudioTime(secs) {
    if (isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function updatePlayerProgress() {
    if (currentStoreAudio && currentStoreAudio.duration) {
        const percent = (currentStoreAudio.currentTime / currentStoreAudio.duration) * 100;
        document.getElementById('player-progress-bar').style.width = `${percent}%`;
        document.getElementById('player-time-current').textContent = formatAudioTime(currentStoreAudio.currentTime);
    }
}

function setPlayButtonState(beatId, isPlaying) {
    const playBtn = document.getElementById('player-btn-play');
    const cardBtn = document.getElementById(`btn-play-store-${beatId}`);
    
    const iconHtml = isPlaying 
        ? '<i data-lucide="pause" style="width: 18px; height: 18px; fill: #000; stroke: #000;"></i>'
        : '<i data-lucide="play" style="width: 18px; height: 18px; fill: #000; stroke: #000;"></i>';
    
    playBtn.innerHTML = iconHtml;

    if (cardBtn) {
        cardBtn.innerHTML = isPlaying
            ? '<i data-lucide="pause" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>'
            : '<i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>';
    }

    // Resetear las demás tarjetas
    window.storeBeats.forEach(b => {
        if (b.id !== beatId) {
            const otherBtn = document.getElementById(`btn-play-store-${b.id}`);
            if (otherBtn) {
                otherBtn.innerHTML = '<i data-lucide="play" style="width: 22px; height: 22px; fill: #000; stroke: #000;"></i>';
            }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

window.openBeatCheckoutModal = function(beatId) {
    checkoutSelectedBeatId = beatId;
    checkoutSelectedLicense = 'basic';
    checkoutCurrentStep = 1;
    storePaymentReceiptBase64 = null;
    window.checkoutExclusivePrice = 500; // Reset de precio exclusivo

    // Reset fields
    document.getElementById('buyer-name').value = '';
    document.getElementById('buyer-email').value = '';
    document.getElementById('buyer-phone').value = '';
    document.getElementById('buyer-dni').value = '';
    document.getElementById('buyer-city').value = '';
    document.getElementById('buyer-country').value = 'Ecuador';

    document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
    document.getElementById('store-receipt-file').value = '';

    const container = document.getElementById('license-options-container');
    container.innerHTML = Object.entries(LICENSE_CONFIGS).map(([key, config]) => {
        const isActive = key === checkoutSelectedLicense;
        const isExclusive = key === 'exclusive';
        const priceText = isExclusive ? 'Negociable (Mín. $250)' : `$${config.price.toFixed(2)}`;
        
        return `
            <div class="license-option-card ${isActive ? 'active' : ''}" onclick="window.selectCheckoutLicense('${key}')" style="display: flex; flex-direction: column; width: 100%; box-sizing: border-box; gap: 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <div style="text-align: left;">
                        <div style="font-weight: 700; color: #fff; font-size: 14px;">${config.name}</div>
                        <div style="font-size: 11px; color: #8a91a6; margin-top: 4px;">
                            ${config.formats} • ${config.streams} streams • ${config.years}
                        </div>
                    </div>
                    <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
                        <span style="font-weight: 800; color: var(--accent, #00ccff); font-size: 15px;">${priceText}</span>
                        <div class="license-check" style="width: 18px; height: 18px; border-radius: 50%; border: 2px solid ${isActive ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}; display: flex; align-items: center; justify-content: center; background: ${isActive ? 'var(--accent)' : 'transparent'};">
                            ${isActive ? '<i data-lucide="check" style="width: 12px; height: 12px; stroke: #000; stroke-width: 3;"></i>' : ''}
                        </div>
                    </div>
                </div>
                ${isExclusive ? `
                    <div class="exclusive-price-container" style="display: ${isActive ? 'flex' : 'none'}; align-items: center; gap: 8px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px; width: 100%;" onclick="event.stopPropagation()">
                        <label style="font-size: 12px; color: #8a91a6;">Tu Propuesta ($ USD):</label>
                        <input type="number" id="exclusive-price-input" min="250" value="500" oninput="window.updateExclusivePrice(this.value)" style="width: 80px; background: #12141c; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; padding: 4px 8px; font-size: 13px; font-weight: 700; outline: none; text-align: center;">
                        <span style="font-size: 11px; color: #8a91a6;">(Mínimo: $250)</span>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();

    // Reset total prices
    const priceStr = '$' + LICENSE_CONFIGS.basic.price.toFixed(2) + ' USD';
    document.getElementById('deuna-total-price').textContent = priceStr;
    document.getElementById('transfer-total-price').textContent = priceStr;

    updateCheckoutStepView(1);
    document.getElementById('beat-checkout-modal').style.display = 'flex';
};

window.selectCheckoutLicense = function(licenseKey) {
    checkoutSelectedLicense = licenseKey;

    // Update active class on option cards
    const container = document.getElementById('license-options-container');
    const cards = container.querySelectorAll('.license-option-card');
    const keys = Object.keys(LICENSE_CONFIGS);
    
    cards.forEach((card, index) => {
        const key = keys[index];
        const isActive = key === checkoutSelectedLicense;
        
        if (isActive) {
            card.classList.add('active');
            const check = card.querySelector('.license-check');
            if (check) {
                check.style.borderColor = 'var(--accent)';
                check.style.background = 'var(--accent)';
                check.innerHTML = '<i data-lucide="check" style="width: 12px; height: 12px; stroke: #000; stroke-width: 3;"></i>';
            }
        } else {
            card.classList.remove('active');
            const check = card.querySelector('.license-check');
            if (check) {
                check.style.borderColor = 'rgba(255,255,255,0.2)';
                check.style.background = 'transparent';
                check.innerHTML = '';
            }
        }

        // Toggle input container de exclusiva
        if (key === 'exclusive') {
            const exclusiveContainer = card.querySelector('.exclusive-price-container');
            if (exclusiveContainer) {
                exclusiveContainer.style.display = isActive ? 'flex' : 'none';
            }
        }
    });

    if (window.lucide) window.lucide.createIcons();

    // Update prices
    const price = window.getCheckoutPrice();
    const priceStr = '$' + price.toFixed(2) + ' USD';
    document.getElementById('deuna-total-price').textContent = priceStr;
    document.getElementById('transfer-total-price').textContent = priceStr;

    // If active tab is PayPal, re-initialize PayPal button
    const activeTab = getSelectedStorePaymentMethod();
    if (activeTab === 'paypal') {
        const clientId = window.storeProducerConfig.paypalClientId || "";
        if (clientId) {
            renderStorePayPalButton(clientId);
        }
    }
};

window.updateCheckoutStepView = function(step) {
    checkoutCurrentStep = step;

    // Update indicators
    document.querySelectorAll('.checkout-step-indicator').forEach(el => {
        const s = parseInt(el.getAttribute('data-step'), 10);
        if (s <= step) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // Update progress bar
    const progressPercent = step === 1 ? 0 : (step === 2 ? 50 : 100);
    document.getElementById('checkout-step-progress').style.width = progressPercent + '%';

    // Show/hide panels
    document.getElementById('checkout-panel-1').style.display = step === 1 ? 'block' : 'none';
    document.getElementById('checkout-panel-2').style.display = step === 2 ? 'block' : 'none';
    document.getElementById('checkout-panel-3').style.display = step === 3 ? 'block' : 'none';

    // Footer buttons
    const prevBtn = document.getElementById('btn-checkout-prev');
    const cancelBtn = document.getElementById('btn-checkout-cancel');
    const nextBtn = document.getElementById('btn-checkout-next');

    if (step === 1) {
        prevBtn.style.display = 'none';
        cancelBtn.style.display = 'block';
    } else {
        prevBtn.style.display = 'block';
        cancelBtn.style.display = 'none';
    }

    if (step === 3) {
        // Populate config details and visible tabs
        const deunaTab = document.getElementById('btn-pay-deuna');
        const transferTab = document.getElementById('btn-pay-transfer');
        const paypalTab = document.getElementById('btn-pay-paypal');
        const offerTab = document.getElementById('btn-pay-offer');
        
        if (offerTab) {
            offerTab.style.display = checkoutSelectedLicense === 'exclusive' ? 'block' : 'none';
        }

        const deunaPhone = window.storeProducerConfig.deunaPhone || "";
        const deunaName = window.storeProducerConfig.deunaName || "";
        const pichinchaAcc = window.storeProducerConfig.bankPichinchaAcc || "";
        const guayaquilAcc = window.storeProducerConfig.bankGuayaquilAcc || "";
        const paypalClientId = window.storeProducerConfig.paypalClientId || "";
        const paypalEmail = window.storeProducerConfig.paypalEmail || "";

        let deunaVisible = false;
        let transferVisible = false;
        let paypalVisible = false;

        // Deuna
        if (deunaPhone) {
            deunaTab.style.display = 'block';
            // Construir deeplink de Deuna para pago en un toque
            const cleanPhone = deunaPhone.replace(/\D/g, '');
            const deunaDeeplink = `deuna://payment?phone=${cleanPhone}`;
            const deunaWhatsapp = `https://wa.me/${cleanPhone}`;
            document.getElementById('deuna-info-phone').innerHTML = `
                Celular: <strong style="font-size: 18px; letter-spacing: 1px;">${deunaPhone}</strong>
                <button onclick="navigator.clipboard.writeText('${deunaPhone}').then(()=>window.showToast('¡Número copiado!'))" style="background: rgba(255,255,255,0.08); border: none; border-radius: 6px; color: #8a91a6; cursor: pointer; padding: 4px 8px; font-size: 11px; margin-left: 8px; vertical-align: middle;">📋 Copiar</button>
            `;
            document.getElementById('deuna-info-name').innerHTML = `
                Titular: <span style="color: #fff; font-weight: 600;">${deunaName}</span>
                <a href="${deunaDeeplink}" style="margin-left: 12px; background: linear-gradient(135deg, #ff6b35, #ff9500); color: #fff; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 8px; text-decoration: none; display: inline-block; vertical-align: middle;" onclick="setTimeout(()=>window.open('${deunaWhatsapp}', '_blank'), 800)">⚡ Abrir Deuna!</a>
            `;
            deunaVisible = true;
        } else {
            deunaTab.style.display = 'none';
        }

        // Helper para copiar texto
        function makeCopyBtn(text, label) {
            return `<button onclick="navigator.clipboard.writeText('${text}').then(()=>window.showToast('¡${label} copiado!'))" style="background: rgba(255,255,255,0.08); border: none; border-radius: 6px; color: #8a91a6; cursor: pointer; padding: 3px 8px; font-size: 11px; margin-left: 6px;">📋</button>`;
        }

        // Pichincha
        const pichinchaCard = document.getElementById('store-bank-pichincha-card');
        if (pichinchaAcc) {
            pichinchaCard.style.display = 'block';
            const pichName = window.storeProducerConfig.bankPichinchaName || "";
            const pichDni = window.storeProducerConfig.bankPichinchaDni || "";
            pichinchaCard.innerHTML = `
                <div style="font-weight: 700; font-size: 12px; color: #f59e0b; margin-bottom: 8px;">🏦 BANCO PICHINCHA</div>
                <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta: <strong id="pichincha-info-acc">${pichinchaAcc}</strong> ${makeCopyBtn(pichinchaAcc, 'Cuenta')}</div>
                <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="pichincha-info-name">${pichName}</span> ${makeCopyBtn(pichName, 'Titular')}</div>
                <div style="font-size: 12px; color: #8a91a6;">CI/RUC: <span id="pichincha-info-dni">${pichDni}</span> ${makeCopyBtn(pichDni, 'CI/RUC')}</div>
            `;
            transferVisible = true;
        } else {
            pichinchaCard.style.display = 'none';
        }

        // Guayaquil
        const guayaquilCard = document.getElementById('store-bank-guayaquil-card');
        if (guayaquilAcc) {
            guayaquilCard.style.display = 'block';
            const guayName = window.storeProducerConfig.bankGuayaquilName || "";
            const guayDni = window.storeProducerConfig.bankGuayaquilDni || "";
            guayaquilCard.innerHTML = `
                <div style="font-weight: 700; font-size: 12px; color: #ec4899; margin-bottom: 8px;">🏦 BANCO GUAYAQUIL</div>
                <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta: <strong id="guayaquil-info-acc">${guayaquilAcc}</strong> ${makeCopyBtn(guayaquilAcc, 'Cuenta')}</div>
                <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="guayaquil-info-name">${guayName}</span> ${makeCopyBtn(guayName, 'Titular')}</div>
                <div style="font-size: 12px; color: #8a91a6;">CI/RUC: <span id="guayaquil-info-dni">${guayDni}</span> ${makeCopyBtn(guayDni, 'CI/RUC')}</div>
            `;
            transferVisible = true;
        } else {
            guayaquilCard.style.display = 'none';
        }

        if (transferVisible) {
            transferTab.style.display = 'block';
        } else {
            transferTab.style.display = 'none';
        }

        // PayPal
        if (paypalClientId || paypalEmail) {
            paypalTab.style.display = 'block';
            paypalVisible = true;
        } else {
            paypalTab.style.display = 'none';
        }

        // Check visible methods
        if (!deunaVisible && !transferVisible && !paypalVisible && checkoutSelectedLicense !== 'exclusive') {
            document.getElementById('store-pay-deuna').style.display = 'none';
            document.getElementById('store-pay-transfer').style.display = 'none';
            document.getElementById('store-pay-paypal').style.display = 'block';
            document.getElementById('store-pay-paypal').innerHTML = `
                <div style="color: #ef4444; font-size: 13px; text-align: center; padding: 20px;">
                    El productor no ha configurado ningún método de pago. Por favor, contáctalo directamente.
                </div>
            `;
            document.getElementById('store-receipt-upload-section').style.display = 'none';
            nextBtn.style.display = 'none';
        } else {
            // Select default active tab among visible ones
            let defaultTab = 'deuna';
            const currentTab = getSelectedStorePaymentMethod();
            
            // Si estaba en oferta y ya no es exclusiva, cambiamos
            if (currentTab === 'offer' && checkoutSelectedLicense !== 'exclusive') {
                if (deunaVisible) defaultTab = 'deuna';
                else if (transferVisible) defaultTab = 'transfer';
                else if (paypalVisible) defaultTab = 'paypal';
            } else if (currentTab === 'offer' && checkoutSelectedLicense === 'exclusive') {
                defaultTab = 'offer';
            } else if (deunaVisible) {
                defaultTab = 'deuna';
            } else if (transferVisible) {
                defaultTab = 'transfer';
            } else if (paypalVisible) {
                defaultTab = 'paypal';
            } else if (checkoutSelectedLicense === 'exclusive') {
                defaultTab = 'offer';
            }
            window.switchStorePaymentMethod(defaultTab);
        }
    } else {
        nextBtn.style.display = 'block';
        nextBtn.textContent = 'Continuar';
    }
};

window.switchStorePaymentMethod = function(method) {
    // Update active tab styles
    document.querySelectorAll('.pay-tab-btn').forEach(btn => {
        const id = btn.id;
        const isCurrent = id === `btn-pay-${method}`;
        if (isCurrent) {
            btn.classList.add('active');
            // Usar color ámbar para la pestaña de oferta, acento para el resto
            const activeColor = method === 'offer' ? '#f59e0b' : 'var(--accent, #00ccff)';
            btn.style.color = activeColor;
            btn.style.borderBottomColor = activeColor;
            btn.style.fontWeight = '700';
        } else {
            btn.classList.remove('active');
            btn.style.color = '#8a91a6';
            btn.style.borderBottomColor = 'transparent';
            btn.style.fontWeight = '600';
        }
    });

    // Show/hide payment sections
    document.getElementById('store-pay-deuna').style.display = method === 'deuna' ? 'block' : 'none';
    document.getElementById('store-pay-transfer').style.display = method === 'transfer' ? 'block' : 'none';
    document.getElementById('store-pay-paypal').style.display = method === 'paypal' ? 'block' : 'none';
    const offerPanel = document.getElementById('store-pay-offer');
    if (offerPanel) offerPanel.style.display = method === 'offer' ? 'block' : 'none';

    // Handle receipt section & Confirm button visibility
    const nextBtn = document.getElementById('btn-checkout-next');
    const receiptSection = document.getElementById('store-receipt-upload-section');

    if (method === 'offer') {
        // Oferta: no se necesita comprobante, solo el precio y el mensaje
        receiptSection.style.display = 'none';
        nextBtn.style.display = 'block';
        nextBtn.textContent = '📩 Enviar Oferta';
        // Mostrar precio exclusivo original en el campo de oferta para referencia
        const offerPriceInput = document.getElementById('offer-price-input');
        const offerOriginalSpan = offerPanel && offerPanel.querySelector('strong');
        if (offerOriginalSpan) {
            const exclusivePrice = (window.LICENSE_CONFIGS || {}).exclusive ? window.LICENSE_CONFIGS.exclusive.price : 500;
            offerOriginalSpan.textContent = `$${parseFloat(exclusivePrice).toFixed(2)} USD`;
        }
    } else if (method === 'paypal') {
        const clientId = window.storeProducerConfig.paypalClientId || "";
        if (clientId) {
            receiptSection.style.display = 'none';
            nextBtn.style.display = 'none';
            document.getElementById('store-paypal-button-container').innerHTML = '<div style="color: #8a91a6; font-size: 13px;">Cargando botones de PayPal...</div>';
            loadStorePayPalSDK(clientId, () => {
                renderStorePayPalButton(clientId);
            });
        } else if (window.storeProducerConfig.paypalEmail) {
            receiptSection.style.display = 'block';
            nextBtn.style.display = 'block';
            nextBtn.textContent = 'Confirmar Compra';
            document.getElementById('store-paypal-button-container').innerHTML = `
                <div style="text-align: center; padding: 16px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; box-sizing: border-box;">
                    <p style="font-size: 13px; color: #8a91a6; margin-top: 0; margin-bottom: 8px;">Envía tu pago a la dirección PayPal del productor:</p>
                    <div style="font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 8px; font-family: monospace;">${window.storeProducerConfig.paypalEmail}</div>
                    <p style="font-size: 11px; color: #8a91a6; margin-bottom: 0;">(Sube una captura de tu transferencia de PayPal abajo)</p>
                </div>
            `;
        } else {
            receiptSection.style.display = 'none';
            nextBtn.style.display = 'none';
            document.getElementById('store-paypal-button-container').innerHTML = `
                <div style="color: #ef4444; font-size: 13px;">El productor no ha configurado PayPal.</div>
            `;
        }
    } else {
        receiptSection.style.display = 'block';
        nextBtn.style.display = 'block';
        nextBtn.textContent = 'Confirmar Compra';
    }
};

function getSelectedStorePaymentMethod() {
    const activeTab = document.querySelector('.pay-tab-btn.active');
    if (!activeTab) return 'transfer';
    return activeTab.id.replace('btn-pay-', '');
}

async function submitExclusiveOffer() {
    const beat = window.storeBeats.find(b => b.id === checkoutSelectedBeatId);
    const buyerName = document.getElementById('buyer-name').value.trim();
    const buyerEmail = document.getElementById('buyer-email').value.trim();
    const buyerPhone = document.getElementById('buyer-phone').value.trim();
    const buyerDni = document.getElementById('buyer-dni').value.trim();
    const buyerCity = document.getElementById('buyer-city').value.trim();
    const buyerCountry = document.getElementById('buyer-country').value.trim();
    const offerPrice = parseFloat(document.getElementById('offer-price-input').value);
    const offerMessage = document.getElementById('offer-message-input').value.trim();

    if (!buyerName || !buyerEmail) {
        showToast('Por favor completa tu Nombre y Correo Electrónico.', true);
        updateCheckoutStepView(2);
        return;
    }
    if (!offerPrice || offerPrice < 250) {
        showToast('El monto mínimo para ofertas es de $250 USD.', true);
        return;
    }

    const originalPrice = (window.LICENSE_CONFIGS || {}).exclusive ? window.LICENSE_CONFIGS.exclusive.price : 500;

    const offerData = {
        type: 'exclusive_offer',
        producerId: window.storeProducerUid,
        beatId: checkoutSelectedBeatId,
        beatName: beat ? beat.name : '',
        licenseType: 'exclusive',
        price: offerPrice,
        originalPrice: originalPrice,
        offerMessage: offerMessage || '',
        buyerName: buyerName,
        buyerEmail: buyerEmail,
        buyerPhone: buyerPhone,
        buyerDni: buyerDni,
        buyerCity: buyerCity,
        buyerCountry: buyerCountry,
        method: 'offer',
        reference: 'OFERTA-' + Date.now(),
        receiptUrl: '',
        status: 'pending',
        timestamp: new Date().toISOString()
    };

    try {
        const nextBtn = document.getElementById('btn-checkout-next');
        const originalText = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '⏳ Enviando oferta...';

        // Guardar oferta en Firestore
        const colRef = collection(db, "payments");
        await addDoc(colRef, offerData);

        // Guardar contacto del cantante
        try {
            const contactId = buyerEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const contactDocRef = doc(db, "users", window.storeProducerUid, "contacts", contactId);
            await setDoc(contactDocRef, {
                name: buyerName,
                email: buyerEmail,
                phone: buyerPhone || "",
                city: buyerCity || "Oferta",
                country: buyerCountry || "",
                updatedAt: Date.now(),
                source: 'exclusive_offer'
            });
        } catch (ce) { console.warn('No se pudo guardar contacto de oferta:', ce); }

        showToast('✅ ¡Oferta enviada! El productor la revisará y te contactará pronto.');
        document.getElementById('beat-checkout-modal').style.display = 'none';
        nextBtn.disabled = false;
        nextBtn.innerHTML = originalText;
    } catch (e) {
        console.error("Error al enviar oferta:", e);
        showToast("Error al enviar oferta: " + e.message, true);
        const nextBtn = document.getElementById('btn-checkout-next');
        nextBtn.disabled = false;
        nextBtn.innerHTML = '📩 Enviar Oferta';
    }
}

window.openFreeDownloadModal = function(beatId) {
    const beat = window.storeBeats.find(b => b.id === beatId);
    if (!beat) return;

    document.getElementById('free-download-beat-id').value = beatId;
    document.getElementById('free-buyer-name').value = '';
    document.getElementById('free-buyer-email').value = '';
    document.getElementById('free-buyer-phone').value = '';
    
    document.getElementById('free-download-modal').style.display = 'flex';
};

window.submitFreeDownloadLead = async function() {
    const beatId = document.getElementById('free-download-beat-id').value;
    const beat = window.storeBeats.find(b => b.id === beatId);
    if (!beat) return;

    const buyerName = document.getElementById('free-buyer-name').value.trim();
    const buyerEmail = document.getElementById('free-buyer-email').value.trim();
    const buyerPhone = document.getElementById('free-buyer-phone').value.trim();

    if (!buyerName || !buyerEmail) {
        showToast('Por favor escribe tu Nombre y Correo', true);
        return;
    }

    const submitBtn = document.querySelector('#free-download-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = '⏳ Procesando...';

    try {
        // Guardar contacto en Firestore
        const contactId = buyerEmail.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const contactDocRef = doc(db, "users", window.storeProducerUid, "contacts", contactId);
        
        await setDoc(contactDocRef, {
            name: buyerName,
            email: buyerEmail,
            phone: buyerPhone || "",
            city: "Descarga Gratis",
            country: "Tienda Pública",
            updatedAt: Date.now(),
            source: 'free_download'
        });

        // Ocultar modal
        document.getElementById('free-download-modal').style.display = 'none';

        // Disparar descarga en el navegador
        const link = document.createElement('a');
        link.href = beat.mp3;
        link.download = `${beat.name} (Prod. ${window.storeProducerConfig.aka || 'BEATSS'}).mp3`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('¡Descarga iniciada! Te has registrado en el boletín del productor.');
    } catch (e) {
        console.error("Error al registrar lead de descarga:", e);
        showToast('Error al iniciar la descarga: ' + e.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
};

function getDefaultBeatArtwork() {
    const accentColor = document.documentElement.style.getPropertyValue('--accent') || '#00ccff';
    const colorHex = accentColor.trim().replace('#', '%23');
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" style="background:%2311121a;"><circle cx="50" cy="50" r="38" fill="none" stroke="${colorHex}" stroke-width="2" stroke-dasharray="4 4" opacity="0.2"/><path d="M42 65V35l26-4v30" fill="none" stroke="${colorHex}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="65" r="7" fill="${colorHex}"/><circle cx="61" cy="61" r="7" fill="${colorHex}"/></svg>`;
}
window.getDefaultBeatArtwork = getDefaultBeatArtwork;

// Lógica de Checkout de Beats para Clientes
function setupStoreCheckout() {
    if (window._storeCheckoutConfigured) return;
    window._storeCheckoutConfigured = true;

    const cancelBtn = document.getElementById('btn-checkout-cancel');
    const prevBtn = document.getElementById('btn-checkout-prev');
    const nextBtn = document.getElementById('btn-checkout-next');
    const closeBtn = document.getElementById('btn-close-checkout-modal');
    
    // File upload
    const uploadReceiptBtn = document.getElementById('btn-store-upload-receipt');
    const receiptFileInput = document.getElementById('store-receipt-file');
    
    closeBtn.addEventListener('click', () => {
        document.getElementById('beat-checkout-modal').style.display = 'none';
    });
    
    cancelBtn.addEventListener('click', () => {
        document.getElementById('beat-checkout-modal').style.display = 'none';
    });

    prevBtn.addEventListener('click', () => {
        if (checkoutCurrentStep > 1) {
            updateCheckoutStepView(checkoutCurrentStep - 1);
        }
    });

    nextBtn.addEventListener('click', async () => {
        if (checkoutCurrentStep === 1) {
            // Validar monto para exclusiva si está seleccionada
            if (checkoutSelectedLicense === 'exclusive') {
                const price = window.getCheckoutPrice();
                if (isNaN(price) || price < 250) {
                    showToast('El monto mínimo para la licencia Exclusiva es de $250 USD.', true);
                    return;
                }
            }
            updateCheckoutStepView(2);
        } else if (checkoutCurrentStep === 2) {
            const buyerName = document.getElementById('buyer-name').value.trim();
            const buyerEmail = document.getElementById('buyer-email').value.trim();
            if (!buyerName || !buyerEmail) {
                showToast('Por favor escribe tu Nombre y Correo Electrónico.', true);
                return;
            }
            updateCheckoutStepView(3);
        } else if (checkoutCurrentStep === 3) {
            const method = getSelectedStorePaymentMethod();
            if (method === 'offer') {
                await submitExclusiveOffer();
            } else if (method !== 'paypal') {
                await submitBeatPurchasePayment(method);
            } else {
                document.getElementById('beat-checkout-modal').style.display = 'none';
            }
        }
    });

    uploadReceiptBtn.addEventListener('click', () => {
        receiptFileInput.click();
    });

    receiptFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('store-receipt-file-name').textContent = file.name;
            const reader = new FileReader();
            reader.onload = function(event) {
                storePaymentReceiptBase64 = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
}

function loadStorePayPalSDK(clientId, callback) {
    const existingScript = document.getElementById('store-paypal-sdk-script');
    if (existingScript) {
        if (existingScript.getAttribute('data-client-id') === clientId) {
            callback();
            return;
        } else {
            existingScript.remove();
        }
    }
    const sdk = document.createElement('script');
    sdk.id = 'store-paypal-sdk-script';
    sdk.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture`;
    sdk.setAttribute('data-client-id', clientId);
    sdk.onload = callback;
    document.head.appendChild(sdk);
}

function renderStorePayPalButton(clientId) {
    const container = document.getElementById('store-paypal-button-container');
    container.innerHTML = '';
    
    const price = window.getCheckoutPrice();
    const beat = window.storeBeats.find(b => b.id === checkoutSelectedBeatId);
    
    if (window.paypal) {
        window.paypal.Buttons({
            createOrder: function(data, actions) {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            currency_code: 'USD',
                            value: price.toFixed(2)
                        },
                        description: `Licencia ${checkoutSelectedLicense.toUpperCase()} - Beat: ${beat.name}`
                    }]
                });
            },
            onApprove: async function(data, actions) {
                return actions.order.capture().then(async function(details) {
                    console.log('PayPal transaction completed:', details);
                    showToast('Pago aprobado por PayPal. Procesando entrega...');
                    await submitBeatPurchasePayment('paypal', details.id);
                });
            },
            onError: function(err) {
                console.error('PayPal store error:', err);
                showToast('Error en el pago de PayPal.', true);
            }
        }).render('#store-paypal-button-container');
    }
}

async function submitBeatPurchasePayment(method, reference = '') {
    const beat = window.storeBeats.find(b => b.id === checkoutSelectedBeatId);
    const buyerName = document.getElementById('buyer-name').value.trim();
    const buyerEmail = document.getElementById('buyer-email').value.trim();
    const buyerPhone = document.getElementById('buyer-phone').value.trim();
    const buyerDni = document.getElementById('buyer-dni').value.trim();
    const buyerCity = document.getElementById('buyer-city').value.trim();
    const buyerCountry = document.getElementById('buyer-country').value.trim();

    if (!buyerName || !buyerEmail) {
        showToast('Por favor completa todos los campos del formulario.', true);
        updateCheckoutStepView(2);
        return;
    }

    if (method !== 'paypal' && !storePaymentReceiptBase64) {
        showToast('Por favor sube la captura de tu comprobante de pago.', true);
        return;
    }

    const price = window.getCheckoutPrice();
    
    const orderData = {
        type: 'beat_purchase',
        producerId: window.storeProducerUid,
        beatId: checkoutSelectedBeatId,
        beatName: beat.name,
        licenseType: checkoutSelectedLicense,
        price: price,
        buyerName: buyerName,
        buyerEmail: buyerEmail,
        buyerPhone: buyerPhone,
        buyerDni: buyerDni,
        buyerCity: buyerCity,
        buyerCountry: buyerCountry,
        method: method,
        reference: reference || ('REF-' + Date.now()),
        receiptUrl: storePaymentReceiptBase64 || '',
        status: method === 'paypal' ? 'approved' : 'pending',
        timestamp: new Date().toISOString()
    };

    try {
        const nextBtn = document.getElementById('btn-checkout-next');
        const originalText = nextBtn.innerHTML;
        nextBtn.disabled = true;
        nextBtn.innerHTML = '⏳ Guardando pedido...';

        const colRef = collection(db, "payments");
        const docRef = await addDoc(colRef, orderData);
        
        if (method === 'paypal') {
            showToast('¡Pago procesado con éxito!');
            await autoDeliverBeatSale(docRef.id, orderData);
        } else {
            showToast('¡Pedido registrado! Esperando aprobación del productor.');
        }
        
        document.getElementById('beat-checkout-modal').style.display = 'none';
        nextBtn.disabled = false;
        nextBtn.innerHTML = originalText;
    } catch (e) {
        console.error("Error al registrar pedido:", e);
        showToast("Error al procesar el pedido: " + e.message, true);
        const nextBtn = document.getElementById('btn-checkout-next');
        nextBtn.disabled = false;
        nextBtn.innerHTML = 'Confirmar Compra';
    }
}

// Entrega automática en checkout (PayPal)
async function autoDeliverBeatSale(paymentId, orderData) {
    try {
        console.log("🚀 Iniciando entrega automatizada de PayPal para el pago:", paymentId);
        
        // Fetch beat details
        const beatCol = collection(db, "users", orderData.producerId, "beats");
        const beatSnapshot = await getDocs(beatCol);
        let beatData = null;
        beatSnapshot.forEach(doc => {
            if (doc.id === orderData.beatId) {
                beatData = doc.data();
            }
        });

        if (!beatData) {
            console.warn("Beat no encontrado en catálogo para la entrega automática.");
            return;
        }

        // Configurar credenciales de EmailJS del productor
        const serviceId = window.storeProducerConfig.emailjsServiceId || 'service_7ofza2v';
        const templateId = window.storeProducerConfig.emailjsTemplateId || 'template_mlimkld';
        const publicKey = window.storeProducerConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

        // Lógica simplificada de EmailJS directo en background
        if (typeof emailjs !== 'undefined') {
            emailjs.init(publicKey);

            const mp3 = beatData.mp3 || "";
            const wav = beatData.wav || "";
            const stems = beatData.stems || "";

            const typeLabels = {
                basic: 'Básica',
                premium: 'Premium',
                premium_plus: 'Premium Plus',
                unlimited_flp: 'Ilimitada + FLP',
                exclusive: 'Exclusiva'
            };

            const linksText = `
<div style="font-family: -apple-system, sans-serif;">
    <h3>Instrumental: ${beatData.name}</h3>
    <p>Gracias por tu compra. Aquí tienes tus enlaces de descarga directa:</p>
    <ul>
        ${mp3 ? `<li><strong>MP3 (320kbps):</strong> <a href="${mp3}">Descargar</a></li>` : ''}
        ${wav && (orderData.licenseType !== 'basic') ? `<li><strong>WAV (Master):</strong> <a href="${wav}">Descargar</a></li>` : ''}
        ${stems && (orderData.licenseType !== 'basic' && orderData.licenseType !== 'premium') ? `<li><strong>Stems (Pistas Separadas):</strong> <a href="${stems}">Descargar</a></li>` : ''}
    </ul>
    <p>Tu contrato y licencia oficial PDF serán procesados y firmados por el productor muy pronto.</p>
</div>`;

            const templateParams = {
                to_name: orderData.buyerName,
                to_email: orderData.buyerEmail,
                beat_name: orderData.beatName,
                license_type: typeLabels[orderData.licenseType] || orderData.licenseType,
                delivery_links: linksText,
                producer_name: window.storeProducerConfig.aka || "Productor",
                producer_email: window.storeProducerConfig.email || "",
                pdf_filename: `Licencia_PayPal_${orderData.reference}.pdf`
            };

            await emailjs.send(serviceId, templateId, templateParams);
            console.log("📧 Correo de entrega directa de PayPal enviado al comprador con éxito.");
        }
    } catch (err) {
        console.error("Fallo al enviar correo automático de PayPal:", err);
    }
}

// PANEL DEL PRODUCTOR: GESTIÓN DE VENTAS
// ── Listener de pagos en tiempo real ──────────────────────────────────────────
let _salesUnsubscribe = null;          // guarda el unsubscribe para limpieza
let _salesFirstLoad   = true;          // para no notificar en la carga inicial
let _knownPaymentIds  = new Set();     // IDs ya conocidos

function initSalesRealtimeListener() {
    if (!window.currentUser) return;

    // Cancelar listener anterior si existe
    if (_salesUnsubscribe) { _salesUnsubscribe(); _salesUnsubscribe = null; }
    _salesFirstLoad   = true;
    _knownPaymentIds  = new Set();
    window.storePayments = [];

    const paymentsCol = collection(db, "payments");
    const q = query(
        paymentsCol,
        where("producerId", "==", window.currentUser),
        orderBy("timestamp", "desc")
    );

    _salesUnsubscribe = onSnapshot(q, (snapshot) => {
        const newDocs = [];

        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (data.type !== 'beat_purchase' && data.type !== 'exclusive_offer') return;

            if (change.type === 'added') {
                // Si ya lo conocíamos, ignorar (evita notificar duplicados en hot-reload)
                if (!_salesFirstLoad && !_knownPaymentIds.has(change.doc.id)) {
                    newDocs.push({ id: change.doc.id, ...data });
                }
                _knownPaymentIds.add(change.doc.id);
            }
        });

        // Reconstruir array completo
        window.storePayments = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.type === 'beat_purchase' || data.type === 'exclusive_offer') {
                window.storePayments.push({ id: d.id, ...data });
            }
        });

        renderSalesTable();
        renderSalesStats();
        updateSalesBadge();

        // Notificaciones de nuevos pedidos (solo tras carga inicial)
        if (!_salesFirstLoad && newDocs.length > 0) {
            newDocs.forEach(pay => {
                const isOffer = pay.type === 'exclusive_offer';
                const icon    = isOffer ? '🏷️' : '🛒';
                const title   = isOffer ? '¡Nueva Oferta Exclusiva!' : '¡Nuevo Pedido!';
                const beat    = pay.beatName || 'Beat';
                const buyer   = pay.buyerName || 'Comprador';
                const amount  = `$${parseFloat(pay.price || 0).toFixed(2)}`;

                showToast(`${icon} ${title}: ${buyer} quiere "${beat}" por ${amount}`, false);

                // Notificación nativa del browser si está permitida
                if (Notification?.permission === 'granted') {
                    new Notification(`${icon} BEATSS – ${title}`, {
                        body: `${buyer} → "${beat}" · ${amount}`,
                        icon: '/favicon.ico'
                    });
                }
            });
        }

        _salesFirstLoad = false;
    }, (err) => {
        console.error("Error en listener de pagos:", err);
        // Fallback a getDocs si el listener falla (ej. sin índice)
        loadSalesDataFallback();
    });
}

// Actualiza el badge numérico en el tab de Ventas
function updateSalesBadge() {
    const pending = (window.storePayments || []).filter(p => p.status === 'pending').length;
    let badge = document.getElementById('sales-tab-badge');
    const salesTab = document.querySelector('[data-tab="beats-store"]') ||
                     document.querySelector('#tab-beats-store') ||
                     document.querySelector('.nav-btn[data-section="beats-store"]');

    if (pending > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'sales-tab-badge';
            badge.style.cssText = `
                display: inline-flex; align-items: center; justify-content: center;
                background: #ef4444; color: #fff; font-size: 10px; font-weight: 800;
                border-radius: 999px; min-width: 18px; height: 18px; padding: 0 5px;
                margin-left: 6px; line-height: 1; animation: pulse-badge 1.5s ease-in-out infinite;
            `;
            if (!document.getElementById('sales-badge-style')) {
                const st = document.createElement('style');
                st.id = 'sales-badge-style';
                st.textContent = `
                    @keyframes pulse-badge {
                        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
                        50%       { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
                    }
                `;
                document.head.appendChild(st);
            }
            if (salesTab) salesTab.appendChild(badge);
            else document.body.appendChild(badge); // fallback temporal
        }
        badge.textContent = pending > 99 ? '99+' : pending;
        badge.style.display = 'inline-flex';
    } else if (badge) {
        badge.style.display = 'none';
    }
}

// Solicitar permiso de notificaciones nativas al browser
async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
    }
}

// Fallback: carga única (sin tiempo real) si onSnapshot falla
async function loadSalesDataFallback() {
    if (!window.currentUser) return;
    try {
        const q = query(
            collection(db, "payments"),
            where("producerId", "==", window.currentUser),
            orderBy("timestamp", "desc")
        );
        const snap = await getDocs(q);
        window.storePayments = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.type === 'beat_purchase' || data.type === 'exclusive_offer') {
                window.storePayments.push({ id: d.id, ...data });
            }
        });
        renderSalesTable();
        renderSalesStats();
        updateSalesBadge();
    } catch (e) { console.error("Error cargando pedidos (fallback):", e); }
}

// Mantener compatibilidad con llamadas existentes a loadSalesData()
async function loadSalesData() {
    initSalesRealtimeListener();
}


function renderSalesTable() {
    const tbody = document.getElementById('sales-table-tbody');
    const emptyState = document.getElementById('sales-empty-state');
    
    if (!window.storePayments || window.storePayments.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('sales-pending-count').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';

    let pendingCount = 0;

    tbody.innerHTML = window.storePayments.map(pay => {
        const dateStr = pay.timestamp ? pay.timestamp.split('T')[0] : 'N/A';
        const isOffer = pay.type === 'exclusive_offer';
        const methodLabel = isOffer ? '💬 Oferta' : (pay.method === 'deuna' ? 'Deuna!' : (pay.method === 'paypal' ? 'PayPal' : 'Transf.'));
        
        let statusBadge = '';
        let actionButtons = '';
        
        if (pay.status === 'pending') {
            pendingCount++;
            statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${isOffer ? 'Oferta Pendiente' : 'Pendiente'}</span>`;
            if (isOffer) {
                actionButtons = `
                    <button class="btn btn-primary" onclick="window.acceptExclusiveOffer('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px;">✓ Aceptar</button>
                    <button class="btn" onclick="window.rejectBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; margin-left: 4px;">✕ Rechazar</button>
                `;
            } else {
                actionButtons = `
                    <button class="btn btn-primary" onclick="window.approveBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px;">Aprobar</button>
                    <button class="btn" onclick="window.rejectBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; margin-left: 4px;">Rechazar</button>
                `;
            }
        } else if (pay.status === 'approved') {
            statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Aprobado</span>`;
            actionButtons = `<span style="font-size: 11px; color: #8a91a6;">Completado</span>`;
        } else {
            statusBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Rechazado</span>`;
            actionButtons = `<span style="font-size: 11px; color: #8a91a6;">Cancelado</span>`;
        }

        const receiptLink = pay.receiptUrl 
            ? `<a href="${pay.receiptUrl}" target="_blank" style="color: var(--accent); font-weight: 600; text-decoration: underline;">Ver Captura</a>` 
            : `<span style="color: #8a91a6;">${isOffer ? 'N/A' : 'N/A (PayPal)'}</span>`;

        // Mostrar precio propuesto en la oferta vs precio original
        const priceDisplay = isOffer
            ? `<div style="font-weight: 700; color: #f59e0b;">$${parseFloat(pay.price).toFixed(2)}</div><div style="font-size: 10px; color: #8a91a6;">Precio orig: $${parseFloat(pay.originalPrice || pay.price).toFixed(2)}</div>`
            : `<div style="font-weight: 700; color: #fff;">$${parseFloat(pay.price).toFixed(2)}</div>`;

        // Mensaje de la oferta si existe
        const offerMessageRow = isOffer && pay.offerMessage
            ? `<tr><td colspan="8" style="background: rgba(245, 158, 11, 0.05); padding: 8px 12px; font-size: 12px; color: #8a91a6; font-style: italic; border-bottom: 1px solid rgba(255,255,255,0.04);">💬 Mensaje: "${pay.offerMessage}"</td></tr>`
            : '';

        // Detectar si el pedido es "nuevo" (menos de 5 minutos)
        const tsMs = pay.timestamp ? new Date(pay.timestamp).getTime() : 0;
        const isNew = pay.status === 'pending' && (Date.now() - tsMs) < 5 * 60 * 1000;
        const newBadge = isNew ? `<span style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; animation: pulse-badge 1.5s ease-in-out infinite; vertical-align: middle;">NUEVO</span>` : '';

        return `
            ${offerMessageRow}
            <tr style="${isOffer ? 'border-left: 3px solid #f59e0b;' : (isNew ? 'border-left: 3px solid #ef4444;' : '')}">
                <td data-label="Fecha / ID">
                    <div style="font-weight: 600;">${dateStr}${newBadge}</div>
                    <div style="font-size: 10px; color: #8a91a6;">ID: ${pay.reference}</div>
                </td>
                <td data-label="Beat / Licencia">
                    <div style="font-weight: 600; color: #fff;">${pay.beatName}</div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--accent);">${pay.licenseType}${isOffer ? ' 🏷️' : ''}</div>
                </td>
                <td data-label="Comprador">
                    <div>${pay.buyerName}</div>
                    <div style="font-size: 11px; color: #8a91a6;">${pay.buyerEmail}</div>
                </td>
                <td data-label="Monto">${priceDisplay}</td>
                <td data-label="Método">${methodLabel}</td>
                <td data-label="Comprobante">${receiptLink}</td>
                <td data-label="Estado">${statusBadge}</td>
                <td class="actions-cell" style="text-align: right; white-space: nowrap;">${actionButtons}</td>
            </tr>
        `;
    }).join('');

    const badge = document.getElementById('sales-pending-count');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderSalesStats() {
    let pending = 0;
    let approved = 0;
    let revenue = 0.0;

    window.storePayments.forEach(pay => {
        if (pay.status === 'pending') pending++;
        if (pay.status === 'approved') {
            approved++;
            revenue += parseFloat(pay.price) || 0.0;
        }
    });

    document.getElementById('sales-stat-pending').textContent = pending;
    document.getElementById('sales-stat-approved').textContent = approved;
    document.getElementById('sales-stat-revenue').textContent = `$${revenue.toFixed(2)}`;
}

window.approveBeatSale = async function(paymentId) {
    const payment = window.storePayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!confirm(`¿Estás seguro de que deseas aprobar la venta de $${payment.price} por "${payment.beatName}"? Esto compilará el contrato PDF, guardará la licencia en el historial y enviará la entrega por EmailJS.`)) {
        return;
    }

    try {
        // 1. Obtener datos del beat de la base de datos
        const beatDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId);
        const beatSnap = await getDoc(beatDocRef);
        let beatData = null;
        if (beatSnap.exists()) {
            beatData = beatSnap.data();
        } else {
            beatData = localBeats.find(b => b.id === payment.beatId);
        }

        if (!beatData) {
            alert("Error: No se encontraron los datos del beat en el catálogo. Verifica que el beat aún exista.");
            return;
        }

        // 2. Guardar estado actual del formulario de licencias
        const originalForm = {
            beatName: document.getElementById('beat-name').value,
            buyerName: document.getElementById('buyer-name').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            buyerDni: document.getElementById('buyer-id').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            refCode: document.getElementById('ref-code').value,
            effectiveDate: document.getElementById('effective-date').value,
            audioMp3: document.getElementById('audio-link-mp3').value,
            audioWav: document.getElementById('audio-link-wav').value,
            audioStems: document.getElementById('audio-link-stems').value,
            licenseType: getActiveLicenseType(),
            licenseValue: document.getElementById('license-value').value,
            paymentMethod: document.getElementById('payment-method').value
        };

        // 3. Rellenar formulario con los datos de la venta
        document.getElementById('beat-name').value = payment.beatName;
        document.getElementById('buyer-name').value = payment.buyerName;
        document.getElementById('buyer-email').value = payment.buyerEmail;
        document.getElementById('buyer-phone').value = payment.buyerPhone || "";
        document.getElementById('buyer-id').value = payment.buyerDni || "";
        document.getElementById('buyer-city').value = payment.buyerCity || "";
        document.getElementById('buyer-country').value = payment.buyerCountry || "";
        document.getElementById('ref-code').value = payment.reference;
        document.getElementById('effective-date').value = payment.timestamp.split('T')[0];
        document.getElementById('audio-link-mp3').value = beatData.mp3 || "";
        document.getElementById('audio-link-wav').value = beatData.wav || "";
        document.getElementById('audio-link-stems').value = beatData.stems || "";
        document.getElementById('license-value').value = payment.price;
        document.getElementById('payment-method').value = payment.method === 'deuna' ? 'Deuna!' : (payment.method === 'paypal' ? 'PayPal' : 'Transferencia Bancaria');

        // Seleccionar tipo de licencia
        selectLicenseType(payment.licenseType);

        // Compilar contrato en pantalla
        compileContract();

        // 4. Ejecutar entrega por correo y generación de PDF
        await sendEmailDelivery();

        // 5. Actualizar estado del pago en Firestore
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'approved' });

        payment.status = 'approved';

        // 6. Restaurar el estado previo del formulario
        document.getElementById('beat-name').value = originalForm.beatName;
        document.getElementById('buyer-name').value = originalForm.buyerName;
        document.getElementById('buyer-email').value = originalForm.buyerEmail;
        document.getElementById('buyer-phone').value = originalForm.buyerPhone;
        document.getElementById('buyer-id').value = originalForm.buyerDni;
        document.getElementById('buyer-city').value = originalForm.buyerCity;
        document.getElementById('buyer-country').value = originalForm.buyerCountry;
        document.getElementById('ref-code').value = originalForm.refCode;
        document.getElementById('effective-date').value = originalForm.effectiveDate;
        document.getElementById('audio-link-mp3').value = originalForm.audioMp3;
        document.getElementById('audio-link-wav').value = originalForm.audioWav;
        document.getElementById('audio-link-stems').value = originalForm.audioStems;
        document.getElementById('license-value').value = originalForm.licenseValue;
        document.getElementById('payment-method').value = originalForm.paymentMethod;

        selectLicenseType(originalForm.licenseType);
        compileContract();

        showToast("¡Venta de beat aprobada y entregada con éxito!");
        loadSalesData();

    } catch (err) {
        console.error("Error al aprobar venta de beat:", err);
        showToast("Error al aprobar: " + err.message, true);
    }
};

window.rejectBeatSale = async function(paymentId) {
    if (!confirm("¿Estás seguro de que deseas rechazar este pedido? Esto cancelará la transacción.")) {
        return;
    }
    try {
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'rejected' });
        showToast("Pedido rechazado.");
        loadSalesData();
    } catch (err) {
        console.error("Error al rechazar:", err);
        showToast("Error al rechazar: " + err.message, true);
    }
};

window.acceptExclusiveOffer = async function(paymentId) {
    const payment = window.storePayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!confirm(`¿Aceptar la oferta exclusiva de $${payment.price} USD por "${payment.beatName}"? Se generará el contrato y se enviará al comprador.`)) {
        return;
    }

    try {
        // 1. Obtener datos del beat
        const beatDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId);
        const beatSnap = await getDoc(beatDocRef);
        let beatData = beatSnap.exists() ? beatSnap.data() : localBeats.find(b => b.id === payment.beatId);

        if (!beatData) {
            alert("Error: No se encontraron los datos del beat.");
            return;
        }

        // 2. Guardar formulario actual
        const originalForm = {
            beatName: document.getElementById('beat-name').value,
            buyerName: document.getElementById('buyer-name').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            buyerDni: document.getElementById('buyer-id').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            refCode: document.getElementById('ref-code').value,
            effectiveDate: document.getElementById('effective-date').value,
            audioMp3: document.getElementById('audio-link-mp3').value,
            audioWav: document.getElementById('audio-link-wav').value,
            audioStems: document.getElementById('audio-link-stems').value,
            licenseType: getActiveLicenseType(),
            licenseValue: document.getElementById('license-value').value,
            paymentMethod: document.getElementById('payment-method').value
        };

        // 3. Rellenar formulario con datos de la oferta aceptada
        document.getElementById('beat-name').value = payment.beatName;
        document.getElementById('buyer-name').value = payment.buyerName;
        document.getElementById('buyer-email').value = payment.buyerEmail;
        document.getElementById('buyer-phone').value = payment.buyerPhone || "";
        document.getElementById('buyer-id').value = payment.buyerDni || "";
        document.getElementById('buyer-city').value = payment.buyerCity || "";
        document.getElementById('buyer-country').value = payment.buyerCountry || "";
        document.getElementById('ref-code').value = payment.reference;
        document.getElementById('effective-date').value = payment.timestamp.split('T')[0];
        document.getElementById('audio-link-mp3').value = beatData.mp3 || "";
        document.getElementById('audio-link-wav').value = beatData.wav || "";
        document.getElementById('audio-link-stems').value = beatData.stems || "";
        document.getElementById('license-value').value = payment.price; // precio negociado
        document.getElementById('payment-method').value = 'Oferta Aceptada';

        // Seleccionar tipo de licencia (exclusiva)
        selectLicenseType('exclusive');

        // Compilar contrato y enviar
        compileContract();
        await sendEmailDelivery();

        // 4. Marcar como aprobado en Firestore
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'approved' });
        payment.status = 'approved';

        // 5. Restaurar formulario anterior
        document.getElementById('beat-name').value = originalForm.beatName;
        document.getElementById('buyer-name').value = originalForm.buyerName;
        document.getElementById('buyer-email').value = originalForm.buyerEmail;
        document.getElementById('buyer-phone').value = originalForm.buyerPhone;
        document.getElementById('buyer-id').value = originalForm.buyerDni;
        document.getElementById('buyer-city').value = originalForm.buyerCity;
        document.getElementById('buyer-country').value = originalForm.buyerCountry;
        document.getElementById('ref-code').value = originalForm.refCode;
        document.getElementById('effective-date').value = originalForm.effectiveDate;
        document.getElementById('audio-link-mp3').value = originalForm.audioMp3;
        document.getElementById('audio-link-wav').value = originalForm.audioWav;
        document.getElementById('audio-link-stems').value = originalForm.audioStems;
        document.getElementById('license-value').value = originalForm.licenseValue;
        document.getElementById('payment-method').value = originalForm.paymentMethod;
        selectLicenseType(originalForm.licenseType);
        compileContract();

        showToast("✅ Oferta exclusiva aceptada y contrato enviado al comprador.");
        loadSalesData();

    } catch (err) {
        console.error("Error al aceptar oferta exclusiva:", err);
        showToast("Error al aceptar oferta: " + err.message, true);
    }
};

// Activar detector de URL en carga
function checkPublicStorefront() {
    const urlParams = new URLSearchParams(window.location.search);
    const producerAka = urlParams.get('p') || urlParams.get('producer');
    if (producerAka) {
        window.isPublicStoreMode = true;
        initPublicStore(producerAka);
        return true;
    }
    return false;
}

// Escuchar el evento de recarga del dashboard de ventas en el panel
document.getElementById('btn-sales-refresh')?.addEventListener('click', loadSalesData);

// Ejecutar check en inicio
setTimeout(checkPublicStorefront, 400);

// =======================================================
// GLOBAL CATALOG IMPLEMENTATION (MARKETPLACE)
// =======================================================
window.isGlobalCatalogMode = false;
window.globalProducersConfig = {};
window.globalBeats = [];
window.filteredGlobalBeats = [];

window.initGlobalCatalog = async function() {
    console.log("🌍 Cargando Catálogo Global de BEATSS...");
    window.isGlobalCatalogMode = true;
    window.isPublicStoreMode = false;

    // Ocultar otras pantallas
    document.getElementById('login-modal').style.display = 'none';
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('public-store-view').style.display = 'none';
    
    // Ocultar reproductor si estaba
    const player = document.getElementById('store-audio-player');
    if (player) player.style.display = 'none';

    // Mostrar vista del catálogo
    const catalogView = document.getElementById('global-catalog-view');
    catalogView.style.display = 'block';

    const grid = document.getElementById('global-beats-grid');
    grid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 80px;">
            <div class="animate-spin" style="display: inline-block; width: 40px; height: 40px; border: 4px solid rgba(255,255,255,0.1); border-top-color: #00ccff; border-radius: 50%;"></div>
            <p style="margin-top: 20px; color: #8a91a6; font-size: 15px; font-weight: 600;">Cargando catálogo global...</p>
        </div>
    `;

    try {
        // Importante: No importamos db ni getDocs porque ya existen en main.js
        // 1. Obtener todos los perfiles de productores
        const configsSnap = await getDocs(collectionGroup(db, 'config'));
        window.globalProducersConfig = {};
        configsSnap.forEach(doc => {
            const docPath = doc.ref.path;
            const uid = docPath.split('/')[1];
            window.globalProducersConfig[uid] = doc.data();
        });

        // 2. Obtener todos los beats
        const beatsSnap = await getDocs(collectionGroup(db, 'beats'));
        window.globalBeats = [];
        beatsSnap.forEach(doc => {
            const data = doc.data();
            const docPath = doc.ref.path;
            const uid = docPath.split('/')[1];
            
            // Filtrar solo beats con MP3, listos para preescucha
            if (data.mp3) {
                window.globalBeats.push({
                    id: doc.id,
                    producerUid: uid,
                    producerConfig: window.globalProducersConfig[uid] || {},
                    ...data
                });
            }
        });

        // Ordenamiento por defecto: más recientes
        window.globalBeats.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        window.filteredGlobalBeats = [...window.globalBeats];

        populateGlobalFilters(window.globalBeats);
        renderGlobalBeats(window.filteredGlobalBeats);
        setupGlobalEvents();

    } catch (error) {
        console.error("Error al cargar el Catálogo Global:", error);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
                <i data-lucide="alert-triangle" style="width: 48px; height: 48px;"></i>
                <p style="margin-top: 15px; font-weight: 600;">Ocurrió un error al cargar el catálogo.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
};

function populateGlobalFilters(beats) {
    const genres = new Set();
    beats.forEach(b => {
        if (b.genre && b.genre.trim() !== '') {
            genres.add(b.genre.trim());
        }
    });
    const genreSelect = document.getElementById('global-genre-select');
    if (genreSelect) {
        genreSelect.innerHTML = '<option value="">Cualquier Género</option>';
        Array.from(genres).sort().forEach(g => {
            genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
    }
}

function renderGlobalBeats(beats) {
    const grid = document.getElementById('global-beats-grid');
    const emptyState = document.getElementById('global-empty-state');
    
    if (beats.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    grid.innerHTML = beats.map(beat => {
        const config = beat.producerConfig || {};
        const producerName = config.aka || config.name || 'Productor';
        
        const akaLower = producerName.toLowerCase();
        let pColor = '#00ccff';
        if (akaLower.includes('monarco')) pColor = '#ff4d4d';
        else if (akaLower.includes('sossa')) pColor = '#b28eff';

        const artwork = beat.artwork || (window.getDefaultBeatArtwork ? window.getDefaultBeatArtwork() : '');
        const price = beat.price_basic ? `$${beat.price_basic.toFixed(2)}` : 'Negociable';
        
        return `
            <div class="store-beat-card" style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 16px; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column;">
                <div style="position: relative; aspect-ratio: 1; background: #1a1e27; cursor: pointer; display: flex; align-items: center; justify-content: center;" onclick="window.playGlobalBeat('${beat.id}')">
                    <img src='${artwork}' style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8; transition: opacity 0.2s;">
                    <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s;" class="play-overlay">
                        <button class="global-play-btn-${beat.id}" style="width: 50px; height: 50px; border-radius: 50%; background: ${pColor}; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; box-shadow: 0 4px 15px rgba(0,0,0,0.3);">
                            <i data-lucide="play" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>
                        </button>
                    </div>
                </div>
                <div style="padding: 20px; display: flex; flex-direction: column; flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <h3 style="font-size: 18px; font-weight: 800; color: #fff; margin: 0 0 4px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${beat.name || 'Beat'}</h3>
                        <span style="font-weight: 800; color: ${pColor}; font-size: 15px;">${price}</span>
                    </div>
                    <div style="color: #8a91a6; font-size: 13px; font-weight: 600; margin-bottom: 12px; display:flex; align-items:center; gap:6px;">
                        <i data-lucide="user" style="width:14px; height:14px; color:${pColor};"></i> 
                        <span style="color: #fff;">${producerName}</span>
                    </div>
                    <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
                        <span style="font-size: 11px; font-weight: 600; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: #8a91a6;">${beat.bpm || '--'} BPM</span>
                        <span style="font-size: 11px; font-weight: 600; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: #8a91a6;">${beat.key || '--'}</span>
                        <span style="font-size: 11px; font-weight: 600; padding: 4px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; color: #8a91a6;">${beat.genre || 'Variado'}</span>
                    </div>
                    <div style="margin-top: auto;">
                        <button class="btn btn-primary" onclick="window.openGlobalBeatCheckoutModal('${beat.id}')" style="width: 100%; height: 38px; font-weight: 700; border-radius: 10px; font-size: 13px; margin: 0; background: ${pColor}; color: #000; border: none;">Adquirir Licencia</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

function setupGlobalEvents() {
    const searchInput = document.getElementById('global-search-input');
    const genreSelect = document.getElementById('global-genre-select');
    const priceSelect = document.getElementById('global-price-select');
    const bpmSelect = document.getElementById('global-bpm-select');
    const sortSelect = document.getElementById('global-sort-select');
    const clearBtn = document.getElementById('global-btn-clear-filters');
    
    const applyFilters = () => {
        const query = searchInput.value.toLowerCase().trim();
        const genre = genreSelect.value;
        const priceLevel = priceSelect.value;
        const bpmLevel = bpmSelect.value;
        const sort = sortSelect.value;

        window.filteredGlobalBeats = window.globalBeats.filter(beat => {
            const prodAka = (beat.producerConfig?.aka || '').toLowerCase();
            const beatName = (beat.name || '').toLowerCase();
            const beatGenre = (beat.genre || '').toLowerCase();
            const matchesSearch = !query || beatName.includes(query) || prodAka.includes(query) || beatGenre.includes(query);

            const matchesGenre = !genre || beat.genre === genre;

            let matchesBpm = true;
            if (bpmLevel && beat.bpm) {
                const bpmVal = parseInt(beat.bpm);
                if (bpmLevel === '0-90' && bpmVal >= 90) matchesBpm = false;
                else if (bpmLevel === '90-130' && (bpmVal < 90 || bpmVal > 130)) matchesBpm = false;
                else if (bpmLevel === '130-999' && bpmVal <= 130) matchesBpm = false;
            } else if (bpmLevel && !beat.bpm) {
                matchesBpm = false;
            }

            let matchesPrice = true;
            if (priceLevel && beat.price_basic) {
                const p = beat.price_basic;
                if (priceLevel === '0-20' && p > 20) matchesPrice = false;
                else if (priceLevel === '20-50' && (p <= 20 || p > 50)) matchesPrice = false;
                else if (priceLevel === '50-100' && (p <= 50 || p > 100)) matchesPrice = false;
                else if (priceLevel === '100+' && p <= 100) matchesPrice = false;
            } else if (priceLevel && !beat.price_basic) {
                matchesPrice = false;
            }

            return matchesSearch && matchesGenre && matchesBpm && matchesPrice;
        });

        if (sort === 'price_asc') {
            window.filteredGlobalBeats.sort((a,b) => (a.price_basic || 9999) - (b.price_basic || 9999));
        } else if (sort === 'price_desc') {
            window.filteredGlobalBeats.sort((a,b) => (b.price_basic || 0) - (a.price_basic || 0));
        } else {
            window.filteredGlobalBeats.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }

        renderGlobalBeats(window.filteredGlobalBeats);
    };

    if(searchInput) searchInput.addEventListener('input', applyFilters);
    if(genreSelect) genreSelect.addEventListener('change', applyFilters);
    if(priceSelect) priceSelect.addEventListener('change', applyFilters);
    if(bpmSelect) bpmSelect.addEventListener('change', applyFilters);
    if(sortSelect) sortSelect.addEventListener('change', applyFilters);

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            genreSelect.value = '';
            priceSelect.value = '';
            bpmSelect.value = '';
            sortSelect.value = 'newest';
            applyFilters();
        });
    }
}

window.playGlobalBeat = function(beatId) {
    window.storeBeats = window.globalBeats;
    
    const beat = window.globalBeats.find(b => b.id === beatId);
    if(beat) {
        const akaLower = (beat.producerConfig?.aka || '').toLowerCase();
        let pColor = '#00ccff';
        if (akaLower.includes('monarco')) pColor = '#ff4d4d';
        else if (akaLower.includes('sossa')) pColor = '#b28eff';
        document.documentElement.style.setProperty('--accent', pColor);
    }

    if(window.playStoreBeat) {
        window.playStoreBeat(beatId);
    }

    const player = document.getElementById('store-audio-player');
    if(player) player.style.display = 'block';
};

window.openGlobalBeatCheckoutModal = function(beatId) {
    const beat = window.globalBeats.find(b => b.id === beatId);
    if (!beat) return;

    window.storeBeats = window.globalBeats;
    window.storeProducerUid = beat.producerUid;
    window.storeProducerConfig = beat.producerConfig;

    const akaLower = (beat.producerConfig?.aka || '').toLowerCase();
    if (akaLower.includes('monarco')) {
        document.documentElement.style.setProperty('--accent', '#ff4d4d');
        document.documentElement.style.setProperty('--accent-rgb', '255, 77, 77');
    } else if (akaLower.includes('sossa')) {
        document.documentElement.style.setProperty('--accent', '#b28eff');
        document.documentElement.style.setProperty('--accent-rgb', '178, 142, 255');
    } else {
        document.documentElement.style.setProperty('--accent', '#00ccff');
        document.documentElement.style.setProperty('--accent-rgb', '0, 204, 255');
    }

    if(window.openBeatCheckoutModal) {
        window.openBeatCheckoutModal(beatId);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.setupStoreCheckout) {
        window.setupStoreCheckout();
    }
    
    const navBtn = document.getElementById('landing-btn-nav-catalog');
    const heroBtn = document.getElementById('landing-btn-catalog');
    const prodBtn = document.getElementById('btn-global-catalog');
    const catalogLogo = document.getElementById('catalog-logo-home');
    const loginBtn = document.getElementById('catalog-btn-login');

    if(navBtn) navBtn.addEventListener('click', () => window.initGlobalCatalog());
    if(heroBtn) heroBtn.addEventListener('click', () => window.initGlobalCatalog());
    if(prodBtn) prodBtn.addEventListener('click', () => window.initGlobalCatalog());
    
    if(catalogLogo) catalogLogo.addEventListener('click', () => {
        document.getElementById('global-catalog-view').style.display = 'none';
        
        const player = document.getElementById('store-audio-player');
        if (player) player.style.display = 'none';
        
        if (window.currentUser) {
            document.getElementById('app-container').style.display = 'flex';
        } else {
            document.getElementById('landing-page').style.display = 'block';
        }
    });

    if(loginBtn) loginBtn.addEventListener('click', () => {
        document.getElementById('login-modal').style.display = 'flex';
    });
});

function checkGlobalCatalogUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('catalogo') || window.location.hash === '#catalogo') {
        window.initGlobalCatalog();
        return true;
    }
    return false;
}
setTimeout(checkGlobalCatalogUrl, 500);


