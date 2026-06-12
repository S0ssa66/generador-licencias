// api/confirm-purchase.js — Vercel Serverless Function
// Valida el pago de PayPal en el servidor y procesa la entrega segura de los beats al comprador.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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
async function getPayPalAccessToken(clientId, secret, isSandbox) {
    const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');
    const paypalHost = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';

    const response = await fetch(`https://${paypalHost}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`No se pudo obtener el token de PayPal: ${errText}`);
    }
    const data = await response.json();
    return data.access_token;
}

// Verificar el order con la API de PayPal
async function verifyPayPalOrder(orderId, clientId, secret, isSandbox) {
    const accessToken = await getPayPalAccessToken(clientId, secret, isSandbox);
    const paypalHost = isSandbox ? 'api-m.sandbox.paypal.com' : 'api-m.paypal.com';

    const response = await fetch(`https://${paypalHost}/v2/checkout/orders/${orderId}`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`No se pudo verificar el order de PayPal: ${errText}`);
    }
    return await response.json();
}

export default async function handler(req, res) {
    // CORS headers - restringido al dominio propio
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo POST
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const {
        orderId,
        producerId,
        buyerName,
        buyerEmail,
        buyerPhone,
        buyerDni,
        buyerCity,
        buyerCountry,
        items,
        discountPercent = 0,
        couponCode = ''
    } = req.body;

    if (!orderId || !producerId || !buyerName || !buyerEmail || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Faltan parámetros requeridos para confirmar la compra.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // 1. Obtener la configuración del productor (pública y privada)
        const publicConfigRef = db.collection('users').doc(producerId).collection('config').doc('producer');
        const privateConfigRef = db.collection('users').doc(producerId).collection('private_config').doc('producer');

        const [publicSnap, privateSnap] = await Promise.all([
            publicConfigRef.get(),
            privateConfigRef.get()
        ]);

        if (!publicSnap.exists) {
            return res.status(404).json({ error: 'Productor no encontrado o no configurado.' });
        }

        const publicConfig = publicSnap.data();
        const privateConfig = privateSnap.exists ? privateSnap.data() : {};

        // 2. Determinar credenciales de PayPal (Productor o fallback a la plataforma)
        const activeClientId = publicConfig.paypalClientId || process.env.PAYPAL_CLIENT_ID;
        const activeSecret = privateConfig.paypalClientSecret || process.env.PAYPAL_CLIENT_SECRET;

        if (!activeClientId || !activeSecret) {
            return res.status(500).json({ error: 'El productor no tiene configurado PayPal y el servidor no tiene credenciales de fallback.' });
        }

        const isSandbox = process.env.PAYPAL_MODE === 'sandbox' || activeClientId.startsWith('sb-') || activeClientId.includes('sandbox');

        // 3. Verificar el pago en PayPal
        const order = await verifyPayPalOrder(orderId, activeClientId, activeSecret, isSandbox);

        if (order.status !== 'COMPLETED' && order.status !== 'APPROVED') {
            return res.status(400).json({ error: `El pago no está completado en PayPal. Estado: ${order.status}` });
        }

        // 4. Procesar cada beat comprado y obtener los enlaces privados
        const deliveredItems = [];
        const typeLabels = {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Premium Plus',
            unlimited_flp: 'Ilimitada + FLP',
            exclusive: 'Exclusiva'
        };

        for (const item of items) {
            // Obtener metadatos básicos del beat
            const beatRef = db.collection('users').doc(producerId).collection('beats').doc(item.beatId);
            const beatSnap = await beatRef.get();
            if (!beatSnap.exists) {
                console.warn(`Beat ${item.beatId} no encontrado en el catálogo.`);
                continue;
            }
            const beatData = beatSnap.data();

            // Obtener archivos privados (high quality links)
            const privateFilesRef = beatRef.collection('private').doc('files');
            const privateFilesSnap = await privateFilesRef.get();
            let wavLink = '';
            let stemsLink = '';

            if (privateFilesSnap.exists) {
                const privateData = privateFilesSnap.data();
                wavLink = privateData.wav || '';
                stemsLink = privateData.stems || '';
            }

            // Registrar el pago aprobado en Firestore usando Admin SDK (bypasseando reglas)
            const paymentRef = db.collection('payments').doc();
            const finalPrice = item.price * (1 - (discountPercent / 100));
            
            const paymentData = {
                type: 'beat_purchase',
                producerId: producerId,
                beatId: item.beatId,
                beatName: item.beatName,
                licenseType: item.licenseType,
                price: item.price,
                buyerName: buyerName,
                buyerEmail: buyerEmail,
                buyerPhone: buyerPhone || '',
                buyerDni: buyerDni || '',
                buyerCity: buyerCity || '',
                buyerCountry: buyerCountry || '',
                method: 'paypal',
                reference: orderId,
                receiptUrl: '',
                status: 'approved',
                discountPercent: discountPercent,
                couponCode: couponCode,
                originalPrice: item.price,
                finalPrice: finalPrice,
                timestamp: new Date().toISOString()
            };

            await paymentRef.set(paymentData);

            // Generar enlaces de descarga para este item
            const mp3 = beatData.mp3 || "";
            const wav = wavLink || beatData.wav || "";
            const stems = stemsLink || beatData.stems || "";

            let linksHtml = `<h4>Instrumental: ${item.beatName} (${typeLabels[item.licenseType] || item.licenseType})</h4><ul>`;
            if (mp3) linksHtml += `<li><strong>MP3 (320kbps):</strong> <a href="${mp3}">Descargar MP3</a></li>`;
            
            // WAV se incluye si no es licencia básica
            if (wav && item.licenseType !== 'basic') {
                linksHtml += `<li><strong>WAV (Master):</strong> <a href="${wav}">Descargar WAV</a></li>`;
            }
            // Stems se incluye si es superior a premium
            if (stems && item.licenseType !== 'basic' && item.licenseType !== 'premium') {
                linksHtml += `<li><strong>Stems (Pistas Separadas):</strong> <a href="${stems}">Descargar Pistas</a></li>`;
            }
            linksHtml += `</ul>`;

            deliveredItems.push({
                beatName: item.beatName,
                licenseType: item.licenseType,
                linksHtml: linksHtml
            });
        }

        if (deliveredItems.length === 0) {
            return res.status(400).json({ error: 'No se procesó ningún beat válido de la orden.' });
        }

        // 5. Configurar EmailJS
        const activeEmailjsServiceId = privateConfig.emailjsServiceId || 'service_7ofza2v';
        const activeEmailjsTemplateId = privateConfig.emailjsTemplateId || 'template_mlimkld';
        const activeEmailjsPublicKey = privateConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

        const activeProducerAka = publicConfig.aka || 'Productor';
        const activeProducerEmail = publicConfig.email || '';

        // Combinar los enlaces de descarga de todos los beats
        const allLinksHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #1a202c;">
            <h2 style="color: #4a5568; border-bottom: 2px solid #edf2f7; padding-bottom: 10px;">¡Gracias por tu compra!</h2>
            <p>Hola <strong>${buyerName}</strong>, aquí tienes tus enlaces de descarga directa para tus instrumentales:</p>
            ${deliveredItems.map(item => item.linksHtml).join('')}
            <div style="margin-top: 25px; padding: 15px; background-color: #f7fafc; border-radius: 8px; font-size: 13px; color: #718096; line-height: 1.5;">
                <p style="margin: 0;">🔒 Tu licencia oficial PDF y contrato firmado digitalmente por el productor serán procesados y entregados muy pronto.</p>
            </div>
            <p style="margin-top: 25px; font-size: 14px; color: #4a5568;">Saludos,<br><strong>${activeProducerAka}</strong></p>
        </div>
        `;

        const templateParams = {
            to_name: buyerName,
            to_email: buyerEmail,
            beat_name: deliveredItems.map(item => item.beatName).join(', '),
            license_type: deliveredItems.map(item => typeLabels[item.licenseType] || item.licenseType).join(', '),
            delivery_links: allLinksHtml,
            producer_name: activeProducerAka,
            producer_email: activeProducerEmail,
            pdf_filename: `Licencia_PayPal_${orderId}.pdf`
        };

        // Enviar correo a través de la API REST de EmailJS
        const emailjsResponse = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                service_id: activeEmailjsServiceId,
                template_id: activeEmailjsTemplateId,
                user_id: activeEmailjsPublicKey,
                template_params: templateParams
            })
        });

        if (!emailjsResponse.ok) {
            const emailjsErr = await emailjsResponse.text();
            console.error('Error al enviar correo por EmailJS:', emailjsErr);
            // No fallamos la petición completa ya que el pago ya se cobró y se registró en la base de datos
        } else {
            console.log(`📧 Entrega por correo enviada con éxito a ${buyerEmail}`);
        }

        return res.status(200).json({
            success: true,
            message: 'Compra confirmada y procesada con éxito.'
        });

    } catch (error) {
        console.error('❌ Error en confirm-purchase:', error);
        return res.status(500).json({
            error: 'Error interno al confirmar la compra',
            details: error.message
        });
    }
}
