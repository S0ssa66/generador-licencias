import './tailwind-entry.css';
import './styles.css';
import './mobile.css';
import './settings-modern.css';
import './viewport-coherence.css';
import './public-purchase.css';
import './stateManager.js';
import { renderPublicIcons } from './public-icons.js';

const STRIPE_RETURN_STORAGE_KEY = 'beatss_last_stripe_return_session';
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9_-]{3,160}$/;
let pollingTimer = null;
let pollingAttempts = 0;

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
}

function clearPolling() {
    if (pollingTimer) window.clearTimeout(pollingTimer);
    pollingTimer = null;
}

function setVisible(element, visible) {
    if (!element) return;
    element.style.display = visible ? 'block' : 'none';
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    element.inert = !visible;
}

function showPublicPurchaseShell() {
    clearPolling();
    ['landing-page', 'app-container', 'global-catalog-view', 'buyer-download-view', 'public-store-view', 'login-modal'].forEach((id) => setVisible(document.getElementById(id), false));
    const view = document.getElementById('public-purchase-view');
    setVisible(view, true);
    document.body.classList.remove('landing-active');
    document.body.dataset.beatssView = 'purchase';
    window.dismissBeatssBootScreen?.();
    return view;
}

function showBuyerDownloadShell() {
    clearPolling();
    ['landing-page', 'app-container', 'global-catalog-view', 'public-store-view', 'public-purchase-view', 'login-modal'].forEach((id) => setVisible(document.getElementById(id), false));
    const view = document.getElementById('buyer-download-view');
    setVisible(view, true);
    document.body.classList.remove('landing-active');
    document.body.dataset.beatssView = 'download';
    window.dismissBeatssBootScreen?.();
    return view;
}

function renderCard({ icon = '✓', variant = '', kicker = 'BEATSS', title, message, content = '', busy = false }) {
    const view = showPublicPurchaseShell();
    if (!view) return;
    document.title = `${title} · Beatss`;
    view.innerHTML = `
        <main class="public-purchase-shell">
            <a class="public-purchase-brand" href="/tienda/sossa" aria-label="Ir a la tienda de Sossa">
                <span class="public-purchase-brand__mark" aria-hidden="true">ϟ</span><span>Beatss</span>
            </a>
            <section class="public-purchase-card" aria-live="polite"${busy ? ' aria-busy="true"' : ''}>
                <div class="public-purchase-status-icon ${escapeHtml(variant)}" aria-hidden="true">${escapeHtml(icon)}</div>
                <p class="public-purchase-kicker">${escapeHtml(kicker)}</p>
                <h1>${escapeHtml(title)}</h1>
                <p class="public-purchase-summary">${escapeHtml(message)}</p>
                ${content}
            </section>
        </main>`;
}

function licenseLabel(value) {
    return ({
        basic: 'Licencia Básica',
        premium: 'Licencia Premium',
        premium_plus: 'Licencia Premium Plus',
        unlimited_flp: 'Licencia Ilimitada',
        unlimited: 'Licencia Ilimitada',
        exclusive: 'Licencia Exclusiva'
    })[String(value || '').toLowerCase()] || 'Licencia';
}

function deliveryUrl(delivery) {
    const paymentId = String(delivery?.paymentId || '').trim();
    const token = String(delivery?.downloadToken || '').trim();
    if (!DELIVERY_ID_PATTERN.test(paymentId) || !token) return '';
    return `/descargas/${encodeURIComponent(paymentId)}?token=${encodeURIComponent(token)}`;
}

function renderPurchaseComplete(deliveries) {
    const accessRows = deliveries.map((delivery) => {
        const href = deliveryUrl(delivery);
        if (!href) return '';
        return `
            <article class="public-purchase-delivery">
                <div class="public-purchase-delivery__copy">
                    <strong>${escapeHtml(delivery.beatName || 'Tu instrumental')}</strong>
                    <span>${escapeHtml(licenseLabel(delivery.licenseType))}</span>
                </div>
                <a class="public-purchase-button" href="${href}">Abrir descargas</a>
            </article>`;
    }).join('');

    if (!accessRows) {
        renderCard({
            icon: '!', variant: 'public-purchase-status-icon--error', kicker: 'COMPRA CONFIRMADA',
            title: 'Tu pago fue confirmado',
            message: 'Estamos preparando los enlaces de entrega. Conserva el correo de confirmación y vuelve a intentarlo en unos minutos.',
            content: '<a class="public-purchase-button public-purchase-button--secondary" href="/tienda/sossa">Volver a la tienda</a>'
        });
        return;
    }

    renderCard({
        kicker: 'PAGO CONFIRMADO',
        title: 'Gracias por tu compra',
        message: 'Stripe confirmó tu pago. Tu licencia y los archivos autorizados ya están listos para descargar.',
        content: `<div class="public-purchase-deliveries">${accessRows}</div><p class="public-purchase-note">También enviamos este acceso seguro al correo usado en la compra. Guarda tu licencia junto con los archivos descargados.</p>`
    });
}

function renderPending() {
    renderCard({
        icon: '', variant: 'public-purchase-status-icon--pending', kicker: 'VERIFICANDO PAGO',
        title: 'Estamos confirmando tu compra',
        message: 'Stripe aún está terminando de confirmar el pago y preparar la entrega. No se hará un segundo cobro; esta página se actualizará automáticamente.',
        busy: true
    });
}

