import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sanitizeHtml as sanitizeChartHtml } from '../dashboard_modules/charts.js';
import { cleanContactText, safeContactDocId } from '../dashboard_modules/contacts.js';
import pendingOrderHandler from '../server-handlers/create-pending-order.js';
import payphoneHandler from '../api/payments/payphone/confirm.js';
import stripeWebhookHandler from '../api/payments/stripe/webhook.js';

const root = new URL('..', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

function mockResponse() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(data) { this.body = data; return this; },
        end() { this.ended = true; return this; }
    };
}

test('Lote 13: charts.js sanitiza buyers, beats y leyendas contra Stored DOM XSS', () => {
    // Verificar función de sanitización
    const payload = '<script>alert("xss")</script><img src=x onerror=alert(1)>"\'&';
    const escaped = sanitizeChartHtml(payload);
    assert.ok(!escaped.includes('<script>'));
    assert.ok(!escaped.includes('<img'));
    assert.ok(!escaped.includes('"'));
    assert.ok(!escaped.includes("'"));
    assert.ok(escaped.includes('&lt;script&gt;'));
    assert.ok(escaped.includes('&quot;'));
    assert.ok(escaped.includes('&#x27;'));

    // Verificar código fuente estático
    const chartsSrc = read('dashboard_modules/charts.js');
    assert.ok(chartsSrc.includes('sanitizeHtml(buyer.name)'), 'charts.js debe sanitizar buyer.name');
    assert.ok(chartsSrc.includes('sanitizeHtml(buyer.email'), 'charts.js debe sanitizar buyer.email');
    assert.ok(chartsSrc.includes('sanitizeHtml(beat.name)'), 'charts.js debe sanitizar beat.name');
    assert.ok(chartsSrc.includes('sanitizeHtml(seg.type)'), 'charts.js debe sanitizar seg.type');
});

test('Lote 13: contacts.js sanea datos y genera IDs de Firestore seguros', () => {
    // Saneamiento de texto
    const rawName = '  <script>Bad</script> Juan \x00 Pérez   ';
    const cleaned = cleanContactText(rawName, 50);
    assert.equal(cleaned, 'scriptBad/script Juan Pérez');
    assert.equal(cleanContactText('A'.repeat(120), 50).length, 50);

    // Sanitización de IDs de documento en Firestore
    assert.equal(safeContactDocId('test.buyer+fan@gmail.com'), 'test_buyer_fan@gmail_com');
    assert.equal(safeContactDocId('../path/traversal@evil.com'), '___path_traversal@evil_com');
    assert.equal(safeContactDocId('user#admin?query=1@test.com'), 'user_admin_query_1@test_com');

    // Comprobación de fuente estática
    const contactsSrc = read('dashboard_modules/contacts.js');
    assert.ok(contactsSrc.includes('safeContactDocId(email)'), 'contacts.js debe usar safeContactDocId');
    assert.ok(contactsSrc.includes('cleanContactText(rawName'), 'contacts.js debe usar cleanContactText');
});

test('Lote 13: firestore.rules aplica isValidContact sin reglas write permisivas', () => {
    const rules = read('firestore.rules');
    const contactsSection = rules.match(/match \/contacts\/\{contactId\} \{([\s\S]*?)\n\s*\}/)?.[1] || '';
    assert.ok(contactsSection.length > 0, 'Debe existir match /contacts/{contactId}');
    assert.ok(!contactsSection.includes('allow read, write:'), 'contacts no debe contener allow read, write');
    assert.ok(contactsSection.includes('allow read, delete:'), 'contacts debe limitar lectura y borrado');
    assert.ok(contactsSection.includes('allow create, update:'), 'contacts debe exigir validación en create y update');
    assert.ok(contactsSection.includes('isValidContact()'), 'contacts debe llamar a isValidContact()');
});

test('Lote 13: stripe/webhook.js incluye Cache-Control: private, no-store y Allow: POST', async () => {
    const res = mockResponse();
    await stripeWebhookHandler({ method: 'GET', headers: {} }, res);
    assert.equal(res.statusCode, 405);
    assert.equal(res.headers['cache-control'], 'private, no-store');
    assert.equal(res.headers['allow'], 'POST');
});

test('Lote 13: create-pending-order y payphone devuelven OPTIONS 204 antes del chequeo de origen', async () => {
    // create-pending-order con OPTIONS desde origen no confiable
    const pendingRes = mockResponse();
    await pendingOrderHandler({ method: 'OPTIONS', headers: { origin: 'https://untrusted-site.com' } }, pendingRes);
    assert.equal(pendingRes.statusCode, 204);
    assert.equal(pendingRes.ended, true);
    assert.equal(pendingRes.headers['access-control-allow-origin'], undefined);

    // payphone confirm con OPTIONS desde origen confiable
    const payphoneRes = mockResponse();
    await payphoneHandler({ method: 'OPTIONS', headers: { origin: 'https://beatss.app' } }, payphoneRes);
    assert.equal(payphoneRes.statusCode, 204);
    assert.equal(payphoneRes.ended, true);
    assert.equal(payphoneRes.headers['access-control-allow-origin'], 'https://beatss.app');
});
