import { getFirestore } from 'firebase-admin/firestore';
import { findInvoice, initFirebaseAdmin, requireSession } from '../_sri_download.js';
import { enqueueSriJob, hasCompleteSriConfig } from '../_sri_queue.js';
import { isTrustedBeatssOrigin } from '../_cors-origin.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const retrySriRateWindows = new Map();

export function resetRetrySriRateLimit() {
    retrySriRateWindows.clear();
}

export function checkRetrySriRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = retrySriRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        retrySriRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getSanitizedClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export default async function handler(req, res) {
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkRetrySriRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiados intentos de reintento SRI. Por favor espera unos minutos.' });
    }

    try {
        const decoded = await requireSession(req);
        const paymentId = String(req.body?.paymentId || '').trim();
        if (req.body?.confirmManualIssue !== true) {
            return res.status(400).json({ error: 'Confirma expresamente la emisión fiscal antes de encolarla.' });
        }
        if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) return res.status(400).json({ error: 'ID de pago inválido' });

        initFirebaseAdmin();
        const db = getFirestore();
        const invoice = await findInvoice(db, paymentId, decoded);
        if (invoice.ref.parent.id !== 'payments' || invoice.data.status !== 'approved') {
            return res.status(409).json({ error: 'Sólo se puede facturar un pago aprobado y registrado.' });
        }
        const currentStatus = invoice.data.sriEstado || '';
        if (['AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE'].includes(currentStatus)) {
            return res.status(409).json({ error: 'La factura ya fue autorizada; no puede volver a emitirse.' });
        }
        if (currentStatus === 'ERROR_REQUIERE_REVISION') {
            return res.status(409).json({ error: 'Esta factura necesita conciliación manual antes de cualquier nueva emisión.' });
        }
        const reference = invoice.data.reference || invoice.data.refCode || paymentId;
        if (invoice.data.providerLivemode === false || /^cs_test_/i.test(String(reference))) {
            return res.status(409).json({ error: 'Las compras de prueba no generan comprobantes fiscales.' });
        }

        const producerId = invoice.data.producerId || invoice.ownerUid || decoded.uid;
        if (!invoice.data.producerId || invoice.data.producerId !== producerId) {
            return res.status(409).json({ error: 'El pago no tiene un productor válido.' });
        }
        const [publicConfigSnap, privateConfigSnap, sriConfigSnap] = await Promise.all([
            db.collection('users').doc(producerId).collection('config').doc('producer').get(),
            db.collection('users').doc(producerId).collection('private_config').doc('producer').get(),
            db.collection('users').doc(producerId).collection('private_config').doc('sri').get()
        ]);
        const sriConfig = sriConfigSnap.exists ? sriConfigSnap.data() : {};
        const publicConfig = {
            ...(publicConfigSnap.exists ? publicConfigSnap.data() : {}),
            ...sriConfig
        };
        const privateConfig = {
            ...(privateConfigSnap.exists ? privateConfigSnap.data() : {}),
            ...sriConfig
        };
        if (!hasCompleteSriConfig(publicConfig, privateConfig)) {
            return res.status(409).json({
                error: 'La configuración SRI está incompleta. Guarda el RUC, el certificado .p12/.pfx y su contraseña antes de reintentar.'
            });
        }

        const queued = await enqueueSriJob(db, {
            paymentId,
            producerId,
            publicConfig,
            privateConfig,
            requestedBy: decoded.uid,
            invoiceRequested: true,
            isLivePayment: true,
            manualOverride: true
        });
        if (!queued.queued) return res.status(409).json({ error: 'La operación no pudo encolarse para emitir factura.' });
        await db.collection('payments').doc(paymentId).set({
            sriManualOverrideConfirmedAt: new Date().toISOString(),
            sriManualOverrideConfirmedBy: decoded.uid,
            sriManualOverrideReason: 'owner_confirmed_manual_issue'
        }, { merge: true });
        return res.status(202).json({
            status: queued.alreadyQueued ? 'PENDING' : 'QUEUED',
            reference,
            message: queued.alreadyQueued
                ? 'La factura ya está en la cola segura del SRI.'
                : 'La factura quedó en la cola segura del SRI.'
        });
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        console.error('Error al encolar reintento SRI:', error.message);
        return res.status(status).json({ error: status === 500 ? 'No se pudo encolar el reintento SRI' : error.message });
    }
}
