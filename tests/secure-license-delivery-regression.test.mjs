import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('las entregas del Studio y del checkout usan el endpoint seguro', async () => {
    const [editor, checkout] = await Promise.all([read('editor.js'), read('checkout.js')]);
    assert.match(editor, /fetch\('\/api\/license-delivery'/);
    assert.match(checkout, /fetch\('\/api\/license-delivery'/);
    assert.match(editor, /sendEmailDelivery\(paymentId = ''\)/);
    assert.doesNotMatch(editor, /href="\$\{mp3\}"/);
    assert.doesNotMatch(editor, /href="\$\{wav\}"/);
    assert.doesNotMatch(editor, /href="\$\{stems\}"/);
    assert.doesNotMatch(checkout, /href="\$\{mp3\}"/);
    assert.doesNotMatch(checkout, /href="\$\{wav\}"/);
    assert.doesNotMatch(checkout, /href="\$\{stems\}"/);
});

test('la ruta segura está consolidada y el proxy privado conserva su rechazo', async () => {
    const [order, vercel, proxy, handler] = await Promise.all([
        read('api/order.js'),
        read('vercel.json'),
        read('api/proxy-audio.js'),
        read('server-handlers/secure-license-delivery.js')
    ]);
    assert.match(order, /'secure-license-delivery': secureLicenseDelivery/);
    assert.match(vercel, /"source": "\/api\/license-delivery"/);
    assert.match(proxy, /requiere autenticación o una firma de descarga válida/);
    assert.match(proxy, /Content-Disposition/);
    assert.match(proxy, /buildPurchasedAudioFilename/);
    assert.match(handler, /notifyPurchaseDelivery/);
    assert.match(handler, /purchasePortalUrl/);
    assert.match(handler, /verifyPaymentStatusToken/);
    assert.doesNotMatch(handler, /rawUrl/);
});

test('aprobar una venta vincula el envío al paymentId real', async () => {
    const sales = await read('dashboard_modules/sales.js');
    const calls = sales.match(/sendEmailDelivery\(paymentId\)/g) || [];
    assert.equal(calls.length, 2);
    assert.doesNotMatch(sales, /const deliverySucceeded = await sendEmailDelivery\(\);/);
});

test('secure-license-delivery sincroniza la entrega en users/{producerId}/licencias para el historial', async () => {
    const handler = await read('server-handlers/secure-license-delivery.js');
    assert.match(handler, /db\.collection\('users'\)\.doc\(producerId\)\.collection\('licencias'\)\.doc\(paymentId\)/);
    assert.match(handler, /userLicenseRef\.set\(/);
    assert.match(handler, /refCode:\s*contractReference/);
    assert.match(handler, /contractPdfUrl/);
});

