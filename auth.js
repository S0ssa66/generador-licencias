import { 
    auth, 
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    signOut,
    unlink
} from "./firebase-core.js";
import { workspaceTabForPath } from './workspace-routes.js';
import './auth-access.css';

// Initialize global variables on window if not present
window.currentUser = window.currentUser || null;
window.currentUserIsAdmin = window.currentUserIsAdmin || false;
window.isManualLoginAttempt = window.isManualLoginAttempt || false;
let authAndAppInitialized = false;
let authModalEventsBound = false;
let authModalSetupPending = false;
let authModalPreviousFocus = null;
let sessionExpirationInProgress = false;
let sessionSecurityModule = null;
let sessionSecurityModulePromise = null;
let sessionSecurityGeneration = 0;
let registrationVerificationPending = false;

const SESSION_NOTICE_KEY = 'beatss_auth_session_notice';

async function recordRegistrationConsent(user, acceptedAt) {
    const module = await import('./auth-account-setup.js');
    return module.recordRegistrationConsent(user, acceptedAt);
}

async function accountRequiresVerifiedEmail(user) {
    const module = await import('./auth-account-setup.js');
    return module.accountRequiresVerifiedEmail(user);
}

function loadSessionSecurity() {
    if (!sessionSecurityModulePromise) {
        sessionSecurityModulePromise = import('./session-security.js').then((module) => {
            sessionSecurityModule = module;
            return module;
        });
    }
    return sessionSecurityModulePromise;
}

async function startAuthenticatedSessionSecurity(options) {
    const generation = ++sessionSecurityGeneration;
    const module = await loadSessionSecurity();
    if (generation !== sessionSecurityGeneration || !auth.currentUser) return;
    module.startSessionSecurity(options);
}

function stopAuthenticatedSessionSecurity(options = {}) {
    sessionSecurityGeneration += 1;
    sessionSecurityModule?.stopSessionSecurity(options);
}

function clearAuthenticatedSessionSecurityState(options = {}) {
    sessionSecurityGeneration += 1;
    sessionSecurityModule?.clearSessionSecurityState(options);
}

window.clearBeatssSessionSecurityState = clearAuthenticatedSessionSecurityState;

const AUTH_TAB_COPY = {
    login: {
        title: 'Vuelve a tu ritmo',
        description: 'Tu catálogo, acuerdos y entregas te esperan.'
    },
    register: {
        title: 'Empieza tu espacio',
        description: 'Una cuenta para organizar y mover toda tu música.'
    }
};

function setAuthMessage(element, message = '') {
    if (!element) return;
    element.textContent = message;
    element.hidden = !message;
}

function clearManualLoginIntent() {
    sessionStorage.removeItem('beatss_manual_login');
    window.isManualLoginAttempt = false;
}

function consumeSessionNotice(element) {
    if (!element) return;
    try {
        const message = sessionStorage.getItem(SESSION_NOTICE_KEY);
        if (!message) return;
        sessionStorage.removeItem(SESSION_NOTICE_KEY);
        setAuthMessage(element, message);
    } catch (_) {
        // El aviso es informativo; Auth debe seguir funcionando sin storage.
    }
}

async function expireAuthenticatedSession(reason) {
    if (sessionExpirationInProgress) return;
    sessionExpirationInProgress = true;
    window.isLoggingOut = true;

    const message = reason === 'idle'
        ? 'Tu sesión se cerró por seguridad después de 30 minutos sin actividad.'
        : 'Tu sesión alcanzó el límite de seguridad. Inicia sesión nuevamente para continuar.';

    try {
        sessionStorage.setItem(SESSION_NOTICE_KEY, message);
    } catch (_) {
        // El redirect sigue siendo seguro aunque no pueda conservar el aviso.
    }

    clearAuthenticatedSessionSecurityState();
    try {
        localStorage.removeItem('beatss_has_session');
        localStorage.removeItem('active_user');
    } catch (_) {
        // Firebase signOut sigue limpiando la identidad local.
    }

    try {
        await Promise.race([
            signOut(auth),
            new Promise((resolve) => setTimeout(resolve, 1800))
        ]);
    } catch (error) {
        console.error('No se pudo completar el cierre automático de Firebase:', error);
    } finally {
        window.location.replace(`${window.location.origin}/inicio?session=expired`);
    }
}

