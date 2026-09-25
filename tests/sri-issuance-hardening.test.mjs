import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { enqueueSriJob, shouldQueueSriInvoice } from '../api/_sri_queue.js';
import { normalizeSriInvoiceDetails } from '../api/_sri_buyer.js';
import { decodeSriBase64, validateManualSriArtifacts } from '../server-handlers/sri-manual-import.js';
import { manualSriReviewEligible } from '../server-handlers/sri-manual-verify.js';
import { isSriReconciliationCandidate } from '../server-handlers/sri-retry.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function sriDb(payment, job) {
    const writes = [];
    const jobState = { current: job };
    const updateTime = new Date('2026-09-01T00:00:00.000Z');
    const ref = (path) => ({
        path,
        collection: name => ref(`${path}/${name}`),
        doc: id => ref(`${path}/${id}`),
        get: async () => ({
            exists: path.startsWith('payments/') ? Boolean(payment) : Boolean(jobState.current),
            data: () => path.startsWith('payments/') ? payment : jobState.current,
            updateTime
        }),
        set: async (data, options) => {
            jobState.current = { ...(jobState.current || {}), ...data };
            writes.push([path, data, options]);
        },
        update: async (data, precondition) => {
            writes.push([path, data, precondition]);
            jobState.current = { ...(jobState.current || {}), ...data };
        }
    });
    return {
        writes,
        collection: name => ref(name),
        batch: () => ({
            set: (reference, data) => writes.push([reference.path, data]),
            commit: async () => {}
        })
    };
}

test('la emisión manual requiere datos fiscales nominativos completos y una identificación válida', () => {
    const payment = { finalPrice: 30, buyerEmail: 'comprador@example.com' };
    const invoiceDetails = normalizeSriInvoiceDetails({
        mode: 'identified', buyerName: ' Cliente Real ', buyerId: '1710034065',
        buyerAddress: 'Calle 1, Esmeraldas', buyerEmail: ''
    }, payment);
    assert.deepEqual(invoiceDetails, {
        mode: 'identified', buyerName: 'Cliente Real', buyerId: '1710034065',
        buyerAddress: 'Calle 1, Esmeraldas', buyerEmail: 'comprador@example.com'
    });
    const consumerFinal = normalizeSriInvoiceDetails({ mode: 'consumer_final', consumerFinalConfirmed: true }, payment);
    assert.equal(consumerFinal.buyerName, 'CONSUMIDOR FINAL');
    assert.equal(consumerFinal.buyerId, '9999999999999');
    assert.throws(() => normalizeSriInvoiceDetails({ mode: 'consumer_final' }, payment), /confirmación expresa/);
    assert.throws(() => normalizeSriInvoiceDetails({ mode: 'consumer_final', consumerFinalConfirmed: true }, { finalPrice: 50.01 }), /hasta USD 50/);
    assert.throws(() => normalizeSriInvoiceDetails({ mode: 'consumer_final', consumerFinalConfirmed: true }, { value: 50.01 }), /hasta USD 50/);
    assert.throws(() => normalizeSriInvoiceDetails({
        mode: 'identified', buyerName: 'Cliente', buyerId: '1234567890', buyerAddress: 'Calle 1'
    }, payment), /identificación.*no es válida/i);
    assert.throws(() => normalizeSriInvoiceDetails({
        mode: 'identified', buyerName: 'Cliente', buyerId: '1710034065', buyerAddress: ''
    }, payment), /dirección del comprador/);

    const paymentWithValue = { value: 30, buyerEmail: 'comprador@example.com' };
    const detailsWithValue = normalizeSriInvoiceDetails({
        mode: 'identified', buyerName: 'Cliente Real', buyerId: '1710034065',
        buyerAddress: 'Calle 1, Esmeraldas', buyerEmail: ''
    }, paymentWithValue);
    assert.equal(detailsWithValue.buyerName, 'Cliente Real');

    const paymentWithAmount = { amount: 30, buyerEmail: 'comprador@example.com' };
    const detailsWithAmount = normalizeSriInvoiceDetails({
        mode: 'consumer_final', consumerFinalConfirmed: true
    }, paymentWithAmount);
    assert.equal(detailsWithAmount.buyerName, 'CONSUMIDOR FINAL');
});

