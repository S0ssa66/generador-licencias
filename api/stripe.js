// api/stripe.js — consolidated Stripe checkout/status actions for Vercel Hobby
// The Stripe webhook remains isolated because it requires a raw request body.

import createCheckoutSession from '../server-handlers/stripe-create-checkout-session.js';
import sessionStatus from '../server-handlers/stripe-session-status.js';
import retryDeliveries from '../server-handlers/stripe-retry-deliveries.js';

export const config = { api: { bodyParser: { sizeLimit: '200kb' } } };

const HANDLERS = {
    'create-checkout-session': createCheckoutSession,
    'session-status': sessionStatus,
    'retry-deliveries': retryDeliveries,
};

export default async function handler(req, res) {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const route = String(req.query?.route || url.searchParams.get('route') || '').trim().toLowerCase();
    const target = HANDLERS[route];
    if (!target) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(404).json({ error: 'Acción de Stripe no encontrada.' });
    }
    return target(req, res);
}
