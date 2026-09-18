import { auth } from '../firebase.js';

const PENDING_STATES = new Set(['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA', 'PENDING_AUTORIZACION']);
const REVIEW_STATES = new Set(['AUTORIZADO_ENTREGA_PENDIENTE', 'ERROR_REQUIERE_REVISION']);

function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function currentHistory() {
    return Array.isArray(window.licenseHistory) ? window.licenseHistory : [];
}

function statusOf(invoice) {
    return String(invoice?.sriEstado || '').trim().toUpperCase();
}

function stateClass(status) {
    if (status === 'AUTORIZADO') return 'authorized';
    if (PENDING_STATES.has(status)) return 'pending';
    if (REVIEW_STATES.has(status)) return 'failed';
    if (status.startsWith('ERROR_') || status.startsWith('RECHAZADO_')) return 'failed';
    return 'none';
}

function stateLabel(status) {
    if (status === 'AUTORIZADO') return 'AUTORIZADA';
    if (status === 'EN_COLA_EMISION') return 'EN COLA DE EMISIÓN';
    if (status === 'EN_PROCESO') return 'EN PROCESO SRI';
    if (status === 'PENDIENTE_AUTORIZACION') return 'PENDIENTE DE AUTORIZACIÓN';
    if (status === 'AUTORIZADO_ENTREGA_PENDIENTE') return 'AUTORIZADA · ENTREGA PENDIENTE';
    if (status === 'ERROR_REQUIERE_REVISION') return 'REQUIERE REVISIÓN';
    if (PENDING_STATES.has(status)) return 'EN PROCESO';
    if (status.startsWith('ERROR_') || status.startsWith('RECHAZADO_')) return 'REVISAR';
    return 'SIN EMITIR';
}

function invoiceKey(invoice) {
    return String(invoice?.id || invoice?.reference || invoice?.refCode || '').trim();
}

function formatMoney(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
}

function maskedRuc(ruc) {
    const value = String(ruc || '').trim();
    return value.length >= 4 ? `•••••••••${value.slice(-4)}` : 'No configurado';
}

async function sriHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
    const localHeaders = window.getLocalHeaders ? await window.getLocalHeaders() : {};
    // El token de Firebase debe prevalecer si el entorno local también añade
    // cabeceras auxiliares; nunca sustituir la sesión del usuario por una
    // cabecera de desarrollo.
    return { ...localHeaders, ...headers };
}

async function openArtifact(invoice, artifact) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const url = `/api/payments/download-${artifact}?paymentId=${encodeURIComponent(paymentId)}`;
    try {
        const response = await fetch(url, { headers: await sriHeaders() });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'No se pudo descargar el comprobante.');
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Factura_${paymentId}.${artifact === 'ride' ? 'pdf' : 'xml'}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

