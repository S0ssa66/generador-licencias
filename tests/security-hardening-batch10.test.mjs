import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import deunaHandler, {
    checkDeunaQrRateLimit,
    resetDeunaRateLimitsForTest
} from '../api/payments/deuna.js';
import confirmPurchaseHandler from '../api/confirm-purchase.js';

const root = process.cwd();

function createMockReq({ method = 'POST', url = '/', headers = {}, body = null } = {}) {
    let req;
    if (body !== null && typeof body === 'object') {
        const raw = Buffer.from(JSON.stringify(body));
        req = Readable.from([raw]);
    } else {
        req = Readable.from([]);
    }
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:3000', ...headers };
    req.body = body;
    req.query = {};
    return req;
}

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, val) {
            this.headers[name.toLowerCase()] = val;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        end() {
            return this;
        }
    };
}

test('api/payments/deuna.js aplica rate limiting a la generación de QR (30 req / 5 min)', () => {
    resetDeunaRateLimitsForTest();
    const testIp = '198.51.100.150';
    const now = 5000000;

    for (let i = 1; i <= 30; i++) {
        const check = checkDeunaQrRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición QR ${i} debe permitirse`);
    }

    const blocked = checkDeunaQrRateLimit(testIp, now + 500);
    assert.equal(blocked.allowed, false, 'Petición 31 de QR debe ser bloqueada');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds > 0');

    const expired = checkDeunaQrRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetDeunaRateLimitsForTest();
});

test('api/payments/deuna.js maneja CORS y preflights OPTIONS con 204', async () => {
    // OPTIONS preflight con origen de confianza
    const reqOptions = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/deuna/qr',
        headers: { origin: 'https://beatss.app' }
    });
    const resOptions = createMockRes();
    await deunaHandler(reqOptions, resOptions);
    assert.equal(resOptions.statusCode, 204, 'OPTIONS debe responder con status 204');
    assert.equal(resOptions.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resOptions.headers['vary'], 'Origin');

    // Origen no confiable
    const reqUntrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/deuna/qr',
        headers: { origin: 'https://malicious-site.com' }
    });
    const resUntrusted = createMockRes();
    await deunaHandler(reqUntrusted, resUntrusted);
    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined, 'Origen no confiable no debe recibir Access-Control-Allow-Origin');
});

test('api/payments/deuna.js valida y sanitiza entradas en endpoint /qr', async () => {
    resetDeunaRateLimitsForTest();

    // 1. Faltan parámetros
    {
        const req = createMockReq({
            method: 'POST',
            url: '/api/payments/deuna/qr',
            headers: { origin: 'https://beatss.app' },
            body: { purchaseId: 'order_123' } // falta amount
        });
        const res = createMockRes();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 400);
        assert.ok(res.body.error.includes("Faltan parámetros"));
    }

    // 2. purchaseId con caracteres no permitidos (inyección)
    {
        const req = createMockReq({
            method: 'POST',
            url: '/api/payments/deuna/qr',
            headers: { origin: 'https://beatss.app' },
            body: { purchaseId: 'order<script>alert(1)</script>', amount: 25.0 }
        });
        const res = createMockRes();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Identificador de compra inválido.');
    }

    // 3. Monto inválido
    {
        const req = createMockReq({
            method: 'POST',
            url: '/api/payments/deuna/qr',
            headers: { origin: 'https://beatss.app' },
            body: { purchaseId: 'order_valid_123', amount: -10 }
        });
        const res = createMockRes();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 400);
        assert.equal(res.body.error, 'Monto inválido para pago Deuna.');
    }

    // 4. Petición válida genera deeplink y qrUrl seguros
    {
        const req = createMockReq({
            method: 'POST',
            url: '/api/payments/deuna/qr',
            headers: { origin: 'https://beatss.app' },
            body: {
                purchaseId: 'order_safe_456',
                amount: 30,
                deunaPhone: '099-123-4567'
            }
        });
        const res = createMockRes();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 200);
        assert.equal(res.body.status, 'success');
        assert.equal(res.body.deeplink, 'deuna://payment?phone=0991234567&amount=30.00&description=BEATSS-order_safe_456');
        assert.ok(res.body.qrUrl.startsWith('https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl='));
    }

    resetDeunaRateLimitsForTest();
});

test('api/confirm-purchase.js maneja CORS con orígenes confiables y preflights OPTIONS con 204', async () => {
    // OPTIONS con origen confiable
    const reqTrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/confirm-purchase',
        headers: { origin: 'https://beatss.app' }
    });
    const resTrusted = createMockRes();
    await confirmPurchaseHandler(reqTrusted, resTrusted);
    assert.equal(resTrusted.statusCode, 204, 'OPTIONS debe responder 204');
    assert.equal(resTrusted.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resTrusted.headers['vary'], 'Origin');

    // OPTIONS con origen no confiable
    const reqUntrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/confirm-purchase',
        headers: { origin: 'https://untrusted-site.org' }
    });
    const resUntrusted = createMockRes();
    await confirmPurchaseHandler(reqUntrusted, resUntrusted);
    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined);
});

test('checkout.js previene DOM XSS e inyección en métodos de pago y portadas', () => {
    const checkoutSrc = fs.readFileSync(path.join(root, 'checkout.js'), 'utf8');

    // Validación de makeCopyBtn seguro
    assert.ok(
        checkoutSrc.includes('decodeURIComponent') && checkoutSrc.includes('encodeURIComponent'),
        'checkout.js debe codificar y decodificar parámetros en makeCopyBtn para evitar escape de atributos HTML'
    );

    // Sanitización de datos bancarios de productores
    assert.ok(
        checkoutSrc.includes('sanitizeHtml(deunaPhone)') &&
        checkoutSrc.includes('sanitizeHtml(pichinchaAcc)') &&
        checkoutSrc.includes('sanitizeHtml(guayaquilAcc)'),
        'checkout.js debe aplicar sanitizeHtml a cuentas bancarias y teléfonos de productores'
    );

    // Validación segura de URL de portadas en checkout
    assert.ok(
        checkoutSrc.includes('isSafeArtworkUrl'),
        'checkout.js debe validar URLs de portadas con isSafeArtworkUrl'
    );
});
