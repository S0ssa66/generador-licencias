// Estado mínimo de un pago. Nunca devuelve el documento completo ni PII.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const PUBLIC_STATUSES = new Set([
    'pending', 'approved', 'completed', 'cancelled', 'cancelado', 'failed',
    'rejected', 'expired', 'refunded', 'partially_refunded'
]);

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    return isTrustedBeatssOrigin(origin) ? origin : null;
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 60;
const statusRateWindows = new Map();

export function resetStatusRateLimit() {
    statusRateWindows.clear();
}

export function checkStatusRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = statusRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        statusRateWindows.set(ip, { start: now, count: 1 });
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

export function sha256Hex(value) {
    return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex');
}

function safeEqualHex(left, right) {
    if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) return false;
    return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export function verifyPaymentStatusToken(paymentId, token, paymentData, signingSecret = '') {
    const normalizedToken = String(token || '').trim();
    if (!paymentId || !normalizedToken || normalizedToken.length > 256) return false;

    const storedHash = String(paymentData?.statusTokenHash || '').trim();
    if (storedHash && safeEqualHex(sha256Hex(normalizedToken), storedHash)) return true;

    if (!signingSecret || !/^[a-f0-9]{64}$/i.test(normalizedToken)) return false;
    const statusToken = crypto.createHmac('sha256', signingSecret).update(`${paymentId}:status`).digest('hex');
    const downloadToken = crypto.createHmac('sha256', signingSecret).update(`${paymentId}:download`).digest('hex');
    return safeEqualHex(normalizedToken, statusToken) || safeEqualHex(normalizedToken, downloadToken);
}

export function serializePaymentStatus(paymentId, paymentData = {}) {
    const rawStatus = String(paymentData.status || 'pending').trim().toLowerCase();
    return {
        paymentId,
        status: PUBLIC_STATUSES.has(rawStatus) ? rawStatus : 'pending',
        updatedAt: paymentData.updatedAt || paymentData.timestamp || null
    };
}

export default async function handler(req, res) {
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Beatss-Status-Token');

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(204).end();
    }
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido.' });
    }

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkStatusRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas consultas de estado de pago. Por favor espera unos minutos.' });
    }

    const paymentId = String(req.query?.id || '').trim();
    const statusToken = String(req.headers['x-beatss-status-token'] || '').trim();
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) {
        return res.status(400).json({ error: 'ID de pago inválido.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();
        const paymentSnap = await db.collection('payments').doc(paymentId).get();
        if (!paymentSnap.exists) return res.status(404).json({ error: 'Pedido no encontrado.' });
        const paymentData = paymentSnap.data() || {};

        let authorized = verifyPaymentStatusToken(
            paymentId,
            statusToken,
            paymentData,
            process.env.DOWNLOAD_SIGNING_KEY || ''
        );

        if (!authorized) {
            const authHeader = String(req.headers.authorization || '');
            if (authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
                    const decodedEmail = String(decoded.email || '').toLowerCase();
                    const isAdmin = decoded.admin === true || ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(decodedEmail);
                    authorized = isAdmin || paymentData.userId === decoded.uid || paymentData.producerId === decoded.uid;
                } catch (_) {
                    authorized = false;
                }
            }
        }

        if (!authorized) return res.status(401).json({ error: 'No autorizado.' });
        return res.status(200).json(serializePaymentStatus(paymentId, paymentData));
    } catch (error) {
        console.error('Error consultando estado de pago:', error?.message || error);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
