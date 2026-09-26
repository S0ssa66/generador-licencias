// api/confirm-purchase.js — Vercel Serverless Function
// Valida el pago de PayPal en el servidor y procesa la entrega segura de los beats al comprador.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';
import { enqueueSriJob } from './_sri_queue.js';
import { isTrustedBeatssOrigin } from './_cors-origin.js';
import { notifyPurchaseDelivery } from './_purchase-delivery.js';
import { isBeatAvailableForSale, resolvePublicPreview } from '../server-handlers/beat-availability.js';
import { resolveProducerSalesMode } from '../server-handlers/producer-settlement.js';
import {
    CURRENT_REFERENCE_VERSION,
    createPublicContractReference,
    isValidLicenseReference,
    normalizeLicenseReference,
    referenceTokenFromBytes,
    resolveLicenseReference
} from '../license-reference.js';

export const config = {
    api: { bodyParser: { sizeLimit: '15mb' } }
};

const DEFAULT_APP_ORIGIN = 'https://beatss.app';
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app';
const REFERENCE_SECRET = process.env.LICENSE_REFERENCE_SIGNING_KEY || process.env.DOWNLOAD_SIGNING_KEY;

function resolveAppOrigin(req) {
    const origin = req?.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) return origin;
    return DEFAULT_APP_ORIGIN;
}
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
if (!SIGNING_SECRET) {
    console.error('FATAL: La variable de entorno DOWNLOAD_SIGNING_KEY no está configurada.');
}

// Genera un token de acceso firmado para la página de descargas del comprador
function generateDownloadToken(paymentId) {
    if (!SIGNING_SECRET) return '';
    return crypto.createHmac('sha256', SIGNING_SECRET)
        .update(`${paymentId}:download`)
        .digest('hex');
}

function createPayPalContractReference({ paymentId, orderId, licenseType, issuedAt }) {
    if (!REFERENCE_SECRET || String(REFERENCE_SECRET).length < 32) {
        throw new Error('Falta una clave de firma segura para referencias contractuales.');
    }
    const token = referenceTokenFromBytes(
        crypto
            .createHmac('sha256', REFERENCE_SECRET)
            .update(`beatss-contract-reference-v3:${paymentId}:${orderId}`)
            .digest()
    );
    return createPublicContractReference({ licenseType, issuedAt, token });
}

function deterministicPayPalPaymentId(orderId, beatId, index) {
    return `paypal_${crypto.createHash('sha256').update(`${orderId}:${beatId}:${index}`).digest('hex').slice(0, 40)}`;
}

function getSignedProxyUrl(rawUrl, appOrigin, paymentId, fileType) {
    if (!rawUrl) return '';
    // Los proveedores alternativos se entregan con su URL directa. Limitarla
    // a HTTPS evita incluir esquemas inseguros en el correo o portal del comprador.
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
            // Los enlaces de proveedores alternativos se entregan directamente.
            return rawUrl;
        }
    } catch (e) {
        return rawUrl;
    }
    
    if (!fileId) return rawUrl;
    
    const expires = Math.floor(Date.now() / 1000) + 86400 * 7; // 7 días
    const dataToSign = `${fileId}:${expires}:${paymentId || ''}:${fileType || ''}`;
    const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    
    const baseUrl = appOrigin || DEFAULT_APP_ORIGIN;
    return `${baseUrl}/api/proxy-audio?id=${fileId}&expires=${expires}&paymentId=${paymentId || ''}&fileType=${fileType || ''}&signature=${signature}`;
}


// Inicializar Firebase Admin (solo una vez)
function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: STORAGE_BUCKET
    });
}

