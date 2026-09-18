// PayPhone checkout preparation and confirmation. The browser only sends beat
// pointers; catalog prices, coupons, buyer data and fulfillment are bound to a
// short-lived server-side checkout before the provider widget is rendered.

import crypto from 'crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fulfillBeatPurchase } from '../../_fulfill-beat-purchase.js';
import {
    PendingOrderError,
    cleanPendingText,
    fingerprintPendingOrder,
    getCanonicalLicensePrice,
    nextRateLimitState,
    resolveCanonicalCoupon,
    verifyPendingStatusToken
} from '../../../server-handlers/create-pending-order.js';
import { normalizeCheckoutLegalAcceptance } from '../../../server-handlers/legal-acceptance.js';
import { isTrustedBeatssOrigin } from '../../_cors-origin.js';

export const config = { api: { bodyParser: { sizeLimit: '256kb' } } };

const RATE_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT = 10;
const EMAIL_RATE_LIMIT = 5;
const CHECKOUT_TTL_MS = 15 * 60 * 1000;

function reject(status, code, message) {
    throw new PendingOrderError(status, code, message);
}

function requestOrigin(req) {
    const origin = String(req.headers?.origin || '');
    return isTrustedBeatssOrigin(origin) ? origin : '';
}

function requestIp(req) {
    return String(req.headers?.['x-forwarded-for'] || req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0]
        .trim()
        .slice(0, 128);
}

function privateHash(secret, label, value) {
    return crypto.createHmac('sha256', secret).update(`${label}:${value}`).digest('hex');
}

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

function normalizeEmail(value) {
    const email = cleanPendingText(value, 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) reject(400, 'INVALID_EMAIL', 'El correo electrónico no es válido.');
    return email;
}

function normalizeId(value, label, min = 3, max = 160) {
    const id = cleanPendingText(value, max);
    if (!new RegExp(`^[A-Za-z0-9_-]{${min},${max}}$`).test(id)) reject(400, 'INVALID_ID', `${label} no válido.`);
    return id;
}

export function normalizePayphonePrepare(body = {}) {
    let legalAcceptance;
    try {
        legalAcceptance = normalizeCheckoutLegalAcceptance(body);
    } catch (error) {
        reject(400, error.code || 'INVALID_ACCEPTANCE', error.message || 'La aceptación de términos no es válida.');
    }
    const requestId = cleanPendingText(body.requestId, 80).toLowerCase();
    if (!/^po_[a-f0-9]{32,64}$/.test(requestId)) reject(400, 'INVALID_REQUEST_ID', 'La solicitud no tiene un identificador válido.');
    const producerId = normalizeId(body.producerId, 'Productor');
    const buyerName = cleanPendingText(body.buyerName, 160);
    if (!buyerName) reject(400, 'BUYER_REQUIRED', 'El nombre del comprador es obligatorio.');
    const buyerEmail = normalizeEmail(body.buyerEmail);
    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (!rawItems.length || rawItems.length > 10) reject(400, 'INVALID_ITEMS', 'Selecciona entre 1 y 10 beats.');
    const items = rawItems.map((item) => ({
        beatId: normalizeId(item?.beatId, 'Beat'),
        licenseType: cleanPendingText(item?.licenseType, 40).toLowerCase() === 'unlimited'
            ? 'unlimited_flp'
            : cleanPendingText(item?.licenseType, 40).toLowerCase()
    }));
    if (new Set(items.map((item) => `${item.beatId}:${item.licenseType}`)).size !== items.length) {
        reject(400, 'DUPLICATE_ITEMS', 'El pedido contiene beats duplicados.');
    }
    const statusTokenHash = cleanPendingText(body.statusTokenHash, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(statusTokenHash)) reject(400, 'INVALID_STATUS_CREDENTIAL', 'No se pudo proteger el pago.');

    const invoiceRuc = cleanPendingText(body.invoiceRuc, 40);
    const invoiceCompany = cleanPendingText(body.invoiceCompany, 160);
    const invoiceAddress = cleanPendingText(body.invoiceAddress, 240);
    const invoiceEmail = body.invoiceEmail ? normalizeEmail(body.invoiceEmail) : '';
    const hasInvoice = Boolean(invoiceRuc || invoiceCompany || invoiceAddress || invoiceEmail);
    if (hasInvoice && (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !invoiceEmail)) {
        reject(400, 'INVALID_INVOICE', 'Los datos de facturación no son válidos.');
    }

    return {
        requestId,
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
        acceptedTerms: true,
        acceptanceTimestamp: legalAcceptance.acceptanceTimestamp,
        termsVersion: legalAcceptance.termsVersion,
        statusTokenHash
    };
}

