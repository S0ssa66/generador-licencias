// api/proxy-audio.js — Vercel Serverless Function (Node.js)
// Transmite de forma segura y controlada los archivos de Google Drive central.
// Soporta firmas digitales de descarga, verificación de usuario productor y streaming público de previews.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';
import { isTrustedBeatssOrigin } from './_cors-origin.js';
import { refreshDriveAccessToken } from './_gdrive-storage.js';
import { buildInlineContentDisposition, buildPurchasedAudioFilename } from '../server-handlers/audio-download-filename.js';

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return null;
    return isTrustedBeatssOrigin(origin) ? origin : null;
}
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
if (!SIGNING_SECRET) {
    console.error('FATAL: La variable de entorno DOWNLOAD_SIGNING_KEY no está configurada.');
}

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
function verifySignature(fileId, expires, signature, paymentId, fileType) {
    if (!expires || !signature) return '';
    const now = Math.floor(Date.now() / 1000);
    if (now > parseInt(expires, 10)) return ''; // Expirado

    // Intentar firma reforzada con paymentId y fileType
    const dataToSignWithAll = `${fileId}:${expires}:${paymentId || ''}:${fileType || ''}`;
    const expectedSignatureWithAll = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSignWithAll).digest('hex');
    try {
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignatureWithAll))) {
            return 'bound';
        }
    } catch (e) {}

    // Intentar firma antigua por retrocompatibilidad
    const dataToSign = `${fileId}:${expires}`;
    const expectedSignature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature)) ? 'legacy' : '';
    } catch (e) {
        return '';
    }
}

