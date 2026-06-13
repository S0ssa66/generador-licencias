// api/log-download.js — Vercel Serverless Function
// Registra descargas de licencias o PDFs de contratos realizadas desde el cliente.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const { paymentId, fileType } = req.body;
    if (!paymentId || !fileType) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // Verificar que el pago existe
        const paymentDoc = await db.collection('payments').doc(paymentId).get();
        if (!paymentDoc.exists) {
            return res.status(404).json({ error: 'Pago no encontrado.' });
        }

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
        return res.status(500).json({ error: 'Error interno del servidor.', details: err.message });
    }
}
