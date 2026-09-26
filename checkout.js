import { LICENSE_CONFIGS } from './config.js';
import { isValidLicenseReference, resolveLicenseReference } from './license-reference.js';
import { isSafeArtworkUrl } from './public-beat-utils.js';
import { 
    db, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    collectionGroup, 
    query, 
    where,
    updateDoc
} from "./firebase.js";

// Funciones de utilidad: Sanitización de entradas y Analíticas de Checkout
export function sanitizeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
window.sanitizeHtml = sanitizeHtml;

export function sanitizeInput(str) {
    if (typeof str !== 'string') return '';
    // Eliminar caracteres de control invisibles, etiquetas HTML y corchetes angulares
    return str
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/[<>]/g, '')
        .trim();
}

const checkoutDebugEnabled = (() => {
    try {
        const host = window.location.hostname;
        return /^(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})$/.test(host)
            || new URLSearchParams(window.location.search).has('checkout_debug');
    } catch (_) {
        return false;
    }
})();

function checkoutDebug(...args) {
    if (checkoutDebugEnabled) console.info(...args);
}

export function logCheckoutStep(stepName, data = {}) {
    // El historial era solo una ayuda de diagnóstico y quedaba disponible a
    // cualquier script del mismo origen. En producción no retenemos estos
    // metadatos de compra en el navegador; soporte puede activarlo de forma
    // explícita con checkout_debug o desde el entorno local.
    if (!checkoutDebugEnabled) return;
    const logKey = 'beatss_checkout_log';
    let logs = [];
    try {
        logs = JSON.parse(localStorage.getItem(logKey) || '[]');
    } catch(e) {}
    logs.push({
        step: stepName,
        timestamp: new Date().toISOString(),
        data: data
    });
    // Limitar log local a los últimos 50 eventos para optimizar almacenamiento
    if (logs.length > 50) logs.shift();
    localStorage.setItem(logKey, JSON.stringify(logs));
    checkoutDebug(`[Checkout Analytics] ${stepName}:`, data);
}

window.sanitizeInput = sanitizeInput;
window.logCheckoutStep = logCheckoutStep;

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
let lastCheckoutLegalTrigger = null;
let activeCheckoutLegalDocument = null;
const CHECKOUT_TERMS_VERSION = '2026-08-14';
let checkoutTermsAcceptance = null;

// Deuna Dynamic Payment State
let deunaListenerUnsubscribe = null;
let currentDeunaPaymentId = null;
let currentDeunaStatusToken = '';
let currentDeunaOrderData = null;
let currentDeunaItems = [];
let currentDeunaAttempt = null;
let deunaInitializationPromise = null;
let pendingOfferAttempt = null;
let pendingPurchaseAttempt = null;
let currentPayphoneAttempt = null;
let payphoneInitializationPromise = null;
let storePaymentCapabilitiesPromise = null;

function loadStorePaymentCapabilities() {
    if (window.storePaymentCapabilities) return Promise.resolve(window.storePaymentCapabilities);
    // Las capacidades llegan junto con la tienda seleccionada. Nunca usar la
    // configuración global de BEATSS como fallback para otro productor.
    window.storePaymentCapabilities = {
        stripe: false, paypal: false, payphone: false, deuna: false, transfer: false
    };
    storePaymentCapabilitiesPromise = Promise.resolve(window.storePaymentCapabilities);
    return storePaymentCapabilitiesPromise;
}

function createPendingRequestId() {
    if (!globalThis.crypto?.getRandomValues) throw new Error('Este navegador no puede proteger la solicitud.');
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return `po_${bytesToHex(bytes)}`;
}

function pendingAttempt(previous, identity) {
    if (previous?.identity === identity) return previous;
    const legalAcceptance = getCheckoutTermsAcceptance();
    return {
        identity,
        requestId: createPendingRequestId(),
        acceptanceTimestamp: legalAcceptance?.acceptedAt || new Date().toISOString(),
        termsVersion: legalAcceptance?.termsVersion || CHECKOUT_TERMS_VERSION,
        statusCredential: null
    };
}

function receiptIdentity(value) {
    const source = String(value || '');
    return `${source.length}:${source.slice(0, 32)}:${source.slice(-32)}`;
}

async function postPendingOrder(payload) {
    const response = await fetch('/api/orders/pending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
        const error = new Error(result.error || 'No se pudo registrar el pedido.');
        error.code = result.code || '';
        throw error;
    }
    return result;
}

function bytesToHex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createPaymentStatusCredential() {
    if (!globalThis.crypto?.getRandomValues || !globalThis.crypto?.subtle) {
        throw new Error('Este navegador no puede crear una credencial segura de estado.');
    }
    const randomBytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(randomBytes);
    const token = bytesToHex(randomBytes);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    return { token, hash: bytesToHex(new Uint8Array(digest)) };
}

async function getPaymentStatusAuthHeaders() {
    if (!window._firebaseAuth?.currentUser) return {};
    try {
        const idToken = await window._firebaseAuth.currentUser.getIdToken();
        return { Authorization: `Bearer ${idToken}` };
    } catch (_) {
        return {};
    }
}

export function startPaymentStatusPolling({
    paymentId,
    statusToken = '',
    intervalMs = 4000,
    maxAttempts = 225,
    onApproved,
    onTerminal,
    onError
}) {
    let stopped = false;
    let timer = null;
    let controller = null;
    let attempts = 0;

    const stop = () => {
        stopped = true;
        if (timer) window.clearTimeout(timer);
        controller?.abort();
        timer = null;
        controller = null;
    };

    const schedule = () => {
        if (!stopped) timer = window.setTimeout(poll, intervalMs);
    };

    const poll = async () => {
        if (stopped) return;
        if (document.hidden) {
            schedule();
            return;
        }
        attempts += 1;
        controller = new AbortController();
        try {
            const query = new URLSearchParams({ id: paymentId });
            const headers = await getPaymentStatusAuthHeaders();
            if (statusToken) headers['X-Beatss-Status-Token'] = statusToken;
            const response = await fetch(`/api/payments/status?${query.toString()}`, {
                headers,
                signal: controller.signal,
                cache: 'no-store'
            });
            if (response.status === 401 || response.status === 403) {
                stop();
                onError?.(new Error('La credencial de estado no es válida.'));
                return;
            }
            if (!response.ok) throw new Error(`Estado de pago no disponible (${response.status}).`);
            const result = await response.json();
            if (result.status === 'approved' || result.status === 'completed') {
                stop();
                await onApproved?.(result);
                return;
            }
            if (['cancelled', 'cancelado', 'failed', 'rejected', 'expired', 'refunded'].includes(result.status)) {
                stop();
                await onTerminal?.(result);
                return;
            }
        } catch (error) {
            if (error?.name === 'AbortError' || stopped) return;
            if (attempts >= maxAttempts) {
                stop();
                onError?.(error);
                return;
            }
        }
        if (attempts >= maxAttempts) {
            stop();
            onError?.(new Error('La confirmación está tardando más de lo esperado.'));
            return;
        }
        schedule();
    };

    void poll();
    return stop;
}



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

export function addToCart(beatId, licenseType, price, beatName, producerId, producerName, artwork, producerStoreSlug = '') {
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
        producerStoreSlug,
        artwork
    });
    
    saveCartToStorage();
    window.updateCartUI();
    if (typeof window.showToast === 'function') window.showToast("¡Beat agregado al carrito!");
    return true;
}

export function clearPurchasedItems() {
    if (window.cartPendingOtherProducers && window.cartPendingOtherProducers.length > 0) {
        window.cart = window.cartPendingOtherProducers;
        window.cartPendingOtherProducers = null;
    } else {
        window.cart = [];
    }
    saveCartToStorage();
    window.updateCartUI();
}

window.checkoutProducerGroup = async function(producerId) {
    if (!requireCheckoutTermsAcceptance()) return;
    const otherItems = window.cart.filter(item => item.producerId !== producerId);
    const selectedItems = window.cart.filter(item => item.producerId === producerId);
    
    if (selectedItems.length === 0) return;
    
    window.cartPendingOtherProducers = otherItems;
    window.cart = selectedItems;
    saveCartToStorage();
    
    try {
        if (typeof window.showToast === 'function') window.showToast("Cargando cuentas del productor...");
        const producerStoreSlug = selectedItems[0]?.producerStoreSlug || selectedItems[0]?.producerName;
        const response = await fetch(`/api/public-store?producer=${encodeURIComponent(producerStoreSlug || '')}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload.producerId !== producerId) throw new Error(payload.error || 'No se pudo cargar la tienda del productor.');
        if (payload.producer) {
            window.storeProducerConfig = payload.producer;
            window.storePaymentCapabilities = payload.paymentCapabilities || { stripe: false, paypal: false, payphone: false, deuna: false, transfer: false };
            window.storeProducerUid = producerId;
            
            // Set dynamic accent colors
            const akaLower = (window.storeProducerConfig.aka || '').toLowerCase();
            if (akaLower.includes('monarco')) {
                document.documentElement.style.setProperty('--accent', '#ff4d4d');
                document.documentElement.style.setProperty('--accent-rgb', '255, 77, 77');
            } else if (akaLower.includes('sossa')) {
                document.documentElement.style.setProperty('--accent', '#b28eff');
                document.documentElement.style.setProperty('--accent-rgb', '178, 142, 255');
            } else {
                document.documentElement.style.setProperty('--accent', '#00ccff');
                document.documentElement.style.setProperty('--accent-rgb', '0, 204, 255');
            }
        }
    } catch (e) {
        console.error("Error al cargar configuración del productor para checkout:", e);
    }
    
    window.renderCartItems();
    
    const nextBtn = document.getElementById('checkout-next-step-btn');
    if (nextBtn) nextBtn.click();
};

export function removeFromCart(index) {
    if (index >= 0 && index < window.cart.length) {
        const removed = window.cart.splice(index, 1);
        resetCheckoutTermsAcceptance();
        saveCartToStorage();
        window.updateCartUI();
        if (typeof window.showToast === 'function') window.showToast(`Removido: ${removed[0].beatName}`);
        
        if (document.getElementById('beat-checkout-modal').style.display === 'flex' && !checkoutSelectedBeatId) {
            window.renderCartItems();
        }
    }
}

export function updateCartItemLicense(index, newLicenseType) {
    if (index >= 0 && index < window.cart.length) {
        window.cart[index].licenseType = newLicenseType;
        const config = LICENSE_CONFIGS[newLicenseType];
        if (config) {
            window.cart[index].price = config.price;
        }
        resetCheckoutTermsAcceptance();
        saveCartToStorage();
        window.updateCartUI();
        
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
    if (count > 0 && (window.stateManager.getState('isPublicStoreMode') || window.stateManager.getState('isGlobalCatalogMode'))) {
        floatBtn.style.display = 'flex';
    } else {
        floatBtn.style.display = 'none';
    }
}

export function findBeatById(beatId) {
    checkoutDebug("🔍 findBeatById called with ID:", beatId);
    checkoutDebug("  window.storeBeats:", window.storeBeats ? window.storeBeats.map(b => b.id) : "undefined");
    checkoutDebug("  window.globalBeats:", window.globalBeats ? window.globalBeats.map(b => b.id) : "undefined");
    if (window.storeBeats) {
        const b = window.storeBeats.find(x => x.id === beatId);
        if (b) {
            checkoutDebug("  Found in storeBeats:", b);
            return b;
        }
    }
    if (window.globalBeats) {
        const b = window.globalBeats.find(x => x.id === beatId);
        if (b) {
            checkoutDebug("  Found in globalBeats:", b);
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
    
    // Agrupar por productor
    const groups = {};
    window.cart.forEach((item, index) => {
        const prodId = item.producerId || 'unknown';
        const prodName = item.producerName || 'Productor';
        if (!groups[prodId]) {
            groups[prodId] = {
                name: prodName,
                items: []
            };
        }
        groups[prodId].items.push({ item, index });
    });
    
    let html = '';
    
    Object.entries(groups).forEach(([prodId, group]) => {
        const groupTotal = group.items.reduce((sum, entry) => sum + entry.item.price, 0);
        
        html += `
            <div class="cart-producer-group" style="margin-bottom: 20px; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; background: rgba(255, 255, 255, 0.01); padding: 16px; box-sizing: border-box; width: 100%;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid rgba(255, 255, 255, 0.05); padding-bottom: 8px;">
                    <div style="font-weight: 800; font-size: 13px; color: var(--accent, #00ccff); text-transform: uppercase; letter-spacing: 0.5px;">
                        👨‍🎨 Productor: ${window.sanitizeHtml ? window.sanitizeHtml(group.name) : group.name}
                    </div>
                    <div style="font-size: 12px; color: #8a91a6;">
                        Subtotal: <span style="color: #fff; font-weight: 700;">$${groupTotal.toFixed(2)}</span>
                    </div>
                </div>
        `;
        
        group.items.forEach(({ item, index }) => {
            const beat = findBeatById(item.beatId) || item;
            const artwork = window.getBeatArtwork ? window.getBeatArtwork(beat) : (item.artwork || '');
            const isPriorLicenseUpgrade = item.isPriorLicenseUpgrade === true && window.checkoutUpgradeContext?.sourcePaymentId;
            
            const optionsHtml = Object.entries(LICENSE_CONFIGS).map(([key, config]) => {
                const isSelected = key === item.licenseType;
                const priceText = key === 'exclusive' ? 'Exclusiva (Min. $250)' : `$${config.price.toFixed(2)}`;
                return `<option value="${key}" ${isSelected ? 'selected' : ''}>${config.name} - ${priceText}</option>`;
            }).join('');
            
            html += `
                <div class="cart-item-row" style="display: flex; gap: 12px; align-items: center; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 12px; box-sizing: border-box; width: 100%; margin-bottom: 8px;">
                    <img src="${artwork}" style="width: 44px; height: 44px; border-radius: 6px; object-fit: cover; background: #222;" alt="Artwork">
                    <div style="flex: 1; text-align: left; overflow: hidden;">
                        <div style="font-weight: 700; color: #fff; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${window.sanitizeHtml ? window.sanitizeHtml(item.beatName) : item.beatName}</div>
                        <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                            ${isPriorLicenseUpgrade
                                ? `<span style="font-size:10px;color:#d8c6ff;border:1px solid rgba(178,142,255,.35);padding:3px 7px;border-radius:6px;">Ampliación reservada: ${LICENSE_CONFIGS[item.licenseType]?.name || item.licenseType}</span>`
                                : `<select onchange="window.updateCartItemLicense(${index}, this.value)" style="background: #12141c; border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: #fff; padding: 2px 6px; font-size: 10px; outline: none; cursor: pointer;">${optionsHtml}</select>`}
                        </div>
                    </div>
                    <div style="text-align: right; display: flex; align-items: center; gap: 12px;">
                        <span style="font-weight: 800; color: var(--accent, #00ccff); font-size: 13px;">$${item.price.toFixed(2)}</span>
                        ${isPriorLicenseUpgrade ? '' : `<button type="button" onclick="window.removeFromCart(${index})" style="background: none; border: none; color: #ef4444; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;" title="Eliminar"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>`}
                    </div>
                </div>
            `;
        });
        
        const isMultiProducer = Object.keys(groups).length > 1;
        if (isMultiProducer) {
            html += `
                <div style="display: flex; justify-content: flex-end; margin-top: 12px;">
                    <button type="button" class="btn btn-primary" data-checkout-requires-terms onclick="window.checkoutProducerGroup('${prodId}')" style="font-size: 11px; padding: 6px 12px; font-weight: 700; border-radius: 8px; height: 28px;">
                        Pagar este grupo ($${groupTotal.toFixed(2)} USD)
                    </button>
                </div>
            `;
        }
        
        html += `</div>`;
    });
    
    container.innerHTML = html;
    
    if (window.lucide) window.lucide.createIcons();
    
    const total = window.getCheckoutPrice();
    const totalStr = '$' + total.toFixed(2) + ' USD';
    const displayPriceEl = document.getElementById('cart-total-price-display');
    if (displayPriceEl) displayPriceEl.textContent = totalStr;
    const deunaTotalEl = document.getElementById('deuna-total-price');
    if (deunaTotalEl) deunaTotalEl.textContent = totalStr;
    const transferTotalEl = document.getElementById('transfer-total-price');
    if (transferTotalEl) transferTotalEl.textContent = totalStr;
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
    
    const isMultiProducer = Object.keys(groups).length > 1;
    const checkoutNextBtn = document.getElementById('checkout-next-step-btn');
    const multiProducerWarning = document.getElementById('checkout-multi-producer-warning');
    
    if (isMultiProducer) {
        if (checkoutNextBtn) {
            checkoutNextBtn.disabled = true;
            checkoutNextBtn.style.opacity = '0.5';
            checkoutNextBtn.style.cursor = 'not-allowed';
            checkoutNextBtn.title = 'El carrito contiene beats de varios productores. Paga cada grupo individualmente.';
        }
        if (!multiProducerWarning) {
            const warningDiv = document.createElement('div');
            warningDiv.id = 'checkout-multi-producer-warning';
            warningDiv.style.background = 'rgba(245, 158, 11, 0.1)';
            warningDiv.style.border = '1px solid rgba(245, 158, 11, 0.3)';
            warningDiv.style.color = '#f59e0b';
            warningDiv.style.borderRadius = '12px';
            warningDiv.style.padding = '12px';
            warningDiv.style.fontSize = '12px';
            warningDiv.style.fontWeight = '600';
            warningDiv.style.marginTop = '16px';
            warningDiv.style.textAlign = 'left';
            warningDiv.innerHTML = `
                ⚠️ <strong>Carrito Multi-productor:</strong> Los beats pertenecen a distintos productores que reciben el dinero directamente en sus cuentas independientes. Por favor, haz clic en <strong>"Pagar este grupo"</strong> arriba para pagar a cada productor por separado.
            `;
            container.parentNode.insertBefore(warningDiv, container.nextSibling);
        } else {
            multiProducerWarning.style.display = 'block';
        }
    } else {
        if (checkoutNextBtn) {
            checkoutNextBtn.disabled = false;
            checkoutNextBtn.style.opacity = '1';
            checkoutNextBtn.style.cursor = 'pointer';
            checkoutNextBtn.title = '';
        }
        if (multiProducerWarning) {
            multiProducerWarning.style.display = 'none';
        }
    }

    syncCheckoutContinuationControls();
}

// Inicialización de Tienda Pública
export async function initPublicStore(producerAka) {
    checkoutDebug("🛒 Cargando tienda de beats para:", producerAka);
    const storeView = document.getElementById('public-store-view');
    const grid = document.getElementById('store-beats-grid');
    const withStoreLoadTimeout = (promise, label) => new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new Error(`Tiempo de espera agotado al cargar ${label}.`));
        }, 12000);
        Promise.resolve(promise).then(
            (value) => {
                window.clearTimeout(timeoutId);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timeoutId);
                reject(error);
            }
        );
    });
    const renderUnavailableStore = (title, message) => {
        if (!grid) return;
        const producerName = document.getElementById('store-producer-name');
        const producerSubtitle = document.getElementById('store-producer-aka-sub');
        const logoImg = document.getElementById('store-logo-img');
        const logoIcon = document.getElementById('store-logo-icon');
        const emailLink = document.getElementById('store-email-link');
        const phoneLink = document.getElementById('store-phone-link');
        const waFloat = document.getElementById('store-wa-float');

        if (producerName) producerName.textContent = 'BEATSS';
        if (producerSubtitle) producerSubtitle.textContent = 'CATÁLOGO NO DISPONIBLE';
        if (logoImg) logoImg.style.display = 'none';
        if (logoIcon) logoIcon.style.display = 'flex';
        if (emailLink) emailLink.style.display = 'none';
        if (phoneLink) phoneLink.style.display = 'none';
        if (waFloat) waFloat.style.display = 'none';
        grid.innerHTML = `
            <section class="store-unavailable" role="status" aria-live="polite">
                <span class="store-unavailable-kicker">BEATSS Relay</span>
                <h2>${title}</h2>
                <p>${message}</p>
                <button type="button" class="btn-primary" onclick="window.location.assign('/tienda/sossa')">Ver tienda de Sossa</button>
            </section>
        `;
    };
    
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
        const storeResponse = await withStoreLoadTimeout(
            // La tienda es un catálogo público con TTL de 60 s. Respetar esa
            // política acelera volver a la página; el checkout global sigue
            // solicitando una configuración fresca al iniciar una compra.
            fetch(`/api/public-store?producer=${encodeURIComponent(producerAka)}`),
            'la información del productor'
        );
        const storePayload = await storeResponse.json().catch(() => ({}));
        if (storeResponse.status === 404) {
            renderUnavailableStore(
                'No encontramos este catálogo',
                'Revisa el enlace que recibiste o explora los beats disponibles en BEATSS.'
            );
            if (window.lucide) window.lucide.createIcons();
            return;
        }
        if (!storeResponse.ok) throw new Error(storePayload.error || 'No se pudo cargar el catálogo.');

        const producerUid = storePayload.producerId;
        const configData = storePayload.producer || {};
        if (!producerUid || !configData.aka) throw new Error('El catálogo público no está configurado.');

        window.storeProducerUid = producerUid;
        window.storeProducerConfig = configData;
        window.storePaymentCapabilities = storePayload.paymentCapabilities || {
            stripe: false, paypal: false, payphone: false, deuna: false, transfer: false
        };
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

        window.storeBeats = Array.isArray(storePayload.beats) ? storePayload.beats : [];

        // Renderizar grilla y configurar eventos
        renderStoreBeats(window.storeBeats);
        setupStoreFilters();
        if (typeof window.setupStoreAudioPlayer === 'function') window.setupStoreAudioPlayer();
        setupStoreCheckout();
        if (typeof window.switchStoreTab === 'function') {
            window.switchStoreTab('beats');
        }
        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error("Error cargando la tienda:", err);
        renderUnavailableStore(
            'No pudimos abrir este catálogo',
            'Intenta nuevamente en unos minutos o vuelve al catálogo general de BEATSS.'
        );
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
            "track": beats.map((beat, index) => {
                const artwork = window.getBeatArtwork?.(beat) || '';
                const image = /^https:\/\//i.test(artwork) ? artwork : '';
                return {
                    "@type": "MusicRecording",
                    "position": index + 1,
                    "name": beat.name,
                    "genre": beat.genre || "Instrumental",
                    ...(image ? { "image": image } : {}),
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
                };
            })
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
        const bpmText = beat.bpm ? `${sanitizeHtml(beat.bpm)} BPM` : 'N/A';
        const keyText = beat.key ? `${sanitizeHtml(beat.key)}` : 'N/A';
        
        // Formatear etiquetas de tags (sanitizadas)
        const tagsList = (beat.tags || '')
            .split(/[\s,]+/)
            .filter(t => t.trim().length > 0)
            .map(t => t.startsWith('#') ? t : `#${t}`);
        const tagsHtml = tagsList.length > 0
            ? `<div class="store-beat-tags-container">${tagsList.map(tag => `<span class="store-beat-tag">${sanitizeHtml(tag)}</span>`).join('')}</div>`
            : '';

        // Formatear badges de género y moods (sanitizados)
        const genreBadge = beat.genre ? `<span class="store-genre-badge">${sanitizeHtml(beat.genre)}</span>` : '';
        const moodBadge = beat.moods ? `<span class="store-mood-badge">${sanitizeHtml(beat.moods)}</span>` : '';
        const badgesHtml = (genreBadge || moodBadge)
            ? `<div style="display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap;">${genreBadge}${moodBadge}</div>`
            : '';
        
        const buyLicenseText = window.currentLang === 'es' ? 'Adquirir Licencia' : 'Acquire License';
        const basicPrice = Number(beat.price_basic ?? beat.basicPrice) || 30;
        const priceValue = `$${basicPrice.toFixed(2)}`;
        const safeBeatName = sanitizeHtml(beat.name);
        
        return `
            <div class="store-beat-card" data-id="${sanitizeHtml(beat.id)}" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box; padding: 18px;">
                <div>
                    <div class="store-beat-cover" style="position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #151722;">
                        <img src="${artworkUrl}" alt="${safeBeatName}" style="width:100%; height:100%; object-fit:cover; object-position:top; border-radius:14px; transition: transform 0.5s ease;">
                    <button type="button" class="store-play-overlay" id="btn-play-store-${sanitizeHtml(beat.id)}" onclick="window.toggleStorePlay('${sanitizeHtml(beat.id)}')" aria-label="Reproducir vista previa de ${safeBeatName}">
                        <span class="store-play-btn" aria-hidden="true" style="width: 56px; height: 56px; border-radius: 50%; background: var(--accent, #00ccff); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; box-shadow: 0 4px 15px var(--accent-glow, rgba(0, 204, 255, 0.3)); transform: scale(0.9); transition: transform 0.3s ease;">
                            <i data-lucide="play" style="width: 24px; height: 24px; fill: #000; stroke: #000;"></i>
                        </span>
                    </button>
                        <button onclick="window.shareBeat('${sanitizeHtml(beat.id)}', '${sanitizeHtml(beat.name).replace(/'/g, "\\'")}')\" style="position: absolute; top: 10px; right: 10px; width: 32px; height: 32px; border-radius: 50%; background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.1); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; z-index: 10; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(0,0,0,0.6)'" title="Compartir">
                            <i data-lucide="share-2" style="width: 14px; height: 14px;"></i>
                        </button>
                    </div>
                    <h3 style="font-size: 19px; font-weight: 800; color: #fff; margin: 16px 0 0 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; min-height: 2.5em;" title="${safeBeatName}">${safeBeatName}</h3>
                    <div class="store-beat-meta" style="margin-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 14px; color: #8a91a6; font-weight: 600;">${bpmText} • ${keyText}</span>
                        <span style="color: var(--accent, #00ccff); font-weight: 800; background: rgba(var(--accent-rgb, 0, 204, 255), 0.08); padding: 4px 12px; border-radius: 8px; font-size: 15px;">${priceValue}</span>
                    </div>
                    ${badgesHtml}
                    ${tagsHtml}
                </div>
                <div style="margin-top: 18px; display: flex; flex-direction: column; gap: 8px; box-sizing: border-box;">
                    <button type="button" class="btn btn-primary" onclick="window.openBeatCheckoutModal('${sanitizeHtml(beat.id)}')" style="width: 100%; height: 44px; font-weight: 700; border-radius: 12px; font-size: 14px; margin: 0; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer;">
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
        }).catch((error) => checkoutDebug('Error sharing', error));
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

    genreSelect.innerHTML = '<option value="">Todos los géneros</option>' + Array.from(genres).map(g => `<option value="${sanitizeHtml(g)}">${sanitizeHtml(g)}</option>`).join('');
    keySelect.innerHTML = '<option value="">Todas las escalas</option>' + Array.from(keys).map(k => `<option value="${sanitizeHtml(k)}">${sanitizeHtml(k)}</option>`).join('');

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

export function getCheckoutBasePrice() {
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
    
    return basePrice;
}

export function getCheckoutPrice() {
    const basePrice = getCheckoutBasePrice();

    // Aplicar descuento de cupón únicamente al total cobrado.
    if (window.checkoutDiscountPercent > 0) {
        const discount = basePrice * (window.checkoutDiscountPercent / 100);
        return Math.max(0, basePrice - discount);
    }
    
    return basePrice;
}

export async function applyCheckoutCoupon() {
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
    
    let foundCoupon = null;
    const coupons = window.storeProducerConfig?.coupons || [];
    if (coupons.length > 0) {
        foundCoupon = coupons.find(c => c.code === code);
    }
    
    // Si no está en memoria local, validar de forma segura en el backend
    if (!foundCoupon) {
        try {
            const producerAlias = window.storeProducerConfig?.storeSlug || window.storeProducerConfig?.aka || window.storeProducerConfig?.name || window.storeProducerId || '';
            if (producerAlias) {
                const res = await fetch(`/api/public-store?producer=${encodeURIComponent(producerAlias)}&coupon=${encodeURIComponent(code)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.valid && data.discount) {
                        foundCoupon = { code: data.code || code, discount: data.discount };
                    }
                }
            }
        } catch (err) {
            console.warn('Error validando cupón:', err);
        }
    }
    
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
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
        if (deunaTotal) deunaTotal.textContent = priceStr;
        if (transferTotal) transferTotal.textContent = priceStr;
        if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
        
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
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
        if (deunaTotal) deunaTotal.textContent = priceStr;
        if (transferTotal) transferTotal.textContent = priceStr;
        if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
    }
}

