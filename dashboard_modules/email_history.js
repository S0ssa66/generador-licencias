import { auth, db, collection, addDoc, query, orderBy, limit, onSnapshot, onAuthStateChanged } from '../firebase.js';

const COLLECTION = 'email_logs';
let records = [];
let bound = false;
let liveUnsubscribe = null;
let liveUid = null;
let emailJsLoadPromise = null;
let authUnsubscribe = null;
let authReadyPromise = null;

const EMAILJS_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const getPath = () => auth.currentUser ? collection(db, 'users', auth.currentUser.uid, COLLECTION) : null;

function waitForAuthenticatedUser(timeoutMs = 12000) {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    if (authReadyPromise) return authReadyPromise;

    authReadyPromise = new Promise((resolve) => {
        let settled = false;
        let unsubscribe = () => {};
        const finish = (user) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            unsubscribe();
            resolve(user || null);
        };
        const timeoutId = window.setTimeout(() => finish(auth.currentUser), timeoutMs);
        unsubscribe = onAuthStateChanged(auth, finish);
    }).finally(() => { authReadyPromise = null; });

    return authReadyPromise;
}

function normalizeResources(resources = []) {
    return resources.filter(Boolean).map((resource) => ({
        kind: String(resource.kind || resource.type || 'archivo').slice(0, 40),
        label: String(resource.label || resource.filename || resource.kind || 'Archivo').slice(0, 120),
        filename: String(resource.filename || '').slice(0, 180),
        url: typeof resource.url === 'string' && /^https?:\/\//i.test(resource.url) ? resource.url : ''
    }));
}

export function filterResourcesForLicense(resources = [], licenseType = '') {
    const type = String(licenseType || '').toLowerCase().trim();
    if (!type || type === 'exclusive' || type === 'unlimited' || type === 'premium_plus') {
        return resources;
    }
    if (type === 'basic') {
        return resources.filter((item) => item.kind !== 'wav' && item.kind !== 'stems');
    }
    if (type === 'premium') {
        return resources.filter((item) => item.kind !== 'stems');
    }
    return resources;
}

export async function recordEmailEvent(details = {}) {
    const path = getPath();
    if (!path) return null;
    const rawResources = normalizeResources(details.resources);
    const resources = filterResourcesForLicense(rawResources, details.licenseType);
    const payload = {
        createdAt: new Date().toISOString(),
        status: details.status === 'failed' ? 'failed' : 'sent',
        category: String(details.category || 'other').slice(0, 40),
        recipientEmail: String(details.recipientEmail || '').trim().slice(0, 180),
        recipientName: String(details.recipientName || '').slice(0, 120),
        subject: String(details.subject || '').slice(0, 240),
        beatName: String(details.beatName || '').slice(0, 160),
        reference: String(details.reference || '').slice(0, 120),
        paymentId: String(details.paymentId || '').slice(0, 120),
        licenseType: String(details.licenseType || '').slice(0, 100),
        provider: String(details.provider || 'EmailJS').slice(0, 40),
        serviceId: String(details.serviceId || '').slice(0, 100),
        templateId: String(details.templateId || '').slice(0, 100),
        resendOf: String(details.resendOf || '').slice(0, 120),
        resources,
        errorMessage: String(details.errorMessage || '').slice(0, 300)
    };
    try {
        const ref = await addDoc(path, payload);
        return ref.id;
    } catch (error) {
        console.warn('[BEATSS] No se pudo guardar el historial del email:', error?.message || error);
        return null;
    }
}

