// server-handlers/activate-pro.js — shared handler for the Hobby dispatcher
// Verifica el pago de PayPal y activa el Plan Pro en Firestore

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

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const activateProRateWindows = new Map();

export function resetActivateProRateLimit() {
    activateProRateWindows.clear();
}

export function checkActivateProRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = activateProRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        activateProRateWindows.set(ip, { start: now, count: 1 });
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
async function getPayPalAccessToken(isSandbox) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
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
async function verifyPayPalOrder(orderId, isSandbox) {
    const accessToken = await getPayPalAccessToken(isSandbox);
    const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    const response = await fetch(`${baseUrl}/v2/checkout/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('No se pudo verificar el order de PayPal');
    return await response.json();
}

// Verificar la suscripción con la API de PayPal
async function verifyPayPalSubscription(subscriptionId, isSandbox) {
    const accessToken = await getPayPalAccessToken(isSandbox);
    const baseUrl = isSandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com';
    const response = await fetch(`${baseUrl}/v1/billing/subscriptions/${subscriptionId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) throw new Error('No se pudo verificar la suscripción de PayPal');
    return await response.json();
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

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkActivateProRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de activación. Por favor espera unos minutos.' });
    }

    const { orderId, subscriptionId, uid, email } = req.body;

    if (!orderId && !subscriptionId) {
        return res.status(400).json({ error: 'Faltan parámetros: orderId o subscriptionId son requeridos' });
    }
    if (!uid) {
        return res.status(400).json({ error: 'Falta el parámetro uid' });
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

    // Determinar modo Sandbox
    const clientId = process.env.PAYPAL_CLIENT_ID || '';
    const isSandbox = process.env.PAYPAL_MODE === 'sandbox' || clientId.startsWith('sb-') || clientId.includes('sandbox');

    try {
        const isMock = (orderId && orderId.startsWith('PAYPAL-SUB-MOCK-')) || 
                       (subscriptionId && subscriptionId.startsWith('PAYPAL-SUB-MOCK-'));

        let planToActivate = req.body.plan || 'pro';
        let payerEmail = email || '';
        let transactionId = orderId || subscriptionId;

        if (isMock) {
            const ADMIN_UID = 'paXbnNbHMMPC31X3hf0oTUx4bbr2';
            const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
            if (isProd && uid !== ADMIN_UID) {
                return res.status(403).json({ error: 'La simulación no está permitida en producción para este usuario.' });
            }
            console.log(`[+] Simulando pago de PayPal en producción para plan ${planToActivate} del usuario ${uid}`);
        } else {
            // Inicializar Firebase Admin
            initFirebaseAdmin();
            const db = getFirestore();

            if (subscriptionId) {
                // 1. Verificar la suscripción con PayPal
                const sub = await verifyPayPalSubscription(subscriptionId, isSandbox);

                if (sub.status !== 'ACTIVE' && sub.status !== 'APPROVED') {
                    return res.status(400).json({ error: `La suscripción no está activa. Estado: ${sub.status}` });
                }

                const paypalPlanId = sub.plan_id;
                payerEmail = sub.subscriber?.email_address || email || '';

                // Obtener IDs de plan del administrador
                const ADMIN_UID = 'paXbnNbHMMPC31X3hf0oTUx4bbr2';
                const adminRef = db.collection('users').doc(ADMIN_UID);
                const [adminDoc, adminPrivateDoc] = await Promise.all([
                    adminRef.collection('config').doc('producer').get(),
                    adminRef.collection('private_config').doc('producer').get()
                ]);
                const adminConfig = {
                    ...(adminDoc.exists ? adminDoc.data() : {}),
                    ...(adminPrivateDoc.exists ? adminPrivateDoc.data() : {})
                };

                if (paypalPlanId === adminConfig.paypalPlanIdElite) {
                    planToActivate = 'elite';
                } else if (paypalPlanId === adminConfig.paypalPlanIdPro) {
                    planToActivate = 'pro';
                } else if (paypalPlanId === adminConfig.paypalPlanIdCreator) {
                    planToActivate = 'creator';
                } else if (paypalPlanId === adminConfig.paypalPlanIdProArtist) {
                    planToActivate = 'pro_artist';
                } else {
                    planToActivate = req.body.plan || 'pro';
                }
            } else {
                // 1. Verificar el pago con PayPal (Legacy Order Flow)
                const order = await verifyPayPalOrder(orderId, isSandbox);

                if (order.status !== 'COMPLETED') {
                    return res.status(400).json({ error: `El pago no está completado. Estado: ${order.status}` });
                }

                const amount = parseFloat(order.purchase_units?.[0]?.amount?.value || 0);
                if (amount >= 29.00) {
                    planToActivate = 'elite';
                } else if (amount < 9.00) {
                    return res.status(400).json({ error: `Monto inválido: $${amount}` });
                }
                payerEmail = email || order.payer?.email_address || '';
            }
        }

        // Calcular fecha de expiración (30 días desde hoy)
        const activationDate = new Date();
        const expirationDate = new Date(activationDate);
        expirationDate.setDate(expirationDate.getDate() + 30);

        // 2. Actualizar Firestore
        initFirebaseAdmin();
        const db = getFirestore();

        // Campos compartidos entre config/producer y raíz del usuario
        const sharedUpdates = {
            plan: planToActivate,
            planStatus: 'active',
            planActivatedAt: activationDate.toISOString(),
            planExpirationDate: expirationDate.toISOString(),
            expirationPro: expirationDate.toISOString(),
            planPayerEmail: payerEmail,
            // Guardar subscriptionId para que el webhook identifique al usuario
            ...(subscriptionId && { planPayPalSubscriptionId: subscriptionId }),
            ...(orderId && { planPayPalOrderId: orderId }),
        };

        // Actualizar el documento del usuario con el plan Pro o Elite
        const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
        await configRef.set(sharedUpdates, { merge: true });

        // También guardar en el documento raíz del usuario para fácil consulta
        const userRef = db.collection('users').doc(uid);
        await userRef.set(sharedUpdates, { merge: true });

        console.log(`✅ Plan ${planToActivate} activado para uid: ${uid}, email: ${payerEmail}, transaction: ${transactionId}`);

        return res.status(200).json({
            success: true,
            plan: planToActivate,
            message: `¡Suscripción ${planToActivate.toUpperCase()} activada exitosamente!`
        });

    } catch (error) {
        console.error('❌ Error al activar Plan Pro:', error);
        return res.status(500).json({
            error: 'Error interno del servidor al activar el Plan Pro.'
        });
    }
}