function setButtonBusy(button, busy, busyLabel) {
    if (!button) return;
    const label = button.querySelector('span') || button;
    const defaultLabel = button.dataset.defaultLabel || label.textContent.trim();
    button.dataset.defaultLabel = defaultLabel;
    button.disabled = busy;
    button.toggleAttribute('aria-busy', busy);
    label.textContent = busy ? busyLabel : defaultLabel;
}

function setAuthModalVisibility(modal, visible) {
    if (!modal) return;
    modal.setAttribute('aria-hidden', String(!visible));
    modal.inert = !visible;
    modal.style.display = visible ? 'grid' : 'none';
    document.body.classList.toggle('beatss-auth-open', visible);
    if (!visible && authModalPreviousFocus?.isConnected) {
        authModalPreviousFocus.focus({ preventScroll: true });
        authModalPreviousFocus = null;
    }
}

function selectAuthTab(tabType, elements) {
    const registerActive = tabType === 'register';
    const {
        tabLoginBtn,
        tabRegisterBtn,
        loginForm,
        registerForm,
        errorMsg,
        successMsg,
        panelTitle,
        panelDescription
    } = elements;

    tabLoginBtn.classList.toggle('active', !registerActive);
    tabRegisterBtn.classList.toggle('active', registerActive);
    tabLoginBtn.setAttribute('aria-selected', String(!registerActive));
    tabRegisterBtn.setAttribute('aria-selected', String(registerActive));
    tabLoginBtn.tabIndex = registerActive ? -1 : 0;
    tabRegisterBtn.tabIndex = registerActive ? 0 : -1;
    loginForm.hidden = registerActive;
    registerForm.hidden = !registerActive;
    setAuthMessage(errorMsg);
    setAuthMessage(successMsg);

    const copy = AUTH_TAB_COPY[registerActive ? 'register' : 'login'];
    if (panelTitle) panelTitle.textContent = copy.title;
    if (panelDescription) panelDescription.textContent = copy.description;
}

function deferAuthModalSetup() {
    if (authModalSetupPending || document.readyState !== 'loading') return;
    authModalSetupPending = true;
    document.addEventListener('DOMContentLoaded', () => {
        authModalSetupPending = false;
        setupAuthModalEvents();
    }, { once: true });
}

