import { getFirestore } from 'firebase-admin/firestore';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';
import { requireSession } from './sri-download.js';

const PAYMENT_METHODS = new Set([
    'stripe', 'paypal', 'transferencia', 'efectivo', 'deuna', 'payphone', 'beatstars', 'otro'
]);
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 12;
const rateWindows = new Map();

function safeText(value, max = 160) {
    return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function responseError(message, status = 409) {
    return Object.assign(new Error(message), { status });
}

export function normalizeManualPaymentMethod(value) {
    const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
        transferencia_bancaria: 'transferencia',
        pay_phone: 'payphone',
        de_una: 'deuna',
        cash: 'efectivo'
    };
    const method = aliases[normalized] || normalized;
    return PAYMENT_METHODS.has(method) ? method : '';
}

function eligibleLicense(license, paymentId, producerId, paymentMethod, confirmed, confirmedAt) {
    if (confirmed !== true) throw responseError('Confirma expresamente que recibiste este cobro.', 400);
    if (!/^[A-Za-z0-9_-]{3,160}$/.test(String(paymentId || ''))) throw responseError('ID de venta inválido.', 400);
    if (!license || typeof license !== 'object') throw responseError('No se encontró la licencia histórica de esta cuenta.', 404);
    if ((license.producerId && license.producerId !== producerId) || (license.userId && license.userId !== producerId)) {
        throw responseError('La licencia no pertenece a esta cuenta.', 403);
    }
    if (license.historyStatus === 'archived' || license.archivedAt || license.deletedAt || license.isDeleted === true) {
        throw responseError('Una licencia archivada o dada de baja no puede convertirse en cobro fiscal.', 409);
    }
    if (license.providerLivemode === false || license.sandbox === true || license.isSandbox === true || license.testMode === true) {
        throw responseError('Una operación de prueba no puede registrarse como cobro fiscal.', 409);
    }

    const references = [license.reference, license.refCode, license.contractReference, paymentId]
        .map(value => safeText(value))
        .filter(Boolean);
    const reference = references[0] || '';
    if (!reference || references.some(value => /^cs_test_/i.test(value) || /^test[-_]/i.test(value) || /(^|[-_])sandbox([-_]|$)/i.test(value))) {
        throw responseError('La referencia corresponde a una compra de prueba.', 409);
    }

    const fiscalState = String(license.sriEstado || '').trim().toUpperCase();
    const allowedFiscalStates = new Set(['', 'SIN_EMITIR', 'NO_EMITIDA']);
    if (!allowedFiscalStates.has(fiscalState) || license.sriClaveAcceso || license.sriJobId ||
        license.sriNumeroAutorizacion || license.sriXmlStoragePath || license.sriRideStoragePath ||
        license.sriXmlSha256 || license.sriRideSha256 ||
        ['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'].includes(String(license.sriManualArtifactsStatus || ''))) {
        throw responseError('Esta operación ya tiene un estado o reserva fiscal. Concíliala antes de registrar un cobro nuevo.', 409);
    }
    const method = normalizeManualPaymentMethod(paymentMethod);
    if (!method) throw responseError('Selecciona un método de pago válido.', 400);

    const rawAmount = license.value ?? license.finalPrice ?? license.price;
    const parsedAmount = Number(rawAmount);
    const amountCents = Math.round(parsedAmount * 100);
    if (!Number.isFinite(parsedAmount) || amountCents < 1 || parsedAmount > 1_000_000) {
        throw responseError('El importe guardado de la licencia no es válido para registrar un cobro.', 409);
    }
    if (license.currency && String(license.currency).trim().toLowerCase() !== 'usd') {
        throw responseError('La moneda de esta operación no es USD; concíliala antes de registrarla.', 409);
    }
    const amount = amountCents / 100;

    const attestation = {
        source: 'owner_manual_attestation',
        status: 'owner_confirmed_received',
        received: true,
        amount: Number(amount.toFixed(2)),
        currency: 'usd',
        method,
        confirmedBy: producerId,
        confirmedAt
    };
    const payment = {
        producerId,
        userId: producerId,
        status: 'approved',
        paymentStatus: 'approved',
        source: 'owner_manual_attestation',
        manualPaymentAttestation: attestation,
        value: attestation.amount,
        amount: attestation.amount,
        price: attestation.amount,
        finalPrice: attestation.amount,
        currency: 'usd',
        reference,
        refCode: safeText(license.refCode || reference),
        date: safeText(license.date || license.issuedAt || confirmedAt.slice(0, 10), 32),
        paymentMethod: method,
        beatName: safeText(license.beatName || license.beat || 'Beat'),
        buyerName: safeText(license.buyerName || license.clientName || ''),
        buyerEmail: safeText(license.buyerEmail || license.email || '', 254),
        buyerDni: safeText(license.buyerDni || license.buyerId || ''),
        buyerId: safeText(license.buyerDni || license.buyerId || ''),
        invoiceCompany: safeText(license.invoiceCompany || license.buyerName || license.clientName || ''),
        invoiceRuc: safeText(license.invoiceRuc || license.buyerDni || license.buyerId || ''),
        invoiceAddress: safeText(license.invoiceAddress || license.buyerAddress || ''),
        invoiceEmail: safeText(license.invoiceEmail || license.buyerEmail || license.email || '', 254),
        licenseType: safeText(license.licenseType || license.type || ''),
        type: safeText(license.type || license.licenseType || '')
    };
    const licensePatch = {
        paymentStatus: 'approved',
        manualPaymentAttestation: attestation,
        paymentMethod: method,
        updatedAt: confirmedAt
    };
    return { amount: attestation.amount, payment, licensePatch, attestation };
}