test('sólo la venta seleccionada y confirmada se arma para el worker persistente', async () => {
    const payment = {
        status: 'approved', producerId: 'owner1', providerLivemode: true,
        reference: 'cs_live_123'
    };
    const publicConfig = {
        sriRuc: '1790016919001', sriRazonSocial: 'BEATSS TEST',
        sriAmbiente: '2', sriEstab: '001', sriPtoEmi: '001'
    };
    const privateConfig = { sriP12Base64: 'fixture', sriP12Password: 'fixture' };
    const invoiceDetails = { mode: 'identified', buyerName: 'Cliente', buyerId: '1710034065', buyerAddress: 'Esmeraldas', buyerEmail: '' };
    const db = sriDb(payment);
    await enqueueSriJob(db, {
        paymentId: 'order1', producerId: 'owner1', publicConfig, privateConfig,
        requestedBy: 'owner1', manualOverride: true, invoiceDetails
    });
    const jobWrite = db.writes.find(([path]) => path === 'sriJobs/order1')?.[1];
    assert.equal(jobWrite.manualIssueRequested, true);
    assert.equal(jobWrite.manualIssueRequestedBy, 'owner1');
    assert.ok(jobWrite.manualIssueRequestedAt);
    assert.ok(db.writes.some(([path, data]) => path === 'payments/order1' && data.sriInvoiceDetails === invoiceDetails));
    assert.ok(db.writes.some(([path, data]) => path === 'users/owner1/licencias/order1' && data.sriInvoiceDetails === invoiceDetails));
});

test('una solicitud antigua pendiente sólo se arma cuando el dueño vuelve a elegirla', async () => {
    const payment = { status: 'approved', producerId: 'owner1', providerLivemode: true, reference: 'cs_live_123' };
    const job = {
        status: 'PENDING', paymentId: 'order1', producerId: 'owner1',
        nextAttemptAt: '2099-01-01T00:00:00.000Z'
    };
    const config = {
        publicConfig: { sriRuc: '1790016919001', sriRazonSocial: 'BEATSS TEST', sriAmbiente: '2', sriEstab: '001', sriPtoEmi: '001' },
        privateConfig: { sriP12Base64: 'fixture', sriP12Password: 'fixture' }
    };
    const db = sriDb(payment, job);
    const result = await enqueueSriJob(db, {
        paymentId: 'order1', producerId: 'owner1', ...config, requestedBy: 'owner1', manualOverride: true
    });
    assert.equal(result.alreadyQueued, true);
    const armWrite = db.writes.find(([path]) => path === 'sriJobs/order1')?.[1];
    assert.equal(armWrite.manualIssueRequested, true);
    assert.equal(armWrite.manualIssueRequestedBy, 'owner1');
    assert.ok(armWrite.nextAttemptAt);
    assert.equal(armWrite.nextAttemptAt, armWrite.updatedAt);
    assert.equal(armWrite.status, undefined, 'la selección manual no debe reiniciar ni cambiar el estado del trabajo');
});

test('la conciliación heredada sólo se habilita con reserva propia consultable y sin lease activo', () => {
    const now = Date.parse('2026-09-24T20:00:00.000Z');
    const job = {
        paymentId: 'order1', producerId: 'owner1', status: 'PENDING',
        leaseExpiresAt: '2026-09-24T19:59:00.000Z'
    };
    const reservation = {
        paymentId: 'order1', producerId: 'owner1', status: 'RECEIVED',
        accessKey: 'existing-key', sequence: '42'
    };
    assert.equal(isSriReconciliationCandidate(job, reservation, 'owner1', now), true);
    assert.equal(isSriReconciliationCandidate(job, { ...reservation, producerId: 'other' }, 'owner1', now), false);
    assert.equal(isSriReconciliationCandidate(job, { ...reservation, accessKey: '' }, 'owner1', now), false);
    assert.equal(isSriReconciliationCandidate(job, { ...reservation, status: 'RESERVED' }, 'owner1', now), false);
    assert.equal(isSriReconciliationCandidate({ ...job, status: 'PROCESSING', leaseExpiresAt: '2026-09-24T20:01:00.000Z' }, reservation, 'owner1', now), false);
    assert.equal(isSriReconciliationCandidate({ ...job, status: 'PROCESSING' }, reservation, 'owner1', now), true);
});