export function validatePayphoneConfirmation(confirmation, { payphoneId, clientTxId, expectedCents }) {
    const approved = confirmation?.transactionStatus === 'Approved' || confirmation?.status === 'Approved' || confirmation?.statusCode === 3;
    if (!approved) reject(402, 'PAYMENT_NOT_APPROVED', 'La transacción no fue aprobada por PayPhone.');
    if (String(confirmation.clientTransactionId || '') !== clientTxId) {
        reject(409, 'TRANSACTION_MISMATCH', 'La referencia confirmada no coincide con el pedido.');
    }
    if (String(confirmation.currency || '').toUpperCase() !== 'USD') {
        reject(409, 'CURRENCY_MISMATCH', 'La moneda confirmada no coincide con el pedido.');
    }
    const providerId = Number(confirmation.transactionId);
    if (Number.isInteger(providerId) && providerId > 0 && providerId !== payphoneId) {
        reject(409, 'TRANSACTION_MISMATCH', 'La transacción confirmada no coincide con el pedido.');
    }
    const paidCents = Number(confirmation.amount);
    if (!Number.isInteger(paidCents) || paidCents !== expectedCents) {
        reject(409, 'AMOUNT_MISMATCH', 'El importe confirmado por PayPhone no coincide con el pedido.');
    }
    return true;
}

async function canonicalizeOrder(db, order) {
    const producerRef = db.collection('users').doc(order.producerId);
    const [producerSnapshot, privateProducerSnapshot] = await Promise.all([
        producerRef.collection('config').doc('producer').get(),
        producerRef.collection('private_config').doc('producer').get()
    ]);
    if (!producerSnapshot.exists) reject(404, 'PRODUCER_NOT_FOUND', 'Productor no encontrado.');
    const producer = {
        ...(producerSnapshot.data() || {}),
        ...(privateProducerSnapshot.exists ? privateProducerSnapshot.data() : {})
    };
    if (!cleanPendingText(producer.payphoneClientId, 2048) || !cleanPendingText(producer.payphoneAppId, 200)) {
        reject(409, 'METHOD_UNAVAILABLE', 'PayPhone no está configurado para este productor.');
    }
    const coupon = resolveCanonicalCoupon(producer.coupons, order.couponCode);
    const beatSnapshots = await Promise.all(order.items.map((item) => producerRef.collection('beats').doc(item.beatId).get()));
    const items = beatSnapshots.map((snapshot, index) => {
        if (!snapshot.exists) reject(409, 'BEAT_UNAVAILABLE', 'Uno de los beats ya no está disponible.');
        const beat = snapshot.data() || {};
        if (beat.sold === true || beat.isSold === true || beat.published === false || beat.isPublished === false || !cleanPendingText(beat.mp3, 2048)) {
            reject(409, 'BEAT_UNAVAILABLE', 'Uno de los beats ya no está disponible.');
        }
        const pointer = order.items[index];
        const originalPrice = getCanonicalLicensePrice(beat, pointer.licenseType);
        return {
            beatId: pointer.beatId,
            beatName: cleanPendingText(beat.name || 'Beat', 160),
            licenseType: pointer.licenseType,
            price: originalPrice,
            finalPrice: Number((originalPrice * (1 - coupon.discountPercent / 100)).toFixed(2))
        };
    });
    const amountCents = Math.round(items.reduce((total, item) => total + item.finalPrice, 0) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents < 1) reject(409, 'INVALID_TOTAL', 'El total del pedido no es válido.');
    return { producer, items, amountCents, ...coupon };
}

