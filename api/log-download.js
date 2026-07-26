// api/log-download.js — Vercel Serverless Function
// Registra descargas de licencias o PDFs de contratos realizadas desde el cliente.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';

const ALLOWED_ORIGINS = new Set([
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app'
]);
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    if (ALLOWED_ORIGINS.has(origin) ||
        /^https:\/\/generador-licencias-[a-z0-9-]+-masterjuego25-5300s-projects\.vercel\.app$/i.test(origin) ||
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return origin;
    return null;
}

function verifyDownloadToken(paymentId, token) {
    if (!SIGNING_SECRET || !paymentId || !token) return false;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET)
        .update(`${paymentId}:download`)
        .digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch (_) {
        return false;
    }
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
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Vary', 'Origin');
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { paymentId, fileType, accessToken } = req.body || {};
    const allowedFileTypes = new Set(['license', 'mp3', 'wav', 'stems', 'ride', 'xml']);
    if (!paymentId || !/^[A-Za-z0-9_-]{3,160}$/.test(paymentId) || !allowedFileTypes.has(fileType)) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }
    if (!SIGNING_SECRET) return res.status(503).json({ error: 'Registro de descargas no configurado.' });

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // Verificar que el pago existe
        const paymentDoc = await db.collection('payments').doc(paymentId).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'Pago no encontrado.' });
        }
        const paymentData = paymentDoc.data();
        let authorized = verifyDownloadToken(paymentId, accessToken);

        if (!authorized) {
            const authHeader = req.headers.authorization || '';
            if (authHeader.startsWith('Bearer ')) {
                try {
                    const decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
                    const isAdmin = decoded.admin === true || (decoded.email || '').toLowerCase() === 'masterjuego25@gmail.com';
                    authorized = isAdmin || decoded.uid === paymentData.userId || decoded.uid === paymentData.producerId;
                } catch (_) {
                    authorized = false;
                }
            }
        }
        if (!authorized) return res.status(401).json({ error: 'No autorizado para registrar esta descarga.' });

        const forwardedFor = req.headers['x-forwarded-for'];
        const clientIp = forwardedFor ? forwardedFor : (req.socket.remoteAddress || 'Unknown');

        // Loguear el evento en la subcolección downloads
        await db.collection('payments').doc(paymentId).collection('downloads').add({
            timestamp: new Date().toISOString(),
            ip: clientIp,
            fileType: fileType
        });

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('Error al registrar descarga en log-download:', err);
        return res.status(500).json({ error: 'Error interno del servidor.' });
    }
}
