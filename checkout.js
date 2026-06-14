import { LICENSE_CONFIGS } from './config.js';
import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    addDoc, 
    collectionGroup, 
    query, 
    where,
    updateDoc
} from "./firebase.js";

// Initialize global state on window
window.cart = window.cart || [];
window.storeProducerUid = window.storeProducerUid || null;
window.storeProducerConfig = window.storeProducerConfig || {};
window.storeBeats = window.storeBeats || [];
window.storePayments = window.storePayments || [];
window.checkoutDiscountPercent = window.checkoutDiscountPercent || 0;
window.checkoutAppliedCoupon = window.checkoutAppliedCoupon || null;

let checkoutSelectedBeatId = null;
let checkoutSelectedLicense = 'basic';
let checkoutCurrentStep = 1;
let storePaymentReceiptBase64 = null;
let checkoutIsOfferMode = false;

// Helpers to dynamically load script (since we might need to load PayPal or Payphone SDKs)
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Cargar carrito desde localStorage si existe
export function loadCartFromStorage() {
    try {
        const storedCart = localStorage.getItem('beatss_cart');
        if (storedCart) {
            window.cart = JSON.parse(storedCart);
        }
    } catch (e) {
        console.error("Error al cargar el carrito:", e);
    }
}
loadCartFromStorage();

export function saveCartToStorage() {
    try {
        localStorage.setItem('beatss_cart', JSON.stringify(window.cart));
    } catch (e) {
        console.error("Error al guardar el carrito:", e);
    }
}

export function addToCart(beatId, licenseType, price, beatName, producerId, producerName, artwork) {
    // Validar que el carrito no contenga beats de otro productor
    if (window.cart.length > 0 && window.cart[0].producerId !== producerId) {
        const confirmChange = confirm(`Tu carrito contiene beats de "${window.cart[0].producerName}". ¿Deseas vaciar tu carrito para agregar este beat de "${producerName}"?`);
        if (confirmChange) {
            window.cart = [];
        } else {
            return false;
        }
    }
    
    const exists = window.cart.some(item => item.beatId === beatId);
    if (exists) {
        if (typeof window.showToast === 'function') window.showToast("Este beat ya está en tu carrito.", true);
        return false;
    }
    
    window.cart.push({
        beatId,
        licenseType,
        price,
        beatName,
        producerId,
        producerName,
        artwork
    });
    
    saveCartToStorage();
    window.updateCartUI();
    if (typeof window.showToast === 'function') window.showToast("¡Beat agregado al carrito!");
    return true;
}

export function removeFromCart(index) {
    if (index >= 0 && index < window.cart.length) {
        const removed = window.cart.splice(index, 1);
        saveCartToStorage();
        window.updateCartUI();
        if (typeof window.showToast === 'function') window.showToast(`Removido: ${removed[0].beatName}`);
        
        // Si el modal está abierto en modo carrito, refrescar el listado
        if (document.getElementById('beat-checkout-modal').style.display === 'flex' && !checkoutSelectedBeatId) {
            window.renderCartItems();
        }
    }
}

export function updateCartItemLicense(index, newLicenseType) {
    if (index >= 0 && index < window.cart.length) {
        window.cart[index].licenseType = newLicenseType;
        // Calcular precio de la nueva licencia
        const config = LICENSE_CONFIGS[newLicenseType];
        if (config) {
            window.cart[index].price = config.price;
        }
        saveCartToStorage();
        window.updateCartUI();
        
        // Si el modal está abierto en modo carrito, refrescar el listado
        if (document.getElementById('beat-checkout-modal').style.display === 'flex' && !checkoutSelectedBeatId) {
            window.renderCartItems();
        }
    }
}

export function getCartTotal() {
    return window.cart.reduce((sum, item) => sum + item.price, 0);
}

export function updateCartUI() {
    const badge = document.getElementById('cart-count-badge');
    const floatBtn = document.getElementById('floating-cart-btn');
    
    if (!badge || !floatBtn) return;
    
    const count = window.cart.length;
    badge.textContent = count;
    
    // Mostrar botón flotante si hay elementos en el carrito Y estamos en modo tienda o catálogo
    if (count > 0 && (window.isPublicStoreMode || window.isGlobalCatalogMode)) {
        floatBtn.style.display = 'flex';
    } else {
        floatBtn.style.display = 'none';
    }
}

export function findBeatById(beatId) {
    console.log("🔍 findBeatById called with ID:", beatId);
    console.log("  window.storeBeats:", window.storeBeats ? window.storeBeats.map(b => b.id) : "undefined");
    console.log("  window.globalBeats:", window.globalBeats ? window.globalBeats.map(b => b.id) : "undefined");
    if (window.storeBeats) {
        const b = window.storeBeats.find(x => x.id === beatId);
        if (b) {
            console.log("  Found in storeBeats:", b);
            return b;
        }
    }
    if (window.globalBeats) {
        const b = window.globalBeats.find(x => x.id === beatId);
        if (b) {
            console.log("  Found in globalBeats:", b);
            return b;
        }
    }
    console.warn("  Beat NOT found for ID:", beatId);
    return null;
}

