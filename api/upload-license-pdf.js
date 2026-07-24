// Guarda un contrato generado en el navegador tras un pago confirmado y envía
// la entrega solo cuando el PDF ya está disponible en Firebase Storage.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import crypto from 'crypto';

export const config = {
    api: { bodyParser: { sizeLimit: '15mb' } }
};

const ALLOWED_ORIGINS = ['https://beatss.app', 'https://www.beatss.app', 'https://generador-licencias.vercel.app'];
const DEFAULT_APP_ORIGIN = 'https://beatss.app';
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app';

function getCorsOrigin(req) {
    const origin = req.headers.origin;
    if (origin && (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.vercel.app') || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1'))) {
        return origin;
    }
    return DEFAULT_APP_ORIGIN;
}

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        storageBucket: STORAGE_BUCKET
    });
}

function isValidDeliveryToken(paymentId, token) {
    if (!SIGNING_SECRET || !paymentId || !token) return false;
    const expected = crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:pdf-delivery`).digest('hex');
    try {
        return crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'));
    } catch (_) {
        return false;
    }
}

function downloadToken(paymentId) {
    return crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:download`).digest('hex');
}

function pdfBuffer(value) {
    const encoded = String(value || '').replace(/^data:application\/pdf;base64,/, '');
    if (!encoded || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new Error('El contrato no contiene un PDF válido.');
    const content = Buffer.from(encoded, 'base64');
    if (content.length < 5 || content.length > 15 * 1024 * 1024 || !content.subarray(0, 4).equals(Buffer.from('%PDF'))) {
        throw new Error('El PDF debe ser válido y menor a 15 MB.');
    }
    return content;
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', getCorsOrigin(req));
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    const { paymentId, deliveryToken, pdfBase64 } = req.body || {};
    if (!SIGNING_SECRET) return res.status(503).json({ error: 'La entrega segura todavía no está configurada.' });
    if (!isValidDeliveryToken(paymentId, deliveryToken)) return res.status(401).json({ error: 'La autorización de entrega no es válida.' });

    try {
        const pdf = pdfBuffer(pdfBase64);
        initFirebaseAdmin();
        const db = getFirestore();
        const paymentRef = db.collection('payments').doc(paymentId);
        const paymentSnap = await paymentRef.get();
        if (!paymentSnap.exists) return res.status(404).json({ error: 'No se encontró el pago de esta entrega.' });

        const payment = paymentSnap.data();
        if (!['approved', 'completed'].includes(String(payment.status || '').toLowerCase())) {
            return res.status(409).json({ error: 'El pago aún no está aprobado.' });
        }

        const safeReference = String(payment.reference || paymentId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const objectPath = `licenses/${payment.producerId}/deliveries/${paymentId}/Licencia_${safeReference}.pdf`;
        const token = crypto.randomBytes(20).toString('hex');
        const file = getStorage().bucket(STORAGE_BUCKET).file(objectPath);
        await file.save(pdf, {
            resumable: false,
            contentType: 'application/pdf',
            metadata: {
                cacheControl: 'private, max-age=0, no-transform',
                metadata: { firebaseStorageDownloadTokens: token }
            }
        });

        const encodedPath = encodeURIComponent(objectPath);
        const contractUrl = `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encodedPath}?alt=media&token=${token}`;
        const appOrigin = getCorsOrigin(req);
        const audioDownloadsUrl = `${appOrigin}/?download=${paymentId}&token=${downloadToken(paymentId)}`;

        await paymentRef.update({
            contractPdfUrl: contractUrl,
            contractStoragePath: objectPath,
            deliveryStatus: 'pdf_ready',
            contractGeneratedAt: new Date().toISOString()
        });

        const [publicConfigSnap, privateConfigSnap] = await Promise.all([
            db.collection('users').doc(payment.producerId).collection('config').doc('producer').get(),
            db.collection('users').doc(payment.producerId).collection('private_config').doc('producer').get()
        ]);
        const producer = publicConfigSnap.exists ? publicConfigSnap.data() : {};
        const privateConfig = privateConfigSnap.exists ? privateConfigSnap.data() : {};
        const serviceId = privateConfig.emailjsServiceId || 'service_btb90z6';
        const templateId = privateConfig.emailjsTemplateId || 'template_mlimkld';
        const publicKey = privateConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

        const deliveryLinks = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
            <div style="margin-bottom:20px;padding:18px;border:1px solid #e5e7eb;border-radius:10px;text-align:center;">
              <div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#64748b;margin-bottom:10px;">DOCUMENTO OFICIAL</div>
              <a href="${contractUrl}" target="_blank" style="display:inline-block;padding:12px 20px;background:#0055ee;color:#fff!important;text-decoration:none;border-radius:8px;font-weight:700;">📄 Descargar licencia PDF</a>
            </div>
            <div style="margin-bottom:4px;text-align:center;">
              <a href="${audioDownloadsUrl}" target="_blank" style="display:inline-block;padding:11px 18px;background:#f1f5f9;color:#0055ee!important;text-decoration:none;border-radius:8px;font-weight:700;">🎵 Acceder a archivos de audio</a>
            </div>
          </div>`;

        const emailResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                service_id: serviceId,
                template_id: templateId,
                user_id: publicKey,
                template_params: {
                    to_name: payment.buyerName,
                    to_email: payment.buyerEmail,
                    beat_name: payment.beatName,
                    license_type: payment.licenseType,
                    delivery_links: deliveryLinks,
                    producer_name: producer.aka || producer.name || 'BEATSS',
                    producer_email: producer.email || '',
                    pdf_filename: `Licencia_${safeReference}.pdf`,
                    pdf_url: contractUrl
                }
            })
        });

        if (!emailResponse.ok) {
            await paymentRef.update({ deliveryStatus: 'pdf_ready_email_failed', deliveryEmailErrorAt: new Date().toISOString() });
            return res.status(502).json({ error: 'El contrato se guardó, pero el correo no pudo enviarse. Reintenta la entrega desde el panel.' });
        }

        await paymentRef.update({ deliveryStatus: 'sent', deliverySentAt: new Date().toISOString() });
        return res.status(200).json({ success: true, contractUrl });
    } catch (error) {
        console.error('Error al preparar entrega de licencia:', error);
        return res.status(500).json({ error: 'No se pudo preparar la entrega oficial de la licencia.' });
    }
}
