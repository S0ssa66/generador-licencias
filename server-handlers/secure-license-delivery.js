// Entrega canónica de licencias para ventas manuales y pagos aprobados.
// Los archivos privados nunca se incluyen directamente en el correo: el
// comprador recibe un portal firmado que genera enlaces de corta duración.

import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';
import { notifyPurchaseDelivery, purchasePortalUrl } from '../api/_purchase-delivery.js';
import {
    CURRENT_REFERENCE_VERSION,
    isValidLicenseReference,
    normalizeLicenseReference,
    resolveLicenseReference
} from '../license-reference.js';
import { verifyPaymentStatusToken } from './payment-status.js';

const DEFAULT_APP_ORIGIN = 'https://beatss.app';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app';
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY || '';
const LICENSE_TYPES = new Set(['basic', 'premium', 'premium_plus', 'unlimited', 'unlimited_flp', 'exclusive']);

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        storageBucket: STORAGE_BUCKET
    });
}

function requestOrigin(req) {
    const origin = String(req.headers.origin || '');
    if (!origin) return DEFAULT_APP_ORIGIN;
    return isTrustedBeatssOrigin(origin) ? origin : '';
}

function cleanText(value, max = 240) {
    return String(value || '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
}

function validatePdf(value) {
    const raw = String(value || '').trim();
    const prefix = raw.match(/^data:application\/pdf[^,]*;base64,/i)?.[0] || '';
    const encoded = (prefix ? raw.slice(prefix.length) : raw).replace(/\s+/g, '');
    if (!encoded || !/^[A-Za-z0-9+/=]+$/.test(encoded)) throw new Error('El contrato no contiene un PDF válido.');
    const pdf = Buffer.from(encoded, 'base64');
    if (pdf.length < 5 || pdf.length > 15 * 1024 * 1024 || !pdf.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        throw new Error('El PDF debe ser válido y menor a 15 MB.');
    }
    return pdf;
}

function downloadToken(paymentId) {
    if (!SIGNING_SECRET) return '';
    return crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:download`).digest('hex');
}

function deliveryTokenIsValid(paymentId, value) {
    if (!SIGNING_SECRET || !paymentId || !/^[a-f0-9]{64}$/i.test(String(value || ''))) return false;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:pdf-delivery`).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(value, 'hex'), Buffer.from(expected, 'hex'));
}

async function authenticatedProducer(req) {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) return null;
    try {
        const decoded = await getAuth().verifyIdToken(authorization.slice(7));
        return decoded?.uid ? decoded : null;
    } catch (_) {
        return null;
    }
}

