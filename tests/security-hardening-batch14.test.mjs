import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { isSafeReceiptUrl } from '../dashboard_modules/accounting.js';
import accountHandler from '../api/account.js';
import orderHandler from '../api/order.js';
import stripeHandler from '../api/stripe.js';
import stripeRetryHandler from '../server-handlers/stripe-retry-deliveries.js';
import publicStoreHandler from '../server-handlers/public-store.js';
import logDownloadHandler from '../server-handlers/log-download.js';
import paymentStatusHandler from '../server-handlers/payment-status.js';
import accountDeletionHandler from '../server-handlers/account-deletion-request.js';
import convertReferralHandler from '../api/convert-referral.js';

function createMockRes() {
    const headers = {};
    return {
        statusCode: 200,
        body: null,
        ended: false,
        setHeader(key, value) {
            headers[key.toLowerCase()] = value;
        },
        getHeader(key) {
            return headers[key.toLowerCase()];
        },
        getHeaders() {
            return { ...headers };
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            this.ended = true;
            return this;
        },
        send(payload) {
            this.body = payload;
            this.ended = true;
            return this;
        },
        end() {
            this.ended = true;
            return this;
        }
    };
}

test('Lote 14: isSafeReceiptUrl valida esquemas seguros y bloquea javascript/esquemas inseguros', () => {
    assert.strictEqual(isSafeReceiptUrl('https://firebasestorage.googleapis.com/v0/b/app/o/receipts%2Fpic.jpg?alt=media'), true);
    assert.strictEqual(isSafeReceiptUrl('https://beatss.app/receipts/test.png'), true);
    assert.strictEqual(isSafeReceiptUrl('blob:https://beatss.app/123e4567-e89b-12d3-a456-426614174000'), true);
    assert.strictEqual(isSafeReceiptUrl('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA'), true);
    assert.strictEqual(isSafeReceiptUrl('data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD'), true);
    assert.strictEqual(isSafeReceiptUrl('/receipts/local.jpg'), true);

    // Vectores de ataque bloqueados
    assert.strictEqual(isSafeReceiptUrl('javascript:alert(1)'), false);
    assert.strictEqual(isSafeReceiptUrl('JAVASCRIPT:alert(document.domain)'), false);
    assert.strictEqual(isSafeReceiptUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), false);
    assert.strictEqual(isSafeReceiptUrl('//evil.com/phishing.jpg'), false);
    assert.strictEqual(isSafeReceiptUrl(''), false);
    assert.strictEqual(isSafeReceiptUrl(null), false);
    assert.strictEqual(isSafeReceiptUrl(undefined), false);
});

