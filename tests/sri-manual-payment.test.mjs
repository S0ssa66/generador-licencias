import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createSriManualPaymentHandler,
    normalizeManualPaymentMethod
} from '../server-handlers/sri-manual-payment.js';

const ownerId = 'owner-123';
const paymentId = 'legacy-license-01';

function createDb({ license = {}, licenseOwner = ownerId, payment = null, job = null, reservation = null, otherPayments = [] } = {}) {
    const documents = new Map();
    const writes = [];
    const put = (path, data) => documents.set(path, structuredClone(data));
    if (license) put(`users/${licenseOwner}/licencias/${paymentId}`, license);
    if (payment) put(`payments/${paymentId}`, payment);
    if (job) put(`sriJobs/${paymentId}`, job);
    if (reservation) put(`sriReservations/${paymentId}`, reservation);
    otherPayments.forEach(({ id, data }) => put(`payments/${id}`, data));

    const makeRef = path => ({
        path,
        collection: name => makeRef(`${path}/${name}`),
        doc: id => makeRef(`${path}/${id}`),
        where: (field, operator, value) => ({ kind: 'query', path, field, operator, value, limit(count) { this.max = count; return this; } }),
        limit: count => ({ kind: 'query', path, limit: count })
    });
    const snapshot = path => ({
        id: path.split('/').at(-1),
        exists: documents.has(path),
        data: () => structuredClone(documents.get(path))
    });
    const db = {
        writes,
        documents,
        collection: name => makeRef(name),
        runTransaction: callback => callback({
            get: async ref => {
                if (ref.kind === 'query') {
                    const docs = [...documents.entries()]
                        .filter(([path, data]) => path.startsWith('payments/') && path.split('/').length === 2 && data?.[ref.field] === ref.value)
                        .slice(0, ref.max || 10)
                        .map(([path]) => snapshot(path));
                    return { docs, empty: docs.length === 0 };
                }
                return snapshot(ref.path);
            },
            create: (ref, data) => {
                if (documents.has(ref.path)) throw new Error('already exists');
                put(ref.path, data);
                writes.push({ operation: 'create', path: ref.path, data: structuredClone(data) });
            },
            set: (ref, data, options = {}) => {
                const next = options.merge ? { ...(documents.get(ref.path) || {}), ...data } : data;
                put(ref.path, next);
                writes.push({ operation: 'set', path: ref.path, data: structuredClone(data) });
            }
        })
    };
    return db;
}

function setup(options = {}) {
    const db = createDb({
        license: {
            producerId: ownerId,
            reference: 'LIC-BAS-20260516-1234',
            refCode: 'LIC-BAS-20260516-1234',
            beatName: 'Beat antiguo',
            buyerName: 'Cliente',
            value: 30,
            date: '2026-05-16',
            sriEstado: 'NO_EMITIDA',
            ...options.license
        },
        ...options
    });
    const handler = createSriManualPaymentHandler({
        authenticate: async () => ({ uid: ownerId }),
        getDb: () => db,
        timestamp: () => '2026-09-24T18:30:00.000Z',
        rateLimit: () => false
    });
    return { db, handler };
}

function request(body = {}) {
    return { method: 'POST', headers: { origin: 'https://beatss.app' }, body: { paymentId, paymentMethod: 'transferencia', confirmManualPayment: true, ...body } };
}

function response() {
    return {
        statusCode: 200,
        headers: {},
        setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
        status(code) { this.statusCode = code; return this; },
        json(value) { this.body = value; return this; },
        end() { return this; }
    };
}

async function call(handler, req = request()) {
    const res = response();
    await handler(req, res);
    return res;
}

test('normaliza métodos permitidos sin aceptar valores arbitrarios', () => {
    assert.equal(normalizeManualPaymentMethod('Transferencia bancaria'), 'transferencia');
    assert.equal(normalizeManualPaymentMethod('Pay Phone'), 'payphone');
    assert.equal(normalizeManualPaymentMethod('transferencia'), 'transferencia');
    assert.equal(normalizeManualPaymentMethod('crypto_desconocida'), '');
});

