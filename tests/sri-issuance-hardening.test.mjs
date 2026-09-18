import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { enqueueSriJob, shouldQueueSriInvoice } from '../api/_sri_queue.js';

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

function sriDb(payment, job) {
    const writes = [];
    const ref = (path) => ({
        path,
        collection: name => ref(`${path}/${name}`),
        doc: id => ref(`${path}/${id}`),
        get: async () => ({
            exists: path.startsWith('payments/') ? Boolean(payment) : Boolean(job),
            data: () => path.startsWith('payments/') ? payment : job
        })
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

test('la emisión automática SRI requiere opt-in, solicitud fiscal y pago Live', () => {
    assert.equal(shouldQueueSriInvoice(), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: true, isLivePayment: false }), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: false, isLivePayment: true }), false);
    assert.equal(shouldQueueSriInvoice({ publicConfig: { sriAutoQueueEnabled: true }, invoiceRequested: true, isLivePayment: true }), true);
    assert.equal(shouldQueueSriInvoice({ manualOverride: true }), true);
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
    assert.match(queue, /sriEstado: 'EN_COLA_EMISION'/);
    assert.match(queue, /idempotencyKey: `sri:\$\{paymentId\}`/);
    assert.match(queue, /sriQueueReason: isLivePayment === false \? 'sandbox_payment' : 'producer_opt_in_required'/);
    assert.match(history, /EN COLA DE EMISIÓN/);
    assert.match(history, /EN PROCESO SRI/);
    assert.match(invoicing, /Emite manualmente o activa la cola sólo para pagos Live que soliciten factura/);
    assert.match(invoicing, /Configurado para pruebas/);
    assert.match(invoicing, /no son comprobantes fiscales de producción/);
    assert.match(invoicing, /stateClass\(status\) === 'pending'\s*\? `<span class="sri-facturador-tracking">En seguimiento<\/span>`/);
    assert.match(index, /La cola automática exige pago Live, solicitud de factura y tu activación previa/);
});

test('la firma SRI queda en documento privado y los nuevos artefactos usan Storage', () => {
    const config = read('api/payments/config.js');
    const rules = read('firestore.rules');
    const worker = read('sri_service.py');
    const download = read('api/_sri_download.js');
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

test('la emisión manual requiere confirmación y nunca convierte una prueba en factura fiscal', () => {
    const retry = read('api/payments/retry-sri.js');
    const invoicing = read('dashboard_modules/invoicing.js');
    assert.match(retry, /confirmManualIssue !== true/);
    assert.match(retry, /providerLivemode === false/);
    assert.match(retry, /cs_test_/i);
    assert.match(invoicing, /window\.confirm/);
    assert.match(invoicing, /confirmManualIssue: true/);
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