export function renderCartItems() {
    const container = document.getElementById('cart-items-container');
    if (!container) return;
    
    if (window.cart.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #8a91a6;">
                <p>Tu carrito está vacío.</p>
            </div>
        `;
        document.getElementById('cart-total-price-display').textContent = "$0.00 USD";
        return;
    }
    
    container.innerHTML = window.cart.map((item, index) => {
        const beat = findBeatById(item.beatId) || item;
        const artwork = window.getBeatArtwork(beat) || window.getBeatArtwork(item);
        
        // Generar las opciones de licencia para el select
        const optionsHtml = Object.entries(LICENSE_CONFIGS).map(([key, config]) => {
            const isSelected = key === item.licenseType;
            const priceText = key === 'exclusive' ? 'Exclusiva (Min. $250)' : `$${config.price.toFixed(2)}`;
            return `<option value="${key}" ${isSelected ? 'selected' : ''}>${config.name} - ${priceText}</option>`;
        }).join('');
        
        return `
            <div class="cart-item-row" style="display: flex; gap: 12px; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 12px; box-sizing: border-box; width: 100%;">
                <img src="${artwork}" style="width: 48px; height: 48px; border-radius: 6px; object-fit: cover; background: #222;" alt="Artwork">
                <div style="flex: 1; text-align: left; overflow: hidden;">
                    <div style="font-weight: 700; color: #fff; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.beatName}</div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                        <select onchange="window.updateCartItemLicense(${index}, this.value)" style="background: #12141c; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; padding: 2px 6px; font-size: 11px; outline: none; cursor: pointer;">
                            ${optionsHtml}
                        </select>
                    </div>
                </div>
                <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 800; color: var(--accent, #00ccff); font-size: 14px;">$${item.price.toFixed(2)}</span>
                    <button type="button" onclick="window.removeFromCart(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Eliminar">
                        <i data-lucide="trash-2" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    // Si Lucide está cargado, renderizar iconos
    if (window.lucide) window.lucide.createIcons();
    
    // Actualizar total
    const total = window.getCheckoutPrice();
    const totalStr = '$' + total.toFixed(2) + ' USD';
    document.getElementById('cart-total-price-display').textContent = totalStr;
    document.getElementById('deuna-total-price').textContent = totalStr;
    document.getElementById('transfer-total-price').textContent = totalStr;
}

// Inicialización de Tienda Pública
export async function initPublicStore(producerAka) {
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
        <div class="premium-loader-container">
            <div class="equalizer-loader">
                <span class="eq-bar"></span>
                <span class="eq-bar"></span>
                <span class="eq-bar"></span>
                <span class="eq-bar"></span>
                <span class="eq-bar"></span>
            </div>
            <p class="loader-text">Sincronizando catálogo...</p>
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
        let storeColor = '#00ccff';
        if (configData.brandColor) {
            storeColor = configData.brandColor;
        } else if (akaLower.includes('monarco')) {
            storeColor = '#ff4d4d';
        } else if (akaLower.includes('sossa')) {
            storeColor = '#b28eff';
        }

        const hexToRgb = hex => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '0, 204, 255';
        };

        document.documentElement.style.setProperty('--accent', storeColor);
        document.documentElement.style.setProperty('--accent-rgb', hexToRgb(storeColor));

        // Cargar logotipo si existe
        const logoImg = document.getElementById('store-logo-img');
        const logoIcon = document.getElementById('store-logo-icon');
        const resolvedLogo = window.getProducerAvatar ? window.getProducerAvatar(configData) : configData.logoBase64;
        if (resolvedLogo) {
            logoImg.src = resolvedLogo;
            logoImg.style.display = 'block';
            logoIcon.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoIcon.style.display = 'flex';
        }

        // Redes sociales
        document.getElementById('store-email-link').href = `mailto:${configData.email || 'soporte@beatss.com'}`;
        document.getElementById('store-phone-link').href = `https://wa.me/${(configData.phone || '').replace(/\+/g, '').replace(/\s/g, '')}`;

        // WhatsApp flotante
        let waFloat = document.getElementById('store-wa-float');
        if (configData.phone) {
            if (!waFloat) {
                waFloat = document.createElement('a');
                waFloat.id = 'store-wa-float';
                waFloat.style.cssText = 'position: fixed; bottom: 20px; right: 20px; background: #25D366; color: white; width: 50px; height: 50px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 9999; text-decoration: none; transition: transform 0.2s;';
                waFloat.innerHTML = '<i data-lucide="message-circle" style="width: 24px; height: 24px; fill: white;"></i>';
                waFloat.onmouseover = () => waFloat.style.transform = 'scale(1.1)';
                waFloat.onmouseout = () => waFloat.style.transform = 'scale(1)';
                document.body.appendChild(waFloat);
                if (window.lucide) window.lucide.createIcons({root: waFloat});
            }
            waFloat.href = `https://wa.me/${configData.phone.replace(/\+/g, '').replace(/\s/g, '')}?text=Hola,%20me%20gustar%C3%ADa%20comprar%20un%20beat.`;
            waFloat.style.display = 'flex';
        } else if (waFloat) {
            waFloat.style.display = 'none';
        }

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
        if (typeof window.setupStoreAudioPlayer === 'function') window.setupStoreAudioPlayer();
        setupStoreCheckout();
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Error cargando la tienda:", err);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
                <p>Error de conexión al cargar la tienda. Intenta nuevamente.</p>
            </div>
        `;
    }
}

export function renderStoreBeats(beats) {
    const grid = document.getElementById('store-beats-grid');
    const emptyState = document.getElementById('store-empty-state');
    
    // Inyectar metadatos estructurados JSON-LD (SEO)
    try {
        let schemaEl = document.getElementById('seo-jsonld-store-beats');
        if (schemaEl) {
            schemaEl.remove();
        }
        
        const schemaData = {
            "@context": "https://schema.org",
            "@type": "MusicPlaylist",
            "name": `Catálogo de Instrumentales de ${window.storeProducerConfig?.aka || 'Productor'}`,
            "numTracks": beats.length,
            "track": beats.map((beat, index) => ({
                "@type": "MusicRecording",
                "position": index + 1,
                "name": beat.name,
                "genre": beat.genre || "Instrumental",
                "image": window.getBeatArtwork(beat),
                "offers": {
                    "@type": "Offer",
                    "price": beat.basicPrice || 30.00,
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                    "seller": {
                        "@type": "Person",
                        "name": window.storeProducerConfig?.aka || "Productor"
                    }
                }
            }))
        };

        schemaEl = document.createElement('script');
        schemaEl.id = 'seo-jsonld-store-beats';
        schemaEl.type = 'application/ld+json';
        schemaEl.text = JSON.stringify(schemaData);
        document.head.appendChild(schemaEl);
    } catch (e) {
        console.error("Error al inyectar JSON-LD de la tienda:", e);
    }

    if (beats.length === 0) {
        grid.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    emptyState.style.display = 'none';

    grid.innerHTML = beats.map(beat => {
        const artworkUrl = window.getBeatArtwork(beat);
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
            ? `<div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">${genreBadge}${moodBadge}</div>`
            : '';
        
        const buyLicenseText = window.currentLang === 'es' ? 'Adquirir Licencia' : 'Acquire License';
        const priceValue = beat.price_basic ? `$${beat.price_basic.toFixed(2)}` : (window.currentLang === 'es' ? 'Negociable' : 'Negotiable');
        
        return `
            <div class="store-beat-card" data-id="${beat.id}" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; padding: 18px;">
                <div>
                    <div class="store-beat-cover" style="position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #151722;">
                        <img src="${artworkUrl}" alt="${beat.name}" style="width:100%; height:100%; object-fit:cover; object-position:top; border-radius:14px; transition: transform 0.5s ease;">
                        <div class="store-play-overlay" onclick="window.toggleStorePlay('${beat.id}')">
                            <button class="store-play-btn" id="btn-play-store-${beat.id}" style="width: 56px; height: 56px; border-radius: 50%; background: var(--accent, #00ccff); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; box-shadow: 0 4px 15px var(--accent-glow, rgba(0, 204, 255, 0.3)); transform: scale(0.9); transition: all 0.3s ease;">
                                <i data-lucide="play" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>
                            </button>
                        </div>
                        <button onclick="window.shareBeat('${beat.id}', '${beat.name.replace(/'/g, "\\'")}')" style="position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="Compartir">
                            <i data-lucide="share-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #fff; margin: 16px 0 0 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; min-height: 2.5em;" title="${beat.name}">${beat.name}</h3>
                    <div class="store-beat-meta" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; color: #8a91a6; font-weight: 600;">${bpmText} • ${keyText}</span>
                        <span style="color: var(--accent, #00ccff); font-weight: 800; background: rgba(var(--accent-rgb, 0, 204, 255), 0.08); padding: 4px 12px; border-radius: 8px; font-size: 15px;">${priceValue}</span>
                    </div>
                    ${badgesHtml}
                    ${tagsHtml}
                </div>
                <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">
                    <button class="btn btn-primary" onclick="window.openBeatCheckoutModal('${beat.id}')" style="width: 100%; height: 44px; font-weight: 700; border-radius: 12px; font-size: 14px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
                        <i data-lucide="shopping-cart" style="width: 16px; height: 16px; stroke-width: 2.5;"></i>
                        <span>${buyLicenseText}</span>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
    if (typeof window.apply3DTiltEffect === 'function') window.apply3DTiltEffect();
}

export function shareBeat(beatId, beatName) {
    if (event) event.stopPropagation();
    const url = window.location.href.split('?')[0] + '?p=' + encodeURIComponent(window.storeProducerConfig.aka || window.storeProducerConfig.name) + '&beat=' + beatId;
    if (navigator.share) {
        navigator.share({
            title: `Escucha "${beatName}"`,
            text: `🎵 Escucha este increíble beat: "${beatName}"`,
            url: url
        }).catch((error) => console.log('Error sharing', error));
    } else {
        navigator.clipboard.writeText(url).then(() => {
            if (typeof window.showToast === 'function') window.showToast("Enlace copiado al portapapeles.");
        });
    }
}

export function setupStoreFilters() {
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

export function getCheckoutPrice() {
    let basePrice = 0;
    if (checkoutSelectedBeatId) {
        if (checkoutSelectedLicense === 'exclusive') {
            const input = document.getElementById('exclusive-price-input');
            if (input) {
                const val = parseFloat(input.value);
                if (!isNaN(val)) basePrice = val;
            } else {
                basePrice = window.checkoutExclusivePrice || 500;
            }
        } else {
            basePrice = LICENSE_CONFIGS[checkoutSelectedLicense] ? LICENSE_CONFIGS[checkoutSelectedLicense].price : 0;
        }
    } else {
        basePrice = getCartTotal();
    }
    
    // Aplicar descuento de cupón
    if (window.checkoutDiscountPercent > 0) {
        const discount = basePrice * (window.checkoutDiscountPercent / 100);
        return Math.max(0, basePrice - discount);
    }
    
    return basePrice;
}

export function applyCheckoutCoupon() {
    const inputEl = document.getElementById('checkout-coupon-code');
    const msgEl = document.getElementById('checkout-coupon-msg');
    if (!inputEl || !msgEl) return;
    
    const code = inputEl.value.trim().toUpperCase();
    if (!code) {
        msgEl.textContent = 'Por favor ingresa un código.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        return;
    }
    
    const coupons = window.storeProducerConfig?.coupons || [];
    const foundCoupon = coupons.find(c => c.code === code);
    
    if (foundCoupon) {
        window.checkoutDiscountPercent = foundCoupon.discount;
        window.checkoutAppliedCoupon = code;
        msgEl.innerHTML = `✅ Cupón aplicado: <strong>-${foundCoupon.discount}% de descuento</strong>`;
        msgEl.style.color = '#10b981';
        msgEl.style.display = 'block';
        
        // Update Prices
        const price = window.getCheckoutPrice();
        const priceStr = '$' + price.toFixed(2) + ' USD';
        
        const deunaTotal = document.getElementById('deuna-total-price');
        const transferTotal = document.getElementById('transfer-total-price');
        if (deunaTotal) deunaTotal.textContent = priceStr;
        if (transferTotal) transferTotal.textContent = priceStr;
        
        // Re-render PayPal button with new price
        const activeTab = getSelectedStorePaymentMethod();
        if (activeTab === 'paypal') {
            const clientId = window.storeProducerConfig.paypalClientId || "";
            if (clientId) {
                renderStorePayPalButton(clientId);
            }
        }
    } else {
        window.checkoutDiscountPercent = 0;
        window.checkoutAppliedCoupon = null;
        msgEl.textContent = '❌ Cupón inválido o expirado.';
        msgEl.style.color = '#ef4444';
        msgEl.style.display = 'block';
        
        // Reset Prices
        const price = window.getCheckoutPrice();
        const priceStr = '$' + price.toFixed(2) + ' USD';
        const deunaTotal = document.getElementById('deuna-total-price');
        const transferTotal = document.getElementById('transfer-total-price');
        if (deunaTotal) deunaTotal.textContent = priceStr;
        if (transferTotal) transferTotal.textContent = priceStr;
    }
}

export function updateExclusivePrice(val) {
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
}

export function openBeatCheckoutModal(beatId) {
    console.log("🚀 openBeatCheckoutModal called with ID:", beatId);
    setupStoreCheckout();
    checkoutSelectedBeatId = beatId;
    checkoutSelectedLicense = 'basic';
    checkoutCurrentStep = 1;
    storePaymentReceiptBase64 = null;
    window.checkoutExclusivePrice = 500; // Reset de precio exclusivo

    // Reset fields
    document.getElementById('store-buyer-name').value = '';
    document.getElementById('store-buyer-email').value = '';
    document.getElementById('store-buyer-phone').value = '';
    document.getElementById('store-buyer-dni').value = '';
    document.getElementById('store-buyer-city').value = '';
    document.getElementById('store-buyer-country').value = 'Ecuador';

    document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
    document.getElementById('store-receipt-file').value = '';

    const singleView = document.getElementById('checkout-single-beat-view');
    const multiView = document.getElementById('checkout-multi-beat-view');

    if (beatId) {
        // Modo compra individual / Selección de licencia
        singleView.style.display = 'block';
        multiView.style.display = 'none';

        // Urgencia / Social Proof
        const urgencyBanner = document.getElementById('checkout-urgency-banner');
        const urgencyText = document.getElementById('checkout-urgency-text');
        if (urgencyBanner && urgencyText) {
            const viewers = Math.floor(Math.random() * 6) + 2; // entre 2 y 7
            urgencyText.textContent = `${viewers} personas están viendo este beat ahora mismo`;
            urgencyBanner.style.display = 'flex';
        }

        // Mostrar y poblar previsualización del beat individual
        const beat = findBeatById(beatId);
        const previewContainer = document.getElementById('checkout-single-beat-preview');
        if (previewContainer && beat) {
            previewContainer.style.display = 'flex';
            const imgEl = document.getElementById('checkout-single-beat-img');
            const nameEl = document.getElementById('checkout-single-beat-name');
            const metaEl = document.getElementById('checkout-single-beat-meta');
            
            if (imgEl) imgEl.src = window.getBeatArtwork(beat);
            if (nameEl) nameEl.textContent = beat.name;
            
            let details = [];
            if (beat.bpm) details.push(`${beat.bpm} BPM`);
            if (beat.key) details.push(beat.key);
            if (beat.genre) details.push(beat.genre);
            if (metaEl) metaEl.textContent = details.join(' • ') || 'Beat';
        } else if (previewContainer) {
            previewContainer.style.display = 'none';
        }

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

        // Reset total prices based on basic license
        const priceStr = '$' + LICENSE_CONFIGS.basic.price.toFixed(2) + ' USD';
        document.getElementById('deuna-total-price').textContent = priceStr;
        document.getElementById('transfer-total-price').textContent = priceStr;
    } else {
        // Modo Carrito
        if (window.cart.length === 0) {
            if (typeof window.showToast === 'function') window.showToast("Tu carrito está vacío.", true);
            return;
        }
        singleView.style.display = 'none';
        multiView.style.display = 'block';
        window.renderCartItems();
    }

    if (window.lucide) window.lucide.createIcons();

    updateCheckoutStepView(1);
    document.getElementById('beat-checkout-modal').style.display = 'flex';
}

export function selectCheckoutLicense(licenseKey) {
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
}

export function updateCheckoutStepView(step) {
    checkoutCurrentStep = step;

    // 1. Actualizar indicadores de pasos
    document.querySelectorAll('.checkout-step-indicator').forEach(el => {
        const s = parseInt(el.getAttribute('data-step'), 10);
        if (s <= step) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });

    // 2. Actualizar barra de progreso
    const progressPercent = step === 1 ? 0 : (step === 2 ? 50 : 100);
    const stepProgress = document.getElementById('checkout-step-progress');
    if (stepProgress) {
        stepProgress.style.width = progressPercent + '%';
    }

    // 3. Mostrar/ocultar paneles de pasos
    const panel1 = document.getElementById('checkout-panel-1');
    const panel2 = document.getElementById('checkout-panel-2');
    const panel3 = document.getElementById('checkout-panel-3');
    if (panel1) panel1.style.display = step === 1 ? 'block' : 'none';
    if (panel2) panel2.style.display = step === 2 ? 'block' : 'none';
    if (panel3) panel3.style.display = step === 3 ? 'block' : 'none';

    // 4. Configurar visibilidad y textos de botones del footer
    const footerPrevBtn = document.getElementById('btn-checkout-prev');
    const footerCancelBtn = document.getElementById('btn-checkout-cancel');
    const footerNextBtn = document.getElementById('btn-checkout-next');

    if (footerPrevBtn && footerCancelBtn && footerNextBtn) {
        if (step === 1) {
            // En el Paso 1 (selección de licencia/carrito), los botones están dentro del panel del paso, no en el footer.
            footerPrevBtn.style.display = 'none';
            footerCancelBtn.style.display = 'none';
            footerNextBtn.style.display = 'none';
        } else if (step === 2) {
            // Paso 2 (formulario de facturación): Botón "Atrás" y "Continuar" en el footer
            footerPrevBtn.style.display = 'block';
            footerCancelBtn.style.display = 'none';
            footerNextBtn.style.display = 'block';
            footerNextBtn.textContent = 'Continuar';
        } else if (step === 3) {
            // Paso 3 (pago): Botón "Atrás" siempre visible. "Confirmar Compra" se gestiona según el método.
            footerPrevBtn.style.display = 'block';
            footerCancelBtn.style.display = 'none';
            
            // Cargar datos del productor para pasarelas
            const deunaTab = document.getElementById('btn-pay-deuna');
            const transferTab = document.getElementById('btn-pay-transfer');
            const paypalTab = document.getElementById('btn-pay-paypal');
            const offerTab = document.getElementById('btn-pay-offer');
            
            if (offerTab) {
                offerTab.style.display = (checkoutSelectedBeatId && checkoutSelectedLicense === 'exclusive') ? 'block' : 'none';
            }

            const deunaPhone = window.storeProducerConfig.deunaPhone || "";
            const deunaName = window.storeProducerConfig.deunaName || "";
            const pichinchaAcc = window.storeProducerConfig.bankPichinchaAcc || "";
            const guayaquilAcc = window.storeProducerConfig.bankGuayaquilAcc || "";
            const paypalClientId = window.storeProducerConfig.paypalClientId || "";
            const paypalEmail = window.storeProducerConfig.paypalEmail || "";
            const payphonePhone = window.storeProducerConfig.payphonePhone || "";
            const payphoneClientId = window.storeProducerConfig.payphoneClientId || "";
            const payphoneAppId = window.storeProducerConfig.payphoneAppId || "";

            let deunaVisible = false;
            let transferVisible = false;
            let paypalVisible = false;
            let payphoneVisible = false;

            if (deunaPhone && deunaTab) {
                deunaTab.style.display = 'block';
                const cleanPhone = deunaPhone.replace(/\D/g, '');
                const deunaDeeplink = `deuna://payment?phone=${cleanPhone}`;
                const deunaWhatsapp = `https://wa.me/${cleanPhone}`;
                
                const deunaPhoneEl = document.getElementById('deuna-info-phone');
                if (deunaPhoneEl) {
                    deunaPhoneEl.innerHTML = `
                        Celular: <strong style="font-size: 18px; letter-spacing: 1px;">${deunaPhone}</strong>
                        <button onclick="navigator.clipboard.writeText('${deunaPhone}').then(()=>window.showToast('¡Número copiado!'))" style="background: rgba(255,255,255,0.08); border: none; border-radius: 6px; color: #8a91a6; cursor: pointer; padding: 4px 8px; font-size: 11px; margin-left: 8px; vertical-align: middle;">📋 Copiar</button>
                    `;
                }
                
                const deunaNameEl = document.getElementById('deuna-info-name');
                if (deunaNameEl) {
                    deunaNameEl.innerHTML = `
                        Titular: <span style="color: #fff; font-weight: 600;">${deunaName}</span>
                        <a href="${deunaDeeplink}" style="margin-left: 12px; background: linear-gradient(135deg, #ff6b35, #ff9500); color: #fff; font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 8px; text-decoration: none; display: inline-block; vertical-align: middle;" onclick="setTimeout(()=>window.open('${deunaWhatsapp}', '_blank'), 800)">⚡ Abrir Deuna!</a>
                    `;
                }
                deunaVisible = true;
            } else if (deunaTab) {
                deunaTab.style.display = 'none';
            }

            function makeCopyBtn(text, label) {
                return `<button onclick="navigator.clipboard.writeText('${text}').then(()=>window.showToast('¡${label} copiado!'))" style="background: rgba(255,255,255,0.08); border: none; border-radius: 6px; color: #8a91a6; cursor: pointer; padding: 3px 8px; font-size: 11px; margin-left: 6px;">📋</button>`;
            }

            const pichinchaCard = document.getElementById('store-bank-pichincha-card');
            if (pichinchaAcc && pichinchaCard) {
                pichinchaCard.style.display = 'block';
                const pichName = window.storeProducerConfig.bankPichinchaName || "";
                const pichDni = window.storeProducerConfig.bankPichinchaDni || "";
                const pichType = window.storeProducerConfig.bankPichinchaType || "Ahorros";
                pichinchaCard.innerHTML = `
                    <div style="font-weight: 700; font-size: 12px; color: #f59e0b; margin-bottom: 8px;">🏦 BANCO PICHINCHA</div>
                    <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta (${pichType}): <strong id="pichincha-info-acc">${pichinchaAcc}</strong> ${makeCopyBtn(pichinchaAcc, 'Cuenta')}</div>
                    <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="pichincha-info-name">${pichName}</span> ${makeCopyBtn(pichName, 'Titular')}</div>
                    <div style="font-size: 12px; color: #8a91a6;">CI/RUC: <span id="pichincha-info-dni">${pichDni}</span> ${makeCopyBtn(pichDni, 'CI/RUC')}</div>
                `;
                transferVisible = true;
            } else if (pichinchaCard) {
                pichinchaCard.style.display = 'none';
            }

            const guayaquilCard = document.getElementById('store-bank-guayaquil-card');
            if (guayaquilAcc && guayaquilCard) {
                guayaquilCard.style.display = 'block';
                const guayName = window.storeProducerConfig.bankGuayaquilName || "";
                const guayDni = window.storeProducerConfig.bankGuayaquilDni || "";
                const guayType = window.storeProducerConfig.bankGuayaquilType || "Corriente";
                guayaquilCard.innerHTML = `
                    <div style="font-weight: 700; font-size: 12px; color: #ec4899; margin-bottom: 8px;">🏦 BANCO GUAYAQUIL</div>
                    <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta (${guayType}): <strong id="guayaquil-info-acc">${guayaquilAcc}</strong> ${makeCopyBtn(guayaquilAcc, 'Cuenta')}</div>
                    <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="guayaquil-info-name">${guayName}</span> ${makeCopyBtn(guayName, 'Titular')}</div>
                    <div style="font-size: 12px; color: #8a91a6;">CI/RUC: <span id="guayaquil-info-dni">${guayDni}</span> ${makeCopyBtn(guayDni, 'CI/RUC')}</div>
                `;
                transferVisible = true;
            } else if (guayaquilCard) {
                guayaquilCard.style.display = 'none';
            }

            if (transferTab) {
                transferTab.style.display = transferVisible ? 'block' : 'none';
            }

            if ((paypalClientId || paypalEmail) && paypalTab) {
                paypalTab.style.display = 'block';
                paypalVisible = true;
            } else if (paypalTab) {
                paypalTab.style.display = 'none';
            }

            const payphoneTab = document.getElementById('btn-pay-payphone');
            if (payphoneTab) {
                payphoneTab.style.display = 'block';
                payphoneVisible = true;
            }

            if (!deunaVisible && !transferVisible && !paypalVisible && !payphoneVisible && checkoutSelectedLicense !== 'exclusive') {
                const deunaPanel = document.getElementById('store-pay-deuna');
                const transferPanel = document.getElementById('store-pay-transfer');
                const paypalPanel = document.getElementById('store-pay-paypal');
                if (deunaPanel) deunaPanel.style.display = 'none';
                if (transferPanel) transferPanel.style.display = 'none';
                if (paypalPanel) {
                    paypalPanel.style.display = 'block';
                    paypalPanel.innerHTML = `
                        <div style="color: #ef4444; font-size: 13px; text-align: center; padding: 20px;">
                            El productor no ha configurado ningún método de pago. Por favor, contáctalo directamente.
                        </div>
                    `;
                }
                const receiptSec = document.getElementById('store-receipt-upload-section');
                if (receiptSec) receiptSec.style.display = 'none';
                footerNextBtn.style.display = 'none';
            } else {
                let defaultTab = 'payphone';
                const currentTab = getSelectedStorePaymentMethod();
                
                if (currentTab === 'offer' && checkoutSelectedLicense !== 'exclusive') {
                    if (payphoneVisible) defaultTab = 'payphone';
                    else if (paypalVisible) defaultTab = 'paypal';
                    else if (deunaVisible) defaultTab = 'deuna';
                    else if (transferVisible) defaultTab = 'transfer';
                } else if (currentTab === 'offer' && checkoutSelectedLicense === 'exclusive') {
                    defaultTab = 'offer';
                } else if (payphoneVisible) {
                    defaultTab = 'payphone';
                } else if (paypalVisible) {
                    defaultTab = 'paypal';
                } else if (deunaVisible) {
                    defaultTab = 'deuna';
                } else if (transferVisible) {
                    defaultTab = 'transfer';
                } else if (checkoutSelectedLicense === 'exclusive') {
                    defaultTab = 'offer';
                }
                window.switchStorePaymentMethod(defaultTab);
            }
        }
    }
}

