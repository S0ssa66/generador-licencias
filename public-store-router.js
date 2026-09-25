import './tailwind-entry.css';
import './styles.css';
import './mobile.css';
import './settings-modern.css';
import './viewport-coherence.css';
import './public-store.css';
import './store-player.css';
import './stateManager.js';
import { initPublicStorefront } from './public-storefront.js';
import { renderPublicIcons } from './public-icons.js';

function showStoreShell() {
    const targets = ['landing-page', 'app-container', 'global-catalog-view', 'buyer-download-view', 'login-modal'];
    targets.forEach((id) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.style.display = 'none';
        element.setAttribute('aria-hidden', 'true');
        element.inert = true;
    });
    const store = document.getElementById('public-store-view');
    if (store) {
        store.style.display = 'block';
        store.setAttribute('aria-hidden', 'false');
        store.inert = false;
    }
    document.body.classList.remove('landing-active');
    document.body.dataset.beatssView = 'store';
}

function currentProducerAlias() {
    const pathname = window.location.pathname;
    if (pathname.startsWith('/tienda/')) {
        const raw = pathname.slice('/tienda/'.length);
        try { return decodeURIComponent(raw).trim(); } catch (_) { return ''; }
    }
    if (pathname.startsWith('/@')) {
        const raw = pathname.slice(2);
        try { return decodeURIComponent(raw).trim(); } catch (_) { return ''; }
    }
    return '';
}

export async function showPublicStore() {
    try { window.currentLang = localStorage.getItem('beatss_language') || window.currentLang || 'es'; } catch (_) { window.currentLang ||= 'es'; }
    showStoreShell();
    renderPublicIcons(document.getElementById('public-store-view'));
    const producer = currentProducerAlias();
    if (!producer) return window.location.assign('/tienda/sossa');
    await initPublicStorefront(producer);
    window.dismissBeatssBootScreen?.();
}

window.showAppView = (view, options = {}) => {
    if (view === 'home') return window.location.assign('/');
    if (view === 'catalog') return window.location.assign('/tienda/sossa');
    if (view === 'store' && options.producer) return window.location.assign(`/tienda/${encodeURIComponent(options.producer)}`);
    return void window.ensureBeatssApp?.().then(() => window.showAppView?.(view, options));
};

void showPublicStore();
