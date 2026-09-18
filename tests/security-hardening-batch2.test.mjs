import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkSessionStatusRateLimit } from '../server-handlers/stripe-session-status.js';
import { checkCouponRateLimit } from '../server-handlers/public-store.js';

const root = new URL('..', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('vercel.json publica Content-Security-Policy estricta y funcional', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const rootHeaders = vercel.headers?.find(h => h.source === '/(.*)')?.headers || [];
    const csp = rootHeaders.find(h => h.key === 'Content-Security-Policy')?.value || '';
    
    assert.ok(csp.length > 0, 'Debe existir la cabecera Content-Security-Policy');
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.ok(csp.includes('https://js.stripe.com'));
    assert.ok(csp.includes('https://www.paypal.com'));
    assert.ok(csp.includes('https://cdn.payphonetodoesposible.com'));
    assert.ok(csp.includes('https://accounts.google.com'));
    assert.ok(csp.includes('https://*.firebaseapp.com'), 'CSP debe permitir https://*.firebaseapp.com en iframes y peticiones');
    assert.ok(csp.includes('https://licencias-musicales.firebaseapp.com'), 'CSP debe permitir el authDomain de Firebase');
    assert.ok(csp.includes('https://www.gstatic.com'), 'CSP debe permitir scripts y recursos de Google/Firebase');
    assert.match(csp, /frame-ancestors 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.match(csp, /base-uri 'self'/);
});

test('stripe-session-status aplica rate limiting por IP para proteger Stripe API y Firestore', () => {
    const testIp = '198.51.100.42';
    const now = 1000000;

    // Primeras 30 solicitudes permitidas
    for (let i = 0; i < 30; i++) {
        const res = checkSessionStatusRateLimit(testIp, now);
        assert.equal(res.allowed, true, `Intento ${i + 1} debe ser permitido`);
    }

    // La solicitud 31 es rechazada
    const blocked = checkSessionStatusRateLimit(testIp, now);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);

    // Al expirar la ventana (5 minutos después = 300_000 ms) se reinicia
    const afterWindow = checkSessionStatusRateLimit(testIp, now + 301000);
    assert.equal(afterWindow.allowed, true);
});

test('public-store limita intentos de validación de cupones por IP contra fuerza bruta', () => {
    const testIp = '203.0.113.88';
    const now = 2000000;

    // Primeras 12 solicitudes permitidas
    for (let i = 0; i < 12; i++) {
        const res = checkCouponRateLimit(testIp, now);
        assert.equal(res.allowed, true, `Intento ${i + 1} debe ser permitido`);
    }

    // El intento 13 es bloqueado
    const blocked = checkCouponRateLimit(testIp, now);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);

    // Al expirar la ventana (10 minutos después = 600_000 ms) se reinicia
    const afterWindow = checkCouponRateLimit(testIp, now + 601000);
    assert.equal(afterWindow.allowed, true);
});
