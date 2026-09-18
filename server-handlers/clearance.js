import crypto from 'crypto';
import { getStripeFirebase } from '../api/_fulfill-beat-purchase.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const MAX_BODY_BYTES = 16 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 10;
const rateWindows = new Map();

export class ClearanceError extends Error {
    constructor(status, code, message) {
        super(message);
        this.name = 'ClearanceError';
        this.status = status;
        this.code = code;
    }
}

function reject(status, code, message) {
    throw new ClearanceError(status, code, message);
}

export function getMaxChannelsForLicense(licenseType) {
    const type = String(licenseType || '').toLowerCase();
    switch (type) {
        case 'basic': return 1;
        case 'premium': return 2;
        case 'premium_plus': return 3;
        case 'unlimited':
        case 'unlimited_flp': return 5;
        case 'exclusive': return 10;
        default: return 1;
    }
}

export function cleanClearanceText(value, max = 160) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

function normalizeDocumentId(value, label) {
    const id = cleanClearanceText(value, 160);
    if (!id || id === '.' || id === '..' || id.includes('/')) {
        reject(400, 'INVALID_ID', `${label} no válido.`);
    }
    return id;
}

function normalizeYouTubeUrl(value) {
    const source = cleanClearanceText(value, 300);
    let url;
    try {
        url = new URL(source);
    } catch {
        reject(400, 'INVALID_CHANNEL_URL', 'El enlace de YouTube no es válido.');
    }
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (url.protocol !== 'https:' || !['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) {
        reject(400, 'INVALID_CHANNEL_URL', 'El enlace debe corresponder a YouTube.');
    }
    return url.toString();
}

export function normalizeClearanceRequest(body = {}) {
    const action = cleanClearanceText(body.action, 20).toLowerCase();
    if (!['verify', 'whitelist'].includes(action)) {
        reject(400, 'INVALID_ACTION', 'La acción solicitada no es válida.');
    }
    const producerId = normalizeDocumentId(body.producerId, 'Productor');
    const licenseRef = normalizeDocumentId(body.licenseRef, 'Código de licencia');
    if (action === 'verify') return { action, producerId, licenseRef };

    const artistName = cleanClearanceText(body.artistName, 100);
    const songName = cleanClearanceText(body.songName, 150);
    if (!artistName || !songName) {
        reject(400, 'MISSING_WHITELIST_DATA', 'Completa los datos del canal y de la canción.');
    }
    return {
        action,
        producerId,
        licenseRef,
        channelUrl: normalizeYouTubeUrl(body.channelUrl),
        artistName,
        songName
    };
}

export function clearanceOrigin(req = {}) {
    const origin = String(req.headers?.origin || '');
    return isTrustedBeatssOrigin(origin) ? origin : '';
}

export function clearanceRequestIp(req = {}) {
    const headers = req.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export function nextClearanceRateLimit(current = {}, nowMs = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const start = Number(current.start || 0);
    const count = Number(current.count || 0);
    if (!Number.isFinite(start) || nowMs - start >= windowMs || nowMs < start) {
        return { allowed: true, state: { start: nowMs, count: 1 }, retryAfterSeconds: 0 };
    }
    if (count >= limit) {
        return { allowed: false, state: { start, count }, retryAfterSeconds: Math.max(1, Math.ceil((start + windowMs - nowMs) / 1000)) };
    }
    return { allowed: true, state: { start, count: count + 1 }, retryAfterSeconds: 0 };
}

function setCors(res, origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
}

function responseError(res, error) {
    if (error instanceof ClearanceError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
    }
    console.error('Clearance handler error:', error.message);
    return res.status(500).json({ error: 'No se pudo completar la solicitud.' });
}

function requestBodySize(body) {
    try {
        return Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8');
    } catch {
        return MAX_BODY_BYTES + 1;
    }
}

export function createClearanceHandler({ dbFactory = getStripeFirebase, now = () => new Date() } = {}) {
    return async function clearanceHandler(req, res) {
        const origin = clearanceOrigin(req);
        if (!origin) return res.status(403).json({ error: 'Origen no permitido.' });
        setCors(res, origin);
        if (req.method === 'OPTIONS') return res.status(204).end();
        if (req.method !== 'POST') {
            res.setHeader('Allow', 'POST, OPTIONS');
            return res.status(405).json({ error: 'Método no permitido.' });
        }
        if (Number(req.headers?.['content-length'] || 0) > MAX_BODY_BYTES || requestBodySize(req.body) > MAX_BODY_BYTES) {
            return res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
        }

        const ip = clearanceRequestIp(req);
        const rate = nextClearanceRateLimit(rateWindows.get(ip));
        rateWindows.set(ip, rate.state);
        if (!rate.allowed) {
            res.setHeader('Retry-After', String(rate.retryAfterSeconds));
            return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo nuevamente en unos minutos.' });
        }

        try {
            const payload = normalizeClearanceRequest(req.body);
            const db = dbFactory();
            const license = await db.collection('users').doc(payload.producerId).collection('licencias').doc(payload.licenseRef).get();
            if (!license.exists) reject(404, 'LICENSE_NOT_FOUND', 'Licencia no encontrada. Verifica los datos ingresados.');

            const licenseData = license.data() || {};
            const producer = await db.collection('users').doc(payload.producerId).collection('config').doc('producer').get();
            const producerData = producer.exists ? producer.data() || {} : {};
            if (payload.action === 'verify') {
                return res.status(200).json({
                    license: {
                        beatName: cleanClearanceText(licenseData.beatName, 160) || 'Beat',
                        buyerName: cleanClearanceText(licenseData.buyerName, 160) || 'Cliente',
                        licenseType: cleanClearanceText(licenseData.licenseType, 60) || 'Comercial',
                        cryptoHash: cleanClearanceText(licenseData.cryptoHash, 256)
                    },
                    producerAka: cleanClearanceText(producerData.aka || producerData.name, 100) || 'Productor Autorizado'
                });
            }

            const whitelistId = `clr_${crypto.createHash('sha256').update(`${payload.licenseRef}:${payload.channelUrl}`).digest('hex').slice(0, 40)}`;
            const whitelistCol = db.collection('users').doc(payload.producerId).collection('whitelist');
            let existingChannelsCount = 0;
            let alreadyWhitelisted = false;
            try {
                if (typeof whitelistCol.where === 'function') {
                    const existingSnap = await whitelistCol.where('licenseRef', '==', payload.licenseRef).get();
                    existingChannelsCount = existingSnap.size || 0;
                    alreadyWhitelisted = (existingSnap.docs || []).some(d => d.id === whitelistId);
                }
            } catch (e) {
                // Silencioso si la consulta con filtro no está disponible
            }

            const maxChannels = getMaxChannelsForLicense(licenseData.licenseType);
            if (!alreadyWhitelisted && existingChannelsCount >= maxChannels) {
                reject(400, 'LIMIT_REACHED', `Esta licencia (${licenseData.licenseType || 'básica'}) permite registrar un máximo de ${maxChannels} canal(es) de YouTube.`);
            }

            await whitelistCol.doc(whitelistId).set({
                channelUrl: payload.channelUrl,
                artistName: payload.artistName,
                songName: payload.songName,
                licenseRef: payload.licenseRef,
                createdAt: now().toISOString()
            });
            return res.status(200).json({ ok: true });
        } catch (error) {
            return responseError(res, error);
        }
    };
}

export default createClearanceHandler();
