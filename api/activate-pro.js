// api/activate-pro.js — Vercel Serverless Function
// Verifica el pago de PayPal y activa el Plan Pro en Firestore

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

// Obtener token de acceso de PayPal
async function getPayPalAccessToken() {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');

    const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) throw new Error('No se pudo obtener el token de PayPal');
    const data = await response.json();
    return data.access_token;
}

// Verificar el order con la API de PayPal
async function verifyPayPalOrder(orderId) {
    const accessToken = await getPayPalAccessToken();
    const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('No se pudo verificar el order de PayPal');
    return await response.json();
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

    const { orderId, uid, email } = req.body;

    if (!orderId || !uid) {
        return res.status(400).json({ error: 'Faltan parámetros: orderId y uid son obligatorios' });
    }

    // Validar formato de UID
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
    try {
        initFirebaseAdmin();
        const decodedToken = await getAuth().verifyIdToken(idToken);
        verifiedUid = decodedToken.uid;
    } catch (err) {
        console.error('Error al verificar token en api/activate-pro:', err);
        return res.status(401).json({ error: 'No autorizado: token inválido o expirado' });
    }

    if (uid !== verifiedUid) {
        return res.status(403).json({ error: 'Acceso prohibido: el token no corresponde al usuario solicitado' });
    }
    // ------------------------------------------------

    try {
        // 1. Verificar el pago con PayPal
        const order = await verifyPayPalOrder(orderId);

        if (order.status !== 'COMPLETED') {
            return res.status(400).json({ error: `El pago no está completado. Estado: ${order.status}` });
        }

        const amount = parseFloat(order.purchase_units?.[0]?.amount?.value || 0);
        let planToActivate = 'pro';
        if (amount >= 29.90) {
            planToActivate = 'elite';
        } else if (amount < 9.90) {
            return res.status(400).json({ error: `Monto inválido: $${amount}` });
        }

        // 2. Inicializar Firebase Admin y actualizar Firestore
        initFirebaseAdmin();
        const db = getFirestore();

        // Actualizar el documento del usuario con el plan Pro o Elite
        const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
        await configRef.set({
            plan: planToActivate,
            planActivatedAt: new Date().toISOString(),
            planPayPalOrderId: orderId,
            planPayerEmail: email || order.payer?.email_address || '',
        }, { merge: true });

        // También guardar en el documento raíz del usuario para fácil consulta
        const userRef = db.collection('users').doc(uid);
        await userRef.set({
            plan: planToActivate,
            planActivatedAt: new Date().toISOString(),
        }, { merge: true });

        console.log(`✅ Plan ${planToActivate} activado para uid: ${uid}, email: ${email}, order: ${orderId}`);

        return res.status(200).json({
            success: true,
            plan: planToActivate,
            message: `¡Plan ${planToActivate} activado exitosamente!`
        });

    } catch (error) {
        console.error('❌ Error al activar Plan Pro:', error);
        return res.status(500).json({
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}