test('registra atómicamente sólo el pago atestiguado; no crea trabajo ni estado SRI', async () => {
    const { db, handler } = setup();
    const res = await call(handler);
    const payment = db.documents.get(`payments/${paymentId}`);
    const license = db.documents.get(`users/${ownerId}/licencias/${paymentId}`);

    assert.equal(res.statusCode, 201);
    assert.equal(res.body.status, 'approved');
    assert.equal(payment.status, 'approved');
    assert.equal(payment.source, 'owner_manual_attestation');
    assert.equal(payment.amount, 30);
    assert.equal(payment.manualPaymentAttestation.confirmedBy, ownerId);
    assert.equal(payment.manualPaymentAttestation.method, 'transferencia');
    assert.equal(license.paymentStatus, 'approved');
    assert.equal(license.manualPaymentAttestation.received, true);
    assert.equal(db.documents.has(`sriJobs/${paymentId}`), false);
    assert.equal(payment.sriEstado, undefined, 'registrar el pago no debe emitir ni reservar una factura');
    assert.deepEqual(db.writes.map(write => write.operation), ['create', 'set']);
});

test('requiere sesión y confirmación expresa del cobro recibido', async () => {
    const unauthenticated = createSriManualPaymentHandler({ authenticate: async () => { throw Object.assign(new Error('Sesión requerida'), { status: 401 }); }, getDb: () => createDb(), rateLimit: () => false });
    assert.equal((await call(unauthenticated)).statusCode, 401);

    const { db, handler } = setup();
    const res = await call(handler, request({ confirmManualPayment: false }));
    assert.equal(res.statusCode, 400);
    assert.equal(db.writes.length, 0);
});

test('bloquea otros propietarios, ventas de prueba y licencias archivadas', async () => {
    const wrongOwner = createSriManualPaymentHandler({
        authenticate: async () => ({ uid: 'another-owner' }),
        getDb: () => createDb({ licenseOwner: 'another-owner', license: { producerId: ownerId, value: 30, reference: 'LEGACY-1' } }),
        rateLimit: () => false
    });
    assert.equal((await call(wrongOwner)).statusCode, 403);

    const notFoundForOtherAccount = createSriManualPaymentHandler({
        authenticate: async () => ({ uid: 'another-owner' }),
        getDb: () => createDb({ license: { producerId: ownerId, value: 30, reference: 'LEGACY-1' } }),
        rateLimit: () => false
    });
    assert.equal((await call(notFoundForOtherAccount)).statusCode, 404);

    for (const license of [
        { providerLivemode: false },
        { refCode: 'cs_test_fixture' },
        { historyStatus: 'archived' },
        { sriEstado: 'NO_CONFIGURADO' },
        { sriEstado: 'AUTORIZADO' },
        { sriEstado: 'EN_PROCESO' },
        { sriClaveAcceso: 'already-issued' },
        { sriXmlStoragePath: 'sri/owner/file.xml' },
        { currency: 'eur' },
        { value: 0.001 }
    ]) {
        const { db, handler } = setup({ license });
        const res = await call(handler);
        assert.equal(res.statusCode, 409, JSON.stringify(license));
        assert.equal(db.writes.length, 0, JSON.stringify(license));
    }
});

test('no reemplaza un pago existente ni duplica otra venta con la misma referencia', async () => {
    const existing = setup({ payment: { status: 'approved', producerId: ownerId, value: 30 } });
    assert.equal((await call(existing.handler)).statusCode, 409);
    assert.equal(existing.db.writes.length, 0);

    const duplicate = setup({ otherPayments: [{ id: 'older-payment', data: { reference: 'LIC-BAS-20260516-1234', producerId: ownerId, status: 'approved' } }] });
    const res = await call(duplicate.handler);
    assert.equal(res.statusCode, 409);
    assert.equal(duplicate.db.documents.has(`payments/${paymentId}`), false);
});

test('no registra cobros si ya existe una cola o reserva fiscal', async () => {
    for (const options of [{ job: { status: 'PENDING' } }, { reservation: { accessKey: 'reserved' } }]) {
        const { db, handler } = setup(options);
        assert.equal((await call(handler)).statusCode, 409);
        assert.equal(db.writes.length, 0);
    }
});

test('repetir la misma confirmación del propietario es idempotente', async () => {
    const attestation = { confirmedBy: ownerId, method: 'efectivo', status: 'owner_confirmed_received' };
    const { db, handler } = setup({
        payment: { producerId: ownerId, status: 'approved', source: 'owner_manual_attestation', reference: 'LIC-BAS-20260516-1234', refCode: 'LIC-BAS-20260516-1234', value: 30, paymentMethod: 'efectivo', manualPaymentAttestation: attestation }
    });
    const res = await call(handler);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadyRegistered, true);
    assert.equal(res.body.paymentMethod, 'efectivo');
    assert.equal(db.writes.length, 0);
});