export function switchStorePaymentMethod(method) {
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
    const payphonePanel = document.getElementById('store-pay-payphone');
    if (payphonePanel) payphonePanel.style.display = method === 'payphone' ? 'block' : 'none';
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
    } else if (method === 'payphone') {
        receiptSection.style.display = 'none';
        nextBtn.style.display = 'none';
        const payphoneButtonContainer = document.getElementById('payphone-button');
        if (payphoneButtonContainer) {
            payphoneButtonContainer.innerHTML = '<div style="color: #8a91a6; font-size: 13px; text-align: center;">Cargando PayPhone...</div>';
        }
        loadStorePayphoneSDK(() => {
            renderStorePayphoneButton();
        });
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
}

export function loadStorePayphoneSDK(callback) {
    const existingScript = document.getElementById('store-payphone-sdk-script');
    if (existingScript) {
        callback();
        return;
    }
    const sdk = document.createElement('script');
    sdk.id = 'store-payphone-sdk-script';
    sdk.src = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.js';
    sdk.onload = callback;
    document.head.appendChild(sdk);
}

export function renderStorePayphoneButton() {
    const container = document.getElementById('payphone-button');
    if (!container) return;
    container.innerHTML = '';
    
    const price = window.getCheckoutPrice();
    const priceCents = Math.round(price * 100);
    
    const token = window.storeProducerConfig.payphoneClientId || "";
    const appId = window.storeProducerConfig.payphoneAppId || "";
    
    if (!token || !appId) {
        container.innerHTML = `
            <div style="background: rgba(255, 255, 255, 0.03); border: 1px dashed rgba(255, 255, 255, 0.15); border-radius: 12px; padding: 20px; text-align: center; box-sizing: border-box; margin-top: 8px;">
                <div style="font-weight: 700; font-size: 14px; color: #f97316; margin-bottom: 12px; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <span>📲 PayPhone (Ecuador)</span>
                </div>
                <p style="color: #8a91a6; font-size: 12px; line-height: 1.5; margin: 0 0 16px 0;">
                    Esta pasarela permite cobrar con tarjetas y la app PayPhone. Configura tu ClientID y AppID en el panel de administración de tu perfil para recibir pagos reales.
                </p>
                <div onclick="window.showToast('ℹ️ Vista previa de PayPhone. Configura tus credenciales para habilitar cobros reales.')" style="background: linear-gradient(135deg, #ff6b35, #ff9500); color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.2); transition: transform 0.2s ease; width: 100%; max-width: 280px; margin: 0 auto;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <span>Pagar con</span>
                    <span style="font-weight: 900; font-size: 17px; letter-spacing: -0.5px;">payphone</span>
                </div>
                <div style="font-size: 10px; color: #8a91a6; margin-top: 10px;">
                    ⚠️ Vista Previa de Integración
                </div>
            </div>
        `;
        return;
    }
    
    const clientTxId = 'PAYPHONE-' + Date.now();
    
    const buyerName = document.getElementById('store-buyer-name').value.trim();
    const buyerEmail = document.getElementById('store-buyer-email').value.trim();
    const buyerPhone = document.getElementById('store-buyer-phone').value.trim();
    const buyerDni = document.getElementById('store-buyer-dni').value.trim();
    const buyerCity = document.getElementById('store-buyer-city').value.trim();
    const buyerCountry = document.getElementById('store-buyer-country').value.trim();
    
    if (!buyerName || !buyerEmail) {
        container.innerHTML = '<div style="color: #f59e0b; font-size: 13px; text-align: center;">Por favor completa tu nombre y correo en el Paso anterior.</div>';
        return;
    }
    
    let itemsToProcess = [];
    if (checkoutSelectedBeatId) {
        const beat = findBeatById(checkoutSelectedBeatId);
        if (beat) {
            itemsToProcess.push({
                beatId: checkoutSelectedBeatId,
                beatName: beat.name,
                licenseType: checkoutSelectedLicense,
                price: price
            });
        }
    } else {
        itemsToProcess = window.cart.map(item => ({
            beatId: item.beatId,
            beatName: item.beatName,
            licenseType: item.licenseType,
            price: item.price
        }));
    }
    
    const state = {
        buyerName,
        buyerEmail,
        buyerPhone,
        buyerDni,
        buyerCity,
        buyerCountry,
        items: itemsToProcess,
        discountPercent: window.checkoutDiscountPercent || 0,
        couponCode: window.checkoutAppliedCoupon || '',
        producerId: window.storeProducerUid,
        producerToken: token
    };
    
    localStorage.setItem('payphone_pending_' + clientTxId, JSON.stringify(state));
    
    try {
        const ppb = new PPaymentButtonBox({
            token: token,
            clientTransactionId: clientTxId,
            amount: priceCents,
            amountWithoutTax: priceCents,
            amountWithTax: 0,
            tax: 0,
            service: 0,
            tip: 0,
            storeId: appId,
            reference: 'Compra de Beats',
            email: buyerEmail,
            documentId: buyerDni || '9999999999',
            phoneNumber: buyerPhone || '0999999999'
        });
        
        ppb.render('#payphone-button');
    } catch (err) {
        console.error('Error initializing PayPhone button:', err);
        container.innerHTML = '<div style="color: #ef4444; font-size: 13px;">Error al inicializar PayPhone.</div>';
    }
}

