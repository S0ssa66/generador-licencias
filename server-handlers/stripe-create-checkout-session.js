import Stripe from 'stripe';
import crypto from 'crypto';
import { getStripeFirebase } from '../api/_fulfill-beat-purchase.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';
import { isBeatAvailableForSale, resolvePublicPreview } from './beat-availability.js';
import { LegalAcceptanceError, normalizeCheckoutLegalAcceptance } from './legal-acceptance.js';
import { LicenseUpgradeError, evaluatePriorLicenseUpgrade } from './license-upgrade-policy.js';

export const config = { api: { bodyParser: { sizeLimit: '200kb' } } };

const LICENSE_PRICES = { basic: 30, premium: 60, premium_plus: 100, unlimited_flp: 200 };
const LICENSE_LABELS = { basic: 'Básica', premium: 'Premium', premium_plus: 'Premium Plus', unlimited_flp: 'Ilimitada + FLP' };

function resolveAppOrigin(req) {
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) return origin;
    return process.env.APP_ORIGIN || 'https://beatss.app';
}

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function clean(value, max = 240) {
    return String(value || '').trim().slice(0, max);
}

function fail(res, status, error) {
    return res.status(status).json({ error });
}

function safeEqualHex(left, right) {
    const a = String(left || '');
    const b = String(right || '');
    if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}

function verifiesDownloadAccess(paymentId, accessToken, secret = process.env.DOWNLOAD_SIGNING_KEY || '') {
    if (!secret || !paymentId || !accessToken) return false;
    const expected = crypto.createHmac('sha256', secret).update(`${paymentId}:download`).digest('hex');
    return safeEqualHex(accessToken, expected);
}

