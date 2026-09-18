import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from './_cors-origin.js';
import {
    ensureProducerDriveFolder,
    refreshDriveAccessToken,
    validateDriveUpload
} from './_gdrive-storage.js';
import {
    createMigrationTicket,
    hashMigrationSecret,
    makeBeatssProxyUrl,
    MIGRATION_MAX_FILES,
    MIGRATION_MAX_RESERVED_BYTES,
    parseMigrationTicket,
    secretMatches,
    validateMigrationBeat,
    validateMigrationBeatIds
} from './_beatstars-migration.js';

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 15;
const migrationRateWindows = new Map();

export function resetMigrationTicketRateLimit() {
    migrationRateWindows.clear();
}

export function checkMigrationTicketRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = migrationRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        migrationRateWindows.set(ip, { start: now, count: 1 });
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

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        })
    });
}

function configureCors(req, res) {
    const origin = req.headers?.origin;
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-BEATSS-Migration-Key');
    res.setHeader('Cache-Control', 'no-store');
}

function errorMessage(error, fallback) {
    return error instanceof Error && error.message ? error.message : fallback;
}

function isPlatformAdmin(decoded = {}) {
    const configured = String(process.env.BEATSS_ADMIN_EMAILS || '')
        .split(',')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean);
    const email = String(decoded.email || '').trim().toLowerCase();
    const SOSSA_ADMIN_EMAILS = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'];
    return decoded.admin === true || SOSSA_ADMIN_EMAILS.includes(email) || configured.includes(email);
}

async function verifySignedInUser(req) {
    const authorization = String(req.headers.authorization || '');
    if (!authorization.startsWith('Bearer ')) throw new Error('Sesión requerida.');
    initFirebaseAdmin();
    return getAuth().verifyIdToken(authorization.slice(7));
}

async function getProducerForMigration(db, decoded) {
    const producerRef = db.collection('users').doc(decoded.uid).collection('config').doc('producer');
    const producerSnap = await producerRef.get();
    if (!producerSnap.exists) throw new Error('Completa primero la configuración del productor.');
    const producer = producerSnap.data() || {};
    if (!isPlatformAdmin(decoded)) {
        const plan = String(producer.plan || 'inicial').toLowerCase();
        const expires = producer.expirationPro || producer.planExpirationDate;
        const expired = expires ? new Date() > new Date(expires) : false;
        if ((plan !== 'pro' && plan !== 'elite') || expired) {
            throw new Error('La migración masiva requiere un plan Pro o Elite activo.');
        }
    }
    return producer;
}

async function authorizeMigrationTicket(req, db) {
    const rawTicket = String(req.headers['x-beatss-migration-key'] || '').trim();
    const parsed = parseMigrationTicket(rawTicket);
    const ref = db.collection('users').doc(parsed.uid).collection('migration_tickets').doc(parsed.ticketId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('La clave de migración no existe o ya fue revocada.');
    const record = snapshot.data() || {};
    if (record.status !== 'active' || !secretMatches(record.secretHash, parsed.secret)) {
        throw new Error('La clave de migración no es válida.');
    }
    if (!Number.isFinite(record.expiresAt) || record.expiresAt <= Date.now()) {
        await ref.set({ status: 'expired', expiredAt: Date.now() }, { merge: true });
        throw new Error('La clave de migración venció. Genera una nueva desde Configuración.');
    }
    return { ...parsed, ref, record };
}

async function createTicket(req, res) {
    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkMigrationTicketRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes de tickets de migración. Por favor espera unos minutos.' });
    }
    const decoded = await verifySignedInUser(req);
    const db = getFirestore();
    await getProducerForMigration(db, decoded);
    const created = createMigrationTicket(decoded.uid);
    await db.collection('users').doc(decoded.uid).collection('migration_tickets').doc(created.ticketId).set({
        secretHash: hashMigrationSecret(created.secret),
        status: 'active',
        createdAt: Date.now(),
        expiresAt: created.expiresAt,
        reservedBytes: 0,
        fileCount: 0,
        catalogEntries: 0,
        source: 'beatstars-mcp'
    });
    return res.status(201).json({
        ticket: created.ticket,
        expiresAt: created.expiresAt,
        maxFiles: MIGRATION_MAX_FILES,
        maxBytes: MIGRATION_MAX_RESERVED_BYTES
    });
}

async function reserveUpload(db, ticket, descriptor) {
    await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(ticket.ref);
        if (!fresh.exists) throw new Error('La clave de migración ya no existe.');
        const data = fresh.data() || {};
        if (data.status !== 'active' || data.expiresAt <= Date.now()) {
            throw new Error('La clave de migración venció. Genera una nueva desde Configuración.');
        }
        const nextFiles = Number(data.fileCount || 0) + 1;
        const nextBytes = Number(data.reservedBytes || 0) + descriptor.fileSize;
        if (nextFiles > MIGRATION_MAX_FILES || nextBytes > MIGRATION_MAX_RESERVED_BYTES) {
            throw new Error('El plan excede el límite temporal autorizado. Divide la migración en grupos más pequeños.');
        }
        transaction.update(ticket.ref, {
            fileCount: nextFiles,
            reservedBytes: nextBytes,
            lastUsedAt: Date.now()
        });
    });
}

