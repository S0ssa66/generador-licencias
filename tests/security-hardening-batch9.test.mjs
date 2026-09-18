import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
    checkCatalogRateLimit,
    checkArtworkRateLimit,
    resetPublicStoreRateLimitsForTest
} from '../server-handlers/public-store.js';
import publicStoreHandler from '../server-handlers/public-store.js';
import { isSafeArtworkUrl, resolvePublicBeatArtwork } from '../public-beat-utils.js';

const root = process.cwd();

test('server-handlers/public-store.js aplica rate limiting a consultas de catálogo (60 req / 5 min)', () => {
    resetPublicStoreRateLimitsForTest();
    const testIp = '198.51.100.91';
    const now = 3000000;

    for (let i = 1; i <= 60; i++) {
        const check = checkCatalogRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición de catálogo ${i} debe permitirse`);
    }

    const blocked = checkCatalogRateLimit(testIp, now + 700);
    assert.equal(blocked.allowed, false, 'Petición 61 de catálogo debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    const expired = checkCatalogRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana de catálogo');

    resetPublicStoreRateLimitsForTest();
});

test('server-handlers/public-store.js aplica rate limiting a portadas de beats (60 req / 5 min)', () => {
    resetPublicStoreRateLimitsForTest();
    const testIp = '198.51.100.92';
    const now = 4000000;

    for (let i = 1; i <= 60; i++) {
        const check = checkArtworkRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición de portada ${i} debe permitirse`);
    }

    const blocked = checkArtworkRateLimit(testIp, now + 700);
    assert.equal(blocked.allowed, false, 'Petición 61 de portada debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    const expired = checkArtworkRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana de portada');

    resetPublicStoreRateLimitsForTest();
});

test('public-beat-utils.js valida esquemas de URL seguros y descarta esquemas peligrosos', () => {
    // Seguros
    assert.equal(isSafeArtworkUrl('https://example.com/cover.jpg'), true);
    assert.equal(isSafeArtworkUrl('http://localhost:3000/art.png'), true);
    assert.equal(isSafeArtworkUrl('/api/public-artwork?producer=sossa'), true);
    assert.equal(isSafeArtworkUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);

    // Peligrosos / esquemas no permitidos
    assert.equal(isSafeArtworkUrl('javascript:alert(1)'), false);
    assert.equal(isSafeArtworkUrl('javascript:/*--></title></style></textarea></script><svg/onload=alert(1)>'), false);
    assert.equal(isSafeArtworkUrl('data:text/html,<script>alert(1)</script>'), false);
    assert.equal(isSafeArtworkUrl('vbscript:msgbox(1)'), false);
    assert.equal(isSafeArtworkUrl('//evil.com/phish.jpg'), false);
    assert.equal(isSafeArtworkUrl(''), false);
    assert.equal(isSafeArtworkUrl(null), false);

    // resolvePublicBeatArtwork fallback seguro
    const unsafeBeat = { artwork: 'javascript:alert("xss")' };
    const resolvedUnsafe = resolvePublicBeatArtwork(unsafeBeat);
    assert.ok(resolvedUnsafe.startsWith('data:image/svg+xml,'), 'Debe retornar el SVG seguro ante artwork peligroso');
    assert.ok(!resolvedUnsafe.includes('javascript:'), 'No debe propagar el esquema peligroso');

    const safeBeat = { artwork: 'https://cdn.example.com/beats/thumb1.jpg' };
    assert.equal(resolvePublicBeatArtwork(safeBeat), 'https://cdn.example.com/beats/thumb1.jpg');
});

test('server-handlers/public-store.js maneja CORS unificado y preflight OPTIONS con 204', async () => {
    function createMockRes() {
        return {
            statusCode: 200,
            headers: {},
            body: null,
            setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
            status(code) { this.statusCode = code; return this; },
            json(data) { this.body = data; return this; },
            send(data) { this.body = data; return this; },
            end() { return this; }
        };
    }

    // Preflight OPTIONS con origen permitido
    const reqOptions = {
        method: 'OPTIONS',
        headers: { origin: 'https://beatss.app' }
    };
    const resOptions = createMockRes();
    await publicStoreHandler(reqOptions, resOptions);

    assert.equal(resOptions.statusCode, 204);
    assert.equal(resOptions.headers['access-control-allow-origin'], 'https://beatss.app');
    assert.equal(resOptions.headers['vary'], 'Origin');
    assert.ok(resOptions.headers['access-control-allow-methods'].includes('GET'));

    // Origen no confiable
    const reqUntrusted = {
        method: 'OPTIONS',
        headers: { origin: 'https://evil-untrusted.com' }
    };
    const resUntrusted = createMockRes();
    await publicStoreHandler(reqUntrusted, resUntrusted);

    assert.equal(resUntrusted.statusCode, 204);
    assert.equal(resUntrusted.headers['access-control-allow-origin'], undefined, 'No debe permitir orígenes externos maliciosos');

    // Método no permitido
    const reqPost = {
        method: 'POST',
        headers: { origin: 'https://beatss.app' }
    };
    const resPost = createMockRes();
    await publicStoreHandler(reqPost, resPost);
    assert.equal(resPost.statusCode, 405);
});

test('server-handlers/public-store.js y dashboard_modules/accounting.js cumplen validaciones de seguridad estáticas', () => {
    const publicStoreContent = fs.readFileSync(path.join(root, 'server-handlers/public-store.js'), 'utf8');
    assert.ok(publicStoreContent.includes('checkCatalogRateLimit(ip)'), 'public-store debe verificar checkCatalogRateLimit');
    assert.ok(publicStoreContent.includes('checkArtworkRateLimit(ip)'), 'public-store debe verificar checkArtworkRateLimit');
    assert.ok(publicStoreContent.includes('isTrustedBeatssOrigin'), 'public-store debe importar y utilizar isTrustedBeatssOrigin');
    assert.ok(publicStoreContent.includes('Retry-After'), 'public-store debe devolver Retry-After en 429');

    const accountingContent = fs.readFileSync(path.join(root, 'dashboard_modules/accounting.js'), 'utf8');
    assert.ok(accountingContent.includes('sanitizeHtml(favLabel)'), 'accounting.js debe sanitizar favLabel');
    assert.ok(accountingContent.includes('sanitizeHtml(producerName)'), 'accounting.js debe sanitizar producerName');
    assert.ok(accountingContent.includes('sanitizeHtml(lic.beatName || \'N/A\')'), 'accounting.js debe sanitizar beatName');
    assert.ok(accountingContent.includes('sanitizeHtml(lic.buyerName || \'N/A\')'), 'accounting.js debe sanitizar buyerName');
    assert.ok(accountingContent.includes('sanitizeHtml(code.redeemedByEmail)'), 'accounting.js debe sanitizar code.redeemedByEmail');
    assert.ok(accountingContent.includes('sanitizeHtml(code.id)'), 'accounting.js debe sanitizar code.id');
});