function renderRetryableError(message) {
    renderCard({
        icon: '!', variant: 'public-purchase-status-icon--error', kicker: 'CONFIRMACIÓN PENDIENTE',
        title: 'No pudimos consultar tu compra todavía',
        message,
        content: '<button class="public-purchase-button" type="button" data-purchase-action="retry">Volver a comprobar</button><p class="public-purchase-note">Si el pago ya se debitó, no vuelvas a pagar. Conserva el correo y esta ventana mientras se completa la confirmación.</p>'
    });
    document.querySelector('[data-purchase-action="retry"]')?.addEventListener('click', () => {
        pollingAttempts = 0;
        void loadStripeReturn();
    }, { once: true });
}

function storeStripeSession(sessionId) {
    try { sessionStorage.setItem(STRIPE_RETURN_STORAGE_KEY, sessionId); } catch (_) {}
    if (window.location.pathname === '/compra/stripe') {
        window.history.replaceState({ view: 'purchase-complete' }, '', '/compra/gracias');
    }
}

function readStripeSession() {
    const querySession = new URLSearchParams(window.location.search).get('session_id');
    if (querySession) {
        storeStripeSession(querySession);
        return querySession;
    }
    try { return sessionStorage.getItem(STRIPE_RETURN_STORAGE_KEY) || ''; } catch (_) { return ''; }
}

function scheduleStripeStatusCheck() {
    clearPolling();
    if (pollingAttempts >= 20) {
        renderRetryableError('La confirmación está tardando más de lo habitual. Puedes volver a comprobarla; si el pago quedó aprobado, tus descargas aparecerán aquí sin hacer otro cobro.');
        return;
    }
    pollingTimer = window.setTimeout(() => void loadStripeReturn(), 3000);
}

async function loadStripeReturn() {
    const sessionId = readStripeSession();
    if (!sessionId) {
        renderCard({
            icon: '!', variant: 'public-purchase-status-icon--error', kicker: 'ENLACE INCOMPLETO',
            title: 'No encontramos la confirmación de compra',
            message: 'Abre el enlace original de Stripe o el correo de entrega para acceder a tus descargas.',
            content: '<a class="public-purchase-button public-purchase-button--secondary" href="/tienda/sossa">Ir a la tienda de Sossa</a>'
        });
        return;
    }

    renderPending();
    pollingAttempts += 1;
    try {
        const response = await fetch(`/api/payments/stripe/session-status?sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'La confirmación de Stripe no está disponible.');
        if (result.paymentStatus === 'paid' && Array.isArray(result.deliveries) && result.deliveries.length) {
            clearPolling();
            renderPurchaseComplete(result.deliveries);
            return;
        }
        scheduleStripeStatusCheck();
    } catch (error) {
        if (pollingAttempts < 4) {
            scheduleStripeStatusCheck();
            return;
        }
        renderRetryableError(error?.message || 'No se pudo confirmar el pago en este momento.');
    }
}

async function openBuyerDownloadPage(paymentId, downloadToken) {
    if (!DELIVERY_ID_PATTERN.test(paymentId) || !downloadToken) {
        renderCard({
            icon: '!', variant: 'public-purchase-status-icon--error', kicker: 'ENLACE NO VÁLIDO',
            title: 'No podemos abrir estas descargas',
            message: 'Abre el enlace seguro que recibiste después de la compra o revisa el correo de entrega.',
            content: '<a class="public-purchase-button public-purchase-button--secondary" href="/tienda/sossa">Ir a la tienda de Sossa</a>'
        });
        return;
    }
    document.title = 'Tus descargas · Beatss';
    showBuyerDownloadShell();
    try {
        window.currentLang ||= 'es';
        const checkout = await import('./checkout.js');
        await checkout.loadBuyerDownloadPage(paymentId, downloadToken);
        renderPublicIcons(document.getElementById('buyer-download-view'));
    } catch (error) {
        console.error('[BEATSS] No se pudo cargar el portal de entrega:', error?.message || error);
        renderCard({
            icon: '!', variant: 'public-purchase-status-icon--error', kicker: 'ENTREGA NO DISPONIBLE',
            title: 'No pudimos abrir tus descargas',
            message: 'El enlace puede haber vencido o estar incompleto. Abre el correo original de compra o comunícate con el productor.',
            content: '<a class="public-purchase-button public-purchase-button--secondary" href="/tienda/sossa">Ir a la tienda de Sossa</a>'
        });
    }
}

function loadDeliveryRoute() {
    const rawPaymentId = decodeURIComponent(window.location.pathname.split('/').filter(Boolean)[1] || '');
    const token = new URLSearchParams(window.location.search).get('token') || '';
    return openBuyerDownloadPage(rawPaymentId, token);
}

function loadCancelledPurchase() {
    renderCard({
        icon: '×', variant: 'public-purchase-status-icon--error', kicker: 'PAGO CANCELADO',
        title: 'No se completó la compra',
        message: 'No se entregaron archivos ni se creó una nueva compra. Puedes volver a la tienda cuando estés listo.',
        content: '<a class="public-purchase-button public-purchase-button--secondary" href="/tienda/sossa">Volver a la tienda de Sossa</a>'
    });
}

window.showAppView = (view, options = {}) => {
    if (view === 'download') return openBuyerDownloadPage(String(options.paymentId || ''), String(options.downloadToken || ''));
    if (view === 'store' && options.producer) return window.location.assign(`/tienda/${encodeURIComponent(options.producer)}`);
    window.location.assign('/tienda/sossa');
};

const path = window.location.pathname.replace(/\/+$/, '') || '/';
if (path.startsWith('/descargas/')) {
    void loadDeliveryRoute();
} else if (path === '/compra/cancelada') {
    loadCancelledPurchase();
} else {
    void loadStripeReturn();
}
