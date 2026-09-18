// api/order.js — consolidated order/download actions for Vercel Hobby
// Keeps the original public URLs through vercel.json rewrites.

import getOrderDownloads from '../server-handlers/get-order-downloads.js';
import logDownload from '../server-handlers/log-download.js';
import paymentStatus from '../server-handlers/payment-status.js';
import publicStore from '../server-handlers/public-store.js';
import createPendingOrder from '../server-handlers/create-pending-order.js';
import clearance from '../server-handlers/clearance.js';
import secureLicenseDelivery from '../server-handlers/secure-license-delivery.js';

export const config = { api: { bodyParser: { sizeLimit: '15mb' } } };

const HANDLERS = {
    'get-order-downloads': getOrderDownloads,
    'log-download': logDownload,
    'payment-status': paymentStatus,
    'public-store': publicStore,
    'public-catalog': publicStore,
    'public-artwork': publicStore,
    'create-pending-order': createPendingOrder,
    clearance,
    'secure-license-delivery': secureLicenseDelivery,
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
