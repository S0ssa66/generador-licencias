import Stripe from 'stripe';
import { getStripeFirebase, fulfillBeatPurchase } from '../../_fulfill-beat-purchase.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
    if (Buffer.isBuffer(req.body)) return req.body;
    if (typeof req.body === 'string') return Buffer.from(req.body);
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks);
}

export default async function handler(req, res) {
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Método no permitido.' });
    }
    if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) return res.status(503).json({ error: 'Stripe no está configurado en el servidor.' });
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const event = stripe.webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
        if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type)) return res.status(200).json({ received: true });
        const session = event.data.object;
        if (session.payment_status !== 'paid') return res.status(200).json({ received: true, pending: true });
        const db = getStripeFirebase();
        const requestId = session.metadata?.requestId || session.client_reference_id;
        if (!requestId) return res.status(400).json({ error: 'Stripe session sin referencia interna.' });
        const checkoutRef = db.collection('stripe_checkouts').doc(requestId);
        const checkoutSnap = await checkoutRef.get();
        if (!checkoutSnap.exists) return res.status(404).json({ error: 'No se encontró la orden interna de Stripe.' });
        const checkout = checkoutSnap.data();
        if (checkout.status === 'fulfilled') return res.status(200).json({ received: true, alreadyFulfilled: true });
        const result = await fulfillBeatPurchase({
            ...checkout,
            reference: session.id,
            method: 'stripe',
            appOrigin: process.env.APP_ORIGIN || 'https://beatss.app',
            idempotencyKey: session.id,
            providerReference: session.id,
            paymentIntentId: String(session.payment_intent || ''),
            invoiceRequested: checkout.sriInvoiceRequested === true,
            providerLivemode: event.livemode === true && session.livemode === true
        });
        const checkoutUpdate = {
            status: result.deliveryNotificationComplete ? 'fulfilled' : 'delivery_pending',
            stripeEventId: event.id,
            paymentStatus: session.payment_status,
            updatedAt: new Date().toISOString(),
            deliveries: result.deliveries.map(({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }) => ({ paymentId, beatName, licenseType, reference, deliveryToken, downloadToken }))
        };
        if (result.deliveryNotificationComplete) checkoutUpdate.fulfilledAt = checkoutUpdate.updatedAt;
        await checkoutRef.update(checkoutUpdate);
        if (!result.deliveryNotificationComplete) {
            return res.status(500).json({ error: 'El pago se registró, pero la entrega quedó pendiente de reintento.' });
        }
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Stripe webhook error:', error.message);
        const signatureError = /signature|signed payload|timestamp/i.test(String(error?.message || ''));
        return res.status(signatureError ? 400 : 500).json({
            error: signatureError ? 'Webhook Stripe inválido.' : 'No se pudo completar el procesamiento del pago.'
        });
    }
}