export function getSelectedStorePaymentMethod() {
    const activeTab = document.querySelector('.pay-tab-btn.active');
    if (!activeTab) return 'transfer';
    return activeTab.id.replace('btn-pay-', '');
}

export async function submitExclusiveOffer() {
    const beat = findBeatById(checkoutSelectedBeatId);
    const buyerName = document.getElementById('store-buyer-name').value.trim();
    const buyerEmail = document.getElementById('store-buyer-email').value.trim();
    const buyerPhone = document.getElementById('store-buyer-phone').value.trim();
    const buyerDni = document.getElementById('store-buyer-dni').value.trim();
    const buyerCity = document.getElementById('store-buyer-city').value.trim();
    const buyerCountry = document.getElementById('store-buyer-country').value.trim();
    const offerPrice = parseFloat(document.getElementById('offer-price-input').value);
    const offerMessage = document.getElementById('offer-message-input').value.trim();

    if (!buyerName || !buyerEmail) {
        if (typeof window.showToast === 'function') window.showToast('Por favor completa tu Nombre y Correo Electrónico.', true);
        updateCheckoutStepView(2);
        return;
    }
    if (!offerPrice || offerPrice < 250) {
        if (typeof window.showToast === 'function') window.showToast('El monto mínimo para ofertas es de $250 USD.', true);
        return;
    }

    const originalPrice = LICENSE_CONFIGS.exclusive ? LICENSE_CONFIGS.exclusive.price : 500;

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
                city: "Oferta",
                country: buyerCountry || "",
                updatedAt: Date.now(),
                source: 'exclusive_offer'
            });
        } catch (ce) { console.warn('No se pudo guardar contacto de oferta:', ce); }

        if (typeof window.showToast === 'function') window.showToast('✅ ¡Oferta enviada! El productor la revisará y te contactará pronto.');
        document.getElementById('beat-checkout-modal').style.display = 'none';
        nextBtn.disabled = false;
        nextBtn.innerHTML = originalText;
    } catch (e) {
        console.error("Error al enviar oferta:", e);
        if (typeof window.showToast === 'function') window.showToast("Error al enviar oferta: " + e.message, true);
        const nextBtn = document.getElementById('btn-checkout-next');
        nextBtn.disabled = false;
        nextBtn.innerHTML = '📩 Enviar Oferta';
    }
}

