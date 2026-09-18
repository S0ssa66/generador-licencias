import crypto from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getStripeFirebase } from '../api/_fulfill-beat-purchase.js';
import { normalizeCheckoutLegalAcceptance } from './legal-acceptance.js';
import { CURRENT_REFERENCE_VERSION, createPublicContractReference, referenceTokenFromBytes } from '../license-reference.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app';
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 1500 * 1024;
const MAX_ITEMS = 10;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT = 12;
const EMAIL_RATE_LIMIT = 6;
const PROCESSING_LEASE_MS = 2 * 60 * 1000;
const REFERENCE_SECRET = process.env.LICENSE_REFERENCE_SIGNING_KEY || process.env.DOWNLOAD_SIGNING_KEY || '';

const ALLOWED_METHODS = new Set(['transfer', 'deuna', 'paypal_manual']);
const LICENSE_DEFAULTS = Object.freeze({
    basic: 30,
    premium: 60,
    premium_plus: 100,
    unlimited_flp: 200,
    exclusive: 500
});

function createPendingContractReference({ paymentId, requestDocId, licenseType, issuedAt }) {
    if (REFERENCE_SECRET.length < 32) {
        throw new PendingOrderError(503, 'SERVICE_NOT_CONFIGURED', 'El servicio de referencias seguras todavía no está configurado.');
    }
    const token = referenceTokenFromBytes(
        crypto
            .createHmac('sha256', REFERENCE_SECRET)
            .update(`beatss-contract-reference-v3:${paymentId}:${requestDocId}`)
            .digest()
    );
    return createPublicContractReference({ licenseType, issuedAt, token });
}

export class PendingOrderError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'PendingOrderError';
        this.status = status;
        this.code = code;
    }
}

function reject(status, code, message) {
    throw new PendingOrderError(status, code, message);
}

export function cleanPendingText(value, max = 240) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function normalizeEmail(value, required = false) {
    const email = cleanPendingText(value, 254).toLowerCase();
    if ((!email && required) || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
        reject(400, 'INVALID_EMAIL', 'El correo electrónico no es válido.');
    }
    return email;
}

function normalizeDocumentId(value, label) {
    const id = cleanPendingText(value, 160);
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(id)) reject(400, 'INVALID_ID', `${label} no válido.`);
    return id;
}

export function parseReceiptDataUrl(value, maxBytes = MAX_RECEIPT_BYTES) {
    const source = String(value || '');
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(source);
    if (!match) reject(400, 'INVALID_RECEIPT', 'El comprobante debe ser una imagen JPEG, PNG o WebP.');
    const encoded = match[2].replace(/\s/g, '');
    if (!encoded || encoded.length > Math.ceil(maxBytes * 4 / 3) + 8) {
        reject(413, 'RECEIPT_TOO_LARGE', 'El comprobante supera el tamaño permitido.');
    }
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.length > maxBytes) reject(413, 'RECEIPT_TOO_LARGE', 'El comprobante supera el tamaño permitido.');

    const mimeType = match[1].toLowerCase();
    const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    const isWebp = bytes.length >= 12 && bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if ((mimeType === 'image/jpeg' && !isJpeg) || (mimeType === 'image/png' && !isPng) || (mimeType === 'image/webp' && !isWebp)) {
        reject(400, 'INVALID_RECEIPT', 'El contenido del comprobante no coincide con su formato.');
    }
    return {
        bytes,
        mimeType,
        extension: mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg',
        digest: crypto.createHash('sha256').update(bytes).digest('hex')
    };
}

export function getCanonicalLicensePrice(beat = {}, licenseType) {
    if (!Object.prototype.hasOwnProperty.call(LICENSE_DEFAULTS, licenseType)) {
        reject(400, 'INVALID_LICENSE', 'El tipo de licencia no es válido.');
    }
    const candidates = [
        beat[`price_${licenseType}`],
        beat[`${licenseType}Price`],
        LICENSE_DEFAULTS[licenseType]
    ];
    const price = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
    if (!price || price > 1_000_000 || (licenseType === 'exclusive' && price < 250)) {
        reject(409, 'INVALID_CATALOG_PRICE', 'El precio del catálogo no es válido para esta licencia.');
    }
    return Number(price.toFixed(2));
}