export function setupAuthModalEvents() {
    const tabLoginBtn = document.getElementById('tab-login-btn');
    const tabRegisterBtn = document.getElementById('tab-register-btn');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');
    const googleBtn = document.getElementById('btn-google-auth');
    const errorMsg = document.getElementById('auth-error-msg');
    const successMsg = document.getElementById('auth-success-msg');
    const sessionNotice = document.getElementById('auth-session-notice');
    const panelTitle = document.getElementById('auth-panel-title');
    const panelDescription = document.getElementById('auth-panel-description');
    const resetPasswordBtn = document.getElementById('btn-reset-password');

    if (authModalEventsBound) return true;
    if (!tabLoginBtn || !tabRegisterBtn || !loginForm || !registerForm || !googleBtn || !errorMsg || !successMsg) {
        deferAuthModalSetup();
        return false;
    }
    authModalEventsBound = true;
    consumeSessionNotice(sessionNotice);

    const tabElements = { tabLoginBtn, tabRegisterBtn, loginForm, registerForm, errorMsg, successMsg, panelTitle, panelDescription };
    tabLoginBtn.addEventListener('click', () => selectAuthTab('login', tabElements));
    tabRegisterBtn.addEventListener('click', () => selectAuthTab('register', tabElements));

    document.querySelectorAll('#login-modal [data-password-target]').forEach((button) => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.passwordTarget);
            if (!input) return;
            const visible = input.type === 'text';
            input.type = visible ? 'password' : 'text';
            button.textContent = visible ? 'Ver' : 'Ocultar';
            button.setAttribute('aria-label', visible ? 'Mostrar contraseña' : 'Ocultar contraseña');
            button.setAttribute('aria-pressed', String(!visible));
            input.focus({ preventScroll: true });
        });
    });

    document.querySelectorAll('#login-modal [data-auth-legal]').forEach((button) => {
        button.addEventListener('click', () => {
            if (typeof window.openSupportModal === 'function') {
                window.openSupportModal('terms');
            } else {
                setAuthMessage(successMsg, 'BEATSS usa tus datos para administrar tu cuenta, catálogo, licencias y entregas. No vendemos tus datos. Puedes solicitar acceso o eliminación desde soporte.');
            }
        });
    });

    // Formulario de login
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.isManualLoginAttempt = true;
        sessionStorage.setItem('beatss_manual_login', 'true');
        const email = document.getElementById('auth-login-email').value.trim();
        const password = document.getElementById('auth-login-password').value;
        const submitButton = loginForm.querySelector('button[type="submit"]');
        setAuthMessage(errorMsg);
        setAuthMessage(successMsg);
        setButtonBusy(submitButton, true, 'Entrando…');

        try {
            if (typeof window.showToast === 'function') window.showToast('Iniciando sesión...');
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error(err);
            clearManualLoginIntent();
            setAuthMessage(errorMsg, parseAuthError(err.code));
            if (typeof window.showToast === 'function') window.showToast('Fallo al iniciar sesión', true);
        } finally {
            setButtonBusy(submitButton, false);
        }
    });

    // Formulario de registro
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.isManualLoginAttempt = true;
        sessionStorage.setItem('beatss_manual_login', 'true');
        const email = document.getElementById('auth-register-email').value.trim();
        const password = document.getElementById('auth-register-password').value;
        const accepted = document.getElementById('auth-register-consent')?.checked === true;
        const submitButton = registerForm.querySelector('button[type="submit"]');
        setAuthMessage(errorMsg);
        setAuthMessage(successMsg);
        setButtonBusy(submitButton, true, 'Creando cuenta…');

        try {
            if (!accepted) throw Object.assign(new Error('Debes aceptar los términos y la política de privacidad.'), { code: 'auth/terms-required' });
            if (!/^(?=.*[A-Za-z])(?=.*\d).{10,}$/.test(password)) {
                throw Object.assign(new Error('La contraseña no cumple los requisitos.'), { code: 'auth/weak-password' });
            }
            registrationVerificationPending = true;
            if (typeof window.showToast === 'function') window.showToast('Registrando cuenta...');
            const credential = await createUserWithEmailAndPassword(auth, email, password);
            const acceptedAt = new Date().toISOString();
            await recordRegistrationConsent(credential.user, acceptedAt);
            await sendEmailVerification(credential.user);
            await signOut(auth);
            clearManualLoginIntent();
            window.openAuthModal?.('login');
            document.getElementById('auth-login-email').value = email;
            setAuthMessage(successMsg, 'Cuenta creada. Revisa tu correo y confirma el enlace antes de iniciar sesión.');
            if (typeof window.showToast === 'function') window.showToast('Te enviamos el correo de verificación');
        } catch (err) {
            console.error(err);
            clearManualLoginIntent();
            setAuthMessage(errorMsg, err?.code === 'auth/terms-required' ? err.message : parseAuthError(err.code));
            if (typeof window.showToast === 'function') window.showToast('Fallo al registrar cuenta', true);
        } finally {
            registrationVerificationPending = false;
            setButtonBusy(submitButton, false);
        }
    });

    resetPasswordBtn?.addEventListener('click', async () => {
        const emailInput = document.getElementById('auth-login-email');
        const email = emailInput?.value.trim();
        setAuthMessage(errorMsg);
        setAuthMessage(successMsg);
        if (!email || !emailInput.checkValidity()) {
            setAuthMessage(errorMsg, 'Escribe un correo válido para enviarte el enlace de recuperación.');
            emailInput?.focus();
            return;
        }
        setButtonBusy(resetPasswordBtn, true, 'Enviando…');
        try {
            await sendPasswordResetEmail(auth, email);
            setAuthMessage(successMsg, 'Te enviamos un enlace para cambiar tu contraseña. Revisa también la carpeta de spam.');
        } catch (err) {
            console.error(err);
            setAuthMessage(errorMsg, parseAuthError(err.code));
        } finally {
            setButtonBusy(resetPasswordBtn, false);
        }
    });

    // Login con Google
    let isGoogleAuthPending = false;
    googleBtn.addEventListener('click', async () => {
        if (isGoogleAuthPending) return;
        setAuthMessage(errorMsg);
        setAuthMessage(successMsg);
        isGoogleAuthPending = true;

        // Feedback visual inmediato SIN deshabilitar el botón de forma síncrona,
        // ya que deshabilitar el elemento activo en WebKit (iOS Safari, Chrome iOS)
        // anula la activación del usuario (transient user activation) y hace que
        // el navegador bloquee la ventana emergente arrojando auth/popup-blocked.
        googleBtn.setAttribute('aria-busy', 'true');
        const label = googleBtn.querySelector('span') || googleBtn;
        const defaultLabel = googleBtn.dataset.defaultLabel || label.textContent.trim();
        googleBtn.dataset.defaultLabel = defaultLabel;
        label.textContent = 'Conectando con Google…';

        window.isManualLoginAttempt = true;
        try {
            sessionStorage.setItem('beatss_manual_login', 'true');
        } catch (_) {}

        try {
            if (typeof window.showToast === 'function') window.showToast('Iniciando sesión con Google...');
            const result = await signInWithPopup(auth, googleProvider);
            if (result && result.user) {
                if (typeof window.showToast === 'function') window.showToast("Sesión iniciada con Google");
            }
        } catch (err) {
            console.error('Error durante autenticación con Google:', err);
            clearManualLoginIntent();

            // Si el popup fue bloqueado por el navegador o cliente webview, informamos claramente
            // al usuario en lugar de forzar un signInWithRedirect hacia firebaseapp.com, el cual
            // falla con "missing initial state" en navegadores móviles con partición de almacenamiento.
            const friendlyMessage = parseAuthError(err?.code);
            setAuthMessage(errorMsg, friendlyMessage);
            if (typeof window.showToast === 'function') {
                window.showToast(err?.code === 'auth/popup-blocked'
                    ? 'Ventana emergente bloqueada por el navegador'
                    : 'Fallo al iniciar sesión con Google', true);
            }
        } finally {
            isGoogleAuthPending = false;
            googleBtn.removeAttribute('aria-busy');
            if (googleBtn.dataset.defaultLabel) {
                label.textContent = googleBtn.dataset.defaultLabel;
            }
        }
    });

    // Abrir modal de login desde el Catálogo / Pasarela de Pagos
    const catalogBtnLogin = document.getElementById('catalog-btn-login');
    catalogBtnLogin?.addEventListener('click', () => {
        if (window.currentUser) {
            if (typeof window.showAppView === 'function') {
                window.showAppView('home');
            }
        } else {
            window.openAuthModal('login');
        }
    });

    // Cerrar modal de login
    document.getElementById('btn-close-login-modal')?.addEventListener('click', () => {
        const modal = document.getElementById('login-modal');
        if (modal) {
            setAuthModalVisibility(modal, false);
        }
    });

    // Cerrar al hacer click en el backdrop
    document.getElementById('login-modal')?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('login-modal')) {
            setAuthModalVisibility(document.getElementById('login-modal'), false);
        }
    });

    document.getElementById('login-modal')?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            setAuthModalVisibility(document.getElementById('login-modal'), false);
        }
    });

    return true;
}

