import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { isTrustedBeatssOrigin } from '../_cors-origin.js';
import { hasCompleteSriConfig } from '../_sri_queue.js';
import retrySri, { isSriWorkerHealthy } from '../../server-handlers/sri-retry.js';
import { serveSriArtifact } from '../../server-handlers/sri-download.js';
import registerManualSriArtifacts from '../../server-handlers/sri-manual-import.js';
import verifyManualSriArtifacts from '../../server-handlers/sri-manual-verify.js';
import registerManualSriPayment from '../../server-handlers/sri-manual-payment.js';

const ADMIN_UID = 'paXbnNbHMMPC31X3hf0oTUx4bbr2';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 60;
const paymentConfigRateWindows = new Map();

export function resetPaymentConfigRateLimit() {
    paymentConfigRateWindows.clear();
}

export function checkPaymentConfigRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = paymentConfigRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        paymentConfigRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

export function getSanitizedClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

export function serializePublicPaymentConfig(config = {}, env = process.env) {
    return {
        paypalClientId: String(config.paypalClientId || env.PAYPAL_CLIENT_ID || '').slice(0, 512),
        paypalPlanIdPro: String(config.paypalPlanIdPro || '').slice(0, 160),
        paypalPlanIdElite: String(config.paypalPlanIdElite || '').slice(0, 160),
        paypalPlanIdCreator: String(config.paypalPlanIdCreator || '').slice(0, 160),
        paypalPlanIdProArtist: String(config.paypalPlanIdProArtist || '').slice(0, 160),
        payphoneClientId: String(config.payphoneClientId || '').slice(0, 2048),
        payphoneAppId: String(config.payphoneAppId || '').slice(0, 160),
        deunaPhone: String(config.deunaPhone || '').replace(/[^\d+]/g, '').slice(0, 20),
        deunaName: String(config.deunaName || '').replace(/<[^>]*>/g, '').trim().slice(0, 160),
        bankPichinchaName: String(config.bankPichinchaName || '').replace(/<[^>]*>/g, '').trim().slice(0, 160)
    };
}

export function paymentCapabilities(env = process.env) {
    return {
        deuna: String(env.DEUNA_WEBHOOK_SECRET || '').length >= 32
    };
}

function sriProfileForOwner(config = {}) {
    const pick = key => String(config[key] || '').slice(0, 512);
    return {
        sriRuc: pick('sriRuc'),
        sriRazonSocial: pick('sriRazonSocial'),
        sriNombreComercial: pick('sriNombreComercial'),
        sriDirMatriz: pick('sriDirMatriz'),
        sriEstab: pick('sriEstab'),
        sriPtoEmi: pick('sriPtoEmi'),
        sriAmbiente: pick('sriAmbiente'),
        sriRimpe: pick('sriRimpe'),
        sriContabilidad: pick('sriContabilidad'),
        sriIvaTarifa: pick('sriIvaTarifa'),
        sriIvaIncluido: config.sriIvaIncluido !== false,
        sriRucProveedor: pick('sriRucProveedor'),
        sriAutoQueueEnabled: config.sriAutoQueueEnabled === true,
        sriSignatureConfigured: Boolean(String(config.sriP12Base64 || '').trim() && String(config.sriP12Password || process.env.SRI_FIRMA_PASSWORD || '').trim())
    };
}

function sriWorkerReadiness(worker = {}) {
    const heartbeat = worker?.lastHeartbeatAt?.toDate?.() || new Date(worker?.lastHeartbeatAt || 0);
    const heartbeatMs = Number.isFinite(heartbeat.getTime()) ? heartbeat.getTime() : 0;
    return {
        // Sólo se entrega salud operativa, nunca rutas internas, tokens ni
        // detalles del certificado. El dashboard necesita saber si es seguro
        // prometer que una cola realmente será procesada.
        sriWorkerHealthy: isSriWorkerHealthy(worker),
        sriWorkerLastHeartbeatAt: heartbeatMs ? heartbeat.toISOString() : '',
        sriWorkerPendingCount: Math.max(0, Number(worker?.pendingCount || 0) || 0),
        sriWorkerAllowedAmbientes: Array.isArray(worker?.allowedAmbientes)
            ? worker.allowedAmbientes.filter(value => value === '1' || value === '2')
            : []
    };
}

