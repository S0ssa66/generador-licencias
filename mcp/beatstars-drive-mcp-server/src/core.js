import crypto from 'node:crypto';
import { createReadStream } from 'node:fs';
import { opendir, realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ARCHIVE_EXTENSIONS = new Set(['.zip', '.rar', '.tar', '.gz']);
const MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024;
const MAX_FILES = 2000;
const inventories = new Map();
const plans = new Map();

function cleanText(value, maximum = 2000) {
    return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maximum);
}

function ensureExportRoot() {
    const configured = cleanText(process.env.BEATSS_EXPORT_ROOT, 4096);
    if (!configured) {
        throw new Error('Falta BEATSS_EXPORT_ROOT. Configura una carpeta dedicada que contenga únicamente tus exportaciones de BeatStars.');
    }
    return configured;
}

async function safePath(requestedPath, expectedType) {
    const root = await realpath(ensureExportRoot());
    const target = await realpath(cleanText(requestedPath, 4096));
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
        throw new Error('La ruta solicitada está fuera de BEATSS_EXPORT_ROOT.');
    }
    const details = await stat(target);
    if (expectedType === 'directory' && !details.isDirectory()) throw new Error('La ruta de exportación debe ser una carpeta.');
    if (expectedType === 'file' && !details.isFile()) throw new Error('La ruta de metadatos debe ser un archivo.');
    return target;
}

export function normalizeBeatName(value) {
    return cleanText(value, 180)
        .replace(/\s*\(collaborator\)\s*/gi, ' ')
        .replace(/^type\s+beat\s+/i, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function beatKey(value) {
    return normalizeBeatName(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '')
        .toLowerCase();
}

export function beatIdForName(name) {
    const slug = normalizeBeatName(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    if (!slug) throw new Error('No se pudo crear un ID para un beat sin nombre.');
    return `beat_${slug.slice(0, 110)}`;
}

export function normalizeBeatssBaseUrl(value = 'https://beatss.app') {
    let url;
    try {
        url = new URL(cleanText(value, 300));
    } catch (_) {
        throw new Error('La URL de BEATSS no es válida.');
    }
    const isProduction = url.protocol === 'https:' && (url.hostname === 'beatss.app' || url.hostname === 'www.beatss.app');
    const isLocal = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!isProduction && !isLocal) {
        throw new Error('La migración sólo puede enviar la clave temporal a beatss.app o a un entorno local autorizado.');
    }
    if (url.pathname !== '/' || url.search || url.hash || url.username || url.password) {
        throw new Error('La URL de BEATSS debe ser sólo el origen, sin ruta ni credenciales.');
    }
    return url.origin;
}

function roleForFile(fileName) {
    const extension = path.extname(fileName).toLowerCase();
    const base = path.basename(fileName, extension).toLowerCase();
    if (IMAGE_EXTENSIONS.has(extension)) return 'artwork';
    if (ARCHIVE_EXTENSIONS.has(extension)) return 'stems';
    if (extension === '.wav') return 'wav';
    if (extension === '.mp3') {
        if (/(?:^|[\s_-])(tagged|preview)(?:$|[\s_-])/i.test(base)) return 'preview';
        return /(?:^|[\s_-])(stem|stems|trackout|trackouts)(?:$|[\s_-])/i.test(base) ? 'stems' : 'mp3';
    }
    return null;
}

function candidateBeatName(fileName, role) {
    const extension = path.extname(fileName);
    let base = path.basename(fileName, extension);
    const patterns = [
        /(?:^|[\s_-])(mp3|wav|master|untagged|tagged|preview|delivery|instrumental)(?:$|[\s_-])/gi,
        /(?:^|[\s_-])(stem|stems|trackout|trackouts|zip|artwork|cover|portada)(?:$|[\s_-])/gi,
        /\((?:mp3|wav|master|stems?|trackouts?|artwork|cover|portada|delivery)\)/gi
    ];
    patterns.forEach((pattern) => { base = base.replace(pattern, ' '); });
    const normalized = normalizeBeatName(base);
    return normalized || normalizeBeatName(fileName.replace(extension, '')) || role;
}

async function checksumFile(filePath) {
    const hash = crypto.createHash('sha256');
    await new Promise((resolve, reject) => {
        const input = createReadStream(filePath);
        input.on('data', (chunk) => hash.update(chunk));
        input.on('error', reject);
        input.on('end', resolve);
    });
    return hash.digest('hex');
}

async function collectFiles(directory) {
    const files = [];
    async function visit(current) {
        const dir = await opendir(current);
        for await (const entry of dir) {
            if (entry.name.startsWith('.')) continue;
            const absolutePath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
                continue;
            }
            if (!entry.isFile()) continue;
            const role = roleForFile(entry.name);
            if (!role) continue;
            const details = await stat(absolutePath);
            if (details.size <= 0 || details.size > MAX_FILE_SIZE) continue;
            if (files.length >= MAX_FILES) throw new Error(`La exportación supera el límite de ${MAX_FILES} archivos por ejecución.`);
            files.push({
                absolutePath,
                relativePath: path.relative(directory, absolutePath),
                fileName: entry.name,
                extension: path.extname(entry.name).toLowerCase(),
                role,
                candidateName: candidateBeatName(entry.name, role),
                size: details.size,
                checksum: await checksumFile(absolutePath)
            });
        }
    }
    await visit(directory);
    return files;
}

export function parseCsv(text) {
    const rows = [];
    let row = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const next = text[index + 1];
        if (character === '"' && quoted && next === '"') {
            value += '"';
            index += 1;
        } else if (character === '"') {
            quoted = !quoted;
        } else if (character === ',' && !quoted) {
            row.push(value.trim());
            value = '';
        } else if ((character === '\n' || character === '\r') && !quoted) {
            if (character === '\r' && next === '\n') index += 1;
            row.push(value.trim());
            if (row.some(Boolean)) rows.push(row);
            row = [];
            value = '';
        } else {
            value += character;
        }
    }
    row.push(value.trim());
    if (row.some(Boolean)) rows.push(row);
    if (!rows.length) return [];
    const headers = rows.shift().map((header) => cleanText(header, 120).toLowerCase());
    return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ''])));
}