async function retryInvoice(invoice, button) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const isSandbox = invoice.providerLivemode === false || /^cs_test_/i.test(String(invoice.reference || invoice.refCode || paymentId));
    if (isSandbox) {
        window.showToast?.('Las compras de prueba no son comprobantes fiscales y no pueden emitirse al SRI.', true);
        return;
    }
    const confirmed = window.confirm(
        `Confirma la emisión fiscal manual.\n\nCompra: ${invoice.beatName || 'Beat'}\nComprador: ${invoice.buyerName || 'Consumidor final'}\nValor: ${formatMoney(invoice.value)}\n\nEsta acción envía la operación a la cola fiscal; no se debe usar para pruebas.`
    );
    if (!confirmed) return;
    button.disabled = true;
    button.textContent = 'Encolando…';
    try {
        const response = await fetch('/api/payments/retry-sri', {
            method: 'POST',
            headers: await sriHeaders(),
            body: JSON.stringify({ paymentId, confirmManualIssue: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo encolar la factura.');
        window.showToast?.('La factura quedó en la cola segura del SRI.');
        invoice.sriEstado = 'EN_COLA_EMISION';
        renderSriInvoicingView();
    } catch (error) {
        window.showToast?.(`❌ ${error.message}`, true);
        button.disabled = false;
        button.textContent = 'Reintentar';
    }
}

function bindInvoicingActions() {
    const root = document.getElementById('tab-invoicing');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';
    root.querySelector('#sri-invoicing-refresh')?.addEventListener('click', async () => {
        await window.loadHistory?.();
        renderSriInvoicingView();
    });
    root.querySelector('#sri-invoicing-settings')?.addEventListener('click', () => {
        window.openSettingsModal?.();
        requestAnimationFrame(() => window.activateSettingsSection?.('tax'));
    });
    root.querySelector('#sri-invoicing-search')?.addEventListener('input', renderSriInvoicingView);
    root.querySelector('#sri-invoicing-filter')?.addEventListener('change', renderSriInvoicingView);
}

export function renderSriInvoicingView() {
    const root = document.getElementById('tab-invoicing');
    if (!root) return;
    const history = currentHistory();
    const config = window.producerConfig || {};
    const ruc = String(config.sriRuc || '').trim();
    // La firma nunca llega al navegador: el backend expone únicamente esta
    // señal booleana para informar si el productor puede emitir.
    const hasSignature = config.sriSignatureConfigured === true;
    const workerHealthy = config.sriWorkerHealthy === true;
    const configured = Boolean(ruc && config.sriRazonSocial && hasSignature);
    const environment = String(config.sriAmbiente || '1') === '2' ? 'Producción' : 'Pruebas';
    const authorized = history.filter(item => statusOf(item) === 'AUTORIZADO').length;
    const pending = history.filter(item => PENDING_STATES.has(statusOf(item))).length;
    const failed = history.filter(item => stateClass(statusOf(item)) === 'failed').length;
    const total = history.length;

    const statusText = configured
        ? (environment === 'Producción' ? (workerHealthy ? 'Listo para emitir' : 'Worker SRI sin conexión') : 'Configurado para pruebas')
        : 'Configuración pendiente';
    const statusPill = configured && (environment !== 'Producción' || workerHealthy) ? 'ready' : (ruc || hasSignature ? 'warning' : 'off');
    const environmentPill = environment === 'Producción' ? 'production' : 'test';
    const query = String(root.querySelector('#sri-invoicing-search')?.value || '').trim().toLowerCase();
    const selected = String(root.querySelector('#sri-invoicing-filter')?.value || 'all');
    const rows = history.filter(item => {
        const status = statusOf(item);
        const haystack = [item.refCode, item.reference, item.beatName, item.buyerName, item.sriClaveAcceso].join(' ').toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const matchesStatus = selected === 'all' || (selected === 'authorized' && status === 'AUTORIZADO') || (selected === 'pending' && PENDING_STATES.has(status)) || (selected === 'failed' && stateClass(status) === 'failed') || (selected === 'none' && stateClass(status) === 'none');
        return matchesQuery && matchesStatus;
    });

    const statusEl = root.querySelector('#sri-invoicing-status');
    if (statusEl) statusEl.innerHTML = `<div class="sri-facturador-status-copy"><strong>${statusText}</strong><span>${configured ? (environment === 'Producción' ? (workerHealthy ? 'Emite manualmente o activa la cola sólo para pagos Live que soliciten factura.' : 'El worker no registró actividad reciente; no se encolarán emisiones hasta restaurar el servicio.') : 'Las emisiones se envían al ambiente de pruebas; no son comprobantes fiscales de producción.') : 'Completa el RUC, el ambiente fiscal y la firma electrónica en Configuración.'}</span></div><span class="sri-facturador-pill ${statusPill}">${statusText}</span><span class="sri-facturador-pill ${environmentPill}">${environment}</span><span class="sri-facturador-ruc">RUC ${maskedRuc(ruc)}</span>`;
    const metricValues = { total, authorized, pending, failed };
    Object.entries(metricValues).forEach(([key, value]) => {
        const element = root.querySelector(`[data-sri-metric="${key}"]`);
        if (element) element.textContent = value;
    });

    const body = root.querySelector('#sri-invoicing-table-body');
    if (!body) return;
    if (!rows.length) {
        body.innerHTML = `<tr><td colspan="5"><div class="sri-facturador-empty"><strong>${history.length ? 'No hay facturas que coincidan' : 'Aún no hay operaciones para facturar'}</strong><span>${history.length ? 'Cambia el filtro o la búsqueda.' : 'Las facturas se crean después de que una compra queda confirmada.'}</span></div></td></tr>`;
        return;
    }
    body.innerHTML = rows.map(item => {
        const status = statusOf(item);
        const key = invoiceKey(item);
        const error = item.sriErrorMensaje ? `<small>${safeText(String(item.sriErrorMensaje).slice(0, 90))}</small>` : '';
        const actions = status === 'AUTORIZADO'
            ? `<button type="button" data-sri-action="ride">RIDE PDF</button><button type="button" data-sri-action="xml">XML</button>`
            : status === 'AUTORIZADO_ENTREGA_PENDIENTE'
                ? `<span class="sri-facturador-tracking">No reemitir · recuperar archivos</span>`
                : status === 'ERROR_REQUIERE_REVISION'
                    ? `<span class="sri-facturador-tracking">Revisión manual necesaria</span>`
            : stateClass(status) === 'pending'
                ? `<span class="sri-facturador-tracking">En seguimiento</span>`
                : `<button type="button" class="retry" data-sri-action="retry">${stateClass(status) === 'failed' ? 'Reintentar' : 'Emitir'}</button>`;
        return `<tr data-sri-key="${safeText(key)}"><td><span class="sri-facturador-ref">${safeText(item.refCode || item.reference || key || 'Sin referencia')}</span>${item.sriClaveAcceso ? `<small>Clave ${safeText(item.sriClaveAcceso)}</small>` : ''}</td><td>${safeText(item.date || '—')}</td><td><strong>${safeText(item.beatName || 'Beat')}</strong><small>${safeText(item.buyerName || 'Consumidor final')}</small></td><td>${formatMoney(item.value)}</td><td><span class="sri-facturador-state ${stateClass(status)}">${stateLabel(status)}</span>${error}<div class="sri-facturador-row-actions">${actions}</div></td></tr>`;
    }).join('');

    body.querySelectorAll('tr[data-sri-key]').forEach(row => {
        const item = history.find(invoice => invoiceKey(invoice) === row.dataset.sriKey);
        if (!item) return;
        row.querySelector('[data-sri-action="ride"]')?.addEventListener('click', () => openArtifact(item, 'ride'));
        row.querySelector('[data-sri-action="xml"]')?.addEventListener('click', () => openArtifact(item, 'xml'));
        const retry = row.querySelector('[data-sri-action="retry"]');
        retry?.addEventListener('click', () => retryInvoice(item, retry));
    });
    window.safeCreateIcons?.(root);
}

export async function initSriInvoicingView() {
    bindInvoicingActions();
    await window.loadHistory?.();
    renderSriInvoicingView();
}

window.initSriInvoicingView = initSriInvoicingView;
window.renderSriInvoicingView = renderSriInvoicingView;