export function openFreeDownloadModal(beatId) {
    const beat = findBeatById(beatId);
    if (!beat) return;

    document.getElementById('free-download-beat-id').value = beatId;
    document.getElementById('free-buyer-name').value = '';
    document.getElementById('free-buyer-email').value = '';
    document.getElementById('free-buyer-phone').value = '';
    
    document.getElementById('free-download-modal').style.display = 'flex';
}

export async function submitFreeDownloadLead() {
    const beatId = document.getElementById('free-download-beat-id').value;
    const beat = findBeatById(beatId);
    if (!beat) return;

    const buyerName = document.getElementById('free-buyer-name').value.trim();
    const buyerEmail = document.getElementById('free-buyer-email').value.trim();
    const buyerPhone = document.getElementById('free-buyer-phone').value.trim();

    if (!buyerName || !buyerEmail) {
        if (typeof window.showToast === 'function') window.showToast('Por favor escribe tu Nombre y Correo', true);
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

        if (typeof window.showToast === 'function') window.showToast('¡Descarga iniciada! Te has registrado en el boletín del productor.');
    } catch (e) {
        console.error("Error al registrar lead de descarga:", e);
        if (typeof window.showToast === 'function') window.showToast('Error al iniciar la descarga: ' + e.message, true);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

export function getProducerAvatar(config) {
    if (!config || Object.keys(config).length === 0) return null;
    if (config.logoBase64 && config.logoBase64.trim() !== '') {
        return config.logoBase64.trim().replace(/^["']|["']$/g, '').trim();
    }
    const name = (config.aka || config.name || '').toLowerCase();
    if (name.includes('sossa')) {
        return '/producer_sossa.png';
    }
    if (name.includes('monarco')) {
        return '/producer_monarco.jpg';
    }
    
    // Generar avatar SVG con iniciales para otros productores
    const displayName = config.aka || config.name || 'Productor';
    const initials = displayName.split(/\s+/).map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'PR';
    const storeColor = config.brandColor || '#00ccff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" style="background:transparent;"><circle cx="50" cy="50" r="46" fill="none" stroke="${storeColor}" stroke-width="1.5" opacity="0.3"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="bold" letter-spacing="1">${initials}</text></svg>`;
    try {
        const base64 = btoa(unescape(encodeURIComponent(svg)));
        return `data:image/svg+xml;base64,${base64}`;
    } catch (e) {
        console.error("Error generating initials avatar:", e);
        return null;
    }
}

export function getDefaultBeatArtwork() {
    const accentColor = document.documentElement.style.getPropertyValue('--accent') || '#00ccff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100" style="background:#11121a;"><circle cx="50" cy="50" r="38" fill="none" stroke="${accentColor}" stroke-width="2" stroke-dasharray="4 4" opacity="0.2"/><path d="M42 65V35l26-4v30" fill="none" stroke="${accentColor}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="35" cy="65" r="7" fill="${accentColor}"/><circle cx="61" cy="61" r="7" fill="${accentColor}"/></svg>`;
    const base64 = btoa(unescape(encodeURIComponent(svg)));
    return `data:image/svg+xml;base64,${base64}`;
}

export function getBeatArtwork(beat) {
    if (!beat) return '';
    
    let config = null;
    
    // Check if the beat has its own producerConfig
    if (beat.producerConfig && Object.keys(beat.producerConfig).length > 0) {
        config = beat.producerConfig;
    }
    
    // If not, see if we can match the beat's producer name with window.storeProducerConfig
    if (!config && window.storeProducerConfig && Object.keys(window.storeProducerConfig).length > 0) {
        const beatProducer = (beat.producerName || beat.producerAka || '').toLowerCase();
        const storeProducerAka = (window.storeProducerConfig.aka || '').toLowerCase();
        const storeProducerName = (window.storeProducerConfig.name || '').toLowerCase();
        
        if (beatProducer === '' || beatProducer === storeProducerAka || beatProducer === storeProducerName) {
            config = window.storeProducerConfig;
        }
    }
    
    // Fallback to other configs if still not set
    if (!config && window.producerConfig && Object.keys(window.producerConfig).length > 0) {
        config = window.producerConfig;
    } else if (!config && typeof producerConfig !== 'undefined' && producerConfig && Object.keys(producerConfig).length > 0) {
        config = producerConfig;
    }

    if (config && config.defaultBeatArtwork && config.defaultBeatArtwork.trim() !== '') {
        return config.defaultBeatArtwork.trim();
    }
    
    let art = (beat.artwork || '').trim();
    art = art.replace(/^["']|["']$/g, '').trim();
    
    const lowerArt = art.toLowerCase();
    if (art !== '' && lowerArt !== 'null' && lowerArt !== 'undefined' && lowerArt !== 'none' && !lowerArt.includes('placeholder')) {
        return art;
    }
    
    let producerLogo = null;
    if (window.getProducerAvatar) {
        producerLogo = window.getProducerAvatar(config);
    } else if (config && config.logoBase64) {
        producerLogo = config.logoBase64;
    }
    
    if (producerLogo) {
        producerLogo = producerLogo.trim().replace(/^["']|["']$/g, '').trim();
        const lowerLogo = producerLogo.toLowerCase();
        if (producerLogo !== '' && lowerLogo !== 'null' && lowerLogo !== 'undefined' && lowerLogo !== 'none') {
            return producerLogo;
        }
    }
    
    if (window.getDefaultBeatArtwork) {
        return window.getDefaultBeatArtwork();
    }
    return '';
}

export function setupStoreCheckout() {
    if (window._storeCheckoutConfigured) return;
    window._storeCheckoutConfigured = true;

    window.closeBeatCheckoutModal = function() {
        const modal = document.getElementById('beat-checkout-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };

    const cancelBtn = document.getElementById('btn-checkout-cancel');
    const prevBtn = document.getElementById('btn-checkout-prev');
    const nextBtn = document.getElementById('btn-checkout-next');
    const closeBtn = document.getElementById('btn-close-checkout-modal');
    
    // File upload
    const uploadReceiptBtn = document.getElementById('btn-store-upload-receipt');
    const receiptFileInput = document.getElementById('store-receipt-file');
    
    if (closeBtn) closeBtn.addEventListener('click', () => {
        window.closeBeatCheckoutModal();
    });
    
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        window.closeBeatCheckoutModal();
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (checkoutCurrentStep > 1) {
            updateCheckoutStepView(checkoutCurrentStep - 1);
        }
    });

    if (nextBtn) nextBtn.addEventListener('click', async () => {
        if (checkoutCurrentStep === 1) {
            updateCheckoutStepView(2);
        } else if (checkoutCurrentStep === 2) {
            const buyerName = document.getElementById('store-buyer-name').value.trim();
            const buyerEmail = document.getElementById('store-buyer-email').value.trim();
            if (!buyerName || !buyerEmail) {
                if (typeof window.showToast === 'function') window.showToast('Por favor escribe tu Nombre y Correo Electrónico.', true);
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

    const cartAddBtn = document.getElementById('btn-checkout-add-to-cart');
    if (cartAddBtn) cartAddBtn.addEventListener('click', () => {
        console.log("🛒 click: btn-checkout-add-to-cart. ID:", checkoutSelectedBeatId);
        const beat = findBeatById(checkoutSelectedBeatId);
        if (!beat) {
            console.warn("  Cannot add to cart: Beat not found for ID:", checkoutSelectedBeatId);
            return;
        }
        const price = window.getCheckoutPrice();
        const producerId = window.storeProducerUid;
        const producerName = window.storeProducerConfig.aka || window.storeProducerConfig.name || 'Productor';
        const artwork = window.getBeatArtwork(beat) || '';

        // Exclusiva validar precio mínimo
        if (checkoutSelectedLicense === 'exclusive' && (isNaN(price) || price < 250)) {
            if (typeof window.showToast === 'function') window.showToast('El monto mínimo para la licencia Exclusiva es de $250 USD.', true);
            return;
        }

        const added = window.addToCart(checkoutSelectedBeatId, checkoutSelectedLicense, price, beat.name, producerId, producerName, artwork);
        if (added) {
            document.getElementById('beat-checkout-modal').style.display = 'none';
        }
    });

    const buyNowBtn = document.getElementById('btn-checkout-buy-now');
    if (buyNowBtn) buyNowBtn.addEventListener('click', () => {
        console.log("⚡ click: btn-checkout-buy-now. ID:", checkoutSelectedBeatId);
        const beat = findBeatById(checkoutSelectedBeatId);
        if (!beat) {
            console.warn("  Cannot buy now: Beat not found for ID:", checkoutSelectedBeatId);
            return;
        }
        const price = window.getCheckoutPrice();
        const producerId = window.storeProducerUid;
        const producerName = window.storeProducerConfig.aka || window.storeProducerConfig.name || 'Productor';
        const artwork = window.getBeatArtwork(beat) || '';

        // Exclusiva validar precio mínimo
        if (checkoutSelectedLicense === 'exclusive' && (isNaN(price) || price < 250)) {
            if (typeof window.showToast === 'function') window.showToast('El monto mínimo para la licencia Exclusiva es de $250 USD.', true);
            return;
        }

        window.cart = [{
            beatId: checkoutSelectedBeatId,
            licenseType: checkoutSelectedLicense,
            price: price,
            beatName: beat.name,
            producerId: producerId,
            producerName: producerName,
            artwork: artwork
        }];
        saveCartToStorage();
        window.updateCartUI();
        updateCheckoutStepView(2);
    });

    const keepShoppingBtn = document.getElementById('btn-checkout-keep-shopping');
    if (keepShoppingBtn) keepShoppingBtn.addEventListener('click', () => {
        document.getElementById('beat-checkout-modal').style.display = 'none';
    });

    const proceedBillingBtn = document.getElementById('btn-checkout-proceed-billing');
    if (proceedBillingBtn) proceedBillingBtn.addEventListener('click', () => {
        if (window.cart.length === 0) {
            if (typeof window.showToast === 'function') window.showToast("Tu carrito está vacío.", true);
            return;
        }
        updateCheckoutStepView(2);
    });

    document.getElementById('floating-cart-btn')?.addEventListener('click', () => {
        window.openBeatCheckoutModal(null);
    });

    if (uploadReceiptBtn) uploadReceiptBtn.addEventListener('click', () => {
        receiptFileInput.click();
    });

    if (receiptFileInput) receiptFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) {
            document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
            storePaymentReceiptBase64 = null;
            return;
        }
        
        document.getElementById('store-receipt-file-name').textContent = file.name;
        
        const reader = new FileReader();
        reader.onload = function(evt) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                const maxDim = 800;
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
                
                // Comprimir como JPEG con calidad 0.85
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                storePaymentReceiptBase64 = compressedBase64;
            };
            img.src = evt.target.result;
        };
        reader.readAsDataURL(file);
    });
}

export function loadStorePayPalSDK(clientId, callback) {
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

export function renderStorePayPalButton(clientId) {
    const container = document.getElementById('store-paypal-button-container');
    container.innerHTML = '';
    
    const price = window.getCheckoutPrice();
    let description = '';
    
    if (checkoutSelectedBeatId) {
        const beat = findBeatById(checkoutSelectedBeatId);
        description = `Licencia ${checkoutSelectedLicense.toUpperCase()} - Beat: ${beat ? beat.name : 'Desconocido'}`;
    } else {
        description = `Licencias de Beats: ${window.cart.map(item => `${item.beatName} (${item.licenseType.toUpperCase()})`).join(', ')}`;
    }
    
    if (window.paypal) {
        window.paypal.Buttons({
            createOrder: function(data, actions) {
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            currency_code: 'USD',
                            value: price.toFixed(2)
                        },
                        description: description.substring(0, 127)
                    }]
                });
            },
            onApprove: async function(data, actions) {
                return actions.order.capture().then(async function(details) {
                    console.log('PayPal transaction completed:', details);
                    if (typeof window.showToast === 'function') window.showToast('Pago aprobado por PayPal. Procesando entrega...');
                    
                    const buyerName = document.getElementById('store-buyer-name').value.trim();
                    const buyerEmail = document.getElementById('store-buyer-email').value.trim();
                    const buyerPhone = document.getElementById('store-buyer-phone').value.trim();
                    const buyerDni = document.getElementById('store-buyer-dni').value.trim();
                    const buyerCity = document.getElementById('store-buyer-city').value.trim();
                    const buyerCountry = document.getElementById('store-buyer-country').value.trim();
                    
                    let itemsToProcess = [];
                    if (checkoutSelectedBeatId) {
                        const beat = findBeatById(checkoutSelectedBeatId);
                        itemsToProcess.push({
                            beatId: checkoutSelectedBeatId,
                            beatName: beat ? beat.name : 'Desconocido',
                            licenseType: checkoutSelectedLicense,
                            price: window.getCheckoutPrice()
                        });
                    } else {
                        itemsToProcess = window.cart.map(item => ({
                            beatId: item.beatId,
                            beatName: item.beatName,
                            licenseType: item.licenseType,
                            price: item.price
                        }));
                    }
                    
                    const payload = {
                        orderId: details.id,
                        producerId: window.storeProducerUid,
                        buyerName,
                        buyerEmail,
                        buyerPhone,
                        buyerDni,
                        buyerCity,
                        buyerCountry,
                        items: itemsToProcess,
                        discountPercent: window.checkoutDiscountPercent || 0,
                        couponCode: window.checkoutAppliedCoupon || ''
                    };
                    
                    try {
                        const response = await fetch('/api/confirm-purchase', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify(payload)
                        });
                        
                        const result = await response.json();
                        if (response.ok && result.success) {
                            if (typeof window.showToast === 'function') window.showToast('¡Pago verificado y licencias enviadas con éxito!');
                            
                            // Vaciar el carrito
                            window.cart = [];
                            saveCartToStorage();
                            window.updateCartUI();
                            
                            document.getElementById('beat-checkout-modal').style.display = 'none';
                        } else {
                            throw new Error(result.error || 'Error al verificar el pago en el servidor');
                        }
                    } catch (e) {
                        console.error("Fallo al verificar compra:", e);
                        if (typeof window.showToast === 'function') window.showToast("Fallo al entregar tus beats. Tu pago fue procesado. Por favor, contacta al productor: " + e.message, true);
                    }
                });
            },
            onError: function(err) {
                console.error('PayPal store error:', err);
                if (typeof window.showToast === 'function') window.showToast('Error en el pago de PayPal.', true);
            }
        }).render('#store-paypal-button-container');
    }
}

export async function submitBeatPurchasePayment(method, reference = '') {
    const buyerName = document.getElementById('store-buyer-name').value.trim();
    const buyerEmail = document.getElementById('store-buyer-email').value.trim();
    const buyerPhone = document.getElementById('store-buyer-phone').value.trim();
    const buyerDni = document.getElementById('store-buyer-dni').value.trim();
    const buyerCity = document.getElementById('store-buyer-city').value.trim();
    const buyerCountry = document.getElementById('store-buyer-country').value.trim();

    if (!buyerName || !buyerEmail) {
        if (typeof window.showToast === 'function') window.showToast('Por favor completa todos los campos del formulario.', true);
        updateCheckoutStepView(2);
        return;
    }

    if (method !== 'paypal' && !storePaymentReceiptBase64) {
        if (typeof window.showToast === 'function') window.showToast('Por favor sube la captura de tu comprobante de pago.', true);
        return;
    }

    // Identificar los items a comprar
    let itemsToProcess = [];
    if (checkoutSelectedBeatId) {
        const beat = findBeatById(checkoutSelectedBeatId);
        if (!beat) return;
        itemsToProcess.push({
            beatId: checkoutSelectedBeatId,
            beatName: beat.name,
            licenseType: checkoutSelectedLicense,
            price: window.getCheckoutPrice()
        });
    } else {
        itemsToProcess = window.cart.map(item => ({
            beatId: item.beatId,
            beatName: item.beatName,
            licenseType: item.licenseType,
            price: item.price
        }));
    }

    if (itemsToProcess.length === 0) {
        if (typeof window.showToast === 'function') window.showToast("No hay beats en tu pedido.", true);
        return;
    }

    const discountPercent = window.checkoutDiscountPercent || 0;
    const discountCode = window.checkoutAppliedCoupon || '';

    const nextBtn = document.getElementById('btn-checkout-next');
    const originalText = nextBtn ? nextBtn.innerHTML : 'Confirmar Compra';
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = '⏳ Guardando pedido...';
    }

    const transactionId = reference || ('TXN-' + Date.now());
    const colRef = collection(db, "payments");

    try {
        let finalReceiptUrl = '';
        if (method !== 'paypal' && storePaymentReceiptBase64) {
            if (nextBtn) nextBtn.innerHTML = '⏳ Subiendo comprobante...';
            
            if (typeof window.dataURLtoBlob !== 'function' || typeof window.uploadFileToStorage !== 'function') {
                throw new Error("Helpers de subida de archivos no disponibles.");
            }
            const blob = await window.dataURLtoBlob(storePaymentReceiptBase64);
            const storagePath = `receipts/beats/${window.storeProducerUid || 'default'}_${Date.now()}.jpg`;
            finalReceiptUrl = await window.uploadFileToStorage(blob, storagePath);
            if (nextBtn) nextBtn.innerHTML = '⏳ Guardando pedido...';
        }

        let redirectPaymentId = null;
        for (const item of itemsToProcess) {
            const orderData = {
                type: 'beat_purchase',
                producerId: window.storeProducerUid,
                beatId: item.beatId,
                beatName: item.beatName,
                licenseType: item.licenseType,
                price: item.price,
                buyerName: buyerName,
                buyerEmail: buyerEmail,
                buyerPhone: buyerPhone,
                buyerDni: buyerDni,
                buyerCity: buyerCity,
                buyerCountry: buyerCountry,
                method: method,
                reference: transactionId,
                receiptUrl: finalReceiptUrl,
                status: method === 'paypal' ? 'approved' : 'pending',
                discountPercent: discountPercent,
                couponCode: discountCode,
                originalPrice: item.price,
                finalPrice: item.price * (1 - (discountPercent / 100)),
                timestamp: new Date().toISOString()
            };

            const docRef = await addDoc(colRef, orderData);
            if (!redirectPaymentId) {
                redirectPaymentId = docRef.id;
            }
            
            if (method === 'paypal') {
                await autoDeliverBeatSale(docRef.id, orderData);
            }
        }

        if (method === 'paypal') {
            if (typeof window.showToast === 'function') window.showToast('¡Pago procesado y licencias enviadas con éxito!');
        } else {
            if (typeof window.showToast === 'function') window.showToast('¡Pedido registrado! Esperando aprobación del productor.');
        }

        // Vaciar el carrito
        window.cart = [];
        saveCartToStorage();
        window.updateCartUI();
        storePaymentReceiptBase64 = null;

        document.getElementById('beat-checkout-modal').style.display = 'none';
        
        // Redirigir al portal de descargas
        if (redirectPaymentId) {
            window.showAppView('download', { paymentId: redirectPaymentId });
        }
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    } catch (e) {
        console.error("Error al registrar pedido:", e);
        if (typeof window.showToast === 'function') window.showToast("Error al procesar el pedido: " + e.message, true);
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    }
}

export async function autoDeliverBeatSale(paymentId, orderData) {
    try {
        console.log("🚀 Iniciando entrega automatizada de PayPal para el pago:", paymentId);
        
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

        const serviceId = window.storeProducerConfig.emailjsServiceId || 'service_7ofza2v';
        const templateId = window.storeProducerConfig.emailjsTemplateId || 'template_mlimkld';
        const publicKey = window.storeProducerConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

        if (typeof emailjs === 'undefined') {
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');
            } catch (e) {
                console.error("No se pudo cargar EmailJS para entrega automática:", e);
            }
        }
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

// Bind to window for global/inline access
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateCartItemLicense = updateCartItemLicense;
window.getCartTotal = getCartTotal;
window.updateCartUI = updateCartUI;
window.renderCartItems = renderCartItems;
window.initPublicStore = initPublicStore;
window.renderStoreBeats = renderStoreBeats;
window.shareBeat = shareBeat;
window.setupStoreFilters = setupStoreFilters;
window.getCheckoutPrice = getCheckoutPrice;
window.applyCheckoutCoupon = applyCheckoutCoupon;
window.updateExclusivePrice = updateExclusivePrice;
window.openBeatCheckoutModal = openBeatCheckoutModal;
window.selectCheckoutLicense = selectCheckoutLicense;
window.updateCheckoutStepView = updateCheckoutStepView;
window.switchStorePaymentMethod = switchStorePaymentMethod;
window.loadStorePayphoneSDK = loadStorePayphoneSDK;
window.renderStorePayphoneButton = renderStorePayphoneButton;
window.getSelectedStorePaymentMethod = getSelectedStorePaymentMethod;
window.submitExclusiveOffer = submitExclusiveOffer;
window.openFreeDownloadModal = openFreeDownloadModal;
window.submitFreeDownloadLead = submitFreeDownloadLead;
window.getProducerAvatar = getProducerAvatar;
window.getDefaultBeatArtwork = getDefaultBeatArtwork;
window.getBeatArtwork = getBeatArtwork;
window.setupStoreCheckout = setupStoreCheckout;
window.loadStorePayPalSDK = loadStorePayPalSDK;
window.renderStorePayPalButton = renderStorePayPalButton;
window.submitBeatPurchasePayment = submitBeatPurchasePayment;
window.autoDeliverBeatSale = autoDeliverBeatSale;

export async function checkPayphoneRedirectResult() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const clientTxId = urlParams.get('clientTransactionId');
    
    if (id && clientTxId) {
        const pendingKey = 'payphone_pending_' + clientTxId;
        const pendingStateStr = localStorage.getItem(pendingKey);
        if (!pendingStateStr) return;
        
        let state;
        try {
            state = JSON.parse(pendingStateStr);
        } catch (e) {
            console.error('Error parsing payphone pending state:', e);
            return;
        }
        
        // Show loading/processing overlay
        const overlay = document.createElement('div');
        overlay.id = 'payphone-processing-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(10,12,22,0.95); z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; gap:20px;';
        overlay.innerHTML = `
            <div style="width: 50px; height: 50px; border: 5px solid rgba(0,204,255,0.1); border-top-color: #00ccff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="font-size: 18px; font-weight: 700;">Verificando pago con PayPhone...</div>
            <div style="font-size: 13px; color: #8a91a6;">Por favor, no cierres esta ventana</div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        document.body.appendChild(overlay);
        
        try {
            // Confirm transaction using PayPhone API
            const response = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'bearer ' + state.producerToken
                },
                body: JSON.stringify({
                    id: parseInt(id, 10),
                    clientTxId: clientTxId
                })
            });
            
            const result = await response.json();
            console.log('PayPhone Confirmation response:', result);
            
            if (response.ok && (result.transactionStatus === 'Approved' || result.statusCode === 3 || result.status === 'Approved')) {
                // Payment is approved! Save transaction records and deliver licenses
                window.storeProducerUid = state.producerId;
                
                const colRef = collection(db, "payments");
                let redirectPaymentId = null;
                for (const item of state.items) {
                    const orderData = {
                        type: 'beat_purchase',
                        producerId: state.producerId,
                        beatId: item.beatId,
                        beatName: item.beatName,
                        licenseType: item.licenseType,
                        price: item.price,
                        buyerName: state.buyerName,
                        buyerEmail: state.buyerEmail,
                        buyerPhone: state.buyerPhone,
                        buyerDni: state.buyerDni,
                        buyerCity: state.buyerCity,
                        buyerCountry: state.buyerCountry,
                        method: 'payphone',
                        reference: clientTxId,
                        receiptUrl: '',
                        status: 'approved',
                        discountPercent: state.discountPercent || 0,
                        couponCode: state.couponCode || '',
                        originalPrice: item.price,
                        finalPrice: item.price * (1 - ((state.discountPercent || 0) / 100)),
                        timestamp: new Date().toISOString()
                    };
                    
                    const docRef = await addDoc(colRef, orderData);
                    if (!redirectPaymentId) {
                        redirectPaymentId = docRef.id;
                    }
                    await autoDeliverBeatSale(docRef.id, orderData);
                }
                
                // Clear state
                localStorage.removeItem(pendingKey);
                window.cart = [];
                saveCartToStorage();
                window.updateCartUI();
                
                overlay.innerHTML = `
                    <div style="font-size: 60px; color: #4ade80; text-align: center; margin-bottom: 10px;">✓</div>
                    <div style="font-size: 20px; font-weight: 700; color: #4ade80; text-align: center; margin-bottom: 8px;">¡Pago aprobado con éxito!</div>
                    <div style="font-size: 14px; color: #cdd; text-align: center; max-width: 320px; line-height: 1.4; margin-bottom: 20px; padding: 0 20px;">Tus archivos y contratos de licencia han sido enviados automáticamente a tu correo electrónico.</div>
                    <button onclick="window.closePayphoneOverlay(); if ('${redirectPaymentId}') window.showAppView('download', { paymentId: '${redirectPaymentId}' });" style="padding: 12px 28px; background: #00ccff; border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 204, 255, 0.3);">Descargar Archivos</button>
                `;
            } else {
                throw new Error(result.message || 'La transacción no fue aprobada');
            }
        } catch (err) {
            console.error('Error confirming PayPhone transaction:', err);
            overlay.innerHTML = `
                <div style="font-size: 60px; color: #ef4444; text-align: center; margin-bottom: 10px;">✗</div>
                <div style="font-size: 18px; font-weight: 700; color: #ef4444; text-align: center; margin-bottom: 8px;">Error en la verificación</div>
                <div style="font-size: 13px; color: #8a91a6; text-align: center; max-width: 280px; line-height: 1.4; margin-bottom: 20px; padding: 0 20px;">${err.message || 'No se pudo verificar el pago con PayPhone. Si el dinero fue debitado, contacta al productor.'}</div>
                <button onclick="window.closePayphoneOverlay()" style="padding: 12px 28px; background: #3f4454; border: none; border-radius: 8px; color: #fff; font-weight: 700; cursor: pointer; font-size: 14px;">Regresar a la tienda</button>
            `;
        }
    }
}

export function closePayphoneOverlay() {
    const overlay = document.getElementById('payphone-processing-overlay');
    if (overlay) overlay.remove();
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    url.searchParams.delete('clientTransactionId');
    window.history.replaceState({}, document.title, url.toString());
}

window.checkPayphoneRedirectResult = checkPayphoneRedirectResult;
window.closePayphoneOverlay = closePayphoneOverlay;

export async function loadBuyerDownloadPage(paymentId) {
    console.log("📥 Cargando portal de descargas para el pago:", paymentId);
    
    // Elementos de la interfaz
    const bannerPending = document.getElementById('buyer-download-pending-banner');
    const logoImg = document.getElementById('buyer-download-logo');
    const logoIcon = document.getElementById('buyer-download-logo-icon');
    const producerNameEl = document.getElementById('buyer-download-producer-name');
    const beatArtwork = document.getElementById('buyer-download-artwork');
    const beatArtworkIcon = document.getElementById('buyer-download-artwork-icon');
    const beatNameEl = document.getElementById('buyer-download-beat-name');
    const beatMetaEl = document.getElementById('buyer-download-beat-meta');
    const orderRefEl = document.getElementById('buyer-download-order-ref');
    const buttonsContainer = document.getElementById('buyer-download-buttons-container');
    const historyList = document.getElementById('buyer-download-history-list');

    if (typeof window.showToast === 'function') {
        window.showToast("Cargando tus descargas...");
    }

    try {
        // Consultar el endpoint de descargas públicas de la orden
        const response = await fetch(`/api/get-order-downloads?id=${paymentId}`);
        if (!response.ok) {
            throw new Error("No se pudo recuperar la información del pedido.");
        }
        
        const data = await response.json();
        console.log("Datos de la orden cargados con éxito:", data);

        const payment = data.payment;
        const beat = data.beat;
        const producer = data.producer;
        const signedLinks = data.signedLinks;

        // 1. Mostrar/ocultar banner de pago pendiente
        if (payment.status === 'pending') {
            bannerPending.style.display = 'block';
        } else {
            bannerPending.style.display = 'none';
        }

        // 2. Poblar datos del productor
        if (producer.logoBase64) {
            logoImg.src = producer.logoBase64;
            logoImg.style.display = 'block';
            logoIcon.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoIcon.style.display = 'block';
        }
        producerNameEl.textContent = producer.aka || producer.name || "Productor";

        // 3. Poblar datos del beat
        if (beat.artwork) {
            beatArtwork.src = beat.artwork;
            beatArtwork.style.display = 'block';
            beatArtworkIcon.style.display = 'none';
        } else {
            beatArtwork.style.display = 'none';
            beatArtworkIcon.style.display = 'block';
        }
        beatNameEl.textContent = beat.name;
        
        const priceFormatted = parseFloat(payment.finalPrice !== undefined ? payment.finalPrice : payment.price).toFixed(2);
        const licenseLabels = {
            basic: 'Licencia Básica',
            premium: 'Licencia Premium',
            premium_plus: 'Licencia Premium Plus',
            unlimited_flp: 'Licencia Ilimitada + FLP',
            unlimited: 'Licencia Ilimitada',
            exclusive: 'Licencia Exclusiva'
        };
        const licenseLabel = licenseLabels[payment.licenseType] || payment.licenseType;
        beatMetaEl.textContent = `Pista • ${licenseLabel} • $${priceFormatted}`;
        orderRefEl.textContent = `Ref: ${payment.reference} | ID: ${payment.id}`;

        // 4. Renderizar botones de descarga
        buttonsContainer.innerHTML = '';
        
        // Botón: Descargar licencia (PDF generado client-side)
        const btnLicense = document.createElement('button');
        btnLicense.className = 'w-full bg-white/5 border border-white/10 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2';
        btnLicense.innerHTML = '<i data-lucide="file-text" class="w-4 h-4"></i> Descargar licencia';
        if (payment.status === 'pending') {
            btnLicense.disabled = true;
            btnLicense.style.opacity = '0.5';
            btnLicense.style.cursor = 'not-allowed';
        } else {
            btnLicense.onclick = async () => {
                const originalHtml = btnLicense.innerHTML;
                btnLicense.disabled = true;
                btnLicense.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i> Generando PDF...';
                if (window.safeCreateIcons) window.safeCreateIcons();
                
                try {
                    // Cargar librería html2pdf.js si es necesario
                    if (typeof html2pdf === 'undefined') {
                        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
                    }
                    
                    // Compilar el contrato
                    const compiled = window.compileContractData(payment, producer, 'licencia_uso', window.currentLang || 'es');
                    const element = document.getElementById('buyer-rendered-contract-content');
                    element.innerHTML = compiled.html;
                    element.classList.add('printing-pdf');

                    const opt = {
                        margin:       [15, 20, 15, 20],
                        filename:     `Licencia_${payment.licenseType.toUpperCase()}_${payment.reference}.pdf`,
                        image:        { type: 'jpeg', quality: 0.98 },
                        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
                        pagebreak:    { mode: ['css', 'legacy'] }
                    };

                    await html2pdf().from(element).set(opt).save();

                    // Registrar descarga en Firestore a través del endpoint
                    await fetch('/api/log-download', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paymentId, fileType: 'license' })
                    });
                    
                    // Recargar el historial
                    setTimeout(() => refreshDownloadHistory(paymentId), 2000);
                } catch (err) {
                    console.error("Error al generar PDF o registrar descarga:", err);
                    if (typeof window.showToast === 'function') {
                        window.showToast("Error al descargar la licencia.", true);
                    }
                } finally {
                    btnLicense.innerHTML = originalHtml;
                    btnLicense.disabled = false;
                    if (window.safeCreateIcons) window.safeCreateIcons();
                }
            };
        }
        buttonsContainer.appendChild(btnLicense);

        // Ayudante para descargar y recargar
        const triggerAudioDownload = (url, fileType) => {
            const a = document.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.click();
            setTimeout(() => refreshDownloadHistory(paymentId), 3000);
        };

        // Botón: MP3
        if (signedLinks.mp3) {
            const btnMp3 = document.createElement('button');
            btnMp3.className = 'w-full bg-white/5 border border-white/10 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2';
            btnMp3.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i> Descargar archivo MP3';
            if (payment.status === 'pending') {
                btnMp3.disabled = true;
                btnMp3.style.opacity = '0.5';
                btnMp3.style.cursor = 'not-allowed';
            } else {
                btnMp3.onclick = () => triggerAudioDownload(signedLinks.mp3, 'mp3');
            }
            buttonsContainer.appendChild(btnMp3);
        }

        // Botón: WAV
        if (signedLinks.wav) {
            const btnWav = document.createElement('button');
            btnWav.className = 'w-full bg-white/5 border border-white/10 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2';
            btnWav.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i> Descargar archivo WAV';
            if (payment.status === 'pending') {
                btnWav.disabled = true;
                btnWav.style.opacity = '0.5';
                btnWav.style.cursor = 'not-allowed';
            } else {
                btnWav.onclick = () => triggerAudioDownload(signedLinks.wav, 'wav');
            }
            buttonsContainer.appendChild(btnWav);
        }

        // Botón: Stems
        if (signedLinks.stems) {
            const btnStems = document.createElement('button');
            btnStems.className = 'w-full bg-white/5 border border-white/10 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-white/10 transition-all flex items-center justify-center gap-2';
            btnStems.innerHTML = '<i data-lucide="download" class="w-4 h-4"></i> Descargar archivo Stems';
            if (payment.status === 'pending') {
                btnStems.disabled = true;
                btnStems.style.opacity = '0.5';
                btnStems.style.cursor = 'not-allowed';
            } else {
                btnStems.onclick = () => triggerAudioDownload(signedLinks.stems, 'stems');
            }
            buttonsContainer.appendChild(btnStems);
        }

        // 5. Historial de descargas
        renderDownloadLogs(data.downloads, historyList);

        if (window.safeCreateIcons) {
            window.safeCreateIcons();
        }

    } catch (error) {
        console.error("Fallo al cargar la página de descargas:", error);
        if (typeof window.showToast === 'function') {
            window.showToast("Error al cargar la orden de compra.", true);
        }
        beatNameEl.textContent = "Error";
        beatMetaEl.textContent = "No pudimos validar tu enlace de descarga.";
        buttonsContainer.innerHTML = '';
    }
}

async function refreshDownloadHistory(paymentId) {
    try {
        const response = await fetch(`/api/get-order-downloads?id=${paymentId}`);
        if (response.ok) {
            const data = await response.json();
            const historyList = document.getElementById('buyer-download-history-list');
            if (historyList) {
                renderDownloadLogs(data.downloads, historyList);
            }
        }
    } catch (e) {
        console.warn("Fallo al refrescar historial de descargas:", e);
    }
}

function renderDownloadLogs(downloads, container) {
    if (!downloads || downloads.length === 0) {
        container.innerHTML = '<div class="text-on-surface-variant/40 italic">Ninguna descarga registrada aún.</div>';
        return;
    }

    container.innerHTML = downloads.map(log => {
        const timestampFormatted = log.timestamp ? log.timestamp.split('.')[0] + 'Z' : 'N/A';
        const fileTypeLabel = {
            mp3: 'MP3',
            wav: 'WAV',
            stems: 'Stems',
            license: 'Licencia PDF'
        }[log.fileType] || log.fileType;
        
        return `<div class="flex justify-between items-center py-1 border-b border-white/[0.02]">
            <span>${timestampFormatted} [${log.ip}]</span>
            <span class="text-neon-blue font-semibold uppercase text-[9px] bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/20">${fileTypeLabel}</span>
        </div>`;
    }).join('');
}

window.loadBuyerDownloadPage = loadBuyerDownloadPage;
window.refreshDownloadHistory = refreshDownloadHistory;

