import Stripe from 'stripe';
import { getStripeFirebase, fulfillBeatPurchase } from '../api/_fulfill-beat-purchase.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 30;
const statusRateLimits = new Map();

export function getSessionStatusClientIp(req = {}) {
    const headers = req.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export function checkSessionStatusRateLimit(ip, nowMs = Date.now(), limit = MAX_REQUESTS_PER_WINDOW, windowMs = RATE_LIMIT_WINDOW_MS) {
    const current = statusRateLimits.get(ip) || { start: nowMs, count: 0 };
    if (!Number.isFinite(current.start) || nowMs - current.start >= windowMs || nowMs < current.start) {
        const state = { start: nowMs, count: 1 };
        statusRateLimits.set(ip, state);
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (current.count >= limit) {
        return {
            allowed: false,
            retryAfterSeconds: Math.max(1, Math.ceil((current.start + windowMs - nowMs) / 1000))
        };
    }
    current.count += 1;
    statusRateLimits.set(ip, current);
    return { allowed: true, retryAfterSeconds: 0 };
}

export default async function handler(req, res) {
    configureCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });

    const ip = getSessionStatusClientIp(req);
    const rate = checkSessionStatusRateLimit(ip);
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas consultas de estado. Inténtalo nuevamente en unos minutos.' });
    }

    const sessionId = String(req.query?.sessionId || '').trim();
    if (!sessionId || !process.env.STRIPE_SECRET_KEY) return res.status(400).json({ error: 'Falta la sesión de Stripe.' });
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const db = getStripeFirebase();
        const snap = await db.collection('stripe_checkouts').where('sessionId', '==', sessionId).limit(1).get();
        if (snap.empty) return res.status(404).json({ error: 'No se encontró la orden de Stripe.' });
        const checkoutRef = snap.docs[0].ref;
        const checkout = snap.docs[0].data();
        const producerConfigSnap = await db.collection('users').doc(checkout.producerId).collection('config').doc('producer').get();
        const producerStoreSlug = producerConfigSnap.exists
            ? String(producerConfigSnap.data()?.storeSlug || producerConfigSnap.data()?.aka || '').slice(0, 80)
            : '';
        if (session.payment_status !== 'paid') return res.status(200).json({ status: session.status || 'open', paymentStatus: session.payment_status });
        let deliveries = checkout.deliveries || [];
        if (checkout.status !== 'fulfilled') {
            const result = await fulfillBeatPurchase({ ...checkout, reference: session.id, method: 'stripe', appOrigin: process.env.APP_ORIGIN || 'https://beatss.app', idempotencyKey: session.id, providerReference: session.id, paymentIntentId: String(session.payment_intent || '') });
            deliveries = result.deliveries;
            const updatedAt = new Date().toISOString();
            const checkoutUpdate = {
                status: result.deliveryNotificationComplete ? 'fulfilled' : 'delivery_pending',
                updatedAt,
                deliveries: deliveries.map(({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }) => ({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }))
            };
            if (result.deliveryNotificationComplete) checkoutUpdate.fulfilledAt = updatedAt;
            await checkoutRef.update(checkoutUpdate);
        }
        // El navegador que vuelve de Stripe sólo necesita saber si la compra
        // está lista y qué portales firmados puede abrir. No devolvemos PII
        // de facturación o contacto mediante una URL de retorno.
        const publicDeliveries = deliveries.map(({ paymentId, beatName, licenseType, reference, downloadToken }) => ({
            paymentId, beatName, licenseType, reference, downloadToken
        }));
        return res.status(200).json({
            success: true,
            status: 'complete',
            paymentStatus: 'paid',
            producerId: checkout.producerId,
            producerStoreSlug,
            deliveries: publicDeliveries
        });
    } catch (error) {
        console.error('Stripe session-status error:', error.message);
        return res.status(500).json({ error: 'No se pudo consultar la sesión de Stripe.' });
    }
}
