import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { checkActivateProRateLimit, resetActivateProRateLimit, getSanitizedClientIp as getActivateProIp } from '../server-handlers/activate-pro.js';
import { checkCancelSubscriptionRateLimit, resetCancelSubscriptionRateLimit, getSanitizedClientIp as getCancelSubIp } from '../server-handlers/cancel-subscription.js';
import { checkConvertReferralRateLimit, resetConvertReferralRateLimit, getSanitizedClientIp as getConvertReferralIp } from '../api/convert-referral.js';
import { checkPaymentConfigRateLimit, resetPaymentConfigRateLimit, getSanitizedClientIp as getPaymentConfigIp } from '../api/payments/config.js';

const root = process.cwd();

test('server-handlers/activate-pro.js aplica rate limiting (10 req / 5 min) y saneamiento de IP', () => {
    resetActivateProRateLimit();
    const testIp = '198.51.100.111';
    const now = 1000000;

    for (let i = 1; i <= 10; i++) {
        const check = checkActivateProRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición ${i} debe permitirse`);
    }

    const blocked = checkActivateProRateLimit(testIp, now + 150);
    assert.equal(blocked.allowed, false, 'Petición 11 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds positivo');

    const expired = checkActivateProRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetActivateProRateLimit();

    const mockReq = { headers: { 'x-vercel-forwarded-for': '203.0.113.111' } };
    assert.equal(getActivateProIp(mockReq), '203.0.113.111');

    const content = fs.readFileSync(path.join(root, 'server-handlers/activate-pro.js'), 'utf8');
    assert.ok(content.includes('checkActivateProRateLimit(clientIp)'), 'Debe invocar checkActivateProRateLimit en el handler');
    assert.ok(content.includes('429'), 'Debe responder con 429');
});

test('server-handlers/cancel-subscription.js aplica rate limiting (5 req / 5 min) y saneamiento de IP', () => {
    resetCancelSubscriptionRateLimit();
    const testIp = '198.51.100.122';
    const now = 2000000;

    for (let i = 1; i <= 5; i++) {
        const check = checkCancelSubscriptionRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición ${i} debe permitirse`);
    }

    const blocked = checkCancelSubscriptionRateLimit(testIp, now + 80);
    assert.equal(blocked.allowed, false, 'Petición 6 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0, 'Debe devolver retryAfterSeconds');

    const expired = checkCancelSubscriptionRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetCancelSubscriptionRateLimit();

    const mockReq = { headers: { 'x-forwarded-for': '198.51.100.122' } };
    assert.equal(getCancelSubIp(mockReq), '198.51.100.122');

    const content = fs.readFileSync(path.join(root, 'server-handlers/cancel-subscription.js'), 'utf8');
    assert.ok(content.includes('checkCancelSubscriptionRateLimit(clientIp)'), 'Debe invocar checkCancelSubscriptionRateLimit');
    assert.ok(content.includes('429'), 'Debe responder con 429');
});

test('api/convert-referral.js aplica rate limiting (10 req / 5 min) y saneamiento de IP', () => {
    resetConvertReferralRateLimit();
    const testIp = '198.51.100.133';
    const now = 3000000;

    for (let i = 1; i <= 10; i++) {
        const check = checkConvertReferralRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Petición ${i} debe permitirse`);
    }

    const blocked = checkConvertReferralRateLimit(testIp, now + 150);
    assert.equal(blocked.allowed, false, 'Petición 11 debe ser bloqueada por rate limit');
    assert.ok(blocked.retryAfterSeconds > 0);

    const expired = checkConvertReferralRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetConvertReferralRateLimit();

    const mockReq = { headers: { 'x-vercel-forwarded-for': '198.51.100.133' } };
    assert.equal(getConvertReferralIp(mockReq), '198.51.100.133');

    const content = fs.readFileSync(path.join(root, 'api/convert-referral.js'), 'utf8');
    assert.ok(content.includes('checkConvertReferralRateLimit(clientIp)'), 'Debe invocar checkConvertReferralRateLimit');
    assert.ok(content.includes('429'), 'Debe responder con 429');
});

test('api/payments/config.js aplica rate limiting (60 req / 5 min) y usa isTrustedBeatssOrigin', () => {
    resetPaymentConfigRateLimit();
    const testIp = '198.51.100.144';
    const now = 4000000;

    for (let i = 1; i <= 60; i++) {
        const check = checkPaymentConfigRateLimit(testIp, now + i * 10);
        assert.equal(check.allowed, true, `Consulta config ${i} debe permitirse`);
    }

    const blocked = checkPaymentConfigRateLimit(testIp, now + 700);
    assert.equal(blocked.allowed, false, 'Consulta 61 debe ser bloqueada');
    assert.ok(blocked.retryAfterSeconds > 0);

    const expired = checkPaymentConfigRateLimit(testIp, now + 5 * 60 * 1000 + 10);
    assert.equal(expired.allowed, true, 'Debe permitirse tras expirar la ventana');

    resetPaymentConfigRateLimit();

    const mockReq = { headers: { 'x-vercel-forwarded-for': '198.51.100.144' } };
    assert.equal(getPaymentConfigIp(mockReq), '198.51.100.144');

    const content = fs.readFileSync(path.join(root, 'api/payments/config.js'), 'utf8');
    assert.ok(content.includes('isTrustedBeatssOrigin'), 'Debe usar isTrustedBeatssOrigin');
    assert.ok(content.includes('checkPaymentConfigRateLimit(clientIp)'), 'Debe invocar checkPaymentConfigRateLimit');
    assert.ok(content.includes('429'), 'Debe responder con 429');
});

test('server-handlers y endpoints de pago consolidan CORS con isTrustedBeatssOrigin', () => {
    const pendingOrderContent = fs.readFileSync(path.join(root, 'server-handlers/create-pending-order.js'), 'utf8');
    assert.ok(pendingOrderContent.includes("import { isTrustedBeatssOrigin } from '../api/_cors-origin.js'"), 'create-pending-order.js debe importar isTrustedBeatssOrigin');
    assert.ok(pendingOrderContent.includes('isTrustedBeatssOrigin(origin)'), 'create-pending-order.js debe validar con isTrustedBeatssOrigin');
    assert.ok(!pendingOrderContent.includes('ALLOWED_ORIGINS'), 'create-pending-order.js no debe conservar ALLOWED_ORIGINS local');

    const clearanceContent = fs.readFileSync(path.join(root, 'server-handlers/clearance.js'), 'utf8');
    assert.ok(clearanceContent.includes("import { isTrustedBeatssOrigin } from '../api/_cors-origin.js'"), 'clearance.js debe importar isTrustedBeatssOrigin');
    assert.ok(clearanceContent.includes('isTrustedBeatssOrigin(origin)'), 'clearance.js debe validar con isTrustedBeatssOrigin');
    assert.ok(!clearanceContent.includes('ALLOWED_ORIGINS'), 'clearance.js no debe conservar ALLOWED_ORIGINS local');

    const payphoneContent = fs.readFileSync(path.join(root, 'api/payments/payphone/confirm.js'), 'utf8');
    assert.ok(payphoneContent.includes("import { isTrustedBeatssOrigin } from '../../_cors-origin.js'"), 'payphone/confirm.js debe importar isTrustedBeatssOrigin');
    assert.ok(payphoneContent.includes('isTrustedBeatssOrigin(origin)'), 'payphone/confirm.js debe validar con isTrustedBeatssOrigin');
    assert.ok(!payphoneContent.includes('ALLOWED_ORIGINS'), 'payphone/confirm.js no debe conservar ALLOWED_ORIGINS local');
});
