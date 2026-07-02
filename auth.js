import { 
    auth, 
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    unlink
} from "./firebase.js";
import { UI_TRANSLATIONS } from "./i18n.js";

// Initialize global variables on window if not present
window.currentUser = window.currentUser || null;
window.currentUserIsAdmin = window.currentUserIsAdmin || false;
window.isManualLoginAttempt = window.isManualLoginAttempt || false;

export function setupAuthModalEvents() {
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
        window.isManualLoginAttempt = true;
        sessionStorage.setItem('beatss_manual_login', 'true');
        const email = document.getElementById('auth-login-email').value.trim();
        const password = document.getElementById('auth-login-password').value;
        errorMsg.style.display = 'none';

        try {
            if (typeof window.showToast === 'function') window.showToast('Iniciando sesión...');
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            console.error(err);
            errorMsg.innerText = 'Error al iniciar sesión: ' + parseAuthError(err.code);
            errorMsg.style.display = 'block';
            if (typeof window.showToast === 'function') window.showToast('Fallo al iniciar sesión', true);
        }
    });

    // Formulario de registro
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        window.isManualLoginAttempt = true;
        sessionStorage.setItem('beatss_manual_login', 'true');
        const email = document.getElementById('auth-register-email').value.trim();
        const password = document.getElementById('auth-register-password').value;
        errorMsg.style.display = 'none';

        try {
            if (typeof window.showToast === 'function') window.showToast('Registrando cuenta...');
            await createUserWithEmailAndPassword(auth, email, password);
            if (typeof window.showToast === 'function') window.showToast('Registro exitoso');
        } catch (err) {
            console.error(err);
            errorMsg.innerText = 'Error al registrar: ' + parseAuthError(err.code);
            errorMsg.style.display = 'block';
            if (typeof window.showToast === 'function') window.showToast('Fallo al registrar cuenta', true);
        }
    });

    // Login con Google
    googleBtn.addEventListener('click', async () => {
        errorMsg.style.display = 'none';
        window.isManualLoginAttempt = true;
        sessionStorage.setItem('beatss_manual_login', 'true');
        try {
            if (typeof window.showToast === 'function') window.showToast('Iniciando sesión con Google...');
            const result = await signInWithPopup(auth, googleProvider);
            if (result && result.user) {
                console.log("Sesión de Google iniciada mediante popup para:", result.user.email);
                if (typeof window.showToast === 'function') window.showToast("Sesión iniciada con Google");
            }
        } catch (err) {
            console.error('Popup falló o fue bloqueado, intentando redirección...', err);
            try {
                if (typeof window.showToast === 'function') window.showToast('Redirigiendo a Google...');
                await signInWithRedirect(auth, googleProvider);
            } catch (redirectErr) {
                console.error('Redirección también falló:', redirectErr);
                sessionStorage.removeItem('beatss_manual_login');
                window.isManualLoginAttempt = false;
                errorMsg.innerText = 'Error de Google: ' + redirectErr.message;
                errorMsg.style.display = 'block';
                if (typeof window.showToast === 'function') window.showToast('Fallo al iniciar sesión con Google', true);
            }
        }
    });

    // Función helper para abrir el modal de autenticación con estilos forzados e inmunes a conflictos de CSS
    window.openAuthModal = function(tabType) {
        const modal = document.getElementById('login-modal');
        if (!modal) {
            console.error("❌ No se encontró el modal #login-modal");
            return;
        }
        console.log("🔓 Abriendo login-modal con estilo forzado para pestaña:", tabType);
        
        // Forzar estilos inline en el backdrop
        modal.style.cssText = "display: flex !important; position: fixed !important; top: 0 !important; left: 0 !important; width: 100vw !important; height: 100vh !important; background-color: rgba(11, 14, 20, 0.85) !important; backdrop-filter: blur(8px) !important; -webkit-backdrop-filter: blur(8px) !important; z-index: 999999 !important; align-items: center !important; justify-content: center !important; opacity: 1 !important; visibility: visible !important;";
        
        // Forzar estilos inline en la caja interna del modal
        const innerModal = modal.querySelector('.modal');
        if (innerModal) {
            innerModal.style.cssText = "display: flex !important; flex-direction: column !important; position: relative !important; width: 400px !important; max-width: 90% !important; padding: 40px !important; border-radius: 16px !important; background-color: #121620 !important; border: 1px solid rgba(255,255,255,0.1) !important; box-shadow: 0 20px 40px rgba(0,0,0,0.6) !important; opacity: 1 !important; visibility: visible !important; color: #fff !important; align-items: center !important;";
        }
        
        // Cambiar a la pestaña correspondiente
        if (tabType === 'login') {
            if (tabLoginBtn) tabLoginBtn.click();
        } else {
            if (tabRegisterBtn) tabRegisterBtn.click();
        }
    };

    // Abrir modal de login desde la Landing Page
    const landingBtnLogin = document.getElementById('landing-btn-login');
    console.log("🔍 Registrando click en landing-btn-login:", landingBtnLogin);
    landingBtnLogin?.addEventListener('click', () => {
        console.log("🎯 Clic detectado en landing-btn-login!");
        window.openAuthModal('login');
    });

    // Abrir modal de login desde el Catálogo / Pasarela de Pagos
    const catalogBtnLogin = document.getElementById('catalog-btn-login');
    console.log("🔍 Registrando click en catalog-btn-login:", catalogBtnLogin);
    catalogBtnLogin?.addEventListener('click', () => {
        console.log("🎯 Clic detectado en catalog-btn-login!");
        if (window.currentUser) {
            if (typeof window.showAppView === 'function') {
                window.showAppView('home');
            }
        } else {
            window.openAuthModal('login');
        }
    });

    // Redirigir al catálogo/marketplace desde la Landing Page
    document.getElementById('landing-btn-nav-catalog')?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof window.showAppView === 'function') {
            window.showAppView('catalog');
        }
    });

    document.getElementById('landing-btn-start')?.addEventListener('click', () => {
        window.openAuthModal('register');
    });

    document.querySelectorAll('.landing-btn-action-start').forEach(btn => {
        btn.addEventListener('click', () => {
            window.openAuthModal('register');
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

export function parseAuthError(code) {
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

export function initAuthAndApp() {
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

    // Limpieza incondicional y silenciosa de Service Workers y cachés locales obsoletas para evitar problemas de sincronización de Vite
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister().then(() => {
                    console.log('🗑️ Service Worker desinstalado silenciosamente.');
                });
            }
        }).catch(err => console.error('Error desregistrando SW:', err));
    }

    if (window.caches) {
        caches.keys().then((keys) => {
            keys.forEach(key => {
                caches.delete(key).then(() => {
                    console.log('🗑️ Caché del Service Worker purgada:', key);
                });
            });
        }).catch(err => console.error('Error limpiando cachés:', err));
    }

    // Capturar código de referido si viene en la URL
    const urlParams = new URLSearchParams(window.location.search);
    
    // Configurar modo tienda o catálogo de inmediato para evitar conflictos con la sesión
    const isStore = urlParams.get('p') || urlParams.get('producer');
    const isCatalog = urlParams.has('catalogo') || window.location.hash === '#catalogo';
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
        console.log("🔗 Guardado código de referido:", refCode);
    }

    // Configurar manejadores del modal de Login/Registro
    setupAuthModalEvents();

    // Manejar el resultado de redirección si viene de un flujo de redirect
    getRedirectResult(auth)
        .then((result) => {
            if (result && result.user) {
                window.isManualLoginAttempt = true;
                console.log("Sesión de Google iniciada mediante redirección para:", result.user.email);
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
                errorMsg.innerText = 'Error de Google (Redirección): ' + err.message;
                errorMsg.style.display = 'block';
            }
            if (typeof window.showToast === 'function') window.showToast('Fallo al iniciar sesión con Google', true);
        });

    // Escuchar el estado de autenticación de Firebase
    onAuthStateChanged(auth, async (user) => {
        if (window.isLoggingOut) {
            console.log("onAuthStateChanged: Omitiendo actualización del DOM por cierre de sesión activo.");
            return;
        }

        if (user) {
            window.currentUser = user.uid;
            window.currentUserEmail = user.email;
            window.currentUserIsAdmin = (user.email && (user.email.toLowerCase() === 'masterjuego25@gmail.com' || user.email.toLowerCase() === 'sossabeatz1@gmail.com'));
        } else {
            window.currentUser = null;
            window.currentUserEmail = null;
            window.currentUserIsAdmin = false;
        }

        // Actualizar botón de login del catálogo según el estado de sesión
        const catalogLoginBtn = document.getElementById('catalog-btn-login');
        if (catalogLoginBtn) {
            catalogLoginBtn.setAttribute('data-i18n', user ? 'catalog_go_to_panel' : 'catalog_i_am_producer');
            const trans = (typeof UI_TRANSLATIONS !== 'undefined' && UI_TRANSLATIONS[window.currentLang]) ? UI_TRANSLATIONS[window.currentLang] : null;
            if (trans) {
                const key = user ? 'catalog_go_to_panel' : 'catalog_i_am_producer';
                catalogLoginBtn.textContent = trans[key] || (user ? 'Ir al Panel' : 'Soy Productor');
            }
        }

        // Si estamos en la tienda pública o catálogo, y NO es un intento manual de login del admin, omitimos el flujo normal
        if ((window.isPublicStoreMode || window.isGlobalCatalogMode) && !window.isManualLoginAttempt) {
            console.log("🛒 Tienda pública o catálogo activo. Omitiendo flujo normal de control de sesión.");
            return;
        }
        if (user) {
            console.log("Sesión activa de Firebase:", user.email, user.uid);
            document.getElementById('login-modal').style.display = 'none';
            const landing = document.getElementById('landing-page');
            if (landing) landing.style.display = 'none';
            
            window.currentUserIsAdmin = (user.email && (user.email.toLowerCase() === 'masterjuego25@gmail.com' || user.email.toLowerCase() === 'sossabeatz1@gmail.com'));
            
            if (user.email && user.email.toLowerCase() === 'masterjuego25@gmail.com' && user.providerData) {
                const googleProv = user.providerData.find(p => p.providerId === 'google.com');
                if (googleProv && googleProv.email && googleProv.email.toLowerCase() === 'sossabeatz1@gmail.com') {
                    console.log("Detectado proveedor de Google antiguo. Desvinculando...");
                    unlink(user, 'google.com')
                        .then(() => console.log("🔒 Cuenta de Google antigua (sossabeatz1) desvinculada con éxito. Listo para vincular la nueva en la próxima sesión con Google."))
                        .catch(err => console.error("Error al desvincular Google antiguo:", err));
                }
            }
            
            if (typeof window.initApp === 'function') {
                await window.initApp(user.uid);
            }
            
            if (window.isManualLoginAttempt) {
                window.isManualLoginAttempt = false;
                if (typeof window.showAppView === 'function') {
                    window.showAppView('home');
                }
            }
        } else {
            console.log("Sin sesión de Firebase. Mostrando landing page.");
            window.currentUser = null;
            window.currentUserIsAdmin = false;
            document.getElementById('app-container').style.display = 'none';
            
            const landing = document.getElementById('landing-page');
            if (landing) {
                landing.style.display = 'block';
                document.getElementById('login-modal').style.display = 'none';
                if (typeof window.safeCreateIcons === 'function') {
                    setTimeout(window.safeCreateIcons, 100);
                }
            } else {
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('login');
                } else {
                    document.getElementById('login-modal').style.display = 'flex';
                }
            }
        }
    });
}

// Bind functions to window for index.html inline access and global interoperability
window.setupAuthModalEvents = setupAuthModalEvents;
window.parseAuthError = parseAuthError;
window.initAuthAndApp = initAuthAndApp;
