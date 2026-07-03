import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
    // CORS
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Determine which endpoint we are routing to based on req.url
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    
    let endpoint = '';
    if (pathname.includes('/qr')) {
        endpoint = 'qr';
    } else if (pathname.includes('/simulate-confirm')) {
        endpoint = 'simulate-confirm';
    } else if (pathname.includes('/webhook')) {
        endpoint = 'webhook';
    } else {
        // Fallback to query parameter if rewrite mapping passes it
        endpoint = req.query.endpoint || '';
    }

    if (endpoint === 'qr') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }
        try {
            const { purchaseId, amount, deunaPhone } = req.body;
            if (!purchaseId || !amount) {
                return res.status(400).json({ error: "Faltan parámetros 'purchaseId' o 'amount'" });
            }
            const cleanPhone = String(deunaPhone || '0999999999').replace(/\D/g, '');
            const deeplink = `deuna://payment?phone=${cleanPhone}&amount=${amount}&description=BEATSS-${purchaseId}`;
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
    
    else if (endpoint === 'simulate-confirm') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }
        try {
            const { purchaseId } = req.body;
            if (!purchaseId) {
                return res.status(400).json({ error: "Falta parámetro 'purchaseId'" });
            }
            initFirebaseAdmin();
            const db = getFirestore();
            const paymentRef = db.collection('payments').doc(purchaseId);
            const paymentSnap = await paymentRef.get();
            if (!paymentSnap.exists) {
                return res.status(404).json({ error: `No se encontró el pago con ID: ${purchaseId}` });
            }
            await paymentRef.update({
                status: 'completed',
                updatedAt: Date.now()
            });
            console.log(`📲 Pago Deuna! ${purchaseId} confirmado y actualizado a completed.`);
            return res.status(200).json({
                status: "success",
                message: `Pago ${purchaseId} confirmado exitosamente`
            });
        } catch (error) {
            console.error("❌ Error al confirmar pago Deuna:", error);
            return res.status(500).json({ error: error.message });
        }
    } 
    
    else if (endpoint === 'webhook') {
        if (req.method !== 'POST') {
            return res.status(405).json({ error: 'Método no permitido' });
        }
        try {
            const payload = req.body;
            console.log(`📬 Webhook de Deuna! recibido:`, JSON.stringify(payload));
            let purchaseId = payload.purchaseId;
            let status = payload.status;
            let description = payload.description || payload.reference || payload.detail || payload.memo;
            if (!description && payload.data && typeof payload.data === 'object') {
                const dataObj = payload.data;
                description = dataObj.description || dataObj.reference || dataObj.detail;
                if (!status) {
                    status = dataObj.status || dataObj.state;
                }
            }
            if (!status) status = 'completed';
            if (description && String(description).includes('BEATSS-')) {
                const descStr = String(description);
                const match = descStr.match(/BEATSS-([a-zA-Z0-9_-]+)/);
                if (match) {
                    purchaseId = match[1];
                    console.log(`[+] Extraído purchaseId '${purchaseId}' de descripción: ${descStr}`);
                }
            }
            if (!purchaseId) {
                return res.status(400).json({ error: "Falta parámetro 'purchaseId' o no se pudo extraer de la descripción" });
            }
            const successStates = ['completed', 'approved', 'paid', 'success', 'done', 'processed'];
            const isCompleted = successStates.includes(String(status).toLowerCase());
            if (isCompleted) {
                initFirebaseAdmin();
                const db = getFirestore();
                const paymentRef = db.collection('payments').doc(purchaseId);
                const paymentSnap = await paymentRef.get();
                if (!paymentSnap.exists) {
                    return res.status(404).json({ error: `No se encontró el pago con ID: ${purchaseId}` });
                }
                await paymentRef.update({
                    status: 'completed',
                    updatedAt: Date.now()
                });
                console.log(`✅ Pago Deuna! ${purchaseId} marcado como completado vía Webhook.`);
                return res.status(200).json({ status: "success", message: `Pago ${purchaseId} confirmado exitosamente` });
            } else {
                console.log(`[-] Webhook recibido pero estado '${status}' no indica éxito.`);
                return res.status(200).json({ status: "ignored", message: `Estado '${status}' no indica éxito, omitido.` });
            }
        } catch (error) {
            console.error("❌ Error en webhook de Deuna:", error);
            return res.status(500).json({ error: error.message });
        }
    } 
    
    else {
        return res.status(404).json({ error: 'Endpoint no encontrado' });
    }
}
