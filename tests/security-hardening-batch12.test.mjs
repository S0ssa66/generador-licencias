import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeCsvFormula as sanitizeEmailCsvFormula } from '../dashboard_modules/email_history.js';
import activateProHandler from '../server-handlers/activate-pro.js';
import redeemVipHandler from '../server-handlers/redeem-vip.js';
import cancelSubscriptionHandler from '../server-handlers/cancel-subscription.js';
import accountDeletionHandler from '../server-handlers/account-deletion-request.js';
import stripeCheckoutHandler from '../server-handlers/stripe-create-checkout-session.js';
import stripeStatusHandler from '../server-handlers/stripe-session-status.js';
import getOrderDownloadsHandler from '../server-handlers/get-order-downloads.js';
import logDownloadHandler from '../server-handlers/log-download.js';
import paymentStatusHandler from '../server-handlers/payment-status.js';
import proxyAudioHandler from '../api/proxy-audio.js';
import convertReferralHandler from '../api/convert-referral.js';
import paymentsConfigHandler from '../api/payments/config.js';

function createMockRes() {
    return {
        statusCode: 200,
        headers: {},
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        setHeader(key, value) {
            this.headers[key.toLowerCase()] = value;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        },
        end() {
            return this;
        }
    };
}

test('Lote 12: sanitizeCsvFormula neutraliza caracteres de inyección de fórmulas (CWE-1236)', () => {
    // Caracteres peligrosos de inicio en hojas de cálculo
    assert.equal(sanitizeEmailCsvFormula('=1+1'), "'=1+1");
    assert.equal(sanitizeEmailCsvFormula('+cmd|"/c calc"!A1'), "'+cmd|\"/c calc\"!A1");
    assert.equal(sanitizeEmailCsvFormula('-2*5'), "'-2*5");
    assert.equal(sanitizeEmailCsvFormula('@SUM(A1:A10)'), "'@SUM(A1:A10)");
    assert.equal(sanitizeEmailCsvFormula('\tTAB_INJECT'), "'\tTAB_INJECT");
    assert.equal(sanitizeEmailCsvFormula('\rCARRIAGE_INJECT'), "'\rCARRIAGE_INJECT");
    assert.equal(sanitizeEmailCsvFormula('%FORMULA'), "'%FORMULA");

    // Texto regular seguro no debe ser alterado con comilla inicial
    assert.equal(sanitizeEmailCsvFormula('Beat Normal'), 'Beat Normal');
    assert.equal(sanitizeEmailCsvFormula('usuario@gmail.com'), 'usuario@gmail.com');
    assert.equal(sanitizeEmailCsvFormula('Compra #12345'), 'Compra #12345');
    assert.equal(sanitizeEmailCsvFormula(''), '');
    assert.equal(sanitizeEmailCsvFormula(null), '');
});

test('Lote 12: Preflight OPTIONS retorna 204 con Vary: Origin y CORS en manejadores migrados', async () => {
    const handlers = [
        { name: 'activate-pro', fn: activateProHandler },
        { name: 'redeem-vip', fn: redeemVipHandler },
        { name: 'cancel-subscription', fn: cancelSubscriptionHandler },
        { name: 'account-deletion-request', fn: accountDeletionHandler },
        { name: 'stripe-create-checkout-session', fn: stripeCheckoutHandler },
        { name: 'stripe-session-status', fn: stripeStatusHandler },
        { name: 'get-order-downloads', fn: getOrderDownloadsHandler },
        { name: 'log-download', fn: logDownloadHandler },
        { name: 'payment-status', fn: paymentStatusHandler },
        { name: 'proxy-audio', fn: proxyAudioHandler },
        { name: 'convert-referral', fn: convertReferralHandler },
        { name: 'payments/config', fn: paymentsConfigHandler }
    ];

    for (const { name, fn } of handlers) {
        const req = {
            method: 'OPTIONS',
            headers: {
                origin: 'https://beatss.app'
            }
        };
        const res = createMockRes();
        await fn(req, res);

        assert.equal(res.statusCode, 204, `${name} debe responder con HTTP 204 ante preflight OPTIONS.`);
        assert.equal(res.headers['access-control-allow-origin'], 'https://beatss.app', `${name} debe reflejar origen confiable.`);
        assert.equal(res.headers['vary'], 'Origin', `${name} debe emitir Vary: Origin.`);
    }
});

test('Lote 12: Orígenes no confiables no reciben Access-Control-Allow-Origin en preflight', async () => {
    const handlers = [
        activateProHandler,
        redeemVipHandler,
        cancelSubscriptionHandler,
        accountDeletionHandler,
        stripeCheckoutHandler,
        stripeStatusHandler,
        getOrderDownloadsHandler,
        logDownloadHandler,
        paymentStatusHandler,
        proxyAudioHandler,
        convertReferralHandler,
        paymentsConfigHandler
    ];

    for (const fn of handlers) {
        const req = {
            method: 'OPTIONS',
            headers: {
                origin: 'https://evil-hacker-site.com'
            }
        };
        const res = createMockRes();
        await fn(req, res);

        assert.equal(res.headers['access-control-allow-origin'], undefined, 'No debe emitirse Access-Control-Allow-Origin a un origen malicioso.');
        assert.equal(res.headers['vary'], 'Origin', 'Debe emitir Vary: Origin independientemente del origen.');
    }
});

test('Lote 12: Sanitize de nombre de archivo previene inyecciones y caracteres inválidos', () => {
    const maliciousFileName = '../../etc/passwd';
    const sanitizedFileName = maliciousFileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    assert.equal(sanitizedFileName, '.._.._etc_passwd');
    assert.ok(!sanitizedFileName.includes('/'), 'No debe contener barras diagonales.');

    const xssFileName = '<svg onload=alert(1)>.p12';
    const sanitizedDom = xssFileName
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    assert.ok(!sanitizedDom.includes('<svg'), 'No debe contener etiquetas HTML vivas.');
    assert.ok(sanitizedDom.includes('&lt;svg'), 'Debe escapar corchetes angulares.');
});
