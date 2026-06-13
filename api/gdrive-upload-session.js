// api/gdrive-upload-session.js — Vercel Serverless Function
// Inicia una sesión de subida resumible en Google Drive (Resumable Upload Session).
// Devuelve la URL de la sesión de subida al cliente, evitando exponer el token OAuth.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

// Inicializar Firebase Admin
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

// Resolver o crear carpeta en Google Drive
async function getOrCreateDriveFolder(token, folderName, parentId = null) {
    const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    if (!searchRes.ok) {
        throw new Error(`Error buscando carpeta ${folderName}: ${await searchRes.text()}`);
    }
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

    const meta = { name: folderName, mimeType: 'application/vnd.google-apps.folder', ...(parentId && { parents: [parentId] }) };
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(meta)
    });
    if (!createRes.ok) {
        throw new Error(`Error creando carpeta ${folderName}: ${await createRes.text()}`);
    }
    const folder = await createRes.json();
    if (!folder.id) throw new Error(`No se pudo crear la carpeta ${folderName} en Google Drive.`);
    return folder.id;
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { fileName, subFolder = 'Beats', contentType, producerAka } = req.body;

    if (!fileName) {
        return res.status(400).json({ error: 'Faltan parámetros obligatorios: fileName' });
    }

    // --- Verificación de Firebase ID Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    
    let userEmail = '';
    let userUid = '';
    try {
        initFirebaseAdmin();
        const decodedToken = await getAuth().verifyIdToken(idToken);
        userEmail = decodedToken.email || '';
        userUid = decodedToken.uid;

        // Si no es el administrador, validar que tenga un plan activo de pago (Pro/Elite)
        if (userEmail.toLowerCase() !== 'masterjuego25@gmail.com') {
            const db = getFirestore();
            const producerSnap = await db.collection('users').doc(userUid).collection('config').doc('producer').get();
            if (!producerSnap.exists) {
                return res.status(403).json({ error: 'Acceso prohibido: el productor no cuenta con configuración inicial.' });
            }
            const producerData = producerSnap.data();
            const plan = producerData.plan || 'inicial';
            
            // Verificar expiración del plan
            const expirationStr = producerData.expirationPro || producerData.planExpirationDate;
            const isExpired = expirationStr ? (new Date() > new Date(expirationStr)) : false;

            if ((plan !== 'pro' && plan !== 'elite') || isExpired) {
                return res.status(403).json({ error: 'Acceso prohibido: se requiere una suscripción Pro o Elite activa.' });
            }
        }
    } catch (err) {
        console.error('Error de autorización en api/gdrive-upload-session:', err);
        return res.status(401).json({ error: 'No autorizado o token de sesión inválido' });
    }

    try {
        // 1. Obtener credenciales de Google Drive de la plataforma
        const db = getFirestore();
        const configSnap = await db.collection('system').doc('gdrive_config').get();

        if (!configSnap.exists) {
            return res.status(400).json({ error: 'El Google Drive central no está vinculado por el administrador.' });
        }

        const { clientId, clientSecret, refreshToken } = configSnap.data();

        if (!clientId || !clientSecret || !refreshToken) {
            return res.status(400).json({ error: 'Configuración de Google Drive incompleta.' });
        }

        // 2. Renovar token de acceso a la API de Google
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

        // 3. Crear o resolver la estructura de carpetas en Google Drive
        // Formato: "{producerAka} Licencias" -> "{subFolder}"
        const rootFolderName = `${producerAka || 'BEATSS'} Licencias`;
        const rootFolderId = await getOrCreateDriveFolder(accessToken, rootFolderName);
        const targetFolderId = await getOrCreateDriveFolder(accessToken, subFolder, rootFolderId);

        // 4. Solicitar URL de sesión de subida resumible a Google Drive
        const driveSessionResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': contentType || 'application/octet-stream'
            },
            body: JSON.stringify({
                name: fileName,
                parents: [targetFolderId]
            })
        });

        if (!driveSessionResponse.ok) {
            const errText = await driveSessionResponse.text();
            throw new Error(`Error iniciando sesión en Google Drive API: ${errText}`);
        }

        // La URL de subida viene en el header 'Location'
        const uploadUrl = driveSessionResponse.headers.get('Location');

        if (!uploadUrl) {
            throw new Error('Google Drive API no devolvió el header Location para la subida resumible.');
        }

        return res.status(200).json({
            success: true,
            uploadUrl: uploadUrl
        });

    } catch (error) {
        console.error('❌ Error en gdrive-upload-session:', error);
        return res.status(500).json({
            error: 'Error interno al generar la sesión de subida',
            details: error.message
        });
    }
}
