// api/payments/deuna/qr.js — Vercel Serverless Function
// Genera el código QR y el deeplink móvil para pagos mediante Deuna!

const ALLOWED_ORIGINS = [
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app'
];

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return 'https://beatss.app';
    if (ALLOWED_ORIGINS.includes(origin) || 
        origin.endsWith('.vercel.app') || 
        origin.startsWith('http://localhost') || 
        origin.startsWith('http://127.0.0.1')) {
        return origin;
    }
    return 'https://beatss.app';
}

export default async function handler(req, res) {
    // CORS
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        const { purchaseId, amount, deunaPhone } = req.body;

        if (!purchaseId || !amount) {
            return res.status(400).json({ error: "Faltan parámetros 'purchaseId' o 'amount'" });
        }

        // Formatear deeplink para la app Deuna!
        const cleanPhone = String(deunaPhone || '0999999999').replace(/\D/g, '');
        const deeplink = `deuna://payment?phone=${cleanPhone}&amount=${amount}&description=BEATSS-${purchaseId}`;
        
        // Usar Google Charts API para generar QR interactivo
        const qrUrl = `https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl=${encodeURIComponent(deeplink)}&choe=UTF-8`;

        return res.status(200).json({
            status: "success",
            qrUrl: qrUrl,
            deeplink: deeplink
        });

    } catch (error) {
        console.error("❌ Error al generar QR Deuna:", error);
        return res.status(500).json({ error: error.message });
    }
}