function isValidDeliveryToken(paymentId, token) {
    if (!SIGNING_SECRET || !paymentId || !token) return false;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:pdf-delivery`).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch (_) {
        return false;
    }
}

export function validatePdf(value) {
    const raw = String(value || '').trim();
    const dataUriPrefix = raw.match(/^data:application\/pdf[^,]*;base64,/i)?.[0] || '';
    const encoded = (dataUriPrefix ? raw.slice(dataUriPrefix.length) : raw).replace(/\s+/g, '');
    if (!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new Error('El contrato no contiene un PDF válido.');
    const pdf = Buffer.from(encoded, 'base64');
    if (pdf.length < 5 || pdf.length > 15 * 1024 * 1024 || !pdf.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        throw new Error('El PDF debe ser válido y menor a 15 MB.');
    }
    return pdf;
}

export function isSandboxEmailRecipient(value) {
    return /^[^\s@]+@[^\s@]+\.test$/i.test(String(value || '').trim());
}

async function uploadLicensePdf(req, res) {
    const { paymentId, deliveryToken, contractReference: submittedReference, pdfBase64 } = req.body || {};
    if (!SIGNING_SECRET) return res.status(503).json({ error: 'La entrega segura todavía no está configurada.' });
    if (!isValidDeliveryToken(paymentId, deliveryToken)) return res.status(401).json({ error: 'La autorización de entrega no es válida.' });

    try {
        const pdf = validatePdf(pdfBase64);
        initFirebaseAdmin();
        const db = getFirestore();
        const paymentRef = db.collection('payments').doc(paymentId);
        const paymentSnap = await paymentRef.get();
        if (!paymentSnap.exists) return res.status(404).json({ error: 'No se encontró el pago de esta entrega.' });

        const payment = paymentSnap.data();
        if (!['approved', 'completed'].includes(String(payment.status || '').toLowerCase())) {
            return res.status(409).json({ error: 'El pago aún no está aprobado.' });
        }

        const contractReference = resolveLicenseReference(payment);
        const normalizedSubmittedReference = normalizeLicenseReference(submittedReference);
        if (!isValidLicenseReference(contractReference)) {
            return res.status(409).json({ error: 'La compra no tiene un código de referencia contractual válido; no se aceptó el PDF.' });
        }
        if (normalizedSubmittedReference && normalizedSubmittedReference !== contractReference) {
            return res.status(409).json({ error: 'La referencia del PDF no coincide con la compra aprobada.' });
        }

        const safeReference = contractReference.replace(/[^a-zA-Z0-9_-]/g, '_');
        const objectPath = `licenses/${payment.producerId}/deliveries/${paymentId}/Licencia_${safeReference}.pdf`;
        const token = crypto.randomBytes(20).toString('hex');
        await getStorage().bucket(STORAGE_BUCKET).file(objectPath).save(pdf, {
            resumable: false,
            contentType: 'application/pdf',
            metadata: { cacheControl: 'private, max-age=0, no-transform', metadata: { firebaseStorageDownloadTokens: token } }
        });

        const contractUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
        const appOrigin = resolveAppOrigin(req);
        const downloadToken = generateDownloadToken(paymentId);
        const previousDeliveryStatus = String(payment.deliveryStatus || '');
        const contractGeneratedAt = new Date().toISOString();
        const contractUpdate = {
            contractPdfUrl: contractUrl,
            contractStoragePath: objectPath,
            contractGeneratedAt,
            contractReference,
            contractValidity: 'valid',
            contractRendererVersion: 'manual-contract-v1'
        };
        if (!['notifying', 'portal_sent', 'portal_ready_sandbox', 'sent', 'sandbox_complete'].includes(previousDeliveryStatus)) {
            contractUpdate.deliveryStatus = 'pdf_ready';
        }
        await paymentRef.update(contractUpdate);

        const [publicConfigSnap, privateConfigSnap] = await Promise.all([
            db.collection('users').doc(payment.producerId).collection('config').doc('producer').get(),
            db.collection('users').doc(payment.producerId).collection('private_config').doc('producer').get()
        ]);
        const producer = {
            ...(publicConfigSnap.exists ? publicConfigSnap.data() : {}),
            ...(privateConfigSnap.exists ? privateConfigSnap.data() : {})
        };
        const notification = await notifyPurchaseDelivery({
            db,
            paymentId,
            producer,
            appOrigin,
            downloadToken
        });
        if (previousDeliveryStatus === 'portal_sent' && notification.complete) {
            await paymentRef.update({ deliveryStatus: 'sent', deliveryCompletedAt: contractGeneratedAt });
        } else if (previousDeliveryStatus === 'portal_ready_sandbox' && notification.complete) {
            await paymentRef.update({ deliveryStatus: 'sandbox_complete', deliveryCompletedAt: contractGeneratedAt });
        }
        if (!notification.complete && !notification.inProgress) {
            return res.status(notification.errorCode === 'EMAIL_NOT_CONFIGURED' ? 409 : 502).json({
                error: notification.errorCode === 'EMAIL_NOT_CONFIGURED'
                    ? 'El correo de entrega no está configurado para este productor.'
                    : 'El contrato se guardó, pero el correo no pudo enviarse.'
            });
        }
        return res.status(200).json({
            success: true,
            contractUrl,
            emailDelivery: notification.inProgress ? 'in_progress' : (notification.sandbox ? 'sandbox' : 'sent')
        });
    } catch (error) {
        console.error('Error al preparar entrega de licencia:', error);
        return res.status(500).json({ error: 'No se pudo preparar la entrega oficial de la licencia.' });
    }
}

// Obtener token de acceso de PayPal
async function getPayPalAccessToken(clientId, secret, isSandbox) {
    const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const paypalHost = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';

    const response = await fetch(`https://${paypalHost}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`No se pudo obtener el token de PayPal: ${errText}`);
    }
    const data = await response.json();
    return data.access_token;
}

