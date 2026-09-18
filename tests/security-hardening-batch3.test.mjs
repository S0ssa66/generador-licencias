import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Set up minimal browser globals before importing frontend modules in Node
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        location: { hostname: 'localhost', search: '' },
        cart: [],
        localStorage: { setItem: () => {}, getItem: () => null, removeItem: () => {} }
    };
    globalThis.localStorage = globalThis.window.localStorage;
    globalThis.document = { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
}

const { checkVipRateLimit, resetVipRateLimit } = await import('../server-handlers/redeem-vip.js');
const { escapeHtml } = await import('../editor.js');
const { sanitizeInput, sanitizeHtml } = await import('../checkout.js');

const root = process.cwd();

test('server-handlers/get-order-downloads.js excluye datos fiscales y PII sensible de la respuesta pública', () => {
    const fileContent = fs.readFileSync(path.join(root, 'server-handlers/get-order-downloads.js'), 'utf8');
    assert.ok(fileContent.includes('invoiceRuc: _invoiceRuc'), 'Debe omitir invoiceRuc');
    assert.ok(fileContent.includes('invoiceCompany: _invoiceCompany'), 'Debe omitir invoiceCompany');
    assert.ok(fileContent.includes('invoiceAddress: _invoiceAddress'), 'Debe omitir invoiceAddress');
    assert.ok(fileContent.includes('invoiceEmail: _invoiceEmail'), 'Debe omitir invoiceEmail');
    assert.ok(fileContent.includes('sriAccessKey: _sriAccessKey'), 'Debe omitir sriAccessKey');
    assert.ok(fileContent.includes('clientIp: _clientIp'), 'Debe omitir clientIp');
    assert.ok(fileContent.includes('stripeCustomerId: _stripeCustomerId'), 'Debe omitir stripeCustomerId');
});

test('editor.js exporta escapeHtml y sanea entradas en firmas de contratos', () => {
    assert.equal(typeof escapeHtml, 'function');
    assert.equal(escapeHtml('<script>alert("XSS")</script>'), '&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    assert.equal(escapeHtml('John & "Doe"'), 'John &amp; &quot;Doe&quot;');
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');

    const fileContent = fs.readFileSync(path.join(root, 'editor.js'), 'utf8');
    assert.ok(fileContent.includes('const safeRoleL = escapeHtml(signatureRoleL);'), 'Debe escapar roles de firma');
    assert.ok(fileContent.includes('const safeNameR = escapeHtml(signatureNameR);'), 'Debe escapar nombres de comprador');
    assert.ok(fileContent.includes('const safeIdR = escapeHtml(signatureIdR);'), 'Debe escapar identificación del comprador');
});

test('server-handlers/redeem-vip.js aplica rate limiting en canje de códigos VIP', () => {
    resetVipRateLimit();
    const key = 'test-ip-123:user-456';
    const now = 1000000;

    // Primeros 6 intentos permitidos
    for (let i = 1; i <= 6; i++) {
        const result = checkVipRateLimit(key, now + i * 1000);
        assert.equal(result.allowed, true, `Intento ${i} debe ser permitido`);
    }

    // Intento 7 bloqueado
    const blocked = checkVipRateLimit(key, now + 7000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds > 0);

    // Ventana expirada (10 minutos después) se reinicia
    const expired = checkVipRateLimit(key, now + 10 * 60 * 1000 + 1000);
    assert.equal(expired.allowed, true);

    resetVipRateLimit();
});

test('checkout.js sanea entradas contra inyecciones y caracteres de control', () => {
    assert.equal(sanitizeInput('   normal text   '), 'normal text');
    assert.equal(sanitizeInput('<script>bad</script>'), 'bad');
    assert.equal(sanitizeInput('<img src=x onerror=alert(1)>'), '');
    assert.equal(sanitizeInput('"><img src=x onerror=alert(1)>'), '"');
    assert.equal(sanitizeInput('Text with\x00\x08 control chars'), 'Text with control chars');

    assert.equal(sanitizeHtml('<div class="box">O\'Reilly & Sons</div>'), '&lt;div class=&quot;box&quot;&gt;O&#x27;Reilly &amp; Sons&lt;/div&gt;');
});

test('api/payments/deuna.js no filtra error.message interno en respuestas 500', () => {
    const fileContent = fs.readFileSync(path.join(root, 'api/payments/deuna.js'), 'utf8');
    assert.ok(!fileContent.includes('res.status(500).json({ error: error.message })'), 'No debe devolver error.message crudo en 500');
    assert.ok(fileContent.includes('Error interno al generar código de pago Deuna'), 'Debe usar mensaje opaco en QR');
    assert.ok(fileContent.includes('Error interno al confirmar pago Deuna'), 'Debe usar mensaje opaco en simulate');
    assert.ok(fileContent.includes('Error interno al procesar webhook de Deuna'), 'Debe usar mensaje opaco en webhook');
});
