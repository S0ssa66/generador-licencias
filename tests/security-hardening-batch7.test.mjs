import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { escapeChatHtml, formatChatMessage } from '../chatbot.js';
import { checkDownloadsRateLimit, resetDownloadsRateLimit, getSanitizedClientIp as getDownloadsIp } from '../server-handlers/get-order-downloads.js';
import { checkStripeCheckoutRateLimit, resetStripeCheckoutRateLimit, getSanitizedClientIp as getStripeCheckoutIp } from '../server-handlers/stripe-create-checkout-session.js';
import { checkSriDownloadRateLimit, resetSriDownloadRateLimit, getSanitizedClientIp as getSriDownloadIp } from '../api/_sri_download.js';
import { checkRetrySriRateLimit, resetRetrySriRateLimit, getSanitizedClientIp as getRetrySriIp } from '../api/payments/retry-sri.js';
import { checkDriveUploadRateLimit, resetDriveUploadRateLimit, getSanitizedClientIp as getDriveIp } from '../api/gdrive.js';
import { checkMigrationTicketRateLimit, resetMigrationTicketRateLimit, getSanitizedClientIp as getMigrationIp } from '../server-handlers/beatstars-migration.js';

const root = process.cwd();

test('chatbot.js sanitiza y escapa entidades HTML antes de transformar markdown para prevenir DOM XSS', () => {
    // 1. escapeChatHtml
    const dangerousInput = '<img src=x onerror="alert(1)"> & \' " <script>';
    const escaped = escapeChatHtml(dangerousInput);
    assert.ok(!escaped.includes('<img'), 'No debe conservar tags img sin escapar');
    assert.ok(!escaped.includes('<script>'), 'No debe conservar tags script sin escapar');
    assert.ok(escaped.includes('&lt;img'), 'Debe escapar < como &lt;');
    assert.ok(escaped.includes('&gt;'), 'Debe escapar > como &gt;');
    assert.ok(escaped.includes('&amp;'), 'Debe escapar & como &amp;');
    assert.ok(escaped.includes('&quot;'), 'Debe escapar " como &quot;');
    assert.ok(escaped.includes('&#039;'), "Debe escapar ' como &#039;");

    // 2. formatChatMessage
    const xssMarkdown = '**Alerta:** <script>alert("XSS")</script> y *nota*\nNueva línea';
    const formatted = formatChatMessage(xssMarkdown);
    assert.ok(formatted.includes('<strong>Alerta:</strong>'), 'Debe convertir ** a <strong>');
    assert.ok(formatted.includes('<em>nota</em>'), 'Debe convertir * a <em>');
    assert.ok(formatted.includes('<br/>'), 'Debe convertir \\n a <br/>');
    assert.ok(!formatted.includes('<script>'), 'No debe renderizar tags ejecutables');
    assert.ok(formatted.includes('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;'), 'Script debe quedar completamente neutralizado');

    // 3. Casos borde
    assert.equal(formatChatMessage(''), '');
    assert.equal(formatChatMessage(null), '');
    assert.equal(formatChatMessage(undefined), '');
});

test('server-handlers/get-order-downloads.js aplica rate limiting (60 req / 5 min) y consolida CORS', () => {
    resetDownloadsRateLimit();
    const testIp = '198.51.100.11';
    const now = 1000000;

    for (let i = 1; i <= 60; i++) {
        const check = checkDownloadsRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Descarga ${i} debe permitirse`);
    }

    const blocked = checkDownloadsRateLimit(testIp, now + 700);
    assert.equal(blocked.allowed, false, 'Petición 61 debe bloquearse por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    // Ventana expirada
    const expired = checkDownloadsRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetDownloadsRateLimit();

    // Saneamiento de IP
    const mockReq = { headers: { 'x-vercel-forwarded-for': '203.0.113.199' } };
    assert.equal(getDownloadsIp(mockReq), '203.0.113.199');

    // Comprobar archivo
    const content = fs.readFileSync(path.join(root, 'server-handlers/get-order-downloads.js'), 'utf8');
    assert.ok(content.includes('isTrustedBeatssOrigin'), 'Debe usar isTrustedBeatssOrigin');
    assert.ok(content.includes('checkDownloadsRateLimit(clientIp)'), 'Debe invocar el rate limit en el handler');
    assert.ok(content.includes('res.status(429)'), 'Debe responder con 429 ante exceso');
});

test('server-handlers/stripe-create-checkout-session.js aplica rate limiting (20 req / 5 min)', () => {
    resetStripeCheckoutRateLimit();
    const testIp = '198.51.100.22';
    const now = 2000000;

    for (let i = 1; i <= 20; i++) {
        const check = checkStripeCheckoutRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Sesión Stripe ${i} debe permitirse`);
    }

    const blocked = checkStripeCheckoutRateLimit(testIp, now + 250);
    assert.equal(blocked.allowed, false, 'Sesión 21 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds');

    const expired = checkStripeCheckoutRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetStripeCheckoutRateLimit();

    const mockReq = { headers: { 'x-forwarded-for': '198.51.100.220' } };
    assert.equal(getStripeCheckoutIp(mockReq), '198.51.100.220');

    const content = fs.readFileSync(path.join(root, 'server-handlers/stripe-create-checkout-session.js'), 'utf8');
    assert.ok(content.includes('checkStripeCheckoutRateLimit(clientIp)'), 'Debe invocar checkStripeCheckoutRateLimit');
    assert.ok(content.includes('429'), 'Debe retornar 429');
});