export function resolveStripeSettlement(producerId, privateConfig = {}, env = process.env) {
    const platformProducerId = clean(env.STRIPE_PLATFORM_PRODUCER_ID, 128);
    if (platformProducerId && producerId === platformProducerId) {
        return { mode: 'platform' };
    }
    const destination = clean(privateConfig.stripeConnectAccountId, 128);
    if (/^acct_[A-Za-z0-9]{8,}$/.test(destination)) {
        return { mode: 'connect', destination };
    }
    return null;
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 20;
const stripeRateWindows = new Map();

export function resetStripeCheckoutRateLimit() {
    stripeRateWindows.clear();
}

export function checkStripeCheckoutRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = stripeRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        stripeRateWindows.set(ip, { start: now, count: 1 });
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

export default async function handler(req, res) {
    configureCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return fail(res, 405, 'Método no permitido.');

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkStripeCheckoutRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return fail(res, 429, 'Demasiadas solicitudes de pago con Stripe. Por favor espera unos minutos.');
    }

    if (!process.env.STRIPE_SECRET_KEY) return fail(res, 503, 'Stripe todavía no está configurado en el servidor.');

    try {
        const body = req.body || {};
        const producerId = clean(body.producerId, 128);
        const buyerName = clean(body.buyerName, 160);
        const buyerEmail = clean(body.buyerEmail, 240).toLowerCase();
        const items = Array.isArray(body.items) ? body.items.slice(0, 20) : [];
        if (!producerId || !buyerName || !/^\S+@\S+\.\S+$/.test(buyerEmail) || !items.length) return fail(res, 400, 'Completa los datos del comprador y selecciona al menos un beat.');
        let legalAcceptance;
        try {
            legalAcceptance = normalizeCheckoutLegalAcceptance(body);
        } catch (error) {
            if (error instanceof LegalAcceptanceError) return fail(res, 400, error.message);
            throw error;
        }

        const invoiceRuc = clean(body.invoiceRuc, 40);
        const invoiceCompany = clean(body.invoiceCompany, 160);
        const invoiceAddress = clean(body.invoiceAddress, 240);
        const invoiceEmail = clean(body.invoiceEmail, 240).toLowerCase();
        const sriInvoiceRequested = body.needInvoice === true;
        const hasInvoiceData = Boolean(invoiceRuc || invoiceCompany || invoiceAddress || invoiceEmail);
        if ((hasInvoiceData || sriInvoiceRequested) && (!/^\d{13}$/.test(invoiceRuc) || !invoiceCompany || !invoiceAddress || !/^\S+@\S+\.\S+$/.test(invoiceEmail))) {
            return fail(res, 400, 'Los datos de facturación no son válidos.');
        }

        const db = getStripeFirebase();
        const producerRef = db.collection('users').doc(producerId);
        const producerSnap = await producerRef.collection('config').doc('producer').get();
        if (!producerSnap.exists) return fail(res, 404, 'Productor no encontrado.');
        const producer = producerSnap.data();
        const privateProducerSnap = await producerRef.collection('private_config').doc('producer').get();
        const privateProducer = privateProducerSnap.exists ? privateProducerSnap.data() : {};
        const settlement = resolveStripeSettlement(producerId, privateProducer);
        if (!settlement) return fail(res, 409, 'Stripe no está habilitado para este productor.');

        const upgradeFromPaymentId = clean(body.upgradeFromPaymentId, 160);
        const upgradeAccessToken = clean(body.upgradeAccessToken, 256);
        const isPriorLicenseUpgrade = Boolean(upgradeFromPaymentId || upgradeAccessToken);
        if (isPriorLicenseUpgrade && (!/^[A-Za-z0-9_-]{3,160}$/.test(upgradeFromPaymentId) || !verifiesDownloadAccess(upgradeFromPaymentId, upgradeAccessToken))) {
            return fail(res, 401, 'La autorización de ampliación no es válida. Abre el enlace original de tu licencia.');
        }
        if (isPriorLicenseUpgrade && items.length !== 1) {
            return fail(res, 400, 'La ampliación de una licencia se procesa de un beat a la vez.');
        }
        const sourcePaymentSnap = isPriorLicenseUpgrade
            ? await db.collection('payments').doc(upgradeFromPaymentId).get()
            : null;
        if (isPriorLicenseUpgrade && !sourcePaymentSnap?.exists) {
            return fail(res, 404, 'No se encontró la licencia original para esta ampliación.');
        }
        const sourcePayment = sourcePaymentSnap?.data() || null;
        const normalizedItems = [];
        let upgrade = null;
        for (const raw of items) {
            const beatId = clean(raw.beatId, 160);
            const licenseType = clean(raw.licenseType, 40);
            if (!beatId || !Object.prototype.hasOwnProperty.call(LICENSE_PRICES, licenseType)) return fail(res, 400, 'El tipo de licencia no es válido para Stripe.');
            const beatSnap = await producerRef.collection('beats').doc(beatId).get();
            if (!beatSnap.exists) return fail(res, 400, 'Uno de los beats seleccionados ya no está disponible.');
            const beat = beatSnap.data();
            let publicPreview = resolvePublicPreview(beat);
            if (!publicPreview) {
                const files = await beatSnap.ref.collection('private').doc('files').get();
                publicPreview = resolvePublicPreview({ preview: files.exists ? files.data()?.preview : '' });
            }
            if (isPriorLicenseUpgrade) {
                if (sourcePayment.producerId !== producerId || sourcePayment.beatId !== beatId) {
                    return fail(res, 409, 'La licencia original no corresponde a este beat ni a esta tienda.');
                }
                try {
                    upgrade = evaluatePriorLicenseUpgrade({
                        sourcePayment,
                        beat,
                        buyerEmail,
                        targetLicense: licenseType
                    });
                } catch (error) {
                    if (error instanceof LicenseUpgradeError) return fail(res, 409, error.message);
                    throw error;
                }
                normalizedItems.push({
                    beatId,
                    beatName: clean(beat.name || raw.beatName || 'Beat', 160),
                    licenseType: upgrade.targetLicenseType,
                    price: upgrade.amountDue,
                    targetLicensePrice: upgrade.targetLicensePrice,
                    upgradeCreditApplied: upgrade.creditApplied
                });
                continue;
            }
            if (!isBeatAvailableForSale({ ...beat, preview: publicPreview })) {
                return fail(res, 409, 'Uno de los beats seleccionados ya no está disponible.');
            }
            const price = Number(beat[`price_${licenseType}`] ?? beat[`${licenseType}Price`] ?? LICENSE_PRICES[licenseType]);
            const basePrice = Number.isFinite(price) && price > 0 ? price : LICENSE_PRICES[licenseType];
            normalizedItems.push({ beatId, beatName: clean(beat.name || raw.beatName || 'Beat', 160), licenseType, price: basePrice });
        }

        // Nunca confiar en descuentos enviados por el navegador. Los cupones
        // deberán validarse aquí en servidor antes de habilitarse en producción.
        const discountPercent = 0;
        const couponCode = '';
        const requestId = `stc_${crypto.randomBytes(18).toString('hex')}`;
        const checkoutRef = db.collection('stripe_checkouts').doc(requestId);
        const checkoutData = {
            status: 'creating', requestId, producerId, buyerName, buyerEmail,
            buyerPhone: clean(body.buyerPhone, 40), buyerDni: clean(body.buyerDni, 40),
            buyerCity: clean(body.buyerCity, 160), buyerCountry: clean(body.buyerCountry, 80),
            youtubeWhitelist: clean(body.youtubeWhitelist, 240), items: normalizedItems,
            invoiceRuc, invoiceCompany, invoiceAddress, invoiceEmail, sriInvoiceRequested,
            discountPercent, couponCode, acceptedTerms: true,
            acceptanceTimestamp: legalAcceptance.acceptanceTimestamp,
            termsVersion: legalAcceptance.termsVersion,
            upgrade: upgrade ? {
                sourcePaymentId: upgradeFromPaymentId,
                sourceLicenseType: upgrade.sourceLicenseType,
                targetLicenseType: upgrade.targetLicenseType,
                targetLicensePrice: upgrade.targetLicensePrice,
                creditApplied: upgrade.creditApplied,
                exclusiveEffectiveAt: upgrade.exclusiveEffectiveAt
            } : null,
            createdAt: new Date().toISOString()
        };
        await checkoutRef.set(checkoutData);

        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        const lineItems = normalizedItems.map(item => ({
            price_data: {
                currency: 'usd',
                unit_amount: Math.max(1, Math.round(item.price * (1 - discountPercent / 100) * 100)),
                product_data: { name: upgrade ? `Ampliación · ${item.beatName} · Licencia ${LICENSE_LABELS[item.licenseType]}` : `${item.beatName} · Licencia ${LICENSE_LABELS[item.licenseType]}` }
            },
            quantity: 1
        }));
        const sessionOptions = {
            mode: 'payment', line_items: lineItems,
            customer_email: buyerEmail,
            client_reference_id: requestId,
            metadata: { requestId, producerId, termsVersion: legalAcceptance.termsVersion },
            // El retorno no puede pasar por el Studio: Stripe vuelve al
            // comprador, que aún no tiene por qué tener una cuenta BEATSS.
            // Esta ruta pública espera la confirmación y abre sólo el portal
            // de entrega firmado de los beats ya pagados.
            success_url: `${resolveAppOrigin(req)}/compra/stripe?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${resolveAppOrigin(req)}/compra/cancelada`
        };
        if (settlement.mode === 'connect') {
            sessionOptions.payment_intent_data = {
                transfer_data: { destination: settlement.destination }
            };
        }
        const session = await stripe.checkout.sessions.create(sessionOptions);
        await checkoutRef.update({ status: 'open', settlementMode: settlement.mode, sessionId: session.id, updatedAt: new Date().toISOString() });
        return res.status(200).json({ success: true, checkoutUrl: session.url, sessionId: session.id });
    } catch (error) {
        console.error('Stripe create-checkout-session error:', error.message);
        return fail(res, 500, 'No se pudo iniciar el pago con Stripe.');
    }
}
