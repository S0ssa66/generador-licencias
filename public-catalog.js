import { resolvePublicBeatArtwork } from './public-beat-utils.js';
import { ensureFullPublicIcons, renderPublicIcons } from './public-icons.js';

const PAGE_SIZE = 12;
const DEFAULT_BASIC_LICENSE_PRICE = 30;

const sanitizeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function hexToRgb(hex) {
    const normalized = String(hex || '').replace('#', '').trim();
    const expanded = normalized.length === 3
        ? normalized.split('').map((part) => part + part).join('')
        : normalized;
    if (!/^[a-f\d]{6}$/i.test(expanded)) return { r: 0, g: 204, b: 255 };
    return {
        r: Number.parseInt(expanded.slice(0, 2), 16),
        g: Number.parseInt(expanded.slice(2, 4), 16),
        b: Number.parseInt(expanded.slice(4, 6), 16)
    };
}

function renderSkeletons(container, count = PAGE_SIZE) {
    container.innerHTML = Array.from({ length: count }, () => `
        <div class="skeleton-card">
            <div class="skeleton-thumbnail"></div>
            <div class="skeleton-text skeleton-title"></div>
            <div class="skeleton-text skeleton-subtitle"></div>
            <div class="skeleton-row"><div class="skeleton-text" style="width:60px"></div><div class="skeleton-button"></div></div>
        </div>
    `).join('');
}

function setProducerAccent(config = {}) {
    const producer = String(config.aka || config.name || '').toLowerCase();
    const color = config.brandColor
        || (producer.includes('monarco') ? '#ff4d4d' : producer.includes('sossa') ? '#b28eff' : '#00ccff');
    const rgb = hexToRgb(color);
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
}

function populateGlobalFilters(beats) {
    const select = document.getElementById('global-genre-select');
    if (!select) return;
    const selected = select.value;
    const genres = [...new Set(beats.map((beat) => String(beat.genre || '').trim()).filter(Boolean))].sort();
    select.innerHTML = '<option value="">Cualquier Género</option>' + genres
        .map((genre) => `<option value="${sanitizeHtml(genre)}">${sanitizeHtml(genre)}</option>`)
        .join('');
    select.value = selected;
}

