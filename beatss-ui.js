/* Shared UI hardening for the current BEATSS Ledger interface. */

const setImageState = (image, state) => {
    if (!(image instanceof HTMLImageElement)) return;
    image.dataset[state === 'error' ? 'beatssError' : 'beatssEmpty'] = 'true';
    image.setAttribute('aria-hidden', 'true');
    image.nextElementSibling?.classList.add('beatss-media-fallback');
};

const prepareImage = (image) => {
    if (!(image instanceof HTMLImageElement)) return;
    if (!image.getAttribute('src')) {
        setImageState(image, 'empty');
        return;
    }
    image.addEventListener('error', () => setImageState(image, 'error'), { once: true });
};

const ensureButtonNames = (root = document) => {
    const buttons = root instanceof HTMLButtonElement ? [root] : root.querySelectorAll('button');
    const labels = {
        close: 'Cerrar', menu: 'Abrir menú', arrow_back: 'Volver', arrow_forward: 'Continuar',
        play: 'Reproducir', pause: 'Pausar', search: 'Buscar', download: 'Descargar',
        upload: 'Subir', edit: 'Editar', delete: 'Eliminar', more_vert: 'Más opciones', settings: 'Configuración'
    };
    buttons.forEach((button) => {
        if (button.getAttribute('aria-label') || button.title) return;
        const icon = button.querySelector('.material-symbols-outlined, [data-lucide]');
        const iconName = icon?.getAttribute('data-lucide') || icon?.textContent.trim() || '';
        const text = button.textContent.trim();
        if (text && text !== iconName) return;
        button.setAttribute('aria-label', labels[iconName] || 'Acción');
    });
};

const syncGlobalEmptyState = () => {
    const view = document.getElementById('global-catalog-view');
    const grid = document.getElementById('global-beats-grid');
    const empty = document.getElementById('global-empty-state');
    if (!view || !grid || !empty || getComputedStyle(view).display === 'none') return;
    const hasBeat = grid.querySelector('.store-beat-card, [data-beat-id], [data-id]');
    const loading = grid.querySelector('[class*="skeleton"], [class*="loading"]');
    if (hasBeat || loading) {
        if (hasBeat) empty.style.display = 'none';
        return;
    }
    empty.style.display = 'block';
    grid.setAttribute('aria-busy', 'false');
};

const bindLedgerActions = () => {
    document.querySelectorAll('[data-ledger-action="catalog"]').forEach((button) => {
        if (button.dataset.beatssBound) return;
        button.dataset.beatssBound = 'true';
        button.addEventListener('click', () => window.location.assign('/tienda/sossa'));
    });
};

const hardenUi = () => {
    document.querySelectorAll('img').forEach(prepareImage);
    ensureButtonNames();
    bindLedgerActions();
    syncGlobalEmptyState();

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') document.querySelector('.ledger-mobile-more:not([hidden])')?.setAttribute('hidden', '');
    });

    let mutationFrame = 0;
    let pendingNodes = [];
    const flushMutations = () => {
        mutationFrame = 0;
        const nodes = pendingNodes;
        pendingNodes = [];
        nodes.forEach((node) => {
            if (!(node instanceof HTMLElement)) return;
            if (node.matches('img')) prepareImage(node);
            node.querySelectorAll('img').forEach(prepareImage);
            ensureButtonNames(node);
        });
        bindLedgerActions();
        syncGlobalEmptyState();
    };
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(({ addedNodes }) => {
            addedNodes.forEach((node) => {
                if (node instanceof HTMLElement) pendingNodes.push(node);
            });
        });
        // Una sola pasada por frame evita repetir búsquedas completas cuando
        // un módulo inserta muchas filas, tarjetas o controles de una vez.
        if (!mutationFrame) {
            mutationFrame = requestAnimationFrame(flushMutations);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', hardenUi, { once: true });
else hardenUi();
