import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPurchaseDeliveryEmail,
    deliveryNotificationIsComplete,
    notifyPurchaseDelivery,
    notifyPurchaseOrderDelivery,
    purchasePortalUrl
} from '../api/_purchase-delivery.js';
import { isAuthorizedStripeDeliveryCron } from '../server-handlers/stripe-retry-deliveries.js';

function fakeFirestore(initialPayment) {
    const state = { ...initialPayment };
    const paymentRef = {
        async get() {
            return { exists: true, data: () => ({ ...state }) };
        },
        async update(fields) {
            Object.assign(state, fields);
        }
    };
    const db = {
        collection(name) {
            assert.equal(name, 'payments');
            return { doc: () => paymentRef };
        },
        async runTransaction(callback) {
            return callback({
                get: () => paymentRef.get(),
                update: (_ref, fields) => Object.assign(state, fields)
            });
        }
    };
    return { db, state };
}

function fakeOrderFirestore(initialPayments) {
    const states = new Map(Object.entries(initialPayments).map(([id, value]) => [id, { ...value }]));
    const reference = (id) => ({
        id,
        async get() {
            return { exists: states.has(id), data: () => ({ ...states.get(id) }) };
        },
        async update(fields) {
            Object.assign(states.get(id), fields);
        }
    });
    return {
        states,
        db: {
            collection() {
                return { doc: reference };
            },
            async runTransaction(callback) {
                return callback({
                    get: (ref) => ref.get(),
                    update: (ref, fields) => Object.assign(states.get(ref.id), fields)
                });
            }
        }
    };
}

const configuredProducer = {
    aka: 'BeatSS',
    email: 'soporte@beatss.app',
    emailjsServiceId: 'service_test',
    emailjsTemplateId: 'template_test',
    emailjsPublicKey: 'public_test'
};

test('el enlace de entrega queda ligado al pago y vuelve al dominio permitido', () => {
    const url = new URL(purchasePortalUrl('https://beatss.app/tienda/sossa', 'stripe_123', 'token_abc'));
    assert.equal(url.origin, 'https://beatss.app');
    assert.equal(url.pathname, '/descargas/stripe_123');
    assert.equal(url.searchParams.get('token'), 'token_abc');
    assert.equal(new URL(purchasePortalUrl('javascript:alert(1)', 'p', 't')).origin, 'https://beatss.app');
    assert.equal(new URL(purchasePortalUrl('https://attacker.example', 'p', 't')).origin, 'https://beatss.app');
});

test('el correo de webhook entrega el portal aunque el PDF todavía no exista', () => {
    const payload = buildPurchaseDeliveryEmail({
        payment: { id: 'stripe_123', reference: 'cs_live_123', buyerName: 'Cliente', buyerEmail: 'cliente@example.com', beatName: 'Magic', licenseType: 'basic' },
        producer: configuredProducer,
        portalUrl: 'https://beatss.app/descargas/stripe_123?token=token_abc',
        emailjsPrivateKey: 'private-test-key'
    });
    assert.equal(payload.template_params.to_email, 'cliente@example.com');
    assert.equal(payload.accessToken, 'private-test-key');
    assert.equal(payload.template_params.pdf_url, 'https://beatss.app/descargas/stripe_123?token=token_abc');
    assert.match(payload.template_params.delivery_links, /Abrir compra y descargas/);
    assert.doesNotMatch(payload.template_params.delivery_links, /undefined/);
});

test('el correo mantiene el portal como enlace único aunque el PDF ya exista', () => {
    const portalUrl = 'https://beatss.app/descargas/manual_123?token=token_abc';
    const payload = buildPurchaseDeliveryEmail({
        payment: {
            id: 'manual_123',
            buyerEmail: 'cliente@example.com',
            beatName: 'Wow',
            licenseType: 'basic',
            contractPdfUrl: 'https://firebasestorage.googleapis.com/private-contract.pdf?token=storage-token'
        },
        producer: configuredProducer,
        portalUrl
    });
    assert.equal(payload.template_params.pdf_url, portalUrl);
    assert.match(payload.template_params.delivery_links, /Abrir compra y descargas/);
    assert.doesNotMatch(payload.template_params.delivery_links, /firebasestorage\.googleapis\.com/);
});

test('la cuenta principal puede usar la configuración EmailJS server-only de Vercel', () => {
    const previous = {
        service: process.env.EMAILJS_SERVICE_ID,
        template: process.env.EMAILJS_TEMPLATE_ID,
        publicKey: process.env.EMAILJS_PUBLIC_KEY
    };
    process.env.EMAILJS_SERVICE_ID = 'service_from_env';
    process.env.EMAILJS_TEMPLATE_ID = 'template_from_env';
    process.env.EMAILJS_PUBLIC_KEY = 'public_from_env';
    try {
        const payload = buildPurchaseDeliveryEmail({
            payment: { id: 'stripe_env', buyerEmail: 'cliente@example.com' },
            producer: {},
            portalUrl: 'https://beatss.app/descargas/stripe_env?token=signed'
        });
        assert.equal(payload.service_id, 'service_from_env');
        assert.equal(payload.template_id, 'template_from_env');
        assert.equal(payload.user_id, 'public_from_env');
    } finally {
        for (const [key, value] of [
            ['EMAILJS_SERVICE_ID', previous.service],
            ['EMAILJS_TEMPLATE_ID', previous.template],
            ['EMAILJS_PUBLIC_KEY', previous.publicKey]
        ]) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
        }
    }
});