async function createUploadSession(req, res) {
    initFirebaseAdmin();
    const db = getFirestore();
    const ticket = await authorizeMigrationTicket(req, db);
    const descriptor = validateDriveUpload(req.body || {});
    await reserveUpload(db, ticket, descriptor);

    const producerSnap = await db.collection('users').doc(ticket.uid).collection('config').doc('producer').get();
    if (!producerSnap.exists) throw new Error('La configuración del productor ya no está disponible.');
    const producer = producerSnap.data() || {};
    const { accessToken, config } = await refreshDriveAccessToken(db);
    if (config.authorizedEmail !== config.allowedEmail) {
        throw new Error('La cuenta de Google Drive no coincide con la configurada para BEATSS.');
    }
    const folderId = await ensureProducerDriveFolder(
        accessToken,
        config,
        ticket.uid,
        producer.aka || producer.name || 'Productor',
        descriptor.folder
    );
    const driveResponse = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': descriptor.contentType,
            'X-Upload-Content-Length': String(descriptor.fileSize)
        },
        body: JSON.stringify({
            name: descriptor.fileName,
            parents: [folderId],
            appProperties: {
                beatssProducer: ticket.uid,
                beatssMigration: ticket.ticketId,
                beatssCategory: descriptor.folder.toLowerCase()
            }
        })
    });
    if (!driveResponse.ok) {
        throw new Error(`Google Drive no pudo preparar la subida (${driveResponse.status}).`);
    }
    const uploadUrl = driveResponse.headers.get('Location');
    if (!uploadUrl) throw new Error('Google Drive no devolvió una sesión de subida válida.');
    return res.status(200).json({
        uploadUrl,
        provider: 'gdrive-central',
        expiresAt: ticket.record.expiresAt
    });
}

async function upsertCatalogBeat(req, res) {
    initFirebaseAdmin();
    const db = getFirestore();
    const ticket = await authorizeMigrationTicket(req, db);
    const validated = validateMigrationBeat(req.body || {});
    const beatRef = db.collection('users').doc(ticket.uid).collection('beats').doc(validated.publicData.id);
    const filesRef = beatRef.collection('private').doc('files');
    let created = false;

    await db.runTransaction(async (transaction) => {
        const current = await transaction.get(beatRef);
        const currentTicket = await transaction.get(ticket.ref);
        if (current.exists && !validated.allowUpdate) {
            const error = new Error(`El beat ${validated.publicData.name} ya existe en el catálogo. El plan lo dejó intacto.`);
            error.code = 'catalog/conflict';
            throw error;
        }
        if (!currentTicket.exists || currentTicket.data()?.status !== 'active' || currentTicket.data()?.expiresAt <= Date.now()) {
            throw new Error('La clave de migración venció. Genera una nueva desde Configuración.');
        }
        created = !current.exists;
        transaction.set(beatRef, validated.publicData, { merge: validated.allowUpdate });
        transaction.set(filesRef, validated.privateData, { merge: validated.allowUpdate });
        transaction.update(ticket.ref, {
            catalogEntries: Number(currentTicket.data()?.catalogEntries || 0) + 1,
            lastUsedAt: Date.now()
        });
    });

    return res.status(created ? 201 : 200).json({
        success: true,
        created,
        beat: {
            id: validated.publicData.id,
            name: validated.publicData.name,
            mp3: Boolean(validated.privateData.mp3 || validated.publicData.mp3),
            artwork: validated.publicData.artwork,
            preview: Boolean(validated.privateData.preview),
            wav: Boolean(validated.privateData.wav),
            stems: Boolean(validated.privateData.stems)
        }
    });
}

async function catalogStatus(req, res) {
    initFirebaseAdmin();
    const db = getFirestore();
    const ticket = await authorizeMigrationTicket(req, db);
    const beatIds = validateMigrationBeatIds(req.body?.beatIds || []);
    const refs = beatIds.map((id) => db.collection('users').doc(ticket.uid).collection('beats').doc(id));
    const snapshots = await db.getAll(...refs);
    return res.status(200).json({
        existing: snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => ({
            id: snapshot.id,
            name: String(snapshot.data()?.name || snapshot.id).slice(0, 160)
        }))
    });
}

export default async function handler(req, res) {
    configureCors(req, res);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    const action = String(req.body?.action || '').trim();
    try {
        if (action === 'create_ticket') return await createTicket(req, res);
        if (action === 'catalog_status') return await catalogStatus(req, res);
        if (action === 'create_upload_session') return await createUploadSession(req, res);
        if (action === 'upsert_catalog_beat') return await upsertCatalogBeat(req, res);
        return res.status(400).json({ error: 'Acción de migración no válida.' });
    } catch (error) {
        const message = errorMessage(error, 'No se pudo completar la migración.');
        const status = error?.code === 'catalog/conflict' ? 409
            : /Sesión requerida|no es válida|no existe|venció/i.test(message) ? 401
                : /requiere un plan|Completa primero|no coincide/i.test(message) ? 403
                    : 400;
        console.error('[BEATSS] Error de migración BeatStars:', { action, status, message });
        return res.status(status).json({ error: message });
    }
}

export { makeBeatssProxyUrl };
