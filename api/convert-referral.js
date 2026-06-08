// api/convert-referral.js — Vercel Serverless Function
// Valida un referido, marca la conversión y premia al referente con 30 días de Plan Pro

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

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
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
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
            planActivatedAt: new Date().toISOString()
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
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}
