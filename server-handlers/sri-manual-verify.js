import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { findInvoice, initFirebaseAdmin, requireSession } from './sri-download.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const verifyRateWindows = new Map();

function limited(ip, now = Date.now()) {
    const current = verifyRateWindows.get(ip);
    if (!current || now - current.start >= RATE_WINDOW_MS || now < current.start) {
        verifyRateWindows.set(ip, { start: now, count: 1 });
        return false;
    }
    current.count += 1;
    return current.count > RATE_LIMIT;
}

function sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

function safeSegment(value) {
    const safe = String(value || '').replace(/[^A-Za-z0-9_-]/g, '');
    return safe === String(value || '') ? safe : '';
}

export function manualSriReviewEligible(invoice, uid) {
    const data = invoice?.data || {};
    return Boolean(
        invoice?.ownerUid && uid === invoice.ownerUid &&
        data.sriEstado === 'ARCHIVOS_MANUALES_REGISTRADOS' &&
        data.sriManualArtifactsStatus === 'PENDING_OWNER_VERIFICATION' &&
        data.sriManualArtifactsSource === 'owner_upload_from_beatss'
    );
}

async function verifyStoredArtifact(bucket, path, producerId, recordId, expectedHash) {
    const expectedPrefix = `sri/${producerId}/${recordId}/manual-`;
    if (typeof path !== 'string' || !path.startsWith(expectedPrefix) || !/^[a-f0-9]{64}$/i.test(String(expectedHash || ''))) {
        throw Object.assign(new Error('Los archivos manuales no tienen una ruta o huella íntegra.'), { status: 409 });
    }
    let bytes;
    try {
        [bytes] = await bucket.file(path).download();
    } catch {
        throw Object.assign(new Error('No se encontraron los dos archivos manuales almacenados.'), { status: 409 });
    }
    if (sha256(bytes) !== String(expectedHash).toLowerCase()) {
        throw Object.assign(new Error('La integridad de un archivo cambió; no se registró la revisión.'), { status: 409 });
    }
}

export default async function verifyManualSriArtifacts(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (origin && isTrustedBeatssOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (origin && !isTrustedBeatssOrigin(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    const ipHeader = req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || 'unknown';
    const ip = String(Array.isArray(ipHeader) ? ipHeader[0] : ipHeader).split(',')[0].trim().slice(0, 128) || 'unknown';
    if (limited(ip)) return res.status(429).json({ error: 'Demasiadas confirmaciones. Espera unos minutos.' });

    try {
        const decoded = await requireSession(req);
        const recordId = String(req.body?.paymentId || '').trim();
        if (req.body?.confirmManualVerification !== true) {
            return res.status(400).json({ error: 'Confirma expresamente que verificaste la factura en el portal del SRI.' });
        }
        if (!/^[A-Za-z0-9_-]{3,160}$/.test(recordId)) return res.status(400).json({ error: 'ID de operación inválido.' });
        initFirebaseAdmin();
        const db = getFirestore();
        const invoice = await findInvoice(db, recordId, decoded);
        if (!manualSriReviewEligible(invoice, decoded.uid)) {
            return res.status(409).json({ error: 'Esta operación no tiene archivos manuales pendientes que puedas verificar.' });
        }
        const producerId = safeSegment(invoice.data.producerId || invoice.ownerUid);
        const safeRecordId = safeSegment(invoice.id);
        if (!producerId || !safeRecordId) return res.status(409).json({ error: 'No se pudo validar el propietario de los archivos.' });
        const bucket = getStorage().bucket();
        await Promise.all([
            verifyStoredArtifact(bucket, invoice.data.sriXmlStoragePath, producerId, safeRecordId, invoice.data.sriXmlSha256),
            verifyStoredArtifact(bucket, invoice.data.sriRideStoragePath, producerId, safeRecordId, invoice.data.sriRideSha256)
        ]);

        const verifiedAt = new Date().toISOString();
        const patch = {
            sriEstado: 'ARCHIVOS_MANUALES_VERIFICADOS',
            sriManualArtifactsStatus: 'OWNER_VERIFIED',
            sriManualArtifactsVerifiedAt: verifiedAt,
            sriManualArtifactsVerifiedBy: decoded.uid,
            sriManualArtifactsVerificationMethod: 'owner_checked_sri_portal'
        };
        const batch = db.batch();
        batch.set(invoice.ref, patch, { merge: true });
        const licenseRef = db.collection('users').doc(invoice.ownerUid).collection('licencias').doc(invoice.id);
        const paymentRef = db.collection('payments').doc(invoice.id);
        const siblings = await Promise.all([licenseRef.get(), paymentRef.get()]);
        if (invoice.ref.path !== licenseRef.path && siblings[0].exists) batch.set(licenseRef, patch, { merge: true });
        if (invoice.ref.path !== paymentRef.path && siblings[1].exists) batch.set(paymentRef, patch, { merge: true });
        await batch.commit();
        return res.status(200).json({
            status: patch.sriEstado,
            paymentId: invoice.id,
            verifiedAt,
            message: 'Revisión humana registrada. Esto no equivale a una validación criptográfica de BEATSS ni cambia el documento a AUTORIZADO.'
        });
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        console.error('Error al registrar revisión manual SRI:', error.message);
        return res.status(status).json({ error: status === 500 ? 'No se pudo registrar la revisión manual SRI.' : error.message });
    }
}