function renderStructuredData(beats) {
    document.getElementById('seo-jsonld-global-beats')?.remove();
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'MusicPlaylist',
        name: 'Marketplace Global de Beats y Licencias Instrumentales - BEATSS',
        numTracks: beats.length,
        track: beats.map((beat, index) => {
            const image = resolvePublicBeatArtwork(beat);
            return {
                '@type': 'MusicRecording',
                position: index + 1,
                name: beat.name,
                genre: beat.genre || 'Instrumental',
                ...( /^https:\/\//i.test(image) ? { image } : {}),
                offers: {
                    '@type': 'Offer',
                    price: Number(beat.price_basic ?? beat.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE,
                    priceCurrency: 'USD',
                    availability: 'https://schema.org/InStock',
                    seller: { '@type': 'Person', name: beat.producerConfig?.aka || beat.producerConfig?.name || 'Productor' }
                }
            };
        })
    };
    const script = document.createElement('script');
    script.id = 'seo-jsonld-global-beats';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
}

export function renderPublicGlobalBeats(beats) {
    const grid = document.getElementById('global-beats-grid');
    const empty = document.getElementById('global-empty-state');
    if (!grid || !empty) return;
    renderStructuredData(beats);
    if (!beats.length) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        renderPublicIcons(document.getElementById('global-catalog-view'));
        return;
    }
    empty.style.display = 'none';
    const buyText = window.currentLang === 'en' ? 'Acquire' : 'Adquirir';
    const basicLabel = window.currentLang === 'en' ? 'Basic' : 'Básico';
    grid.innerHTML = beats.map((beat, index) => {
        const config = beat.producerConfig || {};
        const producer = config.aka || config.name || 'Productor';
        const name = beat.name || 'Beat';
        const artwork = resolvePublicBeatArtwork(beat);
        const elite = config.plan === 'elite'
            ? '<span style="background:rgba(168,85,247,.12);border:1px solid #a855f7;color:#d8b4fe;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:700;text-transform:uppercase;font-family:monospace;margin-left:6px">[ ELITE ]</span>'
            : '';
        const price = Number(beat.price_basic ?? beat.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE;
        return `
            <article class="store-beat-card glass-card" style="padding:18px;display:flex;flex-direction:column;height:100%">
                <button type="button" class="store-beat-cover" data-public-action="play" data-beat-id="${sanitizeHtml(beat.id)}" style="position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;cursor:pointer;display:flex;align-items:center;justify-content:center;background:#151722;border:0;padding:0;width:100%" aria-label="Reproducir vista previa de ${sanitizeHtml(name)}">
                    <img src="${sanitizeHtml(artwork)}" alt="Portada de ${sanitizeHtml(name)}" width="640" height="640" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ''} style="width:100%;height:100%;object-fit:cover;object-position:top;transition:transform .5s ease">
                    <span class="store-play-overlay" aria-hidden="true"><span id="btn-play-global-${sanitizeHtml(beat.id)}" class="store-play-btn" aria-hidden="true" style="width:48px;height:48px;border-radius:50%;background:rgba(255,255,255,.9);border:none;display:flex;align-items:center;justify-content:center;color:#000;transform:scale(.9)"><i data-lucide="play" style="width:20px;height:20px;fill:#000;stroke:#000"></i></span></span>
                </button>
                <div style="padding:16px 4px 4px;display:flex;flex-direction:column;flex:1;gap:12px;position:relative;z-index:5">
                    <h3 style="font-size:18px;font-weight:700;color:#fff;margin:0;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-overflow:ellipsis;min-height:2.5em" title="${sanitizeHtml(name)}">${sanitizeHtml(name)}</h3>
                    <div style="color:#8a91a6;font-size:13px;font-weight:500;display:flex;align-items:center;gap:6px"><i data-lucide="user" style="width:14px;height:14px;color:#8b5cf6"></i><button type="button" data-public-action="store" data-producer="${sanitizeHtml(config.aka || config.name || '')}" style="color:#e2e8f0;cursor:pointer;text-decoration:underline;border:0;padding:0;background:transparent;font:inherit">${sanitizeHtml(producer)}</button>${elite}</div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><span class="minimal-tag">${sanitizeHtml(beat.bpm || '--')} BPM</span><span class="minimal-tag">KEY: ${sanitizeHtml(beat.key || '--')}</span><span class="minimal-tag">${sanitizeHtml(beat.genre || 'Variado')}</span></div>
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-top:auto;padding-top:14px;border-top:1px solid rgba(255,255,255,.05)"><div style="display:flex;flex-direction:column"><span style="font-size:11px;color:#8a91a6;font-weight:600;text-transform:capitalize">${basicLabel}</span><span style="font-weight:700;color:#fff;font-size:17px">$${price.toFixed(2)}</span></div><button type="button" data-public-action="buy" data-beat-id="${sanitizeHtml(beat.id)}" class="w-28 py-2 bg-white text-black hover:bg-white/90 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5"><i data-lucide="shopping-cart" style="width:14px;height:14px;stroke-width:2.5"></i>${buyText.toUpperCase()}</button></div>
                </div>
            </article>`;
    }).join('');
    renderPublicIcons(document.getElementById('global-catalog-view'));
}

function applyFilters() {
    const search = document.getElementById('global-search-input')?.value.toLowerCase().trim() || '';
    const genre = document.getElementById('global-genre-select')?.value || '';
    const priceLevel = document.getElementById('global-price-select')?.value || '';
    const bpmLevel = document.getElementById('global-bpm-select')?.value || '';
    const sort = document.getElementById('global-sort-select')?.value || 'newest';
    const matches = window.globalBeats.filter((beat) => {
        const config = beat.producerConfig || {};
        const price = Number(beat.price_basic ?? beat.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE;
        const bpm = Number(beat.bpm);
        const searchable = `${beat.name || ''} ${beat.genre || ''} ${config.aka || config.name || ''}`.toLowerCase();
        const priceMatches = !priceLevel || (Number.isFinite(price) && (
            (priceLevel === '0-20' && price <= 20) ||
            (priceLevel === '20-50' && price > 20 && price <= 50) ||
            (priceLevel === '50-100' && price > 50 && price <= 100) ||
            (priceLevel === '100+' && price > 100)
        ));
        const bpmMatches = !bpmLevel || (Number.isFinite(bpm) && (
            (bpmLevel === '0-90' && bpm < 90) ||
            (bpmLevel === '90-130' && bpm >= 90 && bpm <= 130) ||
            (bpmLevel === '130-999' && bpm > 130)
        ));
        return (!search || searchable.includes(search)) && (!genre || beat.genre === genre) && priceMatches && bpmMatches;
    });
    matches.sort((a, b) => sort === 'price_asc'
        ? (Number(a.price_basic ?? a.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE) - (Number(b.price_basic ?? b.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE)
        : sort === 'price_desc'
            ? (Number(b.price_basic ?? b.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE) - (Number(a.price_basic ?? a.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE)
            : (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    window.filteredGlobalBeats = matches;
    renderPublicGlobalBeats(matches);
}

async function playBeat(beatId) {
    const beat = window.globalBeats.find((item) => item.id === beatId);
    if (!beat) return;
    window.storeBeats = window.globalBeats;
    window.storeProducerUid = beat.producerUid;
    window.storeProducerConfig = beat.producerConfig || {};
    setProducerAccent(window.storeProducerConfig);
    await ensureFullPublicIcons();
    await import('./player.js');
    window.toggleStorePlay?.(beatId);
}

async function openCheckout(beatId) {
    const beat = window.globalBeats.find((item) => item.id === beatId);
    if (!beat) return;
    const producer = beat.producerConfig?.aka || beat.producerConfig?.name || beat.producerAka || beat.producerName;
    if (!producer) return window.showToast?.('No encontramos la tienda de este productor.', true);
    try {
        const response = await fetch(`/api/public-store?producer=${encodeURIComponent(producer)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.producerId || !Array.isArray(payload.beats)) throw new Error(payload.error || 'No se pudo preparar la compra.');
        if (!payload.beats.some((item) => item.id === beatId)) throw new Error('Este beat ya no está disponible.');
        window.storeBeats = payload.beats;
        window.storeProducerUid = payload.producerId;
        window.storeProducerConfig = payload.producer || {};
        setProducerAccent(window.storeProducerConfig);
        window.ensureBeatssMaterialSymbols?.();
        await ensureFullPublicIcons();
        await import('./checkout.js');
        window.openBeatCheckoutModal?.(beatId);
    } catch (error) {
        console.error('No se pudo cargar el checkout global:', error);
        window.showToast?.(error.message || 'No se pudo preparar la compra.', true);
    }
}

function setupEvents() {
    const grid = document.getElementById('global-beats-grid');
    if (grid && !grid.dataset.publicEvents) {
        grid.dataset.publicEvents = 'true';
        grid.addEventListener('click', (event) => {
            const target = event.target.closest('[data-public-action]');
            if (!target) return;
            const action = target.dataset.publicAction;
            if (action === 'play') void playBeat(target.dataset.beatId);
            if (action === 'buy') void openCheckout(target.dataset.beatId);
            if (action === 'store' && target.dataset.producer) window.location.assign(`/tienda/${encodeURIComponent(target.dataset.producer)}`);
        });
    }
    ['global-search-input', 'global-genre-select', 'global-price-select', 'global-bpm-select', 'global-sort-select'].forEach((id) => {
        const input = document.getElementById(id);
        if (input && !input.dataset.publicEvents) {
            input.dataset.publicEvents = 'true';
            input.addEventListener(id === 'global-search-input' ? 'input' : 'change', applyFilters);
        }
    });
    const clear = document.getElementById('global-btn-clear-filters');
    if (clear && !clear.dataset.publicEvents) {
        clear.dataset.publicEvents = 'true';
        clear.addEventListener('click', () => {
            ['global-search-input', 'global-genre-select', 'global-price-select', 'global-bpm-select'].forEach((id) => { document.getElementById(id).value = ''; });
            document.getElementById('global-sort-select').value = 'newest';
            applyFilters();
        });
    }
}

export async function initPublicGlobalCatalog() {
    const grid = document.getElementById('global-beats-grid');
    if (!grid) return;
    window.stateManager?.updateState?.({ isGlobalCatalogMode: true, isPublicStoreMode: false });
    renderSkeletons(grid);
    document.getElementById('global-load-more-container')?.style.setProperty('display', 'none');
    try {
        const response = await fetch('/api/public-catalog');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.beats)) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
        const producers = payload.producers && typeof payload.producers === 'object' ? payload.producers : {};
        window.globalBeats = payload.beats.map((beat) => ({ ...beat, producerConfig: producers[beat.producerUid] || beat.producerConfig || {} }));
        window.filteredGlobalBeats = [...window.globalBeats];
        window.globalProducersConfig = producers;
        populateGlobalFilters(window.globalBeats);
        setupEvents();
        applyFilters();
    } catch (error) {
        console.error('Error al inicializar el catálogo público:', error);
        grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#ef4444"><i data-lucide="alert-triangle" style="width:48px;height:48px"></i><p style="margin-top:15px;font-weight:600">Ocurrió un error al cargar el catálogo.</p></div>';
        renderPublicIcons(document.getElementById('global-catalog-view'));
    }
}

window.getBeatArtwork = resolvePublicBeatArtwork;
window.initPublicGlobalCatalog = initPublicGlobalCatalog;
