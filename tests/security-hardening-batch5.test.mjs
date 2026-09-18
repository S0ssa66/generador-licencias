import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { checkConfirmRateLimit, resetConfirmRateLimit } from '../api/confirm-purchase.js';
import { checkDeletionRateLimit, resetDeletionRateLimit } from '../server-handlers/account-deletion-request.js';
import { checkLogRateLimit, resetLogRateLimit, getSanitizedClientIp } from '../server-handlers/log-download.js';

const root = process.cwd();

test('Endpoints serverless no filtran details: error.message en respuestas HTTP 500', () => {
    const files = [
        'server-handlers/redeem-vip.js',
        'server-handlers/cancel-subscription.js',
        'server-handlers/activate-pro.js',
        'api/convert-referral.js'
    ];
    for (const file of files) {
        const content = fs.readFileSync(path.join(root, file), 'utf8');
        assert.ok(!content.includes('details: error.message'), `${file} no debe exponer details: error.message`);
        assert.ok(content.includes('Error interno del servidor'), `${file} debe responder con mensaje de error opaco`);
    }
});

test('api/confirm-purchase.js aplica rate limiting en la confirmación de compras de PayPal', () => {
    resetConfirmRateLimit();
    const testIp = '198.51.100.25';
    const now = 2000000;

    for (let i = 1; i <= 15; i++) {
        const check = checkConfirmRateLimit(testIp, now + i * 100);
        assert.equal(check.allowed, true, `Intento ${i} debe ser permitido`);
    }

    const blocked = checkConfirmRateLimit(testIp, now + 1600);
    assert.equal(blocked.allowed, false, 'Intento 16 debe ser bloqueado');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    // Ventana expirada (5 minutos después) se reinicia
    const expired = checkConfirmRateLimit(testIp, now + 5 * 60 * 1000 + 100);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expiración de la ventana');

    resetConfirmRateLimit();
});

test('server-handlers/account-deletion-request.js aplica rate limiting para evitar spam de eliminaciones', () => {
    resetDeletionRateLimit();
    const testKey = '192.0.2.100';
    const now = 3000000;

    for (let i = 1; i <= 5; i++) {
        const check = checkDeletionRateLimit(testKey, now + i * 100);
        assert.equal(check.allowed, true, `Intento ${i} debe ser permitido`);
    }

    const blocked = checkDeletionRateLimit(testKey, now + 600);
    assert.equal(blocked.allowed, false, 'Intento 6 debe ser bloqueado');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds');

    // Ventana expirada (10 minutos después)
    const expired = checkDeletionRateLimit(testKey, now + 10 * 60 * 1000 + 100);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetDeletionRateLimit();
});

test('server-handlers/log-download.js aplica rate limiting, saneamiento de IP y revocación de pedidos', () => {
    resetLogRateLimit();
    const testKey = '203.0.113.50:payment_abc';
    const now = 4000000;

    for (let i = 1; i <= 30; i++) {
        const check = checkLogRateLimit(testKey, now + i * 100);
        assert.equal(check.allowed, true, `Intento ${i} debe ser permitido`);
    }

    const blocked = checkLogRateLimit(testKey, now + 3100);
    assert.equal(blocked.allowed, false, 'Intento 31 debe ser bloqueado');
    assert.ok(blocked.retryAfterSeconds > 0);

    resetLogRateLimit();

    // Saneamiento de IP
    const mockReq = {
        headers: {
            'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178'
        }
    };
    assert.equal(getSanitizedClientIp(mockReq), '150.172.238.178');

    // Revocación de pedidos
    const content = fs.readFileSync(path.join(root, 'server-handlers/log-download.js'), 'utf8');
    assert.ok(content.includes('terminalRevokedStatuses'), 'Debe verificar estados revocados');
    assert.ok(content.includes('paymentData.accessRevoked === true'), 'Debe verificar accessRevoked');
    assert.ok(content.includes('El acceso a las descargas de este pedido ha sido revocado.'), 'Debe devolver 403');
});

test('Endpoints de descarga y reintento SRI usan helper centralizado isTrustedBeatssOrigin', () => {
    const sriDownload = fs.readFileSync(path.join(root, 'api/_sri_download.js'), 'utf8');
    assert.ok(sriDownload.includes("import { isTrustedBeatssOrigin } from './_cors-origin.js'"),
        '_sri_download.js debe importar isTrustedBeatssOrigin');
    assert.ok(sriDownload.includes('isTrustedBeatssOrigin(origin)'),
        '_sri_download.js debe validar con isTrustedBeatssOrigin');

    const retrySri = fs.readFileSync(path.join(root, 'api/payments/retry-sri.js'), 'utf8');
    assert.ok(retrySri.includes("import { isTrustedBeatssOrigin } from '../_cors-origin.js'"),
        'retry-sri.js debe importar isTrustedBeatssOrigin');
    assert.ok(retrySri.includes('isTrustedBeatssOrigin(origin)'),
        'retry-sri.js debe validar con isTrustedBeatssOrigin');
});