test('un pago de sandbox queda entregable sin correo externo ni regreso del navegador', async () => {
    const { db, state } = fakeFirestore({
        status: 'approved',
        deliveryStatus: 'awaiting_contract',
        buyerName: 'Prueba',
        buyerEmail: 'buyer@beatss.test',
        beatName: 'Magic',
        licenseType: 'basic',
        reference: 'cs_test_123'
    });
    let externalCalls = 0;
    const result = await notifyPurchaseDelivery({
        db,
        paymentId: 'stripe_test',
        producer: configuredProducer,
        downloadToken: 'signed-token',
        fetchImpl: async () => { externalCalls += 1; return { ok: true }; }
    });
    assert.equal(result.complete, true);
    assert.equal(result.sandbox, true);
    assert.equal(externalCalls, 0);
    assert.equal(state.deliveryStatus, 'portal_ready_sandbox');
    assert.equal(state.deliveryNotificationAttempts, 1);
});

test('los reintentos no duplican el correo de entrega', async () => {
    const { db, state } = fakeFirestore({
        status: 'approved',
        deliveryStatus: 'awaiting_contract',
        buyerName: 'Cliente',
        buyerEmail: 'cliente@example.com',
        beatName: 'Magic',
        licenseType: 'basic',
        reference: 'cs_live_123'
    });
    let externalCalls = 0;
    const options = {
        db,
        paymentId: 'stripe_live',
        producer: configuredProducer,
        downloadToken: 'signed-token',
        fetchImpl: async () => { externalCalls += 1; return { ok: true }; }
    };
    const first = await notifyPurchaseDelivery(options);
    const retry = await notifyPurchaseDelivery(options);
    assert.equal(first.complete, true);
    assert.equal(retry.alreadySent, true);
    assert.equal(externalCalls, 1);
    assert.equal(state.deliveryStatus, 'portal_sent');
    assert.equal(deliveryNotificationIsComplete(state), true);
});

test('un carrito con varios beats produce un solo correo con todos los portales', async () => {
    const base = {
        status: 'approved',
        deliveryStatus: 'awaiting_contract',
        buyerName: 'Cliente',
        buyerEmail: 'cliente@example.com',
        reference: 'cs_live_cart'
    };
    const { db, states } = fakeOrderFirestore({
        stripe_one: { ...base, beatName: 'Magic', licenseType: 'basic' },
        stripe_two: { ...base, beatName: 'Trip', licenseType: 'premium' }
    });
    let externalCalls = 0;
    let sentPayload;
    const fetchImpl = async (_url, options) => {
        externalCalls += 1;
        sentPayload = JSON.parse(options.body);
        return { ok: true };
    };
    const result = await notifyPurchaseOrderDelivery({
        db,
        producer: configuredProducer,
        fetchImpl,
        deliveries: [
            { paymentId: 'stripe_one', beatName: 'Magic', licenseType: 'basic', downloadToken: 'token_one' },
            { paymentId: 'stripe_two', beatName: 'Trip', licenseType: 'premium', downloadToken: 'token_two' }
        ]
    });
    assert.equal(result.complete, true);
    assert.equal(externalCalls, 1);
    assert.match(sentPayload.template_params.delivery_links, /Magic/);
    assert.match(sentPayload.template_params.delivery_links, /Trip/);
    assert.equal(states.get('stripe_one').deliveryStatus, 'portal_sent');
    assert.equal(states.get('stripe_two').deliveryStatus, 'portal_sent');
});

test('un fallo de correo conserva un estado reintentable', async () => {
    const { db, state } = fakeFirestore({
        status: 'approved',
        deliveryStatus: 'awaiting_contract',
        buyerEmail: 'cliente@example.com'
    });
    const result = await notifyPurchaseDelivery({
        db,
        paymentId: 'stripe_retry',
        producer: configuredProducer,
        downloadToken: 'signed-token',
        fetchImpl: async () => ({ ok: false, status: 503 })
    });
    assert.equal(result.complete, false);
    assert.equal(result.errorCode, 'EMAIL_SEND_FAILED');
    assert.equal(state.deliveryStatus, 'awaiting_contract');
    assert.equal(state.deliveryNotificationLeaseUntil, null);
});

test('la recuperación diaria exige el secreto de cron exacto', () => {
    const env = { CRON_SECRET: 'cron-secret-with-enough-randomness' };
    assert.equal(isAuthorizedStripeDeliveryCron({ headers: {} }, env), false);
    assert.equal(isAuthorizedStripeDeliveryCron({ headers: { authorization: 'Bearer wrong' } }, env), false);
    assert.equal(isAuthorizedStripeDeliveryCron({ headers: { authorization: `Bearer ${env.CRON_SECRET}` } }, env), true);
});

test('Vercel programa la recuperación sin crear otra función serverless', async () => {
    const { readFile } = await import('node:fs/promises');
    const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
    assert.deepEqual(vercel.crons, [{ path: '/api/payments/stripe/retry-deliveries', schedule: '0 10 * * *' }]);
    assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === '/api/payments/stripe/retry-deliveries' && rewrite.destination === '/api/stripe?route=retry-deliveries'));
});
