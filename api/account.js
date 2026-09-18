// api/account.js — consolidated account actions for Vercel Hobby
// Keeps the original public URLs through vercel.json rewrites.

import activatePro from '../server-handlers/activate-pro.js';
import redeemVip from '../server-handlers/redeem-vip.js';
import cancelSubscription from '../server-handlers/cancel-subscription.js';
import accountDeletionRequest from '../server-handlers/account-deletion-request.js';
import adminProducers from '../server-handlers/admin-producers.js';

const HANDLERS = {
    'activate-pro': activatePro,
    'redeem-vip': redeemVip,
    'cancel-subscription': cancelSubscription,
    'deletion-request': accountDeletionRequest,
    'admin-producers': adminProducers,
};

export default async function handler(req, res) {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const route = String(req.query?.route || url.searchParams.get('route') || '').trim().toLowerCase();
    const target = HANDLERS[route];
    if (!target) {
        res.setHeader('Cache-Control', 'private, no-store');
        return res.status(404).json({ error: 'Acción no encontrada.' });
    }
    return target(req, res);
}