export function resolveCanonicalCoupon(coupons, rawCode) {
    const code = cleanPendingText(rawCode, 40).toUpperCase();
    if (!code) return { couponCode: '', discountPercent: 0 };
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) reject(400, 'INVALID_COUPON', 'El cupón no es válido.');
    const coupon = Array.isArray(coupons)
        ? coupons.find((entry) => cleanPendingText(entry?.code, 40).toUpperCase() === code)
        : null;
    const discount = Number(coupon?.discount);
    if (!coupon || !Number.isInteger(discount) || discount < 1 || discount > 99) {
        reject(400, 'INVALID_COUPON', 'El cupón no es válido o ya no está disponible.');
    }
    return { couponCode: code, discountPercent: discount };
}

export function deterministicPendingPaymentId(requestId, beatId, index = 0) {
    const digest = crypto.createHash('sha256').update(`${requestId}:${beatId}:${index}`).digest('hex');
    return `pending_${digest.slice(0, 40)}`;
}

export function fingerprintPendingOrder(value) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function nextRateLimitState(current = {}, nowMs = Date.now(), limit = IP_RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const windowStartMs = Number(current.windowStartMs || 0);
    const count = Number(current.count || 0);
    if (!Number.isFinite(windowStartMs) || nowMs - windowStartMs >= windowMs || nowMs < windowStartMs) {
        return { allowed: true, state: { windowStartMs: nowMs, count: 1 }, retryAfterSeconds: 0 };
    }
    if (count >= limit) {
        return {
            allowed: false,
            state: { windowStartMs, count },
            retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - nowMs) / 1000))
        };
    }
    return { allowed: true, state: { windowStartMs, count: count + 1 }, retryAfterSeconds: 0 };
}

function safeEqualHex(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

export function verifyPendingStatusToken(token, storedHash) {
    const normalized = String(token || '').trim();
    if (!normalized || normalized.length > 256) return false;
    return safeEqualHex(crypto.createHash('sha256').update(normalized).digest('hex'), storedHash);
}

export function normalizePendingCreateBody(body = {}) {
    const requestId = cleanPendingText(body.requestId, 80).toLowerCase();
    if (!/^po_[a-f0-9]{32,64}$/.test(requestId)) reject(400, 'INVALID_REQUEST_ID', 'La solicitud no tiene un identificador válido.');
    let legalAcceptance;
    try {
        legalAcceptance = normalizeCheckoutLegalAcceptance(body);
    } catch (error) {
        reject(400, error.code || 'INVALID_ACCEPTANCE', error.message || 'La aceptación de términos no es válida.');
    }

    const type = cleanPendingText(body.type, 40);
    if (!['beat_purchase', 'exclusive_offer'].includes(type)) reject(400, 'INVALID_ORDER_TYPE', 'El tipo de pedido no es válido.');
    const method = type === 'exclusive_offer' ? 'offer' : cleanPendingText(body.method, 40).toLowerCase();
    if (type === 'beat_purchase' && !ALLOWED_METHODS.has(method)) reject(400, 'INVALID_METHOD', 'El método de pago no es válido.');

    const producerId = normalizeDocumentId(body.producerId, 'Productor');
    const buyerName = cleanPendingText(body.buyerName, 160);
    const buyerEmail = normalizeEmail(body.buyerEmail, true);
    if (!buyerName) reject(400, 'BUYER_REQUIRED', 'El nombre del comprador es obligatorio.');

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > MAX_ITEMS) reject(400, 'INVALID_ITEMS', 'Selecciona entre 1 y 10 beats.');
    const items = rawItems.map((item) => ({
        beatId: normalizeDocumentId(item?.beatId, 'Beat'),
        licenseType: cleanPendingText(item?.licenseType, 40).toLowerCase()
    }));
    if (new Set(items.map((item) => `${item.beatId}:${item.licenseType}`)).size !== items.length) {
        reject(400, 'DUPLICATE_ITEMS', 'El pedido contiene beats duplicados.');
    }
    if (type === 'exclusive_offer' && (items.length !== 1 || items[0].licenseType !== 'exclusive')) {
        reject(400, 'INVALID_OFFER_ITEMS', 'La oferta debe corresponder a una sola licencia exclusiva.');
    }
    if (method === 'deuna' && items.length !== 1) reject(400, 'DEUNA_SINGLE_ITEM', 'Deuna admite un beat por pedido.');

    const invoiceRuc = cleanPendingText(body.invoiceRuc, 40);
    const invoiceCompany = cleanPendingText(body.invoiceCompany, 160);
    const invoiceAddress = cleanPendingText(body.invoiceAddress, 240);
    const invoiceEmail = normalizeEmail(body.invoiceEmail, false);
    const hasInvoiceData = Boolean(invoiceRuc || invoiceCompany || invoiceAddress || invoiceEmail);
    if (hasInvoiceData && (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !invoiceEmail)) {
        reject(400, 'INVALID_INVOICE', 'Los datos de facturación no son válidos.');
    }

    const statusTokenHash = cleanPendingText(body.statusTokenHash, 64).toLowerCase();
    if (type === 'beat_purchase' && !/^[a-f0-9]{64}$/.test(statusTokenHash)) {
        reject(400, 'INVALID_STATUS_CREDENTIAL', 'No se pudo proteger el estado del pedido.');
    }

    const normalized = {
        requestId,
        type,
        method,
        producerId,
        items,
        buyerName,
        buyerEmail,
        buyerPhone: cleanPendingText(body.buyerPhone, 40),
        buyerDni: cleanPendingText(body.buyerDni, 40),
        buyerCity: cleanPendingText(body.buyerCity, 160),
        buyerCountry: cleanPendingText(body.buyerCountry, 80),
        youtubeWhitelist: cleanPendingText(body.youtubeWhitelist, 500),
        invoiceRuc,
        invoiceCompany,
        invoiceAddress,
        invoiceEmail,
        couponCode: cleanPendingText(body.couponCode, 40).toUpperCase(),
        offerMessage: cleanPendingText(body.offerMessage, 1000),
        offerPrice: Number(body.offerPrice),
        statusTokenHash,
        acceptedTerms: true,
        acceptanceTimestamp: legalAcceptance.acceptanceTimestamp,
        termsVersion: legalAcceptance.termsVersion
    };
    if (type === 'exclusive_offer' && (!Number.isFinite(normalized.offerPrice) || normalized.offerPrice < 250 || normalized.offerPrice > 1_000_000)) {
        reject(400, 'INVALID_OFFER_PRICE', 'La oferta debe estar entre $250 y $1.000.000 USD.');
    }
    return normalized;
}

