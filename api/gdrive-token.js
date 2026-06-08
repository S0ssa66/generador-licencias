// api/gdrive-token.js — Vercel Serverless Function
// Genera un token de acceso temporal de Google Drive usando el Refresh Token almacenado en Firestore.
// Este token se entrega de forma segura al navegador del usuario para realizar subidas directas.

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
        // Validar token (cualquier usuario registrado y logueado en la plataforma puede obtener el token de subida)
        await getAuth().verifyIdToken(idToken);
    } catch (err) {
        console.error('Error al verificar token en api/gdrive-token:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    try {
        // 1. Obtener credenciales de Firestore
        const db = getFirestore();
        const configSnap = await db.collection('system').doc('gdrive_config').get();

        if (!configSnap.exists) {
            return res.status(400).json({ error: 'El Google Drive central de la plataforma no ha sido vinculado por el administrador.' });
        }

        const { clientId, clientSecret, refreshToken } = configSnap.data();

        if (!clientId || !clientSecret || !refreshToken) {
            return res.status(400).json({ error: 'Configuración incompleta de Google Drive central en la base de datos.' });
        }

        // 2. Pedir un nuevo token de acceso a la API de Google usando el refresh token
        const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                refresh_token: refreshToken,
                grant_type: 'refresh_token'
            })
        });

        if (!refreshResponse.ok) {
            const errData = await refreshResponse.text();
            throw new Error(`Google token refresh error: ${errData}`);
        }

        const tokenData = await refreshResponse.json();
        const accessToken = tokenData.access_token;
        const expiresIn = tokenData.expires_in || 3600;

        console.log('☁️ Token de acceso de Google Drive central renovado con éxito');

        return res.status(200).json({
            success: true,
            accessToken: accessToken,
            expiresIn: expiresIn
        });

    } catch (error) {
        console.error('❌ Error en gdrive-token:', error);
        return res.status(500).json({
            error: 'Error interno al generar el token de Google Drive',
            details: error.message
        });
    }
}
