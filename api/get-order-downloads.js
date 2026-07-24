// api/get-order-downloads.js — Vercel Serverless Function
// Obtiene los datos del pago, metadatos del beat, enlaces de descarga firmados e historial de descargas.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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

function getSignedProxyUrl(rawUrl, host, paymentId, fileType) {
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
    
    const baseUrl = host ? `https://${host}` : DEFAULT_APP_ORIGIN;
    return `${baseUrl}/api/proxy-audio?id=${fileId}&expires=${expires}&paymentId=${paymentId || ''}&fileType=${fileType || ''}&signature=${signature}`;
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
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const paymentId = req.query.id;
    const accessToken = req.query.token; // Token de acceso firmado para la página de descargas

    if (!paymentId) {
        return res.status(400).json({ error: 'Falta el ID del pago.' });
    }

    // Verificar acceso: firma válida de descarga O token de sesión Firebase (admin/productor)
    let isAuthorized = false;

    // Opción 1: token de acceso firmado (compradores que llegan desde el email de confirmación)
    if (verifyAccessSignature(paymentId, accessToken)) {
        isAuthorized = true;
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

        // Verificar acceso: firma válida de descarga O token de sesión Firebase (admin/productor)
        let isAuthorized = false;

        // Opción 1: token de acceso firmado (compradores que llegan desde el email de confirmación)
        if (verifyAccessSignature(paymentId, accessToken)) {
            isAuthorized = true;
        }

        // Opción 2: token de sesión Firebase (admin o productor autenticado)
        if (!isAuthorized) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                const idToken = authHeader.split('Bearer ')[1];
                try {
                    const decoded = await getAuth().verifyIdToken(idToken);
                    if (decoded && decoded.uid) {
                        isAuthorized = true;
                    }
                } catch (e) {
                    console.warn('Token inválido en get-order-downloads:', e.message);
                }
            }
        }

        // Si no está autorizado, pero el pago está pendiente, permitimos ver el estado pendiente (sin enlaces de descarga)
        const isPending = paymentData.status === 'pending' || paymentData.status === 'pendiente';
        if (!isAuthorized && !isPending) {
            return res.status(401).json({ error: 'No autorizado. Se requiere un enlace de descarga válido o una sesión activa.' });
        }

        // 2. Obtener datos del beat comprado
        const beatRef = db.collection('users').doc(paymentData.producerId).collection('beats').doc(paymentData.beatId);
        const beatSnap = await beatRef.get();
        if (!beatSnap.exists) {
            return res.status(404).json({ error: 'El instrumental no se encuentra disponible en el catálogo del productor.' });
        }
        const beatData = beatSnap.data();
        beatData.id = beatSnap.id;

        // 3. Obtener enlaces privados (WAV y Stems de alta calidad)
        const privateFilesSnap = await beatRef.collection('private').doc('files').get();
        let privateWav = '';
        let privateStems = '';
        if (privateFilesSnap.exists) {
            const privateData = privateFilesSnap.data();
            privateWav = privateData.wav || '';
            privateStems = privateData.stems || '';
        }

        // 4. Obtener configuración del productor (logo, aka, email)
        const producerConfigSnap = await db.collection('users').doc(paymentData.producerId).collection('config').doc('producer').get();
        const producerConfig = producerConfigSnap.exists ? producerConfigSnap.data() : {};

        // 5. Obtener historial de descargas
        const downloadsSnap = await db.collection('payments').doc(paymentId).collection('downloads').orderBy('timestamp', 'desc').get();
        const downloads = [];
        downloadsSnap.forEach(doc => {
            downloads.push(doc.data());
        });

        // 6. Generar enlaces seguros firmados (MP3, WAV, Stems) solo si está autorizado
        const host = req.headers.host;
        const signedLinks = isAuthorized ? {
            mp3: getSignedProxyUrl(beatData.mp3 || '', host, paymentId, 'mp3'),
            wav: paymentData.licenseType !== 'basic' ? getSignedProxyUrl(privateWav || beatData.wav || '', host, paymentId, 'wav') : '',
            stems: (paymentData.licenseType !== 'basic' && paymentData.licenseType !== 'premium') ? getSignedProxyUrl(privateStems || beatData.stems || '', host, paymentId, 'stems') : ''
        } : {
            mp3: '',
            wav: '',
            stems: ''
        };

        return res.status(200).json({
            payment: paymentData,
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
            downloads
        });

    } catch (err) {
        console.error('Error al obtener datos de descargas:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
