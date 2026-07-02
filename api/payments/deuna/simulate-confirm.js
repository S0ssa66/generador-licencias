// api/payments/deuna/simulate-confirm.js — Vercel Serverless Function
// Simula o procesa la confirmación de pago de Deuna! y marca el estado como 'completed' en Firestore.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ALLOWED_ORIGINS = [
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app'
];

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
    // CORS
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { purchaseId } = req.body;

        if (!purchaseId) {
            return res.status(400).json({ error: "Falta parámetro 'purchaseId'" });
        }

        initFirebaseAdmin();
        const db = getFirestore();

        // 1. Obtener la referencia de pago
        const paymentRef = db.collection('payments').doc(purchaseId);
        const paymentSnap = await paymentRef.get();

        if (!paymentSnap.exists) {
            return res.status(404).json({ error: `No se encontró el pago con ID: ${purchaseId}` });
        }

        // 2. Actualizar el estado a 'completed'
        await paymentRef.update({
            status: 'completed',
            updatedAt: Date.now()
        });

        console.log(`📲 Pago Deuna! ${purchaseId} confirmado y actualizado a completed.`);

        return res.status(200).json({
            status: "success",
            message: `Pago ${purchaseId} confirmado exitosamente`
        });

    } catch (error) {
        console.error("❌ Error al confirmar pago Deuna:", error);
        return res.status(500).json({ error: error.message });
    }
}
