import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import {
    PendingOrderError,
    deterministicPendingPaymentId,
    fingerprintPendingOrder,
    getCanonicalLicensePrice,
    nextRateLimitState,
    normalizePendingCreateBody,
    parseReceiptDataUrl,
    requestIp,
    resolveCanonicalCoupon,
    verifyPendingStatusToken,
    default as pendingOrderHandler
} from '../server-handlers/create-pending-order.js';

const root = new URL('..', import.meta.url);

function validBody(overrides = {}) {
    return {
        action: 'create',
        requestId: `po_${'a'.repeat(32)}`,
        type: 'beat_purchase',
        method: 'transfer',
        producerId: 'producer_123',
        items: [{ beatId: 'beat_123', licenseType: 'premium' }],
        buyerName: 'Comprador de prueba',
        buyerEmail: 'buyer@example.test',
        statusTokenHash: 'b'.repeat(64),
        acceptedTerms: true,
        acceptanceTimestamp: new Date().toISOString(),
        termsVersion: '2026-08-14',
        ...overrides
    };
}

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

test('normaliza punteros de catálogo e ignora precio y descuento del cliente', () => {
    const normalized = normalizePendingCreateBody(validBody({
        items: [{ beatId: 'beat_123', licenseType: 'premium', price: 0.01 }],
        price: 0.01,
        discountPercent: 99
    }));
    assert.deepEqual(normalized.items, [{ beatId: 'beat_123', licenseType: 'premium' }]);
    assert.equal('price' in normalized, false);
    assert.equal('discountPercent' in normalized, false);
});

test('exige términos, método permitido, factura completa y un solo beat en Deuna', () => {
    assert.throws(() => normalizePendingCreateBody(validBody({ acceptedTerms: false })), { code: 'TERMS_REQUIRED' });
    assert.throws(() => normalizePendingCreateBody(validBody({ termsVersion: '2026-01-01' })), { code: 'TERMS_VERSION_REQUIRED' });
    assert.throws(() => normalizePendingCreateBody(validBody({ method: 'cash' })), { code: 'INVALID_METHOD' });
    assert.throws(() => normalizePendingCreateBody(validBody({ invoiceRuc: '123' })), { code: 'INVALID_INVOICE' });
    assert.throws(() => normalizePendingCreateBody(validBody({
        method: 'deuna',
        items: [
            { beatId: 'beat_123', licenseType: 'basic' },
            { beatId: 'beat_456', licenseType: 'basic' }
        ]
    })), { code: 'DEUNA_SINGLE_ITEM' });
});

test('calcula precio canónico desde el beat y usa un respaldo seguro', () => {
    assert.equal(getCanonicalLicensePrice({ price_premium: '79.95' }, 'premium'), 79.95);
    assert.equal(getCanonicalLicensePrice({}, 'basic'), 30);
    assert.throws(() => getCanonicalLicensePrice({}, 'invented'), { code: 'INVALID_LICENSE' });
    assert.throws(() => getCanonicalLicensePrice({ price_exclusive: 100 }, 'exclusive'), { code: 'INVALID_CATALOG_PRICE' });
});

test('solo aplica cupones definidos por el productor', () => {
    const coupons = [{ code: 'VERANO20', discount: 20 }];
    assert.deepEqual(resolveCanonicalCoupon(coupons, 'verano20'), { couponCode: 'VERANO20', discountPercent: 20 });
    assert.deepEqual(resolveCanonicalCoupon(coupons, ''), { couponCode: '', discountPercent: 0 });
    assert.throws(() => resolveCanonicalCoupon(coupons, 'GRATIS99'), { code: 'INVALID_COUPON' });
});

test('genera IDs deterministas e identifica conflictos de idempotencia', () => {
    const first = deterministicPendingPaymentId('po_abc', 'beat_1', 0);
    assert.equal(first, deterministicPendingPaymentId('po_abc', 'beat_1', 0));
    assert.notEqual(first, deterministicPendingPaymentId('po_abc', 'beat_2', 0));
    assert.equal(fingerprintPendingOrder({ a: 1 }), fingerprintPendingOrder({ a: 1 }));
    assert.notEqual(fingerprintPendingOrder({ a: 1 }), fingerprintPendingOrder({ a: 2 }));
});

test('limita intentos y reinicia la ventana al vencer', () => {
    const start = nextRateLimitState({}, 1_000, 2, 10_000);
    assert.equal(start.allowed, true);
    const second = nextRateLimitState(start.state, 2_000, 2, 10_000);
    assert.equal(second.allowed, true);
    const blocked = nextRateLimitState(second.state, 3_000, 2, 10_000);
    assert.equal(blocked.allowed, false);
    assert.equal(blocked.retryAfterSeconds, 7);
    assert.deepEqual(nextRateLimitState(blocked.state, 11_000, 2, 10_000).state, { windowStartMs: 11_000, count: 1 });
});

