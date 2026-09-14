import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sanitizePublicBeat, sanitizePublicProducer, sanitizePublicCatalogProducer, listPublicCatalog, serializePublicCatalog, parsePublicArtworkDataUrl, serializePublicStoreProducer, paymentCapabilitiesForProducer } from '../server-handlers/public-store.js';
import { isBeatAvailableForSale } from '../server-handlers/beat-availability.js';

test('el catálogo público elimina secretos de configuración', () => {
    const result = sanitizePublicProducer({
        aka: 'Sossa', storeSlug: 'sossa-owner123', stripePublishableKey: 'pk_test_example', bankGuayaquilAcc: 'public-account', bankGuayaquilDni: 'private-id', sriRuc: 'private-ruc',
        paypalClientSecret: 'secret', sriP12Password: 'secret', signature: 'private'
    });
    assert.deepEqual(result, {
        aka: 'Sossa', storeSlug: 'sossa-owner123', stripePublishableKey: 'pk_test_example', bankGuayaquilAcc: 'public-account'
    });
});

test('las capacidades de cobro son por productor y fallan cerradas', () => {
    const env = { STRIPE_SECRET_KEY: 'configured', STRIPE_PLATFORM_PRODUCER_ID: 'owner', DEUNA_WEBHOOK_SECRET: 'x'.repeat(32) };
    // Arquitectura C+B apagada: un productor externo no expone métodos de cobro.
    assert.deepEqual(paymentCapabilitiesForProducer({}, env, 'new-producer'), {
        salesEnabled: false, stripe: false, paypal: false, payphone: false, deuna: false, transfer: false
    });
    // El productor de plataforma (Sossa) conserva su comportamiento.
    assert.equal(paymentCapabilitiesForProducer({}, env, 'owner').salesEnabled, true);
    assert.equal(paymentCapabilitiesForProducer({}, env, 'owner').stripe, true);
    // Aun con credenciales completas, un externo sigue cerrado sin el flag.
    const external = { paypalClientId: 'client', paypalClientSecret: 'secret', paypalEmail: 'seller@example.test', deunaPhone: '+593999999999' };
    const closed = paymentCapabilitiesForProducer(external, env, 'connected');
    assert.equal(closed.salesEnabled, false);
    assert.equal(closed.stripe, false);
    assert.equal(closed.paypal, false);
    assert.equal(closed.deuna, false);
    // Con el flag encendido y modo platform_seller, se habilita la venta central.
    const open = paymentCapabilitiesForProducer(external, { ...env, EXTERNAL_PRODUCERS_ENABLED: '1' }, 'connected');
    assert.equal(open.salesEnabled, true);
    assert.equal(open.stripe, true);
    assert.equal(open.paypal, true);
});

test('el catálogo global no expone datos de cobro de productores no seleccionados', () => {
    const result = sanitizePublicCatalogProducer({
        aka: 'Sossa', brandColor: '#3157e8', plan: 'elite',
        defaultBeatArtwork: 'data:image/png;base64,AAA=', bankGuayaquilAcc: 'private-account', paypalEmail: 'private@example.test', stripePublishableKey: 'pk_test_example'
    });
    assert.deepEqual(result, { aka: 'Sossa', brandColor: '#3157e8', plan: 'elite' });
});

test('el catálogo público expone preview y precios pero no archivos de entrega', () => {
    const result = sanitizePublicBeat({
        name: 'Beat', mp3: 'https://example.com/preview.mp3', wav: 'private-wav', stems: 'private-stems',
        price_basic: 30, internalNotes: 'private'
    }, 'beat-1');
    assert.deepEqual(result, {
        id: 'beat-1', name: 'Beat', preview: 'https://example.com/preview.mp3', mp3: 'https://example.com/preview.mp3', price_basic: 30
    });
});

test('el preview explícito prevalece sobre el MP3 histórico en la respuesta pública', () => {
    const result = sanitizePublicBeat({
        name: 'Beat protegido',
        preview: 'https://example.com/preview-etiquetado.mp3',
        mp3: 'https://example.com/archivo-entrega.mp3'
    }, 'beat-2');
    assert.deepEqual(result, {
        id: 'beat-2',
        name: 'Beat protegido',
        preview: 'https://example.com/preview-etiquetado.mp3',
        mp3: 'https://example.com/preview-etiquetado.mp3'
    });
});

test('un beat sólo queda público y vendible si tiene preview, está publicado y no está vendido', () => {
    const available = { mp3: 'https://example.com/preview.mp3' };
    assert.equal(isBeatAvailableForSale(available), true);
    assert.equal(isBeatAvailableForSale({ preview: 'https://example.com/preview-etiquetado.mp3' }), true);
    assert.equal(isBeatAvailableForSale({ ...available, sold: true }), false);
    assert.equal(isBeatAvailableForSale({ ...available, isSold: true }), false);
    assert.equal(isBeatAvailableForSale({ ...available, published: false }), false);
    assert.equal(isBeatAvailableForSale({ ...available, isPublished: false }), false);
    assert.equal(isBeatAvailableForSale({}), false);
});