test('Lote 14: accounting.js elimina inline onclick y sanitiza campos de pagos pendientes y analítica', () => {
    const accountingSrc = fs.readFileSync(path.resolve('dashboard_modules/accounting.js'), 'utf8');

    // No debe contener controladores inline onclick
    assert.doesNotMatch(accountingSrc, /onclick=["']viewReceiptLarge\(/, 'No debe haber onclick inline para viewReceiptLarge');
    assert.doesNotMatch(accountingSrc, /onclick=["']approvePaymentAdmin\(/, 'No debe haber onclick inline para approvePaymentAdmin');
    assert.doesNotMatch(accountingSrc, /onclick=["']rejectPaymentAdmin\(/, 'No debe haber onclick inline para rejectPaymentAdmin');
    assert.doesNotMatch(accountingSrc, /onclick=["']deactivateVipCodeAdmin\(/, 'No debe haber onclick inline para deactivateVipCodeAdmin');

    // Debe contener las clases y listeners delegados seguros
    assert.match(accountingSrc, /btn-admin-view-receipt/);
    assert.match(accountingSrc, /btn-admin-approve-payment/);
    assert.match(accountingSrc, /btn-admin-reject-payment/);
    assert.match(accountingSrc, /btn-admin-deactivate-vip/);

    // Debe sanitizar campos en loadPendingPaymentsAdmin
    assert.match(accountingSrc, /const cleanEmail = sanitizeHtml\(pay\.userEmail/);
    assert.match(accountingSrc, /const cleanUid = sanitizeHtml\(pay\.userId/);
    assert.match(accountingSrc, /const cleanAka = sanitizeHtml\(pay\.aka/);
    assert.match(accountingSrc, /const cleanMethod = sanitizeHtml\(pay\.method/);
    assert.match(accountingSrc, /const cleanRef = sanitizeHtml\(pay\.reference/);
    assert.match(accountingSrc, /Activo: \$\{sanitizeHtml\(s\.lastActiveDate/);
});

test('Lote 14: dispatchers api/account, api/order y api/stripe emiten Cache-Control: private, no-store en 404', async () => {
    const req = { url: '/api/account?route=non-existent', query: { route: 'non-existent' }, headers: {} };
    
    // api/account
    const resAccount = createMockRes();
    await accountHandler(req, resAccount);
    assert.strictEqual(resAccount.statusCode, 404);
    assert.strictEqual(resAccount.getHeader('cache-control'), 'private, no-store');

    // api/order
    const resOrder = createMockRes();
    await orderHandler({ url: '/api/order?route=non-existent', query: { route: 'non-existent' }, headers: {} }, resOrder);
    assert.strictEqual(resOrder.statusCode, 404);
    assert.strictEqual(resOrder.getHeader('cache-control'), 'private, no-store');

    // api/stripe
    const resStripe = createMockRes();
    await stripeHandler({ url: '/api/stripe?route=non-existent', query: { route: 'non-existent' }, headers: {} }, resStripe);
    assert.strictEqual(resStripe.statusCode, 404);
    assert.strictEqual(resStripe.getHeader('cache-control'), 'private, no-store');
});

test('Lote 14: stripe-retry-deliveries maneja preflight OPTIONS con 204 y cabeceras Allow / Cache-Control', async () => {
    // OPTIONS
    const resOptions = createMockRes();
    await stripeRetryHandler({ method: 'OPTIONS', headers: {} }, resOptions);
    assert.strictEqual(resOptions.statusCode, 204);
    assert.strictEqual(resOptions.getHeader('allow'), 'GET, OPTIONS');
    assert.strictEqual(resOptions.getHeader('cache-control'), 'private, no-store');

    // POST no permitido
    const resPost = createMockRes();
    await stripeRetryHandler({ method: 'POST', headers: {} }, resPost);
    assert.strictEqual(resPost.statusCode, 405);
    assert.strictEqual(resPost.getHeader('allow'), 'GET, OPTIONS');
    assert.strictEqual(resPost.getHeader('cache-control'), 'private, no-store');
});

test('Lote 14: handlers serverless emiten Allow y Cache-Control: private, no-store ante métodos no permitidos', async () => {
    // public-store POST -> 405 con Allow: GET, OPTIONS
    const resStore = createMockRes();
    await publicStoreHandler({ method: 'POST', headers: {} }, resStore);
    assert.strictEqual(resStore.statusCode, 405);
    assert.strictEqual(resStore.getHeader('allow'), 'GET, OPTIONS');
    assert.strictEqual(resStore.getHeader('cache-control'), 'private, no-store');

    // log-download GET -> 405 con Allow: POST, OPTIONS
    const resLog = createMockRes();
    await logDownloadHandler({ method: 'GET', headers: {} }, resLog);
    assert.strictEqual(resLog.statusCode, 405);
    assert.strictEqual(resLog.getHeader('allow'), 'POST, OPTIONS');
    assert.strictEqual(resLog.getHeader('cache-control'), 'private, no-store');

    // payment-status POST -> 405 con Allow: GET, OPTIONS
    const resStatus = createMockRes();
    await paymentStatusHandler({ method: 'POST', headers: {} }, resStatus);
    assert.strictEqual(resStatus.statusCode, 405);
    assert.strictEqual(resStatus.getHeader('allow'), 'GET, OPTIONS');
    assert.strictEqual(resStatus.getHeader('cache-control'), 'private, no-store');

    // account-deletion GET -> 405 con Allow: POST, OPTIONS
    const resDeletion = createMockRes();
    await accountDeletionHandler({ method: 'GET', headers: {} }, resDeletion);
    assert.strictEqual(resDeletion.statusCode, 405);
    assert.strictEqual(resDeletion.getHeader('allow'), 'POST, OPTIONS');
    assert.strictEqual(resDeletion.getHeader('cache-control'), 'private, no-store');

    // convert-referral GET -> 405 con Allow: POST, OPTIONS
    const resReferral = createMockRes();
    await convertReferralHandler({ method: 'GET', headers: {} }, resReferral);
    assert.strictEqual(resReferral.statusCode, 405);
    assert.strictEqual(resReferral.getHeader('allow'), 'POST, OPTIONS');
    assert.strictEqual(resReferral.getHeader('cache-control'), 'private, no-store');
});