function valueFor(row, aliases) {
    for (const alias of aliases) {
        const value = row[alias];
        if (value !== undefined && cleanText(value)) return cleanText(value);
    }
    return '';
}

function canonicalMetadata(row) {
    const name = normalizeBeatName(valueFor(row, ['name', 'title', 'track name', 'track_name', 'beat name', 'beat_name', 'item name', 'item_name', 'track']));
    if (!name) return null;
    const bpmRaw = valueFor(row, ['bpm', 'tempo']);
    const bpm = bpmRaw && Number.isFinite(Number(bpmRaw)) ? Number(bpmRaw) : null;
    return {
        name,
        bpm: bpm && bpm >= 1 && bpm <= 300 ? bpm : null,
        key: valueFor(row, ['key', 'musical_key', 'scale', 'tonality']),
        genre: valueFor(row, ['genre', 'genres']),
        tags: valueFor(row, ['tags', 'keywords']),
        description: valueFor(row, ['description', 'desc'])
    };
}

async function loadMetadata(metadataPath) {
    if (!metadataPath) return [];
    const safeMetadataPath = await safePath(metadataPath, 'file');
    const text = await readFile(safeMetadataPath, 'utf8');
    const extension = path.extname(safeMetadataPath).toLowerCase();
    let rows = [];
    if (extension === '.json') {
        const parsed = JSON.parse(text);
        rows = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.beats) ? parsed.beats : []);
    } else if (extension === '.csv') {
        rows = parseCsv(text).filter((row) => !/^transactions$/i.test(valueFor(row, ['name', 'title'])));
    } else {
        throw new Error('Los metadatos deben ser un archivo CSV o JSON.');
    }
    const seen = new Set();
    return rows.map(canonicalMetadata).filter((entry) => {
        if (!entry) return false;
        const key = beatKey(entry.name);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function fileMatchesBeat(file, metadata) {
    const candidate = beatKey(file.candidateName);
    const direct = metadata.find((beat) => beatKey(beat.name) === candidate);
    if (direct) return direct;
    const candidates = metadata.filter((beat) => {
        const key = beatKey(beat.name);
        return key.length >= 4 && (candidate.includes(key) || key.includes(candidate));
    });
    return candidates.length === 1 ? candidates[0] : null;
}

export async function inventoryBeatStarsExport({ sourceDir, metadataFile = '' }) {
    const safeSourceDir = await safePath(sourceDir, 'directory');
    const [files, metadata] = await Promise.all([collectFiles(safeSourceDir), loadMetadata(metadataFile)]);
    const beats = new Map(metadata.map((entry) => [beatKey(entry.name), { ...entry, files: {} }]));
    const unmatchedFiles = [];

    for (const file of files) {
        const matched = fileMatchesBeat(file, metadata);
        const fallbackName = matched?.name || file.candidateName;
        const key = beatKey(fallbackName);
        if (!key) {
            unmatchedFiles.push(file.relativePath);
            continue;
        }
        if (!beats.has(key)) beats.set(key, { name: fallbackName, bpm: null, key: '', genre: '', tags: '', description: '', files: {} });
        const beat = beats.get(key);
        if (beat.files[file.role]) {
            unmatchedFiles.push(file.relativePath);
            continue;
        }
        beat.files[file.role] = file;
    }

    const checksumGroups = new Map();
    files.forEach((file) => {
        const group = checksumGroups.get(file.checksum) || [];
        group.push(file.relativePath);
        checksumGroups.set(file.checksum, group);
    });
    const duplicateFiles = [...checksumGroups.values()].filter((group) => group.length > 1);
    const beatList = [...beats.values()]
        .map((beat) => ({ ...beat, id: beatIdForName(beat.name) }))
        .sort((left, right) => left.name.localeCompare(right.name, 'es'));
    return {
        sourceDir: safeSourceDir,
        metadataCount: metadata.length,
        filesScanned: files.length,
        beats: beatList,
        unmatchedFiles,
        duplicateFiles,
        totalBytes: files.reduce((total, file) => total + file.size, 0)
    };
}

export function storeInventory(inventory) {
    const id = crypto.randomUUID();
    inventories.set(id, inventory);
    return id;
}

export function getInventory(inventoryId) {
    const inventory = inventories.get(cleanText(inventoryId, 100));
    if (!inventory) throw new Error('No se encontró el inventario. Vuelve a analizar la exportación en esta misma sesión del MCP.');
    return inventory;
}

export function createMigrationPlan(inventory, { existingPolicy = 'skip' } = {}) {
    if (!['skip', 'update_assets'].includes(existingPolicy)) {
        throw new Error('La política para beats existentes no es válida.');
    }
    const id = crypto.randomUUID();
    const beats = inventory.beats
        .filter((beat) => Object.keys(beat.files).length > 0)
        .map((beat) => ({
            id: beat.id,
            name: beat.name,
            bpm: beat.bpm,
            key: beat.key,
            genre: beat.genre,
            tags: beat.tags,
            description: beat.description,
            files: beat.files
        }));
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ existingPolicy, beats: beats.map((beat) => ({
        id: beat.id,
        files: Object.fromEntries(Object.entries(beat.files).map(([role, file]) => [role, file.checksum]))
    })) })).digest('hex');
    const confirmationCode = `MIGRATE-${id.slice(0, 8).toUpperCase()}-${fingerprint.slice(0, 6).toUpperCase()}`;
    const plan = {
        id,
        fingerprint,
        confirmationCode,
        createdAt: new Date().toISOString(),
        existingPolicy,
        inventory,
        beats
    };
    plans.set(id, plan);
    return plan;
}

