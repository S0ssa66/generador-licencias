// api/confirm-purchase.js — Vercel Serverless Function
// Valida el pago de PayPal en el servidor y procesa la entrega segura de los beats al comprador.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const ALLOWED_ORIGINS = [
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app'
];
const DEFAULT_APP_ORIGIN = 'https://beatss.app';

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return 'https://beatss.app';
    if (ALLOWED_ORIGINS.includes(origin) || 
        origin.endsWith('.vercel.app') || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1')) {
        return origin;
    }
    return 'https://beatss.app';
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

function getSignedProxyUrl(rawUrl, appOrigin, paymentId, fileType) {
    if (!rawUrl) return '';
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
        })
    });
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

export default async function handler(req, res) {
    // CORS headers - restringido al dominio propio
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
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
        const appOrigin = getCorsOrigin(req);

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

        // 2. Determinar credenciales de PayPal (Productor o fallback a la plataforma)
        const activeClientId = publicConfig.paypalClientId || process.env.PAYPAL_CLIENT_ID;
        const activeSecret = privateConfig.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET;

        if (!activeClientId || !activeSecret) {
            return res.status(500).json({ error: 'El productor no tiene configurado PayPal y el servidor no tiene credenciales de fallback.' });
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

        for (const item of items) {
            // Obtener metadatos básicos del beat
            const beatRef = db.collection('users').doc(producerId).collection('beats').doc(item.beatId);
            const beatSnap = await beatRef.get();
            if (!beatSnap.exists) {
                console.warn(`Beat ${item.beatId} no encontrado en el catálogo.`);
                continue;
            }
            const beatData = beatSnap.data();

            // Obtener archivos privados (high quality links)
            const privateFilesRef = beatRef.collection('private').doc('files');
            const privateFilesSnap = await privateFilesRef.get();
            let wavLink = '';
            let stemsLink = '';

            if (privateFilesSnap.exists) {
                const privateData = privateFilesSnap.data();
                wavLink = privateData.wav || '';
                stemsLink = privateData.stems || '';
            }

            // Registrar el pago aprobado en Firestore usando Admin SDK (bypasseando reglas)
            const paymentRef = db.collection('payments').doc();
            const finalPrice = item.price * (1 - (discountPercent / 100));
            
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
                reference: orderId,
                receiptUrl: '',
                status: 'approved',
                deliveryStatus: 'awaiting_contract',
                discountPercent: discountPercent,
                couponCode: couponCode,
                originalPrice: item.price,
                finalPrice: finalPrice,
                timestamp: new Date().toISOString()
            };

            await paymentRef.set(paymentData);

            // Generar enlaces de descarga para este item
            const mp3 = getSignedProxyUrl(beatData.mp3 || "", appOrigin, paymentRef.id, 'mp3');
            const rawWav = wavLink || beatData.wav || "";
            const rawStems = stemsLink || beatData.stems || "";
            
            const wav = getSignedProxyUrl(rawWav, appOrigin, paymentRef.id, 'wav');
            const stems = getSignedProxyUrl(rawStems, appOrigin, paymentRef.id, 'stems');

            // Generar token de acceso para la página de descargas (sin necesidad de login)
            const downloadToken = generateDownloadToken(paymentRef.id);
            const downloadUrl = `${appOrigin}/?download=${paymentRef.id}&token=${downloadToken}`;

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
            deliveries: deliveredItems.map(({ paymentId, beatName, licenseType, deliveryToken }) => ({
                paymentId,
                beatName,
                licenseType,
                reference: orderId,
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