async function prepareCheckout(req) {
    const secret = String(process.env.DOWNLOAD_SIGNING_KEY || '');
    if (secret.length < 32) reject(503, 'SERVICE_NOT_CONFIGURED', 'PayPhone todavía no está configurado.');
    const order = normalizePayphonePrepare(req.body || {});
    initFirebaseAdmin();
    const db = getFirestore();
    const canonical = await canonicalizeOrder(db, order);
    const digest = privateHash(secret, 'payphone-checkout', `${order.producerId}:${order.requestId}`).slice(0, 24);
    const clientTxId = `PAYPHONE-${digest}`;
    const checkoutRef = db.collection('payphone_checkouts').doc(`payphone_${digest}`);
    const fingerprint = fingerprintPendingOrder({ ...order, items: canonical.items, discountPercent: canonical.discountPercent });
    const nowMs = Date.now();
    const expiresAtMs = nowMs + CHECKOUT_TTL_MS;
    const ipRateRef = db.collection('payphone_rate_limits').doc(privateHash(secret, 'payphone-ip', requestIp(req)));
    const emailRateRef = db.collection('payphone_rate_limits').doc(privateHash(secret, 'payphone-email', order.buyerEmail));

    const result = await db.runTransaction(async (transaction) => {
        const [checkoutSnapshot, ipSnapshot, emailSnapshot] = await Promise.all([
            transaction.get(checkoutRef),
            transaction.get(ipRateRef),
            transaction.get(emailRateRef)
        ]);
        if (checkoutSnapshot.exists) {
            const existing = checkoutSnapshot.data() || {};
            if (existing.fingerprint !== fingerprint) reject(409, 'IDEMPOTENCY_CONFLICT', 'El identificador pertenece a otro pedido.');
            if (existing.status === 'pending' && Number(existing.expiresAtMs || 0) > nowMs) return existing.publicResult;
            if (existing.status === 'completed') reject(409, 'CHECKOUT_COMPLETED', 'Esta compra PayPhone ya fue confirmada.');
            reject(409, 'CHECKOUT_EXPIRED', 'La referencia PayPhone venció. Inicia un nuevo intento.');
        }

        const ipRate = nextRateLimitState(ipSnapshot.exists ? ipSnapshot.data() : {}, nowMs, IP_RATE_LIMIT, RATE_WINDOW_MS);
        const emailRate = nextRateLimitState(emailSnapshot.exists ? emailSnapshot.data() : {}, nowMs, EMAIL_RATE_LIMIT, RATE_WINDOW_MS);
        if (!ipRate.allowed || !emailRate.allowed) reject(429, 'RATE_LIMITED', 'Demasiados intentos de pago. Intenta nuevamente más tarde.');
        transaction.set(ipRateRef, { ...ipRate.state, updatedAt: new Date(nowMs).toISOString() });
        transaction.set(emailRateRef, { ...emailRate.state, updatedAt: new Date(nowMs).toISOString() });

        const publicResult = {
            success: true,
            action: 'prepare',
            clientTxId,
            amountCents: canonical.amountCents,
            expiresAt: new Date(expiresAtMs).toISOString(),
            couponCode: canonical.couponCode,
            discountPercent: canonical.discountPercent,
            items: canonical.items.map(({ beatId, beatName, licenseType, price, finalPrice }) => ({ beatId, beatName, licenseType, price, finalPrice }))
        };
        transaction.create(checkoutRef, {
            status: 'pending',
            fingerprint,
            clientTxId,
            amountCents: canonical.amountCents,
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
            acceptedTerms: true,
            acceptanceTimestamp: order.acceptanceTimestamp,
            termsVersion: order.termsVersion,
            statusTokenHash: order.statusTokenHash,
            createdAt: new Date(nowMs).toISOString(),
            expiresAtMs,
            publicResult
        });
        return publicResult;
    });
    return result;
}

function safeDelivery(delivery) {
    return {
        paymentId: delivery.paymentId,
        beatName: delivery.beatName,
        licenseType: delivery.licenseType,
        reference: delivery.reference,
        deliveryToken: delivery.deliveryToken,
        downloadToken: delivery.downloadToken
    };
}

