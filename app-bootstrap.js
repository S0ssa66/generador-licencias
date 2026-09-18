import {
    workspacePathForTab,
    workspaceTabForPath,
    workspaceTitleForTab
} from './workspace-routes.js';

let appPromise = null;
let authPromise = null;

async function loadLucide() {
    const { createIcons, icons } = await import('lucide');
    // Conservamos la API global histórica para los módulos existentes, pero
    // el bundle ya viaja con la aplicación: no depende de un CDN que pueda
    // ser bloqueado por la red del teléfono.
    window.lucide = {
        createIcons(options = {}) {
            return createIcons({ icons, ...options });
        }
    };
}

function loadMaterialSymbols() {
    if (document.querySelector('link[data-beatss-material-symbols]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    link.dataset.beatssMaterialSymbols = 'true';
    document.head.appendChild(link);
}

function loadBeatssApp() {
    if (!appPromise) {
        // stateManager establece el estado global requerido por main.js. La
        // secuencia evita carreras cuando una persona toca una acción muy
        // pronto durante la carga pública.
        loadMaterialSymbols();
        window.lucideReady = loadLucide()
            .then(() => {
                // Los iconos mejoran la interfaz, pero nunca deben bloquearla.
                // Si llegan después del panel, completan los placeholders.
                window.lucide?.createIcons?.();
            })
            .catch((error) => {
                console.warn('[BEATSS] No se pudo cargar el paquete local de iconos:', error?.message || error);
            });
        const mainReady = import('./stateManager.js?v=performance-1')
            .then(() => import('./main.js?v=performance-1'));
        appPromise = mainReady;
    }
    return appPromise;
}

function loadBeatssAuth() {
    if (!authPromise) {
        authPromise = import('./auth.js').then(() => window.initAuthAndApp?.());
    }
    return authPromise;
}

window.ensureBeatssApp = loadBeatssApp;
window.ensureBeatssAuth = loadBeatssAuth;
window.ensureBeatssMaterialSymbols = loadMaterialSymbols;

const path = window.location.pathname.replace(/\/+$/, '') || '/';
const isPublicStoreRoute = path.startsWith('/tienda/');
const isBuyerDownloadRoute = path.startsWith('/descargas/');
const isPublicPurchaseRoute = path === '/compra/stripe' || path === '/compra/gracias' || path === '/compra/cancelada';
const privateRouteTab = workspaceTabForPath(path);
const canonicalPrivatePath = workspacePathForTab(privateRouteTab);

// Canonicalize old bookmarks before authentication. This does not load the
// Studio or access private data; it only gives every section its current URL.
if (canonicalPrivatePath) {
    document.title = workspaceTitleForTab(privateRouteTab);
    if (path.toLowerCase() !== canonicalPrivatePath) {
        window.history.replaceState(
            { view: 'home', tabId: privateRouteTab },
            '',
            `${canonicalPrivatePath}${window.location.search}${window.location.hash}`
        );
    }
}

const params = new URLSearchParams(window.location.search);
const isExpiredSessionReturn = params.get('session') === 'expired';
const legacyStripeSessionId = params.get('stripe_session_id');
const legacyDownloadId = params.get('download') || params.get('order');
const legacyDownloadToken = params.get('token');
const hasTransactionalParams = [
    'stripe_session_id',
    'stripe_cancelled',
    'id',
    'clientTransactionId',
    'download',
    'order',
    'producer',
    'p'
].some((key) => params.has(key));
const privateOrTransactionalRoute = Boolean(privateRouteTab) || hasTransactionalParams;

let hasKnownSession = false;
try {
    hasKnownSession = localStorage.getItem('beatss_has_session') === '1';
} catch (_) {
    hasKnownSession = false;
}

const SOSSA_STORE_PATH = '/tienda/sossa';
// El marketplace multivendedor queda preservado en el código, pero no se
// expone mientras BEATSS opera como la tienda de Sossa. Esta defensa de
// cliente también cubre marcadores o instalaciones PWA desactualizadas; en
// producción Vercel aplica el mismo redireccionamiento antes de servir HTML.
const isRetiredGlobalCatalogRoute = path === '/catalogo' || params.has('catalogo') || window.location.hash === '#catalogo';

const requiresFullAppAtBootstrap = hasTransactionalParams || hasKnownSession;

if (legacyStripeSessionId) {
    window.location.replace('/compra/stripe?session_id=' + encodeURIComponent(legacyStripeSessionId));
} else if (params.has('stripe_cancelled')) {
    window.location.replace('/compra/cancelada');
} else if (legacyDownloadId && legacyDownloadToken) {
    window.location.replace('/descargas/' + encodeURIComponent(legacyDownloadId) + '?token=' + encodeURIComponent(legacyDownloadToken));
} else if (isRetiredGlobalCatalogRoute) {
    params.delete('catalogo');
    const query = params.toString();
    window.location.replace(`${SOSSA_STORE_PATH}${query ? `?${query}` : ''}`);
} else if (isExpiredSessionReturn) {
    // El vencimiento deja al usuario sin sesión, pero aún debe conservar una
    // página completa detrás del acceso. Cargamos la portada junto con Auth:
    // el aviso de expiración puede abrir el modal una vez y, al cerrarlo, queda
    // Inicio visible en lugar de un workspace privado vacío.
    void import('./relay-home.js');
    void loadBeatssAuth();
} else if (isPublicStoreRoute) {
    void import('./public-store-router.js');
} else if (isPublicPurchaseRoute || isBuyerDownloadRoute) {
    // Comprar o volver a descargar no requiere una cuenta de productor.
    // Este router no importa Auth ni monta el Studio.
    void import('./public-purchase-router.js');
} else if (privateOrTransactionalRoute && requiresFullAppAtBootstrap) {
    void loadBeatssApp();
} else if (privateOrTransactionalRoute) {
    // Un enlace privado sin sesión solo necesita Auth. Studio, Firestore y
    // Lucide se cargan después de que Firebase confirme una sesión válida.
    void loadBeatssAuth();
} else {
    // La landing es exclusiva de Inicio. Cargarla desde index.html hacía que
    // catálogo y tiendas descargaran y montaran una pantalla que se ocultaba
    // enseguida, junto con su CSS. El import diferido deja esas rutas limpias.
    void import('./relay-home.js');
}
