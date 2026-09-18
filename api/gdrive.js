import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from './_cors-origin.js';
import {
    ensureProducerDriveFolder,
    getDriveRuntimeConfig,
    getStoredDriveConfig,
    refreshDriveAccessToken,
    validateDriveUpload
} from './_gdrive-storage.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const driveRateWindows = new Map();

export function resetDriveUploadRateLimit() {
    driveRateWindows.clear();
}

export function checkDriveUploadRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = driveRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        driveRateWindows.set(ip, { start: now, count: 1 });
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

function resolveAppOrigin(req) {
    const origin = req?.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) return origin;
    return 'https://beatss.app';
}

function setCorsHeaders(req, res, methods = 'GET, OPTIONS', headers = 'Content-Type, Authorization') {
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
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

function isPlatformAdmin(decoded = {}) {
    const configured = String(process.env.BEATSS_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    const email = String(decoded.email || '').toLowerCase();
    const SOSSA_ADMIN_EMAILS = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'];
    return decoded.admin === true || SOSSA_ADMIN_EMAILS.includes(email) || configured.includes(email);
}

function serializeEmailLog(doc) {
    const data = doc.data() || {};
    const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : (typeof data.createdAt === 'string' ? data.createdAt : '');
    return {
        id: doc.id,
        emailjsId: String(data.emailjsId || ''),
        createdAt,
        status: data.status === 'failed' ? 'failed' : 'sent',
        category: String(data.category || 'other').slice(0, 40),
        recipientEmail: String(data.recipientEmail || '').slice(0, 180),
        recipientName: String(data.recipientName || '').slice(0, 120),
        subject: String(data.subject || '').slice(0, 240),
        beatName: String(data.beatName || '').slice(0, 160),
        reference: String(data.reference || '').slice(0, 120),
        paymentId: String(data.paymentId || '').slice(0, 120),
        licenseType: String(data.licenseType || '').slice(0, 100),
        provider: String(data.provider || 'EmailJS').slice(0, 40),
        serviceId: String(data.serviceId || '').slice(0, 100),
        templateId: String(data.templateId || '').slice(0, 100),
        errorMessage: String(data.errorMessage || '').slice(0, 300),
        resources: Array.isArray(data.resources) ? data.resources.slice(0, 20) : []
    };
}

async function importEmailHistory(req, res) {
    // Importación histórica de EmailJS: la variable se lee únicamente en runtime.
    const accessToken = process.env.EMAILJS_PRIVATE_KEY;
    const publicKey = process.env.EMAILJS_PUBLIC_KEY;
    if (!accessToken || !publicKey) {
        return res.status(503).json({ error: 'La importación de EmailJS no está configurada todavía.' });
    }

    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Sesión requerida.' });
    }

    try {
        initFirebaseAdmin();
        const decoded = await getAuth().verifyIdToken(authHeader.slice(7));
        const db = getFirestore();
        const base = db.collection('users').doc(decoded.uid).collection('email_logs');
        const existing = await base.get();
        const existingIds = new Set(existing.docs.map((doc) => doc.data().emailjsId).filter(Boolean));
        const rows = [];
        let page = 1;
        let last = false;
        let pagesFetched = 0;

        while (!last && page <= 20) {
            const emailjsUrl = new URL('https://api.emailjs.com/api/v1.1/history');
            emailjsUrl.searchParams.set('user_id', publicKey);
            emailjsUrl.searchParams.set('accessToken', accessToken);
            emailjsUrl.searchParams.set('page', String(page));
            emailjsUrl.searchParams.set('count', '100');
            const response = await fetch(emailjsUrl);
            if (!response.ok) throw new Error(`EmailJS respondió ${response.status}.`);
            const data = await response.json();
            rows.push(...(data.rows || []));
            pagesFetched += 1;
            last = data.is_last_page !== false;
            page += 1;
        }

        const pending = rows.filter((row) => row.id && !existingIds.has(row.id));
        console.info('[BEATSS] EmailJS import summary', {
            pagesFetched,
            existingRecords: existingIds.size,
            emailjsRows: rows.length,
            newRecords: pending.length,
            publicKeyConfigured: Boolean(process.env.EMAILJS_PUBLIC_KEY)
        });
        for (let i = 0; i < pending.length; i += 400) {
            const batch = db.batch();
            pending.slice(i, i + 400).forEach((row) => {
                let params = {};
                try {
                    params = typeof row.template_params === 'string'
                        ? JSON.parse(row.template_params)
                        : (row.template_params || {});
                } catch (_) {}
                const ref = base.doc();
                batch.set(ref, {
                    emailjsId: row.id,
                    createdAt: row.created_at || new Date().toISOString(),
                    status: Number(row.result) === 1 ? 'sent' : 'failed',
                    category: 'other',
                    recipientEmail: String(params.to_email || params.buyer_email || '').slice(0, 180),
                    recipientName: String(params.to_name || params.buyer_name || '').slice(0, 120),
                    subject: String(params.subject || '').slice(0, 240),
                    beatName: String(params.beat_name || '').slice(0, 160),
                    reference: String(params.reference || params.order_id || '').slice(0, 120),
                    provider: 'EmailJS (importado)',
                    serviceId: row.service_id || '',
                    templateId: row.template_id || '',
                    errorMessage: String(row.error || '').slice(0, 300),
                    resources: []
                });
            });
            await batch.commit();
        }

        // La UI también necesita una lectura autorizada del resultado. Esto
        // evita que una regla/indexación del cliente deje el contador en cero
        // aunque la importación y Firestore hayan terminado correctamente.
        const finalSnapshot = await base.orderBy('createdAt', 'desc').limit(200).get();
        const records = finalSnapshot.docs.map(serializeEmailLog);
        return res.status(200).json({ imported: pending.length, total: rows.length, pages: pagesFetched, records });
    } catch (error) {
        console.error('[BEATSS] Error importando EmailJS:', error);
        return res.status(500).json({ error: 'No se pudo importar el historial de EmailJS.' });
    }
}

export default async function handler(req, res) {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    
    const isStatus = pathname.includes('/gdrive-status');
    const isOauthClient = pathname.includes('/gdrive-oauth-client');
    const isUploadSession = pathname.includes('/gdrive-upload-session');
    const isSetup = pathname.includes('/gdrive-setup');
    const isEmailHistoryImport = pathname.includes('/gdrive-import-email-history');

    if (isEmailHistoryImport) {
        setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') return res.status(204).end();
        if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });
        return importEmailHistory(req, res);
    }

    if (isStatus || isOauthClient) {
        setCorsHeaders(req, res, 'GET, OPTIONS', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') return res.status(204).end();

        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Método no permitido' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        
        let decodedToken;
        try {
            initFirebaseAdmin();
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (err) {
            console.error('Error al verificar token en api/gdrive-status:', err);
            return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
        }

        if (!isPlatformAdmin(decodedToken)) {
            return res.status(403).json({ error: 'Solo el administrador puede consultar la vinculación central.' });
        }

        try {
            const db = getFirestore();
            const stored = await getStoredDriveConfig(db);
            const config = getDriveRuntimeConfig(stored);
            const linked = Boolean(config.refreshToken && config.authorizedEmail === config.allowedEmail);
            if (isOauthClient) {
                if (!config.clientId || !config.clientSecret) {
                    return res.status(503).json({ error: 'Google OAuth no está disponible.' });
                }
                res.setHeader('Cache-Control', 'no-store');
                return res.status(200).json({
                    clientId: config.clientId,
                    expectedEmail: config.allowedEmail
                });
            }
            return res.status(200).json({
                linked,
                email: linked ? config.authorizedEmail : null,
                expectedEmail: config.allowedEmail,
                oauthReady: Boolean(config.clientId && config.clientSecret)
            });
        } catch (error) {
            console.error('❌ Error en gdrive-status:', error);
            return res.status(500).json({
                error: 'Error interno al verificar estado de Google Drive'
            });
        }
    } 
    
    else if (isSetup) {
        setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization, X-Requested-With');

        if (req.method === 'OPTIONS') return res.status(204).end();

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }

        if (String(req.headers['x-requested-with'] || '').toLowerCase() !== 'xmlhttprequest') {
            return res.status(400).json({ error: 'Solicitud de autorización no válida.' });
        }

        const code = String(req.body?.code || '').trim();
        if (!code || code.length > 4096) {
            return res.status(400).json({ error: 'Google no devolvió un código de autorización válido.' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        
        let decodedToken;
        try {
            initFirebaseAdmin();
            decodedToken = await getAuth().verifyIdToken(idToken);
        } catch (err) {
            console.error('Error al verificar token en api/gdrive-setup:', err);
            return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
        }

        if (!isPlatformAdmin(decodedToken)) {
            return res.status(403).json({ error: 'Acceso prohibido: solo el administrador de la plataforma puede vincular el Google Drive central.' });
        }

        try {
            const db = getFirestore();
            const existingData = await getStoredDriveConfig(db);
            const runtime = getDriveRuntimeConfig(existingData);
            if (!runtime.clientId || !runtime.clientSecret) {
                return res.status(503).json({
                    error: 'Falta configurar GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET en el servidor.'
                });
            }

            const requestOrigin = resolveAppOrigin(req);
            const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    code: code,
                    client_id: runtime.clientId,
                    client_secret: runtime.clientSecret,
                    redirect_uri: requestOrigin,
                    grant_type: 'authorization_code'
                })
            });

            if (!tokenResponse.ok) {
                throw new Error(`Google rechazó el intercambio de autorización (${tokenResponse.status}).`);
            }

            const tokenData = await tokenResponse.json();
            const { access_token, refresh_token } = tokenData;
            const finalRefreshToken = refresh_token || runtime.refreshToken;
            if (!access_token || !finalRefreshToken) throw new Error('Google no devolvió la autorización persistente necesaria.');

            const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${access_token}` }
            });
            if (!userinfoResponse.ok) throw new Error('No se pudo verificar la cuenta autorizada con Google.');
            const userinfo = await userinfoResponse.json();
            const authorizedEmail = String(userinfo.email || '').trim().toLowerCase();
            if (!authorizedEmail || authorizedEmail !== runtime.allowedEmail) {
                return res.status(409).json({
                    error: `Selecciona exactamente la cuenta ${runtime.allowedEmail} para el almacenamiento de BEATSS.`
                });
            }

            const configRef = db.collection('system').doc('gdrive_config');
            await configRef.set({
                refreshToken: finalRefreshToken,
                authorizedEmail,
                scope: String(tokenData.scope || ''),
                updatedAt: new Date().toISOString(),
                updatedBy: decodedToken.uid
            }, { merge: true });

            await db.collection('users').doc(decodedToken.uid).collection('config').doc('producer').set({
                storageProvider: 'gdrive-central',
                pdfStorageProvider: 'firebase'
            }, { merge: true });

            return res.status(200).json({
                success: true,
                email: authorizedEmail,
                storageProvider: 'gdrive-central',
                message: `Google Drive de BEATSS quedó vinculado a ${authorizedEmail}.`
            });

        } catch (error) {
            console.error('❌ Error en gdrive-setup:', error);
            return res.status(500).json({
                error: 'Error interno al vincular Google Drive'
            });
        }
    }

    else if (isUploadSession) {
        setCorsHeaders(req, res, 'POST, OPTIONS', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') return res.status(204).end();

        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }

        const clientIp = getSanitizedClientIp(req);
        const rateCheck = checkDriveUploadRateLimit(clientIp);
        if (!rateCheck.allowed) {
            res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
            return res.status(429).json({ error: 'Demasiadas solicitudes de subida a Google Drive. Por favor espera unos minutos.' });
        }

        let uploadDescriptor;
        try {
            uploadDescriptor = validateDriveUpload(req.body || {});
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
        }
        const idToken = authHeader.split('Bearer ')[1];
        
        let userUid = '';
        let producerData = {};
        try {
            initFirebaseAdmin();
            const decodedToken = await getAuth().verifyIdToken(idToken);
            userUid = decodedToken.uid;
            const db = getFirestore();
            const producerSnap = await db.collection('users').doc(userUid).collection('config').doc('producer').get();
            if (!producerSnap.exists) {
                return res.status(403).json({ error: 'Acceso prohibido: el productor no cuenta con configuración inicial.' });
            }
            producerData = producerSnap.data();

            if (!isPlatformAdmin(decodedToken)) {
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
            const { accessToken, config } = await refreshDriveAccessToken(db);
            if (config.authorizedEmail !== config.allowedEmail) {
                return res.status(409).json({ error: 'La cuenta de almacenamiento de Google Drive no coincide con la autorizada para BEATSS.' });
            }
            const targetFolderId = await ensureProducerDriveFolder(
                accessToken,
                config,
                userUid,
                producerData.aka || producerData.name || 'Productor',
                uploadDescriptor.folder
            );

            const driveSessionResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': uploadDescriptor.contentType,
                    'X-Upload-Content-Length': String(uploadDescriptor.fileSize),
                    'Origin': req.headers.origin || 'https://beatss.app'
                },
                body: JSON.stringify({
                    name: uploadDescriptor.fileName,
                    parents: [targetFolderId],
                    appProperties: {
                        beatssProducer: userUid,
                        beatssCategory: uploadDescriptor.folder.toLowerCase()
                    }
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
                uploadUrl,
                provider: 'gdrive-central'
            });

        } catch (error) {
            console.error('❌ Error en gdrive-upload-session:', error);
            return res.status(500).json({
                error: 'No se pudo preparar la subida segura a Google Drive.'
            });
        }
    } 
    
    else {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
}