async function confirmCheckout(req) {
    const payphoneId = Number(req.body?.id);
    const clientTxId = cleanPendingText(req.body?.clientTxId, 80);
    const statusToken = cleanPendingText(req.body?.statusToken, 256);
    if (!Number.isInteger(payphoneId) || payphoneId <= 0) reject(400, 'INVALID_PROVIDER_ID', 'ID de PayPhone inválido.');
    const match = /^PAYPHONE-([a-f0-9]{24})$/.exec(clientTxId);
    if (!match) reject(400, 'INVALID_REFERENCE', 'Referencia de PayPhone inválida.');

    initFirebaseAdmin();
    const db = getFirestore();
    const checkoutRef = db.collection('payphone_checkouts').doc(`payphone_${match[1]}`);
    const checkoutSnapshot = await checkoutRef.get();
    if (!checkoutSnapshot.exists) reject(404, 'CHECKOUT_NOT_FOUND', 'La referencia PayPhone no existe.');
    const checkout = checkoutSnapshot.data() || {};
    if (checkout.clientTxId !== clientTxId) reject(409, 'TRANSACTION_MISMATCH', 'La referencia no coincide con el pedido.');
    if (!verifyPendingStatusToken(statusToken, checkout.statusTokenHash)) reject(401, 'INVALID_STATUS_CREDENTIAL', 'La credencial del pago no es válida.');
    if (checkout.status === 'completed' && checkout.result) return { ...checkout.result, idempotent: true };
    if (checkout.status !== 'pending') reject(409, 'CHECKOUT_NOT_PENDING', 'La referencia ya no puede confirmarse.');
    if (Number(checkout.expiresAtMs || 0) < Date.now()) reject(409, 'CHECKOUT_EXPIRED', 'La referencia PayPhone venció.');

    const producerRef = db.collection('users').doc(checkout.producerId);
    const [producerSnapshot, privateProducerSnapshot] = await Promise.all([
        producerRef.collection('config').doc('producer').get(),
        producerRef.collection('private_config').doc('producer').get()
    ]);
    const producer = {
        ...(producerSnapshot.exists ? producerSnapshot.data() || {} : {}),
        ...(privateProducerSnapshot.exists ? privateProducerSnapshot.data() : {})
    };
    const token = cleanPendingText(producer.payphoneClientId, 2048);
    if (!token) reject(409, 'METHOD_UNAVAILABLE', 'PayPhone no está configurado para este productor.');

    const providerResponse = await fetch('https://pay.payphonetodoesposible.com/api/button/V2/Confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: payphoneId, clientTxId })
    });
    const confirmation = await providerResponse.json().catch(() => ({}));
    if (!providerResponse.ok) reject(502, 'PAYPHONE_UNAVAILABLE', 'PayPhone no pudo confirmar la transacción.');
    validatePayphoneConfirmation(confirmation, { payphoneId, clientTxId, expectedCents: checkout.amountCents });

    const reference = clientTxId;
    const fulfillment = await fulfillBeatPurchase({
        producerId: checkout.producerId,
        buyerName: checkout.buyerName,
        buyerEmail: checkout.buyerEmail,
        buyerPhone: checkout.buyerPhone,
        buyerDni: checkout.buyerDni,
        buyerCity: checkout.buyerCity,
        buyerCountry: checkout.buyerCountry,
        invoiceRuc: checkout.invoiceRuc,
        invoiceCompany: checkout.invoiceCompany,
        invoiceAddress: checkout.invoiceAddress,
        invoiceEmail: checkout.invoiceEmail,
        youtubeWhitelist: checkout.youtubeWhitelist,
        acceptedTerms: true,
        acceptanceTimestamp: checkout.acceptanceTimestamp,
        termsVersion: checkout.termsVersion,
        items: checkout.items,
        discountPercent: checkout.discountPercent,
        couponCode: checkout.couponCode,
        reference,
        method: 'payphone',
        appOrigin: process.env.APP_ORIGIN || 'https://beatss.app',
        idempotencyKey: clientTxId,
        providerReference: String(confirmation.transactionId || payphoneId),
        paymentIntentId: String(payphoneId)
    });
    const result = {
        success: true,
        action: 'confirm',
        status: 'success',
        transactionId: clientTxId,
        paymentIds: fulfillment.deliveries.map((delivery) => delivery.paymentId),
        deliveries: fulfillment.deliveries.map(safeDelivery),
        items: checkout.items,
        buyerData: {
            producerId: checkout.producerId,
            buyerName: checkout.buyerName,
            buyerEmail: checkout.buyerEmail,
            buyerPhone: checkout.buyerPhone,
            buyerDni: checkout.buyerDni,
            buyerCity: checkout.buyerCity,
            buyerCountry: checkout.buyerCountry,
            youtubeWhitelist: checkout.youtubeWhitelist,
            invoiceRuc: checkout.invoiceRuc,
            invoiceCompany: checkout.invoiceCompany,
            invoiceAddress: checkout.invoiceAddress,
            invoiceEmail: checkout.invoiceEmail,
            method: 'PayPhone',
            acceptedTerms: true
        },
        idempotent: false
    };
    await checkoutRef.update({
        status: 'completed',
        providerTransactionId: String(confirmation.transactionId || payphoneId),
        completedAt: new Date().toISOString(),
        result
    });
    return result;
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

    try {
        const action = cleanPendingText(req.body?.action || 'confirm', 40).toLowerCase();
        const result = action === 'prepare'
            ? await prepareCheckout(req)
            : action === 'confirm'
                ? await confirmCheckout(req)
                : reject(400, 'INVALID_ACTION', 'La acción solicitada no es válida.');
        return res.status(action === 'prepare' ? 201 : 200).json(result);
    } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = error?.code || 'INTERNAL_ERROR';
        console.error('PayPhone checkout error:', code);
        return res.status(status).json({
            error: status >= 500 ? 'No se pudo procesar el pago de PayPhone.' : error.message,
            code
        });
    }
}
