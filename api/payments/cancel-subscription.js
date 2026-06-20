// api/payments/cancel-subscription.js — Vercel Serverless Function
// Permite al usuario cancelar su suscripción PayPal activa desde la plataforma

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

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
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

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
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}
