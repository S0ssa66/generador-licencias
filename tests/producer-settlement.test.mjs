import test from 'node:test';
import assert from 'node:assert/strict';
import {
    EXTERNAL_PRODUCERS_FLAG,
    PAYMENT_MODES,
    externalProducersEnabled,
    normalizePlan,
    commissionPercentForPlan,
    normalizePaymentMode,
    resolveProducerSalesMode,
    computeSettlement
} from '../server-handlers/producer-settlement.js';
import { paymentCapabilitiesForProducer, listPublicCatalog } from '../server-handlers/public-store.js';

const PLATFORM_ENV = {
    STRIPE_SECRET_KEY: 'configured',
    STRIPE_PLATFORM_PRODUCER_ID: 'owner'
};

test('el flag de productores externos falla cerrado por defecto', () => {
    assert.equal(EXTERNAL_PRODUCERS_FLAG, 'EXTERNAL_PRODUCERS_ENABLED');
    assert.equal(externalProducersEnabled({}), false);
    assert.equal(externalProducersEnabled({ EXTERNAL_PRODUCERS_ENABLED: 'false' }), false);
    assert.equal(externalProducersEnabled({ EXTERNAL_PRODUCERS_ENABLED: '0' }), false);
    for (const value of ['true', 'TRUE', '1', 'yes', 'on']) {
        assert.equal(externalProducersEnabled({ EXTERNAL_PRODUCERS_ENABLED: value }), true);
    }
});

test('el productor de plataforma siempre vende y sin comisión', () => {
    const mode = resolveProducerSalesMode({ producerId: 'owner', publicConfig: {}, privateConfig: {}, env: PLATFORM_ENV });
    assert.equal(mode.salesEnabled, true);
    assert.equal(mode.isPlatform, true);
    assert.equal(mode.source, 'platform');
    assert.equal(mode.paymentMode, PAYMENT_MODES.PLATFORM_SELLER);
    assert.equal(mode.commissionPercent, 0);
    assert.equal(mode.reason, 'platform_producer');
});

test('un productor externo queda apagado sin el flag', () => {
    const mode = resolveProducerSalesMode({ producerId: 'externo', publicConfig: { plan: 'pro' }, privateConfig: {}, env: PLATFORM_ENV });
    assert.equal(mode.salesEnabled, false);
    assert.equal(mode.isPlatform, false);
    assert.equal(mode.reason, 'external_producers_disabled');
});

test('con el flag encendido la comisión depende del plan en modo platform_seller', () => {
    const env = { ...PLATFORM_ENV, EXTERNAL_PRODUCERS_ENABLED: '1' };
    const free = resolveProducerSalesMode({ producerId: 'e1', publicConfig: { plan: 'inicial' }, privateConfig: {}, env });
    assert.equal(free.salesEnabled, true);
    assert.equal(free.paymentMode, PAYMENT_MODES.PLATFORM_SELLER);
    assert.equal(free.commissionPercent, 15);

    const paid = resolveProducerSalesMode({ producerId: 'e2', publicConfig: { plan: 'Pro' }, privateConfig: {}, env });
    assert.equal(paid.commissionPercent, 5);

    const elite = resolveProducerSalesMode({ producerId: 'e3', publicConfig: { plan: 'Elite' }, privateConfig: {}, env });
    assert.equal(elite.commissionPercent, 5);
});

test('el modo producer_gateway (A) no aplica comisión de plataforma', () => {
    const env = { ...PLATFORM_ENV, EXTERNAL_PRODUCERS_ENABLED: '1' };
    const mode = resolveProducerSalesMode({
        producerId: 'e4',
        publicConfig: { plan: 'inicial' },
        privateConfig: { paymentMode: 'producer_gateway' },
        env
    });
    assert.equal(mode.salesEnabled, true);
    assert.equal(mode.paymentMode, PAYMENT_MODES.PRODUCER_GATEWAY);
    assert.equal(mode.commissionPercent, 0);
});