function dateValue(record) {
    const value = record.createdAt;
    if (value?.toDate) return value.toDate();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function formatDate(record) {
    return new Intl.DateTimeFormat('es-EC', { dateStyle: 'short', timeStyle: 'short' }).format(dateValue(record));
}

function currentFilteredRecords() {
    const search = (document.getElementById('email-history-search')?.value || '').toLowerCase().trim();
    const status = document.getElementById('email-history-status')?.value || 'all';
    const category = document.getElementById('email-history-category')?.value || 'all';
    return records.filter((record) => {
        const haystack = [record.recipientEmail, record.recipientName, record.subject, record.beatName, record.reference, record.paymentId].join(' ').toLowerCase();
        return (!search || haystack.includes(search)) && (status === 'all' || record.status === status) && (category === 'all' || record.category === category);
    });
}

function renderStats() {
    const sent = records.filter((record) => record.status === 'sent').length;
    const failed = records.filter((record) => record.status === 'failed').length;
    const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
    set('email-stat-total', records.length); set('email-stat-sent', sent); set('email-stat-failed', failed);
    set('email-stat-week', records.filter((record) => dateValue(record).getTime() >= week).length);
    const badge = document.getElementById('email-history-count'); if (badge) badge.textContent = records.length;
}

function renderRows() {
    const tbody = document.getElementById('email-history-table-body');
    const empty = document.getElementById('email-history-empty');
    if (!tbody || !empty) return;
    const filtered = currentFilteredRecords();
    tbody.innerHTML = filtered.map((record) => {
        const validResources = filterResourcesForLicense(record.resources || [], record.licenseType);
        const resources = validResources.map((resource) => resource.url
            ? `<a class="email-resource-link" href="${escapeHtml(resource.url)}" target="_blank" rel="noopener">${escapeHtml(resource.label)} <span>↗</span></a>`
            : `<span class="email-resource-muted">${escapeHtml(resource.label)}</span>`).join('');
        const status = record.status === 'sent' ? '<span class="email-status email-status-sent">Enviado</span>' : `<span class="email-status email-status-failed" title="${escapeHtml(record.errorMessage)}">Error</span>`;
        return `<tr>
            <td class="email-date">${escapeHtml(formatDate(record))}</td>
            <td><strong>${escapeHtml(record.recipientName || 'Sin nombre')}</strong><small>${escapeHtml(record.recipientEmail || 'Sin email')}</small></td>
            <td><strong>${escapeHtml(record.category === 'license_delivery' ? 'Entrega de licencia' : record.category === 'pending_payment' ? 'Pago pendiente' : record.category === 'payment_notification' ? 'Notificación de pago' : 'Otro')}</strong><small>${escapeHtml(record.subject || 'Sin asunto')}</small></td>
            <td><strong>${escapeHtml(record.beatName || '—')}</strong><small>${escapeHtml(record.reference || record.paymentId || 'Sin referencia')}</small></td>
            <td class="email-resources">${resources || '<span class="email-resource-muted">Sin archivos</span>'}</td>
            <td>${status}<button type="button" class="email-resend-btn" data-email-id="${escapeHtml(record.id)}" ${record.templateId && record.recipientEmail ? '' : 'disabled'}><i data-lucide="send"></i> Reenviar</button></td>
        </tr>`;
    }).join('');
    empty.hidden = filtered.length !== 0;
    const table = tbody.closest('table'); if (table) table.style.display = filtered.length ? 'table' : 'none';
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

function applyImportedRecords(importedRecords) {
    if (!Array.isArray(importedRecords) || importedRecords.length === 0) return false;
    records = importedRecords
        .filter((record) => record && record.id)
        .map((record) => ({ ...record }));
    renderStats();
    renderRows();
    return records.length > 0;
}

function buildDeliveryLinks(record) {
    const validResources = filterResourcesForLicense(record.resources || [], record.licenseType);
    return validResources.filter((resource) => resource.url).map((resource) => `<a href="${escapeHtml(resource.url)}">${escapeHtml(resource.label)}</a>`).join('<br>') || 'Los archivos de esta entrega están disponibles en tu portal BEATSS.';
}

async function resendEmail(record) {
    if (!record?.templateId || !record.recipientEmail) throw new Error('Este registro no tiene plantilla o destinatario válido.');
    await ensureEmailJs();
    const config = window.producerConfig || window.storeProducerConfig || {};
    const publicKey = config.emailjsPublicKey || '';
    const serviceId = record.serviceId || config.emailjsServiceId || '';
    if (!publicKey || !serviceId) throw new Error('Configura tu servicio de correo antes de reenviar.');
    emailjs.init(publicKey);
    const params = {
        to_name: record.recipientName || 'Cliente', to_email: record.recipientEmail,
        beat_name: record.beatName || 'Beat', license_type: record.licenseType || '',
        delivery_links: buildDeliveryLinks(record), producer_name: config.aka || config.name || 'BEATSS',
        producer_email: config.email || '', pdf_filename: (record.resources || []).find((item) => item.kind === 'pdf')?.filename || ''
    };
    await emailjs.send(serviceId, record.templateId, params);
    await recordEmailEvent({ ...record, status: 'sent', provider: 'EmailJS', serviceId, templateId: record.templateId, resendOf: record.id, subject: `[Reenvío] ${record.subject || ''}`, resources: record.resources });
    return true;
}

function ensureEmailJs() {
    if (window.emailjs?.send) return Promise.resolve(window.emailjs);
    if (emailJsLoadPromise) return emailJsLoadPromise;

    emailJsLoadPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${EMAILJS_SCRIPT_URL}"]`);
        const script = existing || document.createElement('script');
        let settled = false;
        const finish = (error) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            if (error) reject(error);
            else if (window.emailjs?.send) resolve(window.emailjs);
            else reject(new Error('EmailJS cargó sin exponer su API. Recarga la página e inténtalo nuevamente.'));
        };
        const timeoutId = window.setTimeout(() => finish(new Error('EmailJS tardó demasiado en cargar. Revisa tu conexión e inténtalo nuevamente.')), 12000);

        script.addEventListener('load', () => finish());
        script.addEventListener('error', () => finish(new Error('No se pudo cargar EmailJS. Revisa tu conexión o bloqueadores del navegador.')));
        if (!existing) {
            script.src = EMAILJS_SCRIPT_URL;
            script.async = true;
            document.head.appendChild(script);
        } else if (window.emailjs?.send) {
            finish();
        }
    }).finally(() => { emailJsLoadPromise = null; });

    return emailJsLoadPromise;
}

