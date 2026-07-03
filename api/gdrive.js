import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

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
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    
    const isStatus = pathname.includes('/gdrive-status');
    const isUploadSession = pathname.includes('/gdrive-upload-session');

    if (isStatus) {
        res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') return res.status(200).end();

        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Método no permitido' });
        }

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
    
    else if (isUploadSession) {
        res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') return res.status(200).end();

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }

        const { fileName, subFolder = 'Beats', contentType, producerAka } = req.body;

        if (!fileName) {
            return res.status(400).json({ error: 'Faltan parámetros obligatorios: fileName' });
        }

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

            if (userEmail.toLowerCase() !== 'masterjuego25@gmail.com') {
                const db = getFirestore();
                const producerSnap = await db.collection('users').doc(userUid).collection('config').doc('producer').get();
                if (!producerSnap.exists) {
                    return res.status(403).json({ error: 'Acceso prohibido: el productor no cuenta con configuración inicial.' });
                }
                const producerData = producerSnap.data();
                const plan = producerData.plan || 'inicial';
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
            const db = getFirestore();
            const configSnap = await db.collection('system').doc('gdrive_config').get();

            if (!configSnap.exists) {
                return res.status(400).json({ error: 'El Google Drive central no está vinculado por el administrador.' });
            }

            const { clientId, clientSecret, refreshToken } = configSnap.data();

            if (!clientId || !clientSecret || !refreshToken) {
                return res.status(400).json({ error: 'Configuración de Google Drive incompleta.' });
            }

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

            const rootFolderName = `${producerAka || 'BEATSS'} Licencias`;
            const rootFolderId = await getOrCreateDriveFolder(accessToken, rootFolderName);
            const targetFolderId = await getOrCreateDriveFolder(accessToken, subFolder, rootFolderId);

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
    
    else {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
}
