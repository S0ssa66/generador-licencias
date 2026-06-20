// api/payments/webhook.js — Vercel Serverless Function
// Recibe y procesa eventos de suscripciones recurrentes de PayPal

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

// ─── Firebase Admin Init ─────────────────────────────────────────────────────
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

// ─── Verificar firma del webhook de PayPal ───────────────────────────────────
async function verifyPayPalWebhookSignature(req, rawBody) {
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;
    const isProduction = process.env.PAYPAL_MODE === 'production' || process.env.PAYPAL_MODE === 'live';

    if (!webhookId) {
        if (isProduction) {
            console.error('❌ Error de seguridad: PAYPAL_WEBHOOK_ID no configurado en producción. Firma requerida.');
            return false;
        }
        console.warn('⚠️  PAYPAL_WEBHOOK_ID no configurado — omitiendo verificación de firma (modo Sandbox/Dev)');
        return true; 
    }

    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    const isSandbox = process.env.PAYPAL_MODE === 'sandbox';
    const baseUrl = isSandbox
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

    // Obtener access token
    const tokenRes = await fetch(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });
    if (!tokenRes.ok) throw new Error('No se pudo obtener token de PayPal para verificación');
    const { access_token } = await tokenRes.json();

    // Verificar firma
    const verifyRes = await fetch(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${access_token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: webhookId,
            webhook_event: JSON.parse(rawBody),
        })
    });

    if (!verifyRes.ok) return false;
    const { verification_status } = await verifyRes.json();
    return verification_status === 'SUCCESS';
}

// ─── Buscar usuario por subscriptionId ──────────────────────────────────────
async function findUserBySubscriptionId(db, subscriptionId) {
    // Buscar en la subcolección config/producer de todos los usuarios
    const snapshot = await db.collectionGroup('config')
        .where('planPayPalSubscriptionId', '==', subscriptionId)
        .limit(1)
        .get();

    if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        // El path es users/{uid}/config/producer → el uid está en ref.parent.parent.id
        const uid = doc.ref.parent.parent?.id;
        return { uid, data: doc.data() };
    }

    // Fallback: buscar en el documento raíz del usuario
    const rootSnap = await db.collection('users')
        .where('planPayPalSubscriptionId', '==', subscriptionId)
        .limit(1)
        .get();

    if (!rootSnap.empty) {
        return { uid: rootSnap.docs[0].id, data: rootSnap.docs[0].data() };
    }

    return null;
}

// ─── Actualizar plan en Firestore ────────────────────────────────────────────
async function updateUserPlan(db, uid, updates) {
    const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
    const userRef = db.collection('users').doc(uid);

    await Promise.all([
        configRef.set(updates, { merge: true }),
        userRef.set(updates, { merge: true }),
    ]);
}

