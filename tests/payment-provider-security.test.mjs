import test from 'node:test';
import assert from 'node:assert/strict';
import {
    nextRenewalExpiration,
    paypalApiBase,
    paypalEventDocumentId,
    paypalSubscriptionId,
    verifyPayPalWebhookSignature,
    default as paypalWebhookHandler
} from '../api/payments/webhook.js';
import {
    normalizePayphonePrepare,
    validatePayphoneConfirmation,
    default as payphoneHandler
} from '../api/payments/payphone/confirm.js';
import {
    paymentCapabilities,
    serializePublicPaymentConfig,
    default as paymentConfigHandler
} from '../api/payments/config.js';
import { resolveStripeSettlement } from '../server-handlers/stripe-create-checkout-session.js';
import { normalizeCheckoutLegalAcceptance } from '../server-handlers/legal-acceptance.js';

function responseRecorder() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; }
    };
}

function validPayphoneBody(overrides = {}) {
    return {
        requestId: `po_${'a'.repeat(32)}`,
        producerId: 'producer_123',
        items: [{ beatId: 'beat_123', licenseType: 'premium', price: 0.01 }],
        buyerName: 'Comprador',
        buyerEmail: 'buyer@example.test',
        couponCode: '',
        discountPercent: 99,
        acceptedTerms: true,
        acceptanceTimestamp: new Date().toISOString(),
        termsVersion: '2026-08-14',
        statusTokenHash: 'b'.repeat(64),
        ...overrides
    };
}

test('PayPal usa sandbox por defecto y live solo cuando se declara', () => {
    assert.equal(paypalApiBase({}), 'https://api-m.sandbox.paypal.com');
    assert.equal(paypalApiBase({ PAYPAL_MODE: 'sandbox' }), 'https://api-m.sandbox.paypal.com');
    assert.equal(paypalApiBase({ PAYPAL_MODE: 'live' }), 'https://api-m.paypal.com');
});

test('PayPal genera un ID de evento determinista y extiende desde el vencimiento actual', () => {
    const first = paypalEventDocumentId('WH-EVENT_123');
    assert.equal(first, paypalEventDocumentId('WH-EVENT_123'));
    assert.equal(first.length, 64);
    assert.throws(() => paypalEventDocumentId('../bad'), { code: 'INVALID_EVENT_ID' });

    const now = Date.parse('2026-08-10T00:00:00Z');
    assert.equal(nextRenewalExpiration('2026-08-20T00:00:00Z', now), '2026-09-19T00:00:00.000Z');
    assert.equal(nextRenewalExpiration('', now), '2026-09-09T00:00:00.000Z');
});

test('PayPal usa billing_agreement_id para renovaciones de venta', () => {
    assert.equal(paypalSubscriptionId('PAYMENT.SALE.COMPLETED', {
        id: 'sale-id',
        billing_agreement_id: 'subscription-id'
    }), 'subscription-id');
    assert.equal(paypalSubscriptionId('BILLING.SUBSCRIPTION.ACTIVATED', { id: 'subscription-id' }), 'subscription-id');
});

test('PayPal exige configuración y todas las cabeceras de firma también en sandbox', async () => {
    const req = { headers: {} };
    await assert.rejects(() => verifyPayPalWebhookSignature(req, {}, {}), { code: 'PAYPAL_NOT_CONFIGURED' });

    const env = {
        PAYPAL_MODE: 'sandbox',
        PAYPAL_WEBHOOK_ID: 'webhook-id',
        PAYPAL_CLIENT_ID: 'client-id',
        PAYPAL_CLIENT_SECRET: 'secret'
    };
    const fetchMock = async () => ({ ok: true, json: async () => ({ access_token: 'token' }) });
    await assert.rejects(() => verifyPayPalWebhookSignature(req, {}, env, fetchMock), { code: 'INVALID_SIGNATURE_HEADERS' });
});

test('el handler PayPal falla cerrado antes de tocar Firebase si falta el secreto', async () => {
    const previous = {
        webhook: process.env.PAYPAL_WEBHOOK_ID,
        client: process.env.PAYPAL_CLIENT_ID,
        secret: process.env.PAYPAL_CLIENT_SECRET
    };
    delete process.env.PAYPAL_WEBHOOK_ID;
    delete process.env.PAYPAL_CLIENT_ID;
    delete process.env.PAYPAL_CLIENT_SECRET;
    try {
        const res = responseRecorder();
        await paypalWebhookHandler({
            method: 'POST',
            headers: {},
            body: { id: 'WH-EVENT_123', event_type: 'BILLING.SUBSCRIPTION.ACTIVATED', resource: {} }
        }, res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, 'PAYPAL_NOT_CONFIGURED');
    } finally {
        if (previous.webhook === undefined) delete process.env.PAYPAL_WEBHOOK_ID; else process.env.PAYPAL_WEBHOOK_ID = previous.webhook;
        if (previous.client === undefined) delete process.env.PAYPAL_CLIENT_ID; else process.env.PAYPAL_CLIENT_ID = previous.client;
        if (previous.secret === undefined) delete process.env.PAYPAL_CLIENT_SECRET; else process.env.PAYPAL_CLIENT_SECRET = previous.secret;
    }
});

