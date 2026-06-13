// api/get-order-downloads.js — Vercel Serverless Function
// Obtiene los datos del pago, metadatos del beat, enlaces de descarga firmados e historial de descargas.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY || process.env.FIREBASE_PRIVATE_KEY || 'default_fallback_secret';

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
            fileId = rawUrl;
        }
    } catch (e) {
        fileId = rawUrl;
    }
    
    if (!fileId) return rawUrl;
    
    const expires = Math.floor(Date.now() / 1000) + 86400 * 7; // 7 días
    const dataToSign = `${fileId}:${expires}:${paymentId || ''}:${fileType || ''}`;
    const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    
    const baseUrl = host ? `https://${host}` : ALLOWED_ORIGIN;
    return `${baseUrl}/api/proxy-audio?id=${fileId}&expires=${expires}&paymentId=${paymentId || ''}&fileType=${fileType || ''}&signature=${signature}`;
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
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const paymentId = req.query.id;
    if (!paymentId) {
        return res.status(400).json({ error: 'Falta el ID del pago.' });
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

        // 6. Generar enlaces seguros firmados (MP3, WAV, Stems)
        const host = req.headers.host;
        const signedLinks = {
            mp3: getSignedProxyUrl(beatData.mp3 || '', host, paymentId, 'mp3'),
            wav: paymentData.licenseType !== 'basic' ? getSignedProxyUrl(privateWav || beatData.wav || '', host, paymentId, 'wav') : '',
            stems: (paymentData.licenseType !== 'basic' && paymentData.licenseType !== 'premium') ? getSignedProxyUrl(privateStems || beatData.stems || '', host, paymentId, 'stems') : ''
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
        return res.status(500).json({ error: 'Error interno del servidor.', details: err.message });
    }
}
