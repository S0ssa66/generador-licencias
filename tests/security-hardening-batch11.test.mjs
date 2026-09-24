import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { serveSriArtifact } from '../api/_sri_download.js';
import retrySriHandler from '../api/payments/retry-sri.js';
import { isSriWorkerHealthy } from '../server-handlers/sri-retry.js';
import paymentConfigHandler from '../api/payments/config.js';
import gdriveHandler from '../api/gdrive.js';
import beatstarsMigrationHandler from '../api/beatstars-migration.js';

const root = process.cwd();

function createMockReq({ method = 'GET', url = '/', headers = {}, body = null } = {}) {
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
        send(data) {
            this.body = data;
            return this;
        },
        end() {
            return this;
        }
    };
}

test('api/_sri_download.js consolida CORS y preflights OPTIONS con 204', async () => {
    // OPTIONS con origen confiable
    const reqTrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/download-ride?paymentId=test_123',
        headers: { origin: 'https://beatss.app' }
    });
    const resTrusted = createMockRes();
    await serveSriArtifact(reqTrusted, resTrusted, 'ride');
    assert.equal(resTrusted.statusCode, 204, 'OPTIONS debe responder con status 204');
    assert.equal(resTrusted.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resTrusted.headers['vary'], 'Origin');

    // OPTIONS con origen no confiable
    const reqUntrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/download-ride?paymentId=test_123',
        headers: { origin: 'https://evil-cors-test.com' }
    });
    const resUntrusted = createMockRes();
    await serveSriArtifact(reqUntrusted, resUntrusted, 'ride');
    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined);
});

test('api/payments/retry-sri.js consolida CORS y preflights OPTIONS con 204', async () => {
    // OPTIONS con origen confiable
    const reqTrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/retry-sri',
        headers: { origin: 'https://beatss.app' }
    });
    const resTrusted = createMockRes();
    await retrySriHandler(reqTrusted, resTrusted);
    assert.equal(resTrusted.statusCode, 204, 'OPTIONS debe responder con status 204');
    assert.equal(resTrusted.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resTrusted.headers['vary'], 'Origin');

    // OPTIONS con origen no confiable
    const reqUntrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/retry-sri',
        headers: { origin: 'https://attacker.org' }
    });
    const resUntrusted = createMockRes();
    await retrySriHandler(reqUntrusted, resUntrusted);
    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined);
});

test('las rutas fiscales consolidadas conservan preflight y no crean otra función', async () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const expected = {
        '/api/payments/retry-sri': 'retry-sri',
        '/api/payments/download-ride': 'download-ride',
        '/api/payments/download-xml': 'download-xml'
    };
    for (const [source, route] of Object.entries(expected)) {
        assert.ok(vercel.rewrites.some(rule => rule.source === source && rule.destination === `/api/payments/config?route=${route}`));
        const req = createMockReq({
            method: 'OPTIONS',
            url: `/api/payments/config?route=${route}`,
            headers: { origin: 'https://beatss.app' }
        });
        const res = createMockRes();
        await paymentConfigHandler(req, res);
        assert.equal(res.statusCode, 204, source);
        assert.equal(res.headers['access-control-allow-origin'], 'https://beatss.app', source);
    }
    const manualPaymentOptions = createMockReq({
        method: 'OPTIONS',
        url: '/api/payments/config?route=manual-payment-attestation',
        headers: { origin: 'https://beatss.app' }
    });
    const manualPaymentResponse = createMockRes();
    await paymentConfigHandler(manualPaymentOptions, manualPaymentResponse);
    assert.equal(manualPaymentResponse.statusCode, 204);
    assert.equal(manualPaymentResponse.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(manualPaymentResponse.headers['access-control-allow-methods'], 'POST, OPTIONS');

    const ignored = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
    assert.match(ignored, /^api\/payments\/retry-sri\.js$/m);
    assert.match(ignored, /^api\/payments\/download-ride\.js$/m);
    assert.match(ignored, /^api\/payments\/download-xml\.js$/m);
    assert.doesNotMatch(ignored, /^server-handlers\/sri-(retry|download)\.js$/m);
});

