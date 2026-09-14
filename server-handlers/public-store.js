import { getStripeFirebase } from '../api/_fulfill-beat-purchase.js';
import { isBeatAvailableForSale, resolvePublicPreview } from './beat-availability.js';
import { externalProducersEnabled, resolveProducerSalesMode, PAYMENT_MODES } from './producer-settlement.js';

const MAX_PUBLIC_ARTWORK_BYTES = 1_500_000;
const PUBLIC_ARTWORK_TYPES = new Map([
    ['jpg', 'image/jpeg'],
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
    ['gif', 'image/gif'],
    ['avif', 'image/avif']
]);

const PUBLIC_PRODUCER_FIELDS = new Set([
    'aka', 'name', 'storeSlug', 'email', 'phone', 'brandColor', 'logoBase64', 'defaultBeatArtwork',
    'epkBio', 'epkCollabs', 'epkPro', 'epkSales', 'epkStreams', 'coupons',
    'bankPichinchaAcc', 'bankPichinchaName', 'bankPichinchaType',
    'bankGuayaquilAcc', 'bankGuayaquilName', 'bankGuayaquilType',
    'deunaName', 'deunaPhone', 'deunaQrBase64', 'paypalClientId', 'paypalEmail',
    'payphoneAppId', 'payphoneClientId', 'payphonePhone', 'stripePublishableKey'
]);

// El marketplace sólo renderiza identidad y marca. Los detalles de pago se
// solicitan después, para el productor del beat que la persona eligió.
const PUBLIC_CATALOG_PRODUCER_FIELDS = new Set([
    'aka', 'name', 'storeSlug', 'brandColor', 'logoBase64', 'plan'
]);

const PUBLIC_BEAT_FIELDS = new Set([
    'name', 'bpm', 'key', 'genre', 'moods', 'tags', 'preview', 'mp3', 'artwork',
    'producerAka', 'producerName', 'price_basic', 'price_premium',
    'price_premium_plus', 'price_unlimited_flp', 'price_exclusive',
    'basicPrice', 'premiumPrice', 'premium_plusPrice', 'unlimited_flpPrice',
    'exclusivePrice', 'sold', 'isSold', 'published', 'isPublished', 'duration', 'createdAt'
]);

const GLOBAL_CATALOG_LIMIT = 72;

function pickPublic(data, fields) {
    return Object.fromEntries(Object.entries(data || {}).filter(([key]) => fields.has(key)));
}

export function sanitizePublicProducer(data) {
    return pickPublic(data, PUBLIC_PRODUCER_FIELDS);
}

export function sanitizePublicCatalogProducer(data) {
    return pickPublic(data, PUBLIC_CATALOG_PRODUCER_FIELDS);
}

export function sanitizePublicBeat(data, id = '') {
    const beat = { id, ...pickPublic(data, PUBLIC_BEAT_FIELDS) };
    const preview = resolvePublicPreview(beat);
    // Los clientes públicos históricos leen `mp3`. Lo conservamos en la
    // respuesta, pero sólo como alias del preview explícito; nunca se obtiene
    // desde la subcolección privada de entrega.
    if (preview) {
        beat.preview = preview;
        beat.mp3 = preview;
    } else {
        delete beat.preview;
        delete beat.mp3;
    }
    return beat;
}

async function hydratePublicPreview(beatDoc) {
    const beat = sanitizePublicBeat(beatDoc.data(), beatDoc.id);
    if (resolvePublicPreview(beat) || !beatDoc.ref?.collection) return beat;

    // Las migraciones recientes guardan la vista previa separada de los
    // archivos de compra. Se puede proyectar esa única URL sin exponer MP3,
    // WAV ni stems privados.
    try {
        const files = await beatDoc.ref.collection('private').doc('files').get();
        const preview = resolvePublicPreview({ preview: files.exists ? files.data()?.preview : '' });
        if (preview) return { ...beat, preview, mp3: preview };
    } catch (error) {
        console.warn('No se pudo preparar preview público:', error.message);
    }
    return beat;
}

function cleanProducerAlias(value) {
    const alias = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    return /^[\p{L}\p{N}._ -]+$/u.test(alias) ? alias : '';
}

function cleanProducerId(value) {
    const id = String(value || '').trim();
    return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : '';
}

