// api/convert-referral.js — Vercel Serverless Function
// Valida un referido, marca la conversión y premia al referente con 30 días de Plan Pro

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from './_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const convertReferralRateWindows = new Map();

export function resetConvertReferralRateLimit() {
    convertReferralRateWindows.clear();
}

export function checkConvertReferralRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = convertReferralRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        convertReferralRateWindows.set(ip, { start: now, count: 1 });
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
    configureCors(req, res);
    res.setHeader('Cache-Control', 'private, no-store');

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(204).end();
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkConvertReferralRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de conversión. Por favor espera unos minutos.' });
    }

    const { uid } = req.body;

    if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ error: 'El parámetro uid es obligatorio' });
    }

    // Verificar Token de Sesión de Firebase
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: falta el token de sesión' });
    }
    const idToken = authHeader.split('Bearer ')[1];
    let verifiedUid;
    try {
        initFirebaseAdmin();
        const decodedToken = await getAuth().verifyIdToken(idToken);
        verifiedUid = decodedToken.uid;
    } catch (err) {
        console.error('Error al verificar token en api/convert-referral:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    if (uid !== verifiedUid) {
        return res.status(403).json({ error: 'Acceso prohibido: el token no corresponde al usuario' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // 1. Buscar el documento de referido
        const referralRef = db.collection('referrals').doc(uid);
        const referralSnap = await referralRef.get();

        if (!referralSnap.exists) {
            return res.status(200).json({ success: false, message: 'El usuario no tiene un registro de referido asociado.' });
        }

        const referralData = referralSnap.data();
        if (referralData.converted === true) {
            return res.status(200).json({ success: false, message: 'Este referido ya fue convertido anteriormente.' });
        }

        const referrerId = referralData.referrerId;
        if (!referrerId) {
            return res.status(400).json({ error: 'Falta el ID del referente en el registro de referidos.' });
        }

        if (referrerId === uid) {
            return res.status(400).json({ error: 'Auto-referido no permitido.' });
        }

        // Verificar que el referido cuente con al menos una compra aprobada en la plataforma
        const paymentsSnap = await db.collection('payments')
            .where('buyerUid', '==', uid)
            .where('status', 'in', ['approved', 'completed', 'paid'])
            .limit(1)
            .get();

        if (paymentsSnap.empty) {
            const userSnap = await db.collection('users').doc(uid).get();
            const userEmail = userSnap.exists ? (userSnap.data()?.email || '') : '';
            let hasApprovedPayment = false;
            if (userEmail) {
                const emailPaymentSnap = await db.collection('payments')
                    .where('buyerEmail', '==', userEmail)
                    .where('status', 'in', ['approved', 'completed', 'paid'])
                    .limit(1)
                    .get();
                hasApprovedPayment = !emailPaymentSnap.empty;
            }
            if (!hasApprovedPayment) {
                return res.status(400).json({
                    success: false,
                    message: 'El referido no tiene compras aprobadas necesarias para activar la recompensa.'
                });
            }
        }

        // 2. Marcar conversión en el documento de referido
        await referralRef.update({
            converted: true,
            convertedAt: new Date().toISOString()
        });

        // 3. Obtener la configuración del referente para premiarlo
        const referrerConfigRef = db.collection('users').doc(referrerId).collection('config').doc('producer');
        const referrerConfigSnap = await referrerConfigRef.get();
        let referrerConfig = referrerConfigSnap.exists ? referrerConfigSnap.data() : {};

        // 4. Calcular nueva expiración (sumar 30 días de Plan Pro)
        const daysReward = 30;
        let currentExpiration = new Date();

        if ((referrerConfig.plan === 'pro' || referrerConfig.plan === 'elite') && referrerConfig.expirationPro) {
            const existingExp = new Date(referrerConfig.expirationPro);
            if (existingExp > currentExpiration) {
                currentExpiration = existingExp;
            }
        }

        currentExpiration.setDate(currentExpiration.getDate() + daysReward);
        const newExpirationString = currentExpiration.toISOString();

        // 5. Actualizar la configuración del referente
        await referrerConfigRef.set({
            plan: 'pro', // Sube/mantiene en Plan Pro como mínimo
            expirationPro: newExpirationString
        }, { merge: true });

        // También guardar en el documento raíz del usuario referente
        const referrerUserRef = db.collection('users').doc(referrerId);
        await referrerUserRef.set({
            plan: 'pro',
            planActivatedAt: new Date().toISOString(),
            expirationPro: newExpirationString
        }, { merge: true });

        console.log(`👥 Referido convertido con éxito. Usuario ${uid} refirió a ${referrerId}. Regalo: 30 días Pro. Nueva exp: ${newExpirationString}`);

        return res.status(200).json({
            success: true,
            message: 'Referido convertido con éxito. El referente fue premiado con 30 días Pro.',
            referrerId: referrerId,
            expirationPro: newExpirationString
        });

    } catch (error) {
        console.error('❌ Error al convertir referido:', error);
        return res.status(500).json({
            error: 'Error interno del servidor al convertir referido.'
        });
    }
}
