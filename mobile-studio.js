/*
 * Mobile Studio navigation for BEATSS Sonic Ledger.
 * It only orchestrates the existing sidebar and tab controls: the editor,
 * catalog, dashboard and license logic stay in their original modules.
 */
const mobileStudioMarkup = `
  <nav class="ledger-mobile-nav" aria-label="Navegación del Studio">
    <button type="button" class="is-active" data-ledger-mobile-view="tab-home" aria-current="page"><i data-lucide="home"></i><span>Inicio</span></button>
    <button type="button" data-ledger-mobile-view="editor"><i data-lucide="pen-line"></i><span>Crear</span></button>
    <button type="button" data-ledger-mobile-view="tab-history"><i data-lucide="history"></i><span>Registro</span></button>
    <button type="button" data-ledger-mobile-view="tab-beats"><i data-lucide="music-2"></i><span>Catálogo</span></button>
    <button type="button" data-ledger-mobile-more aria-expanded="false"><i data-lucide="grid-2x2"></i><span>Más</span></button>
    <div class="ledger-mobile-more" hidden>
      <button type="button" data-ledger-mobile-view="tab-preview"><i data-lucide="file-text"></i>Contrato</button>
      <button type="button" data-ledger-mobile-view="tab-dashboard"><i data-lucide="bar-chart-3"></i>Ventas</button>
      <button type="button" data-ledger-mobile-view="tab-sales"><i data-lucide="shopping-cart"></i>Pedidos</button>
      <button type="button" data-ledger-mobile-view="tab-invoicing"><i data-lucide="receipt"></i>Facturas SRI</button>
      <button type="button" data-ledger-mobile-view="tab-email-history"><i data-lucide="mail-check"></i>Emails</button>
      <button type="button" data-ledger-mobile-view="tab-whitelist"><i data-lucide="shield-check"></i>Content ID</button>
      <button type="button" data-ledger-mobile-action="settings"><i data-lucide="settings-2"></i>Configuración</button>
    </div>
  </nav>`;

function setMobileStudioView(view, { tabAlreadySelected = false } = {}) {
    const app = document.getElementById('app-container');
    const sidebar = app?.querySelector('.sidebar');
    const mainPanel = app?.querySelector('.main-panel');
    const nav = app?.querySelector('.ledger-mobile-nav');
    if (!app || !sidebar || !mainPanel || !nav) return;

    const isEditor = view === 'editor';
    // "Crear" no es una pestaña del panel principal: es el editor lateral.
    // Aun así debe abandonar el estado visual de Inicio para que las reglas
    // de ancho/opacidad del home no oculten el formulario en teléfono.
    if (isEditor) app.dataset.activeTab = 'editor';
    sidebar.classList.toggle('sidebar-hidden', !isEditor);
    sidebar.style.setProperty('display', isEditor ? 'flex' : 'none', 'important');
    sidebar.style.setProperty('flex-direction', isEditor ? 'column' : '', 'important');
    mainPanel.style.setProperty('display', isEditor ? 'none' : 'flex', 'important');

    if (!isEditor && !tabAlreadySelected) {
        if (typeof window.switchTab === 'function') {
            window.switchTab(view);
        } else {
            app.querySelector(`.tab-btn[data-tab="${view}"]`)?.click();
        }
    } else if (isEditor && window.syncBeatssPathForTab) {
        window.syncBeatssPathForTab('tab-preview');
    }

    nav.querySelectorAll('[data-ledger-mobile-view]').forEach((button) => {
        const active = button.dataset.ledgerMobileView === view;
        button.classList.toggle('is-active', active);
        if (active) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });
    const moreButton = nav.querySelector('[data-ledger-mobile-more]');
    const secondaryViews = new Set(['tab-preview', 'tab-dashboard', 'tab-sales', 'tab-email-history', 'tab-whitelist']);
    secondaryViews.add('tab-invoicing');
    const moreActive = secondaryViews.has(view);
    moreButton.classList.toggle('is-active', moreActive);
    if (moreActive) moreButton.setAttribute('aria-current', 'page');
    else moreButton.removeAttribute('aria-current');
    nav.querySelector('.ledger-mobile-more').hidden = true;
    moreButton.setAttribute('aria-expanded', 'false');
}
window.setMobileStudioView = setMobileStudioView;

function initMobileStudioNavigation() {
    const app = document.getElementById('app-container');
    if (!app || app.querySelector('.ledger-mobile-nav')) return;

    app.insertAdjacentHTML('beforeend', mobileStudioMarkup);
    const nav = app.querySelector('.ledger-mobile-nav');
    nav.querySelectorAll('[data-ledger-mobile-view]').forEach((button) => {
        button.addEventListener('click', () => setMobileStudioView(button.dataset.ledgerMobileView));
    });
    nav.querySelector('[data-ledger-mobile-action="settings"]')?.addEventListener('click', () => {
        nav.querySelector('.ledger-mobile-more').hidden = true;
        nav.querySelector('[data-ledger-mobile-more]').setAttribute('aria-expanded', 'false');
        document.getElementById('btn-settings')?.click();
    });

    const moreButton = nav.querySelector('[data-ledger-mobile-more]');
    const moreMenu = nav.querySelector('.ledger-mobile-more');
    moreButton.addEventListener('click', () => {
        const expanded = moreButton.getAttribute('aria-expanded') === 'true';
        moreButton.setAttribute('aria-expanded', String(!expanded));
        moreMenu.hidden = expanded;
        if (!expanded && window.lucide) {
            window.lucide.createIcons();
        }
    });

    // Cerrar el menú Más al tocar en cualquier punto fuera de la navegación móvil
    document.addEventListener('pointerdown', (event) => {
        if (moreMenu.hidden) return;
        if (!nav.contains(event.target)) {
            moreMenu.hidden = true;
            moreButton.setAttribute('aria-expanded', 'false');
        }
    });

    // Las rutas privadas pueden abrirse directamente (por ejemplo, /dashboard).
    // Reflejamos la pestaña ya seleccionada sin volver a ejecutar switchTab,
    // evitando que la barra móvil indique erróneamente "Editar".
    window.addEventListener('beatss:tabchange', (event) => {
        if (!window.matchMedia('(max-width: 760px)').matches) return;
        const tabId = event.detail?.tabId;
        if (!tabId) return;
        setMobileStudioView(tabId, { tabAlreadySelected: true });
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || moreMenu.hidden) return;
        moreMenu.hidden = true;
        moreButton.setAttribute('aria-expanded', 'false');
        moreButton.focus();
    });

    if (window.lucide) window.lucide.createIcons();

    if (window.matchMedia('(max-width: 760px)').matches) {
        const initialView = app.dataset.activeTab === 'tab-home' ? 'tab-home' : 'editor';
        setMobileStudioView(initialView, { tabAlreadySelected: true });
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileStudioNavigation, { once: true });
} else {
    initMobileStudioNavigation();
}