function publicArtworkUrl(producerId) {
    return `/api/public-artwork?producer=${encodeURIComponent(producerId)}`;
}

export function parsePublicArtworkDataUrl(value) {
    const match = /^data:image\/(jpg|jpeg|png|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(value || '').trim());
    if (!match) return null;

    const contentType = PUBLIC_ARTWORK_TYPES.get(match[1].toLowerCase());
    if (!contentType) return null;
    const body = Buffer.from(match[2], 'base64');
    if (!body.length || body.length > MAX_PUBLIC_ARTWORK_BYTES) return null;
    return { body, contentType };
}

export function serializePublicStoreProducer(data, producerId) {
    const { defaultBeatArtwork, ...producer } = sanitizePublicProducer(data);
    return {
        ...producer,
        ...(parsePublicArtworkDataUrl(defaultBeatArtwork)
            ? { defaultBeatArtworkUrl: publicArtworkUrl(producerId) }
            : {})
    };
}

export function paymentCapabilitiesForProducer(data = {}, env = process.env, producerId = '') {
    const mode = resolveProducerSalesMode({ producerId, publicConfig: data, privateConfig: data, env });
    // Arquitectura C+B apagada: un productor externo no puede vender todavía,
    // así que no se expone ningún método de cobro. El productor de plataforma
    // (Sossa) conserva exactamente su comportamiento actual.
    if (!mode.isPlatform && !mode.salesEnabled) {
        return {
            salesEnabled: false,
            stripe: false,
            paypal: false,
            payphone: false,
            deuna: false,
            transfer: false
        };
    }
    return {
        salesEnabled: true,
        stripe: Boolean(env.STRIPE_SECRET_KEY) && (mode.isPlatform || mode.paymentMode === PAYMENT_MODES.PLATFORM_SELLER),
        paypal: Boolean(data.paypalClientId && data.paypalClientSecret && data.paypalEmail),
        payphone: Boolean(data.payphoneClientId && data.payphoneAppId),
        deuna: Boolean(data.deunaPhone && String(env.DEUNA_WEBHOOK_SECRET || '').length >= 32),
        transfer: Boolean(data.bankPichinchaAcc || data.bankGuayaquilAcc)
    };
}

function serializePublicCatalogProducer(data, producerId) {
    const producer = sanitizePublicCatalogProducer(data);
    return {
        ...producer,
        ...(parsePublicArtworkDataUrl(data?.defaultBeatArtwork)
            ? { defaultBeatArtworkUrl: publicArtworkUrl(producerId) }
            : {})
    };
}

async function findProducerConfig(db, alias) {
    // El proyecto histórico no tiene índice de grupo para `config.aka`.
    // Admin puede leer el grupo y filtrar sólo el documento público `producer`
    // sin debilitar las reglas del navegador ni crear un índice innecesario.
    const normalizedAlias = alias.toLocaleLowerCase('es');
    const snapshot = await db.collectionGroup('config').get();
    return snapshot.docs.find((doc) => {
        if (doc.id !== 'producer' || doc.ref.parent.parent?.parent?.id !== 'users') return false;
        const data = doc.data();
        return [data.storeSlug, data.aka, data.name].some((value) => String(value || '').trim().toLocaleLowerCase('es') === normalizedAlias);
    }) || null;
}

function isProducerConfig(doc) {
    return doc.id === 'producer' && doc.ref.parent.parent?.parent?.id === 'users';
}

function timestampValue(value) {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (Number.isFinite(value?.seconds)) return value.seconds * 1000;
    return 0;
}