async function handleResendClick(event) {
    const button = event.target.closest('.email-resend-btn');
    if (!button || button.disabled) return;
    const record = records.find((item) => item.id === button.dataset.emailId);
    if (!record || !window.confirm(`¿Reenviar este correo a ${record.recipientEmail}?`)) return;
    const original = button.innerHTML; button.disabled = true; button.innerHTML = '<i data-lucide="loader-circle"></i> Enviando...';
    try { await resendEmail(record); window.showToast?.('Correo reenviado correctamente'); await loadEmailHistory(); }
    catch (error) { console.error('[BEATSS] Error reenviando email:', error); window.showToast?.(error.message || 'No se pudo reenviar el correo', true); button.disabled = false; button.innerHTML = original; }
    if (window.lucide?.createIcons) window.lucide.createIcons();
}

async function importEmailHistory() {
    const token = await auth.currentUser?.getIdToken();
    if (!token) throw new Error('Tu sesión expiró. Inicia sesión nuevamente.');
    const response = await fetch('/api/gdrive-import-email-history', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo importar el historial.');
    applyImportedRecords(data.records);
    window.showToast?.(`${data.imported} email(s) antiguo(s) importado(s)`);
    await loadEmailHistory();
}

function subscribeToEmailHistory(path, user = auth.currentUser) {
    const uid = user?.uid;
    if (!uid || !path) return Promise.resolve();
    if (liveUid !== uid) {
        liveUnsubscribe?.();
        liveUnsubscribe = null;
        liveUid = uid;
    }
    if (liveUnsubscribe) return Promise.resolve();

    return new Promise((resolve) => {
        let firstSnapshot = true;
        liveUnsubscribe = onSnapshot(query(path, orderBy('createdAt', 'desc'), limit(200)), (snapshot) => {
            records = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
            renderStats();
            renderRows();
            if (firstSnapshot) {
                firstSnapshot = false;
                resolve();
            }
        }, (error) => {
            console.error('[BEATSS] Error actualizando emails en tiempo real:', error);
            liveUnsubscribe = null;
            if (firstSnapshot) {
                firstSnapshot = false;
                resolve();
            }
        });
    });
}

export async function loadEmailHistory() {
    // La navegación puede ocurrir unos milisegundos antes de que Firebase
    // termine de restaurar la sesión. No devolver silenciosamente aquí: eso
    // dejaba la pantalla en cero y nunca iniciaba la importación automática.
    const user = await waitForAuthenticatedUser();
    const path = user ? collection(db, 'users', user.uid, COLLECTION) : null;
    if (!path) return;
    // Al volver a la pestaña no abrimos una segunda suscripción. La anterior
    // sigue actualizando `records`, así que hay que redibujarla en vez de
    // reemplazar la tabla con un cargador que ya no recibirá un primer snapshot.
    const hasLiveHistory = Boolean(liveUnsubscribe && liveUid === user.uid);
    if (hasLiveHistory) {
        renderStats();
        renderRows();
        return;
    }
    const tbody = document.getElementById('email-history-table-body');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="email-history-loading">Cargando historial...</td></tr>';
    try {
        // El primer snapshot ya contiene el estado actual; hacer getDocs antes
        // duplicaba hasta 200 lecturas en cada apertura de la pestaña.
        await subscribeToEmailHistory(path, user);
    } catch (error) {
        console.error('[BEATSS] Error cargando emails enviados:', error);
        if (records.length === 0 && tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="email-history-loading">No se pudo cargar el historial: ${escapeHtml(error?.message || 'error desconocido')}</td></tr>`;
        } else {
            // Conserva la respuesta ya obtenida por el servidor; una lectura
            // secundaria del cliente no debe borrar una lista válida.
            renderStats();
            renderRows();
        }
    }
}

function downloadBlob(content, filename, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([content], { type })); link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

export function sanitizeCsvFormula(value) {
    const raw = String(value ?? '');
    const trimmed = raw.trim();
    if (/^[=+\-@\t\r%]/.test(raw) || /^[=+\-@%]/.test(trimmed)) {
        return `'${raw}`;
    }
    return raw;
}

export function exportEmailHistoryToJSON() {
    const recordsToExport = currentFilteredRecords().map((record) => ({
        ...record,
        resources: filterResourcesForLicense(record.resources || [], record.licenseType)
    }));
    downloadBlob(JSON.stringify(recordsToExport, null, 2), 'beatss-emails-enviados.json', 'application/json');
}
export function exportEmailHistoryToCSV() {
    const headers = ['fecha', 'destinatario', 'email', 'tipo', 'asunto', 'beat', 'referencia', 'estado', 'archivos'];
    const rows = currentFilteredRecords().map((record) => [
        formatDate(record),
        record.recipientName,
        record.recipientEmail,
        record.category,
        record.subject,
        record.beatName,
        record.reference || record.paymentId,
        record.status,
        filterResourcesForLicense(record.resources || [], record.licenseType).map((item) => item.label).join(' | ')
    ]);
    const csv = [headers, ...rows].map((row) => row.map((cell) => `"${sanitizeCsvFormula(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadBlob('\ufeff' + csv, 'beatss-emails-enviados.csv', 'text/csv;charset=utf-8');
}

function bind() {
    ['email-history-search', 'email-history-status', 'email-history-category'].forEach((id) => document.getElementById(id)?.addEventListener(id === 'email-history-search' ? 'input' : 'change', renderRows));
    document.getElementById('btn-refresh-email-history')?.addEventListener('click', loadEmailHistory);
    document.getElementById('btn-import-email-history')?.addEventListener('click', async (event) => {
        const button = event.currentTarget; button.disabled = true;
        try { await importEmailHistory(); } catch (error) { window.showToast?.(error.message, true); }
        finally { button.disabled = false; }
    });
    document.getElementById('btn-export-email-history-json')?.addEventListener('click', exportEmailHistoryToJSON);
    document.getElementById('btn-export-email-history-csv')?.addEventListener('click', exportEmailHistoryToCSV);
    document.getElementById('email-history-table-body')?.addEventListener('click', handleResendClick);
}

export function initEmailHistory() {
    if (bound) return;
    bound = true;
    bind();
    authUnsubscribe = onAuthStateChanged(auth, (user) => {
        liveUnsubscribe?.();
        liveUnsubscribe = null;
        liveUid = null;
        if (user && document.getElementById('tab-email-history')?.classList.contains('active')) {
            void loadEmailHistory();
        }
    });
}

if (typeof window !== 'undefined') {
    window.recordEmailEvent = recordEmailEvent;
    window.filterResourcesForLicense = filterResourcesForLicense;
    window.loadEmailHistory = loadEmailHistory;
    window.exportEmailHistoryToCSV = exportEmailHistoryToCSV;
    window.exportEmailHistoryToJSON = exportEmailHistoryToJSON;
    window.sanitizeCsvFormula = sanitizeCsvFormula;
    window.initEmailHistory = initEmailHistory;
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initEmailHistory, { once: true });
    } else {
        initEmailHistory();
    }
}
