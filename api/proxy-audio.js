// api/proxy-audio.js — Vercel Serverless Function (Node.js)
// Transmite de forma segura y controlada los archivos de Google Drive central.
// Soporta firmas digitales de descarga, verificación de usuario productor y streaming público de previews.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY || process.env.FIREBASE_PRIVATE_KEY || 'default_fallback_secret';

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

// Verificar la firma de descarga del comprador
function verifySignature(fileId, expires, signature) {
    if (!expires || !signature) return false;
    const now = Math.floor(Date.now() / 1000);
    if (now > parseInt(expires, 10)) return false; // Expirado
    const dataToSign = `${fileId}:${expires}`;
    const expectedSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
    } catch (e) {
        return false;
    }
}

// Obtener token central de Google Drive
async function getCentralGdriveToken() {
    initFirebaseAdmin();
    const db = getFirestore();
    const configSnap = await db.collection('system').doc('gdrive_config').get();
    if (!configSnap.exists) {
        throw new Error('Google Drive central no vinculado.');
    }
    const { clientId, clientSecret, refreshToken } = configSnap.data();
    if (!clientId || !clientSecret || !refreshToken) {
        throw new Error('Configuración de Google Drive incompleta.');
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
        const errText = await refreshResponse.text();
        throw new Error(`Google token refresh failure: ${errText}`);
    }
    const tokenData = await refreshResponse.json();
    return tokenData.access_token;
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const fileId = req.query.id;
    const expires = req.query.expires;
    const signature = req.query.signature;

    if (!fileId) {
        return res.status(400).json({ error: 'Falta el ID del archivo.' });
    }

    let isAuthorized = false;

    // 1. Validar firma digital de descarga (Compradores)
    if (verifySignature(fileId, expires, signature)) {
        isAuthorized = true;
    }

    // 2. Validar si es el productor propietario o administrador (Autenticado)
    if (!isAuthorized) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                initFirebaseAdmin();
                const decodedToken = await getAuth().verifyIdToken(idToken);
                const email = decodedToken.email || '';
                if (email.toLowerCase() === 'masterjuego25@gmail.com') {
                    isAuthorized = true;
                } else {
                    // Validar si el fileId pertenece a uno de sus beats (Búsqueda en Firestore)
                    const db = getFirestore();
                    const beatsSnap = await db.collection('users').doc(decodedToken.uid).collection('beats').get();
                    for (const docSnap of beatsSnap.docs) {
                        const beatData = docSnap.data();
                        // Comprobar si coincide con algún campo del beat
                        if (beatData.mp3?.includes(fileId) || beatData.wav?.includes(fileId) || beatData.stems?.includes(fileId) || beatData.image?.includes(fileId)) {
                            isAuthorized = true;
                            break;
                        }
                        // O de la subcolección privada
                        const privateFilesSnap = await docSnap.ref.collection('private').doc('files').get();
                        if (privateFilesSnap.exists) {
                            const privateData = privateFilesSnap.data();
                            if (privateData.wav?.includes(fileId) || privateData.stems?.includes(fileId)) {
                                isAuthorized = true;
                                break;
                            }
                        }
                    }
                }
            } catch (authErr) {
                console.warn('Fallo de autenticación de token en proxy-audio:', authErr.message);
            }
        }
    }

    // 3. Obtener token de acceso de Google Drive central en el backend
    let accessToken;
    try {
        accessToken = await getCentralGdriveToken();
    } catch (tokenErr) {
        console.error('Error al renovar token en proxy-audio:', tokenErr.message);
        return res.status(500).json({ error: 'Error de autenticación con el servicio de almacenamiento.' });
    }

    // 4. Si aún no está autorizado, verificar en Google Drive si es un archivo de preview público (MP3/Arte)
    if (!isAuthorized) {
        try {
            const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (metaRes.ok) {
                const meta = await metaRes.json();
                const name = (meta.name || '').toLowerCase();
                
                // Permitir libre streaming de previews (.mp3 de preview) y carátulas (.jpg, .png)
                // Bloquear cualquier archivo ZIP, WAV de alta calidad, o archivos sin extensión típica de preview
                const isPreviewMp3 = name.endsWith('.mp3') && !name.includes('wav') && !name.includes('zip') && !name.includes('master');
                const isImage = name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.png') || name.endsWith('.webp');
                
                if (isPreviewMp3 || isImage) {
                    isAuthorized = true;
                }
            }
        } catch (metaErr) {
            console.error('Error al recuperar metadatos del archivo:', metaErr.message);
        }
    }

    if (!isAuthorized) {
        return res.status(403).json({ error: 'Acceso denegado: este archivo es privado y requiere autenticación o una firma de descarga válida.' });
    }

    // 5. Descargar y transmitir el archivo desde Google Drive a través de streaming
    const targetUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    
    try {
        const driveHeaders = {
            'Authorization': `Bearer ${accessToken}`
        };
        const rangeHeader = req.headers.range || req.headers.Range;
        if (rangeHeader) {
            driveHeaders['Range'] = rangeHeader;
        }

        const response = await fetch(targetUrl, {
            headers: driveHeaders
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: 'Error al recuperar el archivo de Google Drive.' });
        }

        // Reenviar cabeceras clave para streaming y reproducción en iOS/Safari
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');
        const acceptRanges = response.headers.get('accept-ranges');

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
        
        res.setHeader('Cache-Control', 'public, max-age=86400');

        // Streaming del cuerpo de respuesta
        const reader = response.body.getReader();
        const stream = new ReadableStream({
            async start(controller) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                }
                controller.close();
            }
        });
        
        const responseData = new Response(stream);
        const arrayBuffer = await responseData.arrayBuffer();
        return res.status(response.status).send(Buffer.from(arrayBuffer));

    } catch (err) {
        console.error('Error en proxy-audio streaming:', err);
        return res.status(500).json({ error: 'Error interno en el proxy de audio.' });
    }
}