export async function listPublicCatalog(db, maxBeats = GLOBAL_CATALOG_LIMIT, env = process.env) {
    const configsSnapshot = await db.collectionGroup('config').get();
    const platformProducerId = String(env.STRIPE_PLATFORM_PRODUCER_ID || '').trim();
    const allowExternal = externalProducersEnabled(env);
    const producerConfigs = configsSnapshot.docs.filter(isProducerConfig).filter((configDoc) => {
        // Con la arquitectura apagada, el catálogo general sólo incluye al
        // productor de plataforma (Sossa); ningún productor externo se expone.
        if (allowExternal) return true;
        return Boolean(platformProducerId) && configDoc.ref.parent.parent.id === platformProducerId;
    });
    const perProducer = await Promise.all(producerConfigs.map(async (configDoc) => {
        const producerId = configDoc.ref.parent.parent.id;
        const producer = serializePublicCatalogProducer(configDoc.data(), producerId);
        const beatsSnapshot = await db.collection('users').doc(producerId).collection('beats').get();
        const beats = await Promise.all(beatsSnapshot.docs.map(hydratePublicPreview));
        return beats
            .filter(isBeatAvailableForSale)
            .map((beat) => ({
                ...beat,
                producerUid: producerId,
                producerConfig: producer
            }));
    }));

    return perProducer
        .flat()
        .sort((a, b) => timestampValue(b.createdAt) - timestampValue(a.createdAt))
        .slice(0, maxBeats);
}

// Evita repetir logos o artes por cada beat del mismo productor. El cliente
// vuelve a asociar esta información ya saneada por producerUid al renderizar.
export function serializePublicCatalog(beats = []) {
    const producers = {};
    const catalogBeats = beats.map(({ producerConfig, ...beat }) => {
        if (beat.producerUid && producerConfig && typeof producerConfig === 'object') {
            producers[beat.producerUid] = producerConfig;
        }
        return beat;
    });
    return { beats: catalogBeats, producers };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido.' });
    const route = String(req.query?.route || '').trim().toLowerCase();
    const artworkProducerId = cleanProducerId(req.query?.producer);
    if (route === 'public-artwork') {
        if (!artworkProducerId) return res.status(400).json({ error: 'Productor no válido.' });
        try {
            const db = getStripeFirebase();
            const configDoc = await db.collection('users').doc(artworkProducerId).collection('config').doc('producer').get();
            const artwork = configDoc.exists ? parsePublicArtworkDataUrl(configDoc.data()?.defaultBeatArtwork) : null;
            if (!artwork) return res.status(404).json({ error: 'Portada no disponible.' });
            res.setHeader('Content-Type', artwork.contentType);
            res.setHeader('Content-Length', artwork.body.length);
            res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400');
            return res.status(200).send(artwork.body);
        } catch (error) {
            console.error('Public artwork error:', error.message);
            return res.status(500).json({ error: 'No se pudo cargar la portada.' });
        }
    }

    const catalogMode = String(req.query?.catalog || '').trim().toLowerCase();
    if (catalogMode && catalogMode !== 'global') return res.status(400).json({ error: 'Catálogo no válido.' });
    const alias = cleanProducerAlias(req.query?.producer);
    if (!catalogMode && !alias) return res.status(400).json({ error: 'Productor no válido.' });

    try {
        const db = getStripeFirebase();
        if (catalogMode === 'global') {
            res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600');
            return res.status(200).json(serializePublicCatalog(await listPublicCatalog(db)));
        }
        // Las instrucciones de cobro pertenecen a una tienda concreta. Pueden
        // mostrarse al comprador, pero no deben quedar almacenadas en un CDN.
        res.setHeader('Cache-Control', 'private, no-store');
        const configDoc = await findProducerConfig(db, alias);
        if (!configDoc) return res.status(404).json({ error: 'Productor no encontrado.' });
        const producerId = configDoc.ref.parent.parent.id;
        const privateConfigDoc = await db.collection('users').doc(producerId).collection('private_config').doc('producer').get();
        const mergedConfig = {
            ...configDoc.data(),
            ...(privateConfigDoc.exists ? privateConfigDoc.data() : {})
        };
        const beatsSnapshot = await db.collection('users').doc(producerId).collection('beats').get();
        const beats = (await Promise.all(beatsSnapshot.docs.map(hydratePublicPreview)))
            .filter(isBeatAvailableForSale);
        const paymentCapabilities = paymentCapabilitiesForProducer(mergedConfig, process.env, producerId);
        return res.status(200).json({
            producerId,
            producer: serializePublicStoreProducer(mergedConfig, producerId),
            salesEnabled: paymentCapabilities.salesEnabled,
            paymentCapabilities,
            beats
        });
    } catch (error) {
        console.error('Public store error:', error.message);
        return res.status(500).json({ error: 'No se pudo cargar el catálogo.' });
    }
}