// Esta función puede ser solicitada por la landing antes de que el HTML del
// modal termine de parsearse. En ese caso setupAuthModalEvents difiere el
// enlace y un clic posterior vuelve a enlazarlo antes de abrir el diálogo.
export function openAuthModal(tabType = 'login') {
    if (!setupAuthModalEvents()) return;
    const modal = document.getElementById('login-modal');
    if (!modal) return;
    // Mover el modal directamente al body para escapar de contenedores
    // heredados que puedan crear un stacking context o interceptar punteros.
    if (modal.parentElement !== document.body) {
        document.body.appendChild(modal);
    }
    authModalPreviousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setAuthModalVisibility(modal, true);
    document.getElementById(tabType === 'register' ? 'tab-register-btn' : 'tab-login-btn')?.click();
    requestAnimationFrame(() => {
        const fieldId = tabType === 'register' ? 'auth-register-email' : 'auth-login-email';
        document.getElementById(fieldId)?.focus({ preventScroll: true });
    });
}

export function parseAuthError(code) {
    switch (code) {
        case 'auth/invalid-email': return 'El correo electrónico no es válido.';
        case 'auth/user-disabled': return 'Esta cuenta ha sido inhabilitada.';
        case 'auth/user-not-found': return 'No existe ninguna cuenta con este correo.';
        case 'auth/wrong-password': return 'Contraseña incorrecta.';
        case 'auth/email-already-in-use': return 'Este correo ya está registrado por otro usuario.';
        case 'auth/weak-password': return 'La contraseña debe tener al menos 10 caracteres, con letras y números.';
        case 'auth/invalid-credential': return 'Credenciales de acceso no válidas.';
        case 'auth/missing-password': return 'Escribe tu contraseña para continuar.';
        case 'auth/too-many-requests': return 'Hubo demasiados intentos. Espera unos minutos y vuelve a probar.';
        case 'auth/network-request-failed': return 'No pudimos conectar con el servicio. Revisa tu Internet e inténtalo de nuevo.';
        case 'auth/popup-closed-by-user': return 'La ventana de Google se cerró. Vuelve a intentarlo cuando estés listo.';
        case 'auth/cancelled-popup-request': return 'Ya hay una ventana de Google abierta. Revisa esa ventana o inténtalo de nuevo.';
        case 'auth/popup-blocked': return 'Tu navegador bloqueó la ventana de Google. Habilita las ventanas emergentes o abre beatss.app directamente en Safari o Chrome.';
        case 'auth/unauthorized-domain': return `Este dominio no está autorizado en Firebase. Agrega ${window.location.hostname} en Authentication → Settings → Authorized domains.`;
        default: return 'Ocurrió un error inesperado. Revisa tu conexión.';
    }
}