test('PayPhone normaliza solo punteros e ignora precio y descuento del navegador', () => {
    const normalized = normalizePayphonePrepare(validPayphoneBody());
    assert.deepEqual(normalized.items, [{ beatId: 'beat_123', licenseType: 'premium' }]);
    assert.equal('discountPercent' in normalized, false);
    assert.equal('price' in normalized.items[0], false);
});

test('PayPhone exige click-wrap, credencial y factura completa', () => {
    assert.throws(() => normalizePayphonePrepare(validPayphoneBody({ acceptedTerms: false })), { code: 'TERMS_REQUIRED' });
    assert.throws(() => normalizePayphonePrepare(validPayphoneBody({ statusTokenHash: 'bad' })), { code: 'INVALID_STATUS_CREDENTIAL' });
    assert.throws(() => normalizePayphonePrepare(validPayphoneBody({ invoiceRuc: '123' })), { code: 'INVALID_INVOICE' });
});

test('la aceptación legal exige la versión vigente y una fecha reciente', () => {
    const now = Date.parse('2026-09-13T14:00:00.000Z');
    assert.deepEqual(normalizeCheckoutLegalAcceptance({
        acceptedTerms: true,
        termsVersion: '2026-08-14',
        acceptanceTimestamp: '2026-09-13T13:59:00.000Z'
    }, now), {
        termsVersion: '2026-08-14',
        acceptanceTimestamp: '2026-09-13T13:59:00.000Z'
    });
    assert.throws(() => normalizeCheckoutLegalAcceptance({ acceptedTerms: true, termsVersion: 'old', acceptanceTimestamp: new Date(now).toISOString() }, now), { code: 'TERMS_VERSION_REQUIRED' });
    assert.throws(() => normalizeCheckoutLegalAcceptance({ acceptedTerms: true, termsVersion: '2026-08-14', acceptanceTimestamp: '2026-09-11T13:00:00.000Z' }, now), { code: 'INVALID_ACCEPTANCE' });
});

test('PayPhone verifica estado, ID comercial, proveedor, moneda y centavos exactos', () => {
    const expected = { payphoneId: 1234, clientTxId: 'PAYPHONE-abc123', expectedCents: 7995 };
    const valid = {
        transactionStatus: 'Approved',
        statusCode: 3,
        transactionId: 1234,
        clientTransactionId: 'PAYPHONE-abc123',
        currency: 'USD',
        amount: 7995
    };
    assert.equal(validatePayphoneConfirmation(valid, expected), true);
    assert.throws(() => validatePayphoneConfirmation({ ...valid, amount: 1 }, expected), { code: 'AMOUNT_MISMATCH' });
    assert.throws(() => validatePayphoneConfirmation({ ...valid, clientTransactionId: 'other' }, expected), { code: 'TRANSACTION_MISMATCH' });
    assert.throws(() => validatePayphoneConfirmation({ ...valid, currency: 'EUR' }, expected), { code: 'CURRENCY_MISMATCH' });
    assert.throws(() => validatePayphoneConfirmation({ ...valid, transactionStatus: 'Canceled', statusCode: 2 }, expected), { code: 'PAYMENT_NOT_APPROVED' });
});

test('el handler PayPhone rechaza origen desconocido antes de procesar', async () => {
    const res = responseRecorder();
    await payphoneHandler({ method: 'POST', headers: { origin: 'https://attacker.vercel.app' }, body: {}, socket: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'ORIGIN_DENIED');
});

test('la configuración pública de pagos filtra campos y sanea texto', () => {
    const result = serializePublicPaymentConfig({
        paypalClientId: 'public-id',
        deunaPhone: '+593 999-000',
        deunaName: '<b>Productor</b>',
        paypalClientSecret: 'never-public',
        sriCertificatePassword: 'never-public'
    });
    assert.equal(result.paypalClientId, 'public-id');
    assert.equal(result.deunaPhone, '+593999000');
    assert.equal(result.deunaName, 'Productor');
    assert.equal('paypalClientSecret' in result, false);
    assert.equal('sriCertificatePassword' in result, false);
});

test('Deuna solo se anuncia al cliente cuando existe un secreto de webhook fuerte', () => {
    assert.deepEqual(paymentCapabilities({}), { deuna: false });
    assert.deepEqual(paymentCapabilities({ DEUNA_WEBHOOK_SECRET: 'x'.repeat(31) }), { deuna: false });
    assert.deepEqual(paymentCapabilities({ DEUNA_WEBHOOK_SECRET: 'x'.repeat(32) }), { deuna: true });
});

test('Stripe cobra en plataforma sólo al dueño configurado y usa Connect para otros productores', () => {
    const env = { STRIPE_PLATFORM_PRODUCER_ID: 'platform-owner' };
    assert.deepEqual(resolveStripeSettlement('platform-owner', {}, env), { mode: 'platform' });
    assert.deepEqual(resolveStripeSettlement('producer-2', { stripeConnectAccountId: 'acct_12345678' }, env), {
        mode: 'connect',
        destination: 'acct_12345678'
    });
    assert.equal(resolveStripeSettlement('producer-3', {}, env), null);
});

test('la configuración de pagos rechaza un origen Vercel ajeno', async () => {
    const res = responseRecorder();
    await paymentConfigHandler({ method: 'GET', headers: { origin: 'https://attacker.vercel.app' } }, res);
    assert.equal(res.statusCode, 403);
});