test('reconfirmar PENDING adelanta el backoff y sólo recupera PROCESSING con lease vencido', async () => {
    const payment = { status: 'approved', producerId: 'owner1', providerLivemode: true, reference: 'cs_live_123' };
    const config = {
        publicConfig: { sriRuc: '1790016919001', sriRazonSocial: 'BEATSS TEST', sriAmbiente: '2', sriEstab: '001', sriPtoEmi: '001' },
        privateConfig: { sriP12Base64: 'fixture', sriP12Password: 'fixture' }
    };
    const delayedPending = sriDb(payment, {
        status: 'PENDING', paymentId: 'order1', producerId: 'owner1',
        manualIssueRequested: true, manualIssueRequestedBy: 'owner1',
        nextAttemptAt: '2099-01-01T00:00:00.000Z'
    });
    const pendingResult = await enqueueSriJob(delayedPending, {
        paymentId: 'order1', producerId: 'owner1', ...config,
        requestedBy: 'owner1', manualOverride: true
    });
    assert.equal(pendingResult.alreadyQueued, true);
    const refreshedPending = delayedPending.writes.find(([path]) => path === 'sriJobs/order1')?.[1];
    assert.ok(refreshedPending.nextAttemptAt);
    assert.equal(refreshedPending.manualIssueRequestedBy, 'owner1');

    const processing = sriDb(payment, {
        status: 'PROCESSING', paymentId: 'order1', producerId: 'owner1',
        manualIssueRequested: true, leaseOwner: 'worker', leaseExpiresAt: '2099-01-01T00:00:00.000Z'
    });
    const processingResult = await enqueueSriJob(processing, {
        paymentId: 'order1', producerId: 'owner1', ...config,
        requestedBy: 'owner1', manualOverride: true
    });
    assert.equal(processingResult.alreadyProcessing, true);
    assert.equal(processing.writes.length, 0, 'no debe modificar el lease de otro proceso');

    const expiredProcessing = sriDb(payment, {
        status: 'PROCESSING', paymentId: 'order1', producerId: 'owner1',
        manualIssueRequested: true, leaseOwner: 'worker', leaseExpiresAt: '2020-01-01T00:00:00.000Z'
    });
    const recovery = await enqueueSriJob(expiredProcessing, {
        paymentId: 'order1', producerId: 'owner1', ...config,
        requestedBy: 'owner1', manualOverride: true
    });
    assert.equal(recovery.recoveringExpiredLease, true);
    const recoveryWrite = expiredProcessing.writes.find(([path]) => path === 'sriJobs/order1');
    assert.equal(recoveryWrite[1].status, undefined, 'recuperar no cambia el estado ni libera el lease');
    assert.equal(recoveryWrite[2].lastUpdateTime.getTime(), new Date('2026-09-01T00:00:00.000Z').getTime());
});

test('no encola un pago inexistente, no aprobado, ajeno ni sandbox', async () => {
    const input = { paymentId: 'order1', producerId: 'owner1', manualOverride: true };
    for (const payment of [null, { status: 'pending', producerId: 'owner1' }, { status: 'approved', producerId: 'other' }, { status: 'approved', producerId: 'owner1', providerLivemode: false }]) {
        const db = sriDb(payment);
        await assert.rejects(enqueueSriJob(db, input), /pago aprobado|pago de prueba/i);
        assert.equal(db.writes.length, 0);
    }
});

test('un job DONE huérfano no valida un pago inexistente', async () => {
    const db = sriDb(null, { status: 'DONE' });
    await assert.rejects(enqueueSriJob(db, { paymentId: 'orphan', producerId: 'owner1', manualOverride: true }), /pago aprobado/i);
    assert.equal(db.writes.length, 0);
});

test('el modo manual bloquea una preferencia automática heredada', () => {
    assert.equal(shouldQueueSriInvoice(), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: true, isLivePayment: false }), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: false, isLivePayment: true }), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: true, isLivePayment: true }), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriIssuanceMode: 'automatic', sriAutoQueueEnabled: true }, invoiceRequested: true, isLivePayment: true }), true);
    assert.equal(shouldQueueSriInvoice({ manualOverride: true }), true);
});

