import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { enqueueSriForPayment } from '../_sri_queue.js';
import crypto from 'crypto';
import { isTrustedBeatssOrigin } from '../_cors-origin.js';

export const config = {
    api: { bodyParser: false }
};

const DEUNA_QR_WINDOW_MS = 5 * 60 * 1000;
const DEUNA_QR_LIMIT = 30;
const deunaQrRateWindows = new Map();

export function resetDeunaRateLimitsForTest() {
    deunaQrRateWindows.clear();
}

export function checkDeunaQrRateLimit(ip, now = Date.now(), limit = DEUNA_QR_LIMIT, windowMs = DEUNA_QR_WINDOW_MS) {
    const record = deunaQrRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        deunaQrRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

function timingSafeTextEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function verifyDeunaWebhookSignature(rawBody, signature, secret) {
    if (!secret || !signature || !rawBody) return false;
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    return timingSafeTextEqual(signature, expected);
}

export function isFreshDeunaWebhook(payload, nowMs = Date.now(), toleranceSeconds = 300) {
    const signedAt = payload?.signed_at || payload?.data?.signed_at;
    if (!signedAt) return false;
    const signedAtMs = typeof signedAt === 'number'
        ? (signedAt > 1e12 ? signedAt : signedAt * 1000)
        : Date.parse(String(signedAt));
    if (!Number.isFinite(signedAtMs)) return false;
    return Math.abs(nowMs - signedAtMs) <= Math.max(30, Number(toleranceSeconds) || 300) * 1000;
}

export function canUseDeunaSimulation(headers = {}, env = process.env) {
    if (env.NODE_ENV === 'production' || env.ALLOW_DEUNA_SIMULATION !== 'true') return false;
    const configuredSecret = String(env.DEUNA_SIMULATION_SECRET || '');
    const providedSecret = String(headers['x-beatss-simulation-secret'] || '');
    return configuredSecret.length >= 32 && timingSafeTextEqual(configuredSecret, providedSecret);
}

async function readRawJson(req) {
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > 1024 * 1024) throw new Error('PAYLOAD_TOO_LARGE');
        chunks.push(buffer);
    }
    const rawBody = Buffer.concat(chunks);
    if (!rawBody.length) throw new Error('EMPTY_BODY');
    return { rawBody, body: JSON.parse(rawBody.toString('utf8')) };
}

function extractWebhookPayment(payload = {}) {
    const nested = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const order = payload.order && typeof payload.order === 'object'
        ? payload.order
        : (nested.order && typeof nested.order === 'object' ? nested.order : {});
    const description = payload.description || payload.reference || payload.detail || payload.memo ||
        nested.description || nested.reference || nested.detail || order.description || order.reference || '';
    let purchaseId = payload.purchaseId || payload.order_id || order.order_id || nested.purchaseId || '';
    const match = String(description).match(/BEATSS-([a-zA-Z0-9_-]+)/);
    if (match) purchaseId = match[1];
    const status = payload.status || order.status || nested.status || nested.state ||
        payload.payment?.data?.status || order.payment?.data?.status || '';
    return { purchaseId: String(purchaseId || ''), status: String(status || ''), description: String(description || '') };
}

function extractWebhookAmount(payload = {}) {
    const nested = payload.data && typeof payload.data === 'object' ? payload.data : {};
    const order = payload.order && typeof payload.order === 'object'
        ? payload.order
        : (nested.order && typeof nested.order === 'object' ? nested.order : {});
    const amountValue = payload.amount?.amount ?? payload.amount ?? payload.total_amount?.amount ?? payload.total_amount ??
        order.amount?.amount ?? order.amount ?? order.total_amount?.amount ?? order.total_amount;
    const currency = payload.currency || payload.amount?.currency || payload.total_amount?.currency ||
        order.currency || order.amount?.currency || order.total_amount?.currency || '';
    return { amount: Number(amountValue), currency: String(currency || '').toUpperCase() };
}

