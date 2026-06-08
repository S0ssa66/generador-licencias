// api/gdrive-status.js — Vercel Serverless Function
// Comprueba si el Google Drive central está vinculado y devuelve su estado público (email y clientID).

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

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

export default async function handler(req, res) {
    // CORS headers - restringido al dominio propio
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // --- Verificación de Firebase ID Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    try {
        initFirebaseAdmin();
        await getAuth().verifyIdToken(idToken);
    } catch (err) {
        console.error('Error al verificar token en api/gdrive-status:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    try {
        const db = getFirestore();
        const configSnap = await db.collection('system').doc('gdrive_config').get();

        if (configSnap.exists) {
            const data = configSnap.data();
            return res.status(200).json({
                linked: true,
                email: data.authorizedEmail || 'masterjuego25@gmail.com',
                clientId: data.clientId || ''
            });
        } else {
            return res.status(200).json({
                linked: false,
                email: null,
                clientId: ''
            });
        }

    } catch (error) {
        console.error('❌ Error en gdrive-status:', error);
        return res.status(500).json({
            error: 'Error interno al verificar estado de Google Drive',
            details: error.message
        });
    }
}
