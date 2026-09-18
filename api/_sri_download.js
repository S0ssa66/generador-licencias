import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { createHash } from 'node:crypto';
import { isTrustedBeatssOrigin } from './_cors-origin.js';

export function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app'
    });
}

export async function requireSession(req) {
    const authorization = req.headers.authorization || '';
    if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Sesión requerida'), { status: 401 });
    initFirebaseAdmin();
    return getAuth().verifyIdToken(authorization.slice(7));
}

export function isAdmin(decoded) {
    const email = (decoded?.email || '').toLowerCase();
    return decoded?.admin === true || ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(email);
}

function ownsDocument(decoded, data, ownerUid) {
    return isAdmin(decoded) || decoded.uid === ownerUid || decoded.uid === data.userId || decoded.uid === data.producerId;
}

export async function findInvoice(db, paymentId, decoded) {
    const paymentRef = db.collection('payments').doc(paymentId);
    const paymentSnap = await paymentRef.get();
    if (paymentSnap.exists) {
        const data = paymentSnap.data() || {};
        if (!ownsDocument(decoded, data, data.producerId || data.userId || '')) throw Object.assign(new Error('Pedido no pertenece a la sesión'), { status: 403 });
        return { data, id: paymentSnap.id, ref: paymentRef, ownerUid: data.producerId || data.userId || '' };
    }

    const queries = [
        db.collectionGroup('licencias').where('refCode', '==', paymentId).limit(5),
        db.collectionGroup('licencias').where('reference', '==', paymentId).limit(5),
    ];
    for (const query of queries) {
        const snap = await query.get();
        for (const doc of snap.docs) {
            const ownerUid = doc.ref.parent.parent?.id || '';
            const data = doc.data() || {};
            if (ownsDocument(decoded, data, ownerUid)) return { data, id: doc.id, ref: doc.ref, ownerUid };
        }
    }
    throw Object.assign(new Error('Factura no encontrada'), { status: 404 });
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 30;
const sriDownloadRateWindows = new Map();

export function resetSriDownloadRateLimit() {
    sriDownloadRateWindows.clear();
}

export function checkSriDownloadRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = sriDownloadRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        sriDownloadRateWindows.set(ip, { start: now, count: 1 });
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

export async function serveSriArtifact(req, res, kind) {
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkSriDownloadRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas descargas de comprobantes SRI. Por favor espera unos minutos.' });
    }

    try {
        const decoded = await requireSession(req);
        const paymentId = String(req.query.paymentId || '').trim();
        if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) return res.status(400).json({ error: 'ID de pago inválido' });
        const db = getFirestore();
        const invoice = await findInvoice(db, paymentId, decoded);
        const data = invoice.data;
        if (String(data.sriEstado || '').toUpperCase() !== 'AUTORIZADO') {
            return res.status(409).json({ error: 'El comprobante todavía no está listo para descargar.' });
        }
        const storageField = kind === 'xml' ? 'sriXmlStoragePath' : 'sriRideStoragePath';
        const legacyField = kind === 'xml' ? 'sriXmlAutorizadoB64' : 'sriRidePdfB64';
        let bytes;
        if (data[storageField]) {
            const objectPath = String(data[storageField]);
            const producerPath = String(data.producerId || invoice.ownerUid || '').replace(/[^A-Za-z0-9_-]/g, '');
            const paymentPath = paymentId.replace(/[^A-Za-z0-9_-]/g, '');
            if (!objectPath.startsWith(`sri/${producerPath}/${paymentPath}/`)) {
                return res.status(409).json({ error: 'La ruta del comprobante no es válida.' });
            }
            [bytes] = await getStorage().bucket().file(objectPath).download();
        } else if (data[legacyField]) {
            // Compatibilidad temporal para comprobantes emitidos antes de
            // mover los binarios fuera de Firestore.
            bytes = Buffer.from(data[legacyField], 'base64');
        } else {
            return res.status(404).json({ error: `No hay ${kind.toUpperCase()} autorizado disponible` });
        }
        const expectedHash = String(data[kind === 'xml' ? 'sriXmlSha256' : 'sriRideSha256'] || '');
        const expectedSize = Number(data[kind === 'xml' ? 'sriXmlSize' : 'sriRideSize']);
        if (expectedHash && createHash('sha256').update(bytes).digest('hex') !== expectedHash) {
            return res.status(409).json({ error: 'La integridad del comprobante no coincide.' });
        }
        if (expectedSize > 0 && bytes.length !== expectedSize) {
            return res.status(409).json({ error: 'El tamaño del comprobante no coincide.' });
        }
        const filename = kind === 'xml' ? `Factura_${paymentId}.xml` : `Factura_${paymentId}.pdf`;
        res.setHeader('Content-Type', kind === 'xml' ? 'application/xml; charset=utf-8' : 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(200).send(bytes);
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        console.error('Error descargando artefacto SRI:', error.message);
        return res.status(status).json({ error: status === 500 ? 'No se pudo obtener el comprobante SRI' : error.message });
    }
}
