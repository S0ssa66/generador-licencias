import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import {
    canUseDeunaSimulation,
    isFreshDeunaWebhook,
    verifyDeunaWebhookSignature,
    default as deunaHandler
} from '../api/payments/deuna.js';

function requestFor(path, body, headers = {}) {
    const raw = Buffer.from(JSON.stringify(body));
    const req = Readable.from([raw]);
    req.method = 'POST';
    req.url = path;
    req.query = {};
    req.headers = { host: 'localhost:3000', origin: 'http://localhost:3000', ...headers };
    return { req, raw };
}

function responseRecorder() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        setHeader(name, value) { this.headers[name] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; }
    };
}

test('verifica X-Deuna-Signature sobre los bytes exactos del cuerpo', () => {
    const secret = crypto.randomBytes(32).toString('hex');
    const raw = Buffer.from('{"status":"succeeded","signed_at":"2026-08-10T09:00:00Z"}');
    const signature = crypto.createHmac('sha256', secret).update(raw).digest('base64');
    assert.equal(verifyDeunaWebhookSignature(raw, signature, secret), true);
    assert.equal(verifyDeunaWebhookSignature(Buffer.from(`${raw} `), signature, secret), false);
    assert.equal(verifyDeunaWebhookSignature(raw, 'invalid', secret), false);
});

test('rechaza webhooks sin signed_at, vencidos o demasiado futuros', () => {
    const now = Date.parse('2026-08-10T09:05:00Z');
    assert.equal(isFreshDeunaWebhook({ signed_at: '2026-08-10T09:04:00Z' }, now, 300), true);
    assert.equal(isFreshDeunaWebhook({ signed_at: '2026-08-10T08:00:00Z' }, now, 300), false);
    assert.equal(isFreshDeunaWebhook({ signed_at: '2026-08-10T10:00:00Z' }, now, 300), false);
    assert.equal(isFreshDeunaWebhook({}, now, 300), false);
});

test('la simulación queda cerrada en producción y exige secreto local', () => {
    const secret = 's'.repeat(32);
    assert.equal(canUseDeunaSimulation(
        { 'x-beatss-simulation-secret': secret },
        { NODE_ENV: 'production', ALLOW_DEUNA_SIMULATION: 'true', DEUNA_SIMULATION_SECRET: secret }
    ), false);
    assert.equal(canUseDeunaSimulation(
        { 'x-beatss-simulation-secret': secret },
        { NODE_ENV: 'development', ALLOW_DEUNA_SIMULATION: 'true', DEUNA_SIMULATION_SECRET: secret }
    ), true);
    assert.equal(canUseDeunaSimulation(
        { 'x-beatss-simulation-secret': 'wrong' },
        { NODE_ENV: 'development', ALLOW_DEUNA_SIMULATION: 'true', DEUNA_SIMULATION_SECRET: secret }
    ), false);
});

test('el handler rechaza simulación de producción antes de tocar Firestore', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousAllow = process.env.ALLOW_DEUNA_SIMULATION;
    const previousSecret = process.env.DEUNA_SIMULATION_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.ALLOW_DEUNA_SIMULATION = 'true';
    process.env.DEUNA_SIMULATION_SECRET = 's'.repeat(32);
    try {
        const { req } = requestFor('/api/payments/deuna/simulate-confirm', { purchaseId: 'payment_1' }, {
            'x-beatss-simulation-secret': 's'.repeat(32)
        });
        const res = responseRecorder();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 404);
        assert.equal(res.body.error, 'Endpoint no disponible.');
    } finally {
        if (previousNodeEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousNodeEnv;
        if (previousAllow === undefined) delete process.env.ALLOW_DEUNA_SIMULATION; else process.env.ALLOW_DEUNA_SIMULATION = previousAllow;
        if (previousSecret === undefined) delete process.env.DEUNA_SIMULATION_SECRET; else process.env.DEUNA_SIMULATION_SECRET = previousSecret;
    }
});

test('el handler rechaza una firma webhook inválida usando el cuerpo crudo', async () => {
    const previousSecret = process.env.DEUNA_WEBHOOK_SECRET;
    process.env.DEUNA_WEBHOOK_SECRET = 'w'.repeat(32);
    try {
        const { req } = requestFor('/api/payments/deuna/webhook', {
            purchaseId: 'payment_1',
            status: 'succeeded',
            signed_at: new Date().toISOString()
        }, { 'x-deuna-signature': 'invalid' });
        const res = responseRecorder();
        await deunaHandler(req, res);
        assert.equal(res.statusCode, 401);
        assert.equal(res.body.error, 'Firma de webhook inválida.');
    } finally {
        if (previousSecret === undefined) delete process.env.DEUNA_WEBHOOK_SECRET; else process.env.DEUNA_WEBHOOK_SECRET = previousSecret;
    }
});
