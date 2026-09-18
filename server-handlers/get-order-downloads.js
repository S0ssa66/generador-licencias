// server-handlers/get-order-downloads.js — shared handler for the Hobby dispatcher
// Obtiene los datos del pago, metadatos del beat, enlaces de descarga firmados e historial de descargas.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';
import { availablePriorLicenseUpgrades } from './license-upgrade-policy.js';
import { isValidLicenseReference, resolveLicenseReference } from '../license-reference.js';

const DEFAULT_APP_ORIGIN = 'https://beatss.app';

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    return isTrustedBeatssOrigin(origin) ? origin : null;
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 60;
const downloadsRateWindows = new Map();

export function resetDownloadsRateLimit() {
    downloadsRateWindows.clear();
}

export function checkDownloadsRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = downloadsRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        downloadsRateWindows.set(ip, { start: now, count: 1 });
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

function getAppOrigin(req) {
    const forwardedHost = req.headers['x-forwarded-host'];
    const host = (forwardedHost || req.headers.host || '').split(',')[0].trim().toLowerCase();
    if (host === 'beatss.app' || host === 'www.beatss.app') return `https://${host}`;
    if (/^generador-licencias-[a-z0-9-]+-masterjuego25-5300s-projects\.vercel\.app$/.test(host)) return `https://${host}`;
    if (/^(localhost|127\.0\.0\.1):\d+$/.test(host)) return `http://${host}`;
    return DEFAULT_APP_ORIGIN;
}
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
if (!SIGNING_SECRET) {
    console.error('FATAL: La variable de entorno DOWNLOAD_SIGNING_KEY no está configurada.');
}

function getSignedProxyUrl(rawUrl, host, paymentId, fileType) {
    if (!rawUrl) return '';
    // Los enlaces alternativos se abren directamente en el navegador. Solo
    // aceptamos HTTPS (o nuestro proxy relativo) para que un valor erróneo en
    // el catálogo no pueda convertirse en un enlace ejecutable en la entrega.
    if (!rawUrl.startsWith('https://') && !rawUrl.startsWith('/api/proxy-audio')) {
        return '';
    }
    let fileId = '';
    
    try {
        if (rawUrl.includes('id=')) {
            const urlObj = new URL(rawUrl, 'https://localhost');
            fileId = urlObj.searchParams.get('id');
        } else if (rawUrl.includes('drive.google.com')) {
            const parts = rawUrl.split('/d/');
            if (parts.length > 1) {
                fileId = parts[1].split('/')[0];
            }
        } else {
            // Los proveedores alternativos ya entregan una URL HTTPS completa.
            // No debe tratarse como un ID de Google Drive.
            return rawUrl;
        }
    } catch (e) {
        return rawUrl;
    }
    
    if (!fileId) return rawUrl;
    
    // WAV y Stems expiran en 24 horas, MP3 en 7 días
    const duration = (fileType === 'wav' || fileType === 'stems') ? 86400 : 86400 * 7;
    const expires = Math.floor(Date.now() / 1000) + duration;
    const dataToSign = `${fileId}:${expires}:${paymentId || ''}:${fileType || ''}`;
    const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    
    const baseUrl = getAppOrigin({ headers: { host } });
    return `${baseUrl}/api/proxy-audio?id=${fileId}&expires=${expires}&paymentId=${paymentId || ''}&fileType=${fileType || ''}&signature=${signature}`;
}

// Los masters ya no se guardan en el documento público del beat. Esta función
// mantiene el portal alineado con fulfillment: primero usa la subcolección
// privada y sólo conserva el documento público como respaldo de catálogos
// históricos.
export function resolvePurchasedDeliverySources(beatData = {}, privateFiles = {}) {
    return {
        mp3: privateFiles.mp3 || beatData.mp3 || '',
        wav: privateFiles.wav || beatData.wav || '',
        stems: privateFiles.stems || beatData.stems || ''
    };
}

export function createDeliveryToken(paymentId, secret = SIGNING_SECRET) {
    if (!secret || !paymentId) return '';
    return crypto.createHmac('sha256', secret)
        .update(`${paymentId}:pdf-delivery`)
        .digest('hex');
}

