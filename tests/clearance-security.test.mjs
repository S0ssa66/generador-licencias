import test from 'node:test';
import assert from 'node:assert/strict';
import clearanceHandler, {
    clearanceOrigin,
    createClearanceHandler,
    nextClearanceRateLimit,
    normalizeClearanceRequest
} from '../server-handlers/clearance.js';

function responseMock() {
    return {
        headers: new Map(),
        statusCode: 0,
        body: undefined,
        setHeader(key, value) { this.headers.set(key, value); },
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        end() { this.ended = true; return this; }
    };
}

test('Clearance valida referencias y canales antes de cualquier acceso a datos', () => {
    assert.deepEqual(normalizeClearanceRequest({
        action: 'verify', producerId: 'producer_123', licenseRef: 'Invoice # CANDY-BASIC-1'
    }), {
        action: 'verify', producerId: 'producer_123', licenseRef: 'Invoice # CANDY-BASIC-1'
    });
    assert.throws(() => normalizeClearanceRequest({
        action: 'whitelist', producerId: 'producer_123', licenseRef: '../secret',
        channelUrl: 'https://youtube.com/@sossa', artistName: 'Sossa', songName: 'Beat'
    }), /Código de licencia no válido/);
    assert.throws(() => normalizeClearanceRequest({
        action: 'whitelist', producerId: 'producer_123', licenseRef: 'LIC-1',
        channelUrl: 'https://example.com/channel', artistName: 'Sossa', songName: 'Beat'
    }), /YouTube/);
});

test('Clearance solo acepta orígenes propios y limita intentos por IP', async () => {
    assert.equal(clearanceOrigin({ headers: { origin: 'https://beatss.app' } }), 'https://beatss.app');
    assert.equal(clearanceOrigin({ headers: { origin: 'https://otro.example' } }), '');
    const first = nextClearanceRateLimit({}, 1_000, 2, 10_000);
    const second = nextClearanceRateLimit(first.state, 1_001, 2, 10_000);
    const blocked = nextClearanceRateLimit(second.state, 1_002, 2, 10_000);
    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(blocked.allowed, false);

    const res = responseMock();
    await clearanceHandler({ method: 'POST', headers: { origin: 'https://otro.example' }, body: {} }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Origen no permitido.');
});

test('Clearance verifica y registra por servidor sin devolver datos privados', async () => {
    const writes = [];
    const license = {
        exists: true,
        data: () => ({
            beatName: 'Magic', buyerName: 'Joao', buyerEmail: 'private@example.com',
            licenseType: 'premium', cryptoHash: 'hash-publico'
        })
    };
    const db = {
        collection: () => ({
            doc: () => ({
                collection: (name) => ({
                    doc: () => {
                        if (name === 'licencias') return { get: async () => license };
                        if (name === 'config') return { get: async () => ({ exists: true, data: () => ({ aka: 'Sossa' }) }) };
                        return { set: async (value) => writes.push(value) };
                    }
                })
            })
        })
    };
    const handler = createClearanceHandler({ dbFactory: () => db, now: () => new Date('2026-08-10T00:00:00.000Z') });
    const headers = { origin: 'http://127.0.0.1:5174', 'x-vercel-forwarded-for': 'clearance-success-test' };

    const verify = responseMock();
    await handler({ method: 'POST', headers, body: { action: 'verify', producerId: 'producer_123', licenseRef: 'LIC-123' } }, verify);
    assert.equal(verify.statusCode, 200);
    assert.deepEqual(verify.body, {
        license: { beatName: 'Magic', buyerName: 'Joao', licenseType: 'premium', cryptoHash: 'hash-publico' },
        producerAka: 'Sossa'
    });
    assert.equal(JSON.stringify(verify.body).includes('private@example.com'), false);

    const whitelist = responseMock();
    await handler({ method: 'POST', headers: { ...headers, 'x-vercel-forwarded-for': 'clearance-whitelist-test' }, body: {
        action: 'whitelist', producerId: 'producer_123', licenseRef: 'LIC-123',
        channelUrl: 'https://youtube.com/@sossa', artistName: 'Sossa', songName: 'Magic'
    } }, whitelist);
    assert.equal(whitelist.statusCode, 200);
    assert.deepEqual(writes, [{
        channelUrl: 'https://youtube.com/@sossa', artistName: 'Sossa', songName: 'Magic',
        licenseRef: 'LIC-123', createdAt: '2026-08-10T00:00:00.000Z'
    }]);
});