function sanitizeSriUpdate(raw = {}) {
    const stringKeys = [
        'sriRuc', 'sriRazonSocial', 'sriNombreComercial', 'sriDirMatriz',
        'sriEstab', 'sriPtoEmi', 'sriAmbiente', 'sriRimpe',
        'sriContabilidad', 'sriIvaTarifa', 'sriRucProveedor'
    ];
    const output = {};
    for (const key of stringKeys) {
        if (Object.prototype.hasOwnProperty.call(raw, key)) output[key] = String(raw[key] || '').trim().slice(0, 512);
    }
    if (Object.prototype.hasOwnProperty.call(raw, 'sriIvaIncluido')) output.sriIvaIncluido = raw.sriIvaIncluido === true;
    if (Object.prototype.hasOwnProperty.call(raw, 'sriAutoQueueEnabled')) output.sriAutoQueueEnabled = raw.sriAutoQueueEnabled === true;
    // Nunca se devuelve ninguno de estos valores al navegador. Vacío significa
    // “conservar el existente”, para evitar borrar una firma por accidente.
    const certificate = String(raw.sriP12Base64 || '').trim();
    // Un certificado PKCS#12 normal ocupa pocos MB. Limitar la carga evita que
    // esta ruta autenticada se use como almacenamiento arbitrario.
    if (certificate.length > 3_000_000) throw Object.assign(new Error('El certificado SRI supera el tamaño permitido.'), { status: 413 });
    if (certificate) output.sriP12Base64 = certificate;
    if (String(raw.sriP12Password || '').trim()) output.sriP12Password = String(raw.sriP12Password);
    return output;
}

const SRI_SECRET_KEYS = ['sriP12Base64', 'sriP12Password', 'sriSecuencial'];

export const SOSSA_SRI_DEFAULTS = {
    sriRuc: '0803743111001',
    sriRazonSocial: 'DOMINGUEZ SOSA JOAO DAVID',
    sriNombreComercial: 'Sossa Music',
    sriDirMatriz: 'Barrio: SANTAS VAINAS Calle: RIO TABIAZO Intersección: RIO QUININDE, ESMERALDAS',
    sriEstab: '001',
    sriPtoEmi: '001',
    sriAmbiente: '2',
    sriRimpe: 'rimpe_popular',
    sriContabilidad: 'NO',
    sriIvaTarifa: '0',
    sriIvaIncluido: true
};

async function readSriPrivateConfig(db, producerId) {
    const legacyRef = db.collection('users').doc(producerId).collection('private_config').doc('producer');
    const sriRef = db.collection('users').doc(producerId).collection('private_config').doc('sri');
    const [sriSnap, legacySnap] = await Promise.all([sriRef.get(), legacyRef.get()]);
    const dedicated = sriSnap.exists ? sriSnap.data() : {};
    const legacy = legacySnap.exists ? legacySnap.data() : {};
    const migrated = {};
    for (const key of SRI_SECRET_KEYS) {
        if (!dedicated[key] && legacy[key]) migrated[key] = legacy[key];
    }
    if (Object.keys(migrated).length) {
        const batch = db.batch();
        batch.set(sriRef, migrated, { merge: true });
        batch.update(legacyRef, Object.fromEntries(Object.keys(migrated).map(key => [key, FieldValue.delete()])));
        await batch.commit();
    }
    const combined = { ...legacy, ...dedicated, ...migrated };
    if (producerId === ADMIN_UID) {
        const sossaUpdated = {
            ...SOSSA_SRI_DEFAULTS,
            ...combined,
            sriRuc: SOSSA_SRI_DEFAULTS.sriRuc,
            sriRazonSocial: SOSSA_SRI_DEFAULTS.sriRazonSocial,
            sriNombreComercial: SOSSA_SRI_DEFAULTS.sriNombreComercial,
            sriDirMatriz: SOSSA_SRI_DEFAULTS.sriDirMatriz,
            sriEstab: combined.sriEstab || SOSSA_SRI_DEFAULTS.sriEstab,
            sriPtoEmi: combined.sriPtoEmi || SOSSA_SRI_DEFAULTS.sriPtoEmi,
            sriAmbiente: combined.sriAmbiente || SOSSA_SRI_DEFAULTS.sriAmbiente,
            sriRimpe: SOSSA_SRI_DEFAULTS.sriRimpe,
            sriContabilidad: SOSSA_SRI_DEFAULTS.sriContabilidad,
            sriIvaTarifa: SOSSA_SRI_DEFAULTS.sriIvaTarifa,
            sriIvaIncluido: true
        };
        if (!dedicated.sriRuc || dedicated.sriRuc !== SOSSA_SRI_DEFAULTS.sriRuc || dedicated.sriRimpe !== 'rimpe_popular' || dedicated.sriAmbiente !== '2' || dedicated.sriNombreComercial !== 'Sossa Music') {
            await sriRef.set(sossaUpdated, { merge: true }).catch(() => {});
        }
        return sossaUpdated;
    }
    return combined;
}

