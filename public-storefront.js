import { resolvePublicBeatArtwork } from './public-beat-utils.js';
import { ensureFullPublicIcons, renderPublicIcons } from './public-icons.js';

// El checkout usa esta tarifa cuando un beat no define una excepción. La
// tienda debe reflejar el mismo precio, no mostrar “Negociable” por error.
const DEFAULT_BASIC_LICENSE_PRICE = 30;

const sanitizeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

function setStoreAccent() {
    document.documentElement.style.setProperty('--accent', '#3157e8');
    document.documentElement.style.setProperty('--accent-rgb', '49, 87, 232');
}

function showStoreNotice(title, message) {
    const grid = document.getElementById('store-beats-grid');
    const name = document.getElementById('store-producer-name');
    const subtitle = document.getElementById('store-producer-aka-sub');
    if (name) name.textContent = 'BEATSS';
    if (subtitle) subtitle.textContent = 'CATÁLOGO NO DISPONIBLE';
    if (!grid) return;
    grid.innerHTML = `<section class="store-unavailable" role="status" aria-live="polite"><span class="store-unavailable-kicker">BEATSS Relay</span><h2>${sanitizeHtml(title)}</h2><p>${sanitizeHtml(message)}</p><button type="button" class="btn-primary" data-public-store-action="catalog">Explorar catálogo</button></section>`;
}