export function getMigrationPlan(planId) {
    const plan = plans.get(cleanText(planId, 100));
    if (!plan) throw new Error('No se encontró el plan. Vuelve a generarlo en esta misma sesión del MCP.');
    return plan;
}

export function catalogHasExistingBeat(status) {
    return Array.isArray(status?.existing) && status.existing.length > 0;
}

function extensionMimeType(extension) {
    return {
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.zip': 'application/zip',
        '.rar': 'application/vnd.rar', '.tar': 'application/x-tar', '.gz': 'application/gzip',
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'
    }[extension] || 'application/octet-stream';
}

function fileNameForDrive(beat, role, file) {
    const original = path.basename(file.fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(-140);
    return `${beat.id}_${role}_${file.checksum.slice(0, 12)}_${original}`;
}

async function postMigration(baseUrl, ticket, action, body = {}) {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/beatstars-migration`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-BEATSS-Migration-Key': ticket
        },
        body: JSON.stringify({ action, ...body }),
        signal: AbortSignal.timeout(60_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.error || `BEATSS respondió ${response.status}.`);
        error.status = response.status;
        throw error;
    }
    return data;
}

async function uploadFile(baseUrl, ticket, beat, role, file) {
    const session = await postMigration(baseUrl, ticket, 'create_upload_session', {
        fileName: fileNameForDrive(beat, role, file),
        contentType: extensionMimeType(file.extension),
        fileSize: file.size
    });
    const upload = await fetch(session.uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': extensionMimeType(file.extension),
            'Content-Length': String(file.size)
        },
        body: createReadStream(file.absolutePath),
        duplex: 'half',
        signal: AbortSignal.timeout(10 * 60_000)
    });
    const data = await upload.json().catch(() => ({}));
    if (!upload.ok || !data.id) throw new Error(`Google Drive no pudo subir ${file.relativePath}.`);
    return `https://beatss.app/api/proxy-audio?id=${data.id}`;
}

export async function executeMigrationPlan({ planId, confirmationCode, baseUrl = 'https://beatss.app', onProgress = () => {} }) {
    const plan = getMigrationPlan(planId);
    if (confirmationCode !== plan.confirmationCode) {
        throw new Error('El código de confirmación no coincide con el plan. No se subió ningún archivo.');
    }
    const ticket = cleanText(process.env.BEATSS_MIGRATION_KEY, 1024);
    if (!ticket) throw new Error('Falta BEATSS_MIGRATION_KEY. Genera y copia una clave temporal desde Configuración de BEATSS.');
    const safeBaseUrl = normalizeBeatssBaseUrl(baseUrl);
    const result = { planId: plan.id, migrated: [], skipped: [], failed: [] };
    for (let index = 0; index < plan.beats.length; index += 1) {
        const beat = plan.beats[index];
        onProgress({ stage: 'checking_catalog', beat: beat.name, index: index + 1, total: plan.beats.length });
        try {
            const status = await postMigration(safeBaseUrl, ticket, 'catalog_status', { beatIds: [beat.id] });
            const existsInCatalog = catalogHasExistingBeat(status);
            if (existsInCatalog && plan.existingPolicy !== 'update_assets') {
                result.skipped.push({ id: beat.id, name: beat.name, reason: 'Ya existe en el catálogo; no se subió ningún archivo duplicado.' });
                continue;
            }
            const uploaded = {};
            for (const [role, file] of Object.entries(beat.files)) {
                onProgress({ stage: 'uploading', beat: beat.name, role, index: index + 1, total: plan.beats.length });
                uploaded[role] = await uploadFile(safeBaseUrl, ticket, beat, role, file);
            }
            onProgress({ stage: 'registering_catalog', beat: beat.name, index: index + 1, total: plan.beats.length });
            const catalog = await postMigration(safeBaseUrl, ticket, 'upsert_catalog_beat', {
                allowUpdate: existsInCatalog,
                beat: {
                    id: beat.id,
                    name: beat.name,
                    bpm: beat.bpm,
                    key: beat.key,
                    genre: beat.genre,
                    tags: beat.tags,
                    description: beat.description,
                    files: uploaded
                }
            });
            result.migrated.push({ id: beat.id, name: beat.name, files: Object.keys(uploaded), updatedExisting: existsInCatalog, catalog });
        } catch (error) {
            if (error?.status === 409) result.skipped.push({ id: beat.id, name: beat.name, reason: error.message });
            else result.failed.push({ id: beat.id, name: beat.name, reason: error instanceof Error ? error.message : String(error) });
        }
    }
    return result;
}

export function planSummary(plan, offset = 0, limit = 25) {
    const items = plan.beats.slice(offset, offset + limit).map((beat) => ({
        id: beat.id,
        name: beat.name,
        bpm: beat.bpm,
        files: Object.fromEntries(Object.entries(beat.files).map(([role, file]) => [role, {
            relativePath: file.relativePath,
            size: file.size,
            checksum: file.checksum
        }]))
    }));
    return {
        planId: plan.id,
        createdAt: plan.createdAt,
        existingPolicy: plan.existingPolicy,
        confirmationCode: plan.confirmationCode,
        beatsTotal: plan.beats.length,
        filesTotal: plan.inventory.filesScanned,
        totalBytes: plan.inventory.totalBytes,
        unmatchedFiles: plan.inventory.unmatchedFiles,
        duplicateGroups: plan.inventory.duplicateFiles.length,
        offset,
        count: items.length,
        hasMore: offset + items.length < plan.beats.length,
        nextOffset: offset + items.length < plan.beats.length ? offset + items.length : null,
        beats: items
    };
}
