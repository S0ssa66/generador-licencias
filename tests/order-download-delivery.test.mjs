import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    createDeliveryToken,
    resolvePurchasedDeliverySources
} from '../server-handlers/get-order-downloads.js';

test('el portal prioriza el MP3 privado y mantiene respaldo sólo para catálogos históricos', () => {
    const privateMp3 = 'https://files.example/private-master.mp3';
    const publicMp3 = 'https://files.example/legacy-public.mp3';
    assert.deepEqual(resolvePurchasedDeliverySources(
        { mp3: publicMp3, wav: 'https://files.example/legacy.wav' },
        { mp3: privateMp3, wav: 'https://files.example/private.wav', stems: 'https://files.example/stems.zip' }
    ), {
        mp3: privateMp3,
        wav: 'https://files.example/private.wav',
        stems: 'https://files.example/stems.zip'
    });
    assert.equal(resolvePurchasedDeliverySources({ mp3: publicMp3 }, {}).mp3, publicMp3);
});

test('el token de persistencia de PDF queda ligado al pago', () => {
    const secret = 'test-only-download-signing-key';
    const paymentId = 'stripe_test_payment';
    const expected = crypto.createHmac('sha256', secret).update(`${paymentId}:pdf-delivery`).digest('hex');
    assert.equal(createDeliveryToken(paymentId, secret), expected);
    assert.notEqual(createDeliveryToken('stripe_other_payment', secret), expected);
    assert.equal(createDeliveryToken(paymentId, ''), '');
});
