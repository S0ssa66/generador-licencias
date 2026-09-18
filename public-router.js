const SOSSA_STORE_PATH = '/tienda/sossa';

function redirectToSossaStore() {
    window.location.replace(SOSSA_STORE_PATH);
}

export async function showPublicCatalog() {
    redirectToSossaStore();
}

window.showAppView = (view, options = {}) => {
    if (view === 'catalog') return redirectToSossaStore();
    if (view === 'home') return window.location.assign('/');
    if (view === 'store' && options.producer) return window.location.assign(`/tienda/${encodeURIComponent(options.producer)}`);
    return void window.ensureBeatssApp?.().then(() => window.showAppView?.(view, options));
};

void showPublicCatalog();