// Obtener token central de Google Drive
async function getCentralGdriveToken() {
    initFirebaseAdmin();
    const db = getFirestore();
    const { accessToken } = await refreshDriveAccessToken(db);
    return accessToken;
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 120;
const proxyRateWindows = new Map();

export function resetProxyRateLimit() {
    proxyRateWindows.clear();
}

export function checkProxyRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = proxyRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        proxyRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getSanitizedClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export default async function handler(req, res) {
    // CORS - restringido al dominio propio
    const corsOrigin = getCorsOrigin(req);
    res.setHeader('Vary', 'Origin');
    if (corsOrigin) res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length, Content-Range, Content-Type');

    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkProxyRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de streaming o descarga. Por favor espera unos minutos.' });
    }

    if (!SIGNING_SECRET) return res.status(503).json({ error: 'Servicio de audio no configurado.' });

    const fileId = req.query.id;
    const expires = req.query.expires;
    const signature = req.query.signature;
    const paymentId = req.query.paymentId;
    const fileType = req.query.fileType;

    if (!fileId || typeof fileId !== 'string' || !/^[A-Za-z0-9_-]{5,128}$/.test(fileId)) {
        return res.status(400).json({ error: 'Falta o es inválido el ID del archivo.' });
    }

    let isAuthorized = false;
    let purchasedDownloadContext = null;

    // 1. Validar firma digital de descarga (Compradores)
    const signatureScope = verifySignature(fileId, expires, signature, paymentId, fileType);
    if (signatureScope) {
        // Registrar descarga en Firestore si la firma está ligada a un pago
        if (paymentId && /^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) {
            try {
                initFirebaseAdmin();
                const db = getFirestore();

                const paymentSnapshot = await db.collection('payments').doc(paymentId).get();
                const payment = paymentSnapshot.exists ? paymentSnapshot.data() || {} : null;

                if (paymentSnapshot.exists) {
                    const terminalRevokedStatuses = ['refunded', 'disputed', 'chargeback', 'cancelled', 'cancelado', 'revoked'];
                    if (terminalRevokedStatuses.includes(String(payment?.status || '').toLowerCase()) || payment?.accessRevoked === true) {
                        return res.status(403).json({ error: 'El acceso a este archivo ha sido revocado debido a la cancelación o reembolso de la compra.' });
                    }
                }

                let producerName = '';
                if (payment?.producerId && /^[A-Za-z0-9_-]{1,160}$/.test(payment.producerId)) {
                    const producerSnapshot = await db.collection('users').doc(payment.producerId).collection('config').doc('producer').get();
                    const producer = producerSnapshot.exists ? producerSnapshot.data() || {} : {};
                    producerName = producer.aka || producer.displayName || producer.name || '';
                }
                if (payment) {
                    purchasedDownloadContext = {
                        beatName: payment.beatName || 'Instrumental',
                        producerName: producerName || 'BeatSS',
                        // En firmas antiguas el tipo no estaba ligado al HMAC;
                        // no usamos ese parámetro manipulable para nombrar.
                        fileType: signatureScope === 'bound' ? fileType : ''
                    };
                }
                
                await db.collection('payments').doc(paymentId).collection('downloads').add({
                    timestamp: new Date().toISOString(),
                    ip: clientIp,
                    fileType: fileType || 'audio'
                });
                console.log(`Download logged for payment ${paymentId}: ${fileType || 'audio'} from IP ${clientIp}`);
            } catch (dbErr) {
                console.error('Error logging download to Firestore:', dbErr.message);
            }
        }
        isAuthorized = true;
    }

    // 2. Validar si es el productor propietario o administrador (Autenticado)
    if (!isAuthorized) {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const idToken = authHeader.split('Bearer ')[1];
            try {
                initFirebaseAdmin();
                const email = (decodedToken.email || '').toLowerCase();
                const SOSSA_ADMIN_EMAILS = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'];
                if (SOSSA_ADMIN_EMAILS.includes(email)) {
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
                            if (privateData.mp3?.includes(fileId) || privateData.wav?.includes(fileId) || privateData.stems?.includes(fileId) || privateData.preview?.includes(fileId)) {
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

    // 4. Si aún no está autorizado, verificar en Firestore si es un archivo de
    // preview público o Artwork. `preview` es el campo vigente; `mp3` se
    // conserva para previews publicados por versiones anteriores.
    if (!isAuthorized) {
        try {
            initFirebaseAdmin();
            const db = getFirestore();

            // Buscar usando consultas eficientes por índice de rango/prefijo en lugar de escanear toda la colección
            const patterns = [
                `https://drive.google.com/file/d/${fileId}`,
                `https://drive.google.com/open?id=${fileId}`,
                `https://docs.google.com/uc?id=${fileId}`,
                `/api/proxy-audio?id=${fileId}`,
                `api/proxy-audio?id=${fileId}`,
                `https://beatss.app/api/proxy-audio?id=${fileId}`,
                `https://www.beatss.app/api/proxy-audio?id=${fileId}`,
                `https://generador-licencias.vercel.app/api/proxy-audio?id=${fileId}`,
                fileId
            ];

            const queries = [];
            for (const pattern of patterns) {
                queries.push(
                    db.collectionGroup('beats')
                        .where('preview', '>=', pattern)
                        .where('preview', '<=', pattern + '\uf8ff')
                        .get()
                );
                queries.push(
                    db.collectionGroup('beats')
                        .where('mp3', '>=', pattern)
                        .where('mp3', '<=', pattern + '\uf8ff')
                        .get()
                );
                queries.push(
                    db.collectionGroup('beats')
                        .where('artwork', '>=', pattern)
                        .where('artwork', '<=', pattern + '\uf8ff')
                        .get()
                );
            }

            const results = await Promise.all(queries);
            for (const snap of results) {
                if (!snap.empty) {
                    isAuthorized = true;
                    break;
                }
            }
        } catch (dbErr) {
            console.warn('Fallo en búsqueda indexada de preview (posible índice de Collection Group faltante):', dbErr.message);
        }

        // Fallback de escaneo si no se ha autorizado mediante la búsqueda por rango indexada.
        // Algunas migraciones guardaron el preview dedicado en `private/files`
        // para que el navegador nunca pudiera enumerar las entregas. El proxy
        // puede convertir únicamente ese campo explícito en reproducible; los
        // archivos `mp3`, `wav` y `stems` permanecen fuera de esta ruta pública.
        if (!isAuthorized) {
            try {
                const db = getFirestore();
                const beatsSnap = await db.collectionGroup('beats').limit(30).get();
                for (const docSnap of beatsSnap.docs) {
                    const beatData = docSnap.data();
                    if (beatData.preview?.includes(fileId) || beatData.mp3?.includes(fileId) || beatData.artwork?.includes(fileId)) {
                        isAuthorized = true;
                        break;
                    }
                    const privateFilesSnap = await docSnap.ref.collection('private').doc('files').get();
                    const privatePreviewData = privateFilesSnap.exists ? privateFilesSnap.data() : null;
                    if (privatePreviewData?.preview?.includes(fileId)) {
                        isAuthorized = true;
                        break;
                    }
                }
            } catch (fallbackErr) {
                console.error('Error en fallback de escaneo de preview:', fallbackErr.message);
            }
        }
    }

    // Si no está autorizado previamente, denegamos el acceso antes de contactar al almacenamiento
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

        const contentType = response.headers.get('content-type') || '';
        const contentLength = response.headers.get('content-length');
        const contentRange = response.headers.get('content-range');
        const acceptRanges = response.headers.get('accept-ranges');
        const upstreamDisposition = response.headers.get('content-disposition') || '';

        if (contentType) res.setHeader('Content-Type', contentType);
        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);
        if (acceptRanges) res.setHeader('Accept-Ranges', acceptRanges);
        if (purchasedDownloadContext) {
            const filename = buildPurchasedAudioFilename({
                ...purchasedDownloadContext,
                contentType,
                upstreamDisposition
            });
            // `inline` conserva el reproductor móvil; el nombre indicado es el
            // que Safari/Chrome usan al guardar el archivo.
            res.setHeader('Content-Disposition', buildInlineContentDisposition(filename));
        }
        
        res.setHeader('Cache-Control', signature || req.headers.authorization
            ? 'private, no-store, max-age=0'
            : 'public, max-age=3600, stale-while-revalidate=86400');

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
