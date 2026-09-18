import crypto from 'crypto';
import { isTrustedBeatssOrigin } from './_cors-origin.js';

const DEFAULT_APP_ORIGIN = 'https://beatss.app';
const COMPLETE_DELIVERY_STATUSES = new Set([
    'portal_sent',
    'sent',
    'portal_ready_sandbox',
    'sandbox_complete'
]);

function safeOrigin(value) {
    try {
        const url = new URL(String(value || DEFAULT_APP_ORIGIN));
        return isTrustedBeatssOrigin(url.origin) ? url.origin : DEFAULT_APP_ORIGIN;
    } catch (_) {
        return DEFAULT_APP_ORIGIN;
    }
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
}

export function purchasePortalUrl(appOrigin, paymentId, downloadToken) {
    const url = new URL('/', safeOrigin(appOrigin));
    // El portal del comprador es una ruta pública y firmada; no debe entrar
    // por la raíz de la aplicación, que puede llevar al acceso del Studio.
    url.pathname = `/descargas/${encodeURIComponent(String(paymentId || ''))}`;
    url.searchParams.set('token', String(downloadToken || ''));
    return url.toString();
}

export function deliveryNotificationIsComplete(payment = {}) {
    return Boolean(payment.deliveryEmailSentAt) || COMPLETE_DELIVERY_STATUSES.has(String(payment.deliveryStatus || ''));
}

export function isSandboxEmailRecipient(value) {
    return /^[^\s@]+@[^\s@]+\.test$/i.test(String(value || '').trim());
}

