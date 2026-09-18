import crypto from 'crypto';
import Stripe from 'stripe';
import { fulfillBeatPurchase, getStripeFirebase } from '../api/_fulfill-beat-purchase.js';

function authorizedCron(header, secret) {
    if (!secret || !header?.startsWith('Bearer ')) return false;
    const received = Buffer.from(header.slice(7));
    const expected = Buffer.from(secret);
    return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

export function isAuthorizedStripeDeliveryCron(req, env = process.env) {
    return authorizedCron(String(req.headers?.authorization || ''), String(env.CRON_SECRET || ''));
}

async function pendingCheckouts(db) {
    const snapshots = await Promise.all([
        db.collection('stripe_checkouts').where('status', '==', 'delivery_pending').limit(20).get(),
        db.collection('stripe_checkouts').where('status', '==', 'open').limit(20).get()
    ]);
    const unique = new Map();
    for (const snapshot of snapshots) {
        for (const document of snapshot.docs) unique.set(document.id, document);
    }
    return [...unique.values()].slice(0, 30);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (!process.env.CRON_SECRET) return res.status(503).json({ error: 'La recuperación programada no está configurada.' });
    if (!isAuthorizedStripeDeliveryCron(req)) return res.status(401).json({ error: 'No autorizado.' });
    if (!process.env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Stripe no está configurado en el servidor.' });

    const db = getStripeFirebase();
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const checkouts = await pendingCheckouts(db);
    const summary = { inspected: checkouts.length, fulfilled: 0, pending: 0, expired: 0, failed: 0 };

    for (const document of checkouts) {
        const checkout = document.data();
        const sessionId = String(checkout.sessionId || '').trim();
        if (!sessionId) {
            summary.failed += 1;
            await document.ref.update({ deliveryRetryErrorCode: 'MISSING_SESSION', deliveryRetryAt: new Date().toISOString() });
            continue;
        }
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            if (session.status === 'expired' && session.payment_status !== 'paid') {
                summary.expired += 1;
                await document.ref.update({ status: 'expired', paymentStatus: session.payment_status, updatedAt: new Date().toISOString() });
                continue;
            }
            if (session.payment_status !== 'paid') {
                summary.pending += 1;
                continue;
            }
            const result = await fulfillBeatPurchase({
                ...checkout,
                reference: session.id,
                method: 'stripe',
                appOrigin: process.env.APP_ORIGIN || 'https://beatss.app',
                idempotencyKey: session.id,
                providerReference: session.id,
                paymentIntentId: String(session.payment_intent || '')
            });
            const updatedAt = new Date().toISOString();
            await document.ref.update({
                status: result.deliveryNotificationComplete ? 'fulfilled' : 'delivery_pending',
                paymentStatus: session.payment_status,
                deliveryRetryAt: updatedAt,
                deliveryRetryErrorCode: result.deliveryNotificationComplete ? '' : 'DELIVERY_PENDING',
                ...(result.deliveryNotificationComplete ? { fulfilledAt: updatedAt } : {}),
                deliveries: result.deliveries.map(({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }) => ({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }))
            });
            if (result.deliveryNotificationComplete) summary.fulfilled += 1;
            else summary.failed += 1;
        } catch (error) {
            console.error('Stripe delivery retry error:', error.message);
            summary.failed += 1;
            await document.ref.update({ deliveryRetryErrorCode: 'RETRY_FAILED', deliveryRetryAt: new Date().toISOString() });
        }
    }

    return res.status(summary.failed ? 500 : 200).json(summary);
}
