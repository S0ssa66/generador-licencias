import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    getDriveRuntimeConfig,
    sanitizeDriveName,
    validateDriveUpload
} from '../api/_gdrive-storage.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la configuración central mantiene secretos en el servidor y limita la cuenta autorizada', () => {
    const keys = [
        'GOOGLE_DRIVE_CLIENT_ID',
        'GOOGLE_DRIVE_CLIENT_SECRET',
        'GOOGLE_DRIVE_REFRESH_TOKEN',
        'GOOGLE_DRIVE_ALLOWED_EMAIL',
        'GOOGLE_DRIVE_ROOT_FOLDER'
    ];
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

    try {
        process.env.GOOGLE_DRIVE_CLIENT_ID = 'server-client-id';
        process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'server-secret';
        process.env.GOOGLE_DRIVE_REFRESH_TOKEN = 'server-refresh-token';
        delete process.env.GOOGLE_DRIVE_ALLOWED_EMAIL;
        delete process.env.GOOGLE_DRIVE_ROOT_FOLDER;

        const config = getDriveRuntimeConfig({
            clientId: 'legacy-client-id',
            clientSecret: 'legacy-secret',
            refreshToken: 'legacy-refresh-token',
            authorizedEmail: 'SossaMusic@gmail.com'
        });

        assert.equal(config.clientId, 'server-client-id');
        assert.equal(config.clientSecret, 'server-secret');
        assert.equal(config.refreshToken, 'server-refresh-token');
        assert.equal(config.authorizedEmail, 'sossamusic@gmail.com');
        assert.equal(config.allowedEmail, 'sossamusic@gmail.com');
        assert.equal(config.rootFolder, 'BEATSS Platform');
    } finally {
        for (const key of keys) {
            if (previous[key] === undefined) delete process.env[key];
            else process.env[key] = previous[key];
        }
    }
});

test('las subidas a Drive aceptan recursos musicales conocidos y rechazan archivos peligrosos', () => {
    assert.deepEqual(
        validateDriveUpload({ fileName: 'Mi Beat.wav', contentType: 'audio/wav', fileSize: 4096 }),
        { fileName: 'Mi Beat.wav', contentType: 'audio/wav', fileSize: 4096, folder: 'Beats' }
    );
    assert.equal(
        validateDriveUpload({ fileName: 'Portada.webp', contentType: 'image/webp', fileSize: 2048 }).folder,
        'Artwork'
    );
    assert.throws(
        () => validateDriveUpload({ fileName: 'programa.exe', contentType: 'application/octet-stream', fileSize: 1 }),
        /no permitido/
    );
    assert.throws(
        () => validateDriveUpload({ fileName: 'vacio.mp3', contentType: 'audio/mpeg', fileSize: 0 }),
        /tamaño válido/
    );
    assert.throws(
        () => validateDriveUpload({ fileName: 'enorme.zip', contentType: 'application/zip', fileSize: 6 * 1024 ** 3 }),
        /hasta 5 GB/
    );
});

test('los nombres de carpetas y archivos no conservan separadores inseguros', () => {
    assert.equal(sanitizeDriveName('  Sossa / Beats: 2026  '), 'Sossa _ Beats_ 2026');
    assert.equal(sanitizeDriveName('\u0000\u0007', 'Archivo'), 'Archivo');
});

test('la interfaz nunca solicita el Client Secret y usa el flujo OAuth de código', () => {
    const html = read('index.html');
    const editor = read('editor.js');
    const endpoint = read('api/gdrive.js');

    assert.doesNotMatch(html, /cfg-gdrive-client-secret|cfg-gdrive-client-id/);
    assert.doesNotMatch(editor, /clientSecret\s*:/);
    assert.match(editor, /initCodeClient/);
    assert.match(editor, /login_hint:\s*platformGDriveExpectedEmail/);
    assert.match(editor, /select_account:\s*true/);
    assert.match(editor, /'X-Requested-With': 'XMLHttpRequest'/);
    assert.match(editor, /fetch\('\/api\/gdrive-oauth-client'/);
    assert.match(endpoint, /runtime\.allowedEmail/);
    assert.match(endpoint, /req\.headers\['x-requested-with'\]/);
    const statusResponse = endpoint.match(/return res\.status\(200\)\.json\(\{\s*linked,[\s\S]*?oauthReady:[\s\S]*?\}\);/)?.[0] || '';
    assert.doesNotMatch(statusResponse, /clientId\s*:/);
    assert.match(endpoint, /if \(isOauthClient\)[\s\S]*Cache-Control', 'no-store'[\s\S]*clientId: config\.clientId/);
});

test('el catálogo usa Drive central con descriptor de tamaño y Firebase como respaldo', () => {
    const catalog = read('catalog.js');
    const defaults = read('producerDefaults.js');

    assert.match(catalog, /fileSize:\s*file\.size/);
    assert.match(catalog, /storageProvider === 'gdrive-central'/);
    assert.match(catalog, /uploadToFirebaseAudioStorage/);
    assert.match(defaults, /'sossa':[\s\S]*?storageProvider: "gdrive-central"/);
});