test('la solicitud manual dispara un ejecutor web puntual con la sesión del productor', () => {
    const retry = read('server-handlers/sri-retry.js');
    const history = read('dashboard_modules/history.js');
    const once = read('scripts/sri-once.py');
    const api = read('api/sri-issue.py');
    const invoicing = read('dashboard_modules/invoicing.js');
    const sriDocs = read('docs/30_SRI/README.md');
    const retryHandler = retry.slice(retry.indexOf('export default async function handler'));
    assert.match(retry, /environment !== '2'/);
    assert.doesNotMatch(retry, /workerAllowedAmbientes|workerConnected/);
    assert.doesNotMatch(retryHandler, /isSriWorkerHealthy|sriWorkerHealthy/);
    assert.match(retry, /currentStatus\.startsWith\('ERROR_'\)/);
    assert.match(invoicing, /fetch\('\/api\/sri-issue'/);
    assert.match(invoicing, /async function sriHeaders\(forceRefresh = false\)/);
    assert.match(invoicing, /const authHeaders = await sriHeaders\(true\)/);
    assert.match(invoicing, /const authHeaders = await sriHeaders\(true\);[\s\S]{0,240}fetch\('\/api\/payments\/retry-sri'/);
    assert.match(invoicing, /fetch\('\/api\/sri-issue',[\s\S]{0,240}headers: authHeaders/);
    assert.match(invoicing, /expectedEnvironment: '2'/);
    assert.match(sriDocs, /no requiere un worker persistente ni un heartbeat/i);
    assert.ok(sriDocs.includes('`/api/sri-issue` ejecuta de inmediato sólo esa venta'));
    assert.match(sriDocs, /El XML\/RIDE autorizado se\nguarda en Storage privado/i);
    assert.doesNotMatch(sriDocs, /heartbeat reciente de un worker/);
    assert.doesNotMatch(sriDocs, /con ambiente 2, firma privada y heartbeat reciente/);
    assert.doesNotMatch(sriDocs, /El RIDE y el XML autorizado se guardan en Firestore en Base64/);
    assert.match(api, /verify_firebase_id_token/);
    assert.match(api, /expected_owner_uid=identity\['uid'\]/);
    assert.match(api, /confirmManualIssue/);
    assert.match(api, /process_firestore_jobs\([\s\S]{0,160}payment_id_filter=payment_id/);
    assert.doesNotMatch(api, /lastHeartbeatAt|sriWorkerHealthy/);
    assert.match(history, /Solicitud registrada; aún no es una factura autorizada/);
    assert.match(once, /inspect_target_sri_job/);
    assert.match(once, /ISSUE:\{args\.payment_id\}/);
    assert.doesNotMatch(once, /run_worker_cycle|run_worker_forever/);
});

test('los webhooks Stripe propagan solicitud fiscal y modo Live verificable', () => {
    const webhook = read('api/payments/stripe/webhook.js');
    const fulfillment = read('api/_fulfill-beat-purchase.js');
    assert.match(webhook, /invoiceRequested: checkout\.sriInvoiceRequested === true/);
    assert.match(webhook, /providerLivemode: event\.livemode === true && session\.livemode === true/);
    assert.match(fulfillment, /sriEstado: 'NO_EMITIDA'/);
    assert.match(fulfillment, /isLivePayment: providerLivemode === true/);
});

test('la cola expone estados honestos e idempotencia para la emisión', () => {
    const queue = read('api/_sri_queue.js');
    const history = read('dashboard_modules/history.js');
    const invoicing = read('dashboard_modules/invoicing.js');
    const index = read('index.html');
    const retry = read('server-handlers/sri-retry.js');
    assert.match(queue, /sriEstado: 'EN_COLA_EMISION'/);
    assert.match(queue, /idempotencyKey: `sri:\$\{paymentId\}`/);
    assert.match(queue, /manualIssueRequested: manualOverride === true/);
    assert.match(read('sri_contingency.py'), /not payment_id_filter and not _is_owner_manually_requested\(fields\)/);
    assert.match(queue, /sriQueueReason: isLivePayment === false \? 'sandbox_payment' : 'producer_opt_in_required'/);
    assert.match(history, /EN COLA DE EMISIÓN/);
    assert.match(history, /EN PROCESO SRI/);
    assert.match(invoicing, /Tú eliges cada factura/);
    assert.match(invoicing, /data-sri-action="prepare">Ver datos de factura/);
    assert.match(invoicing, /data-sri-action="import">Asociar XML \+ RIDE/);
    assert.match(invoicing, /data-sri-action="issue">Emitir esta venta en SRI/);
    assert.match(invoicing, /Emisión desde BEATSS requiere un pago aprobado/);
    assert.doesNotMatch(invoicing, /Emisión temporalmente indisponible: worker SRI sin conexión/);
    assert.doesNotMatch(invoicing, /sriWorkerAllowedAmbientes\.includes\('2'\)/);
    assert.match(invoicing, /Tú eliges cada factura/);
    assert.match(read('sri_contingency.py'), /_remote_manual_issue_is_armed\(purchase_id, user_uid, token\)/);
    assert.match(retry, /environment !== '2'/);
    assert.match(invoicing, /Este archivo prepara información; no es una factura/);
    assert.match(invoicing, /Consulta únicamente una clave fiscal ya reservada; no se genera otra factura/);
    assert.match(invoicing, /data-sri-action="issue">Consultar \/ conciliar en SRI/);
    assert.match(index, /id="sri-open-official"/);
    assert.match(index, /No se crea una factura automáticamente cuando recibes un pago/);
    assert.match(index, /emisión manual puntual se procesa al confirmar esta venta desde BeatSS y no depende de un worker permanente/);
    assert.doesNotMatch(index, /El worker fiscal debe estar conectado y autorizado para producción/);
});

test('el cobro histórico requiere confirmación manual y queda separado de emitir en SRI', () => {
    const invoicing = read('dashboard_modules/invoicing.js');
    const handler = read('server-handlers/sri-manual-payment.js');
    const api = read('api/payments/config.js');
    assert.match(invoicing, /data-sri-action="attest-payment">Registrar cobro recibido/);
    assert.match(invoicing, /api\/payments\/config\?route=manual-payment-attestation/);
    assert.match(invoicing, /confirmManualPayment: true/);
    assert.match(invoicing, /esto crea un registro auditable basado en tu confirmación/i);
    assert.match(handler, /confirmManualPayment !== true/);
    assert.match(handler, /transaction\.create\(paymentRef, built\.payment\)/);
    assert.match(handler, /transaction\.set\(licenseRef, built\.licensePatch, \{ merge: true \}\)/);
    assert.match(handler, /owner_manual_attestation/);
    assert.match(api, /manual-payment-attestation/);
    assert.doesNotMatch(handler, /enqueueSriJob|fetch\('\/api\/sri-issue'/);
});

test('la firma SRI queda en documento privado y los nuevos artefactos usan Storage', () => {
    const config = read('api/payments/config.js');
    const rules = read('firestore.rules');
    const worker = read('sri_service.py');
    const download = read('server-handlers/sri-download.js');
    assert.match(config, /private_config'\)\.doc\('sri'/);
    assert.match(rules, /match \/private_config\/sri \{\s*allow read, write: if false;/);
    assert.match(worker, /def upload_sri_artifact/);
    assert.match(worker, /sriXmlStoragePath/);
    assert.match(worker, /sriRideStoragePath/);
    assert.match(download, /getStorage\(\)\.bucket\(\)\.file\(objectPath\)\.download\(\)/);
});

test('el facturador compacta el resumen sin ocultar el registro', () => {
    const css = read('facturador.css');
    assert.match(css, /padding: clamp\(14px, 2vw, 22px\)/);
    assert.match(css, /min-height: 68px/);
    assert.match(css, /margin-bottom: 12px/);
    assert.match(css, /grid-template-columns: minmax\(0, 1fr\) 272px/);
});

test('la emisión desde el facturador requiere selección y confirmación expresa; no factura en automático', () => {
    const retry = read('server-handlers/sri-retry.js');
    const invoicing = read('dashboard_modules/invoicing.js');
    const sriService = read('sri_service.py');
    const buyerValidation = read('api/_sri_buyer.js');
    assert.match(retry, /confirmManualIssue !== true/);
    assert.match(retry, /providerLivemode === false/);
    assert.match(retry, /cs_test_/i);
    assert.match(invoicing, /BEATSS preparará, firmará y enviará al SRI únicamente esta venta en PRODUCCIÓN/);
    assert.match(invoicing, /function invoiceConfirmationDetails\(invoice\)/);
    assert.match(invoicing, /collectSriInvoiceDetails\(invoice\)/);
    assert.match(retry, /normalizeSriInvoiceDetails\(storedInvoiceDetails \|\| req\.body\?\.invoiceDetails/);
    assert.match(retry, /no guardó los datos fiscales del comprador/);
    assert.match(buyerValidation, /numericTotal > 50/);
    assert.match(sriService, /_manualFiscalDetailsConfirmed/);
    assert.match(sriService, /'dirComprador': comprador_info\.get\('buyerAddress'\)/);
    assert.match(invoicing, /line\('RUC \/ identificación'/);
    assert.match(invoicing, /Confirma que esta tarifa y modalidad corresponden a tu RUC, régimen y operación/);
    assert.match(invoicing, /Si el SRI autoriza la factura y hay un correo registrado, BEATSS intentará enviar automáticamente el XML y el RIDE/);
    assert.match(invoicing, /Verifica el correo antes de confirmar/);
    assert.match(invoicing, /line\('Fecha', invoice\?\.date\)/);
    assert.match(invoicing, /line\('Importe cobrado', invoice\?\.value == null \? '' : formatMoney\(invoice\.value\)\)/);
    assert.match(invoicing, /\$\{reviewDetails\}/);
    assert.match(invoicing, /confirmManualIssue: true/);
    assert.doesNotMatch(invoicing, /setInterval\(/);
    assert.match(invoicing, /Prueba · no emitir/);
    assert.match(invoicing, /Datos_factura_manual_/);
    assert.match(invoicing, /queueAccepted = true/);
    assert.match(invoicing, /if \(queueAccepted\)/);
    assert.match(invoicing, /Conciliar en el SRI antes de cualquier reintento/);
    assert.match(invoicing, /action: fiscalAction/);
    assert.match(invoicing, /Dirección matriz: \$\{missing\(issuer\.sriDirMatriz\)\}/);
    assert.match(invoicing, /Completa la dirección matriz según tu RUC vigente en Datos fiscales antes de emitir/);
});

test('las consultas de autorización pendientes son de sólo conciliación y nunca pueden crear otra clave', () => {
    const invoicing = read('dashboard_modules/invoicing.js');
    const retry = read('server-handlers/sri-retry.js');
    const api = read('api/sri-issue.py');
    const worker = read('sri_contingency.py');
    const service = read('sri_service.py');
    assert.match(retry, /RECONCILIATION_STATES/);
    assert.match(retry, /action !== 'reconcile'/);
    assert.match(invoicing, /const isReconciliation = PENDING_STATES\.has\(currentStatus\)/);
    assert.match(invoicing, /const confirmationMessage = isReconciliation/);
    assert.doesNotMatch(invoicing, /\bisQueued\b|\bisStaleProcessing\b|\bpendingStatus\b/);
    assert.match(invoicing, /Consulta únicamente una clave fiscal ya reservada; no se genera otra factura/);
    assert.match(retry, /'EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION'/);
    assert.match(invoicing, /const invoiceDetails = isReconciliation \? null/);
    assert.match(retry, /isSriReconciliationCandidate\(job, reservation, producerId\)/);
    assert.match(retry, /pendingStates\.has\(String\(currentStatus\)\.toUpperCase\(\)\) && !storedInvoiceDetails/);
    assert.match(retry, /owner_confirmed_manual_reconciliation/);
    assert.match(api, /RECONCILABLE_RESERVATIONS/);
    assert.match(api, /No se generó ni reenvió una factura/);
    assert.match(api, /reconciliation_only=action == 'reconcile'/);
    assert.match(worker, /reconciliation_only=False/);
    assert.match(worker, /reconciliation_only=reconciliation_only/);
    assert.match(service, /def emitir_factura_sri_background\(reference_id, producer_id, reconciliation_only=False\)/);
    assert.match(service, /reservation_status not in \{'SIGNED_READY', 'SENDING', 'RECEIVED', 'AUTHORIZED'\}/);
    assert.match(api, /No se envió otra factura; consulta esta misma venta más tarde/);
});

test('la emisión manual no referencia variables inexistentes y precarga los campos fiscales heredados', () => {
    const invoicing = read('dashboard_modules/invoicing.js');
    const collector = invoicing.slice(invoicing.indexOf('function collectSriInvoiceDetails'), invoicing.indexOf('\nfunction maskedRuc'));
    const request = invoicing.slice(invoicing.indexOf('async function requestSelectedSriInvoice'), invoicing.indexOf('\nfunction bindInvoicingActions'));
    assert.match(collector, /invoice\?\.invoiceCompany \|\| details\.invoiceCompany/);
    assert.match(collector, /invoice\?\.invoiceRuc \|\| details\.invoiceRuc/);
    assert.match(collector, /invoice\?\.invoiceAddress \|\| details\.invoiceAddress/);
    assert.match(collector, /invoice\?\.invoiceEmail \|\| details\.invoiceEmail/);
    assert.match(request, /const confirmed = window\.confirm\(confirmationMessage\)/);
    assert.doesNotMatch(request, /\bisQueued\b|\bisStaleProcessing\b/);
});

test('las compras Sandbox quedan fuera de métricas fiscales y no pueden consultar ni emitir al SRI', () => {
    const invoicing = read('dashboard_modules/invoicing.js');
    const html = read('index.html');
    assert.match(invoicing, /function isSandboxInvoice\(invoice\)/);
    assert.match(invoicing, /const fiscalHistory = history\.filter\(item => !isSandboxInvoice\(item\)\)/);
    assert.match(invoicing, /if \(\(selected === 'sandbox'\) !== sandbox\) return false;/);
    assert.match(invoicing, /selected === 'all' \|\| selected === 'sandbox'/);
    assert.match(invoicing, /if \(isSandboxInvoice\(invoice\)\)[\s\S]{0,180}Una compra de prueba no puede generar una factura fiscal/);
    assert.match(invoicing, /Prueba · no fiscal · sin acciones SRI/);
    assert.match(invoicing, /const actions = isSandbox[\s\S]{0,200}Prueba · no fiscal · sin acciones SRI/);
    assert.match(html, /<option value="sandbox">Compras de prueba · no fiscales<\/option>/);
});

test('la importación manual valida propietario, pago/registro, archivos y no se marca como autorización de BEATSS', () => {
    const config = read('api/payments/config.js');
    const importer = read('server-handlers/sri-manual-import.js');
    const download = read('server-handlers/sri-download.js');
    assert.match(config, /route === 'manual-sri-import'/);
    assert.match(importer, /requireSession\(req\)/);
    assert.match(importer, /confirmManualAssociation !== true/);
    assert.match(importer, /providerLivemode === false/);
    assert.match(importer, /sriJobSnap/);
    assert.match(importer, /estado fiscal requiere conciliación/);
    assert.match(importer, /AUTORIZADO/);
    assert.match(importer, /MAX_TOTAL_BYTES = 2_000_000/);
    assert.match(importer, /sha256/);
    assert.match(importer, /ARCHIVOS_MANUALES_REGISTRADOS/);
    assert.match(importer, /\['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'\]/);
    assert.match(importer, /no verificó criptográficamente la autorización/);
    assert.match(download, /PENDING_OWNER_VERIFICATION/);
    assert.match(download, /ownLicenseRef/);
    assert.match(read('server-handlers/sri-retry.js'), /ya tiene archivos de una emisión manual/);
});

test('valida el XML/RIDE subido y rechaza autorización falsa, RUC ajeno y firmas de archivo inválidas', () => {
    const key = '1234567890123456789012345678901234567890123456789';
    const ruc = '0801234567001';
    const buyerId = '0912345678';
    const xml = Buffer.from(`<autorizacion><estado>AUTORIZADO</estado><numeroAutorizacion>${key}</numeroAutorizacion><comprobante><![CDATA[<?xml version="1.0"?><factura id="comprobante" version="1.1.0"><infoTributaria><ambiente>2</ambiente><tipoEmision>1</tipoEmision><razonSocial>Emisor</razonSocial><ruc>${ruc}</ruc><claveAcceso>${key}</claveAcceso><codDoc>01</codDoc></infoTributaria><infoFactura><identificacionComprador>${buyerId}</identificacionComprador><totalSinImpuestos>26.09</totalSinImpuestos><importeTotal>30.00</importeTotal></infoFactura></factura>]]></comprobante></autorizacion>`);
    const pdf = Buffer.from('%PDF-1.4\nfixture\n%%EOF');
    const valid = validateManualSriArtifacts(xml, pdf, ruc, { buyerId, value: 30 });
    assert.equal(valid.xmlText, xml.toString('utf8'));
    assert.equal(valid.accessKey, key);
    assert.equal(valid.invoice.issuerRuc, ruc);
    assert.equal(valid.invoice.buyerId, buyerId);
    assert.equal(valid.invoice.total, 30);
    assert.throws(() => validateManualSriArtifacts(Buffer.from('<autorizacion><estado>RECHAZADO</estado></autorizacion>'), pdf, ruc), /AUTORIZADO/);
    assert.throws(() => validateManualSriArtifacts(xml, pdf, '1790012345001', { buyerId, value: 30 }), /RUC emisor/);
    assert.throws(() => validateManualSriArtifacts(xml, pdf, ruc, { buyerId: '1798765432', value: 30 }), /identificación del comprador/);
    assert.throws(() => validateManualSriArtifacts(xml, pdf, ruc, { buyerId, value: 29.99 }), /total de la factura XML/);
    const mismatchedKey = Buffer.from(xml.toString('utf8').replace(`<claveAcceso>${key}</claveAcceso>`, '<claveAcceso>9999999999999999999999999999999999999999999999999</claveAcceso>'));
    assert.throws(() => validateManualSriArtifacts(mismatchedKey, pdf, ruc, { buyerId, value: 30 }), /no coincide con la autorización/);
    assert.throws(() => validateManualSriArtifacts(xml, Buffer.from('not-a-pdf'), ruc), /RIDE debe ser un PDF/);
    assert.throws(() => validateManualSriArtifacts(Buffer.from(`<!DOCTYPE x [<!ENTITY a "b">]><autorizacion>${key}</autorizacion>`), pdf, ''), /XML no parece/);
    assert.throws(() => decodeSriBase64('not base64!', 'XML'), /formato válido/);
});

test('la confirmación manual es del propietario, comprueba integridad y nunca se etiqueta como autorización automática', () => {
    const record = {
        ownerUid: 'owner1',
        data: {
            sriEstado: 'ARCHIVOS_MANUALES_REGISTRADOS',
            sriManualArtifactsStatus: 'PENDING_OWNER_VERIFICATION',
            sriManualArtifactsSource: 'owner_upload_from_beatss'
        }
    };
    assert.equal(manualSriReviewEligible(record, 'owner1'), true);
    assert.equal(manualSriReviewEligible(record, 'other'), false);
    assert.equal(manualSriReviewEligible({ ...record, data: { ...record.data, sriManualArtifactsSource: 'other' } }, 'owner1'), false);
    const config = read('api/payments/config.js');
    const verify = read('server-handlers/sri-manual-verify.js');
    const importer = read('server-handlers/sri-manual-import.js');
    const retry = read('server-handlers/sri-retry.js');
    const download = read('server-handlers/sri-download.js');
    const invoicing = read('dashboard_modules/invoicing.js');
    const history = read('dashboard_modules/history.js');
    assert.match(config, /route === 'manual-sri-verify'/);
    assert.match(verify, /confirmManualVerification !== true/);
    assert.match(verify, /sriManualArtifactsVerifiedBy/);
    assert.match(verify, /sriManualArtifactsVerifiedAt/);
    assert.match(verify, /OWNER_VERIFIED/);
    assert.match(verify, /sha256\(bytes\)/);
    assert.match(verify, /no equivale a una validación criptográfica.*ni cambia el documento a AUTORIZADO/);
    assert.match(importer, /\['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'\]/);
    assert.match(retry, /\['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'\]/);
    assert.match(download, /ARCHIVOS_MANUALES_VERIFICADOS/);
    assert.match(invoicing, /Confirmé revisión en SRI/);
    assert.match(invoicing, /ARCHIVOS_MANUALES_VERIFICADOS/);
    assert.match(history, /REVISIÓN HUMANA CONFIRMADA/);
});

test('la interfaz no contradice una autorización con errores fiscales obsoletos', () => {
    const invoicing = read('dashboard_modules/invoicing.js');
    assert.match(invoicing, /item\.sriErrorMensaje && status !== 'AUTORIZADO'/);
});

test('el worker protege el secuencial, aplica backoff y separa una entrega pendiente de una nueva emisión', () => {
    const worker = read('sri_service.py');
    const contingency = read('sri_contingency.py');
    const config = read('api/payments/config.js');
    assert.match(worker, /def reservar_secuencial_sri/);
    assert.match(worker, /currentDocument\.updateTime/);
    assert.match(worker, /sriReservations/);
    assert.match(worker, /AUTORIZADO_ENTREGA_PENDIENTE/);
    assert.match(contingency, /def _next_attempt_at/);
    assert.match(contingency, /REMOTE_MAX_ATTEMPTS/);
    assert.match(contingency, /REVIEW_REQUIRED/);
    assert.match(config, /sriWorkerHealthy/);
});

test('la descarga SRI admite múltiples identificadores de venta, fallback a bucket explícito y XML autorizado', () => {
    const download = read('server-handlers/sri-download.js');
    const config = read('api/payments/config.js');
    const invoicing = read('dashboard_modules/invoicing.js');
    assert.match(download, /candidateProducers/);
    assert.match(download, /candidatePayments/);
    assert.match(download, /getStorage\(\)\.bucket\(STORAGE_BUCKET\)/);
    assert.match(download, /data\.sriXmlAutorizado/);
    assert.match(download, /Factura_\$\{secuencial\}/);
    assert.match(config, /storageBucket: process\.env\.FIREBASE_STORAGE_BUCKET/);
    assert.match(invoicing, /content-disposition/);
});