test('api/_sri_download.js y api/payments/retry-sri.js aplican rate limiting en descargas y reintentos SRI', () => {
    // 1. Descargas SRI (30 req / 5 min)
    resetSriDownloadRateLimit();
    const testIpSri = '198.51.100.33';
    const now = 3000000;

    for (let i = 1; i <= 30; i++) {
        const check = checkSriDownloadRateLimit(testIpSri, now + i * 10);
        assert.equal(check.allowed, true, `Descarga SRI ${i} debe permitirse`);
    }

    const blockedSri = checkSriDownloadRateLimit(testIpSri, now + 350);
    assert.equal(blockedSri.allowed, false, 'Descarga SRI 31 debe bloquearse');
    assert.ok(blockedSri.retryAfterSeconds > 0);

    resetSriDownloadRateLimit();

    const mockReqSri = { headers: { 'x-vercel-forwarded-for': '198.51.100.333' } };
    assert.equal(getSriDownloadIp(mockReqSri), '198.51.100.333');

    // 2. Reintentos SRI (10 req / 5 min)
    resetRetrySriRateLimit();
    const testIpRetry = '198.51.100.44';

    for (let i = 1; i <= 10; i++) {
        const check = checkRetrySriRateLimit(testIpRetry, now + i * 10);
        assert.equal(check.allowed, true, `Reintento SRI ${i} debe permitirse`);
    }

    const blockedRetry = checkRetrySriRateLimit(testIpRetry, now + 150);
    assert.equal(blockedRetry.allowed, false, 'Reintento SRI 11 debe bloquearse');
    assert.ok(blockedRetry.retryAfterSeconds > 0);

    resetRetrySriRateLimit();

    const mockReqRetry = { headers: { 'x-vercel-forwarded-for': '198.51.100.444' } };
    assert.equal(getRetrySriIp(mockReqRetry), '198.51.100.444');
});

test('api/gdrive.js aplica rate limiting en la creación de sesiones de subida (20 req / 5 min)', () => {
    resetDriveUploadRateLimit();
    const testIp = '198.51.100.55';
    const now = 4000000;

    for (let i = 1; i <= 20; i++) {
        const check = checkDriveUploadRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Sesión subida GDrive ${i} debe permitirse`);
    }

    const blocked = checkDriveUploadRateLimit(testIp, now + 250);
    assert.equal(blocked.allowed, false, 'Sesión subida GDrive 21 debe ser bloqueada');
    assert.ok(blocked.retryAfterSeconds > 0);

    const expired = checkDriveUploadRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetDriveUploadRateLimit();

    const mockReq = { headers: { 'x-vercel-forwarded-for': '198.51.100.555' } };
    assert.equal(getDriveIp(mockReq), '198.51.100.555');

    const content = fs.readFileSync(path.join(root, 'api/gdrive.js'), 'utf8');
    assert.ok(content.includes('checkDriveUploadRateLimit(clientIp)'), 'Debe chequear rate limit en isUploadSession');
});

test('api/beatstars-migration.js aplica rate limiting en emisión de tickets de migración (15 req / 5 min)', () => {
    resetMigrationTicketRateLimit();
    const testIp = '198.51.100.66';
    const now = 5000000;

    for (let i = 1; i <= 15; i++) {
        const check = checkMigrationTicketRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Ticket migración ${i} debe permitirse`);
    }

    const blocked = checkMigrationTicketRateLimit(testIp, now + 200);
    assert.equal(blocked.allowed, false, 'Ticket migración 16 debe ser bloqueado');
    assert.ok(blocked.retryAfterSeconds > 0);

    const expired = checkMigrationTicketRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetMigrationTicketRateLimit();

    const mockReq = { headers: { 'x-vercel-forwarded-for': '198.51.100.666' } };
    assert.equal(getMigrationIp(mockReq), '198.51.100.666');

    const content = fs.readFileSync(path.join(root, 'server-handlers/beatstars-migration.js'), 'utf8');
    assert.ok(content.includes('checkMigrationTicketRateLimit(clientIp)'), 'Debe chequear rate limit en createTicket');
});