export function updateExclusivePrice(val) {
    const parsed = parseFloat(val);
    if (!parsed || parsed < 0) return;
    
    window.checkoutExclusivePrice = parsed;
    if (checkoutSelectedLicense === 'exclusive' && getCheckoutTermsAcceptance()) {
        resetCheckoutTermsAcceptance();
    }
    const priceStr = '$' + parsed.toFixed(2) + ' USD';
    const deunaTotal = document.getElementById('deuna-total-price');
    const transferTotal = document.getElementById('transfer-total-price');
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
    const offerInput = document.getElementById('offer-price-input');
    
    if (deunaTotal) deunaTotal.textContent = priceStr;
    if (transferTotal) transferTotal.textContent = priceStr;
        if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
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

export function validateAndSaveBuyerCheckoutData({ focusOnError = true } = {}) {
    const emailEl = document.getElementById('store-buyer-email');
    const nameEl = document.getElementById('store-buyer-name');
    const phoneEl = document.getElementById('store-buyer-phone');
    const dniEl = document.getElementById('store-buyer-dni');
    const cityEl = document.getElementById('store-buyer-city');
    const countryEl = document.getElementById('store-buyer-country');
    const ytEl = document.getElementById('store-txt-youtube-whitelist');
    const rememberChk = document.getElementById('store-chk-remember-me');

    const email = sanitizeInput(emailEl?.value || '').trim();
    const name = sanitizeInput(nameEl?.value || '').trim();
    const phone = sanitizeInput(phoneEl?.value || '').trim();
    const dni = sanitizeInput(dniEl?.value || '').trim();
    const city = sanitizeInput(cityEl?.value || '').trim();
    const country = sanitizeInput(countryEl?.value || 'Ecuador').trim();
    const yt = sanitizeInput(ytEl?.value || '').trim();

    // 1. Validar Correo Electrónico
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        if (typeof window.showToast === 'function') {
            window.showToast('Por favor, ingresa un correo electrónico válido para recibir tu licencia y archivos.', true);
        }
        if (focusOnError && emailEl) {
            emailEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            emailEl.focus();
        }
        return { ok: false, error: 'INVALID_EMAIL' };
    }

    // 2. Validar Nombre
    if (!name || name.length < 2) {
        if (typeof window.showToast === 'function') {
            window.showToast('Por favor, ingresa tu nombre artístico o nombre completo para la licencia.', true);
        }
        if (focusOnError && nameEl) {
            nameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nameEl.focus();
        }
        return { ok: false, error: 'INVALID_NAME' };
    }

    // 3. Validar Facturación SRI si está seleccionada
    const needInvoiceChk = document.getElementById('store-chk-need-invoice');
    const needInvoice = Boolean(needInvoiceChk?.checked);
    let invoiceData = null;

    if (needInvoice) {
        const rucEl = document.getElementById('store-invoice-ruc');
        const companyEl = document.getElementById('store-invoice-company');
        const addressEl = document.getElementById('store-invoice-address');
        const invoiceEmailEl = document.getElementById('store-invoice-email');

        const ruc = sanitizeInput(rucEl?.value || '').trim();
        const company = sanitizeInput(companyEl?.value || '').trim();
        const address = sanitizeInput(addressEl?.value || '').trim();
        const invoiceEmail = sanitizeInput(invoiceEmailEl?.value || '').trim();

        if (!ruc || ruc.length !== 13 || !/^\d{13}$/.test(ruc)) {
            if (typeof window.showToast === 'function') {
                window.showToast('Para factura con RUC, ingresa un RUC válido de 13 dígitos numéricos.', true);
            }
            if (focusOnError && rucEl) {
                rucEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                rucEl.focus();
            }
            return { ok: false, error: 'INVALID_RUC' };
        }

        if (!company || company.length < 2) {
            if (typeof window.showToast === 'function') {
                window.showToast('Ingresa la Razón Social o nombre fiscal registrado en el RUC.', true);
            }
            if (focusOnError && companyEl) {
                companyEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                companyEl.focus();
            }
            return { ok: false, error: 'INVALID_COMPANY' };
        }

        if (!address || address.length < 3) {
            if (typeof window.showToast === 'function') {
                window.showToast('Ingresa la dirección fiscal para la factura.', true);
            }
            if (focusOnError && addressEl) {
                addressEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                addressEl.focus();
            }
            return { ok: false, error: 'INVALID_ADDRESS' };
        }

        if (!invoiceEmail || !emailRegex.test(invoiceEmail)) {
            if (typeof window.showToast === 'function') {
                window.showToast('Ingresa un correo válido para el envío de la factura electrónica.', true);
            }
            if (focusOnError && invoiceEmailEl) {
                invoiceEmailEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                invoiceEmailEl.focus();
            }
            return { ok: false, error: 'INVALID_INVOICE_EMAIL' };
        }

        invoiceData = { ruc, company, address, email: invoiceEmail };
    }

    // 4. Persistir datos según preferencia del usuario
    const shouldRemember = rememberChk ? rememberChk.checked : true;
    try {
        localStorage.setItem('store_remember_data', shouldRemember ? 'true' : 'false');
        if (shouldRemember) {
            localStorage.setItem('store_buyer_name', name);
            localStorage.setItem('store_buyer_email', email);
            localStorage.setItem('store_buyer_phone', phone);
            localStorage.setItem('store_buyer_dni', dni);
            localStorage.setItem('store_buyer_city', city);
            localStorage.setItem('store_buyer_country', country);
            localStorage.setItem('store_buyer_yt', yt);
            localStorage.setItem('store_need_invoice', needInvoice ? 'true' : 'false');
            if (needInvoice && invoiceData) {
                localStorage.setItem('store_invoice_ruc', invoiceData.ruc);
                localStorage.setItem('store_invoice_company', invoiceData.company);
                localStorage.setItem('store_invoice_address', invoiceData.address);
                localStorage.setItem('store_invoice_email', invoiceData.email);
            }
        }
    } catch (_) {}

    return {
        ok: true,
        buyerData: {
            name,
            email,
            phone,
            dni,
            city,
            country,
            youtubeWhitelist: yt,
            needInvoice,
            invoiceData
        }
    };
}
window.validateAndSaveBuyerCheckoutData = validateAndSaveBuyerCheckoutData;

