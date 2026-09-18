import crypto from 'crypto';

export const MIGRATION_TICKET_TTL_MS = 20 * 60 * 1000;
export const MIGRATION_MAX_FILES = 1000;
export const MIGRATION_MAX_RESERVED_BYTES = 100 * 1024 * 1024 * 1024;

function cleanString(value, maxLength = 180) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, maxLength);
}

function cleanOptionalNumber(value, min, max, field) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    if (!Number.isFinite(number) || number < min || number > max) {
        throw new Error(`${field} debe estar entre ${min} y ${max}.`);
    }
    return number;
}

function canonicalBeatId(value) {
    const safe = cleanString(value, 120).toLowerCase();
    if (!/^beat_[a-z0-9][a-z0-9_-]{0,114}$/.test(safe)) {
        throw new Error('El identificador del beat no tiene un formato válido.');
    }
    return safe;
}

export function validateMigrationBeatIds(values) {
    if (!Array.isArray(values) || values.length < 1 || values.length > 100) {
        throw new Error('Indica entre 1 y 100 identificadores de beats para consultar.');
    }
    return [...new Set(values.map(canonicalBeatId))];
}

function isAllowedProxyUrl(value) {
    return /^https:\/\/(?:www\.)?beatss\.app\/api\/proxy-audio\?id=[A-Za-z0-9_-]{3,200}$/.test(value);
}

function cleanProxyUrl(value, label) {
    const url = cleanString(value, 512);
    if (!url) return '';
    if (!isAllowedProxyUrl(url)) {
        throw new Error(`${label} debe ser un enlace seguro generado por BEATSS.`);
    }
    return url;
}

export function createMigrationTicket(uid) {
    const normalizedUid = cleanString(uid, 128);
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(normalizedUid)) {
        throw new Error('La sesión no contiene un identificador de productor válido.');
    }
    const ticketId = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('base64url');
    const uidPart = Buffer.from(normalizedUid, 'utf8').toString('base64url');
    return {
        ticketId,
        secret,
        ticket: `bsmt.${uidPart}.${ticketId}.${secret}`,
        expiresAt: Date.now() + MIGRATION_TICKET_TTL_MS
    };
}

export function parseMigrationTicket(ticket) {
    const parts = cleanString(ticket, 1024).split('.');
    if (parts.length !== 4 || parts[0] !== 'bsmt') {
        throw new Error('La clave de migración no tiene un formato válido.');
    }
    const [, encodedUid, ticketId, secret] = parts;
    let uid = '';
    try {
        uid = Buffer.from(encodedUid, 'base64url').toString('utf8');
    } catch (_) {
        throw new Error('La clave de migración no tiene un productor válido.');
    }
    if (!/^[A-Za-z0-9_-]{6,128}$/.test(uid) || !/^[0-9a-f-]{36}$/i.test(ticketId) || !/^[A-Za-z0-9_-]{40,120}$/.test(secret)) {
        throw new Error('La clave de migración no tiene un formato válido.');
    }
    return { uid, ticketId, secret };
}

export function hashMigrationSecret(secret) {
    return crypto.createHash('sha256').update(String(secret), 'utf8').digest('base64url');
}

export function secretMatches(expectedHash, providedSecret) {
    const expected = Buffer.from(String(expectedHash || ''), 'utf8');
    const provided = Buffer.from(hashMigrationSecret(providedSecret), 'utf8');
    return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export function validateMigrationBeat(payload = {}) {
    const beat = payload.beat && typeof payload.beat === 'object' ? payload.beat : {};
    const files = beat.files && typeof beat.files === 'object' ? beat.files : {};
    const id = canonicalBeatId(beat.id);
    const name = cleanString(beat.name, 160);
    if (!name) throw new Error('El nombre del beat es obligatorio.');

    const mp3 = cleanProxyUrl(files.mp3, 'El MP3');
    const preview = cleanProxyUrl(files.preview, 'La vista previa');
    const wav = cleanProxyUrl(files.wav, 'El WAV');
    const stems = cleanProxyUrl(files.stems, 'Los stems');
    const artwork = cleanProxyUrl(files.artwork, 'La portada');
    if (![mp3, preview, wav, stems, artwork].some(Boolean)) {
        throw new Error('El beat debe tener al menos un archivo subido a Drive antes de registrarse.');
    }

    const bpm = cleanOptionalNumber(beat.bpm, 1, 300, 'El BPM');
    const allowUpdate = payload.allowUpdate === true;
    const publicData = { id, name, updatedAt: Date.now() };
    const privateData = {};
    const metadata = {
        bpm,
        key: cleanString(beat.key, 64),
        genre: cleanString(beat.genre, 80),
        tags: cleanString(beat.tags, 600),
        description: cleanString(beat.description, 2000)
    };

    if (artwork) publicData.artwork = artwork;
    // El MP3 de catálogo puede ser el archivo de entrega. Se mantiene privado
    // y el fulfillment lo firma para cada compra; una vista previa etiquetada
    // nunca reemplaza este recurso.
    if (mp3) privateData.mp3 = mp3;
    if (preview) privateData.preview = preview;
    if (wav) privateData.wav = wav;
    if (stems) privateData.stems = stems;
    Object.entries(metadata).forEach(([field, value]) => {
        if (value !== '' && value !== null) publicData[field] = value;
    });
    if (!allowUpdate) publicData.source = 'beatstars-migration';

    return { allowUpdate, publicData, privateData };
}

export function makeBeatssProxyUrl(fileId) {
    const id = cleanString(fileId, 200);
    if (!/^[A-Za-z0-9_-]{3,200}$/.test(id)) {
        throw new Error('Google Drive no devolvió un identificador de archivo válido.');
    }
    return `https://beatss.app/api/proxy-audio?id=${id}`;
}
