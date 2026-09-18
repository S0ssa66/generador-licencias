import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { checkProxyRateLimit, resetProxyRateLimit, getSanitizedClientIp as getProxyIp } from '../api/proxy-audio.js';
import { checkDeliveryRateLimit, resetDeliveryRateLimit, getSanitizedClientIp as getDeliveryIp } from '../server-handlers/secure-license-delivery.js';
import { checkStatusRateLimit, resetStatusRateLimit, getSanitizedClientIp as getStatusIp } from '../server-handlers/payment-status.js';

const root = process.cwd();

test('api/proxy-audio.js aplica rate limiting y saneamiento de IP en streaming y descargas', () => {
    resetProxyRateLimit();
    const testIp = '198.51.100.99';
    const now = 1000000;

    for (let i = 1; i <= 120; i++) {
        const check = checkProxyRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición ${i} debe permitirse`);
    }

    const blocked = checkProxyRateLimit(testIp, now + 1300);
    assert.equal(blocked.allowed, false, 'Petición 121 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    // Tras expirar la ventana de 5 minutos, debe volver a permitirse
    const expired = checkProxyRateLimit(testIp, now + 5 * 60 * 1000 + 100);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetProxyRateLimit();

    // Saneamiento de IP
    const mockReq = {
        headers: {
            'x-forwarded-for': '192.0.2.1, 198.51.100.200'
        }
    };
    assert.equal(getProxyIp(mockReq), '198.51.100.200');
});

test('api/proxy-audio.js revoca acceso inmediato ante compras canceladas, reembolsadas o disputadas', () => {
    const content = fs.readFileSync(path.join(root, 'api/proxy-audio.js'), 'utf8');
    assert.ok(content.includes('terminalRevokedStatuses'), 'Debe definir estados terminales revocados');
    assert.ok(content.includes('payment?.accessRevoked === true'), 'Debe comprobar el flag accessRevoked');
    assert.ok(
        content.includes('El acceso a este archivo ha sido revocado debido a la cancelación o reembolso de la compra.'),
        'Debe devolver mensaje descriptivo y código 403 al revocar acceso'
    );
});

test('server-handlers/secure-license-delivery.js aplica rate limiting y enmascara errores 500', () => {
    resetDeliveryRateLimit();
    const testIp = '203.0.113.10';
    const now = 2000000;

    for (let i = 1; i <= 10; i++) {
        const check = checkDeliveryRateLimit(testIp, now + i * 50);
        assert.equal(check.allowed, true, `Entrega ${i} debe permitirse`);
    }

    const blocked = checkDeliveryRateLimit(testIp, now + 600);
    assert.equal(blocked.allowed, false, 'Entrega 11 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    // Ventana expirada
    const expired = checkDeliveryRateLimit(testIp, now + 5 * 60 * 1000 + 100);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetDeliveryRateLimit();

    // Saneamiento de IP
    const mockReq = {
        headers: {
            'x-vercel-forwarded-for': '203.0.113.88'
        }
    };
    assert.equal(getDeliveryIp(mockReq), '203.0.113.88');

    // Enmascaramiento de error 500
    const content = fs.readFileSync(path.join(root, 'server-handlers/secure-license-delivery.js'), 'utf8');
    assert.ok(!content.includes('.json({ error: error?.message'), 'No debe devolver error?.message al cliente');
    assert.ok(
        content.includes("res.status(500).json({ error: 'No se pudo completar la entrega segura.' })"),
        'Debe devolver error opaco en fallo 500'
    );
});

test('server-handlers/payment-status.js aplica rate limiting y consolida CORS', () => {
    resetStatusRateLimit();
    const testIp = '198.51.100.77';
    const now = 3000000;

    for (let i = 1; i <= 60; i++) {
        const check = checkStatusRateLimit(testIp, now + i * 20);
        assert.equal(check.allowed, true, `Consulta ${i} debe permitirse`);
    }

    const blocked = checkStatusRateLimit(testIp, now + 1500);
    assert.equal(blocked.allowed, false, 'Consulta 61 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds');

    // Ventana expirada
    const expired = checkStatusRateLimit(testIp, now + 5 * 60 * 1000 + 100);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetStatusRateLimit();

    // Saneamiento de IP
    const mockReq = {
        headers: {
            'x-forwarded-for': '198.51.100.77'
        }
    };
    assert.equal(getStatusIp(mockReq), '198.51.100.77');

    // CORS consolidado
    const content = fs.readFileSync(path.join(root, 'server-handlers/payment-status.js'), 'utf8');
    assert.ok(content.includes("import { isTrustedBeatssOrigin } from '../api/_cors-origin.js'"), 'Debe importar isTrustedBeatssOrigin');
    assert.ok(content.includes('return isTrustedBeatssOrigin(origin) ? origin : null;'), 'Debe utilizar isTrustedBeatssOrigin para CORS');
});

test('clearance.html propaga de forma segura los mensajes de error del servidor a la interfaz', () => {
    const content = fs.readFileSync(path.join(root, 'clearance.html'), 'utf8');
    assert.ok(
        content.includes("showAlert(err.message || 'Ocurrió un error en el servidor al intentar verificar tu licencia. Revisa tu conexión.');"),
        'verifyLicense debe propagar el mensaje de error del servidor'
    );
    assert.ok(
        content.includes("showAlert(err.message || 'No se pudo añadir el canal a la lista blanca. Asegúrate de que el código de licencia sea el correcto.');"),
        'submitWhitelist debe propagar el mensaje de error del servidor'
    );
    assert.ok(
        content.includes('alertText.textContent = text;'),
        'showAlert debe usar textContent para prevenir inyección HTML / DOM XSS'
    );
});