export function buildPurchaseDeliveryEmail({ payment, producer, portalUrl, portalEntries = [], emailjsPrivateKey = '' }) {
    // El correo nunca enlaza directamente al PDF ni a los masters privados.
    // El portal valida la compra y emite enlaces firmados de corta duración.
    const primaryUrl = portalUrl;
    const safeReference = String(payment.reference || payment.id || 'BEATSS').replace(/[^a-zA-Z0-9_-]/g, '_');
    const entries = portalEntries.length
        ? portalEntries
        : [{ beatName: payment.beatName, licenseType: payment.licenseType, url: primaryUrl, hasContract: false }];
    const buttons = entries.map((entry) => {
        const label = entry.hasContract ? 'Descargar licencia PDF' : 'Abrir compra y descargas';
        const title = `${escapeHtml(entry.beatName || 'Instrumental')} · ${escapeHtml(entry.licenseType || 'Licencia')}`;
        return `<div style="margin-bottom:12px;padding:16px;border:1px solid #e5e7eb;border-radius:10px"><div style="font-size:13px;font-weight:700;color:#17233b;margin-bottom:10px">${title}</div><a href="${escapeHtml(entry.url)}" target="_blank" style="display:inline-block;padding:12px 20px;background:#635bff;color:#fff!important;text-decoration:none;border-radius:8px;font-weight:700">${label}</a></div>`;
    }).join('');
    const deliveryLinks = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;text-align:center"><div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin-bottom:10px">COMPRA CONFIRMADA</div>${buttons}<div style="font-size:12px;line-height:1.5;color:#64748b">Tu portal privado contiene la licencia y los archivos autorizados para tu compra.</div></div>`;
    const payload = {
        // El productor puede personalizar EmailJS desde Firestore. Para la
        // cuenta principal de BEATSS mantenemos además un respaldo server-only
        // en Vercel, de modo que una configuración privada vacía no bloquee la
        // entrega de una compra ya pagada.
        service_id: String(producer.emailjsServiceId || process.env.EMAILJS_SERVICE_ID || ''),
        template_id: String(producer.emailjsTemplateId || process.env.EMAILJS_TEMPLATE_ID || ''),
        user_id: String(producer.emailjsPublicKey || process.env.EMAILJS_PUBLIC_KEY || ''),
        template_params: {
            to_name: String(payment.buyerName || ''),
            to_email: String(payment.buyerEmail || ''),
            beat_name: String(payment.beatName || ''),
            license_type: String(payment.licenseType || ''),
            delivery_links: deliveryLinks,
            producer_name: String(producer.aka || producer.name || 'BEATSS'),
            producer_email: String(producer.email || ''),
            pdf_filename: `Licencia_${safeReference}.pdf`,
            pdf_url: primaryUrl
        }
    };
    if (emailjsPrivateKey) payload.accessToken = String(emailjsPrivateKey);
    return payload;
}

async function claimNotification(db, paymentRef) {
    const attemptId = crypto.randomBytes(12).toString('hex');
    const nowMs = Date.now();
    const leaseUntil = new Date(nowMs + 2 * 60 * 1000).toISOString();
    return db.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(paymentRef);
        if (!snapshot.exists) throw new Error('No se encontró el pago para notificar la entrega.');
        const payment = snapshot.data();
        if (deliveryNotificationIsComplete(payment)) {
            return { claimed: false, complete: true, payment };
        }
        const activeLease = Date.parse(String(payment.deliveryNotificationLeaseUntil || '')) > nowMs;
        if (payment.deliveryStatus === 'notifying' && activeLease) {
            return { claimed: false, complete: false, inProgress: true, payment };
        }
        transaction.update(paymentRef, {
            deliveryStatusBeforeNotification: String(payment.deliveryStatus || 'awaiting_contract'),
            deliveryStatus: 'notifying',
            deliveryNotificationAttemptId: attemptId,
            deliveryNotificationLeaseUntil: leaseUntil,
            deliveryNotificationLastAttemptAt: new Date(nowMs).toISOString(),
            deliveryNotificationAttempts: Number(payment.deliveryNotificationAttempts || 0) + 1
        });
        return {
            claimed: true,
            complete: false,
            attemptId,
            originalStatus: String(payment.deliveryStatus || 'awaiting_contract'),
            payment
        };
    });
}

async function finishAttempt(paymentRef, attemptId, fields) {
    const snapshot = await paymentRef.get();
    if (!snapshot.exists || snapshot.data()?.deliveryNotificationAttemptId !== attemptId) return false;
    await paymentRef.update({
        ...fields,
        deliveryNotificationLeaseUntil: null,
        deliveryNotificationAttemptId: null
    });
    return true;
}

export async function notifyPurchaseDelivery({
    db,
    paymentId,
    producer = {},
    appOrigin = DEFAULT_APP_ORIGIN,
    downloadToken = '',
    relatedDeliveries = [],
    emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY || '',
    fetchImpl = fetch
}) {
    const paymentRef = db.collection('payments').doc(paymentId);
    const claim = await claimNotification(db, paymentRef);
    if (claim.complete) return { complete: true, alreadySent: true };
    if (!claim.claimed) return { complete: false, inProgress: true };

    const portalUrl = purchasePortalUrl(appOrigin, paymentId, downloadToken);
    const portalEntries = relatedDeliveries.map((delivery) => ({
        beatName: delivery.beatName,
        licenseType: delivery.licenseType,
        url: purchasePortalUrl(appOrigin, delivery.paymentId, delivery.downloadToken),
        hasContract: false
    }));
    const payload = buildPurchaseDeliveryEmail({
        payment: { id: paymentId, ...claim.payment },
        producer,
        portalUrl,
        portalEntries,
        emailjsPrivateKey
    });
    const missingConfig = !payload.service_id || !payload.template_id || !payload.user_id;
    if (missingConfig) {
        await finishAttempt(paymentRef, claim.attemptId, {
            deliveryStatus: claim.originalStatus,
            deliveryEmailErrorAt: new Date().toISOString(),
            deliveryEmailErrorCode: 'EMAIL_NOT_CONFIGURED'
        });
        return { complete: false, errorCode: 'EMAIL_NOT_CONFIGURED' };
    }

    if (isSandboxEmailRecipient(claim.payment.buyerEmail)) {
        await finishAttempt(paymentRef, claim.attemptId, {
            deliveryStatus: claim.payment.contractPdfUrl ? 'sandbox_complete' : 'portal_ready_sandbox',
            deliveryEmailMode: 'sandbox',
            deliveryCompletedAt: new Date().toISOString()
        });
        return { complete: true, sandbox: true };
    }

    try {
        const response = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(`EmailJS respondió ${response.status}.`);
        const now = new Date().toISOString();
        await finishAttempt(paymentRef, claim.attemptId, {
            deliveryStatus: claim.payment.contractPdfUrl ? 'sent' : 'portal_sent',
            deliveryEmailSentAt: now,
            deliveryCompletedAt: now,
            deliveryEmailErrorCode: ''
        });
        return { complete: true, sent: true };
    } catch (error) {
        await finishAttempt(paymentRef, claim.attemptId, {
            deliveryStatus: claim.originalStatus,
            deliveryEmailErrorAt: new Date().toISOString(),
            deliveryEmailErrorCode: 'EMAIL_SEND_FAILED'
        });
        return { complete: false, errorCode: 'EMAIL_SEND_FAILED', error };
    }
}

export async function notifyPurchaseOrderDelivery({
    db,
    deliveries = [],
    producer = {},
    appOrigin = DEFAULT_APP_ORIGIN,
    emailjsPrivateKey = process.env.EMAILJS_PRIVATE_KEY || '',
    fetchImpl = fetch
}) {
    if (!deliveries.length) return { complete: false, errorCode: 'NO_DELIVERIES' };
    const primary = deliveries[0];
    const result = await notifyPurchaseDelivery({
        db,
        paymentId: primary.paymentId,
        producer,
        appOrigin,
        downloadToken: primary.downloadToken,
        relatedDeliveries: deliveries,
        emailjsPrivateKey,
        fetchImpl
    });
    if (!result.complete || deliveries.length === 1) return result;

    const now = new Date().toISOString();
    for (const delivery of deliveries.slice(1)) {
        const paymentRef = db.collection('payments').doc(delivery.paymentId);
        const snapshot = await paymentRef.get();
        if (!snapshot.exists || deliveryNotificationIsComplete(snapshot.data())) continue;
        await paymentRef.update(result.sandbox ? {
            deliveryStatus: 'portal_ready_sandbox',
            deliveryEmailMode: 'sandbox',
            deliveryCompletedAt: now
        } : {
            deliveryStatus: 'portal_sent',
            deliveryEmailSentAt: now,
            deliveryCompletedAt: now,
            deliveryEmailErrorCode: ''
        });
    }
    return result;
}
