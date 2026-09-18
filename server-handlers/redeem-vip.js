// server-handlers/redeem-vip.js — shared handler for the Hobby dispatcher
// Valida un código VIP en Firestore y actualiza el plan del usuario usando Firebase Admin

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

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

const VIP_RATE_WINDOW_MS = 10 * 60 * 1000;
const VIP_RATE_LIMIT = 6;
const vipRateLimits = new Map();

export function checkVipRateLimit(key, now = Date.now()) {
    const entry = vipRateLimits.get(key);
    if (!entry || now >= entry.resetAt) {
        vipRateLimits.set(key, { count: 1, resetAt: now + VIP_RATE_WINDOW_MS });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (entry.count >= VIP_RATE_LIMIT) {
        const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    entry.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function resetVipRateLimit() {
    vipRateLimits.clear();
}

export default async function handler(req, res) {
    // CORS headers - restringido al dominio propio
    configureCors(req, res);

    // Preflight
    if (req.method === 'OPTIONS') return res.status(204).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const { codeId, uid } = req.body || {};

    if (!codeId || !uid || typeof codeId !== 'string' || typeof uid !== 'string') {
        return res.status(400).json({ error: 'Faltan parámetros: codeId y uid son obligatorios y deben ser strings' });
    }

    // Validar formato de UID (Firebase UIDs son alfanuméricos de 28 chars)
    if (!/^[a-zA-Z0-9]{20,36}$/.test(uid)) {
        return res.status(400).json({ error: 'UID inválido' });
    }

    // Rate limiting por IP y UID para evitar ataques de fuerza bruta sobre códigos VIP
    const headers = req.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
    const clientIp = String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded).split(',').map((s) => s.trim()).filter(Boolean).at(-1)?.slice(0, 128) || 'unknown';
    const rateKey = `${clientIp}:${uid}`;
    const rate = checkVipRateLimit(rateKey);
    if (!rate.allowed) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiados intentos de canje de códigos VIP. Por favor espera unos minutos.' });
    }

    // --- NUEVO: Verificación de Firebase ID Token ---
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUid;
    let userEmail = '';
    try {
        initFirebaseAdmin();
        const decodedToken = await getAuth().verifyIdToken(idToken);
        verifiedUid = decodedToken.uid;
        userEmail = decodedToken.email || '';
    } catch (err) {
        console.error('Error al verificar token en api/redeem-vip:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    if (uid !== verifiedUid) {
        return res.status(403).json({ error: 'Acceso prohibido: el token no corresponde al usuario solicitado' });
    }
    // ------------------------------------------------

    const upperCodeId = codeId.trim().toUpperCase();

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // 1. Obtener el código de Firestore
        const codeRef = db.collection('vip_codes').doc(upperCodeId);
        const codeSnap = await codeRef.get();

        if (!codeSnap.exists) {
            return res.status(404).json({ error: 'Código VIP no válido o inexistente' });
        }

        const codeData = codeSnap.data();
        if (!codeData.active) {
            return res.status(400).json({ error: 'Este código VIP ya ha sido desactivado' });
        }

        // 2. Obtener el config de productor del usuario
        const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
        const configSnap = await configRef.get();
        let producerConfig = configSnap.exists ? configSnap.data() : {};

        // 3. Verificar si el usuario ya canjeó el código
        if (producerConfig.redeemedCodes && producerConfig.redeemedCodes.includes(upperCodeId)) {
            return res.status(400).json({ error: 'Ya has canjeado este código VIP anteriormente' });
        }

        // 4. Calcular nueva fecha de expiración
        const durationMonths = codeData.planDurationMonths || 1;
        const planType = codeData.planType || 'pro'; // 'pro' o 'elite'
        let currentExpiration = new Date();

        if ((producerConfig.plan === 'pro' || producerConfig.plan === 'elite') && producerConfig.expirationPro) {
            const existingExp = new Date(producerConfig.expirationPro);
            if (existingExp > currentExpiration) {
                currentExpiration = existingExp;
            }
        }

        currentExpiration.setMonth(currentExpiration.getMonth() + durationMonths);
        const newExpirationString = currentExpiration.toISOString();

        // 5. Actualizar la configuración
        const redeemedCodes = producerConfig.redeemedCodes || [];
        redeemedCodes.push(upperCodeId);

        await configRef.set({
            plan: planType,
            expirationPro: newExpirationString,
            redeemedCodes: redeemedCodes
        }, { merge: true });

        // También guardar en el documento raíz del usuario para fácil consulta
        const userRef = db.collection('users').doc(uid);
        await userRef.set({
            plan: planType,
            planActivatedAt: new Date().toISOString(),
        }, { merge: true });

        // 6. Desactivar el código VIP y registrar auditoría
        await codeRef.set({
            active: false,
            redeemedByEmail: userEmail,
            redeemedByUid: uid,
            redeemedAt: new Date().toISOString()
        }, { merge: true });

        console.log(`✅ Código VIP ${upperCodeId} canjeado con éxito por uid: ${uid} (${userEmail}) → Plan: ${planType}`);

        return res.status(200).json({
            success: true,
            plan: planType,
            expirationPro: newExpirationString,
            message: `¡Código canjeado con éxito! Plan ${planType === 'elite' ? 'Elite' : 'Pro'} activado.`
        });

    } catch (error) {
        console.error('❌ Error al canjear código VIP:', error);
        return res.status(500).json({
            error: 'Error interno del servidor al canjear código VIP.'
        });
    }
}