export function openBeatCheckoutModal(beatId) {
    checkoutDebug("🚀 openBeatCheckoutModal called with ID:", beatId);
    loadStorePaymentCapabilities();
    setupStoreCheckout();
    logCheckoutStep('checkout_initiated', { beatId: beatId });
    checkoutSelectedBeatId = beatId;
    checkoutSelectedLicense = 'basic';
    checkoutCurrentStep = 3;
    storePaymentReceiptBase64 = null;
    window.checkoutExclusivePrice = 500; // Reset de precio exclusivo

    // Pre-cargar SDK de PayPal de inmediato si el productor tiene credenciales activas
    const paypalCid = window.storeProducerConfig?.paypalClientId || '';
    if (paypalCid && window.storePaymentCapabilities?.paypal === true) {
        loadStorePayPalSDK(paypalCid, () => {
            renderStorePayPalButton(paypalCid);
        });
    }

    // Cargar datos guardados de localStorage si existe la preferencia
    const shouldRemember = localStorage.getItem('store_remember_data') !== 'false';
    const savedName = shouldRemember ? (localStorage.getItem('store_buyer_name') || '') : '';
    const savedEmail = shouldRemember ? (localStorage.getItem('store_buyer_email') || '') : '';
    const savedPhone = shouldRemember ? (localStorage.getItem('store_buyer_phone') || '') : '';
    const savedDni = shouldRemember ? (localStorage.getItem('store_buyer_dni') || '') : '';
    const savedCity = shouldRemember ? (localStorage.getItem('store_buyer_city') || '') : '';
    const savedCountry = shouldRemember ? (localStorage.getItem('store_buyer_country') || 'Ecuador') : 'Ecuador';
    const savedYt = shouldRemember ? (localStorage.getItem('store_buyer_yt') || '') : '';

    document.getElementById('store-buyer-name').value = savedName;
    document.getElementById('store-buyer-email').value = savedEmail;
    document.getElementById('store-buyer-phone').value = savedPhone;
    document.getElementById('store-buyer-dni').value = savedDni;
    document.getElementById('store-buyer-city').value = savedCity;
    document.getElementById('store-buyer-country').value = savedCountry;
    
    const ytField = document.getElementById('store-txt-youtube-whitelist');
    if (ytField) ytField.value = savedYt;

    const rememberChk = document.getElementById('store-chk-remember-me');
    if (rememberChk) rememberChk.checked = shouldRemember;

    // Facturación SRI RUC
    const savedNeedInvoice = shouldRemember ? (localStorage.getItem('store_need_invoice') === 'true') : false;
    const savedRuc = shouldRemember ? (localStorage.getItem('store_invoice_ruc') || '') : '';
    const savedCompany = shouldRemember ? (localStorage.getItem('store_invoice_company') || '') : '';
    const savedAddress = shouldRemember ? (localStorage.getItem('store_invoice_address') || '') : '';
    const savedInvoiceEmail = shouldRemember ? (localStorage.getItem('store_invoice_email') || '') : '';

    const needInvoiceChk = document.getElementById('store-chk-need-invoice');
    if (needInvoiceChk) {
        needInvoiceChk.checked = savedNeedInvoice;
        const invoiceFields = document.getElementById('store-invoice-fields-container');
        if (invoiceFields) invoiceFields.style.display = savedNeedInvoice ? 'flex' : 'none';
    }
    const rucEl = document.getElementById('store-invoice-ruc');
    if (rucEl) rucEl.value = savedRuc;
    const companyEl = document.getElementById('store-invoice-company');
    if (companyEl) companyEl.value = savedCompany;
    const addressEl = document.getElementById('store-invoice-address');
    if (addressEl) addressEl.value = savedAddress;
    const invoiceEmailEl = document.getElementById('store-invoice-email');
    if (invoiceEmailEl) invoiceEmailEl.value = savedInvoiceEmail;

    document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
    document.getElementById('store-receipt-file').value = '';

    resetCheckoutTermsAcceptance();

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
                <div class="license-option-card ${isActive ? 'active' : ''}">
                    <button type="button" class="license-option-select" onclick="window.selectCheckoutLicense('${key}')" aria-pressed="${isActive}" aria-label="Seleccionar licencia ${config.name}">
                        <div class="license-option-copy">
                            <div class="license-option-name">${config.name}</div>
                            <div class="license-option-details">
                                ${config.formats} • ${config.streams} streams • ${config.years}
                            </div>
                        </div>
                        <div class="license-option-price-wrap">
                            <span class="license-option-price">${priceText}</span>
                            <div class="license-check">
                                ${isActive ? '<i data-lucide="check" aria-hidden="true"></i>' : ''}
                            </div>
                        </div>
                    </button>
                    ${isExclusive ? `
                        <div class="exclusive-price-container" style="display: ${isActive ? 'flex' : 'none'};">
                            <label for="exclusive-price-input">Tu propuesta (USD)</label>
                            <input type="number" id="exclusive-price-input" min="250" value="500" oninput="window.updateExclusivePrice(this.value)">
                            <span>(mínimo $250)</span>
                        </div>
                    ` : ''}
                </div>
            `;
        }).join('');

        // Reset total prices based on basic license
        const priceStr = '$' + LICENSE_CONFIGS.basic.price.toFixed(2) + ' USD';
        const deunaTotalEl = document.getElementById('deuna-total-price');
        if (deunaTotalEl) deunaTotalEl.textContent = priceStr;
        const transferTotalEl = document.getElementById('transfer-total-price');
        if (transferTotalEl) transferTotalEl.textContent = priceStr;
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
    } else {
        // Modo Carrito
        if (window.cart.length === 0) {
            if (typeof window.showToast === 'function') window.showToast("Tu carrito está vacío.", true);
            // Continúa para mostrar el estado vacío
        }
        singleView.style.display = 'none';
        multiView.style.display = 'block';

        // Cargar configuración del productor del primer beat del carrito
        const firstCartItem = window.cart[0];
        if (firstCartItem && firstCartItem.producerId) {
            window.storeProducerUid = firstCartItem.producerId;
            const producerStoreSlug = firstCartItem.producerStoreSlug || firstCartItem.producerName;
            fetch(`/api/public-store?producer=${encodeURIComponent(producerStoreSlug || '')}`, { cache: 'no-store' }).then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || payload.producerId !== firstCartItem.producerId) throw new Error(payload.error || 'No se pudo cargar la tienda.');
                if (payload.producer) {
                    window.storeProducerConfig = payload.producer;
                    window.storePaymentCapabilities = payload.paymentCapabilities || { stripe: false, paypal: false, payphone: false, deuna: false, transfer: false };
                    checkoutDebug("🎯 storeProducerConfig cargado exitosamente para el carrito:", window.storeProducerConfig);
                    // Actualizar displays si está en Paso 3
                    if (checkoutCurrentStep === 3) {
                        updateCheckoutStepView(3);
                    }
                }
            }).catch((err) => {
                console.error("Error al cargar la configuración del productor para el carrito:", err);
            });
        }

        window.renderCartItems();
    }

    if (window.lucide) window.lucide.createIcons();

    updateCheckoutStepView(3);
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();
    document.getElementById('beat-checkout-modal').style.display = 'flex';
}

export function selectCheckoutLicense(licenseKey) {
    const selectionChanged = checkoutSelectedLicense !== licenseKey;
    checkoutSelectedLicense = licenseKey;

    // Update active class on option cards
    const container = document.getElementById('license-options-container');
    const cards = container.querySelectorAll('.license-option-card');
    const keys = Object.keys(LICENSE_CONFIGS);
    
    cards.forEach((card, index) => {
        const key = keys[index];
        const isActive = key === checkoutSelectedLicense;
        card.querySelector('.license-option-select')?.setAttribute('aria-pressed', String(isActive));
        
        if (isActive) {
            card.classList.add('active');
            const check = card.querySelector('.license-check');
            if (check) {
                check.innerHTML = '<i data-lucide="check" aria-hidden="true"></i>';
            }
        } else {
            card.classList.remove('active');
            const check = card.querySelector('.license-check');
            if (check) {
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
    const deunaTotalEl = document.getElementById('deuna-total-price');
    if (deunaTotalEl) deunaTotalEl.textContent = priceStr;
    const transferTotalEl = document.getElementById('transfer-total-price');
    if (transferTotalEl) transferTotalEl.textContent = priceStr;
    const stripeTotalEl = document.getElementById('stripe-total-price');
    if (stripeTotalEl) stripeTotalEl.textContent = `$${Number(window.getCheckoutBasePrice()).toFixed(2)} USD`;
    if (typeof window.updateStoreCheckoutSummary === 'function') window.updateStoreCheckoutSummary();

    if (activeCheckoutLegalDocument === 'license') {
        renderCheckoutLegalDocument('license');
    }

    if (selectionChanged) {
        resetCheckoutTermsAcceptance();
    }

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
    
    if (step === 2) {
        logCheckoutStep('buyer_info_started', { beatId: checkoutSelectedBeatId, license: checkoutSelectedLicense });
    } else if (step === 3) {
        const payMethod = getSelectedStorePaymentMethod();
        logCheckoutStep('payment_method_selected', { method: payMethod, price: window.getCheckoutPrice() });
    }

    // 1. Actualizar indicadores de pasos y colores de texto del Stepper
    [1, 2, 3].forEach(s => {
        const navItem = document.getElementById(`ck-nav-step-${s}`);
        const dot = document.getElementById(`ck-dot-${s}`);
        if (!navItem || !dot) return;
        
        if (s <= step) {
            // Paso Activo o Completado en vista unificada
            navItem.classList.remove('opacity-60');
            navItem.classList.add('text-[#3157e8]', 'font-bold');
            dot.className = "flex items-center justify-center w-6 h-6 rounded-full bg-[#3157e8] text-white font-mono text-xs font-bold transition-all";
            dot.innerHTML = s;
        } else {
            // Paso Futuro
            navItem.className = "flex items-center gap-2 text-[#64748b] opacity-60";
            dot.className = "flex items-center justify-center w-6 h-6 rounded-full border border-[#cbd5e1] font-mono text-xs transition-all";
            dot.innerHTML = s;
        }
    });

    // 2. Actualizar barra de progreso
    const progressPercent = step === 1 ? 33 : (step === 2 ? 66 : 100);
    const stepProgress = document.getElementById('checkout-step-progress');
    if (stepProgress) {
        stepProgress.style.width = progressPercent + '%';
    }

    // 3. Mostrar paneles en diseño unificado de 2 columnas
    const panel1 = document.getElementById('checkout-panel-1');
    const panel2 = document.getElementById('checkout-panel-2');
    const panel3 = document.getElementById('checkout-panel-3');
    if (panel1) panel1.style.display = 'block';
    if (panel2) panel2.style.display = 'block';
    if (panel3) panel3.style.display = 'block';

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
            footerNextBtn.style.display = 'flex';
            footerNextBtn.innerHTML = 'Continuar <i data-lucide="arrow-right" style="width:16px;height:16px;"></i>';
        } else if (step === 3) {
            // Paso 3 (pago unificado): En el layout compacto de 2 columnas no se requiere botón atrás en el footer
            footerPrevBtn.style.display = 'none';
            footerCancelBtn.style.display = 'none';
            
            // Cargar datos del productor para pasarelas
            const deunaTab = document.getElementById('btn-pay-deuna');
            const transferTab = document.getElementById('btn-pay-transfer');
            const stripeTab = document.getElementById('btn-pay-stripe');
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
            const stripePublishableKey = window.storeProducerConfig.stripePublishableKey || "";
            const payphonePhone = window.storeProducerConfig.payphonePhone || "";
            const payphoneClientId = window.storeProducerConfig.payphoneClientId || "";
            const payphoneAppId = window.storeProducerConfig.payphoneAppId || "";

            let deunaVisible = false;
            let transferVisible = false;
            let stripeVisible = false;
            let paypalVisible = false;
            let payphoneVisible = false;

            function makeCopyBtn(text, label) {
                const safeText = encodeURIComponent(String(text || ''));
                const safeLabel = sanitizeHtml(label);
                return `<button type="button" onclick="navigator.clipboard.writeText(decodeURIComponent('${safeText}')).then(()=>window.showToast('¡${safeLabel} copiado!'))" style="background: rgba(255,255,255,0.08); border: none; border-radius: 6px; color: #8a91a6; cursor: pointer; padding: 3px 8px; font-size: 11px; margin-left: 6px;" title="Copiar ${safeLabel}">📋</button>`;
            }

            const deunaBackendReady = window.storePaymentCapabilities?.deuna === true;
            if (deunaPhone && deunaBackendReady && deunaTab) {
                deunaTab.style.display = 'block';
                const cleanPhone = deunaPhone.replace(/\D/g, '');
                const deunaDeeplink = `deuna://payment?phone=${cleanPhone}`;
                const deunaWhatsapp = `https://wa.me/${cleanPhone}`;

                const deunaPhoneEl = document.getElementById('deuna-info-phone');
                if (deunaPhoneEl) {
                    deunaPhoneEl.innerHTML = `
                        Celular: <strong style="font-size: 18px; letter-spacing: 1px;">${sanitizeHtml(deunaPhone)}</strong>
                        ${makeCopyBtn(deunaPhone, 'Número')}
                    `;
                }
                
                const deunaNameEl = document.getElementById('deuna-info-name');
                if (deunaNameEl) {
                    deunaNameEl.innerHTML = `
                        Titular: <span style="color: #fff; font-weight: 600;">${sanitizeHtml(deunaName)}</span>
                    `;
                }
                const deunaQrImage = document.getElementById('deuna-qr-image');
                if (deunaQrImage) {
                    const qrBase64 = window.storeProducerConfig.deunaQrBase64;
                    if (qrBase64 && isSafeArtworkUrl(qrBase64)) {
                        deunaQrImage.src = qrBase64;
                    } else {
                        // Fallback: dynamic QR generated via api.qrserver.com using the cleanPhone
                        const qrPayload = `deuna://payment?phone=${cleanPhone}`;
                        deunaQrImage.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrPayload)}`;
                    }
                }
                deunaVisible = true;
            } else if (deunaTab) {
                deunaTab.style.display = 'none';
            }

            const pichinchaCard = document.getElementById('store-bank-pichincha-card');
            if (pichinchaAcc && window.storePaymentCapabilities?.transfer === true && pichinchaCard) {
                pichinchaCard.style.display = 'block';
                const pichName = window.storeProducerConfig.bankPichinchaName || "";
                const pichType = window.storeProducerConfig.bankPichinchaType || "Ahorros";
                pichinchaCard.innerHTML = `
                    <div style="font-weight: 700; font-size: 12px; color: #f59e0b; margin-bottom: 8px;">🏦 BANCO PICHINCHA</div>
                    <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta (${sanitizeHtml(pichType)}): <strong id="pichincha-info-acc">${sanitizeHtml(pichinchaAcc)}</strong> ${makeCopyBtn(pichinchaAcc, 'Cuenta')}</div>
                    <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="pichincha-info-name">${sanitizeHtml(pichName)}</span> ${makeCopyBtn(pichName, 'Titular')}</div>
                `;
                transferVisible = true;
            } else if (pichinchaCard) {
                pichinchaCard.style.display = 'none';
            }

            const guayaquilCard = document.getElementById('store-bank-guayaquil-card');
            if (guayaquilAcc && window.storePaymentCapabilities?.transfer === true && guayaquilCard) {
                guayaquilCard.style.display = 'block';
                const guayName = window.storeProducerConfig.bankGuayaquilName || "";
                const guayType = window.storeProducerConfig.bankGuayaquilType || "Corriente";
                guayaquilCard.innerHTML = `
                    <div style="font-weight: 700; font-size: 12px; color: #ec4899; margin-bottom: 8px;">🏦 BANCO GUAYAQUIL</div>
                    <div style="font-size: 13px; color: #fff; margin-bottom: 4px;">Cuenta (${sanitizeHtml(guayType)}): <strong id="guayaquil-info-acc">${sanitizeHtml(guayaquilAcc)}</strong> ${makeCopyBtn(guayaquilAcc, 'Cuenta')}</div>
                    <div style="font-size: 12px; color: #8a91a6; margin-bottom: 2px;">Titular: <span id="guayaquil-info-name">${sanitizeHtml(guayName)}</span> ${makeCopyBtn(guayName, 'Titular')}</div>
                `;
                transferVisible = true;
            } else if (guayaquilCard) {
                guayaquilCard.style.display = 'none';
            }

            if (transferTab) {
                transferTab.style.display = transferVisible ? 'block' : 'none';
            }

            if ((paypalClientId || paypalEmail) && window.storePaymentCapabilities?.paypal === true && paypalTab) {
                paypalTab.style.display = 'block';
                paypalVisible = true;
            } else if (paypalTab) {
                paypalTab.style.display = 'none';
            }

            const expressBox = document.getElementById('checkout-express-box');
            if (expressBox) {
                const canExpress = (paypalClientId || paypalEmail) && window.storePaymentCapabilities?.paypal === true;
                expressBox.style.display = canExpress ? 'block' : 'none';
            }

            if (paypalClientId && window.storePaymentCapabilities?.paypal === true) {
                loadStorePayPalSDK(paypalClientId, () => {
                    renderStorePayPalButton(paypalClientId);
                });
            }

            if (window.storePaymentCapabilities?.stripe === true && stripeTab) {
                stripeTab.style.display = 'block';
                stripeVisible = true;
                const stripeTotal = document.getElementById('stripe-total-price');
                if (stripeTotal) stripeTotal.textContent = `$${Number(window.getCheckoutBasePrice()).toFixed(2)} USD`;
            } else if (stripeTab) {
                stripeTab.style.display = 'none';
            }

            const payphoneTab = document.getElementById('btn-pay-payphone');
            if (payphoneTab && window.storePaymentCapabilities?.payphone === true) {
                payphoneTab.style.display = 'block';
                payphoneVisible = true;
            } else if (payphoneTab) {
                payphoneTab.style.display = 'none';
            }

            // La reserva por licencia previa se cobra exclusivamente por el
            // Checkout Stripe que vuelve a verificar el vínculo firmado y la
            // fecha de corte. Ocultar métodos manuales evita que alguien pague
            // por una ruta que no puede aplicar esa validación en servidor.
            const isPriorLicenseUpgrade = Boolean(window.checkoutUpgradeContext?.sourcePaymentId);
            if (isPriorLicenseUpgrade) {
                deunaVisible = false;
                transferVisible = false;
                paypalVisible = false;
                payphoneVisible = false;
                if (deunaTab) deunaTab.style.display = 'none';
                if (transferTab) transferTab.style.display = 'none';
                if (paypalTab) paypalTab.style.display = 'none';
                if (payphoneTab) payphoneTab.style.display = 'none';
                if (offerTab) offerTab.style.display = 'none';
            }

            if (!deunaVisible && !transferVisible && !stripeVisible && !paypalVisible && !payphoneVisible && checkoutSelectedLicense !== 'exclusive') {
                const deunaPanel = document.getElementById('store-pay-deuna');
                const transferPanel = document.getElementById('store-pay-transfer');
                const paypalPanel = document.getElementById('store-pay-paypal');
                const stripePanel = document.getElementById('store-pay-stripe');
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
                if (stripePanel) stripePanel.style.display = 'none';
                const receiptSec = document.getElementById('store-receipt-upload-section');
                if (receiptSec) receiptSec.style.display = 'none';
                footerNextBtn.style.display = 'none';
            } else {
                let defaultTab = 'stripe';
                const currentTab = getSelectedStorePaymentMethod();
                
                if (currentTab === 'offer' && checkoutSelectedLicense !== 'exclusive') {
                    if (stripeVisible) defaultTab = 'stripe';
                    else if (paypalVisible) defaultTab = 'paypal';
                    else if (payphoneVisible) defaultTab = 'payphone';
                    else if (deunaVisible) defaultTab = 'deuna';
                    else if (transferVisible) defaultTab = 'transfer';
                } else if (currentTab === 'offer' && checkoutSelectedLicense === 'exclusive') {
                    defaultTab = 'offer';
                } else if (stripeVisible) {
                    defaultTab = 'stripe';
                } else if (paypalVisible) {
                    defaultTab = 'paypal';
                } else if (payphoneVisible) {
                    defaultTab = 'payphone';
                } else if (deunaVisible) {
                    defaultTab = 'deuna';
                } else if (transferVisible) {
                    defaultTab = 'transfer';
                } else if (checkoutSelectedLicense === 'exclusive') {
                    defaultTab = 'offer';
                }
                window.switchStorePaymentMethod(defaultTab);
            }
            onAcceptTermsChange();
        }
    }
}

export function switchStorePaymentMethod(method) {
    if (window.checkoutUpgradeContext?.sourcePaymentId && method !== 'stripe') {
        window.showToast?.('Esta ampliación se procesa únicamente con Stripe para validar la licencia original.', true);
        method = 'stripe';
    }
    // Cleanup Deuna payment listener if switching away from deuna
    if (method !== 'deuna' && deunaListenerUnsubscribe) {
        deunaListenerUnsubscribe();
        deunaListenerUnsubscribe = null;
        const deunaStatusMsg = document.getElementById('deuna-status-message');
        if (deunaStatusMsg) deunaStatusMsg.innerHTML = '';
        const mobilePayBtn = document.getElementById('deuna-mobile-pay-btn');
        if (mobilePayBtn) mobilePayBtn.style.display = 'none';
    }

    // Update active card styles
    document.querySelectorAll('.pay-card-btn').forEach(btn => {
        const id = btn.id;
        const isCurrent = id === `btn-pay-${method}`;
        btn.setAttribute('aria-pressed', String(isCurrent));
        if (isCurrent) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Show/hide payment sections
    document.getElementById('store-pay-deuna').style.display = method === 'deuna' ? 'block' : 'none';
    document.getElementById('store-pay-transfer').style.display = method === 'transfer' ? 'block' : 'none';
    const stripePanel = document.getElementById('store-pay-stripe');
    if (stripePanel) stripePanel.style.display = method === 'stripe' ? 'block' : 'none';
    document.getElementById('store-pay-paypal').style.display = method === 'paypal' ? 'block' : 'none';
    const payphonePanel = document.getElementById('store-pay-payphone');
    if (payphonePanel) payphonePanel.style.display = method === 'payphone' ? 'block' : 'none';
    const offerPanel = document.getElementById('store-pay-offer');
    if (offerPanel) offerPanel.style.display = method === 'offer' ? 'block' : 'none';

    // Handle receipt section & Confirm button visibility
    const nextBtn = document.getElementById('btn-checkout-next');
    const receiptSection = document.getElementById('store-receipt-upload-section');

    if (method === 'stripe') {
        receiptSection.style.display = 'none';
        nextBtn.style.display = 'none';
        const stripeTotal = document.getElementById('stripe-total-price');
        if (stripeTotal) stripeTotal.textContent = `$${Number(window.getCheckoutBasePrice()).toFixed(2)} USD`;
    } else if (method === 'offer') {
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
        loadStorePayphoneSDK((error) => {
            if (error) {
                if (payphoneButtonContainer) {
                    payphoneButtonContainer.innerHTML = '<div style="color:#ef4444;font-size:13px;text-align:center;padding:14px;">No se pudo cargar PayPhone. Revisa tu conexión e inténtalo nuevamente.</div>';
                }
                return;
            }
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

    // Sincronizar estado del Click-wrap tras cambiar método de pago
    onAcceptTermsChange();
}

export function loadStorePayphoneSDK(callback) {
    const existingScript = document.getElementById('store-payphone-sdk-script');
    if (existingScript) {
        if (existingScript.dataset.loaded === 'true' || typeof PPaymentButtonBox === 'function') {
            callback();
        } else {
            existingScript.addEventListener('load', () => callback(), { once: true });
            existingScript.addEventListener('error', () => callback(new Error('PAYPHONE_SDK_UNAVAILABLE')), { once: true });
        }
        return;
    }
    if (typeof window.loadPayphoneStyles === 'function') {
        window.loadPayphoneStyles();
    } else if (!document.getElementById('payphone-payment-box-styles')) {
        const styleLink = document.createElement('link');
        styleLink.id = 'payphone-payment-box-styles';
        styleLink.rel = 'stylesheet';
        styleLink.href = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.css';
        document.head.appendChild(styleLink);
    }
    const sdk = document.createElement('script');
    sdk.id = 'store-payphone-sdk-script';
    sdk.src = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.js';
    sdk.onload = () => {
        sdk.dataset.loaded = 'true';
        callback();
    };
    sdk.onerror = () => callback(new Error('PAYPHONE_SDK_UNAVAILABLE'));
    document.head.appendChild(sdk);
}

export async function renderStorePayphoneButton() {
    const container = document.getElementById('payphone-button');
    if (!container) return;
    container.innerHTML = '';

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
                <button type="button" onclick="window.showToast('ℹ️ Vista previa de PayPhone. Configura tus credenciales para habilitar cobros reales.')" style="border: 0; background: linear-gradient(135deg, #ff6b35, #ff9500); color: #ffffff; padding: 12px 24px; border-radius: 8px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 12px rgba(255, 107, 53, 0.2); transition: transform 0.2s ease; width: 100%; max-width: 280px; margin: 0 auto;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
                    <span>Pagar con</span>
                    <span style="font-weight: 900; font-size: 17px; letter-spacing: -0.5px;">payphone</span>
                </button>
                <div style="font-size: 10px; color: #8a91a6; margin-top: 10px;">
                    ⚠️ Vista Previa de Integración
                </div>
            </div>
        `;
        return;
    }

    if (!getCheckoutTermsAcceptance()) {
        container.innerHTML = '<div style="color:#8a91a6;font-size:13px;text-align:center;padding:14px;">Acepta los términos y la licencia antes de preparar una referencia PayPhone protegida.</div>';
        return;
    }
    if (window.checkoutUpgradeContext?.sourcePaymentId) {
        container.innerHTML = '<div style="color:#f59e0b;font-size:13px;text-align:center;padding:14px;">Esta ampliación se procesa únicamente con Stripe para validar la licencia original.</div>';
        return;
    }
    if (typeof PPaymentButtonBox !== 'function') {
        container.innerHTML = '<div style="color:#8a91a6;font-size:13px;text-align:center;">Cargando PayPhone...</div>';
        return;
    }

    const buyerName = document.getElementById('store-buyer-name').value.trim();
    const buyerEmail = document.getElementById('store-buyer-email').value.trim();
    const buyerPhone = document.getElementById('store-buyer-phone').value.trim();
    const buyerDni = document.getElementById('store-buyer-dni').value.trim();
    const buyerCity = document.getElementById('store-buyer-city').value.trim();
    const buyerCountry = document.getElementById('store-buyer-country').value.trim();
    const youtubeWhitelist = document.getElementById('store-txt-youtube-whitelist').value.trim();

    if (!buyerName || !buyerEmail) {
        container.innerHTML = '<div style="color: #f59e0b; font-size: 13px; text-align: center;">Por favor completa tu nombre y correo en el Paso anterior.</div>';
        return;
    }

    let invoiceRuc = '';
    let invoiceCompany = '';
    let invoiceAddress = '';
    let invoiceEmail = '';
    if (document.getElementById('store-chk-need-invoice')?.checked) {
        invoiceRuc = document.getElementById('store-invoice-ruc')?.value.trim() || '';
        invoiceCompany = document.getElementById('store-invoice-company')?.value.trim() || '';
        invoiceAddress = document.getElementById('store-invoice-address')?.value.trim() || '';
        invoiceEmail = document.getElementById('store-invoice-email')?.value.trim() || '';
    }

    let items = [];
    if (checkoutSelectedBeatId) {
        items = [{ beatId: checkoutSelectedBeatId, licenseType: checkoutSelectedLicense }];
    } else {
        items = window.cart.map(item => ({
            beatId: item.beatId,
            licenseType: item.licenseType
        }));
    }

    const identity = JSON.stringify({
        producerId: window.storeProducerUid,
        buyerEmail,
        items,
        couponCode: window.checkoutAppliedCoupon || '',
        invoiceRuc
    });
    currentPayphoneAttempt = pendingAttempt(currentPayphoneAttempt, identity);
    if (!currentPayphoneAttempt.statusCredential) {
        currentPayphoneAttempt.statusCredential = await createPaymentStatusCredential();
    }
    if (payphoneInitializationPromise) return payphoneInitializationPromise;

    container.innerHTML = '<div style="color:#8a91a6;font-size:13px;text-align:center;">Protegiendo importe y referencia...</div>';
    payphoneInitializationPromise = (async () => {
        const response = await fetch('/api/payments/payphone/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'prepare',
                requestId: currentPayphoneAttempt.requestId,
                producerId: window.storeProducerUid,
                items,
                buyerName,
                buyerEmail,
                buyerPhone,
                buyerDni,
                buyerCity,
                buyerCountry,
                youtubeWhitelist,
                invoiceRuc,
                invoiceCompany,
                invoiceAddress,
                invoiceEmail,
                couponCode: window.checkoutAppliedCoupon || '',
                acceptedTerms: true,
                acceptanceTimestamp: currentPayphoneAttempt.acceptanceTimestamp,
                termsVersion: currentPayphoneAttempt.termsVersion,
                statusTokenHash: currentPayphoneAttempt.statusCredential.hash
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success || !result.clientTxId || !Number.isInteger(result.amountCents)) {
            const error = new Error(result.error || 'No se pudo preparar PayPhone.');
            error.code = result.code || '';
            throw error;
        }
        currentPayphoneAttempt.result = result;
        localStorage.setItem(`payphone_pending_${result.clientTxId}`, JSON.stringify({
            statusToken: currentPayphoneAttempt.statusCredential.token,
            expiresAt: result.expiresAt
        }));
        container.innerHTML = '';
        const ppb = new PPaymentButtonBox({
            token,
            clientTransactionId: result.clientTxId,
            amount: result.amountCents,
            amountWithoutTax: result.amountCents,
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
    })();
    try {
        await payphoneInitializationPromise;
    } catch (error) {
        console.error('Error preparando PayPhone:', error?.code || error?.message || error);
        if (['CHECKOUT_EXPIRED', 'IDEMPOTENCY_CONFLICT'].includes(error?.code)) currentPayphoneAttempt = null;
        container.innerHTML = `<div style="color:#ef4444;font-size:13px;text-align:center;">${sanitizeHtml(error.message || 'No se pudo preparar PayPhone.')}</div>`;
    } finally {
        payphoneInitializationPromise = null;
    }
}

export function getSelectedStorePaymentMethod() {
    const activeTab = document.querySelector('.pay-card-btn.active');
    if (!activeTab) return 'paypal';
    return activeTab.id.replace('btn-pay-', '');
}

export async function submitExclusiveOffer() {
    const beat = findBeatById(checkoutSelectedBeatId);
    if (!requireCheckoutTermsAcceptance()) return;
    if (!beat) {
        if (typeof window.showToast === 'function') window.showToast('El beat ya no está disponible.', true);
        return;
    }
    let buyerName = sanitizeInput(document.getElementById('store-buyer-name').value);
    let buyerEmail = sanitizeInput(document.getElementById('store-buyer-email').value);
    const buyerPhone = sanitizeInput(document.getElementById('store-buyer-phone').value);
    let buyerDni = sanitizeInput(document.getElementById('store-buyer-dni').value);
    let buyerCity = sanitizeInput(document.getElementById('store-buyer-city').value);
    const buyerCountry = sanitizeInput(document.getElementById('store-buyer-country').value);
    const youtubeWhitelist = sanitizeInput(document.getElementById('store-txt-youtube-whitelist').value);
    const offerPrice = parseFloat(document.getElementById('offer-price-input').value);
    const offerMessage = sanitizeInput(document.getElementById('offer-message-input').value);
    let invoiceRuc = '';
    let invoiceCompany = '';
    let invoiceAddress = '';
    let invoiceEmail = '';

    // Si requiere factura con RUC, validamos y sobrescribimos los datos del comprador
    const needInvoice = document.getElementById('store-chk-need-invoice')?.checked;
    if (needInvoice) {
        const rucVal = sanitizeInput(document.getElementById('store-invoice-ruc').value);
        const companyVal = sanitizeInput(document.getElementById('store-invoice-company').value);
        const addressVal = sanitizeInput(document.getElementById('store-invoice-address').value);
        const emailVal = sanitizeInput(document.getElementById('store-invoice-email').value);

        if (!rucVal || !companyVal || !addressVal || !emailVal) {
            if (typeof window.showToast === 'function') window.showToast('Por favor completa todos los campos de facturación RUC.', true);
            window.updateCheckoutStepView(2);
            return;
        }
        if (rucVal.length !== 13) {
            if (typeof window.showToast === 'function') window.showToast('El RUC del negocio debe tener exactamente 13 dígitos.', true);
            window.updateCheckoutStepView(2);
            return;
        }

        buyerDni = rucVal;
        buyerName = companyVal;
        buyerEmail = emailVal;
        buyerCity = addressVal; // Usar dirección fiscal
        invoiceRuc = rucVal;
        invoiceCompany = companyVal;
        invoiceAddress = addressVal;
        invoiceEmail = emailVal;
    }

    if (!buyerName || !buyerEmail) {
        if (typeof window.showToast === 'function') window.showToast('Por favor completa tu Nombre y Correo Electrónico.', true);
        window.updateCheckoutStepView(2);
        return;
    }
    if (!offerPrice || offerPrice < 250) {
        if (typeof window.showToast === 'function') window.showToast('El monto mínimo para ofertas es de $250 USD.', true);
        return;
    }

    try {
        const nextBtn = document.getElementById('btn-checkout-next');
        const originalText = nextBtn?.innerHTML || '📩 Enviar Oferta';
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.innerHTML = '⏳ Enviando oferta...';
        }
        const identity = JSON.stringify({
            producerId: window.storeProducerUid,
            beatId: checkoutSelectedBeatId,
            buyerEmail,
            offerPrice,
            offerMessage,
            invoiceRuc
        });
        pendingOfferAttempt = pendingAttempt(pendingOfferAttempt, identity);
        await postPendingOrder({
            action: 'create',
            requestId: pendingOfferAttempt.requestId,
            type: 'exclusive_offer',
            producerId: window.storeProducerUid,
            items: [{ beatId: checkoutSelectedBeatId, licenseType: 'exclusive' }],
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerDni,
            buyerCity,
            buyerCountry,
            youtubeWhitelist,
            invoiceRuc,
            invoiceCompany,
            invoiceAddress,
            invoiceEmail,
            offerPrice,
            offerMessage,
            acceptedTerms: true,
            acceptanceTimestamp: pendingOfferAttempt.acceptanceTimestamp,
            termsVersion: pendingOfferAttempt.termsVersion
        });
        pendingOfferAttempt = null;

        if (typeof window.showToast === 'function') window.showToast('✅ ¡Oferta enviada! El productor la revisará y te contactará pronto.');
        document.getElementById('beat-checkout-modal').style.display = 'none';
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = originalText;
        }
    } catch (e) {
        console.error("Error al enviar oferta:", e);
        if (typeof window.showToast === 'function') window.showToast("Error al enviar oferta: " + e.message, true);
        const nextBtn = document.getElementById('btn-checkout-next');
        if (nextBtn) {
            nextBtn.disabled = false;
            nextBtn.innerHTML = '📩 Enviar Oferta';
        }
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

    const buyerName = sanitizeInput(document.getElementById('free-buyer-name').value);
    const buyerEmail = sanitizeInput(document.getElementById('free-buyer-email').value);
    const buyerPhone = sanitizeInput(document.getElementById('free-buyer-phone').value);

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
        return '/producer_sossa.webp';
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

    const configuredArtwork = config?.defaultBeatArtworkUrl || config?.defaultBeatArtwork;
    if (typeof configuredArtwork === 'string' && configuredArtwork.trim() !== '' && isSafeArtworkUrl(configuredArtwork)) {
        return configuredArtwork.trim();
    }
    
    let art = (beat.artwork || '').trim();
    art = art.replace(/^["']|["']$/g, '').trim();
    
    const lowerArt = art.toLowerCase();
    if (art !== '' && lowerArt !== 'null' && lowerArt !== 'undefined' && lowerArt !== 'none' && !lowerArt.includes('placeholder') && isSafeArtworkUrl(art)) {
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
        if (producerLogo !== '' && lowerLogo !== 'null' && lowerLogo !== 'undefined' && lowerLogo !== 'none' && isSafeArtworkUrl(producerLogo)) {
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
        closeCheckoutLegalDocument();
        const modal = document.getElementById('beat-checkout-modal');
        if (modal) {
            modal.style.display = 'none';
        }
        // Cleanup Deuna payment listener if active
        if (deunaListenerUnsubscribe) {
            deunaListenerUnsubscribe();
            deunaListenerUnsubscribe = null;
        }
    };

    const cancelBtn = document.getElementById('btn-checkout-cancel');
    const prevBtn = document.getElementById('btn-checkout-prev');
    const nextBtn = document.getElementById('btn-checkout-next');
    const closeBtn = document.getElementById('btn-close-checkout-modal');
    const stripeButton = document.getElementById('btn-stripe-checkout');
    const legalModal = document.getElementById('checkout-legal-modal');
    const expressPaypalBtn = document.getElementById('btn-express-paypal');
    
    // File upload
    const uploadReceiptBtn = document.getElementById('btn-store-upload-receipt');
    const receiptFileInput = document.getElementById('store-receipt-file');
    
    if (closeBtn) closeBtn.addEventListener('click', () => {
        window.closeBeatCheckoutModal();
    });
    
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        window.closeBeatCheckoutModal();
    });

    if (expressPaypalBtn) {
        expressPaypalBtn.addEventListener('click', () => {
            window.switchStorePaymentMethod('paypal');
            const paypalContainer = document.getElementById('store-pay-paypal');
            if (paypalContainer) {
                paypalContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            const clientId = window.storeProducerConfig?.paypalClientId || '';
            if (clientId) {
                loadStorePayPalSDK(clientId, () => {
                    renderStorePayPalButton(clientId);
                });
            }
        });
    }

    legalModal?.addEventListener('click', (event) => {
        if (event.target === legalModal) closeCheckoutLegalDocument();
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && activeCheckoutLegalDocument) {
            closeCheckoutLegalDocument();
        }
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (checkoutCurrentStep > 1) {
            updateCheckoutStepView(checkoutCurrentStep - 1);
        }
    });

    if (nextBtn) nextBtn.addEventListener('click', async () => {
        if (checkoutCurrentStep === 1) {
            if (!requireCheckoutTermsAcceptance()) return;
            updateCheckoutStepView(2);
        } else if (checkoutCurrentStep === 2) {
            const buyerName = sanitizeInput(document.getElementById('store-buyer-name').value);
            const buyerEmail = sanitizeInput(document.getElementById('store-buyer-email').value);
            const buyerDni = sanitizeInput(document.getElementById('store-buyer-dni').value);
            
            if (!buyerName || !buyerEmail) {
                if (typeof window.showToast === 'function') window.showToast('Por favor escribe tu Nombre y Correo Electrónico.', true);
                return;
            }
            
            if (window.storeProducerConfig && window.storeProducerConfig.sriRuc) {
                if (!buyerDni) {
                    if (typeof window.showToast === 'function') window.showToast('Por favor escribe tu Identificación (Cédula/RUC/Pasaporte) para tu factura.', true);
                    return;
                }
                
                // Función de validación SRI
                const validarIdentificacion = (id) => {
                    if (!/^\d+$/.test(id)) return { valido: true, tipo: '06' }; // Pasaporte / Extranjero
                    if (id === '9999999999999') return { valido: true, tipo: '07' }; // Consumidor final
                    
                    if (id.length === 10) {
                        const prov = parseInt(id.substring(0, 2), 10);
                        if (prov < 1 || prov > 24) return { valido: false, msg: 'Cédula inválida (código de provincia incorrecto).' };
                        const digitoVerificador = parseInt(id.substring(9, 10), 10);
                        let suma = 0;
                        for (let i = 0; i < 9; i++) {
                            let val = parseInt(id.charAt(i), 10);
                            if (i % 2 === 0) {
                                val = val * 2;
                                if (val > 9) val = val - 9;
                            }
                            suma += val;
                        }
                        const residuo = suma % 10;
                        const resultado = residuo === 0 ? 0 : 10 - residuo;
                        if (resultado === digitoVerificador) return { valido: true, tipo: '05' };
                        return { valido: false, msg: 'Cédula de identidad incorrecta.' };
                    } else if (id.length === 13) {
                        if (id.substring(10, 13) !== '001') return { valido: false, msg: 'RUC inválido (debe terminar en 001).' };
                        const tercerDigito = parseInt(id.charAt(2), 10);
                        if (tercerDigito < 6) {
                            const cedulaParte = id.substring(0, 10);
                            const resCed = validarIdentificacion(cedulaParte);
                            if (resCed.valido) return { valido: true, tipo: '04' };
                            return { valido: false, msg: 'RUC de persona natural incorrecto.' };
                        } else if (tercerDigito === 6) {
                            const digitoVerificador = parseInt(id.substring(8, 9), 10);
                            const coefs = [3, 2, 7, 6, 5, 4, 3, 2];
                            let suma = 0;
                            for (let i = 0; i < 8; i++) suma += parseInt(id.charAt(i), 10) * coefs[i];
                            const residuo = suma % 11;
                            const resultado = residuo === 0 ? 0 : 11 - residuo;
                            if (resultado === digitoVerificador) return { valido: true, tipo: '04' };
                            return { valido: false, msg: 'RUC de sociedad pública incorrecto.' };
                        } else if (tercerDigito === 9) {
                            const digitoVerificador = parseInt(id.substring(9, 10), 10);
                            const coefs = [4, 3, 2, 7, 6, 5, 4, 3, 2];
                            let suma = 0;
                            for (let i = 0; i < 9; i++) suma += parseInt(id.charAt(i), 10) * coefs[i];
                            const residuo = suma % 11;
                            const resultado = residuo === 0 ? 0 : 11 - residuo;
                            if (resultado === digitoVerificador) return { valido: true, tipo: '04' };
                            return { valido: false, msg: 'RUC de sociedad privada incorrecto.' };
                        }
                        return { valido: false, msg: 'RUC con formato incorrecto.' };
                    }
                    return { valido: true, tipo: '06' };
                };
                
                const validation = validarIdentificacion(buyerDni);
                if (!validation.valido) {
                    if (typeof window.showToast === 'function') window.showToast(validation.msg, true);
                    return;
                }
            }

            // Guardar o limpiar datos en localStorage según la preferencia del usuario
            const rememberChk = document.getElementById('store-chk-remember-me');
            const shouldRemember = rememberChk ? rememberChk.checked : true;
            
            localStorage.setItem('store_remember_data', shouldRemember ? 'true' : 'false');
            
            if (shouldRemember) {
                localStorage.setItem('store_buyer_name', buyerName);
                localStorage.setItem('store_buyer_email', buyerEmail);
                localStorage.setItem('store_buyer_phone', document.getElementById('store-buyer-phone').value.trim());
                localStorage.setItem('store_buyer_dni', buyerDni);
                localStorage.setItem('store_buyer_city', document.getElementById('store-buyer-city').value.trim());
                localStorage.setItem('store_buyer_country', document.getElementById('store-buyer-country').value.trim());
                
                const ytField = document.getElementById('store-txt-youtube-whitelist');
                if (ytField) localStorage.setItem('store_buyer_yt', ytField.value.trim());

                // Guardar datos SRI RUC si está activado
                const needInvoiceChk = document.getElementById('store-chk-need-invoice');
                const needInvoice = needInvoiceChk ? needInvoiceChk.checked : false;
                localStorage.setItem('store_need_invoice', needInvoice ? 'true' : 'false');
                if (needInvoice) {
                    localStorage.setItem('store_invoice_ruc', document.getElementById('store-invoice-ruc').value.trim());
                    localStorage.setItem('store_invoice_company', document.getElementById('store-invoice-company').value.trim());
                    localStorage.setItem('store_invoice_address', document.getElementById('store-invoice-address').value.trim());
                    localStorage.setItem('store_invoice_email', document.getElementById('store-invoice-email').value.trim());
                } else {
                    localStorage.removeItem('store_invoice_ruc');
                    localStorage.removeItem('store_invoice_company');
                    localStorage.removeItem('store_invoice_address');
                    localStorage.removeItem('store_invoice_email');
                }
            } else {
                // Eliminar todos los datos personales guardados si no se desea recordar
                localStorage.removeItem('store_buyer_name');
                localStorage.removeItem('store_buyer_email');
                localStorage.removeItem('store_buyer_phone');
                localStorage.removeItem('store_buyer_dni');
                localStorage.removeItem('store_buyer_city');
                localStorage.removeItem('store_buyer_country');
                localStorage.removeItem('store_buyer_yt');
                localStorage.removeItem('store_need_invoice');
                localStorage.removeItem('store_invoice_ruc');
                localStorage.removeItem('store_invoice_company');
                localStorage.removeItem('store_invoice_address');
                localStorage.removeItem('store_invoice_email');
            }

            updateCheckoutStepView(3);
        } else if (checkoutCurrentStep === 3) {
            const method = getSelectedStorePaymentMethod();
            if (method === 'offer') {
                await submitExclusiveOffer();
            } else if (method === 'stripe') {
                await startStripeCheckout();
            } else if (method !== 'paypal') {
                await submitBeatPurchasePayment(method);
            } else if (window.storeProducerConfig.paypalEmail && !window.storeProducerConfig.paypalClientId) {
                await submitBeatPurchasePayment('paypal_manual');
            } else {
                document.getElementById('beat-checkout-modal').style.display = 'none';
            }
        }
    });

    if (stripeButton) stripeButton.addEventListener('click', startStripeCheckout);

    const cartAddBtn = document.getElementById('btn-checkout-add-to-cart');
    if (cartAddBtn) cartAddBtn.addEventListener('click', () => {
        checkoutDebug("🛒 click: btn-checkout-add-to-cart. ID:", checkoutSelectedBeatId);
        const beat = findBeatById(checkoutSelectedBeatId);
        if (!beat) {
            console.warn("  Cannot add to cart: Beat not found for ID:", checkoutSelectedBeatId);
            return;
        }
        const price = window.getCheckoutPrice();
        const basePrice = getCheckoutBasePrice();
        const producerId = window.storeProducerUid;
        const producerName = window.storeProducerConfig.aka || window.storeProducerConfig.name || 'Productor';
        const artwork = window.getBeatArtwork(beat) || '';

        // Exclusiva validar precio mínimo
        if (checkoutSelectedLicense === 'exclusive' && (isNaN(basePrice) || basePrice < 250)) {
            if (typeof window.showToast === 'function') window.showToast('El monto mínimo para la licencia Exclusiva es de $250 USD.', true);
            return;
        }

        const producerStoreSlug = window.storeProducerConfig.storeSlug || producerName;
        const added = window.addToCart(checkoutSelectedBeatId, checkoutSelectedLicense, basePrice, beat.name, producerId, producerName, artwork, producerStoreSlug);
        if (added) {
            document.getElementById('beat-checkout-modal').style.display = 'none';
        }
    });

    const buyNowBtn = document.getElementById('btn-checkout-buy-now');
    if (buyNowBtn) buyNowBtn.addEventListener('click', () => {
        if (!requireCheckoutTermsAcceptance()) return;
        checkoutDebug("⚡ click: btn-checkout-buy-now. ID:", checkoutSelectedBeatId);
        const beat = findBeatById(checkoutSelectedBeatId);
        if (!beat) {
            console.warn("  Cannot buy now: Beat not found for ID:", checkoutSelectedBeatId);
            return;
        }
        const price = window.getCheckoutPrice();
        const basePrice = getCheckoutBasePrice();
        const producerId = window.storeProducerUid;
        const producerName = window.storeProducerConfig.aka || window.storeProducerConfig.name || 'Productor';
        const artwork = window.getBeatArtwork(beat) || '';

        // Exclusiva validar precio mínimo
        if (checkoutSelectedLicense === 'exclusive' && (isNaN(basePrice) || basePrice < 250)) {
            if (typeof window.showToast === 'function') window.showToast('El monto mínimo para la licencia Exclusiva es de $250 USD.', true);
            return;
        }

        window.cart = [{
            beatId: checkoutSelectedBeatId,
            licenseType: checkoutSelectedLicense,
            price: basePrice,
            beatName: beat.name,
            producerId: producerId,
            producerName: producerName,
            producerStoreSlug: window.storeProducerConfig.storeSlug || producerName,
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
        if (!requireCheckoutTermsAcceptance()) return;
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
            pendingPurchaseAttempt = null;
            return;
        }

        const allowedReceiptTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        const maxReceiptSourceBytes = 8 * 1024 * 1024;
        if (!allowedReceiptTypes.has(file.type) || file.size > maxReceiptSourceBytes) {
            e.target.value = '';
            document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
            storePaymentReceiptBase64 = null;
            pendingPurchaseAttempt = null;
            const reason = file.size > maxReceiptSourceBytes
                ? 'La imagen supera el límite de 8 MB.'
                : 'Usa una imagen JPEG, PNG o WebP.';
            if (typeof window.showToast === 'function') window.showToast(reason, true);
            return;
        }

        document.getElementById('store-receipt-file-name').textContent = file.name;
        storePaymentReceiptBase64 = null;
        pendingPurchaseAttempt = null;

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
                
                // Comprimir como JPEG con calidad 0.7
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
                storePaymentReceiptBase64 = compressedBase64;
            };
            img.onerror = function() {
                receiptFileInput.value = '';
                document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
                storePaymentReceiptBase64 = null;
                if (typeof window.showToast === 'function') window.showToast('No se pudo leer la imagen del comprobante.', true);
            };
            img.src = evt.target.result;
        };
        reader.onerror = function() {
            receiptFileInput.value = '';
            document.getElementById('store-receipt-file-name').textContent = 'Ningún archivo seleccionado';
            storePaymentReceiptBase64 = null;
            if (typeof window.showToast === 'function') window.showToast('No se pudo leer el comprobante.', true);
        };
        reader.readAsDataURL(file);
    });
}