function limited(ip, now = Date.now()) {
    const current = rateWindows.get(ip);
    if (!current || now - current.start >= RATE_WINDOW_MS || now < current.start) {
        rateWindows.set(ip, { start: now, count: 1 });
        return false;
    }
    current.count += 1;
    return current.count > RATE_LIMIT;
}

export function resetSriManualPaymentRateLimit() {
    rateWindows.clear();
}

export function createSriManualPaymentHandler({
    authenticate = requireSession,
    getDb = () => getFirestore(),
    timestamp = () => new Date().toISOString(),
    rateLimit = limited
} = {}) {
    return async function sriManualPaymentHandler(req, res) {
        const origin = req.headers?.origin;
        res.setHeader('Cache-Control', 'private, no-store');
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (origin && isTrustedBeatssOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.method === 'OPTIONS') return res.status(204).end();
        if (origin && !isTrustedBeatssOrigin(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
        if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

        const forwarded = req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
        const ip = safeText(Array.isArray(forwarded) ? forwarded.at(-1) : String(forwarded).split(',').at(-1), 128) || 'unknown';
        if (rateLimit(ip)) return res.status(429).json({ error: 'Demasiadas solicitudes. Espera unos minutos.' });

        try {
            const decoded = await authenticate(req);
            if (!decoded?.uid) throw responseError('Sesión inválida.', 401);
            if (req.body?.confirmManualPayment !== true) throw responseError('Confirma expresamente el cobro recibido.', 400);
            const paymentId = String(req.body?.paymentId || '').trim();
            if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) throw responseError('ID de venta inválido.', 400);
            const paymentMethod = normalizeManualPaymentMethod(req.body?.paymentMethod);
            if (!paymentMethod) throw responseError('Selecciona un método de pago válido.', 400);

            // `requireSession` inicializa Firebase Admin. Se conserva el dueño
            // en la ruta, y toda la operación se vuelve a cotejar dentro de una
            // transacción antes de crear el pago histórico.
            const db = getDb();
            const producerId = decoded.uid;
            const paymentRef = db.collection('payments').doc(paymentId);
            const licenseRef = db.collection('users').doc(producerId).collection('licencias').doc(paymentId);
            const jobRef = db.collection('sriJobs').doc(paymentId);
            const reservationRef = db.collection('sriReservations').doc(paymentId);
            const confirmedAt = timestamp();

            const result = await db.runTransaction(async transaction => {
                const [paymentSnap, licenseSnap, jobSnap, reservationSnap] = await Promise.all([
                    transaction.get(paymentRef), transaction.get(licenseRef),
                    transaction.get(jobRef), transaction.get(reservationRef)
                ]);
                if (!licenseSnap.exists) throw responseError('No se encontró esta licencia en el historial de tu cuenta.', 404);
                if (paymentSnap.exists) {
                    const existing = paymentSnap.data() || {};
                    const attestation = existing.manualPaymentAttestation || {};
                    const existingLicense = licenseSnap.data() || {};
                    const existingReference = safeText(existingLicense.reference || existingLicense.refCode || existingLicense.contractReference || paymentId);
                    const existingAmount = Number(existingLicense.value ?? existingLicense.finalPrice ?? existingLicense.price);
                    const sameReference = existing.reference === existingReference || existing.refCode === safeText(existingLicense.refCode || existingReference);
                    if (existing.producerId === producerId && existing.source === 'owner_manual_attestation' &&
                        attestation.confirmedBy === producerId && existing.status === 'approved' && sameReference &&
                        Math.round(Number(existing.value) * 100) === Math.round(existingAmount * 100)) {
                        return { alreadyRegistered: true, amount: Number(existing.value) || 0, method: attestation.method || existing.paymentMethod || '' };
                    }
                    throw responseError('Ya existe un registro de pago para esta operación. Actualiza el Facturador; no se reemplazará.', 409);
                }
                if (jobSnap.exists || reservationSnap.exists) {
                    throw responseError('Ya existe un trabajo o reserva SRI para esta operación. No se creará un segundo registro.', 409);
                }

                const license = licenseSnap.data() || {};
                const built = eligibleLicense(
                    license, paymentId, producerId,
                    paymentMethod, req.body.confirmManualPayment, confirmedAt
                );
                const duplicateChecks = [
                    ['reference', built.payment.reference],
                    ['refCode', built.payment.refCode]
                ].filter(([, value], index, values) => value && values.findIndex(([, candidate]) => candidate === value) === index);
                const duplicateSnapshots = await Promise.all(duplicateChecks.map(([field, value]) =>
                    transaction.get(db.collection('payments').where(field, '==', value).limit(2))
                ));
                if (duplicateSnapshots.some(snapshot => snapshot.docs?.some(document => document.id !== paymentId))) {
                    throw responseError('Ya existe otro pago con esta referencia. Actualiza y concilia el historial antes de continuar.', 409);
                }
                transaction.create(paymentRef, built.payment);
                transaction.set(licenseRef, built.licensePatch, { merge: true });
                return { alreadyRegistered: false, amount: built.amount, method: built.attestation.method };
            });

            return res.status(result.alreadyRegistered ? 200 : 201).json({
                status: 'approved',
                paymentId,
                paymentMethod: result.method,
                amount: result.amount,
                alreadyRegistered: result.alreadyRegistered,
                message: result.alreadyRegistered
                    ? 'El cobro ya estaba registrado. Actualiza esta fila; todavía no se emitió factura.'
                    : 'Cobro recibido registrado con tu confirmación. Esto no emitió factura; puedes revisar y solicitar la emisión por separado.'
            });
        } catch (error) {
            const status = Number.isInteger(error.status) ? error.status : 500;
            if (status >= 500) console.error('Error al registrar cobro manual para SRI:', error.name || 'Error');
            return res.status(status).json({ error: status === 500 ? 'No se pudo registrar el cobro manual.' : error.message });
        }
    };
}

export default createSriManualPaymentHandler();