test('normalización de plan y comisión fallan hacia la tarifa más alta', () => {
    assert.equal(normalizePlan('  Artista Pro '), 'artista pro');
    assert.equal(commissionPercentForPlan('inicial'), 15);
    assert.equal(commissionPercentForPlan('planes-desconocidos'), 15);
    assert.equal(commissionPercentForPlan('pro'), 5);
    assert.equal(normalizePaymentMode('producer_gateway'), 'producer_gateway');
    assert.equal(normalizePaymentMode('cualquiera'), 'platform_seller');
});

test('el reparto de una venta calcula comisión y parte del productor', () => {
    assert.deepEqual(computeSettlement({ amountCents: 3000, commissionPercent: 15 }), {
        amountCents: 3000, commissionPercent: 15, platformFeeCents: 450, producerShareCents: 2550
    });
    assert.deepEqual(computeSettlement({ amountCents: 3000, commissionPercent: 5 }), {
        amountCents: 3000, commissionPercent: 5, platformFeeCents: 150, producerShareCents: 2850
    });
    // Redondeo al centavo más cercano.
    assert.deepEqual(computeSettlement({ amountCents: 3333, commissionPercent: 15 }), {
        amountCents: 3333, commissionPercent: 15, platformFeeCents: 500, producerShareCents: 2833
    });
    assert.equal(computeSettlement({ amountCents: 3000, commissionPercent: 0 }).producerShareCents, 3000);
});

test('el reparto rechaza entradas inválidas', () => {
    assert.throws(() => computeSettlement({ amountCents: -1, commissionPercent: 5 }), TypeError);
    assert.throws(() => computeSettlement({ amountCents: 10.5, commissionPercent: 5 }), TypeError);
    assert.throws(() => computeSettlement({ amountCents: 100, commissionPercent: -1 }), TypeError);
    assert.throws(() => computeSettlement({ amountCents: 100, commissionPercent: 101 }), TypeError);
    assert.throws(() => computeSettlement({ amountCents: 100, commissionPercent: 'x' }), TypeError);
});

test('las capacidades de cobro de un externo siguen cerradas sin el flag', () => {
    const external = { paypalClientId: 'c', paypalClientSecret: 's', paypalEmail: 'e@example.test' };
    const closed = paymentCapabilitiesForProducer(external, PLATFORM_ENV, 'externo');
    assert.equal(closed.salesEnabled, false);
    assert.deepEqual(closed, { salesEnabled: false, stripe: false, paypal: false, payphone: false, deuna: false, transfer: false });
});

function fakeCatalogDb(beatsByProducer) {
    const configDocs = Object.keys(beatsByProducer).map((producerId) => ({
        id: 'producer',
        ref: { parent: { parent: { id: producerId, parent: { id: 'users' } } } },
        data: () => ({ aka: producerId })
    }));
    return {
        collectionGroup: () => ({ get: async () => ({ docs: configDocs }) }),
        collection: () => ({
            doc: (id) => ({
                collection: () => ({ get: async () => ({ docs: beatsByProducer[id] || [] }) })
            })
        })
    };
}

function beatDoc(id) {
    return { id, data: () => ({ name: id, preview: `https://example.com/${id}.mp3`, createdAt: { seconds: 1 } }) };
}

test('el catálogo general sólo expone al productor de plataforma con el flag apagado', async () => {
    const db = fakeCatalogDb({
        owner: [beatDoc('b-owner')],
        externo: [beatDoc('b-externo')]
    });
    const beats = await listPublicCatalog(db, undefined, { STRIPE_PLATFORM_PRODUCER_ID: 'owner' });
    assert.deepEqual(beats.map((b) => b.producerUid), ['owner']);
});

test('con el flag encendido el catálogo general incluye a los externos', async () => {
    const db = fakeCatalogDb({
        owner: [beatDoc('b-owner')],
        externo: [beatDoc('b-externo')]
    });
    const beats = await listPublicCatalog(db, undefined, {
        STRIPE_PLATFORM_PRODUCER_ID: 'owner',
        EXTERNAL_PRODUCERS_ENABLED: '1'
    });
    assert.deepEqual(beats.map((b) => b.producerUid).sort(), ['externo', 'owner']);
});
