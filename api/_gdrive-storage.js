const DEFAULT_ALLOWED_EMAIL = 'sossamusic@gmail.com';
const DEFAULT_ROOT_FOLDER = 'BEATSS Platform';

function cleanString(value, maxLength = 180) {
    return String(value || '').trim().slice(0, maxLength);
}

export function getDriveRuntimeConfig(stored = {}) {
    return {
        clientId: cleanString(process.env.GOOGLE_DRIVE_CLIENT_ID || stored.clientId, 240),
        clientSecret: cleanString(process.env.GOOGLE_DRIVE_CLIENT_SECRET || stored.clientSecret, 500),
        refreshToken: cleanString(process.env.GOOGLE_DRIVE_REFRESH_TOKEN || stored.refreshToken, 2048),
        authorizedEmail: cleanString(stored.authorizedEmail, 254).toLowerCase(),
        allowedEmail: cleanString(process.env.GOOGLE_DRIVE_ALLOWED_EMAIL || DEFAULT_ALLOWED_EMAIL, 254).toLowerCase(),
        rootFolder: cleanString(process.env.GOOGLE_DRIVE_ROOT_FOLDER || DEFAULT_ROOT_FOLDER, 120) || DEFAULT_ROOT_FOLDER
    };
}

export function sanitizeDriveName(value, fallback = 'Archivo') {
    const safe = cleanString(value, 180)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return safe || fallback;
}

export function validateDriveUpload({ fileName, contentType, fileSize }) {
    const safeFileName = sanitizeDriveName(fileName);
    const size = Number(fileSize || 0);
    const extension = safeFileName.toLowerCase().match(/\.[a-z0-9]{1,8}$/)?.[0] || '';
    const allowedExtensions = new Set([
        '.mp3', '.wav', '.zip', '.rar', '.tar', '.gz',
        '.jpg', '.jpeg', '.png', '.webp', '.pdf'
    ]);

    if (!allowedExtensions.has(extension)) {
        throw new Error('Tipo de archivo no permitido para el almacenamiento de BEATSS.');
    }
    if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024 * 1024) {
        throw new Error('El archivo debe tener un tamaño válido de hasta 5 GB.');
    }

    return {
        fileName: safeFileName,
        contentType: cleanString(contentType, 160) || 'application/octet-stream',
        fileSize: size,
        folder: ['.jpg', '.jpeg', '.png', '.webp'].includes(extension) ? 'Artwork' : 'Beats'
    };
}

function escapeDriveQueryValue(value) {
    return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

export async function getStoredDriveConfig(db) {
    const snapshot = await db.collection('system').doc('gdrive_config').get();
    return snapshot.exists ? snapshot.data() : {};
}

export async function refreshDriveAccessToken(db) {
    const stored = await getStoredDriveConfig(db);
    const config = getDriveRuntimeConfig(stored);
    if (!config.clientId || !config.clientSecret || !config.refreshToken) {
        throw new Error('Google Drive central todavía no está configurado completamente.');
    }

    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            refresh_token: config.refreshToken,
            grant_type: 'refresh_token'
        })
    });
    if (!response.ok) {
        throw new Error(`Google no pudo renovar la autorización (${response.status}).`);
    }
    const data = await response.json();
    if (!data.access_token) throw new Error('Google no devolvió un token de acceso.');
    return { accessToken: data.access_token, config };
}

export async function getOrCreateDriveFolder(accessToken, folderName, parentId = '') {
    const safeName = sanitizeDriveName(folderName, 'BEATSS');
    const parentClause = parentId ? ` and '${escapeDriveQueryValue(parentId)}' in parents` : '';
    const query = `name='${escapeDriveQueryValue(safeName)}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentClause}`;
    const search = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&spaces=drive`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!search.ok) throw new Error(`Google Drive no pudo buscar la carpeta ${safeName}.`);
    const result = await search.json();
    if (result.files?.[0]?.id) return result.files[0].id;

    const created = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: safeName,
            mimeType: 'application/vnd.google-apps.folder',
            ...(parentId ? { parents: [parentId] } : {})
        })
    });
    if (!created.ok) throw new Error(`Google Drive no pudo crear la carpeta ${safeName}.`);
    const folder = await created.json();
    if (!folder.id) throw new Error(`Google Drive no devolvió el ID de la carpeta ${safeName}.`);
    return folder.id;
}

export async function ensureProducerDriveFolder(accessToken, config, producerUid, producerAka, leafFolder) {
    const rootId = await getOrCreateDriveFolder(accessToken, config.rootFolder);
    const producersId = await getOrCreateDriveFolder(accessToken, 'Productores', rootId);
    const producerLabel = `${sanitizeDriveName(producerAka, 'Productor')} - ${String(producerUid || '').slice(0, 8)}`;
    const producerId = await getOrCreateDriveFolder(accessToken, producerLabel, producersId);
    return getOrCreateDriveFolder(accessToken, leafFolder, producerId);
}