function amountMatchesPayment(payload, payment) {
    const { amount, currency } = extractWebhookAmount(payload);
    if (currency && currency !== 'USD') return false;
    if (!Number.isFinite(amount)) return true;
    const expected = Number(payment.finalPrice ?? payment.price);
    if (!Number.isFinite(expected)) return false;
    const normalizedAmount = Number.isInteger(amount) && amount > expected * 10 ? amount / 100 : amount;
    return Math.abs(normalizedAmount - expected) <= 0.01;
}

export default async function handler(req, res) {
    // CORS
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Deuna-Signature, X-Beatss-Simulation-Secret');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Determine which endpoint we are routing to based on req.url
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    
    let endpoint = '';
    if (pathname.includes('/qr')) {
        endpoint = 'qr';
    } else if (pathname.includes('/simulate-confirm')) {
        endpoint = 'simulate-confirm';
    } else if (pathname.includes('/webhook')) {
        endpoint = 'webhook';
    } else {
        // Fallback to query parameter if rewrite mapping passes it
        endpoint = req.query.endpoint || '';
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    let rawBody;
    let requestBody;
    try {
        const parsed = await readRawJson(req);
        rawBody = parsed.rawBody;
        requestBody = parsed.body;
    } catch (error) {
        const status = error?.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
        return res.status(status).json({ error: 'Cuerpo JSON inválido.' });
    }

    if (endpoint === 'qr') {
        const ip = getClientIp(req);
        const rate = checkDeunaQrRateLimit(ip);
        if (!rate.allowed) {
            res.setHeader('Retry-After', String(rate.retryAfterSeconds));
            return res.status(429).json({ error: 'Demasiadas solicitudes para generar QR de Deuna. Inténtalo más tarde.' });
        }
        try {
            const { purchaseId, amount, deunaPhone } = requestBody;
            if (!purchaseId || !amount) {
                return res.status(400).json({ error: "Faltan parámetros 'purchaseId' o 'amount'" });
            }
            const cleanPurchaseId = String(purchaseId).trim();
            if (!/^[a-zA-Z0-9_-]{1,128}$/.test(cleanPurchaseId)) {
                return res.status(400).json({ error: 'Identificador de compra inválido.' });
            }
            const parsedAmount = Number(amount);
            if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 100000) {
                return res.status(400).json({ error: 'Monto inválido para pago Deuna.' });
            }
            const formattedAmount = parsedAmount.toFixed(2);
            const cleanPhone = String(deunaPhone || '0999999999').replace(/\D/g, '').slice(0, 20) || '0999999999';
            const deeplink = `deuna://payment?phone=${encodeURIComponent(cleanPhone)}&amount=${formattedAmount}&description=BEATSS-${encodeURIComponent(cleanPurchaseId)}`;
            const qrUrl = `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(deeplink)}&choe=UTF-8`;
            return res.status(200).json({
                status: "success",
                qrUrl: qrUrl,
                deeplink: deeplink
            });
        } catch (error) {
            console.error("❌ Error al generar QR Deuna:", error);
            return res.status(500).json({ error: 'Error interno al generar código de pago Deuna.' });
        }
    } 
    
    else if (endpoint === 'simulate-confirm') {
        if (!canUseDeunaSimulation(req.headers, process.env)) {
            return res.status(404).json({ error: 'Endpoint no disponible.' });
        }
        try {
            const { purchaseId } = requestBody;
            if (!purchaseId) {
                return res.status(400).json({ error: "Falta parámetro 'purchaseId'" });
            }
            initFirebaseAdmin();
            const db = getFirestore();
            const paymentRef = db.collection('payments').doc(purchaseId);
            const paymentSnap = await paymentRef.get();
            if (!paymentSnap.exists) {
                return res.status(404).json({ error: `No se encontró el pago con ID: ${purchaseId}` });
            }
            await paymentRef.update({
                status: 'completed',
                updatedAt: Date.now()
            });
            await enqueueSriForPayment(db, purchaseId, paymentSnap.data(), 'deuna-simulate-confirm');
            console.log(`📲 Pago Deuna! ${purchaseId} confirmado y actualizado a completed.`);
            return res.status(200).json({
                status: "success",
                message: `Pago ${purchaseId} confirmado exitosamente`
            });
        } catch (error) {
            console.error("❌ Error al confirmar pago Deuna:", error);
            return res.status(500).json({ error: 'Error interno al confirmar pago Deuna.' });
        }
    } 
    
    else if (endpoint === 'webhook') {
        try {
            const webhookSecret = String(process.env.DEUNA_WEBHOOK_SECRET || '');
            const signature = String(req.headers['x-deuna-signature'] || '');
            if (!webhookSecret) return res.status(503).json({ error: 'Webhook Deuna no configurado.' });
            if (!verifyDeunaWebhookSignature(rawBody, signature, webhookSecret)) {
                return res.status(401).json({ error: 'Firma de webhook inválida.' });
            }
            const tolerance = Number(process.env.DEUNA_WEBHOOK_TOLERANCE_SECONDS || 300);
            if (!isFreshDeunaWebhook(requestBody, Date.now(), tolerance)) {
                return res.status(401).json({ error: 'Webhook vencido o sin fecha de firma.' });
            }

            const payload = requestBody;
            const { purchaseId, status } = extractWebhookPayment(payload);
            if (!purchaseId) {
                return res.status(400).json({ error: "Falta parámetro 'purchaseId' o no se pudo extraer de la descripción" });
            }
            const successStates = ['completed', 'approved', 'paid', 'success', 'succeeded', 'done', 'processed'];
            const isCompleted = successStates.includes(String(status).toLowerCase());
            if (isCompleted) {
                initFirebaseAdmin();
                const db = getFirestore();
                const paymentRef = db.collection('payments').doc(purchaseId);
                const paymentSnap = await paymentRef.get();
                if (!paymentSnap.exists) {
                    return res.status(404).json({ error: `No se encontró el pago con ID: ${purchaseId}` });
                }
                const paymentData = paymentSnap.data() || {};
                if (!amountMatchesPayment(payload, paymentData)) {
                    return res.status(409).json({ error: 'El monto o la moneda no coinciden con el pedido.' });
                }
                if (['completed', 'approved'].includes(String(paymentData.status || '').toLowerCase())) {
                    return res.status(200).json({ status: 'success', idempotent: true });
                }
                if (String(paymentData.status || '').toLowerCase() !== 'pending') {
                    return res.status(409).json({ error: 'El pedido ya se encuentra en un estado terminal.' });
                }
                const deunaTransactionId = payload.transaction_id || payload.data?.transaction_id || payload.order?.transaction_id || '';
                await paymentRef.update({
                    status: 'completed',
                    updatedAt: Date.now(),
                    deunaSignedAt: payload.signed_at || payload.data?.signed_at || null,
                    deunaTransactionId: deunaTransactionId || null,
                    // El código BS del contrato no cambia. Este identificador
                    // es sólo la trazabilidad privada de la pasarela.
                    providerReference: String(deunaTransactionId || paymentData.providerReference || '')
                });
                await enqueueSriForPayment(db, purchaseId, paymentData, 'deuna-webhook');
                return res.status(200).json({ status: "success", message: `Pago ${purchaseId} confirmado exitosamente` });
            } else {
                console.log(`[-] Webhook recibido pero estado '${status}' no indica éxito.`);
                return res.status(200).json({ status: "ignored", message: `Estado '${status}' no indica éxito, omitido.` });
            }
        } catch (error) {
            console.error("❌ Error en webhook de Deuna:", error);
            return res.status(500).json({ error: 'Error interno al procesar webhook de Deuna.' });
        }
    } 
    
    else {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
}
