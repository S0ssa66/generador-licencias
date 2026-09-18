// PayPal subscription webhook. Every state change is signature-verified and
// committed atomically with an idempotency record before PayPal receives 200.

import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } };

const HANDLED_EVENTS = new Set([
    'BILLING.SUBSCRIPTION.ACTIVATED',
    'BILLING.SUBSCRIPTION.RENEWED',
    'PAYMENT.SALE.COMPLETED',
    'BILLING.SUBSCRIPTION.CANCELLED',
    'BILLING.SUBSCRIPTION.SUSPENDED',
    'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    'BILLING.SUBSCRIPTION.EXPIRED'
]);

export class PayPalWebhookError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'PayPalWebhookError';
        this.status = status;
        this.code = code;
    }
}

function reject(status, code, message) {
    throw new PayPalWebhookError(status, code, message);
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

function requiredHeader(req, name) {
    const value = String(req.headers?.[name] || '').trim();
    if (!value || value.length > 2048) reject(401, 'INVALID_SIGNATURE_HEADERS', 'Firma de webhook inválida.');
    return value;
}

export function paypalApiBase(env = process.env) {
    return ['production', 'live'].includes(String(env.PAYPAL_MODE || '').toLowerCase())
        ? 'https://api-m.paypal.com'
        : 'https://api-m.sandbox.paypal.com';
}

export function paypalEventDocumentId(eventId) {
    const value = String(eventId || '').trim();
    if (!/^[A-Za-z0-9_-]{6,200}$/.test(value)) reject(400, 'INVALID_EVENT_ID', 'El evento de PayPal no es válido.');
    return crypto.createHash('sha256').update(value).digest('hex');
}

export function nextRenewalExpiration(currentValue, nowMs = Date.now()) {
    const currentMs = Date.parse(String(currentValue || ''));
    const baseMs = Number.isFinite(currentMs) && currentMs > nowMs ? currentMs : nowMs;
    return new Date(baseMs + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function paypalSubscriptionId(eventType, resource = {}) {
    const value = eventType === 'PAYMENT.SALE.COMPLETED'
        ? resource.billing_agreement_id
        : resource.id || resource.billing_agreement_id;
    return String(value || '').trim();
}

export async function verifyPayPalWebhookSignature(req, event, env = process.env, fetchImpl = fetch) {
    const webhookId = String(env.PAYPAL_WEBHOOK_ID || '').trim();
    const clientId = String(env.PAYPAL_CLIENT_ID || '').trim();
    const secret = String(env.PAYPAL_CLIENT_SECRET || '').trim();
    if (!webhookId || !clientId || !secret) {
        reject(503, 'PAYPAL_NOT_CONFIGURED', 'El webhook de PayPal no está configurado.');
    }

    const tokenResponse = await fetchImpl(`${paypalApiBase(env)}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    if (!tokenResponse.ok) reject(503, 'PAYPAL_VERIFICATION_UNAVAILABLE', 'No se pudo verificar el webhook de PayPal.');
    const tokenPayload = await tokenResponse.json().catch(() => ({}));
    if (!tokenPayload.access_token) reject(503, 'PAYPAL_VERIFICATION_UNAVAILABLE', 'No se pudo verificar el webhook de PayPal.');

    const verificationResponse = await fetchImpl(`${paypalApiBase(env)}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${tokenPayload.access_token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            auth_algo: requiredHeader(req, 'paypal-auth-algo'),
            cert_url: requiredHeader(req, 'paypal-cert-url'),
            transmission_id: requiredHeader(req, 'paypal-transmission-id'),
            transmission_sig: requiredHeader(req, 'paypal-transmission-sig'),
            transmission_time: requiredHeader(req, 'paypal-transmission-time'),
            webhook_id: webhookId,
            webhook_event: event
        })
    });
    if (!verificationResponse.ok) return false;
    const verification = await verificationResponse.json().catch(() => ({}));
    return verification.verification_status === 'SUCCESS';
}

async function findUserBySubscriptionId(db, subscriptionId) {
    const configSnapshot = await db.collectionGroup('config')
        .where('planPayPalSubscriptionId', '==', subscriptionId)
        .limit(1)
        .get();
    if (!configSnapshot.empty) {
        const document = configSnapshot.docs[0];
        return { uid: document.ref.parent.parent?.id, data: document.data() || {} };
    }

    const rootSnapshot = await db.collection('users')
        .where('planPayPalSubscriptionId', '==', subscriptionId)
        .limit(1)
        .get();
    if (!rootSnapshot.empty) return { uid: rootSnapshot.docs[0].id, data: rootSnapshot.docs[0].data() || {} };
    return null;
}

function eventPlanChanges(eventType, resource, userData, now) {
    const nowIso = now.toISOString();
    if (eventType === 'BILLING.SUBSCRIPTION.ACTIVATED') {
        const nextBillingMs = Date.parse(String(resource.billing_info?.next_billing_time || ''));
        const expiration = Number.isFinite(nextBillingMs) && nextBillingMs > now.getTime()
            ? new Date(nextBillingMs).toISOString()
            : nextRenewalExpiration('', now.getTime());
        return {
            planStatus: 'active',
            planActivatedAt: nowIso,
            planExpirationDate: expiration,
            expirationPro: expiration,
            planLastRenewedAt: nowIso
        };
    }
    if (eventType === 'BILLING.SUBSCRIPTION.RENEWED' || eventType === 'PAYMENT.SALE.COMPLETED') {
        const expiration = nextRenewalExpiration(userData.planExpirationDate || userData.expirationPro, now.getTime());
        return {
            planStatus: 'active',
            planExpirationDate: expiration,
            expirationPro: expiration,
            planLastRenewedAt: nowIso
        };
    }
    if (eventType === 'BILLING.SUBSCRIPTION.CANCELLED') {
        return { planStatus: 'cancelled', planCancelledAt: nowIso };
    }
    if (eventType === 'BILLING.SUBSCRIPTION.SUSPENDED' || eventType === 'BILLING.SUBSCRIPTION.PAYMENT.FAILED') {
        return {
            plan: 'free',
            planStatus: 'suspended',
            planSuspendedAt: nowIso,
            planExpirationDate: nowIso,
            expirationPro: nowIso
        };
    }
    return {
        plan: 'free',
        planStatus: 'expired',
        planExpiredAt: nowIso,
        planExpirationDate: nowIso,
        expirationPro: nowIso
    };
}

function isAlreadyExists(error) {
    return error?.code === 6 || error?.code === 'already-exists' || /already exists/i.test(String(error?.message || ''));
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    try {
        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!event || typeof event !== 'object' || Array.isArray(event)) reject(400, 'INVALID_EVENT', 'El evento de PayPal no es válido.');
        const eventId = paypalEventDocumentId(event.id);
        const eventType = String(event.event_type || '').trim();

        const validSignature = await verifyPayPalWebhookSignature(req, event);
        if (!validSignature) reject(401, 'INVALID_SIGNATURE', 'Firma de webhook inválida.');

        initFirebaseAdmin();
        const db = getFirestore();
        const eventRef = db.collection('paypal_webhook_events').doc(eventId);
        const now = new Date();
        const eventRecord = {
            provider: 'paypal',
            eventType: eventType.slice(0, 120),
            status: HANDLED_EVENTS.has(eventType) ? 'completed' : 'ignored',
            processedAt: now.toISOString()
        };

        if (!HANDLED_EVENTS.has(eventType)) {
            try {
                const batch = db.batch();
                batch.create(eventRef, eventRecord);
                await batch.commit();
            } catch (error) {
                if (!isAlreadyExists(error)) throw error;
            }
            return res.status(200).json({ received: true, ignored: true });
        }

        const resource = event.resource || {};
        const subscriptionId = paypalSubscriptionId(eventType, resource);
        if (!subscriptionId || subscriptionId.length > 200) reject(422, 'INVALID_SUBSCRIPTION', 'El evento no contiene una suscripción válida.');
        const user = await findUserBySubscriptionId(db, subscriptionId);
        if (!user?.uid) reject(503, 'SUBSCRIPTION_NOT_READY', 'La suscripción todavía no está vinculada.');

        const updates = eventPlanChanges(eventType, resource, user.data, now);
        const userRef = db.collection('users').doc(user.uid);
        const configRef = userRef.collection('config').doc('producer');
        const batch = db.batch();
        batch.create(eventRef, eventRecord);
        batch.set(configRef, updates, { merge: true });
        batch.set(userRef, updates, { merge: true });

        if (eventType === 'BILLING.SUBSCRIPTION.RENEWED' || eventType === 'PAYMENT.SALE.COMPLETED') {
            batch.set(userRef.collection('subscription_history').doc(eventId), {
                event: eventType,
                amount: String(resource.amount?.value || resource.amount?.total || ''),
                currency: String(resource.amount?.currency_code || resource.amount?.currency || 'USD').slice(0, 8),
                renewedAt: now.toISOString(),
                newExpiration: updates.planExpirationDate
            });
        }

        try {
            await batch.commit();
        } catch (error) {
            if (isAlreadyExists(error)) return res.status(200).json({ received: true, idempotent: true });
            throw error;
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        const code = error?.code || 'INTERNAL_ERROR';
        console.error('PayPal webhook error:', code);
        return res.status(status).json({
            error: status >= 500 ? 'No se pudo procesar el webhook de PayPal.' : error.message,
            code
        });
    }
}
