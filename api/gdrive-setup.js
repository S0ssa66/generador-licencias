// api/gdrive-setup.js — Vercel Serverless Function
// Intercambia el código de autorización temporal de Google por un Refresh Token y lo guarda en Firestore.

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
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { code, clientId, clientSecret } = req.body;

    if (!code || !clientId || !clientSecret) {
        return res.status(400).json({ error: 'Faltan parámetros: code, clientId y clientSecret son obligatorios' });
    }

    // --- Verificación de Firebase ID Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    let adminEmail = '';
    try {
        initFirebaseAdmin();
        const decodedToken = await getAuth().verifyIdToken(idToken);
        adminEmail = decodedToken.email || '';
    } catch (err) {
        console.error('Error al verificar token en api/gdrive-setup:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    // Solo el administrador (masterjuego25@gmail.com) puede vincular la cuenta central
    if (adminEmail.toLowerCase() !== 'masterjuego25@gmail.com') {
        return res.status(403).json({ error: 'Acceso prohibido: solo el administrador de la plataforma puede vincular el Google Drive central.' });
    }

    try {
        // 1. Intercambiar código de autorización por tokens en la API de Google
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code: code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: 'postmessage', // Requerido por Google para flujos GIS
                grant_type: 'authorization_code'
            })
        });

        if (!tokenResponse.ok) {
            const errData = await tokenResponse.text();
            throw new Error(`Google token exchange error: ${errData}`);
        }

        const tokenData = await tokenResponse.json();
        const { access_token, refresh_token } = tokenData;

        if (!refresh_token) {
            throw new Error('Google no devolvió un refresh_token. Si ya vinculaste la cuenta, primero desvincúlala en los accesos de Google para que te vuelva a dar el consentimiento offline.');
        }

        // 2. Obtener la dirección de correo electrónico del Drive vinculado
        const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        let authorizedEmail = 'masterjuego25@gmail.com'; // Fallback por defecto si falla
        if (userinfoResponse.ok) {
            const userinfo = await userinfoResponse.json();
            authorizedEmail = userinfo.email || authorizedEmail;
        }

        // 3. Guardar credenciales de Google Drive de la plataforma en Firestore
        const db = getFirestore();
        const configRef = db.collection('system').doc('gdrive_config');
        
        await configRef.set({
            clientId: clientId,
            clientSecret: clientSecret,
            refreshToken: refresh_token,
            authorizedEmail: authorizedEmail,
            updatedAt: new Date().toISOString(),
            updatedBy: adminEmail
        });

        console.log(`✅ Google Drive Central vinculado exitosamente a: ${authorizedEmail}`);

        return res.status(200).json({
            success: true,
            email: authorizedEmail,
            message: `¡Google Drive de la plataforma vinculado exitosamente a ${authorizedEmail}!`
        });

    } catch (error) {
        console.error('❌ Error en gdrive-setup:', error);
        return res.status(500).json({
            error: 'Error interno al vincular Google Drive',
            details: error.message
        });
    }
}