// Verifica si una firma de acceso es válida para el paymentId dado
// La firma fue generada por getSignedProxyUrl, que incluye un fileId específico.
// Para el endpoint de descarga, verificamos la presencia de una firma válida vía el paymentId.
function verifyAccessSignature(paymentId, accessToken) {
    if (!accessToken || !SIGNING_SECRET || !paymentId) return false;
    // El token de acceso para la página de descargas es: HMAC(paymentId:download, secret)
    const expected = crypto.createHmac('sha256', SIGNING_SECRET)
        .update(`${paymentId}:download`)
        .digest('hex');
    try {
        if (crypto.timingSafeEqual(Buffer.from(accessToken, 'hex'), Buffer.from(expected, 'hex'))) {
            return true;
        }
    } catch (e) {}
    return false;
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
    // CORS - restringido al dominio propio
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Vary', 'Origin');
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkDownloadsRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de descarga. Por favor espera unos minutos.' });
    }

    const paymentId = req.query.id;
    const accessToken = req.query.token; // Token de acceso firmado para la página de descargas

    if (!paymentId || !/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) {
        return res.status(400).json({ error: 'Falta el ID del pago.' });
    }
    if (!SIGNING_SECRET) {
        return res.status(503).json({ error: 'Servicio de descargas no configurado.' });
    }

    // Verificar acceso: firma válida de descarga O token de sesión Firebase (admin/productor)
    let isAuthorized = false;
    let authenticatedUid = null;
    let isAdminToken = false;
    let hasSignedDownloadAccess = false;

    // Opción 1: token de acceso firmado (compradores que llegan desde el email de confirmación)
    if (verifyAccessSignature(paymentId, accessToken)) {
        isAuthorized = true;
        hasSignedDownloadAccess = true;
    }

    // Opción 2: token de sesión Firebase (admin o productor autenticado)
    if (!isAuthorized) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                initFirebaseAdmin();
                const decoded = await getAuth().verifyIdToken(idToken);
                if (decoded && decoded.uid) {
                    authenticatedUid = decoded.uid;
                    const decodedEmail = (decoded.email || '').toLowerCase();
                    isAdminToken = decoded.admin === true || ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(decodedEmail);
                    isAuthorized = true;
                }
            } catch (e) {
                console.warn('Token inválido en get-order-downloads:', e.message);
            }
        }
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // 1. Obtener datos del pago
        const paymentSnap = await db.collection('payments').doc(paymentId).get();
        if (!paymentSnap.exists) {
            return res.status(404).json({ error: 'Pedido no encontrado.' });
        }
        const paymentData = paymentSnap.data();
        paymentData.id = paymentSnap.id;

        if (authenticatedUid && !isAdminToken &&
            paymentData.userId !== authenticatedUid && paymentData.producerId !== authenticatedUid) {
            return res.status(403).json({ error: 'La sesión no pertenece a este pedido.' });
        }
        if (!isAuthorized) {
            return res.status(401).json({ error: 'No autorizado. Se requiere un enlace de descarga válido o una sesión activa.' });
        }

        const terminalRevokedStatuses = ['refunded', 'disputed', 'chargeback', 'cancelled', 'cancelado', 'revoked'];
        if (terminalRevokedStatuses.includes(String(paymentData.status || '').toLowerCase()) || paymentData.accessRevoked === true) {
            return res.status(403).json({ error: 'El acceso a las descargas de este pedido ha sido revocado debido a la cancelación o reembolso de la compra.' });
        }

        // 2. Obtener datos del beat comprado
        const beatRef = db.collection('users').doc(paymentData.producerId).collection('beats').doc(paymentData.beatId);
        const beatSnap = await beatRef.get();
        if (!beatSnap.exists) {
            return res.status(404).json({ error: 'El instrumental no se encuentra disponible en el catálogo del productor.' });
        }
        const beatData = beatSnap.data();
        beatData.id = beatSnap.id;

        // 3. Obtener todos los archivos de entrega privados. El preview nunca
        // se reutiliza como master descargable.
        const privateFilesSnap = await beatRef.collection('private').doc('files').get();
        const privateFiles = privateFilesSnap.exists ? privateFilesSnap.data() : {};
        const deliverySources = resolvePurchasedDeliverySources(beatData, privateFiles);

        // 4. Obtener configuración del productor (logo, aka, email)
        const producerRef = db.collection('users').doc(paymentData.producerId);
        const [producerConfigSnap, privateProducerConfigSnap] = await Promise.all([
            producerRef.collection('config').doc('producer').get(),
            producerRef.collection('private_config').doc('producer').get()
        ]);
        const producerConfig = {
            ...(producerConfigSnap.exists ? producerConfigSnap.data() : {}),
            ...(privateProducerConfigSnap.exists ? privateProducerConfigSnap.data() : {})
        };

        // 5. Obtener historial de descargas
        const downloadsSnap = await db.collection('payments').doc(paymentId).collection('downloads').orderBy('timestamp', 'desc').get();
        const downloads = [];
        downloadsSnap.forEach(doc => {
            downloads.push(doc.data());
        });

        // 6. Generar enlaces seguros firmados (MP3, WAV, Stems) solo si está autorizado
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const paymentIsApproved = ['approved', 'completed'].includes(String(paymentData.status || '').toLowerCase());
        const contractReference = resolveLicenseReference(paymentData);
        const contractIsValid = isValidLicenseReference(contractReference) && paymentData.contractValidity !== 'invalid';
        const paymentIsDeliverable = paymentIsApproved && contractIsValid;
        const upgradeOptions = isAuthorized && paymentIsDeliverable
            ? availablePriorLicenseUpgrades({ sourcePayment: paymentData, beat: beatData })
            : [];
        const signedLinks = isAuthorized && paymentIsDeliverable ? {
            mp3: getSignedProxyUrl(deliverySources.mp3, host, paymentId, 'mp3'),
            wav: paymentData.licenseType !== 'basic' ? getSignedProxyUrl(deliverySources.wav, host, paymentId, 'wav') : '',
            stems: (paymentData.licenseType !== 'basic' && paymentData.licenseType !== 'premium') ? getSignedProxyUrl(deliverySources.stems, host, paymentId, 'stems') : ''
        } : {
            mp3: '',
            wav: '',
            stems: ''
        };

        // La sesión de la pasarela, identificadores internos y datos fiscales
        // privados del comprador (RUC/factura, dirección fiscal, logs de red)
        // se mantienen para conciliación interna y facturación.
        // Nunca deben viajar al portal público de descargas para proteger la
        // privacidad del cliente en caso de compartir su enlace de descarga.
        const {
            providerReference: _providerReference,
            paymentIntentId: _paymentIntentId,
            deunaTransactionId: _deunaTransactionId,
            stripeCustomerId: _stripeCustomerId,
            invoiceRuc: _invoiceRuc,
            invoiceCompany: _invoiceCompany,
            invoiceAddress: _invoiceAddress,
            invoiceEmail: _invoiceEmail,
            sriAccessKey: _sriAccessKey,
            sriAuthorization: _sriAuthorization,
            clientIp: _clientIp,
            ip: _ip,
            userAgent: _userAgent,
            ...publicPayment
        } = paymentData;

        return res.status(200).json({
            payment: {
                ...publicPayment,
                contractReference,
                contractValidity: contractIsValid ? 'valid' : 'invalid'
            },
            beat: {
                id: beatData.id,
                name: beatData.name,
                artwork: beatData.artwork || '',
                bpm: beatData.bpm || '',
                key: beatData.key || '',
                genre: beatData.genre || ''
            },
            producer: {
                aka: producerConfig.aka || 'Productor',
                name: producerConfig.name || '',
                email: producerConfig.email || '',
                logoBase64: producerConfig.logoBase64 || '',
                id: producerConfig.id || '',
                phone: producerConfig.phone || '',
                pro: producerConfig.pro || 'BMI',
                ipi: producerConfig.ipi || '',
                publisher: producerConfig.publisher || ''
            },
            signedLinks,
            // El token sólo se devuelve tras autorizar el portal y permite
            // persistir el mismo PDF que el comprador descarga.
            deliveryToken: isAuthorized && paymentIsApproved ? createDeliveryToken(paymentId) : '',
            // No habilita por sí solo una compra: Stripe vuelve a comprobar el
            // vínculo firmado, titular, beat, fecha y precio en el servidor.
            priorLicenseUpgrade: {
                eligible: upgradeOptions.length > 0,
                // Sólo se reexpone cuando el comprador entró con su enlace
                // firmado original; una sesión de productor no puede usarlo
                // para iniciar un cobro a nombre de un tercero.
                accessToken: hasSignedDownloadAccess ? accessToken : '',
                options: upgradeOptions.map(({ targetLicenseType, targetLicensePrice, creditApplied, amountDue }) => ({
                    targetLicenseType,
                    targetLicensePrice,
                    creditApplied,
                    amountDue
                }))
            },
            paymentCapabilities: { stripe: Boolean(process.env.STRIPE_SECRET_KEY) },
            downloads
        });

    } catch (err) {
        console.error('Error al obtener datos de descargas:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
