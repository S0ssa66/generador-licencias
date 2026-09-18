import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getMaxChannelsForLicense, createClearanceHandler } from '../server-handlers/clearance.js';

const root = process.cwd();

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

test('server-handlers/clearance.js asigna límites de canales de YouTube por tipo de licencia', () => {
    assert.equal(getMaxChannelsForLicense('basic'), 1);
    assert.equal(getMaxChannelsForLicense('premium'), 2);
    assert.equal(getMaxChannelsForLicense('premium_plus'), 3);
    assert.equal(getMaxChannelsForLicense('unlimited'), 5);
    assert.equal(getMaxChannelsForLicense('unlimited_flp'), 5);
    assert.equal(getMaxChannelsForLicense('exclusive'), 10);
    assert.equal(getMaxChannelsForLicense('unknown_tier'), 1);
    assert.equal(getMaxChannelsForLicense(null), 1);
    assert.equal(getMaxChannelsForLicense(undefined), 1);
});

test('server-handlers/clearance.js bloquea whitelist si excede el límite permitido para la licencia', async () => {
    const license = {
        exists: true,
        data: () => ({
            beatName: 'Test Beat',
            buyerName: 'Buyer Test',
            licenseType: 'basic',
            cryptoHash: 'abc123hash'
        })
    };

    const mockDb = {
        collection: () => ({
            doc: () => ({
                collection: (name) => ({
                    doc: () => {
                        if (name === 'licencias') return { get: async () => license };
                        if (name === 'config') return { get: async () => ({ exists: true, data: () => ({ aka: 'ProdAka' }) }) };
                        return { set: async () => {} };
                    },
                    where: () => ({
                        get: async () => ({
                            size: 1, // Ya tiene 1 canal registrado y la licencia es basic (máximo 1)
                            docs: [{ id: 'other_channel_id' }]
                        })
                    })
                })
            })
        })
    };

    const handler = createClearanceHandler({ dbFactory: () => mockDb });
    const req = {
        method: 'POST',
        headers: {
            origin: 'https://beatss.app',
            'content-type': 'application/json',
            'x-vercel-forwarded-for': 'clearance-limit-test-ip'
        },
        body: {
            action: 'whitelist',
            producerId: 'prod123',
            licenseRef: 'LIC-REF-100',
            channelUrl: 'https://youtube.com/@nuevo_canal',
            artistName: 'Artista',
            songName: 'Cancion'
        }
    };
    const res = responseMock();

    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body?.code, 'LIMIT_REACHED');
    assert.ok(res.body?.error?.includes('permite registrar un máximo de 1 canal(es)'));
});

test('server-handlers/get-order-downloads.js revoca acceso a pedidos cancelados, disputados o reembolsados', () => {
    const fileContent = fs.readFileSync(path.join(root, 'server-handlers/get-order-downloads.js'), 'utf8');
    assert.ok(fileContent.includes("terminalRevokedStatuses = ['refunded', 'disputed', 'chargeback', 'cancelled', 'cancelado', 'revoked']"),
        'Debe definir la lista de estados revocados terminales');
    assert.ok(fileContent.includes('terminalRevokedStatuses.includes(String(paymentData.status || \'\').toLowerCase()) || paymentData.accessRevoked === true'),
        'Debe comprobar status y accessRevoked');
    assert.ok(fileContent.includes('res.status(403).json({ error: \'El acceso a las descargas de este pedido ha sido revocado debido a la cancelación o reembolso de la compra.\' })'),
        'Debe responder con 403 Forbidden y mensaje explicativo');
});

test('vercel.json restringe Permissions-Policy con payment=(self) y bloqueo de sensores y hardware', () => {
    const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
    const headersList = vercel.headers || [];
    const rootHeaderConfig = headersList.find(h => h.source === '/(.*)');
    assert.ok(rootHeaderConfig, 'Debe existir configuración de headers para /(.*)');

    const permPolicy = rootHeaderConfig.headers.find(h => h.key === 'Permissions-Policy');
    assert.ok(permPolicy, 'Debe existir Permissions-Policy');
    assert.ok(permPolicy.value.includes('payment=(self)'), 'Permissions-Policy debe permitir payment sólo para self');
    assert.ok(permPolicy.value.includes('camera=()'), 'Permissions-Policy debe deshabilitar cámara');
    assert.ok(permPolicy.value.includes('microphone=()'), 'Permissions-Policy debe deshabilitar micrófono');
    assert.ok(permPolicy.value.includes('geolocation=()'), 'Permissions-Policy debe deshabilitar geolocalización');
    assert.ok(permPolicy.value.includes('usb=()'), 'Permissions-Policy debe deshabilitar usb');
    assert.ok(permPolicy.value.includes('screen-wake-lock=()'), 'Permissions-Policy debe deshabilitar screen-wake-lock');
    assert.ok(permPolicy.value.includes('accelerometer=()'), 'Permissions-Policy debe deshabilitar acelerómetro');
    assert.ok(permPolicy.value.includes('gyroscope=()'), 'Permissions-Policy debe deshabilitar giroscopio');
    assert.ok(permPolicy.value.includes('magnetometer=()'), 'Permissions-Policy debe deshabilitar magnetómetro');
});