function manualPaymentId(producerId, reference) {
    const digest = crypto.createHash('sha256').update(`${producerId}:${reference}`).digest('hex').slice(0, 40);
    return `manual_${digest}`;
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const deliveryRateWindows = new Map();

export function resetDeliveryRateLimit() {
    deliveryRateWindows.clear();
}

export function checkDeliveryRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = deliveryRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        deliveryRateWindows.set(ip, { start: now, count: 1 });
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

export default async function handler(req, res) {
    const origin = requestOrigin(req);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Beatss-Status-Token');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (!origin) return res.status(403).json({ error: 'Origen no permitido.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkDeliveryRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de entrega. Por favor espera unos minutos.' });
    }

    if (!SIGNING_SECRET) return res.status(503).json({ error: 'La entrega segura no está configurada.' });

    try {
        initFirebaseAdmin();
        const db = getFirestore();
        const producerSession = await authenticatedProducer(req);
        const body = req.body || {};
        const submittedPaymentId = cleanText(body.paymentId, 160);
        const contractReference = normalizeLicenseReference(body.contractReference || body.reference);
        if (!isValidLicenseReference(contractReference)) {
            return res.status(400).json({ error: 'La licencia no tiene una referencia contractual válida.' });
        }

        const pdf = validatePdf(body.pdfBase64);
        const submittedLicenseType = cleanText(body.licenseType, 40).toLowerCase();
        if (!LICENSE_TYPES.has(submittedLicenseType)) return res.status(400).json({ error: 'Tipo de licencia inválido.' });

        let paymentId = submittedPaymentId;
        let paymentRef;
        let payment = null;
        if (paymentId) {
            if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) return res.status(400).json({ error: 'ID de pago inválido.' });
            paymentRef = db.collection('payments').doc(paymentId);
            const snapshot = await paymentRef.get();
            if (!snapshot.exists) return res.status(404).json({ error: 'No se encontró el pago de esta entrega.' });
            payment = snapshot.data() || {};
        } else {
            if (!producerSession?.uid) return res.status(401).json({ error: 'Inicia sesión para registrar una entrega manual.' });
            paymentId = manualPaymentId(producerSession.uid, contractReference);
            paymentRef = db.collection('payments').doc(paymentId);
            const snapshot = await paymentRef.get();
            payment = snapshot.exists ? (snapshot.data() || {}) : null;
        }

        const producerId = cleanText(payment?.producerId || producerSession?.uid, 160);
        const sessionEmail = String(producerSession?.email || '').toLowerCase();
        const isAdmin = producerSession?.admin === true || ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(sessionEmail);
        const producerAuthorized = Boolean(producerSession?.uid && (isAdmin || producerSession.uid === producerId));
        const statusToken = cleanText(req.headers['x-beatss-status-token'] || body.statusToken, 256);
        const credentialAuthorized = payment && (
            deliveryTokenIsValid(paymentId, body.deliveryToken) ||
            verifyPaymentStatusToken(paymentId, statusToken, payment, SIGNING_SECRET)
        );
        if (!producerAuthorized && !credentialAuthorized) return res.status(401).json({ error: 'No autorizado para esta entrega.' });

        if (payment && normalizeLicenseReference(resolveLicenseReference(payment)) !== contractReference) {
            return res.status(409).json({ error: 'La referencia del PDF no coincide con la compra.' });
        }
        const licenseType = cleanText(payment?.licenseType || submittedLicenseType, 40).toLowerCase();
        if (payment?.licenseType && licenseType !== submittedLicenseType) {
            return res.status(409).json({ error: 'El tipo de licencia no coincide con la compra.' });
        }

        const beatId = cleanText(payment?.beatId || body.beatId, 160);
        if (!producerId || !beatId || !/^[A-Za-z0-9_-]{1,160}$/.test(beatId)) {
            return res.status(400).json({ error: 'Selecciona un beat registrado antes de enviar la licencia.' });
        }
        const beatRef = db.collection('users').doc(producerId).collection('beats').doc(beatId);
        const beatSnapshot = await beatRef.get();
        if (!beatSnapshot.exists) return res.status(404).json({ error: 'El beat de esta licencia no está registrado.' });
        const beat = beatSnapshot.data() || {};

        const buyerEmail = cleanText(payment?.buyerEmail || body.buyerEmail, 254).toLowerCase();
        const buyerName = cleanText(payment?.buyerName || body.buyerName, 160);
        if (!buyerName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
            return res.status(400).json({ error: 'Nombre o correo del comprador inválido.' });
        }

        const now = new Date().toISOString();
        const paymentData = {
            type: payment?.type || 'beat_purchase',
            producerId,
            beatId,
            beatName: cleanText(payment?.beatName || body.beatName || beat.name, 160),
            licenseType,
            price: Number(payment?.price ?? body.value ?? 0) || 0,
            finalPrice: Number(payment?.finalPrice ?? payment?.price ?? body.value ?? 0) || 0,
            buyerName,
            buyerEmail,
            buyerPhone: cleanText(payment?.buyerPhone || body.buyerPhone, 40),
            buyerDni: cleanText(payment?.buyerDni || body.buyerDni, 40),
            buyerCity: cleanText(payment?.buyerCity || body.buyerCity, 160),
            buyerCountry: cleanText(payment?.buyerCountry || body.buyerCountry, 80),
            method: cleanText(payment?.method || body.paymentMethod || 'manual', 60).toLowerCase(),
            reference: contractReference,
            contractReference,
            referenceVersion: payment?.referenceVersion || CURRENT_REFERENCE_VERSION,
            referenceSource: payment?.referenceSource || 'manual',
            status: ['approved', 'completed'].includes(String(payment?.status || '').toLowerCase()) ? payment.status : 'approved',
            timestamp: payment?.timestamp || cleanText(body.effectiveDate, 20) || now,
            updatedAt: now,
            schemaVersion: Math.max(3, Number(payment?.schemaVersion || 0)),
            createdBy: payment?.createdBy || 'secure-manual-delivery'
        };
        await paymentRef.set(paymentData, { merge: true });

        const safeReference = contractReference.replace(/[^a-zA-Z0-9_-]/g, '_');
        const objectPath = `licenses/${producerId}/deliveries/${paymentId}/Licencia_${safeReference}.pdf`;
        const storageToken = crypto.randomBytes(20).toString('hex');
        await getStorage().bucket(STORAGE_BUCKET).file(objectPath).save(pdf, {
            resumable: false,
            contentType: 'application/pdf',
            metadata: { cacheControl: 'private, max-age=0, no-transform', metadata: { firebaseStorageDownloadTokens: storageToken } }
        });
        const contractPdfUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${storageToken}`;
        await paymentRef.set({
            contractPdfUrl,
            contractStoragePath: objectPath,
            contractGeneratedAt: now,
            contractValidity: 'valid',
            contractRendererVersion: cleanText(body.contractRendererVersion || 'studio-contract-v1', 80),
            deliveryStatus: payment?.deliveryStatus || 'pdf_ready'
        }, { merge: true });

        const userLicenseRef = db.collection('users').doc(producerId).collection('licencias').doc(paymentId);
        await userLicenseRef.set({
            id: paymentId,
            refCode: contractReference,
            reference: contractReference,
            contractReference,
            referenceVersion: paymentData.referenceVersion || CURRENT_REFERENCE_VERSION,
            referenceSource: paymentData.referenceSource || 'manual',
            beatId,
            beatName: paymentData.beatName,
            type: licenseType,
            licenseType,
            value: paymentData.finalPrice,
            price: paymentData.price,
            finalPrice: paymentData.finalPrice,
            buyerName,
            buyerEmail,
            buyerPhone: paymentData.buyerPhone,
            buyerId: paymentData.buyerDni,
            buyerDni: paymentData.buyerDni,
            buyerCity: paymentData.buyerCity,
            buyerCountry: paymentData.buyerCountry,
            formData: {
                buyerName,
                buyerEmail,
                buyerPhone: paymentData.buyerPhone,
                buyerId: paymentData.buyerDni,
                buyerCity: paymentData.buyerCity,
                buyerCountry: paymentData.buyerCountry
            },
            paymentMethod: cleanText(payment?.method || body.paymentMethod || 'Manual', 60),
            method: paymentData.method,
            status: paymentData.status,
            deliveryStatus: payment?.deliveryStatus || 'sent',
            date: (paymentData.timestamp || now).slice(0, 10),
            timestamp: paymentData.timestamp || now,
            contractPdfUrl,
            contractStoragePath: objectPath,
            contractRendererVersion: cleanText(body.contractRendererVersion || 'studio-contract-v1', 80),
            sriEstado: payment?.sriEstado || 'NO_EMITIDA'
        }, { merge: true });

        const [publicConfig, privateConfig] = await Promise.all([
            db.collection('users').doc(producerId).collection('config').doc('producer').get(),
            db.collection('users').doc(producerId).collection('private_config').doc('producer').get()
        ]);
        const producer = {
            ...(publicConfig.exists ? publicConfig.data() : {}),
            ...(privateConfig.exists ? privateConfig.data() : {})
        };
        const token = downloadToken(paymentId);
        const notification = await notifyPurchaseDelivery({ db, paymentId, producer, appOrigin: origin, downloadToken: token });
        if (!notification.complete && !notification.inProgress) {
            return res.status(notification.errorCode === 'EMAIL_NOT_CONFIGURED' ? 409 : 502).json({
                error: notification.errorCode === 'EMAIL_NOT_CONFIGURED'
                    ? 'El correo de entrega no está configurado para este productor.'
                    : 'El contrato se guardó, pero el correo no pudo enviarse.'
            });
        }
        return res.status(200).json({
            success: true,
            paymentId,
            portalUrl: purchasePortalUrl(origin, paymentId, token),
            emailDelivery: notification.inProgress ? 'in_progress' : (notification.sandbox ? 'sandbox' : 'sent')
        });
    } catch (error) {
        console.error('Error en entrega segura de licencia:', error?.message || error);
        return res.status(500).json({ error: 'No se pudo completar la entrega segura.' });
    }
}
