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
        const decodedToken = await getAuth().verifyIdToken(idToken);
        const email = decodedToken.email || '';
        const uid = decodedToken.uid;

        // Si no es el administrador, validar que tenga un plan activo de pago (Pro/Elite)
        if (email.toLowerCase() !== 'masterjuego25@gmail.com') {
            const db = getFirestore();
            const producerSnap = await db.collection('users').doc(uid).collection('config').doc('producer').get();
            if (!producerSnap.exists) {
                return res.status(403).json({ error: 'Acceso prohibido: el productor no cuenta con configuración inicial.' });
            }
            const producerData = producerSnap.data();
            const plan = producerData.plan || 'inicial';
            
            // Verificar si el plan Pro/Elite ha expirado
            const expirationStr = producerData.expirationPro || producerData.planExpirationDate;
            const isExpired = expirationStr ? (new Date() > new Date(expirationStr)) : false;

            if ((plan !== 'pro' && plan !== 'elite') || isExpired) {
                return res.status(403).json({ error: 'Acceso prohibido: se requiere una suscripción Pro o Elite activa para usar el Google Drive de la plataforma.' });
            }
        }
    } catch (err) {
        console.error('Error al verificar autorización en api/gdrive-token:', err);
        return res.status(401).json({ error: 'No autorizado o token de sesión inválido' });
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