export function initAuthAndApp() {
    // El modal público puede iniciar Auth antes del Studio. Mantener este
    // proceso idempotente evita listeners duplicados al cargar `main.js` tras
    // un inicio de sesión exitoso.
    setupAuthModalEvents();
    if (authAndAppInitialized) return;
    authAndAppInitialized = true;
    // Inicializar idioma del local storage o español por defecto
    window.currentLang = localStorage.getItem('beatss_language') || 'es';
    if (typeof window.updateUILanguage === 'function') {
        window.updateUILanguage();
    }

    // Detectar si venimos de un intento de inicio de sesión manual
    if (sessionStorage.getItem('beatss_manual_login') === 'true') {
        window.isManualLoginAttempt = true;
        sessionStorage.removeItem('beatss_manual_login');
    }

    // La limpieza de un service worker heredado se hace una sola vez desde
    // index.html y únicamente en localhost. Hacerla aquí en cada inicio
    // competía con el montaje de la sesión y podía dejar la interfaz vacía.

    // Capturar código de referido si viene en la URL
    const urlParams = new URLSearchParams(window.location.search);
    
    // Configurar modo tienda o catálogo de inmediato para evitar conflictos con la sesión
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const isStore = urlParams.get('p') || urlParams.get('producer') || currentPath.startsWith('/tienda/');
    const isPrivateWorkspaceRoute = Boolean(workspaceTabForPath(currentPath));
    // Las rutas limpias se resuelven después de importar el Studio. Si Auth
    // no las reconoce desde el primer callback, su estado sin sesión vuelve a
    // pintar Inicio encima del catálogo o de la tienda solicitada.
    const isCatalog = currentPath === '/catalogo' || urlParams.has('catalogo') || window.location.hash === '#catalogo';
    if (isStore) {
        window.stateManager.setState('isPublicStoreMode', true);
        window.stateManager.setState('isGlobalCatalogMode', false);
    } else if (isCatalog) {
        window.stateManager.setState('isPublicStoreMode', false);
        window.stateManager.setState('isGlobalCatalogMode', true);
    }

    const refCode = urlParams.get('ref');
    if (refCode) {
        localStorage.setItem('beatss_referred_by', refCode);
    }

    // Configurar manejadores del modal de Login/Registro
    setupAuthModalEvents();

    // Manejar el resultado de redirección si viene de un flujo de redirect
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                window.isManualLoginAttempt = true;
                if (typeof window.showToast === 'function') window.showToast("Sesión iniciada con Google");
            }
        })
        .catch((err) => {
            console.error("Error al procesar redirección de Google:", err);
            sessionStorage.removeItem('beatss_manual_login');
            window.isManualLoginAttempt = false;
            
            const modal = document.getElementById('login-modal');
            if (typeof window.openAuthModal === 'function') {
                window.openAuthModal('login');
            } else if (modal) {
                modal.style.display = 'flex';
            }
            
            const errorMsg = document.getElementById('auth-error-msg');
            if (errorMsg) {
                setAuthMessage(errorMsg, parseAuthError(err?.code));
            }
            if (typeof window.showToast === 'function') window.showToast('Fallo al iniciar sesión con Google', true);
        });

    // Escuchar el estado de autenticación de Firebase
    onAuthStateChanged(auth, async (user) => {
        if (window.isLoggingOut) {
            return;
        }
        window.beatssAuthStateResolved = true;

        const authenticatedFromManualLogin = Boolean(window.isManualLoginAttempt);
        if (user && !registrationVerificationPending && await accountRequiresVerifiedEmail(user)) {
            try {
                sessionStorage.setItem(SESSION_NOTICE_KEY, 'Confirma el enlace enviado a tu correo antes de entrar al Studio.');
            } catch (_) { /* El modal seguirá mostrando el aviso tras cerrar sesión. */ }
            clearManualLoginIntent();
            await signOut(auth).catch(() => undefined);
            window.openAuthModal?.('login');
            consumeSessionNotice(document.getElementById('auth-session-notice'));
            return;
        }
        if (user && registrationVerificationPending) return;
        if (user) {
            try { localStorage.setItem('beatss_has_session', '1'); } catch (_) { /* storage optional */ }
            sessionStorage.removeItem('beatss_manual_login');
            window.currentUser = user.uid;
            window.currentUserEmail = user.email;
            window.currentUserIsAdmin = (user.email && (user.email.toLowerCase() === 'masterjuego25@gmail.com' || user.email.toLowerCase() === 'sossabeatz1@gmail.com'));
            await startAuthenticatedSessionSecurity({
                onExpire: expireAuthenticatedSession,
                resetStartedAt: authenticatedFromManualLogin
            });
        } else {
            stopAuthenticatedSessionSecurity({ clear: true });
            try { localStorage.removeItem('beatss_has_session'); } catch (_) { /* storage optional */ }
            window.currentUser = null;
            window.currentUserEmail = null;
            window.currentUserIsAdmin = false;
        }

        // Actualizar botón de login del catálogo según el estado de sesión
        const catalogLoginBtn = document.getElementById('catalog-btn-login');
        if (catalogLoginBtn) {
            catalogLoginBtn.setAttribute('data-i18n', user ? 'catalog_go_to_panel' : 'catalog_i_am_producer');
            const english = window.currentLang === 'en';
            catalogLoginBtn.textContent = user
                ? (english ? 'Go to Dashboard' : 'Ir al Panel')
                : (english ? 'I am a Producer' : 'Soy Productor');
        }

        // Si estamos en la tienda pública o catálogo, y NO es un intento manual de login del admin, omitimos el flujo normal
        const publicStoreActive = window.stateManager?.getState?.('isPublicStoreMode') ?? window.isPublicStoreMode;
        const globalCatalogActive = window.stateManager?.getState?.('isGlobalCatalogMode') ?? window.isGlobalCatalogMode;
        if ((publicStoreActive || globalCatalogActive) && !window.isManualLoginAttempt) {
            window.dismissBeatssBootScreen?.();
            return;
        }
        if (user) {
            setAuthModalVisibility(document.getElementById('login-modal'), false);
            const landing = document.getElementById('landing-page');
            if (landing) landing.style.display = 'none';
            document.body.classList.remove('landing-active');
            
            window.currentUserIsAdmin = (user.email && (user.email.toLowerCase() === 'masterjuego25@gmail.com' || user.email.toLowerCase() === 'sossabeatz1@gmail.com'));
            
            if (user.email && user.email.toLowerCase() === 'masterjuego25@gmail.com' && user.providerData) {
                const googleProv = user.providerData.find(p => p.providerId === 'google.com');
                if (googleProv && googleProv.email && googleProv.email.toLowerCase() === 'sossabeatz1@gmail.com') {
                    unlink(user, 'google.com')
                        .then(() => undefined)
                        .catch(err => console.error("Error al desvincular Google antiguo:", err));
                }
            }
            
            if (typeof window.initApp !== 'function') {
                // La landing carga Auth primero. Al confirmar una sesión se
                // trae el Studio completo y el mismo callback continúa con
                // la inicialización existente, sin una segunda autenticación.
                await window.ensureBeatssApp?.();
            }
            // La auditoría vive en el bundle del Studio, no en Auth. No
            // bloquea la pantalla ni precarga Firestore/Storage al abrir el
            // modal público.
            void window.ensureUserIdentityRecord?.(user);
            if (typeof window.initApp === 'function') await window.initApp(user.uid);

            // Una sesión restaurada también debe respetar una ruta directa
            // como /dashboard o /mis-beats, no sólo el inicio del Studio.
            if (typeof window.applyBeatssRoute === 'function') {
                window.applyBeatssRoute();
            }

            if (window.currentUserIsAdmin) {
                const currentPath = window.location.pathname.replace(/\/+$/, '');
                if (currentPath === '/contabilidad' || document.getElementById('tab-admin')?.classList.contains('active')) {
                    window.loadConsolidatedAccounting?.();
                }
            }
            
            if (window.isManualLoginAttempt) {
                window.isManualLoginAttempt = false;
                if (typeof window.showAppView === 'function') {
                    window.showAppView('home');
                }
            }
            if (window.beatssPendingPublicAction === 'catalog') {
                window.showAppView?.('catalog');
                window.beatssPendingPublicAction = null;
            } else if (window.beatssPendingPublicAction === 'login') {
                window.showAppView?.('home');
                window.beatssPendingPublicAction = null;
            }
            window.dismissBeatssBootScreen?.();
        } else {
            window.currentUser = null;
            window.currentUserIsAdmin = false;
            document.getElementById('app-container').style.display = 'none';
            
            const landing = document.getElementById('landing-page');
            if (landing) {
                landing.style.display = 'block';
                document.body.classList.add('landing-active');
                setAuthModalVisibility(document.getElementById('login-modal'), false);
                if (typeof window.safeCreateIcons === 'function') {
                    setTimeout(window.safeCreateIcons, 100);
                }

                // Una URL privada (por ejemplo /dashboard) debe mantener el
                // destino solicitado aunque Firebase responda "sin sesión"
                // después del primer render. Sin esta reapertura el usuario
                // ve la landing y parece que el enlace no funciona.
                const pendingPublicAction = window.beatssPendingPublicAction;
                if (pendingPublicAction === 'catalog') {
                    requestAnimationFrame(() => {
                        window.showAppView?.('catalog');
                        window.beatssPendingPublicAction = null;
                    });
                } else if ((pendingPublicAction === 'login' || window.beatssPendingWorkspaceTab || isPrivateWorkspaceRoute) && typeof window.openAuthModal === 'function') {
                    requestAnimationFrame(() => {
                        window.openAuthModal('login');
                        window.beatssPendingPublicAction = null;
                    });
                }
                requestAnimationFrame(() => window.dismissBeatssBootScreen?.());
            } else {
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('login');
                } else {
                    const modal = document.getElementById('login-modal');
                    setAuthModalVisibility(modal, true);
                    modal.style.display = 'flex';
                }
                window.dismissBeatssBootScreen?.();
            }
        }
    });
}

// Bind functions to window for index.html inline access and global interoperability
window.setupAuthModalEvents = setupAuthModalEvents;
window.openAuthModal = openAuthModal;
window.parseAuthError = parseAuthError;
window.initAuthAndApp = initAuthAndApp;
