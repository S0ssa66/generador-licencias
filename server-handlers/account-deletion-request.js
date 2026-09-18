import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { getStripeFirebase } from '../api/_fulfill-beat-purchase.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export function normalizeDeletionAction(value) {
    const action = String(value || '').trim().toLowerCase();
    return action === 'cancel' ? 'cancel' : action === 'request' ? 'request' : '';
}

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const deletionRateWindows = new Map();

export function resetDeletionRateLimit() {
    deletionRateWindows.clear();
}

export function checkDeletionRateLimit(key, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = deletionRateWindows.get(key);
    if (!record || now - record.start >= windowMs || now < record.start) {
        deletionRateWindows.set(key, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

function getClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export default async function handler(req, res) {
    const requestOrigin = String(req.headers?.origin || '');
    configureCors(req, res);

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(204).end();
    }
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (requestOrigin && !isTrustedBeatssOrigin(requestOrigin)) {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    const ip = getClientIp(req);
    const rate = checkDeletionRateLimit(ip);
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo nuevamente en unos minutos.' });
    }

    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Debes iniciar sesión de nuevo.' });
    }
    const action = normalizeDeletionAction(req.body?.action);
    if (!action) return res.status(400).json({ error: 'Acción no válida.' });

    let db;
    let decoded;
    try {
        db = getStripeFirebase();
        decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
    } catch (error) {
        console.warn('Account deletion authentication failed:', error.code || 'INVALID_TOKEN');
        return res.status(401).json({ error: 'No se pudo validar la sesión.' });
    }

    try {
        const userRef = db.collection('users').doc(decoded.uid);
        const now = FieldValue.serverTimestamp();

        if (action === 'request') {
            await userRef.set({
                accountDeletionStatus: 'requested',
                accountDeletionRequestedAt: now,
                accountDeletionCancelledAt: FieldValue.delete()
            }, { merge: true });
            return res.status(200).json({
                success: true,
                status: 'requested',
                message: 'Solicitud registrada. La cuenta no se borrará hasta completar la revisión de seguridad y retención legal.'
            });
        }

        await userRef.set({
            accountDeletionStatus: 'cancelled',
            accountDeletionCancelledAt: now
        }, { merge: true });
        return res.status(200).json({
            success: true,
            status: 'cancelled',
            message: 'La solicitud de eliminación fue cancelada.'
        });
    } catch (error) {
        console.error('Account deletion request error:', error.message);
        return res.status(500).json({ error: 'No se pudo registrar la solicitud.' });
    }
}