test('el catálogo global reutiliza únicamente datos públicos y conserva su productor', async () => {
    const configDoc = {
        id: 'producer',
        ref: { parent: { parent: { id: 'producer-1', parent: { id: 'users' } } } },
        data: () => ({ aka: 'Sossa', brandColor: '#3157e8', paypalClientSecret: 'never-public' })
    };
    const beatDoc = {
        id: 'beat-1',
        data: () => ({ name: 'Beat público', mp3: 'https://example.com/preview.mp3', wav: 'private-wav', createdAt: { seconds: 10 } })
    };
    const db = {
        collectionGroup: () => ({ get: async () => ({ docs: [configDoc] }) }),
        collection: () => ({ doc: () => ({ collection: () => ({ get: async () => ({ docs: [beatDoc] }) }) }) })
    };

    const [beat] = await listPublicCatalog(db, undefined, { STRIPE_PLATFORM_PRODUCER_ID: 'producer-1' });
    assert.equal(beat.producerUid, 'producer-1');
    assert.equal(beat.producerConfig.aka, 'Sossa');
    assert.equal('paypalClientSecret' in beat.producerConfig, false);
    assert.equal('bankGuayaquilAcc' in beat.producerConfig, false);
    assert.equal('wav' in beat, false);
});

test('el catálogo puede proyectar un preview privado dedicado sin publicar el MP3 de entrega', async () => {
    const configDoc = {
        id: 'producer',
        ref: { parent: { parent: { id: 'producer-1', parent: { id: 'users' } } } },
        data: () => ({ aka: 'Sossa' })
    };
    const privateFiles = {
        exists: true,
        data: () => ({
            preview: 'https://example.com/preview-etiquetado.mp3',
            mp3: 'https://example.com/entrega-privada.mp3',
            wav: 'https://example.com/entrega-privada.wav'
        })
    };
    const beatDoc = {
        id: 'beat-privado',
        ref: { collection: () => ({ doc: () => ({ get: async () => privateFiles }) }) },
        data: () => ({ name: 'Beat con entrega privada', createdAt: { seconds: 10 } })
    };
    const db = {
        collectionGroup: () => ({ get: async () => ({ docs: [configDoc] }) }),
        collection: () => ({ doc: () => ({ collection: () => ({ get: async () => ({ docs: [beatDoc] }) }) }) })
    };

    const [beat] = await listPublicCatalog(db, undefined, { STRIPE_PLATFORM_PRODUCER_ID: 'producer-1' });
    assert.equal(beat.preview, 'https://example.com/preview-etiquetado.mp3');
    assert.equal(beat.mp3, 'https://example.com/preview-etiquetado.mp3');
    assert.notEqual(beat.mp3, privateFiles.data().mp3);
    assert.equal('wav' in beat, false);
});

test('el proxy público permite sólo el preview dedicado que la tienda proyecta', async () => {
    const proxySource = await readFile(new URL('../api/proxy-audio.js', import.meta.url), 'utf8');
    const publicFallback = proxySource.split('// Fallback de escaneo')[1].split('// 5. Descargar')[0];
    assert.match(publicFallback, /privatePreviewData\?\.preview\?\.includes\(fileId\)/);
    assert.doesNotMatch(publicFallback, /privatePreviewData\?\.mp3/);
    assert.doesNotMatch(publicFallback, /privatePreviewData\?\.wav/);
    assert.doesNotMatch(publicFallback, /privatePreviewData\?\.stems/);
});

test('la portada pública acepta solo imágenes Base64 limitadas', () => {
    const artwork = parsePublicArtworkDataUrl('data:image/png;base64,AA==');
    assert.equal(artwork.contentType, 'image/png');
    assert.equal(artwork.body.length, 1);
    assert.equal(parsePublicArtworkDataUrl('data:text/html;base64,PHNjcmlwdD4='), null);
    assert.equal(parsePublicArtworkDataUrl('https://example.com/artwork.png'), null);
});

test('la tienda pública entrega URL de portada y no repite Base64', () => {
    const producer = serializePublicStoreProducer({
        aka: 'Sossa', defaultBeatArtwork: 'data:image/webp;base64,AA==', paypalClientId: 'public-client-id'
    }, 'producer-1');
    assert.deepEqual(producer, {
        aka: 'Sossa', paypalClientId: 'public-client-id', defaultBeatArtworkUrl: '/api/public-artwork?producer=producer-1'
    });
    assert.equal('defaultBeatArtwork' in producer, false);
});

test('el catálogo global transmite la marca del productor una sola vez', () => {
    const config = { aka: 'Sossa', logoBase64: 'public-logo' };
    const payload = serializePublicCatalog([
        { id: 'beat-1', producerUid: 'producer-1', producerConfig: config },
        { id: 'beat-2', producerUid: 'producer-1', producerConfig: config }
    ]);

    assert.deepEqual(payload.producers, { 'producer-1': config });
    assert.equal('producerConfig' in payload.beats[0], false);
    assert.equal('producerConfig' in payload.beats[1], false);
});
