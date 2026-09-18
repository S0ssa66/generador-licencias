import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    serializePaymentStatus,
    sha256Hex,
    verifyPaymentStatusToken
} from '../server-handlers/payment-status.js';

test('acepta el secreto aleatorio solo cuando coincide con el hash guardado', () => {
    const token = crypto.randomBytes(32).toString('hex');
    const payment = { statusTokenHash: sha256Hex(token) };
    assert.equal(verifyPaymentStatusToken('payment_1', token, payment), true);
    assert.equal(verifyPaymentStatusToken('payment_1', `${token}00`, payment), false);
});

test('acepta tokens HMAC de estado y descarga ligados al paymentId', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const paymentId = 'payment_2';
    const statusToken = crypto.createHmac('sha256', secret).update(`${paymentId}:status`).digest('hex');
    const downloadToken = crypto.createHmac('sha256', secret).update(`${paymentId}:download`).digest('hex');
    assert.equal(verifyPaymentStatusToken(paymentId, statusToken, {}, secret), true);
    assert.equal(verifyPaymentStatusToken(paymentId, downloadToken, {}, secret), true);
    assert.equal(verifyPaymentStatusToken('payment_other', statusToken, {}, secret), false);
});

test('serializa únicamente estado público sin PII', () => {
    const result = serializePaymentStatus('payment_3', {
        status: 'APPROVED',
        updatedAt: 123,
        buyerName: 'No debe salir',
        buyerEmail: 'private@example.test',
        receiptUrl: 'private'
    });
    assert.deepEqual(result, { paymentId: 'payment_3', status: 'approved', updatedAt: 123 });
    assert.deepEqual(Object.keys(result).sort(), ['paymentId', 'status', 'updatedAt'].sort());
});

test('normaliza estados desconocidos a pending', () => {
    assert.equal(serializePaymentStatus('payment_4', { status: 'internal_review' }).status, 'pending');
});