function requestOrigin(req) {
    const origin = String(req.headers?.origin || '');
    return isTrustedBeatssOrigin(origin) ? origin : '';
}

export function requestIp(req = {}) {
    const headers = req.headers || {};
    // Vercel preserva esta cabecera aunque exista un proxy adicional delante;
    // solo en desarrollo se usa el fallback convencional.
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

function privateHash(secret, label, value) {
    return crypto.createHmac('sha256', secret).update(`${label}:${value}`).digest('hex');
}

async function loadCanonicalOrder(db, order) {
    const producerRef = db.collection('users').doc(order.producerId);
    const producerSnapshot = await producerRef.collection('config').doc('producer').get();
    if (!producerSnapshot.exists) reject(404, 'PRODUCER_NOT_FOUND', 'Productor no encontrado.');
    const privateProducerSnapshot = await producerRef.collection('private_config').doc('producer').get();
    const producer = {
        ...(producerSnapshot.data() || {}),
        ...(privateProducerSnapshot.exists ? privateProducerSnapshot.data() : {})
    };

    if (order.method === 'deuna' && !/^\d{8,15}$/.test(String(producer.deunaPhone || '').replace(/\D/g, ''))) {
        reject(409, 'METHOD_UNAVAILABLE', 'Deuna no está configurado para este productor.');
    }
    if (order.method === 'transfer' && !cleanPendingText(producer.bankPichinchaAcc || producer.bankGuayaquilAcc, 80)) {
        reject(409, 'METHOD_UNAVAILABLE', 'La transferencia bancaria no está configurada para este productor.');
    }
    if (order.method === 'paypal_manual' && !normalizeEmail(producer.paypalEmail, false)) {
        reject(409, 'METHOD_UNAVAILABLE', 'PayPal manual no está configurado para este productor.');
    }

    const beatSnapshots = await Promise.all(order.items.map((item) => producerRef.collection('beats').doc(item.beatId).get()));
    const coupon = order.type === 'exclusive_offer'
        ? { couponCode: '', discountPercent: 0 }
        : resolveCanonicalCoupon(producer.coupons, order.couponCode);
    const items = beatSnapshots.map((snapshot, index) => {
        if (!snapshot.exists) reject(409, 'BEAT_UNAVAILABLE', 'Uno de los beats ya no está disponible.');
        const beat = snapshot.data() || {};
        if (beat.sold === true || beat.isSold === true || beat.published === false || beat.isPublished === false || !cleanPendingText(beat.mp3, 2048)) {
            reject(409, 'BEAT_UNAVAILABLE', 'Uno de los beats ya no está disponible.');
        }
        const pointer = order.items[index];
        const originalPrice = getCanonicalLicensePrice(beat, pointer.licenseType);
        const finalPrice = order.type === 'exclusive_offer'
            ? Number(order.offerPrice.toFixed(2))
            : Number((originalPrice * (1 - coupon.discountPercent / 100)).toFixed(2));
        return {
            beatId: pointer.beatId,
            beatName: cleanPendingText(beat.name || 'Beat', 160),
            licenseType: pointer.licenseType,
            originalPrice,
            finalPrice
        };
    });
    return { producer, items, ...coupon };
}

function buildFingerprintInput(order, canonical, receipt) {
    return {
        requestId: order.requestId,
        type: order.type,
        method: order.method,
        producerId: order.producerId,
        items: canonical.items,
        buyerName: order.buyerName,
        buyerEmail: order.buyerEmail,
        buyerPhone: order.buyerPhone,
        buyerDni: order.buyerDni,
        buyerCity: order.buyerCity,
        buyerCountry: order.buyerCountry,
        youtubeWhitelist: order.youtubeWhitelist,
        invoiceRuc: order.invoiceRuc,
        invoiceCompany: order.invoiceCompany,
        invoiceAddress: order.invoiceAddress,
        invoiceEmail: order.invoiceEmail,
        couponCode: canonical.couponCode,
        discountPercent: canonical.discountPercent,
        offerMessage: order.offerMessage,
        termsVersion: order.termsVersion,
        acceptanceTimestamp: order.acceptanceTimestamp,
        receiptDigest: receipt?.digest || ''
    };
}

async function reservePendingRequest(db, { requestDocId, fingerprint, ipRateKey, emailRateKey, nowMs }) {
    const requestRef = db.collection('pending_order_requests').doc(requestDocId);
    const ipRateRef = db.collection('pending_order_rate_limits').doc(ipRateKey);
    const emailRateRef = db.collection('pending_order_rate_limits').doc(emailRateKey);
    return db.runTransaction(async (transaction) => {
        const [requestSnapshot, ipSnapshot, emailSnapshot] = await Promise.all([
            transaction.get(requestRef),
            transaction.get(ipRateRef),
            transaction.get(emailRateRef)
        ]);
        if (requestSnapshot.exists) {
            const existing = requestSnapshot.data() || {};
            if (!safeEqualHex(existing.fingerprint, fingerprint)) reject(409, 'IDEMPOTENCY_CONFLICT', 'El identificador ya pertenece a otra solicitud.');
            if (existing.status === 'completed' && existing.result) return { kind: 'completed', result: existing.result };
            if (existing.status === 'processing' && nowMs - Number(existing.startedAtMs || 0) < PROCESSING_LEASE_MS) {
                reject(409, 'REQUEST_IN_PROGRESS', 'El pedido ya se está procesando.');
            }
            if (Number(existing.attempts || 0) >= 3) reject(409, 'RETRY_LIMIT', 'El pedido no puede reintentarse automáticamente.');
        }

        const ipRate = nextRateLimitState(ipSnapshot.exists ? ipSnapshot.data() : {}, nowMs, IP_RATE_LIMIT);
        const emailRate = nextRateLimitState(emailSnapshot.exists ? emailSnapshot.data() : {}, nowMs, EMAIL_RATE_LIMIT);
        if (!ipRate.allowed || !emailRate.allowed) {
            const retryAfterSeconds = Math.max(ipRate.retryAfterSeconds, emailRate.retryAfterSeconds);
            throw new PendingOrderError(429, 'RATE_LIMITED', `Demasiadas solicitudes. Intenta nuevamente en ${retryAfterSeconds} segundos.`);
        }

        transaction.set(ipRateRef, { ...ipRate.state, updatedAt: new Date(nowMs).toISOString() });
        transaction.set(emailRateRef, { ...emailRate.state, updatedAt: new Date(nowMs).toISOString() });
        transaction.set(requestRef, {
            fingerprint,
            status: 'processing',
            startedAtMs: nowMs,
            updatedAt: new Date(nowMs).toISOString(),
            attempts: (requestSnapshot.exists ? Number(requestSnapshot.data()?.attempts || 0) : 0) + 1
        }, { merge: true });
        return { kind: 'reserved', requestRef };
    });
}

async function uploadReceipt(receipt, objectPath) {
    if (!receipt) return { receiptUrl: '', receiptStoragePath: '' };
    const downloadToken = crypto.randomBytes(24).toString('hex');
    await getStorage().bucket(STORAGE_BUCKET).file(objectPath).save(receipt.bytes, {
        resumable: false,
        contentType: receipt.mimeType,
        metadata: {
            cacheControl: 'private, max-age=0, no-transform',
            metadata: { firebaseStorageDownloadTokens: downloadToken }
        }
    });
    return {
        receiptUrl: `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`,
        receiptStoragePath: objectPath
    };
}

async function createPendingOrder(req) {
    const secret = process.env.DOWNLOAD_SIGNING_KEY || '';
    if (secret.length < 32) reject(503, 'SERVICE_NOT_CONFIGURED', 'El servicio de pedidos todavía no está configurado.');
    const order = normalizePendingCreateBody(req.body || {});
    if (order.method === 'deuna' && String(process.env.DEUNA_WEBHOOK_SECRET || '').length < 32) {
        reject(503, 'DEUNA_NOT_CONFIGURED', 'Deuna todavía no está disponible para este catálogo.');
    }
    const receipt = req.body?.receiptDataUrl ? parseReceiptDataUrl(req.body.receiptDataUrl) : null;
    if (['transfer', 'paypal_manual'].includes(order.method) && !receipt) {
        reject(400, 'RECEIPT_REQUIRED', 'Debes adjuntar el comprobante de pago.');
    }

    const db = getStripeFirebase();
    const canonical = await loadCanonicalOrder(db, order);
    const fingerprint = fingerprintPendingOrder(buildFingerprintInput(order, canonical, receipt));
    const requestDocId = privateHash(secret, 'pending-order', `${order.producerId}:${order.requestId}`);
    const nowMs = Date.now();
    const reservation = await reservePendingRequest(db, {
        requestDocId,
        fingerprint,
        ipRateKey: privateHash(secret, 'pending-order-ip', requestIp(req)),
        emailRateKey: privateHash(secret, 'pending-order-email', order.buyerEmail),
        nowMs
    });
    if (reservation.kind === 'completed') return { ...reservation.result, idempotent: true };

    try {
        const paymentIds = canonical.items.map((item, index) => deterministicPendingPaymentId(order.requestId, item.beatId, index));
        const receiptObjectPath = receipt
            ? `receipts/${order.producerId}/pending/${requestDocId}.${receipt.extension}`
            : '';
        const receiptResult = await uploadReceipt(receipt, receiptObjectPath);
        const timestamp = new Date(nowMs).toISOString();
        const batch = db.batch();
        const safePayments = [];

        canonical.items.forEach((item, index) => {
            const paymentId = paymentIds[index];
            const contractReference = createPendingContractReference({
                paymentId,
                requestDocId,
                licenseType: item.licenseType,
                issuedAt: timestamp
            });
            const paymentRef = db.collection('payments').doc(paymentId);
            const payment = {
                type: order.type,
                producerId: order.producerId,
                beatId: item.beatId,
                beatName: item.beatName,
                licenseType: item.licenseType,
                price: order.type === 'exclusive_offer' ? item.finalPrice : item.originalPrice,
                originalPrice: item.originalPrice,
                finalPrice: item.finalPrice,
                buyerName: order.buyerName,
                buyerEmail: order.buyerEmail,
                buyerPhone: order.buyerPhone,
                buyerDni: order.buyerDni,
                buyerCity: order.buyerCity,
                buyerCountry: order.buyerCountry,
                youtubeWhitelist: order.youtubeWhitelist,
                invoiceRuc: order.invoiceRuc,
                invoiceCompany: order.invoiceCompany,
                invoiceAddress: order.invoiceAddress,
                invoiceEmail: order.invoiceEmail,
                method: order.method,
                reference: contractReference,
                contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                referenceSource: order.method,
                receiptUrl: receiptResult.receiptUrl,
                receiptStoragePath: receiptResult.receiptStoragePath,
                status: 'pending',
                discountPercent: canonical.discountPercent,
                couponCode: canonical.couponCode,
                offerMessage: order.type === 'exclusive_offer' ? order.offerMessage : '',
                statusTokenHash: order.statusTokenHash,
                acceptedTerms: true,
                acceptanceTimestamp: order.acceptanceTimestamp,
                termsVersion: order.termsVersion,
                timestamp,
                updatedAt: timestamp,
                orderGroupId: requestDocId,
                schemaVersion: 2,
                createdBy: 'server'
            };
            batch.set(paymentRef, payment);
            safePayments.push({
                paymentId,
                beatId: item.beatId,
                beatName: item.beatName,
                licenseType: item.licenseType,
                originalPrice: item.originalPrice,
                finalPrice: item.finalPrice,
                status: 'pending',
                reference: contractReference
            });
        });

        const contactId = crypto.createHash('sha256').update(order.buyerEmail).digest('hex').slice(0, 40);
        const contactRef = db.collection('users').doc(order.producerId).collection('contacts').doc(contactId);
        batch.set(contactRef, {
            name: order.buyerName,
            email: order.buyerEmail,
            phone: order.buyerPhone,
            city: order.buyerCity,
            country: order.buyerCountry,
            updatedAt: nowMs,
            source: order.type === 'exclusive_offer' ? 'exclusive_offer' : `pending_${order.method}`
        }, { merge: true });

        const total = Number(safePayments.reduce((sum, item) => sum + item.finalPrice, 0).toFixed(2));
        const result = {
            success: true,
            type: order.type,
            method: order.method,
            // Para respuestas de una sola compra se mantiene este campo por
            // compatibilidad, pero ahora es siempre el código contractual
            // público y no un ID técnico de la pasarela.
            reference: safePayments[0]?.reference || '',
            payments: safePayments,
            total,
            couponCode: canonical.couponCode,
            discountPercent: canonical.discountPercent
        };
        if (order.method === 'deuna') {
            const phone = String(canonical.producer.deunaPhone || '').replace(/\D/g, '');
            result.deeplink = `deuna://payment?phone=${phone}&amount=${total.toFixed(2)}&description=BEATSS-${paymentIds[0]}`;
        }
        batch.set(reservation.requestRef, {
            status: 'completed',
            completedAt: timestamp,
            updatedAt: timestamp,
            result
        }, { merge: true });
        await batch.commit();
        return { ...result, idempotent: false };
    } catch (error) {
        await reservation.requestRef.set({
            status: 'failed',
            failureCode: error?.code || 'CREATE_FAILED',
            updatedAt: new Date().toISOString()
        }, { merge: true }).catch(() => {});
        throw error;
    }
}

async function attachDeunaReceipt(req) {
    const paymentId = normalizeDocumentId(req.body?.paymentId, 'Pedido');
    const statusToken = cleanPendingText(req.body?.statusToken, 256);
    const receipt = parseReceiptDataUrl(req.body?.receiptDataUrl);
    const db = getStripeFirebase();
    const paymentRef = db.collection('payments').doc(paymentId);
    const paymentSnapshot = await paymentRef.get();
    if (!paymentSnapshot.exists) reject(404, 'ORDER_NOT_FOUND', 'Pedido no encontrado.');
    const payment = paymentSnapshot.data() || {};
    if (payment.type !== 'beat_purchase' || payment.method !== 'deuna' || payment.status !== 'pending') {
        reject(409, 'ORDER_NOT_PENDING', 'El pedido ya no admite comprobantes.');
    }
    if (!verifyPendingStatusToken(statusToken, payment.statusTokenHash)) {
        reject(401, 'INVALID_STATUS_CREDENTIAL', 'La credencial del pedido no es válida.');
    }
    if (payment.receiptUrl) return { success: true, paymentId, status: 'pending', idempotent: true };

    const objectPath = `receipts/${payment.producerId}/pending/${paymentId}.${receipt.extension}`;
    const receiptResult = await uploadReceipt(receipt, objectPath);
    await paymentRef.update({
        ...receiptResult,
        receiptUploadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    return { success: true, paymentId, status: 'pending', idempotent: false };
}

export default async function handler(req, res) {
    const origin = requestOrigin(req);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!origin) return res.status(403).json({ error: 'Origen no permitido.', code: 'ORIGIN_DENIED' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.', code: 'METHOD_NOT_ALLOWED' });
    const contentLength = Number(req.headers['content-length'] || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
        return res.status(413).json({ error: 'La solicitud supera el tamaño permitido.', code: 'BODY_TOO_LARGE' });
    }

    try {
        const action = cleanPendingText(req.body?.action || 'create', 40).toLowerCase();
        const result = action === 'attach-receipt'
            ? await attachDeunaReceipt(req)
            : action === 'create'
                ? await createPendingOrder(req)
                : reject(400, 'INVALID_ACTION', 'La acción solicitada no es válida.');
        return res.status(action === 'create' && !result.idempotent ? 201 : 200).json(result);
    } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = error?.code || 'INTERNAL_ERROR';
        console.error('Pending order error:', code);
        return res.status(status).json({
            error: status >= 500 ? 'No se pudo registrar el pedido.' : error.message,
            code
        });
    }
}