async function requireOwnerSession(req) {
    const authorization = String(req.headers?.authorization || '');
    if (!authorization.startsWith('Bearer ')) throw Object.assign(new Error('Sesión requerida.'), { status: 401 });
    const decoded = await getAuth().verifyIdToken(authorization.slice(7));
    if (!decoded?.uid) throw Object.assign(new Error('Sesión inválida.'), { status: 401 });
    return decoded;
}

// Inicializar Firebase Admin (solo una vez)
function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app'
    });
}

export default async function handler(req, res) {
    // Reutilizar esta función ya desplegada para las rutas fiscales. Los
    // handlers mantienen su propia autenticación, límites y control de acceso.
    const url = new URL(req.url || '', `http://${req.headers?.host || 'localhost'}`);
    const route = String(req.query?.route || url.searchParams.get('route') || '').trim().toLowerCase();
    if (route === 'retry-sri') return retrySri(req, res);
    if (route === 'download-ride') return serveSriArtifact(req, res, 'ride');
    if (route === 'download-xml') return serveSriArtifact(req, res, 'xml');
    if (route === 'manual-sri-import') return registerManualSriArtifacts(req, res);
    if (route === 'manual-sri-verify') return verifyManualSriArtifacts(req, res);
    if (route === 'manual-payment-attestation') return registerManualSriPayment(req, res);
    if (route) return res.status(404).json({ error: 'Acción no encontrada.' });

    const origin = req.headers?.origin;
    configureCors(req, res);

    // Preflight
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (origin && !isTrustedBeatssOrigin(origin)) {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    if (!['GET', 'POST'].includes(req.method)) {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkPaymentConfigRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de configuración de pagos. Por favor espera unos minutos.' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        if (req.method === 'POST') {
            const decoded = await requireOwnerSession(req);
            const action = String(req.body?.action || '');
            const producerId = String(req.body?.producerId || decoded.uid);
            if (producerId !== decoded.uid && decoded.admin !== true) return res.status(403).json({ error: 'No puedes modificar esta configuración.' });
            const sriRef = db.collection('users').doc(producerId).collection('private_config').doc('sri');
            const privateConfig = await readSriPrivateConfig(db, producerId);
            if (action === 'sri-profile') {
                const workerSnap = await db.collection('system').doc('sri_worker').get();
                return res.status(200).json({
                    sri: {
                        ...sriProfileForOwner(privateConfig),
                        ...sriWorkerReadiness(workerSnap.exists ? workerSnap.data() : {})
                    }
                });
            }
            if (action === 'save-sri-config') {
                const update = sanitizeSriUpdate(req.body?.sri || {});
                await sriRef.set(update, { merge: true });
                const saved = { ...privateConfig, ...update };
                return res.status(200).json({ sri: sriProfileForOwner(saved), configured: hasCompleteSriConfig({}, saved) });
            }
            return res.status(400).json({ error: 'Acción SRI no válida.' });
        }

        // Cargar configuración del productor administrador (sossa)
        const producerRef = db.collection('users').doc(ADMIN_UID);
        const [snap, privateSnap] = await Promise.all([
            producerRef.collection('config').doc('producer').get(),
            producerRef.collection('private_config').doc('producer').get()
        ]);

        if (!snap.exists) {
            return res.status(404).json({ error: 'Configuración de pagos no encontrada.' });
        }

        return res.status(200).json({
            ...serializePublicPaymentConfig({
                ...snap.data(),
                ...(privateSnap.exists ? privateSnap.data() : {})
            }, process.env),
            capabilities: paymentCapabilities()
        });

    } catch (error) {
        console.error('Payment config error:', error?.code || 'INTERNAL_ERROR');
        const status = Number.isInteger(error?.status) ? error.status : 500;
        return res.status(status).json({ error: status === 500 ? 'Error interno del servidor.' : error.message });
    }
}
