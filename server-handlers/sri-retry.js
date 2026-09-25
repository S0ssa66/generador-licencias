import { getFirestore } from 'firebase-admin/firestore';
import { findInvoice, initFirebaseAdmin, requireSession } from './sri-download.js';
import { enqueueSriJob, hasCompleteSriConfig } from '../api/_sri_queue.js';
import { normalizeSriInvoiceDetails } from '../api/_sri_buyer.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 10;
const RECONCILIATION_STATES = new Set(['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'PENDING_AUTORIZACION', 'CONTINGENCIA']);
const RECONCILABLE_JOB_STATES = new Set(['PENDING', 'CONTINGENCY', 'PROCESSING']);
const RECONCILABLE_RESERVATION_STATES = new Set(['SIGNED_READY', 'SENDING', 'RECEIVED', 'AUTHORIZED']);
const retrySriRateWindows = new Map();

export function isSriWorkerHealthy(worker, now = Date.now()) {
    const heartbeat = worker?.lastHeartbeatAt?.toDate?.() || new Date(worker?.lastHeartbeatAt || 0);
    const heartbeatMs = heartbeat instanceof Date ? heartbeat.getTime() : 0;
    return Number.isFinite(heartbeatMs) && heartbeatMs > 0 &&
        heartbeatMs <= now + 60_000 && now - heartbeatMs <= 10 * 60 * 1000;
}

export function isSriReconciliationCandidate(job, reservation, producerId, now = Date.now()) {
    const jobStatus = String(job?.status || '').toUpperCase();
    const reservationStatus = String(reservation?.status || '').toUpperCase();
    const leaseExpiresAt = Date.parse(String(job?.leaseExpiresAt || ''));
    return Boolean(
        job?.paymentId && job.paymentId === reservation?.paymentId &&
        job.producerId === producerId && reservation?.producerId === producerId &&
        RECONCILABLE_JOB_STATES.has(jobStatus) &&
        !(jobStatus === 'PROCESSING' && Number.isFinite(leaseExpiresAt) && leaseExpiresAt > now) &&
        RECONCILABLE_RESERVATION_STATES.has(reservationStatus) &&
        String(reservation?.accessKey || '').trim() &&
        String(reservation?.sequence || '').trim()
    );
}

export function resetRetrySriRateLimit() {
    retrySriRateWindows.clear();
}

export function checkRetrySriRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = retrySriRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        retrySriRateWindows.set(ip, { start: now, count: 1 });
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
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkRetrySriRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiados intentos de reintento SRI. Por favor espera unos minutos.' });
    }

    try {
        const decoded = await requireSession(req);
        const paymentId = String(req.body?.paymentId || '').trim();
        const action = String(req.body?.action || 'issue').trim().toLowerCase();
        if (req.body?.confirmManualIssue !== true) {
            return res.status(400).json({
                error: action === 'reconcile'
                    ? 'Confirma expresamente la consulta de la clave fiscal existente.'
                    : action === 'unblock'
                    ? 'Confirma expresamente el desbloqueo de esta venta.'
                    : 'Confirma expresamente la emisión fiscal antes de encolarla.'
            });
        }
        if (!['issue', 'reconcile', 'unblock'].includes(action)) return res.status(400).json({ error: 'Acción fiscal inválida.' });
        if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) return res.status(400).json({ error: 'ID de pago inválido' });

        initFirebaseAdmin();
        const db = getFirestore();
        const invoice = await findInvoice(db, paymentId, decoded);
        if (invoice.ref.parent.id !== 'payments' || invoice.data.status !== 'approved') {
            return res.status(409).json({ error: 'Sólo se puede facturar un pago aprobado y registrado.' });
        }
        const currentStatus = invoice.data.sriEstado || '';
        const isReconciliation = RECONCILIATION_STATES.has(String(currentStatus).toUpperCase());
        if (isReconciliation && action !== 'reconcile' && action !== 'unblock') {
            return res.status(409).json({ error: 'Esta venta ya tiene un estado fiscal pendiente. Consulta su clave existente; no solicites otra emisión.' });
        }
        if (action === 'reconcile' && !isReconciliation) {
            return res.status(409).json({ error: 'Esta venta no está marcada para conciliación fiscal.' });
        }
        if (['AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE'].includes(currentStatus)) {
            return res.status(409).json({ error: 'La factura ya fue autorizada; no puede volver a emitirse.' });
        }
        if (['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'].includes(String(invoice.data.sriManualArtifactsStatus || ''))) {
            return res.status(409).json({ error: 'Esta venta ya tiene archivos de una emisión manual. Verifícalos antes de solicitar otra factura.' });
        }
        if (currentStatus.startsWith('ERROR_') || currentStatus.startsWith('RECHAZADO_')) {
            return res.status(409).json({ error: 'Esta factura necesita conciliación manual antes de cualquier nueva emisión.' });
        }
        const reference = invoice.data.reference || invoice.data.refCode || paymentId;
        if (invoice.data.providerLivemode === false || /^cs_test_/i.test(String(reference))) {
            return res.status(409).json({ error: 'Las compras de prueba no generan comprobantes fiscales.' });
        }

        const producerId = invoice.data.producerId || invoice.ownerUid || decoded.uid;
        if (!invoice.data.producerId || invoice.data.producerId !== producerId) {
            return res.status(409).json({ error: 'El pago no tiene un productor válido.' });
        }
        if (action === 'unblock') {
            const reservationSnapshot = await db.collection('sriReservations').doc(paymentId).get();
            const reservation = reservationSnapshot.exists ? reservationSnapshot.data() || {} : {};
            if (reservationSnapshot.exists && reservation.accessKey) {
                return res.status(409).json({
                    error: 'Esta venta ya tiene una clave fiscal reservada en el sistema. No se puede desbloquear; consúltala en el SRI.'
                });
            }
            const updateFields = {
                sriEstado: null,
                sriErrorMensaje: null,
                sriUltimoIntento: null,
                sriUnblockedAt: new Date().toISOString(),
                sriUnblockedBy: decoded.uid,
                sriUnblockedReason: 'owner_unblocked_after_sri_verification'
            };
            await invoice.ref.set(updateFields, { merge: true });
            if (invoice.ref.id !== paymentId) {
                await db.collection('payments').doc(paymentId).set(updateFields, { merge: true }).catch(() => {});
            }
            if (decoded?.uid) {
                await db.collection('users').doc(decoded.uid).collection('licencias').doc(paymentId).set(updateFields, { merge: true }).catch(() => {});
            }
            await db.collection('sriJobs').doc(paymentId).delete().catch(() => {});

            return res.status(200).json({
                unblocked: true,
                status: 'SIN_EMITIR',
                message: 'Venta desbloqueada con éxito. Ya puedes revisar sus datos y emitirla al SRI.'
            });
        }

        const pendingStates = new Set(['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA', 'PENDING_AUTORIZACION']);
        const storedInvoiceDetails = invoice.data.sriInvoiceDetails;
        let invoiceDetails = null;
        if (action === 'reconcile') {
            // Consultar una solicitud ya enviada no necesita volver a pedir los
            // datos del comprador. Antes de armar el trabajo, exige que exista
            // el job y una reserva propia con clave y secuencial consultables.
            const [jobSnapshot, reservationSnapshot] = await Promise.all([
                db.collection('sriJobs').doc(paymentId).get(),
                db.collection('sriReservations').doc(paymentId).get()
            ]);
            const job = jobSnapshot.exists ? jobSnapshot.data() || {} : {};
            const reservation = reservationSnapshot.exists ? reservationSnapshot.data() || {} : {};
            if (!jobSnapshot.exists || !reservationSnapshot.exists ||
                !isSriReconciliationCandidate(job, reservation, producerId)) {
                return res.status(409).json({ error: 'No hay un trabajo y una clave fiscal previa verificables para consultar. No se envió otra factura; revisa esta operación en el portal del SRI.' });
            }
        } else if (pendingStates.has(String(currentStatus).toUpperCase()) && !storedInvoiceDetails) {
            return res.status(409).json({ error: 'Esta solicitud anterior no guardó los datos fiscales del comprador. Concíliala primero en el portal SRI; no la continúes ni la reenvíes a ciegas.' });
        } else {
            try {
                invoiceDetails = normalizeSriInvoiceDetails(storedInvoiceDetails || req.body?.invoiceDetails, invoice.data);
            } catch (error) {
                return res.status(error.status || 400).json({ error: error.message });
            }
        }
        const [publicConfigSnap, privateConfigSnap, sriConfigSnap] = await Promise.all([
            db.collection('users').doc(producerId).collection('config').doc('producer').get(),
            db.collection('users').doc(producerId).collection('private_config').doc('producer').get(),
            db.collection('users').doc(producerId).collection('private_config').doc('sri').get()
        ]);
        const sriConfig = sriConfigSnap.exists ? sriConfigSnap.data() : {};
        const publicConfig = {
            ...(publicConfigSnap.exists ? publicConfigSnap.data() : {}),
            ...sriConfig
        };
        const privateConfig = {
            ...(privateConfigSnap.exists ? privateConfigSnap.data() : {}),
            ...sriConfig
        };
        if (producerId === 'paXbnNbHMMPC31X3hf0oTUx4bbr2') {
            const SOSSA_DEFAULTS = {
                sriRuc: '0803743111001',
                sriRazonSocial: 'DOMINGUEZ SOSA JOAO DAVID',
                sriNombreComercial: 'Sossa Music',
                sriDirMatriz: 'Barrio: SANTAS VAINAS Calle: RIO TABIAZO Intersección: RIO QUININDE, ESMERALDAS',
                sriEstab: '001',
                sriPtoEmi: '001',
                sriAmbiente: '2',
                sriRimpe: 'rimpe_popular',
                sriContabilidad: 'NO',
                sriIvaTarifa: '0',
                sriIvaIncluido: true
            };
            Object.assign(publicConfig, SOSSA_DEFAULTS);
            Object.assign(privateConfig, SOSSA_DEFAULTS);
        }
        if (!hasCompleteSriConfig(publicConfig, privateConfig)) {
            return res.status(409).json({
                error: 'La configuración SRI está incompleta. Guarda el RUC, el certificado .p12/.pfx y su contraseña antes de reintentar.'
            });
        }

        const environment = String(publicConfig.sriAmbiente || '1');
        if (environment !== '2') {
            return res.status(409).json({ error: 'La emisión desde BeatSS requiere que el ambiente SRI esté configurado explícitamente en Producción.' });
        }

        const queued = await enqueueSriJob(db, {
            paymentId,
            producerId,
            publicConfig,
            privateConfig,
            requestedBy: decoded.uid,
            invoiceRequested: true,
            isLivePayment: true,
            manualOverride: true,
            invoiceDetails
        });
        if (!queued.queued) {
            return res.status(409).json({
                error: queued.alreadyProcessing
                    ? 'Esta factura ya está en proceso; espera el resultado antes de volver a solicitarla.'
                    : 'La operación no pudo encolarse para emitir factura.'
            });
        }
        await db.collection('payments').doc(paymentId).set({
            sriManualOverrideConfirmedAt: new Date().toISOString(),
            sriManualOverrideConfirmedBy: decoded.uid,
            sriManualOverrideReason: action === 'reconcile'
                ? 'owner_confirmed_manual_reconciliation'
                : 'owner_confirmed_manual_issue'
        }, { merge: true });
        return res.status(202).json({
            status: queued.alreadyQueued ? 'PENDING' : 'QUEUED',
            reference,
            message: action === 'reconcile'
                ? 'Consulta confirmada para la misma clave fiscal. No se volverá a enviar otra factura.'
                : 'Venta confirmada para emisión manual. Aún no es una factura autorizada.'
        });
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        console.error('Error al encolar reintento SRI:', error.message);
        return res.status(status).json({ error: status === 500 ? 'No se pudo encolar el reintento SRI' : error.message });
    }
}