// ─── Handler principal ───────────────────────────────────────────────────────
export default async function handler(req, res) {
    // Solo aceptar POST de PayPal
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    // Leer body raw (Vercel lo convierte en objeto, necesitamos el string original para la firma)
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Verificar firma de PayPal
    try {
        const isValid = await verifyPayPalWebhookSignature(req, rawBody);
        if (!isValid) {
            console.error('❌ Firma de webhook inválida');
            return res.status(401).json({ error: 'Firma inválida' });
        }
    } catch (sigError) {
        console.error('❌ Error al verificar firma:', sigError.message);
        const isProduction = process.env.PAYPAL_MODE === 'production' || process.env.PAYPAL_MODE === 'live';
        if (isProduction) {
            return res.status(401).json({ error: 'Firma inválida o error en verificación' });
        }
        // En sandbox/desarrollo permitimos continuar para facilitar las pruebas locales
    }

    const eventType = event?.event_type;
    const resource = event?.resource || {};
    const subscriptionId = resource.id || resource.billing_agreement_id;

    console.log(`📬 PayPal Webhook recibido: ${eventType} | sub: ${subscriptionId}`);

    // Responder 200 inmediatamente para evitar reenvíos de PayPal
    res.status(200).json({ received: true });

    // Procesar el evento de forma asíncrona
    try {
        initFirebaseAdmin();
        const db = getFirestore();

        if (!subscriptionId) {
            console.warn('⚠️  Evento sin subscriptionId, ignorando:', eventType);
            return;
        }

        const user = await findUserBySubscriptionId(db, subscriptionId);
        if (!user) {
            console.warn(`⚠️  No se encontró usuario para subscriptionId: ${subscriptionId}`);
            return;
        }

        const { uid } = user;
        const now = new Date();

        switch (eventType) {
            // ── Suscripción activada (primer pago) ────────────────────────
            case 'BILLING.SUBSCRIPTION.ACTIVATED': {
                const nextBillingDate = resource.billing_info?.next_billing_time
                    ? new Date(resource.billing_info.next_billing_time)
                    : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                await updateUserPlan(db, uid, {
                    planStatus: 'active',
                    planActivatedAt: now.toISOString(),
                    planExpirationDate: nextBillingDate.toISOString(),
                    expirationPro: nextBillingDate.toISOString(),
                    planLastRenewedAt: now.toISOString(),
                });
                console.log(`✅ [ACTIVATED] Plan activado para uid: ${uid} hasta ${nextBillingDate.toISOString()}`);
                break;
            }

            // ── Renovación mensual exitosa ────────────────────────────────
            case 'BILLING.SUBSCRIPTION.RENEWED':
            case 'PAYMENT.SALE.COMPLETED': {
                // Calcular nuevo vencimiento: 30 días desde hoy
                const newExpiration = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

                await updateUserPlan(db, uid, {
                    planStatus: 'active',
                    planExpirationDate: newExpiration.toISOString(),
                    expirationPro: newExpiration.toISOString(),
                    planLastRenewedAt: now.toISOString(),
                });

                // Registrar en historial de pagos
                const historyRef = db.collection('users').doc(uid)
                    .collection('subscription_history').doc();
                await historyRef.set({
                    event: eventType,
                    subscriptionId,
                    amount: resource.amount?.value || resource.amount?.total || 'N/A',
                    currency: resource.amount?.currency_code || resource.amount?.currency || 'USD',
                    renewedAt: now.toISOString(),
                    newExpiration: newExpiration.toISOString(),
                });

                console.log(`🔄 [RENEWED] Plan renovado para uid: ${uid} hasta ${newExpiration.toISOString()}`);
                break;
            }

            // ── Suscripción cancelada por el usuario ──────────────────────
            case 'BILLING.SUBSCRIPTION.CANCELLED': {
                await updateUserPlan(db, uid, {
                    planStatus: 'cancelled',
                    planCancelledAt: now.toISOString(),
                    // No cambiar el plan aún — el acceso dura hasta planExpirationDate
                });
                console.log(`🚫 [CANCELLED] Suscripción cancelada para uid: ${uid}`);
                break;
            }

            // ── Suscripción suspendida (pago fallido) ─────────────────────
            case 'BILLING.SUBSCRIPTION.SUSPENDED':
            case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
                await updateUserPlan(db, uid, {
                    plan: 'free',
                    planStatus: 'suspended',
                    planSuspendedAt: now.toISOString(),
                    planExpirationDate: now.toISOString(),
                    expirationPro: now.toISOString(),
                });
                console.log(`⚠️  [SUSPENDED] Plan degradado a free para uid: ${uid}`);
                break;
            }

            // ── Suscripción expirada ──────────────────────────────────────
            case 'BILLING.SUBSCRIPTION.EXPIRED': {
                await updateUserPlan(db, uid, {
                    plan: 'free',
                    planStatus: 'expired',
                    planExpiredAt: now.toISOString(),
                    planExpirationDate: now.toISOString(),
                    expirationPro: now.toISOString(),
                });
                console.log(`💀 [EXPIRED] Plan expirado para uid: ${uid}`);
                break;
            }

            default:
                console.log(`ℹ️  Evento no manejado: ${eventType}`);
        }
    } catch (error) {
        console.error('❌ Error procesando evento de PayPal:', error);
    }
}