test('el indicador del worker sólo reporta saludable un heartbeat fiscal reciente', () => {
    const now = Date.parse('2026-09-19T22:00:00Z');
    assert.equal(isSriWorkerHealthy({}, now), false);
    assert.equal(isSriWorkerHealthy({ lastHeartbeatAt: new Date(now - 11 * 60_000) }, now), false);
    assert.equal(isSriWorkerHealthy({ lastHeartbeatAt: new Date(now - 5 * 60_000) }, now), true);
    assert.equal(isSriWorkerHealthy({ lastHeartbeatAt: new Date(now + 2 * 60_000) }, now), false);
});

test('api/gdrive.js consolida CORS y preflights OPTIONS con 204 en todas sus rutas', async () => {
    const endpoints = [
        '/api/gdrive-status',
        '/api/gdrive-setup',
        '/api/gdrive-upload-session',
        '/api/gdrive-import-email-history'
    ];

    for (const ep of endpoints) {
        // OPTIONS con origen confiable
        const reqTrusted = createMockReq({
            method: 'OPTIONS',
            url: ep,
            headers: { origin: 'https://beatss.app' }
        });
        const resTrusted = createMockRes();
        await gdriveHandler(reqTrusted, resTrusted);
        assert.equal(resTrusted.statusCode, 204, `${ep} OPTIONS debe responder 204`);
        assert.equal(resTrusted.headers['access-control-allow-origin'], 'https://beatss.app');
        assert.equal(resTrusted.headers['vary'], 'Origin');

        // OPTIONS con origen no confiable
        const reqUntrusted = createMockReq({
            method: 'OPTIONS',
            url: ep,
            headers: { origin: 'https://evil-untrusted-app.net' }
        });
        const resUntrusted = createMockRes();
        await gdriveHandler(reqUntrusted, resUntrusted);
        assert.equal(resUntrusted.statusCode, 204);
        assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined, `${ep} no debe emitir CORS para orígenes no confiables`);
    }
});

test('api/beatstars-migration.js consolida CORS con Vary: Origin y orígenes confiables', async () => {
    // OPTIONS con origen confiable
    const reqTrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/beatstars-migration',
        headers: { origin: 'https://beatss.app' }
    });
    const resTrusted = createMockRes();
    await beatstarsMigrationHandler(reqTrusted, resTrusted);
    assert.equal(resTrusted.statusCode, 204);
    assert.equal(resTrusted.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resTrusted.headers['vary'], 'Origin');

    // OPTIONS con origen no confiable
    const reqUntrusted = createMockReq({
        method: 'OPTIONS',
        url: '/api/beatstars-migration',
        headers: { origin: 'https://unauthorized-domain.com' }
    });
    const resUntrusted = createMockRes();
    await beatstarsMigrationHandler(reqUntrusted, resUntrusted);
    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined);
});

test('dashboard_modules/sales.js implementa defensas contra DOM XSS', () => {
    const salesSrc = fs.readFileSync(path.join(root, 'dashboard_modules/sales.js'), 'utf8');

    // Validación de sanitización de pedidos y codificación de IDs en botones
    assert.ok(
        salesSrc.includes('sanitizeHtml(pay.reference') && salesSrc.includes('sanitizeHtml(pay.buyerName'),
        'sales.js debe sanitizar campos de pedidos en la tabla'
    );
    assert.ok(
        salesSrc.includes('decodeURIComponent') && salesSrc.includes('encodeURIComponent'),
        'sales.js debe codificar IDs en botones inline para evitar rompimiento de atributos'
    );
    assert.ok(
        salesSrc.includes('isSafeArtworkUrl'),
        'sales.js debe validar URLs de portadas y comprobantes con isSafeArtworkUrl'
    );
});
