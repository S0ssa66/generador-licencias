// api/redeem-vip.js — Vercel Serverless Function
// Valida un código VIP en Firestore y actualiza el plan del usuario usando Firebase Admin

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

// Dominio permitido (ajustar a tu dominio de Vercel en producción)
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

    const { codeId, uid } = req.body;

    if (!codeId || !uid || typeof codeId !== 'string' || typeof uid !== 'string') {
        return res.status(400).json({ error: 'Faltan parámetros: codeId y uid son obligatorios y deben ser strings' });
    }

    // Validar formato de UID (Firebase UIDs son alfanuméricos de 28 chars)
    if (!/^[a-zA-Z0-9]{20,36}$/.test(uid)) {
        return res.status(400).json({ error: 'UID inválido' });
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
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}