// Verificar el order con la API de PayPal
async function verifyPayPalOrder(orderId, clientId, secret, isSandbox) {
    const accessToken = await getPayPalAccessToken(clientId, secret, isSandbox);
    const paypalHost = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';

    const response = await fetch(`https://${paypalHost}/v2/checkout/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`No se pudo verificar el order de PayPal: ${errText}`);
    }
    return await response.json();
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 15;
const confirmRateWindows = new Map();

export function resetConfirmRateLimit() {
    confirmRateWindows.clear();
}

export function checkConfirmRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = confirmRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        confirmRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getClientIp(req) {
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
    const origin = req?.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const ip = getClientIp(req);
    const rate = checkConfirmRateLimit(ip);
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo nuevamente en unos minutos.' });
    }

    if (req.query?.action === 'upload-license-pdf') {
        return uploadLicensePdf(req, res);
    }

    const {
        orderId,
        producerId,
        buyerName,
        buyerEmail,
        buyerPhone,
        buyerDni,
        buyerCity,
        buyerCountry,
        youtubeWhitelist = '',
        items,
        discountPercent = 0,
        couponCode = ''
    } = req.body;

    if (!orderId || !producerId || !buyerName || !buyerEmail || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos para confirmar la compra.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();
        const appOrigin = resolveAppOrigin(req);

        // 1. Obtener la configuración del productor (pública y privada)
        const publicConfigRef = db.collection('users').doc(producerId).collection('config').doc('producer');
        const privateConfigRef = db.collection('users').doc(producerId).collection('private_config').doc('producer');

        const [publicSnap, privateSnap] = await Promise.all([
            publicConfigRef.get(),
            privateConfigRef.get()
        ]);

        if (!publicSnap.exists) {
            return res.status(404).json({ error: 'Productor no encontrado o no configurado.' });
        }

        const publicConfig = publicSnap.data();
        const privateConfig = privateSnap.exists ? privateSnap.data() : {};

        // 2. Cada tienda usa exclusivamente su propia cuenta PayPal.
        // El productor de plataforma (Sossa) puede cobrar mediante la cuenta de plataforma.
        let activeClientId = privateConfig.paypalClientId || '';
        let activeSecret = privateConfig.paypalClientSecret || '';
        const mode = resolveProducerSalesMode({ producerId, publicConfig, privateConfig, env: process.env });
        if ((!activeClientId || !activeSecret) && mode.isPlatform) {
            activeClientId = process.env.PAYPAL_CLIENT_ID || '';
            activeSecret = process.env.PAYPAL_CLIENT_SECRET || '';
        }

        if (!activeClientId || !activeSecret) {
            return res.status(409).json({ error: 'PayPal no está configurado para este productor.' });
        }

        const isSandbox = process.env.PAYPAL_MODE === 'sandbox' || activeClientId.startsWith('sb-') || activeClientId.includes('sandbox');

        // 3. Verificar el pago en PayPal
        const order = await verifyPayPalOrder(orderId, activeClientId, activeSecret, isSandbox);

        if (order.status !== 'COMPLETED' && order.status !== 'APPROVED') {
            return res.status(400).json({ error: `El pago no está completado en PayPal. Estado: ${order.status}` });
        }

        // 4. Procesar cada beat comprado y obtener los enlaces privados
        const deliveredItems = [];
        const typeLabels = {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Premium Plus',
            unlimited_flp: 'Ilimitada + FLP',
            exclusive: 'Exclusiva'
        };

        for (const [itemIndex, item] of items.entries()) {
            // Obtener metadatos básicos del beat
            const beatRef = db.collection('users').doc(producerId).collection('beats').doc(item.beatId);
            const beatSnap = await beatRef.get();
            if (!beatSnap.exists) {
                console.warn(`Beat ${item.beatId} no encontrado en el catálogo.`);
                continue;
            }
            const beatData = beatSnap.data();
            // Resolver primero la idempotencia: un reintento de un pedido ya
            // pagado debe poder recuperar su entrega aunque luego el beat se
            // haya retirado de la venta o vendido en exclusiva.
            const paymentId = deterministicPayPalPaymentId(orderId, item.beatId, itemIndex);
            const paymentRef = db.collection('payments').doc(paymentId);
            const existingPaymentSnap = await paymentRef.get();
            const existingPayment = existingPaymentSnap.exists ? (existingPaymentSnap.data() || {}) : null;

            // PayPal debe respetar exactamente la misma disponibilidad que el
            // escaparate y Stripe. Una exclusiva cerrada no admite nuevas
            // licencias por esta ruta; las ampliaciones de titulares previos
            // se validan exclusivamente en el Checkout Stripe protegido.
            const previewFilesSnap = await beatRef.collection('private').doc('files').get();
            const preview = resolvePublicPreview({
                ...beatData,
                preview: beatData.preview || (previewFilesSnap.exists ? previewFilesSnap.data()?.preview : '')
            });
            if (!existingPaymentSnap.exists && !isBeatAvailableForSale({ ...beatData, preview })) {
                return res.status(409).json({ error: 'Uno de los beats seleccionados ya no está disponible.' });
            }

            // Obtener archivos privados (high quality links)
            const privateFilesSnap = previewFilesSnap;
            let wavLink = '';
            let stemsLink = '';

            if (privateFilesSnap.exists) {
                const privateData = privateFilesSnap.data();
                wavLink = privateData.wav || '';
                stemsLink = privateData.stems || '';
            }

            // Registrar el pago aprobado en Firestore usando Admin SDK (bypasseando reglas)
            const timestamp = existingPayment?.timestamp || new Date().toISOString();
            const finalPrice = existingPayment
                ? Number(existingPayment.finalPrice ?? existingPayment.price ?? 0)
                : Number((item.price * (1 - (discountPercent / 100))).toFixed(2));
            const contractReference = existingPayment
                ? resolveLicenseReference(existingPayment)
                : createPayPalContractReference({ paymentId, orderId, licenseType: item.licenseType, issuedAt: timestamp });
            if (!isValidLicenseReference(contractReference)) {
                throw new Error('El pago de PayPal no tiene una referencia contractual válida.');
            }
            
            const paymentData = {
                type: 'beat_purchase',
                producerId: producerId,
                beatId: item.beatId,
                beatName: item.beatName,
                licenseType: item.licenseType,
                price: item.price,
                buyerName: buyerName,
                buyerEmail: buyerEmail,
                buyerPhone: buyerPhone || '',
                buyerDni: buyerDni || '',
                buyerCity: buyerCity || '',
                buyerCountry: buyerCountry || '',
                youtubeWhitelist: youtubeWhitelist || '',
                method: 'paypal',
                reference: contractReference,
                contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                referenceSource: 'paypal',
                providerReference: orderId,
                receiptUrl: '',
                status: 'approved',
                deliveryStatus: 'awaiting_contract',
                discountPercent: discountPercent,
                couponCode: couponCode,
                originalPrice: item.price,
                finalPrice: finalPrice,
                timestamp
            };

            if (!existingPaymentSnap.exists) await paymentRef.set(paymentData);

            // Mantener el registro que consume el historial del productor.
            // El documento de pago sigue siendo la fuente transaccional, pero
            // esta copia permite que dashboard, reintentos y descargas usen el
            // mismo paymentId sin depender del backup local.
            if (!existingPaymentSnap.exists) await db.collection('users').doc(producerId).collection('licencias').doc(paymentRef.id).set({
                id: paymentRef.id,
                refCode: contractReference,
                reference: contractReference,
                contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                referenceSource: 'paypal',
                beatId: item.beatId,
                beatName: item.beatName,
                type: item.licenseType,
                licenseType: item.licenseType,
                value: finalPrice,
                buyerName,
                buyerEmail,
                buyerPhone: buyerPhone || '',
                buyerId: buyerDni || '',
                buyerCity: buyerCity || '',
                buyerCountry: buyerCountry || '',
                formData: {
                    buyerName,
                    buyerEmail,
                    buyerPhone: buyerPhone || '',
                    buyerId: buyerDni || '',
                    buyerCity: buyerCity || '',
                    buyerCountry: buyerCountry || '',
                    youtubeWhitelist: youtubeWhitelist || ''
                },
                paymentMethod: 'PayPal',
                status: 'approved',
                date: new Date().toISOString().slice(0, 10),
                timestamp
            }, { merge: true });

            // La función serverless no puede mantener un worker Python. Deja
            // el trabajo en Firestore para que el proceso SRI persistente lo
            // firme, lo envíe y consulte su autorización.
            if (!existingPaymentSnap.exists) {
                try {
                    await enqueueSriJob(db, {
                        paymentId: paymentRef.id,
                        producerId,
                        publicConfig,
                        privateConfig,
                        requestedBy: 'paypal-confirm-purchase'
                    });
                } catch (sriQueueError) {
                    // No convertir un problema de la cola SRI en un segundo
                    // intento de cobro: el pago ya quedó registrado y se puede
                    // reintentar desde el historial.
                    console.error('No se pudo encolar la factura SRI:', sriQueueError.message);
                    try {
                        await paymentRef.update({
                            sriEstado: 'ERROR_COLA',
                            sriUltimoIntento: new Date().toISOString(),
                            sriErrorMensaje: 'No se pudo crear el trabajo SRI; reintenta desde el historial.'
                        });
                    } catch (statusError) {
                        console.error('No se pudo guardar el estado de la cola SRI:', statusError.message);
                    }
                }
            }

            // Generar enlaces de descarga para este item
            const mp3 = getSignedProxyUrl(beatData.mp3 || "", appOrigin, paymentRef.id, 'mp3');
            const rawWav = wavLink || beatData.wav || "";
            const rawStems = stemsLink || beatData.stems || "";
            
            const wav = getSignedProxyUrl(rawWav, appOrigin, paymentRef.id, 'wav');
            const stems = getSignedProxyUrl(rawStems, appOrigin, paymentRef.id, 'stems');

            // Generar token de acceso para la página de descargas (sin necesidad de login)
            const downloadToken = generateDownloadToken(paymentRef.id);
            const downloadUrl = `${appOrigin}/descargas/${encodeURIComponent(paymentRef.id)}?token=${encodeURIComponent(downloadToken)}`;

            let linksHtml = `
            <div style="margin-bottom: 20px; padding: 15px; border: 1px solid #edf2f7; border-radius: 8px; background-color: #f8fafc;">
                <h4 style="margin: 0 0 10px 0; color: #2d3748;">Instrumental: <strong>${item.beatName}</strong> (${typeLabels[item.licenseType] || item.licenseType})</h4>
                <a href="${downloadUrl}" style="display: inline-block; padding: 10px 20px; background-color: #0055ee; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-size: 13px; font-weight: bold; border: 1px solid #0044cc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">📥 Acceder a Descargas e Historial</a>
            </div>
            `;

            deliveredItems.push({
                paymentId: paymentRef.id,
                beatName: item.beatName,
                licenseType: item.licenseType,
                reference: contractReference,
                linksHtml: linksHtml,
                deliveryToken: SIGNING_SECRET
                    ? crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentRef.id}:pdf-delivery`).digest('hex')
                    : ''
            });
        }

        if (deliveredItems.length === 0) {
            return res.status(400).json({ error: 'No se procesó ningún beat válido de la orden.' });
        }

        if (!SIGNING_SECRET) {
            throw new Error('Falta la configuración segura de entrega (DOWNLOAD_SIGNING_KEY).');
        }

        return res.status(200).json({
            success: true,
            paymentId: deliveredItems[0]?.paymentId || '',
            deliveries: deliveredItems.map(({ paymentId, beatName, licenseType, reference, deliveryToken }) => ({
                paymentId,
                beatName,
                licenseType,
                reference,
                deliveryToken
            })),
            message: 'Compra confirmada. Generando los contratos oficiales para la entrega.'
        });

    } catch (error) {
        console.error('❌ Error en confirm-purchase:', error);
        // No exponer detalles internos al cliente en producción
        return res.status(500).json({
            error: 'Error interno al confirmar la compra. Por favor contacta al soporte.'
        });
    }
}
