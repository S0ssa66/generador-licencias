// server-handlers/log-download.js — shared handler for the Hobby dispatcher
// Registra descargas de licencias o PDFs de contratos realizadas desde el cliente.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 30;
const logRateWindows = new Map();

export function resetLogRateLimit() {
    logRateWindows.clear();
}

export function checkLogRateLimit(key, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = logRateWindows.get(key);
    if (!record || now - record.start >= windowMs || now < record.start) {
        logRateWindows.set(key, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getSanitizedClientIp(req = {}) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    if (isTrustedBeatssOrigin(origin)) return origin;
    return null;
}

function verifyDownloadToken(paymentId, token) {
    if (!SIGNING_SECRET || !paymentId || !token) return false;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET)
        .update(`${paymentId}:download`)
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch (_) {
        return false;
    }
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

export default async function handler(req, res) {
    // CORS headers
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Vary', 'Origin');
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'private, no-store');

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { paymentId, fileType, accessToken } = req.body || {};
    const allowedFileTypes = new Set(['license', 'mp3', 'wav', 'stems', 'ride', 'xml']);
    if (!paymentId || !/^[A-Za-z0-9_-]{3,160}$/.test(paymentId) || !allowedFileTypes.has(fileType)) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }
    if (!SIGNING_SECRET) return res.status(503).json({ error: 'Registro de descargas no configurado.' });

    const clientIp = getSanitizedClientIp(req);
    const rate = checkLogRateLimit(`${clientIp}:${paymentId}`);
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de registro de descarga.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // Verificar que el pago existe
        const paymentDoc = await db.collection('payments').doc(paymentId).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'Pago no encontrado.' });
        }
        const paymentData = paymentDoc.data();

        const terminalRevokedStatuses = ['refunded', 'disputed', 'chargeback', 'cancelled', 'cancelado', 'revoked'];
        if (terminalRevokedStatuses.includes(String(paymentData.status || '').toLowerCase()) || paymentData.accessRevoked === true) {
            return res.status(403).json({ error: 'El acceso a las descargas de este pedido ha sido revocado.' });
        }

        let authorized = verifyDownloadToken(paymentId, accessToken);

        if (!authorized) {
            const authHeader = req.headers.authorization || '';
            if (authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
                    const decodedEmail = (decoded.email || '').toLowerCase();
                    const isAdmin = decoded.admin === true || ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(decodedEmail);
                    authorized = isAdmin || decoded.uid === paymentData.userId || decoded.uid === paymentData.producerId;
                } catch (_) {
                    authorized = false;
                }
            }
        }
        if (!authorized) return res.status(401).json({ error: 'No autorizado para registrar esta descarga.' });

        // Loguear el evento en la subcolección downloads
        await db.collection('payments').doc(paymentId).collection('downloads').add({
            timestamp: new Date().toISOString(),
            ip: clientIp,
            fileType: fileType
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Error al registrar descarga en log-download:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
