// server-handlers/cancel-subscription.js — shared handler for the Hobby dispatcher
// Permite al usuario cancelar su suscripción PayPal activa desde la plataforma

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 5;
const cancelSubscriptionRateWindows = new Map();

export function resetCancelSubscriptionRateLimit() {
    cancelSubscriptionRateWindows.clear();
}

export function checkCancelSubscriptionRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = cancelSubscriptionRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        cancelSubscriptionRateWindows.set(ip, { start: now, count: 1 });
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

// ─── Firebase Admin Init ─────────────────────────────────────────────────────
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

// ─── Obtener token de acceso PayPal ─────────────────────────────────────────
async function getPayPalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const isSandbox = process.env.PAYPAL_MODE === 'sandbox';
    const baseUrl = isSandbox
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

    const res = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });
    if (!res.ok) throw new Error('No se pudo obtener token de PayPal');
    const data = await res.json();
    return { token: data.access_token, baseUrl };
}

// ─── Cancelar suscripción en PayPal ─────────────────────────────────────────
async function cancelPayPalSubscription(subscriptionId, reason = 'Cancelado por el usuario') {
    const { token, baseUrl } = await getPayPalAccessToken();
    const res = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason })
    });
    // PayPal devuelve 204 No Content en éxito
    if (!res.ok && res.status !== 204) {
        const errText = await res.text();
        throw new Error(`Error al cancelar en PayPal: ${res.status} — ${errText}`);
    }
    return true;
}

// ─── Handler principal ───────────────────────────────────────────────────────
export default async function handler(req, res) {
    // CORS
    configureCors(req, res);

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkCancelSubscriptionRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de cancelación. Por favor espera unos minutos.' });
    }

    // ── Autenticación ─────────────────────────────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];

    let verifiedUid;
    try {
        initFirebaseAdmin();
        const decoded = await getAuth().verifyIdToken(idToken);
        verifiedUid = decoded.uid;
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }

    const { uid } = req.body;
    if (!uid || uid !== verifiedUid) {
        return res.status(403).json({ error: 'Acceso prohibido: UID no coincide con el token' });
    }

    try {
        const db = getFirestore();

        // ── Obtener subscriptionId del usuario desde Firestore ────────────
        const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
        const snap = await configRef.get();

        if (!snap.exists) {
            return res.status(404).json({ error: 'No se encontró configuración del usuario' });
        }

        const data = snap.data();
        const subscriptionId = data.planPayPalSubscriptionId;

        if (!subscriptionId) {
            return res.status(400).json({ error: 'No tienes una suscripción de PayPal activa registrada' });
        }

        if (data.planStatus === 'cancelled') {
            return res.status(400).json({ error: 'Tu suscripción ya fue cancelada anteriormente' });
        }

        // ── Cancelar en PayPal ────────────────────────────────────────────
        await cancelPayPalSubscription(subscriptionId);

        // ── Marcar como cancelada en Firestore ────────────────────────────
        // Nota: el acceso sigue hasta planExpirationDate (el webhook lo degradará cuando expire)
        const now = new Date().toISOString();
        const updates = {
            planStatus: 'cancelled',
            planCancelledAt: now,
        };

        await Promise.all([
            configRef.set(updates, { merge: true }),
            db.collection('users').doc(uid).set(updates, { merge: true }),
        ]);

        console.log(`🚫 Suscripción ${subscriptionId} cancelada para uid: ${uid}`);

        return res.status(200).json({
            success: true,
            message: 'Suscripción cancelada. Seguirás teniendo acceso hasta la fecha de expiración actual.',
            cancelledAt: now,
            accessUntil: data.planExpirationDate || now,
        });

    } catch (error) {
        console.error('❌ Error al cancelar suscripción:', error);
        return res.status(500).json({
            error: 'Error interno del servidor al cancelar la suscripción.'
        });
    }
}