test('el rate limit prioriza la IP preservada por Vercel', () => {
    assert.equal(requestIp({
        headers: {
            'x-vercel-forwarded-for': '203.0.113.10',
            'x-forwarded-for': '198.51.100.1, 198.51.100.2'
        }
    }), '203.0.113.10');
    assert.equal(requestIp({ headers: { 'x-forwarded-for': '198.51.100.1, 198.51.100.2' } }), '198.51.100.2');
    assert.equal(requestIp({ headers: {}, socket: {} }), 'unknown');
});

test('valida MIME, bytes mágicos, tamaño y credencial del comprobante', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
    const parsed = parseReceiptDataUrl(`data:image/jpeg;base64,${jpeg.toString('base64')}`);
    assert.equal(parsed.mimeType, 'image/jpeg');
    assert.equal(parsed.extension, 'jpg');
    assert.throws(() => parseReceiptDataUrl(`data:image/png;base64,${jpeg.toString('base64')}`), { code: 'INVALID_RECEIPT' });
    assert.throws(() => parseReceiptDataUrl(`data:image/jpeg;base64,${jpeg.toString('base64')}`, 2), { code: 'RECEIPT_TOO_LARGE' });

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    assert.equal(verifyPendingStatusToken(token, hash), true);
    assert.equal(verifyPendingStatusToken(`${token}x`, hash), false);
});

test('el handler bloquea origen, método y cuerpo grande antes de Firebase', async () => {
    const denied = responseRecorder();
    await pendingOrderHandler({ method: 'POST', headers: {}, body: {}, socket: {} }, denied);
    assert.equal(denied.statusCode, 403);

    const wrongMethod = responseRecorder();
    await pendingOrderHandler({ method: 'GET', headers: { origin: 'https://beatss.app' }, body: {}, socket: {} }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);

    const tooLarge = responseRecorder();
    await pendingOrderHandler({
        method: 'POST',
        headers: { origin: 'https://beatss.app', 'content-length': String(4 * 1024 * 1024) },
        body: {},
        socket: {}
    }, tooLarge);
    assert.equal(tooLarge.statusCode, 413);
});

test('bloquea Deuna cuando falta el secreto del webhook antes de Firebase', async () => {
    const previousSigningKey = process.env.DOWNLOAD_SIGNING_KEY;
    const previousDeunaSecret = process.env.DEUNA_WEBHOOK_SECRET;
    process.env.DOWNLOAD_SIGNING_KEY = 's'.repeat(32);
    delete process.env.DEUNA_WEBHOOK_SECRET;
    try {
        const res = responseRecorder();
        await pendingOrderHandler({
            method: 'POST',
            headers: { origin: 'https://beatss.app' },
            body: validBody({ method: 'deuna' }),
            socket: {}
        }, res);
        assert.equal(res.statusCode, 503);
        assert.equal(res.body.code, 'DEUNA_NOT_CONFIGURED');
    } finally {
        if (previousSigningKey === undefined) delete process.env.DOWNLOAD_SIGNING_KEY; else process.env.DOWNLOAD_SIGNING_KEY = previousSigningKey;
        if (previousDeunaSecret === undefined) delete process.env.DEUNA_WEBHOOK_SECRET; else process.env.DEUNA_WEBHOOK_SECRET = previousDeunaSecret;
    }
});

test('las reglas y el checkout no conservan escrituras anónimas de pagos', () => {
    const firestore = fs.readFileSync(new URL('firestore.rules', root), 'utf8');
    const start = firestore.indexOf('match /payments/{paymentId}');
    const end = firestore.indexOf('// Regla para referidos', start);
    const paymentRules = firestore.slice(start, end);
    assert.ok(start >= 0);
    assert.equal(paymentRules.includes('request.auth == null'), false);
    assert.ok(paymentRules.includes('allow create: if isValidSubscriptionPayment();'));

    const storage = fs.readFileSync(new URL('storage.rules', root), 'utf8');
    assert.ok(storage.includes('match /receipts/saas/{userId}/{fileName}'));
    assert.ok(storage.includes("request.resource.contentType.matches('image/(jpeg|png|webp)')"));

    const checkout = fs.readFileSync(new URL('checkout.js', root), 'utf8');
    assert.doesNotMatch(checkout, /addDoc\s*\(\s*collection\(\s*db\s*,\s*["']payments["']/);
    assert.doesNotMatch(checkout, /updateDoc\s*\(\s*doc\(\s*db\s*,\s*["']payments["']/);
});

test('los errores esperados mantienen código y estado HTTP seguros', () => {
    const error = new PendingOrderError(429, 'RATE_LIMITED', 'Demasiadas solicitudes.');
    assert.equal(error.status, 429);
    assert.equal(error.code, 'RATE_LIMITED');
});