export function loadStorePayPalSDK(clientId, callback) {
    if (!clientId) return;
    if (window.paypal && typeof window.paypal.Buttons === 'function') {
        const existingScript = document.getElementById('store-paypal-sdk-script');
        if (existingScript && existingScript.getAttribute('data-client-id') === clientId) {
            callback();
            return;
        }
    }
    const existingScript = document.getElementById('store-paypal-sdk-script');
    if (existingScript) {
        if (existingScript.getAttribute('data-client-id') === clientId) {
            if (window.paypal && typeof window.paypal.Buttons === 'function') {
                callback();
            } else {
                existingScript.addEventListener('load', callback, { once: true });
            }
            return;
        } else {
            existingScript.remove();
        }
    }
    const sdk = document.createElement('script');
    sdk.id = 'store-paypal-sdk-script';
    sdk.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
    sdk.setAttribute('data-client-id', clientId);
    sdk.onload = callback;
    document.head.appendChild(sdk);
}

async function preparePaidLicenseDeliveries(deliveries, buyerData) {
    if (!Array.isArray(deliveries) || deliveries.length === 0) {
        throw new Error('El servidor no devolvió contratos pendientes para la entrega.');
    }
    if (!window.compileContractData) {
        throw new Error('No se cargó el generador de contratos.');
    }
    if (typeof html2pdf === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
    }
    if (typeof html2pdf === 'undefined') {
        throw new Error('No se pudo cargar el generador de PDF.');
    }

    const container = document.getElementById('buyer-rendered-contract-content');
    if (!container) throw new Error('No se encontró el área de generación del contrato.');

    for (const delivery of deliveries) {
        const contractReference = resolveLicenseReference(delivery);
        if (!isValidLicenseReference(contractReference)) {
            throw new Error('La compra no tiene un código de referencia válido. No se generó ningún contrato oficial.');
        }
        const orderData = {
            ...buyerData,
            beatName: delivery.beatName,
            licenseType: delivery.licenseType,
            reference: contractReference,
            contractReference
        };
        const contract = window.compileContractData(orderData, window.storeProducerConfig, 'licencia_uso', 'es');
        container.innerHTML = contract.html;
        container.classList.add('printing-pdf');

        let pdfBase64;
        try {
            pdfBase64 = await html2pdf().from(container).set({
                margin: [15, 20, 15, 20],
                filename: `Licencia_${String(delivery.licenseType || 'basic').toUpperCase()}_${contractReference}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
            }).outputPdf('datauristring');
        } finally {
            container.classList.remove('printing-pdf');
        }

        const response = await fetch('/api/confirm-purchase?action=upload-license-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                paymentId: delivery.paymentId,
                deliveryToken: delivery.deliveryToken,
                contractReference,
                pdfBase64
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) {
            throw new Error(result.error || 'No se pudo guardar y enviar el contrato PDF.');
        }
    }
}

export function renderStorePayPalButton(clientId) {
    if (!window.paypal || typeof window.paypal.Buttons !== 'function') return;

    const price = window.getCheckoutPrice();
    let description = '';

    if (checkoutSelectedBeatId) {
        const beat = findBeatById(checkoutSelectedBeatId);
        description = `Licencia ${checkoutSelectedLicense.toUpperCase()} - Beat: ${beat ? beat.name : 'Desconocido'}`;
    } else {
        description = `Licencias de Beats: ${window.cart.map(item => `${item.beatName} (${item.licenseType.toUpperCase()})`).join(', ')}`;
    }

    const createOrderAction = function(data, actions) {
        return actions.order.create({
            purchase_units: [{
                amount: {
                    currency_code: 'USD',
                    value: price.toFixed(2)
                },
                description: description.substring(0, 127)
            }]
        });
    };

    const handleApprove = async function(data, actions) {
        return actions.order.capture().then(async function(details) {
            checkoutDebug('PayPal transaction completed:', details);
            if (typeof window.showToast === 'function') window.showToast('Pago aprobado por PayPal. Procesando entrega...');

            let buyerName = document.getElementById('store-buyer-name')?.value?.trim() || '';
            let buyerEmail = document.getElementById('store-buyer-email')?.value?.trim() || '';
            const buyerPhone = document.getElementById('store-buyer-phone')?.value?.trim() || '';
            const buyerDni = document.getElementById('store-buyer-dni')?.value?.trim() || '';
            const buyerCity = document.getElementById('store-buyer-city')?.value?.trim() || '';
            const buyerCountry = document.getElementById('store-buyer-country')?.value?.trim() || '';
            const youtubeWhitelist = document.getElementById('store-txt-youtube-whitelist')?.value?.trim() || '';

            // Auto-rellenar desde la cuenta PayPal si se usó Express Checkout
            if (!buyerName && details.payer?.name) {
                const given = details.payer.name.given_name || '';
                const surname = details.payer.name.surname || '';
                buyerName = `${given} ${surname}`.trim();
            }
            if (!buyerName) buyerName = 'Cliente PayPal';
            if (!buyerEmail && details.payer?.email_address) {
                buyerEmail = details.payer.email_address;
            }

            const nameInput = document.getElementById('store-buyer-name');
            if (nameInput && !nameInput.value) nameInput.value = buyerName;
            const emailInput = document.getElementById('store-buyer-email');
            if (emailInput && !emailInput.value) emailInput.value = buyerEmail;

            try {
                localStorage.setItem('store_buyer_name', buyerName);
                localStorage.setItem('store_buyer_email', buyerEmail);
            } catch (_) {}

            let itemsToProcess = [];
            if (checkoutSelectedBeatId) {
                const beat = findBeatById(checkoutSelectedBeatId);
                itemsToProcess.push({
                    beatId: checkoutSelectedBeatId,
                    beatName: beat ? beat.name : 'Desconocido',
                    licenseType: checkoutSelectedLicense,
                    price: getCheckoutBasePrice()
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
                youtubeWhitelist,
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
                    await preparePaidLicenseDeliveries(result.deliveries, payload);
                    if (typeof window.showToast === 'function') window.showToast('¡Pago verificado, licencia PDF y archivos enviados con éxito!');

                    clearPurchasedItems();
                    document.getElementById('beat-checkout-modal').style.display = 'none';
                    await finalizePaymentSuccess(result.paymentId || details.id, itemsToProcess);
                } else {
                    throw new Error(result.error || 'Error al verificar el pago en el servidor');
                }
            } catch (e) {
                console.error("Fallo al verificar compra:", e);
                if (typeof window.showToast === 'function') window.showToast("Fallo al entregar tus beats. Tu pago fue procesado. Por favor, contacta al productor: " + e.message, true);
            }
        });
    };

    const handleError = function(err) {
        console.error('PayPal store error:', err);
        if (typeof window.showToast === 'function') window.showToast('Error en el pago de PayPal.', true);
    };

    // 1. Renderizar en el contenedor Express superior
    const expressContainer = document.getElementById('store-paypal-express-container');
    if (expressContainer) {
        expressContainer.innerHTML = '';
        try {
            window.paypal.Buttons({
                style: {
                    layout: 'horizontal',
                    color: 'gold',
                    shape: 'rect',
                    label: 'paypal',
                    height: 42,
                    tagline: false
                },
                onClick: function(data, actions) {
                    const termsChk = document.getElementById('store-chk-accept-terms');
                    if (termsChk && !termsChk.checked) {
                        termsChk.checked = true;
                        if (typeof window.onAcceptTermsChange === 'function') window.onAcceptTermsChange();
                    }
                    return actions.resolve();
                },
                createOrder: createOrderAction,
                onApprove: handleApprove,
                onError: handleError
            }).render('#store-paypal-express-container');
        } catch (err) {
            console.warn('Error al renderizar PayPal Express button:', err);
        }
    }

    // 2. Renderizar en el contenedor de método de pago vertical
    const standardContainer = document.getElementById('store-paypal-button-container');
    if (standardContainer) {
        standardContainer.innerHTML = '';
        try {
            window.paypal.Buttons({
                style: {
                    layout: 'vertical',
                    color: 'gold',
                    shape: 'rect',
                    height: 42
                },
                onClick: function(data, actions) {
                    if (!requireCheckoutTermsAcceptance()) {
                        return actions.reject();
                    }
                    return actions.resolve();
                },
                createOrder: createOrderAction,
                onApprove: handleApprove,
                onError: handleError
            }).render('#store-paypal-button-container');
        } catch (err) {
            console.warn('Error al renderizar PayPal standard button:', err);
        }
    }
}

export async function submitBeatPurchasePayment(method, reference = '') {
    if (!requireCheckoutTermsAcceptance()) return;

    const validation = validateAndSaveBuyerCheckoutData({ focusOnError: true });
    if (!validation.ok) return;

    let buyerName = sanitizeInput(document.getElementById('store-buyer-name').value);
    let buyerEmail = sanitizeInput(document.getElementById('store-buyer-email').value);
    const buyerPhone = sanitizeInput(document.getElementById('store-buyer-phone').value);
    let buyerDni = sanitizeInput(document.getElementById('store-buyer-dni').value);
    let buyerCity = sanitizeInput(document.getElementById('store-buyer-city').value);
    const buyerCountry = sanitizeInput(document.getElementById('store-buyer-country').value);
    const youtubeWhitelist = sanitizeInput(document.getElementById('store-txt-youtube-whitelist').value);
    let invoiceRuc = '';
    let invoiceCompany = '';
    let invoiceAddress = '';
    let invoiceEmail = '';

    // Si requiere factura con RUC, validamos y sobrescribimos los datos del comprador
    const needInvoice = document.getElementById('store-chk-need-invoice')?.checked;
    if (needInvoice) {
        const rucVal = sanitizeInput(document.getElementById('store-invoice-ruc').value);
        const companyVal = sanitizeInput(document.getElementById('store-invoice-company').value);
        const addressVal = sanitizeInput(document.getElementById('store-invoice-address').value);
        const emailVal = sanitizeInput(document.getElementById('store-invoice-email').value);

        if (!rucVal || !companyVal || !addressVal || !emailVal) {
            if (typeof window.showToast === 'function') window.showToast('Por favor completa todos los campos de facturación RUC.', true);
            window.updateCheckoutStepView(2);
            return;
        }
        if (rucVal.length !== 13) {
            if (typeof window.showToast === 'function') window.showToast('El RUC del negocio debe tener exactamente 13 dígitos.', true);
            window.updateCheckoutStepView(2);
            return;
        }

        buyerDni = rucVal;
        buyerName = companyVal;
        buyerEmail = emailVal;
        buyerCity = addressVal; // Usar dirección fiscal en lugar de ciudad para el SRI
        invoiceRuc = rucVal;
        invoiceCompany = companyVal;
        invoiceAddress = addressVal;
        invoiceEmail = emailVal;
    }

    if (!buyerName || !buyerEmail) {
        if (typeof window.showToast === 'function') window.showToast('Por favor completa todos los campos del formulario.', true);
        window.updateCheckoutStepView(2);
        return;
    }

    if (!storePaymentReceiptBase64) {
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
            price: getCheckoutBasePrice()
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

    const discountCode = window.checkoutAppliedCoupon || '';

    const nextBtn = document.getElementById('btn-checkout-next');
    const originalText = nextBtn ? nextBtn.innerHTML : 'Confirmar Compra';
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = '⏳ Guardando pedido...';
    }

    try {
        if (method === 'deuna') {
            if (!currentDeunaPaymentId || !currentDeunaStatusToken) {
                await initiateDeunaDynamicPayment();
            }
            if (!currentDeunaPaymentId || !currentDeunaStatusToken) {
                throw new Error('No se pudo crear la referencia segura de Deuna.');
            }
            await postPendingOrder({
                action: 'attach-receipt',
                paymentId: currentDeunaPaymentId,
                statusToken: currentDeunaStatusToken,
                receiptDataUrl: storePaymentReceiptBase64
            });
            if (currentDeunaOrderData) {
                await syncPaymentToLocalBackup({ ...currentDeunaOrderData, id: currentDeunaPaymentId }, currentDeunaPaymentId);
                sendPendingPaymentEmails(currentDeunaOrderData, currentDeunaPaymentId).catch((error) => console.error(error));
            }
            if (typeof window.showToast === 'function') window.showToast('¡Comprobante registrado! Deuna confirmará el pago de forma segura.');
            clearPurchasedItems();
            storePaymentReceiptBase64 = null;
            document.getElementById('beat-checkout-modal').style.display = 'none';
            logCheckoutStep('pending_order_created', { method: 'deuna', itemsCount: 1 });
            if (nextBtn) {
                nextBtn.disabled = false;
                nextBtn.innerHTML = originalText;
            }
            return;
        }

        const normalizedMethod = method === 'paypal' ? 'paypal_manual' : method;
        const identity = JSON.stringify({
            producerId: window.storeProducerUid,
            method: normalizedMethod,
            buyerEmail,
            items: itemsToProcess.map(({ beatId, licenseType }) => ({ beatId, licenseType })),
            couponCode: discountCode,
            receipt: receiptIdentity(storePaymentReceiptBase64),
            invoiceRuc,
            reference: reference || ''
        });
        pendingPurchaseAttempt = pendingAttempt(pendingPurchaseAttempt, identity);
        if (!pendingPurchaseAttempt.statusCredential) {
            pendingPurchaseAttempt.statusCredential = await createPaymentStatusCredential();
        }
        const result = await postPendingOrder({
            action: 'create',
            requestId: pendingPurchaseAttempt.requestId,
            type: 'beat_purchase',
            method: normalizedMethod,
            producerId: window.storeProducerUid,
            items: itemsToProcess.map(({ beatId, licenseType }) => ({ beatId, licenseType })),
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerDni,
            buyerCity,
            buyerCountry,
            youtubeWhitelist,
            invoiceRuc,
            invoiceCompany,
            invoiceAddress,
            invoiceEmail,
            couponCode: discountCode,
            receiptDataUrl: storePaymentReceiptBase64,
            statusTokenHash: pendingPurchaseAttempt.statusCredential.hash,
            acceptedTerms: true,
            acceptanceTimestamp: pendingPurchaseAttempt.acceptanceTimestamp,
            termsVersion: pendingPurchaseAttempt.termsVersion
        });
        const statusToken = pendingPurchaseAttempt.statusCredential.token;
        for (const payment of result.payments || []) {
            const orderData = {
                type: 'beat_purchase',
                producerId: window.storeProducerUid,
                beatId: payment.beatId,
                beatName: payment.beatName,
                licenseType: payment.licenseType,
                price: payment.originalPrice,
                buyerName,
                buyerEmail,
                buyerPhone,
                buyerDni,
                buyerCity,
                buyerCountry,
                youtubeWhitelist,
                invoiceRuc,
                invoiceCompany,
                invoiceAddress,
                invoiceEmail,
                method: result.method,
                reference: result.reference,
                receiptUrl: '',
                status: 'pending',
                discountPercent: result.discountPercent,
                couponCode: result.couponCode,
                originalPrice: payment.originalPrice,
                finalPrice: payment.finalPrice,
                timestamp: new Date().toISOString(),
                acceptedTerms: true,
                acceptanceTimestamp: pendingPurchaseAttempt.acceptanceTimestamp
            };
            await syncPaymentToLocalBackup({ ...orderData, id: payment.paymentId }, payment.paymentId);
            try {
                sessionStorage.setItem(`beatss_pending_status_${payment.paymentId}`, statusToken);
            } catch (_) {}
            sendPendingPaymentEmails(orderData, payment.paymentId).catch((error) => console.error(error));
        }
        pendingPurchaseAttempt = null;
        if (typeof window.showToast === 'function') window.showToast('¡Pedido registrado! El productor verificará el comprobante antes de la entrega.');
        clearPurchasedItems();
        storePaymentReceiptBase64 = null;
        document.getElementById('beat-checkout-modal').style.display = 'none';
        logCheckoutStep('pending_order_created', { method: normalizedMethod, itemsCount: result.payments?.length || 0 });
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

export async function syncPaymentToLocalBackup(orderData, paymentId) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
        return;
    }
    try {
        checkoutDebug("💾 Sincronizando pago nuevo a backup local en localhost...", paymentId);
        const user = window.storeProducerConfig?.aka?.toLowerCase() === 'cg monarco' ? 'cgmonarco' : 'sossa';
        
        // 1. Cargar el backup actual
        const loadRes = await fetch(`/api/load-local?user=${user}`);
        if (!loadRes.ok) return;
        const dbData = await loadRes.json();
        
        // 2. Obtener la lista de historial
        const historyKey = `${user}_license_history`;
        let history = [];
        try {
            history = JSON.parse(dbData[historyKey] || '[]');
        } catch (e) {
            history = [];
        }
        
        // 3. Crear el registro del pago para el historial
        const paymentEntry = {
            id: paymentId,
            ...orderData
        };
        
        // Evitar duplicados
        if (!history.some(x => x.id === paymentId)) {
            history.unshift(paymentEntry);
        }
        
        dbData[historyKey] = JSON.stringify(history);
        
        // 4. Guardar el backup actualizado
        const headers = typeof window.getLocalHeaders === 'function'
            ? await window.getLocalHeaders()
            : { 'Content-Type': 'application/json' };

        await fetch(`/api/save-local?user=${user}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(dbData)
        });
        checkoutDebug("✅ Pago nuevo sincronizado localmente con éxito.");
    } catch (err) {
        console.warn("No se pudo sincronizar el pago nuevo al backup local:", err);
    }
}

export async function sendPendingPaymentEmails(orderData, paymentId) {
    try {
        checkoutDebug("🚀 Iniciando envío de correos de espera para pago pendiente:", paymentId);
        
        const serviceId = window.storeProducerConfig.emailjsServiceId || '';
        const templateId = window.storeProducerConfig.emailjsTemplatePendingId || '';
        const publicKey = window.storeProducerConfig.emailjsPublicKey || '';
        if (!serviceId || !templateId || !publicKey) {
            throw new Error('El productor no ha configurado el servicio de correo. El pedido permanece disponible en el portal.');
        }

        // 1. Cargar EmailJS si no está presente
        if (typeof emailjs === 'undefined') {
            try {
                await loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');
            } catch (e) {
                console.error("No se pudo cargar EmailJS para correos de espera:", e);
                return;
            }
        }

        // Inicializar si es necesario
        if (typeof emailjs !== 'undefined' && publicKey) {
            emailjs.init(publicKey);
        }

        const typeLabels = {
            basic: 'Licencia Básica',
            premium: 'Licencia Premium',
            premium_plus: 'Licencia Premium Plus',
            unlimited: 'Licencia Ilimitada',
            exclusive: 'Licencia Exclusiva'
        };
        const type = orderData.licenseType || 'basic';
        const methodLabel = orderData.method === 'deuna'
            ? 'Deuna!'
            : orderData.method === 'paypal_manual'
                ? 'PayPal'
                : 'Transferencia Bancaria';

        // 2. Correo para el Comprador (Confirmación de Recepción)
        const buyerMessage = `
<div style="background-color: #fef3c7; border: 1px solid #f59e0b; color: #b45309; padding: 20px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-top: 15px;">
    <h3 style="margin-top: 0; color: #92400e;">⏳ Comprobante de pago recibido</h3>
    Hemos recibido con éxito tu comprobante de pago vía <strong>${methodLabel}</strong> para la compra del beat <strong>"${orderData.beatName}"</strong>.<br/><br/>
    El productor está verificando la transacción. Tan pronto como sea validada y aprobada, recibirás un nuevo correo electrónico automático con los enlaces de descarga directa de tus archivos (MP3, WAV, Stems) y el contrato de la licencia <strong>${typeLabels[type] || type}</strong> firmado.<br/><br/>
    <strong>Detalles de la Orden:</strong><br/>
    • ID de Orden: ${paymentId}<br/>
    • Referencia: ${orderData.reference || 'N/A'}<br/>
    • Valor: $${(orderData.finalPrice || orderData.price || 0).toFixed(2)} USD
</div>
        `;

        const buyerParams = {
            to_name: orderData.buyerName,
            to_email: orderData.buyerEmail,
            beat_name: orderData.beatName,
            license_type: typeLabels[type] || type,
            delivery_links: buyerMessage,
            producer_name: window.storeProducerConfig.aka || "Productor",
            producer_email: window.storeProducerConfig.email || "",
            pdf_filename: ""
        };

        await emailjs.send(serviceId, templateId, buyerParams);
        window.recordEmailEvent?.({
            category: 'pending_payment', status: 'sent', recipientEmail: orderData.buyerEmail, recipientName: orderData.buyerName,
            subject: `Comprobante recibido - Orden #${paymentId}`, beatName: orderData.beatName, reference: orderData.reference,
            paymentId, licenseType: type, templateId
        });
        checkoutDebug("📧 Correo de confirmación enviado al comprador.");

        // 3. Correo para el Productor (Notificación de Venta Pendiente)
        if (window.storeProducerConfig.email) {
            const producerMessage = `
<div style="background-color: #eff6ff; border: 1px solid #3b82f6; color: #1d4ed8; padding: 20px; border-radius: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; margin-top: 15px;">
    <h3 style="margin-top: 0; color: #1e40af;">🔔 Nueva venta pendiente de aprobación</h3>
    El cliente <strong>${orderData.buyerName}</strong> (${orderData.buyerEmail}) ha subido un comprobante de pago de <strong>${methodLabel}</strong> por el beat <strong>"${orderData.beatName}"</strong>.<br/><br/>
    <strong>Detalles del Pago:</strong><br/>
    • Valor: $${(orderData.finalPrice || orderData.price || 0).toFixed(2)} USD<br/>
    • ID de Pedido: ${paymentId}<br/>
    • Referencia: ${orderData.reference || 'N/A'}<br/><br/>
    Por favor ingresa a tu panel de administración en <a href="https://beatss.app" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">beatss.app</a> para revisar el comprobante y aprobar o rechazar la entrega.
</div>
            `;

            const producerParams = {
                to_name: window.storeProducerConfig.aka || "Productor",
                to_email: window.storeProducerConfig.email,
                beat_name: orderData.beatName,
                license_type: typeLabels[type] || type,
                delivery_links: producerMessage,
                producer_name: window.storeProducerConfig.aka || "Productor",
                producer_email: window.storeProducerConfig.email || "",
                pdf_filename: ""
            };

            await emailjs.send(serviceId, templateId, producerParams);
            window.recordEmailEvent?.({
                category: 'payment_notification', status: 'sent', recipientEmail: window.storeProducerConfig.email,
                recipientName: window.storeProducerConfig.aka || 'Productor', subject: 'Nueva venta pendiente de aprobación',
                beatName: orderData.beatName, reference: orderData.reference, paymentId, licenseType: type, templateId
            });
            checkoutDebug("📧 Correo de notificación enviado al productor.");
        }

    } catch (err) {
        console.warn("Fallo al enviar correos automáticos de pago pendiente:", err);
        window.recordEmailEvent?.({
            category: 'pending_payment', status: 'failed', recipientEmail: orderData?.buyerEmail, recipientName: orderData?.buyerName,
            subject: `Comprobante recibido - Orden #${paymentId}`, beatName: orderData?.beatName, reference: orderData?.reference,
            paymentId, templateId: window.storeProducerConfig?.emailjsTemplatePendingId || '', errorMessage: err?.message || 'Error de EmailJS'
        });
    }
}

export async function autoDeliverBeatSale(paymentId, orderData) {
    try {
        checkoutDebug("🚀 Preparando portal seguro para el pago:", paymentId);
        if (typeof html2pdf === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }
        if (!window.compileContractData || typeof html2pdf === 'undefined') {
            throw new Error('No se pudieron cargar las utilidades necesarias para generar el contrato PDF.');
        }
        const contractData = window.compileContractData(orderData, window.storeProducerConfig, 'licencia_uso', 'es');
        const container = document.getElementById('buyer-rendered-contract-content');
        if (!container) throw new Error('No se encontró el área de generación del contrato.');
        container.innerHTML = contractData.html;
        container.classList.add('printing-pdf');
        let pdfBase64;
        try {
            pdfBase64 = await html2pdf().from(container).set({
                margin: [15, 20, 15, 20],
                filename: `Licencia_${orderData.licenseType.toUpperCase()}_${orderData.reference}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
                pagebreak: { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
            }).outputPdf('datauristring');
        } finally {
            container.classList.remove('printing-pdf');
        }

        const response = await fetch('/api/license-delivery', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Beatss-Status-Token': orderData.statusToken || ''
            },
            body: JSON.stringify({
                paymentId,
                statusToken: orderData.statusToken || '',
                deliveryToken: orderData.deliveryToken || '',
                contractReference: orderData.contractReference || orderData.reference,
                licenseType: orderData.licenseType,
                pdfBase64,
                contractRendererVersion: 'buyer-contract-v1'
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.error || 'No se pudo preparar el portal de entrega.');
        checkoutDebug("📧 Portal seguro enviado al comprador.");
        return true;
    } catch (err) {
        console.error("Fallo al enviar correo automático de PayPal:", err);
        window.recordEmailEvent?.({
            category: 'license_delivery', status: 'failed', recipientEmail: orderData?.buyerEmail, recipientName: orderData?.buyerName,
            subject: `Tu licencia de "${orderData?.beatName || ''}" - BEATSS`, beatName: orderData?.beatName,
            reference: orderData?.reference, paymentId, templateId: window.storeProducerConfig?.emailjsTemplateId || '', errorMessage: err?.message || 'Error de EmailJS'
        });
        return false;
    }
}

function appendCheckoutLegalSection(container, title, paragraphs = [], items = []) {
    const heading = document.createElement('h3');
    heading.textContent = title;
    container.appendChild(heading);

    paragraphs.forEach((copy) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = copy;
        container.appendChild(paragraph);
    });

    if (items.length) {
        const list = document.createElement('ul');
        items.forEach((copy) => {
            const item = document.createElement('li');
            item.textContent = copy;
            list.appendChild(item);
        });
        container.appendChild(list);
    }
}

function renderCheckoutLegalDocument(kind) {
    const title = document.getElementById('checkout-legal-title');
    const kicker = document.getElementById('checkout-legal-kicker');
    const body = document.getElementById('checkout-legal-body');
    if (!title || !kicker || !body) return;

    body.replaceChildren();

    if (kind === 'license') {
        const config = LICENSE_CONFIGS[checkoutSelectedLicense] || LICENSE_CONFIGS.basic;
        const price = getCheckoutBasePrice();
        title.textContent = `Licencia ${config.name}`;
        kicker.textContent = 'Licencia seleccionada';

        const notice = document.createElement('p');
        notice.className = 'checkout-legal-notice';
        notice.textContent = 'Este resumen te permite revisar la selección antes de pagar. El contrato PDF generado para la orden contiene las cláusulas completas y prevalece sobre este resumen.';
        body.appendChild(notice);

        appendCheckoutLegalSection(body, 'Alcance principal', [], [
            `Precio actual: $${Number(price || 0).toFixed(2)} USD.`,
            `Archivos incluidos: ${config.formats}.`,
            `Reproducciones autorizadas: ${config.streams}.`,
            `Copias físicas: ${config.physical}.`,
            `Uso audiovisual: ${config.videos}; duración indicada: ${config.videoDuration}.`,
            `Vigencia: ${config.years}.`
        ]);
        appendCheckoutLegalSection(body, 'Créditos y composición', [], [
            `Crédito requerido: ${config.credits}.`,
            `Participación autoral indicada: licenciatario ${config.writerShare}% / productor ${config.producerShare}%.`,
            config.contentId
                ? 'No se permite registrar el beat ni la nueva canción en Content ID o sistemas equivalentes sin autorización escrita.'
                : 'El uso controlado de Content ID se rige por las obligaciones y excepciones de la licencia exclusiva.'
        ]);
        appendCheckoutLegalSection(body, 'Entrega', [
            'Los archivos habilitados para esta licencia se entregan mediante los enlaces asociados a la orden aprobada. La disponibilidad de un formato depende de que el productor lo haya cargado correctamente.'
        ]);
        return;
    }

    title.textContent = 'Términos de Servicio';
    kicker.textContent = 'Versión 14 de agosto de 2026';

    const notice = document.createElement('p');
    notice.className = 'checkout-legal-notice';
    notice.textContent = 'Debes aceptar expresamente estos términos y la licencia seleccionada antes de iniciar el pago.';
    body.appendChild(notice);

    appendCheckoutLegalSection(body, '1. Servicio', [
        'BEATSS facilita la selección, el pago, el registro y la entrega de licencias musicales ofrecidas por el productor identificado en la tienda. El productor es responsable del beat, de los derechos que ofrece y de los archivos de entrega.'
    ]);
    appendCheckoutLegalSection(body, '2. Compra y licencia', [
        'El precio, los formatos, los límites de uso y la vigencia dependen de la licencia seleccionada. Antes de pagar puedes abrir “Ver licencia seleccionada”. Después de aprobarse la orden se genera el documento contractual correspondiente.'
    ]);
    appendCheckoutLegalSection(body, '3. Pago y confirmación', [
        'La orden sólo se considera pagada cuando el proveedor de pago y BEATSS confirman la operación. Una pantalla de checkout abierta o una orden pendiente no equivalen a pago aprobado ni a licencia emitida.'
    ]);
    appendCheckoutLegalSection(body, '4. Datos y entrega', [
        'Los datos proporcionados se utilizan para procesar la orden, emitir la licencia, entregar los archivos, prevenir fraude y atender obligaciones legales o de soporte. Debes introducir información correcta y un correo al que tengas acceso.'
    ]);
    appendCheckoutLegalSection(body, '5. Uso permitido', [
        'No puedes exceder los límites de la licencia, revender los archivos originales, atribuirte la producción del beat ni usar sistemas de identificación de contenido cuando la licencia lo prohíba.'
    ]);
    appendCheckoutLegalSection(body, '6. Aceptación y registro', [
        'Al marcar la casilla confirmas que pudiste abrir y revisar ambos documentos. La orden conserva la aceptación y su fecha como parte del registro transaccional.'
    ]);
}

export function openCheckoutLegalDocument(kind = 'terms', trigger = null) {
    const modal = document.getElementById('checkout-legal-modal');
    if (!modal) return;

    const normalizedKind = kind === 'license' ? 'license' : 'terms';
    lastCheckoutLegalTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    activeCheckoutLegalDocument = normalizedKind;
    renderCheckoutLegalDocument(normalizedKind);
    modal.hidden = false;
    modal.removeAttribute('inert');
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    document.getElementById('btn-close-checkout-legal')?.focus();
}

export function closeCheckoutLegalDocument() {
    const modal = document.getElementById('checkout-legal-modal');
    if (!modal) return;

    modal.style.display = 'none';
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    activeCheckoutLegalDocument = null;
    if (lastCheckoutLegalTrigger instanceof HTMLElement && lastCheckoutLegalTrigger.isConnected) {
        lastCheckoutLegalTrigger.focus();
    }
}

function checkoutSelectionFingerprint() {
    if (checkoutSelectedBeatId) return `${checkoutSelectedBeatId}:${checkoutSelectedLicense}`;
    return window.cart
        .map(({ beatId, licenseType }) => `${beatId}:${licenseType}`)
        .sort()
        .join('|');
}

function getCheckoutTermsAcceptance() {
    const checkbox = document.getElementById('store-chk-accept-terms');
    if (!checkbox?.checked || !checkoutTermsAcceptance) return null;
    if (checkoutTermsAcceptance.selectionFingerprint !== checkoutSelectionFingerprint()) return null;
    return checkoutTermsAcceptance;
}

function syncCheckoutContinuationControls() {
    const accepted = Boolean(getCheckoutTermsAcceptance());
    document.querySelectorAll('[data-checkout-requires-terms]').forEach((button) => {
        button.disabled = !accepted;
        button.setAttribute('aria-disabled', String(!accepted));
        button.title = accepted ? '' : 'Acepta los términos y la licencia para continuar.';
    });
}

function resetCheckoutTermsAcceptance({ error = false } = {}) {
    checkoutTermsAcceptance = null;
    const checkbox = document.getElementById('store-chk-accept-terms');
    if (checkbox) checkbox.checked = false;
    setCheckoutTermsFeedback({ accepted: false, error });
    syncCheckoutContinuationControls();
}

function requireCheckoutTermsAcceptance() {
    if (getCheckoutTermsAcceptance()) return true;
    onPaymentClickWithoutTerms();
    return false;
}

function setCheckoutTermsFeedback({ accepted = false, error = false } = {}) {
    const section = document.getElementById('checkout-terms-section');
    const checkbox = document.getElementById('store-chk-accept-terms');
    const errorMessage = document.getElementById('checkout-terms-error');
    const state = document.getElementById('checkout-terms-state');

    if (section) {
        section.dataset.accepted = String(accepted);
        section.dataset.error = String(error);
    }
    if (checkbox) checkbox.setAttribute('aria-invalid', String(error));
    if (errorMessage) errorMessage.hidden = !error;
    if (state) state.textContent = accepted ? 'Aceptado' : 'Pendiente';
}

export function onAcceptTermsChange() {
    const chk = document.getElementById('store-chk-accept-terms');
    const accepted = chk ? chk.checked : false;

    const payphoneContainer = document.getElementById('payphone-button');
    const paypalContainer = document.getElementById('store-paypal-button-container');
    const paypalOverlay = document.getElementById('store-paypal-overlay');
    const payphoneOverlay = document.getElementById('store-payphone-overlay');
    const stripeButton = document.getElementById('btn-stripe-checkout');
    const stripeOverlay = document.getElementById('store-stripe-overlay');

    checkoutTermsAcceptance = accepted ? {
        acceptedAt: new Date().toISOString(),
        termsVersion: CHECKOUT_TERMS_VERSION,
        selectionFingerprint: checkoutSelectionFingerprint()
    } : null;
    setCheckoutTermsFeedback({ accepted, error: false });
    syncCheckoutContinuationControls();

    if (accepted) {
        if (payphoneContainer) {
            payphoneContainer.style.opacity = '1';
        }
        if (paypalContainer) {
            paypalContainer.style.opacity = '1';
        }
        if (paypalOverlay) paypalOverlay.style.display = 'none';
        if (payphoneOverlay) payphoneOverlay.style.display = 'none';
        if (stripeButton) {
            stripeButton.disabled = false;
            stripeButton.style.opacity = '1';
            stripeButton.style.pointerEvents = 'auto';
        }
        if (stripeOverlay) stripeOverlay.style.display = 'none';
        if (checkoutCurrentStep === 3 && getSelectedStorePaymentMethod() === 'deuna' && !currentDeunaPaymentId) {
            void initiateDeunaDynamicPayment();
        }
        if (checkoutCurrentStep === 3 && getSelectedStorePaymentMethod() === 'payphone') {
            void renderStorePayphoneButton();
        }
    } else {
        if (payphoneContainer) {
            payphoneContainer.style.opacity = '0.7';
        }
        if (paypalContainer) {
            paypalContainer.style.opacity = '0.7';
        }
        if (paypalOverlay) paypalOverlay.style.display = 'block';
        if (payphoneOverlay) payphoneOverlay.style.display = 'block';
        if (stripeButton) {
            stripeButton.disabled = true;
            stripeButton.style.opacity = '0.7';
            stripeButton.style.pointerEvents = 'none';
        }
        if (stripeOverlay) stripeOverlay.style.display = 'block';
    }
}

export function onPaymentClickWithoutTerms() {
    if (typeof window.showToast === 'function') {
        window.showToast('Debes aceptar los Términos de Servicio y la licencia seleccionada para continuar.', true);
    }
    setCheckoutTermsFeedback({ accepted: false, error: true });
    const checkbox = document.getElementById('store-chk-accept-terms');
    document.getElementById('checkout-terms-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    checkbox?.focus({ preventScroll: true });
}

// Bind to window for global/inline access
window.onPaymentClickWithoutTerms = onPaymentClickWithoutTerms;
window.onAcceptTermsChange = onAcceptTermsChange;
window.openCheckoutLegalDocument = openCheckoutLegalDocument;
window.closeCheckoutLegalDocument = closeCheckoutLegalDocument;
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
window.getCheckoutBasePrice = getCheckoutBasePrice;
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

export async function startStripeCheckout() {
    if (window.storePaymentCapabilities?.stripe !== true) {
        window.showToast?.('Stripe no está habilitado para este productor.', true);
        return;
    }
    const legalAcceptance = getCheckoutTermsAcceptance();
    if (!legalAcceptance) return onPaymentClickWithoutTerms();

    const buyerValidation = validateAndSaveBuyerCheckoutData({ focusOnError: true });
    if (!buyerValidation.ok) return;

    const read = (id) => sanitizeInput(document.getElementById(id)?.value || '');
    let buyerName = read('store-buyer-name');
    let buyerEmail = read('store-buyer-email').toLowerCase();
    let buyerPhone = read('store-buyer-phone');
    let buyerDni = read('store-buyer-dni');
    let buyerCity = read('store-buyer-city');
    const buyerCountry = read('store-buyer-country');
    const youtubeWhitelist = read('store-txt-youtube-whitelist');
    const needsInvoice = Boolean(document.getElementById('store-chk-need-invoice')?.checked);
    const invoiceRuc = read('store-invoice-ruc');
    const invoiceCompany = read('store-invoice-company');
    const invoiceAddress = read('store-invoice-address');
    const invoiceEmail = read('store-invoice-email').toLowerCase();

    if (!buyerName || !/^\S+@\S+\.\S+$/.test(buyerEmail)) {
        window.showToast?.('Completa un nombre y un correo válido antes de continuar.', true);
        return;
    }
    if (needsInvoice) {
        if (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !/^\S+@\S+\.\S+$/.test(invoiceEmail)) {
            window.showToast?.('Completa correctamente los datos de facturación.', true);
            return;
        }
        buyerDni = invoiceRuc;
        buyerName = invoiceCompany;
        buyerEmail = invoiceEmail;
        buyerCity = invoiceAddress;
    }

    const items = checkoutSelectedBeatId
        ? (() => {
            const beat = findBeatById(checkoutSelectedBeatId);
            return beat ? [{ beatId: checkoutSelectedBeatId, beatName: beat.name, licenseType: checkoutSelectedLicense, price: getCheckoutBasePrice() }] : [];
        })()
        : (window.cart || []).map(item => ({ beatId: item.beatId, beatName: item.beatName, licenseType: item.licenseType, price: Number(item.price) }));
    if (!items.length) {
        window.showToast?.('Selecciona al menos un beat antes de pagar.', true);
        return;
    }

    const button = document.getElementById('btn-stripe-checkout');
    const originalText = button?.textContent || 'Pagar de forma segura con Stripe';
    if (button) {
        button.disabled = true;
        button.textContent = 'Conectando con Stripe...';
    }
    try {
        const response = await fetch('/api/payments/stripe/create-checkout-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                producerId: window.storeProducerUid,
                buyerName, buyerEmail, buyerPhone, buyerDni, buyerCity, buyerCountry,
                youtubeWhitelist, items,
                discountPercent: window.checkoutDiscountPercent || 0,
                couponCode: window.checkoutAppliedCoupon || '',
                invoiceRuc: needsInvoice ? invoiceRuc : '',
                invoiceCompany: needsInvoice ? invoiceCompany : '',
                invoiceAddress: needsInvoice ? invoiceAddress : '',
                invoiceEmail: needsInvoice ? invoiceEmail : '',
                needInvoice: needsInvoice,
                acceptedTerms: true,
                acceptanceTimestamp: legalAcceptance.acceptedAt,
                termsVersion: legalAcceptance.termsVersion,
                // Esta referencia sólo existe al entrar desde el portal de
                // una licencia anterior. El servidor vuelve a validar el
                // enlace firmado, el titular, la fecha de exclusiva y el
                // precio; nunca confía en este contexto por sí solo.
                upgradeFromPaymentId: window.checkoutUpgradeContext?.sourcePaymentId || '',
                upgradeAccessToken: window.checkoutUpgradeContext?.accessToken || ''
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.checkoutUrl) throw new Error(result.error || 'No se pudo iniciar Stripe.');
        window.location.assign(result.checkoutUrl);
    } catch (error) {
        console.error('Stripe checkout start error:', error);
        window.showToast?.(error.message || 'No se pudo iniciar el pago con Stripe.', true);
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
            onAcceptTermsChange();
        }
    }
}

function ensureStripeOverlay() {
    let overlay = document.getElementById('stripe-processing-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'stripe-processing-overlay';
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,15,28,.72);backdrop-filter:blur(10px);';
        document.body.appendChild(overlay);
    }
    return overlay;
}

export function closeStripeOverlay() {
    document.getElementById('stripe-processing-overlay')?.remove();
    const url = new URL(window.location.href);
    url.searchParams.delete('stripe_session_id');
    url.searchParams.delete('stripe_cancelled');
    window.history.replaceState({}, document.title, url.toString());
}

export async function checkStripeReturn() {
    const sessionId = new URLSearchParams(window.location.search).get('stripe_session_id');
    if (!sessionId) return;
    // Compatibilidad para una sesión que use la antigua URL de retorno. La
    // confirmación se hace en la pantalla pública, sin iniciar el Studio ni
    // pedir acceso al comprador.
    window.location.replace(`/compra/stripe?session_id=${encodeURIComponent(sessionId)}`);
}

window.startStripeCheckout = startStripeCheckout;
window.checkStripeReturn = checkStripeReturn;
window.closeStripeOverlay = closeStripeOverlay;

export async function checkPayphoneRedirectResult() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const clientTxId = urlParams.get('clientTransactionId');
    
    if (id && clientTxId) {
        const pendingKey = 'payphone_pending_' + clientTxId;
        const pendingStateStr = localStorage.getItem(pendingKey);
        if (!pendingStateStr) {
            window.showToast?.('No pudimos recuperar la referencia local de PayPhone. No se intentó confirmar ni cobrar nuevamente.');
            window.closePayphoneOverlay();
            return;
        }
        
        let state;
        try {
            state = JSON.parse(pendingStateStr);
        } catch (e) {
            console.error('Error parsing payphone pending state:', e);
            localStorage.removeItem(pendingKey);
            window.showToast?.('La referencia local de PayPhone no es válida. No se intentó confirmar ni cobrar nuevamente.');
            window.closePayphoneOverlay();
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
            let response;
            let result;
            // La confirmación siempre pasa por el backend: el token de PayPhone
            // no se vuelve a enviar desde el navegador y el pago aprobado se
            // registra junto con su trabajo SRI en una sola operación segura.
            response = await fetch('/api/payments/payphone/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'confirm',
                    id: parseInt(id, 10),
                    clientTxId,
                    statusToken: state.statusToken || ''
                })
            });
            result = await response.json().catch(() => ({}));
            
            if (response.ok && result.status === 'success' && Array.isArray(result.deliveries) && result.deliveries.length > 0) {
                window.storeProducerUid = result.buyerData?.producerId || window.storeProducerUid;
                await preparePaidLicenseDeliveries(result.deliveries, result.buyerData || {});
                const firstDelivery = result.deliveries[0];
                // Clear state
                localStorage.removeItem(pendingKey);
                currentPayphoneAttempt = null;
                clearPurchasedItems();
                
                overlay.innerHTML = `
                    <div style="font-size: 60px; color: #4ade80; text-align: center; margin-bottom: 10px;">✓</div>
                    <div style="font-size: 20px; font-weight: 700; color: #4ade80; text-align: center; margin-bottom: 8px;">¡Pago aprobado con éxito!</div>
                    <div style="font-size: 14px; color: #cdd; text-align: center; max-width: 320px; line-height: 1.4; margin-bottom: 20px; padding: 0 20px;">Tu pago, contrato y entrega segura están listos.</div>
                    <button type="button" id="btn-payphone-open-download" style="padding: 12px 28px; background: #00ccff; border: none; border-radius: 8px; color: #000; font-weight: 700; cursor: pointer; font-size: 14px; box-shadow: 0 4px 12px rgba(0, 204, 255, 0.3);">Descargar Archivos</button>
                `;
                document.getElementById('btn-payphone-open-download')?.addEventListener('click', () => {
                    window.closePayphoneOverlay();
                    window.showAppView?.('download', {
                        paymentId: firstDelivery.paymentId,
                        downloadToken: firstDelivery.downloadToken || ''
                    });
                });
            } else {
                throw new Error(result.error || result.message || 'La transacción no fue aprobada');
            }
        } catch (err) {
            console.error('Error confirming PayPhone transaction:', err);
            overlay.innerHTML = `
                <div style="font-size: 60px; color: #ef4444; text-align: center; margin-bottom: 10px;">✗</div>
                <div style="font-size: 18px; font-weight: 700; color: #ef4444; text-align: center; margin-bottom: 8px;">Error en la verificación</div>
                <div style="font-size: 13px; color: #8a91a6; text-align: center; max-width: 280px; line-height: 1.4; margin-bottom: 20px; padding: 0 20px;">${err.message || 'No se pudo verificar el pago con PayPhone. Si el dinero fue debitado, contacta al productor.'}</div>
                <button type="button" onclick="window.closePayphoneOverlay()" style="padding: 12px 28px; background: #3f4454; border: none; border-radius: 8px; color: #fff; font-weight: 700; cursor: pointer; font-size: 14px;">Regresar a la tienda</button>
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

export async function loadBuyerDownloadPage(paymentId, downloadToken = '') {
    checkoutDebug("📥 Cargando portal de descargas para el pago:", paymentId);
    
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
        // Construir URL y headers de autenticación
        let fetchUrl = `/api/get-order-downloads?id=${encodeURIComponent(paymentId)}`;
        let fetchHeaders = {};

        // Opción 1: usuario autenticado via Firebase
        if (window._firebaseAuth && window._firebaseAuth.currentUser) {
            try {
                const idToken = await window._firebaseAuth.currentUser.getIdToken();
                fetchHeaders['Authorization'] = `Bearer ${idToken}`;
            } catch (e) { console.warn('No se pudo obtener el token de sesión:', e.message); }
        }

        // Opción 2: token firmado desde el email (compradores sin sesión)
        if (!fetchHeaders['Authorization'] && downloadToken) {
            fetchUrl += `&token=${encodeURIComponent(downloadToken)}`;
        }

        const response = await fetch(fetchUrl, { headers: fetchHeaders });
        if (!response.ok) {
            throw new Error("No se pudo recuperar la información del pedido.");
        }
        
        const data = await response.json();
        checkoutDebug("Datos de la orden cargados con éxito:", data);

        const payment = data.payment;
        const contractReference = resolveLicenseReference(payment);
        const beat = data.beat;
        const producer = data.producer;
        const signedLinks = data.signedLinks;
        const deliveryToken = data.deliveryToken || '';
        const priorLicenseUpgrade = data.priorLicenseUpgrade || { eligible: false, options: [] };
        const paymentIsApproved = ['approved', 'completed'].includes(String(payment.status || '').toLowerCase());

        // 1. Mostrar/ocultar banner de pago pendiente
        if (payment.status === 'pending') {
            bannerPending.style.display = 'block';
        } else if (!paymentIsApproved) {
            bannerPending.style.display = 'block';
            bannerPending.textContent = `Este pedido se encuentra en estado ${payment.status || 'no disponible'}.`;
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
        
        const priceFormatted = parseFloat(payment.totalLicensePaid !== undefined
            ? payment.totalLicensePaid
            : (payment.finalPrice !== undefined ? payment.finalPrice : payment.price)).toFixed(2);
        const licenseLabels = {
            basic: 'Licencia Básica',
            premium: 'Licencia Premium',
            premium_plus: 'Licencia Premium Plus',
            unlimited_flp: 'Licencia Ilimitada',
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
        if (!paymentIsApproved) {
            btnLicense.disabled = true;
            btnLicense.style.opacity = '0.5';
            btnLicense.style.cursor = 'not-allowed';
        } else {
            btnLicense.onclick = async () => {
                const originalHtml = btnLicense.innerHTML;
                btnLicense.disabled = true;
                btnLicense.innerHTML = '<i data-lucide="loader" class="animate-spin w-4 h-4"></i> Generando PDF...';
                if (window.safeCreateIcons) window.safeCreateIcons();
                let element;
                
                try {
                    if (!deliveryToken) {
                        throw new Error('El enlace de entrega ya no es válido. Abre de nuevo el correo de compra.');
                    }
                    // Cargar librería html2pdf.js si es necesario
                    if (typeof html2pdf === 'undefined') {
                        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
                    }

                    // El portal de descargas puede abrirse directamente sin
                    // haber pasado por el Studio. Cargar el compilador de
                    // contratos bajo demanda antes de generar la licencia.
                    if (typeof window.compileContractData !== 'function') {
                        await import('./editor.js');
                    }
                    if (typeof window.compileContractData !== 'function') {
                        throw new Error('No se cargó el generador de contratos.');
                    }
                    
                    if (!isValidLicenseReference(contractReference)) {
                        throw new Error('Esta compra no tiene un código de referencia válido. La licencia no puede considerarse oficial; contacta al productor.');
                    }

                    // Compilar el contrato con la misma referencia que valida
                    // el servidor antes de aceptar su almacenamiento.
                    const officialPayment = { ...payment, reference: contractReference, contractReference };
                    const compiled = window.compileContractData(officialPayment, producer, 'licencia_uso', window.currentLang || 'es');
                    element = document.getElementById('buyer-rendered-contract-content');
                    if (!element) {
                        throw new Error('No se encontró el área de generación del contrato.');
                    }
                    element.innerHTML = compiled.html;
                    element.classList.add('printing-pdf');

                    const opt = {
                        margin:       [15, 20, 15, 20],
                        filename:     `Licencia_${payment.licenseType.toUpperCase()}_${contractReference}.pdf`,
                        image:        { type: 'jpeg', quality: 0.98 },
                        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
                        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
                        pagebreak:    { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
                    };

                    const pdfBase64 = await html2pdf().from(element).set(opt).outputPdf('datauristring');

                    // El mismo PDF que descarga el comprador queda guardado
                    // en el pedido. Así una vuelta posterior al portal no
                    // depende de que el navegador que regresó de Stripe siga
                    // abierto.
                    const uploadResponse = await fetch('/api/confirm-purchase?action=upload-license-pdf', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paymentId, deliveryToken, contractReference, pdfBase64 })
                    });
                    const uploadResult = await uploadResponse.json().catch(() => ({}));
                    if (!uploadResponse.ok || !uploadResult.success) {
                        throw new Error(uploadResult.error || 'No se pudo guardar la licencia oficial.');
                    }

                    const pdfBlob = await fetch(pdfBase64).then(response => response.blob());
                    const pdfUrl = URL.createObjectURL(pdfBlob);
                    const anchor = document.createElement('a');
                    anchor.href = pdfUrl;
                    anchor.download = opt.filename;
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(pdfUrl), 1000);

                    // Registrar descarga en Firestore a través del endpoint
                    const logHeaders = { 'Content-Type': 'application/json' };
                    let logAccessToken = downloadToken || '';
                    if (window._firebaseAuth && window._firebaseAuth.currentUser) {
                        try {
                            const idToken = await window._firebaseAuth.currentUser.getIdToken();
                            logHeaders.Authorization = `Bearer ${idToken}`;
                        } catch (tokenErr) {
                            console.warn('No se pudo obtener el token para registrar la descarga:', tokenErr.message);
                        }
                    }
                    await fetch('/api/log-download', {
                        method: 'POST',
                        headers: logHeaders,
                        body: JSON.stringify({ paymentId, fileType: 'license', accessToken: logAccessToken })
                    });
                    
                    // Recargar el historial
                    setTimeout(() => refreshDownloadHistory(paymentId, downloadToken), 2000);
                } catch (err) {
                    console.error("Error al generar PDF o registrar descarga:", err);
                    if (typeof window.showToast === 'function') {
                        window.showToast("Error al descargar la licencia.", true);
                    }
                } finally {
                    element?.classList.remove('printing-pdf');
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
            if (!paymentIsApproved) {
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
            if (!paymentIsApproved) {
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
            if (!paymentIsApproved) {
                btnStems.disabled = true;
                btnStems.style.opacity = '0.5';
                btnStems.style.cursor = 'not-allowed';
            } else {
                btnStems.onclick = () => triggerAudioDownload(signedLinks.stems, 'stems');
            }
            buttonsContainer.appendChild(btnStems);
        }

        // Una exclusiva posterior no borra los derechos ya vendidos. Cuando
        // este enlace pertenece a una licencia anterior elegible, el titular
        // puede ampliar solamente su misma obra, hasta Ilimitada. El precio y
        // todos los requisitos se recalculan de nuevo en el servidor.
        if (paymentIsApproved && priorLicenseUpgrade.eligible && priorLicenseUpgrade.accessToken) {
            const tierLabels = {
                premium: 'Premium',
                premium_plus: 'Premium Plus',
                unlimited_flp: 'Ilimitada'
            };
            for (const option of priorLicenseUpgrade.options || []) {
                const btnUpgrade = document.createElement('button');
                btnUpgrade.type = 'button';
                btnUpgrade.className = 'w-full bg-violet-500/15 border border-violet-300/30 text-violet-100 py-2 px-4 rounded-lg text-sm font-semibold hover:bg-violet-500/25 transition-all flex items-center justify-center gap-2';
                btnUpgrade.innerHTML = `<i data-lucide="arrow-up-circle" class="w-4 h-4"></i> Ampliar a ${tierLabels[option.targetLicenseType] || option.targetLicenseType} por $${Number(option.amountDue).toFixed(2)}`;
                btnUpgrade.title = `Precio de licencia: $${Number(option.targetLicensePrice).toFixed(2)}. Se descuenta $${Number(option.creditApplied).toFixed(2)} ya pagados.`;
                btnUpgrade.onclick = () => window.openPriorLicenseUpgradeCheckout({
                    payment,
                    beat,
                    producer,
                    option,
                    accessToken: priorLicenseUpgrade.accessToken,
                    paymentCapabilities: data.paymentCapabilities || {}
                });
                buttonsContainer.appendChild(btnUpgrade);
            }
        }

        // 5. Historial de descargas
        renderDownloadLogs(data.downloads, historyList);

        // 6. Consultar únicamente el estado público mínimo. El documento
        // completo de Firestore contiene PII y nunca debe exponerse al invitado.
        if (payment.status === 'pending') {
            const unsubscribe = startPaymentStatusPolling({
                paymentId,
                statusToken: downloadToken,
                onApproved: async () => {
                    checkoutDebug("⚡ El pago fue aprobado. Actualizando portal de entrega...");
                    await loadBuyerDownloadPage(paymentId, downloadToken);
                },
                onTerminal: (result) => {
                    bannerPending.textContent = `El pedido cambió a estado ${result.status}. Contacta al productor si necesitas ayuda.`;
                    bannerPending.className = "mb-6 p-4 rounded-xl border border-dashed border-red-500/20 bg-red-500/5 text-red-700 text-sm";
                }
            });
            if (window._buyerDownloadUnsubscribe) {
                window._buyerDownloadUnsubscribe();
            }
            window._buyerDownloadUnsubscribe = unsubscribe;
        }

        if (window.safeCreateIcons) {
            window.safeCreateIcons();
        }

    } catch (error) {
        console.error("Fallo al cargar la página de descargas:", error);
        if (typeof window.showToast === 'function') {
            window.showToast("No pudimos validar este enlace de descarga.", true);
        }
        if (bannerPending) bannerPending.style.display = 'none';
        if (producerNameEl) producerNameEl.textContent = 'BEATSS';
        if (beatNameEl) beatNameEl.textContent = 'No encontramos esta entrega';
        if (beatMetaEl) {
            beatMetaEl.textContent = 'El enlace puede estar incompleto, vencido o no tener acceso a este pedido.';
        }
        if (orderRefEl) orderRefEl.textContent = '';
        if (buttonsContainer) {
            buttonsContainer.innerHTML = `
                <button type="button" class="btn-primary buyer-download-recovery" onclick="window.location.assign('/tienda/sossa')">
                    Ver tienda de Sossa
                </button>
            `;
        }
        if (historyList) {
            historyList.innerHTML = '<div class="buyer-download-error" role="status">Si compraste este beat, abre el enlace original recibido por correo o solicita ayuda al productor.</div>';
        }
        if (window.safeCreateIcons) window.safeCreateIcons();
    }
}

export function openPriorLicenseUpgradeCheckout({ payment, beat, producer, option, accessToken, paymentCapabilities = {} }) {
    if (!payment?.id || !beat?.id || !option?.targetLicenseType || !accessToken) {
        window.showToast?.('No se pudo validar la ampliación de esta licencia.', true);
        return;
    }

    checkoutSelectedBeatId = null;
    checkoutSelectedLicense = option.targetLicenseType;
    checkoutCurrentStep = 1;
    resetCheckoutTermsAcceptance();
    window.checkoutUpgradeContext = {
        sourcePaymentId: payment.id,
        accessToken,
        targetLicenseType: option.targetLicenseType
    };
    window.storeProducerUid = payment.producerId;
    window.storeProducerConfig = { ...(window.storeProducerConfig || {}), ...producer };
    window.storePaymentCapabilities = { ...(window.storePaymentCapabilities || {}), ...paymentCapabilities };
    window.cart = [{
        beatId: beat.id,
        licenseType: option.targetLicenseType,
        price: Number(option.amountDue),
        beatName: beat.name,
        producerId: payment.producerId,
        producerName: producer.aka || producer.name || 'Productor',
        artwork: beat.artwork || '',
        isPriorLicenseUpgrade: true
    }];

    const fill = (id, value) => {
        const field = document.getElementById(id);
        if (field && !field.value) field.value = String(value || '');
    };
    fill('store-buyer-name', payment.buyerName);
    fill('store-buyer-email', payment.buyerEmail);
    fill('store-buyer-phone', payment.buyerPhone);
    fill('store-buyer-dni', payment.buyerDni);
    fill('store-buyer-city', payment.buyerCity);
    fill('store-buyer-country', payment.buyerCountry);

    saveCartToStorage();
    window.updateCartUI();
    const modal = document.getElementById('beat-checkout-modal');
    if (modal) {
        modal.style.display = 'flex';
        window.renderCartItems();
        updateCheckoutStepView(1);
    }
}

window.openPriorLicenseUpgradeCheckout = openPriorLicenseUpgradeCheckout;

async function refreshDownloadHistory(paymentId, downloadToken = '') {
    try {
        let fetchUrl = `/api/get-order-downloads?id=${encodeURIComponent(paymentId)}`;
        let fetchHeaders = {};
        if (window._firebaseAuth && window._firebaseAuth.currentUser) {
            try {
                const idToken = await window._firebaseAuth.currentUser.getIdToken();
                fetchHeaders['Authorization'] = `Bearer ${idToken}`;
            } catch (e) {}
        } else if (downloadToken) {
            fetchUrl += `&token=${encodeURIComponent(downloadToken)}`;
        }
        const response = await fetch(fetchUrl, { headers: fetchHeaders });
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

// EPK (Electronic Press Kit)
export function renderEPK() {
    const configData = window.storeProducerConfig || {};
    
    // Biografía
    const bioText = document.getElementById('epk-bio-text');
    if (bioText) {
        bioText.textContent = configData.epkBio || "Este productor aún no ha redactado su biografía.";
    }
    
    // Colaboraciones (Píldoras)
    const collabsContainer = document.getElementById('epk-collabs-container');
    if (collabsContainer) {
        collabsContainer.innerHTML = '';
        const collabsStr = configData.epkCollabs || '';
        const collabsArray = collabsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
        
        if (collabsArray.length > 0) {
            collabsArray.forEach(collab => {
                const badge = document.createElement('span');
                badge.className = "px-3 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-white shadow-sm hover:border-[var(--accent)]/50 transition-all cursor-default";
                badge.textContent = collab;
                collabsContainer.appendChild(badge);
            });
        } else {
            collabsContainer.innerHTML = `<span class="text-xs text-on-surface-variant italic">No se han especificado colaboraciones clave.</span>`;
        }
    }
    
    // Estadísticas
    // Beats en catálogo (Dinámico)
    const statBeats = document.getElementById('epk-stat-beats');
    if (statBeats) {
        statBeats.textContent = window.storeBeats ? window.storeBeats.length : 0;
    }
    
    // Ventas (Curado)
    const statSales = document.getElementById('epk-stat-sales');
    if (statSales) {
        statSales.textContent = configData.epkSales || '0';
    }
    
    // Streams (Curado)
    const statStreams = document.getElementById('epk-stat-streams');
    if (statStreams) {
        statStreams.textContent = configData.epkStreams || '0';
    }
    
    // PRO / IPI
    const proName = document.getElementById('epk-pro-name');
    if (proName) {
        proName.textContent = configData.epkPro || "No afiliado / No especificado";
    }
    
    if (window.lucide) window.lucide.createIcons();
}

export function switchStoreTab(tab) {
    const tabBeats = document.getElementById('store-tab-beats');
    const tabEpk = document.getElementById('store-tab-epk');
    const sectionBeats = document.getElementById('beats-catalog-section');
    const sectionEpk = document.getElementById('press-kit-section');
    
    if (!tabBeats || !tabEpk || !sectionBeats || !sectionEpk) return;
    
    if (tab === 'beats') {
        // Activar tab beats
        tabBeats.className = "px-6 py-2.5 rounded-full font-bold text-sm bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 transition-all hover:bg-[var(--accent)]/25 focus:outline-none flex items-center gap-2";
        tabEpk.className = "px-6 py-2.5 rounded-full font-bold text-sm bg-white/5 text-on-surface-variant border border-white/10 transition-all hover:bg-white/10 focus:outline-none flex items-center gap-2";
        
        sectionBeats.style.display = 'block';
        sectionEpk.style.display = 'none';
    } else {
        // Activar tab epk
        tabBeats.className = "px-6 py-2.5 rounded-full font-bold text-sm bg-white/5 text-on-surface-variant border border-white/10 transition-all hover:bg-white/10 focus:outline-none flex items-center gap-2";
        tabEpk.className = "px-6 py-2.5 rounded-full font-bold text-sm bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/30 transition-all hover:bg-[var(--accent)]/25 focus:outline-none flex items-center gap-2";
        
        sectionBeats.style.display = 'none';
        sectionEpk.style.display = 'block';
        
        // Renderizar info del EPK
        renderEPK();
    }
}

window.renderEPK = renderEPK;
window.switchStoreTab = switchStoreTab;

// ─── LÓGICA DE UPSELL FLASH (POST-COMPRA) ───────────────────────────────────────
export function showUpsellModal(beatName, currentLicense, paymentId, producerId) {
    if (currentLicense !== 'basic' && currentLicense !== 'premium') {
        window.showAppView('download', { paymentId: paymentId });
        return;
    }
    
    let upsellModal = document.getElementById('upsell-flash-modal');
    if (!upsellModal) {
        upsellModal = document.createElement('div');
        upsellModal.id = 'upsell-flash-modal';
        upsellModal.style.cssText = 'position:fixed; inset:0; z-index:100000; display:flex; align-items:center; justify-content:center; background:rgba(5,7,15,0.9); backdrop-filter:blur(16px); padding:16px; box-sizing:border-box;';
        document.body.appendChild(upsellModal);
    }
    
    const targetLicense = 'premium_plus';
    const upgradePrice = currentLicense === 'basic' ? 49.00 : 29.00;
    
    upsellModal.innerHTML = `
        <div style="background:#0f1320; border:2px solid #a855f7; border-radius:24px; width:100%; max-width:500px; padding:32px; position:relative; box-shadow:0 30px 80px rgba(168,85,247,0.25); text-align:center; box-sizing:border-box; color:#fff; font-family:sans-serif;">
            <div style="font-size: 50px; margin-bottom: 12px;">⚡</div>
            <h3 style="font-size: 24px; font-weight: 800; margin: 0 0 8px 0; background: linear-gradient(135deg, #a855f7 0%, #ec4899 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">¡OFERTA FLASH DE UPGRADE!</h3>
            <p style="color:#cbd5e0; font-size:14px; line-height:1.5; margin:0 0 20px 0;">
                Felicidades por tu licencia de <strong>"${window.sanitizeHtml ? window.sanitizeHtml(beatName) : beatName}"</strong>. <br>
                Por los próximos <strong id="upsell-timer" style="color:#ec4899; font-family:monospace;">10:00</strong> minutos, actualiza tu licencia a <strong>Premium Plus</strong> (Stems/Trackouts y reproducciones ilimitadas) por solo:
            </p>
            
            <div style="background:rgba(255,255,255,0.03); border:1px dashed rgba(168,85,247,0.4); border-radius:16px; padding:20px; margin-bottom:24px;">
                <div style="text-decoration:line-through; color:#8a91a6; font-size:14px; margin-bottom:4px;">Precio normal: $100.00 USD</div>
                <div style="font-size:36px; font-weight:900; color:#4ade80;">$${upgradePrice.toFixed(2)} USD</div>
                <div style="font-size:11px; color:#a855f7; font-weight:700; text-transform:uppercase; margin-top:4px; letter-spacing:0.5px;">¡Ahorras más del 50%!</div>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:10px;">
                <button type="button" id="upsell-accept-btn" style="width:100%; height:48px; background:linear-gradient(135deg, #a855f7 0%, #ec4899 100%); border:none; border-radius:12px; color:#fff; font-weight:800; font-size:14px; cursor:pointer; box-shadow:0 8px 24px rgba(168,85,247,0.3); transition:all 0.2s;">
                    ACEPTAR UPGRADE AHORA
                </button>
                <button type="button" id="upsell-decline-btn" style="width:100%; height:44px; background:none; border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#8a91a6; font-weight:600; font-size:13px; cursor:pointer; transition:all 0.2s;">
                    No gracias, descargar mi archivo actual
                </button>
            </div>
        </div>
    `;
    
    upsellModal.style.display = 'flex';
    
    let timeLeft = 600;
    const timerInterval = setInterval(() => {
        timeLeft--;
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            closeUpsellAndRedirect();
        } else {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            const timerEl = document.getElementById('upsell-timer');
            if (timerEl) {
                timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }
    }, 1000);
    
    function closeUpsellAndRedirect() {
        clearInterval(timerInterval);
        upsellModal.style.display = 'none';
        window.showAppView('download', { paymentId: paymentId });
    }
    
    document.getElementById('upsell-decline-btn').onclick = closeUpsellAndRedirect;
    
    document.getElementById('upsell-accept-btn').onclick = () => {
        clearInterval(timerInterval);
        upsellModal.style.display = 'none';
        window.openUpgradeCheckout(beatName, targetLicense, upgradePrice, paymentId, producerId);
    };
}

window.openUpgradeCheckout = function() {
    // Se conserva el nombre para compatibilidad con enlaces antiguos, pero ya
    // no se permite fabricar una actualización desde el navegador. La única
    // ruta válida es el portal de la licencia original, que aporta el enlace
    // firmado y deja que el servidor compruebe la fecha de la exclusiva.
    window.showToast?.('Las ampliaciones se habilitan desde el enlace original de la licencia cuando el beat tenga una exclusiva posterior.', true);
};

export function handleCheckoutCompletion(paymentId, items) {
    // Una ampliación no puede cambiar el pago original en el cliente. Toda
    // compra, incluso la de upgrade, llega al portal desde su propia entrega.
    window.showAppView('download', { paymentId });
}

export async function finalizePaymentSuccess(redirectPaymentId, itemsToProcess) {
    logCheckoutStep('payment_completed', { paymentId: redirectPaymentId, itemsCount: (itemsToProcess || []).length });
    handleCheckoutCompletion(redirectPaymentId, itemsToProcess);
}

window.showUpsellModal = showUpsellModal;
window.finalizePaymentSuccess = finalizePaymentSuccess;
window.handleCheckoutCompletion = handleCheckoutCompletion;



export function updateStoreCheckoutSummary() {
    const summaryContainer = document.getElementById('checkout-summary-items');
    if (!summaryContainer) return;

    let summaryHtml = '';
    let total = 0;

    if (checkoutSelectedBeatId) {
        // Single Beat Mode: El beat ya se muestra en #checkout-single-beat-preview.
        // No duplicamos la tarjeta visual del beat abajo para mantener el checkout en 1 sola pantalla compacta.
        const beat = findBeatById(checkoutSelectedBeatId);
        if (beat) {
            const licenseName = LICENSE_CONFIGS[checkoutSelectedLicense]?.name || checkoutSelectedLicense;
            const price = window.getCheckoutPrice();
            total = price;

            const nameEl = document.getElementById('checkout-single-beat-name');
            const metaEl = document.getElementById('checkout-single-beat-meta');
            const imgEl = document.getElementById('checkout-single-beat-img');
            if (nameEl) nameEl.textContent = beat.name;
            if (metaEl) {
                let details = [licenseName];
                if (beat.bpm) details.push(`${beat.bpm} BPM`);
                metaEl.textContent = details.join(' • ');
            }
            if (imgEl && window.getBeatArtwork) imgEl.src = window.getBeatArtwork(beat);
            summaryHtml = '';
        }
    } else if (window.cart && window.cart.length > 0) {
        // Multi Beat Mode
        total = window.getCheckoutPrice();
        window.cart.forEach((item) => {
            const beat = findBeatById(item.beatId) || item;
            const artwork = window.getBeatArtwork ? window.getBeatArtwork(beat) : (item.artwork || '');
            const licenseName = LICENSE_CONFIGS[item.licenseType]?.name || item.licenseType;

            summaryHtml += `
                <div class="flex gap-4 items-start pb-4 border-b border-[#454558]/10 last:border-0 last:pb-0">
                    <img src="${artwork}" class="w-12 h-12 bg-[#1A1A20] rounded-lg flex-shrink-0 object-cover border border-[#454558]/20" alt="${item.beatName}">
                    <div class="space-y-0.5 overflow-hidden">
                        <h3 class="font-bold text-white leading-tight truncate text-xs">${window.sanitizeHtml ? window.sanitizeHtml(item.beatName) : item.beatName}</h3>
                        <div class="text-[9px] text-[#c5c4db]">${licenseName}</div>
                        <p class="text-[#bec2ff] font-bold text-xs mt-0.5">$${item.price.toFixed(2)}</p>
                    </div>
                </div>
            `;
        });
    } else {
        summaryHtml = `<div class="text-xs text-[#c5c4db] italic text-center py-4">Tu carrito está vacío</div>`;
    }

    summaryContainer.innerHTML = summaryHtml;

    const subtotal = checkoutSelectedBeatId ? total : window.getCartTotal();
    const subtotalEl = document.getElementById('summary-subtotal');
    if (subtotalEl) subtotalEl.textContent = '$' + subtotal.toFixed(2);

    const discountAmountEl = document.getElementById('summary-discount-amount');
    const discountRow = document.getElementById('summary-discount-row');
    if (window.checkoutDiscountPercent && total > 0) {
        const discount = subtotal * (window.checkoutDiscountPercent / 100);
        if (discountAmountEl && discountRow) {
            discountAmountEl.textContent = '-$' + discount.toFixed(2);
            discountRow.style.display = 'flex';
        }
    } else if (discountRow) {
        discountRow.style.display = 'none';
    }

    const totalEl = document.getElementById('summary-total-display');
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

window.updateStoreCheckoutSummary = updateStoreCheckoutSummary;

function activateDeunaOrder(result) {
    const qrImage = document.getElementById('deuna-qr-image');
    if (qrImage) qrImage.src = window.storeProducerConfig.deunaQrBase64 || '/deuna-qr.jpg';
    const deunaPanel = document.getElementById('store-pay-deuna');
    let mobilePayBtn = document.getElementById('deuna-mobile-pay-btn');
    if (!mobilePayBtn && deunaPanel) {
        mobilePayBtn = document.createElement('a');
        mobilePayBtn.id = 'deuna-mobile-pay-btn';
        mobilePayBtn.className = 'mt-3 block text-center bg-[#0001ac] hover:bg-[#00018a] text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md';
        mobilePayBtn.target = '_blank';
        mobilePayBtn.rel = 'noopener noreferrer';
        deunaPanel.appendChild(mobilePayBtn);
    }
    if (mobilePayBtn) {
        mobilePayBtn.href = result.deeplink || '#';
        mobilePayBtn.innerHTML = '📲 Pagar desde la App Deuna!';
        mobilePayBtn.style.display = result.deeplink ? 'block' : 'none';
    }
    let deunaStatusMsg = document.getElementById('deuna-status-message');
    if (!deunaStatusMsg && deunaPanel) {
        deunaStatusMsg = document.createElement('div');
        deunaStatusMsg.id = 'deuna-status-message';
        deunaPanel.appendChild(deunaStatusMsg);
    }
    if (deunaStatusMsg) {
        deunaStatusMsg.textContent = '⏳ Referencia protegida. Esperando confirmación de Deuna...';
        deunaStatusMsg.className = 'mt-2 text-xs font-mono text-center text-yellow-500 animate-pulse';
    }
    if (deunaListenerUnsubscribe) deunaListenerUnsubscribe();
    deunaListenerUnsubscribe = startPaymentStatusPolling({
        paymentId: currentDeunaPaymentId,
        statusToken: currentDeunaStatusToken,
        onApproved: async (statusResult) => {
            deunaListenerUnsubscribe = null;
            if (typeof window.showToast === 'function') window.showToast('¡Pago confirmado! Preparando tus archivos...');
            if (deunaStatusMsg) {
                deunaStatusMsg.textContent = '✅ ¡Pago recibido! Preparando entrega...';
                deunaStatusMsg.className = 'mt-2 text-xs font-mono text-center text-green-500 font-bold';
            }
            const paymentId = currentDeunaPaymentId;
            const orderData = currentDeunaOrderData;
            const items = currentDeunaItems;
            if (paymentId && orderData) await autoDeliverBeatSale(paymentId, {
                ...orderData,
                status: statusResult.status,
                statusToken: currentDeunaStatusToken
            });
            clearPurchasedItems();
            document.getElementById('beat-checkout-modal').style.display = 'none';
            if (paymentId) await finalizePaymentSuccess(paymentId, items);
            currentDeunaPaymentId = null;
            currentDeunaStatusToken = '';
            currentDeunaOrderData = null;
            currentDeunaItems = [];
            currentDeunaAttempt = null;
        },
        onTerminal: (statusResult) => {
            deunaListenerUnsubscribe = null;
            if (deunaStatusMsg) {
                deunaStatusMsg.textContent = `El pago terminó con estado ${statusResult.status}.`;
                deunaStatusMsg.className = 'mt-2 text-xs font-mono text-center text-red-600 font-bold';
            }
            currentDeunaPaymentId = null;
            currentDeunaStatusToken = '';
            currentDeunaOrderData = null;
            currentDeunaItems = [];
            currentDeunaAttempt = null;
        },
        onError: (error) => {
            deunaListenerUnsubscribe = null;
            console.warn('No se pudo confirmar el estado Deuna:', error?.message || error);
        }
    });
}

export async function initiateDeunaDynamicPayment() {
    if (deunaInitializationPromise) return deunaInitializationPromise;
    deunaInitializationPromise = (async () => {
        if (!requireCheckoutTermsAcceptance()) return null;
        let buyerName = sanitizeInput(document.getElementById('store-buyer-name').value);
        let buyerEmail = sanitizeInput(document.getElementById('store-buyer-email').value);
        const buyerPhone = sanitizeInput(document.getElementById('store-buyer-phone').value);
        let buyerDni = sanitizeInput(document.getElementById('store-buyer-dni').value);
        let buyerCity = sanitizeInput(document.getElementById('store-buyer-city').value);
        const buyerCountry = sanitizeInput(document.getElementById('store-buyer-country').value);
        const youtubeWhitelist = sanitizeInput(document.getElementById('store-txt-youtube-whitelist').value);
        let invoiceRuc = '';
        let invoiceCompany = '';
        let invoiceAddress = '';
        let invoiceEmail = '';
        if (document.getElementById('store-chk-need-invoice')?.checked) {
            invoiceRuc = sanitizeInput(document.getElementById('store-invoice-ruc').value);
            invoiceCompany = sanitizeInput(document.getElementById('store-invoice-company').value);
            invoiceAddress = sanitizeInput(document.getElementById('store-invoice-address').value);
            invoiceEmail = sanitizeInput(document.getElementById('store-invoice-email').value);
            if (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !invoiceEmail) {
                if (typeof window.showToast === 'function') window.showToast('Completa correctamente los datos de facturación.', true);
                return null;
            }
            buyerDni = invoiceRuc;
            buyerName = invoiceCompany;
            buyerEmail = invoiceEmail;
            buyerCity = invoiceAddress;
        }
        if (!buyerName || !buyerEmail) {
            if (typeof window.showToast === 'function') window.showToast('Completa tus datos antes de crear el pago Deuna.', true);
            return null;
        }

        const items = checkoutSelectedBeatId
            ? [{ beatId: checkoutSelectedBeatId, licenseType: checkoutSelectedLicense }]
            : window.cart.map(({ beatId, licenseType }) => ({ beatId, licenseType }));
        if (items.length !== 1) {
            if (typeof window.showToast === 'function') window.showToast('Deuna procesa un beat por pedido.', true);
            return null;
        }
        const identity = JSON.stringify({
            producerId: window.storeProducerUid,
            item: items[0],
            buyerEmail,
            couponCode: window.checkoutAppliedCoupon || '',
            invoiceRuc
        });
        if (currentDeunaPaymentId && currentDeunaAttempt?.identity === identity && currentDeunaAttempt.result) {
            activateDeunaOrder(currentDeunaAttempt.result);
            return currentDeunaAttempt.result;
        }
        if (currentDeunaPaymentId && currentDeunaAttempt?.identity !== identity) {
            if (deunaListenerUnsubscribe) deunaListenerUnsubscribe();
            deunaListenerUnsubscribe = null;
            currentDeunaPaymentId = null;
            currentDeunaStatusToken = '';
            currentDeunaOrderData = null;
            currentDeunaItems = [];
            currentDeunaAttempt = null;
        }

        currentDeunaAttempt = pendingAttempt(currentDeunaAttempt, identity);
        if (!currentDeunaAttempt.statusCredential) {
            currentDeunaAttempt.statusCredential = await createPaymentStatusCredential();
        }
        const result = await postPendingOrder({
            action: 'create',
            requestId: currentDeunaAttempt.requestId,
            type: 'beat_purchase',
            method: 'deuna',
            producerId: window.storeProducerUid,
            items,
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerDni,
            buyerCity,
            buyerCountry,
            youtubeWhitelist,
            invoiceRuc,
            invoiceCompany,
            invoiceAddress,
            invoiceEmail,
            couponCode: window.checkoutAppliedCoupon || '',
            statusTokenHash: currentDeunaAttempt.statusCredential.hash,
            acceptedTerms: true,
            acceptanceTimestamp: currentDeunaAttempt.acceptanceTimestamp,
            termsVersion: currentDeunaAttempt.termsVersion
        });
        const payment = result.payments?.[0];
        if (!payment) throw new Error('El servidor no devolvió la referencia Deuna.');
        currentDeunaPaymentId = payment.paymentId;
        currentDeunaStatusToken = currentDeunaAttempt.statusCredential.token;
        currentDeunaItems = [payment];
        currentDeunaOrderData = {
            type: 'beat_purchase',
            producerId: window.storeProducerUid,
            beatId: payment.beatId,
            beatName: payment.beatName,
            licenseType: payment.licenseType,
            price: payment.originalPrice,
            originalPrice: payment.originalPrice,
            finalPrice: payment.finalPrice,
            buyerName,
            buyerEmail,
            buyerPhone,
            buyerDni,
            buyerCity,
            buyerCountry,
            youtubeWhitelist,
            invoiceRuc,
            invoiceCompany,
            invoiceAddress,
            invoiceEmail,
            method: 'deuna',
            reference: result.reference,
            status: 'pending',
            discountPercent: result.discountPercent,
            couponCode: result.couponCode,
            acceptedTerms: true,
            acceptanceTimestamp: currentDeunaAttempt.acceptanceTimestamp,
            timestamp: new Date().toISOString()
        };
        currentDeunaAttempt.result = result;
        try {
            sessionStorage.setItem(`beatss_pending_status_${currentDeunaPaymentId}`, currentDeunaStatusToken);
        } catch (_) {}
        activateDeunaOrder(result);
        return result;
    })();
    try {
        return await deunaInitializationPromise;
    } catch (error) {
        console.error('Error iniciando pago Deuna:', error);
        if (typeof window.showToast === 'function') window.showToast(error.message || 'No se pudo iniciar Deuna.', true);
        return null;
    } finally {
        deunaInitializationPromise = null;
    }
}
window.initiateDeunaDynamicPayment = initiateDeunaDynamicPayment;
// Los logos y QR del checkout permanecen fuera de la red mientras el modal no
// se usa. Este módulo se importa en la primera interacción de compra.
document?.querySelectorAll?.('img[data-deferred-src]')?.forEach((image) => {
    if (!image.getAttribute('src')) image.setAttribute('src', image.dataset.deferredSrc);
    image.removeAttribute('data-deferred-src');
});