function renderStoreStructuredData(beats) {
    document.getElementById('seo-jsonld-store-beats')?.remove();
    const schema = {
        '@context': 'https://schema.org',
        '@type': 'MusicPlaylist',
        name: `Catálogo de Instrumentales de ${window.storeProducerConfig?.aka || 'Productor'}`,
        numTracks: beats.length,
        track: beats.map((beat, index) => {
            const image = resolvePublicBeatArtwork(beat);
            return {
                '@type': 'MusicRecording', position: index + 1, name: beat.name, genre: beat.genre || 'Instrumental',
                ...( /^https:\/\//i.test(image) ? { image } : {}),
                offers: {
                    '@type': 'Offer', price: Number(beat.price_basic ?? beat.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE, priceCurrency: 'USD',
                    availability: 'https://schema.org/InStock',
                    seller: { '@type': 'Person', name: window.storeProducerConfig?.aka || 'Productor' }
                }
            };
        })
    };
    const script = document.createElement('script');
    script.id = 'seo-jsonld-store-beats';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schema);
    document.head.appendChild(script);
}

function renderStoreBeats(beats) {
    const grid = document.getElementById('store-beats-grid');
    const empty = document.getElementById('store-empty-state');
    if (!grid || !empty) return;
    renderStoreStructuredData(beats);
    if (!beats.length) {
        grid.style.display = 'none';
        empty.style.display = 'block';
        renderPublicIcons(document.getElementById('public-store-view'));
        return;
    }
    grid.style.display = 'grid';
    empty.style.display = 'none';
    const buyText = window.currentLang === 'en' ? 'Acquire License' : 'Adquirir Licencia';
    grid.innerHTML = beats.map((beat, index) => {
        const name = beat.name || 'Beat';
        const artwork = resolvePublicBeatArtwork(beat);
        const price = Number(beat.price_basic ?? beat.basicPrice) || DEFAULT_BASIC_LICENSE_PRICE;
        const badges = [beat.genre, beat.moods].filter(Boolean)
            .map((badge) => `<span class="store-genre-badge">${sanitizeHtml(badge)}</span>`).join('');
        const tags = String(beat.tags || '').split(/[\s,]+/).filter(Boolean).slice(0, 2)
            .map((tag) => `<span class="store-beat-tag">${sanitizeHtml(tag.startsWith('#') ? tag : `#${tag}`)}</span>`).join('');
        return `<article class="store-beat-card" data-id="${sanitizeHtml(beat.id)}">
            <div class="store-beat-cover">
                <img src="${sanitizeHtml(artwork)}" alt="${sanitizeHtml(name)}" width="640" height="640" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async"${index === 0 ? ' fetchpriority="high"' : ''}>
                <button type="button" class="store-play-overlay" data-public-store-action="play" data-beat-id="${sanitizeHtml(beat.id)}" aria-label="Reproducir vista previa de ${sanitizeHtml(name)}"><span class="store-play-btn" aria-hidden="true"><i data-lucide="play"></i></span></button>
                <button type="button" class="store-beat-card__share" data-public-store-action="share" data-beat-id="${sanitizeHtml(beat.id)}" aria-label="Compartir ${sanitizeHtml(name)}"><i data-lucide="share-2"></i></button>
            </div>
            <div class="store-beat-card__body">
                <div class="store-beat-card__headline">
                    <h3 class="store-beat-card__title" title="${sanitizeHtml(name)}">${sanitizeHtml(name)}</h3>
                    <div class="store-beat-card__price"><span>Desde</span><strong>$${price.toFixed(2)}</strong></div>
                </div>
                <p class="store-beat-card__meta">${sanitizeHtml(beat.bpm || 'N/A')} BPM <span aria-hidden="true">•</span> ${sanitizeHtml(beat.key || 'N/A')}</p>
                ${badges ? `<div class="store-beat-card__badges">${badges}</div>` : ''}${tags ? `<div class="store-beat-tags-container">${tags}</div>` : ''}
            </div>
            <button type="button" class="store-beat-card__buy" data-public-store-action="buy" data-beat-id="${sanitizeHtml(beat.id)}"><i data-lucide="shopping-cart" aria-hidden="true"></i><span>${buyText}</span><i data-lucide="arrow-right" aria-hidden="true"></i></button>
        </article>`;
    }).join('');
    renderPublicIcons(document.getElementById('public-store-view'));
}

function populateFilters(beats) {
    const genre = document.getElementById('store-genre-select');
    const key = document.getElementById('store-key-select');
    if (!genre || !key) return;
    const selectedGenre = genre.value;
    const selectedKey = key.value;
    const genres = [...new Set(beats.map((beat) => beat.genre).filter(Boolean))].sort();
    const keys = [...new Set(beats.map((beat) => beat.key).filter(Boolean))].sort();
    genre.innerHTML = '<option value="">Todos los géneros</option>' + genres.map((value) => `<option value="${sanitizeHtml(value)}">${sanitizeHtml(value)}</option>`).join('');
    key.innerHTML = '<option value="">Todas las escalas</option>' + keys.map((value) => `<option value="${sanitizeHtml(value)}">${sanitizeHtml(value)}</option>`).join('');
    genre.value = selectedGenre;
    key.value = selectedKey;
}

function applyFilters() {
    const query = document.getElementById('store-search-input')?.value.toLowerCase().trim() || '';
    const genre = document.getElementById('store-genre-select')?.value || '';
    const key = document.getElementById('store-key-select')?.value || '';
    renderStoreBeats(window.storeBeats.filter((beat) => {
        const searchable = `${beat.name || ''} ${beat.tags || ''} ${beat.genre || ''}`.toLowerCase();
        return (!query || searchable.includes(query)) && (!genre || beat.genre === genre) && (!key || beat.key === key);
    }));
}

async function playBeat(beatId) {
    const beat = window.storeBeats.find((item) => item.id === beatId);
    if (!beat) return;
    await ensureFullPublicIcons();
    await import('./player.js');
    window.setupStoreAudioPlayer?.();
    window.toggleStorePlay?.(beatId);
}

async function openCheckout(beatId) {
    if (!window.storeBeats.some((item) => item.id === beatId)) return;
    window.ensureBeatssMaterialSymbols?.();
    await ensureFullPublicIcons();
    await import('./checkout.js');
    window.openBeatCheckoutModal?.(beatId);
}

async function shareBeat(beatId) {
    const beat = window.storeBeats.find((item) => item.id === beatId);
    if (!beat) return;
    const url = `${window.location.origin}${window.location.pathname}?beat=${encodeURIComponent(beat.id)}`;
    const share = { title: `Escucha "${beat.name || 'este beat'}"`, text: 'Escucha este beat en BEATSS.', url };
    try {
        if (navigator.share) await navigator.share(share);
        else await navigator.clipboard?.writeText(url);
    } catch (_) {
        // Cancelar la hoja de compartir no es un error de la tienda.
    }
}

function renderEpk() {
    const config = window.storeProducerConfig || {};
    const bio = document.getElementById('epk-bio-text');
    const collabs = document.getElementById('epk-collabs-container');
    if (bio) bio.textContent = config.epkBio || 'El productor no ha ingresado una biografía.';
    if (collabs) {
        const values = Array.isArray(config.epkCollabs) ? config.epkCollabs : String(config.epkCollabs || '').split(/[\n,]/);
        collabs.innerHTML = values.filter(Boolean).map((value) => `<span class="store-beat-tag">${sanitizeHtml(value.trim())}</span>`).join('') || '<span class="text-on-surface-variant text-sm">Sin colaboraciones publicadas.</span>';
    }
    const statBeats = document.getElementById('epk-stat-beats');
    const statSales = document.getElementById('epk-stat-sales');
    const statStreams = document.getElementById('epk-stat-streams');
    const pro = document.getElementById('epk-pro-name');
    if (statBeats) statBeats.textContent = String(window.storeBeats.length);
    if (statSales) statSales.textContent = config.epkSales || '0';
    if (statStreams) statStreams.textContent = config.epkStreams || '0';
    if (pro) pro.textContent = config.epkPro || 'No afiliado / No especificado';
    renderPublicIcons(document.getElementById('public-store-view'));
}

function switchStoreTab(tab) {
    const beats = document.getElementById('beats-catalog-section');
    const epk = document.getElementById('press-kit-section');
    const beatsButton = document.getElementById('store-tab-beats');
    const epkButton = document.getElementById('store-tab-epk');
    if (!beats || !epk || !beatsButton || !epkButton) return;
    const showingBeats = tab !== 'epk';
    beats.style.display = showingBeats ? 'block' : 'none';
    epk.style.display = showingBeats ? 'none' : 'block';
    beatsButton.className = `store-view-tab${showingBeats ? ' is-active' : ''}`;
    epkButton.className = `store-view-tab${showingBeats ? '' : ' is-active'}`;
    beatsButton.setAttribute('aria-selected', String(showingBeats));
    epkButton.setAttribute('aria-selected', String(!showingBeats));
    if (!showingBeats) renderEpk();
}

function setupEvents() {
    const grid = document.getElementById('store-beats-grid');
    if (grid && !grid.dataset.publicStoreEvents) {
        grid.dataset.publicStoreEvents = 'true';
        grid.addEventListener('click', (event) => {
            const target = event.target.closest('[data-public-store-action]');
            if (!target) return;
            const action = target.dataset.publicStoreAction;
            if (action === 'play') void playBeat(target.dataset.beatId);
            if (action === 'buy') void openCheckout(target.dataset.beatId);
            if (action === 'share') void shareBeat(target.dataset.beatId);
            if (action === 'catalog') window.location.assign('/tienda/sossa');
        });
    }
    ['store-search-input', 'store-genre-select', 'store-key-select'].forEach((id) => {
        const input = document.getElementById(id);
        if (input && !input.dataset.publicStoreEvents) {
            input.dataset.publicStoreEvents = 'true';
            input.addEventListener(id === 'store-search-input' ? 'input' : 'change', applyFilters);
        }
    });
    const reset = document.getElementById('store-reset-filters');
    if (reset && !reset.dataset.publicStoreEvents) {
        reset.dataset.publicStoreEvents = 'true';
        reset.addEventListener('click', () => {
            const search = document.getElementById('store-search-input');
            const genre = document.getElementById('store-genre-select');
            const key = document.getElementById('store-key-select');
            if (search) search.value = '';
            if (genre) genre.value = '';
            if (key) key.value = '';
            applyFilters();
            search?.focus();
        });
    }
}

function setWhatsAppShortcut(phone) {
    let shortcut = document.getElementById('store-wa-float');
    const number = String(phone || '').replace(/[^\d]/g, '');
    if (!number) {
        shortcut?.remove();
        return;
    }
    if (!shortcut) {
        shortcut = document.createElement('a');
        shortcut.id = 'store-wa-float';
        shortcut.className = 'store-wa-float';
        shortcut.setAttribute('aria-label', 'Contactar por WhatsApp');
        shortcut.innerHTML = '<i data-lucide="message-circle" aria-hidden="true"></i>';
        document.body.appendChild(shortcut);
    }
    shortcut.href = `https://wa.me/${number}?text=Hola,%20me%20gustar%C3%ADa%20comprar%20un%20beat.`;
    renderPublicIcons(shortcut);
}

export async function initPublicStorefront(producerAka) {
    const grid = document.getElementById('store-beats-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="premium-loader-container"><div class="equalizer-loader"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div><p class="loader-text">Sincronizando catálogo...</p></div>';
    try {
        const response = await fetch(`/api/public-store?producer=${encodeURIComponent(producerAka)}`);
        const payload = await response.json().catch(() => ({}));
        if (response.status === 404) return showStoreNotice('No encontramos este catálogo', 'Revisa el enlace que recibiste o explora los beats disponibles en BEATSS.');
        if (!response.ok || !payload.producerId || !payload.producer?.aka) throw new Error(payload.error || 'No se pudo cargar el catálogo.');
        window.storeProducerUid = payload.producerId;
        window.storeProducerConfig = payload.producer;
        window.storePaymentCapabilities = payload.paymentCapabilities || {
            stripe: false,
            paypal: false,
            payphone: false,
            deuna: false,
            transfer: false
        };
        window.storeBeats = Array.isArray(payload.beats) ? payload.beats : [];
        setStoreAccent();
        const name = document.getElementById('store-producer-name');
        const subtitle = document.getElementById('store-producer-aka-sub');
        if (name) name.textContent = payload.producer.aka || payload.producer.name || 'Productor';
        if (subtitle) subtitle.textContent = `Catálogo Oficial de ${payload.producer.aka || 'Beats'}`;
        const beatCount = document.getElementById('store-beat-count');
        if (beatCount) beatCount.textContent = String(window.storeBeats.length);
        const logo = document.getElementById('store-logo-img');
        const fallback = document.getElementById('store-logo-icon');
        const producerAlias = String(payload.producer.aka || payload.producer.name || '').toLowerCase();
        const image = payload.producer.logoBase64 || (producerAlias.includes('sossa') ? '/producer_sossa.webp' : '');
        if (logo) { logo.src = image; logo.style.display = image ? 'block' : 'none'; }
        if (fallback) fallback.style.display = image ? 'none' : 'flex';
        const email = document.getElementById('store-email-link');
        const phone = document.getElementById('store-phone-link');
        if (email) { email.href = `mailto:${payload.producer.email || 'soporte@beatss.com'}`; email.style.display = payload.producer.email ? '' : 'none'; }
        if (phone) { const number = String(payload.producer.phone || '').replace(/[^\d]/g, ''); phone.href = `https://wa.me/${number}`; phone.style.display = number ? '' : 'none'; }
        setWhatsAppShortcut(payload.producer.phone);
        populateFilters(window.storeBeats);
        setupEvents();
        renderStoreBeats(window.storeBeats);
        switchStoreTab('beats');
    } catch (error) {
        console.error('Error cargando la tienda pública:', error);
        showStoreNotice('No pudimos abrir este catálogo', 'Intenta nuevamente en unos minutos o vuelve al catálogo general de BEATSS.');
        renderPublicIcons(document.getElementById('public-store-view'));
    }
}

window.getBeatArtwork = resolvePublicBeatArtwork;
window.switchStoreTab = switchStoreTab;
window.initPublicStorefront = initPublicStorefront;
