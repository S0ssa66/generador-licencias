import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    createMigrationTicket,
    hashMigrationSecret,
    parseMigrationTicket,
    secretMatches,
    validateMigrationBeat
} from '../api/_beatstars-migration.js';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('las claves de migración son temporales, no reversibles y están ligadas a un productor', () => {
    const created = createMigrationTicket('producer_123456');
    const parsed = parseMigrationTicket(created.ticket);

    assert.equal(parsed.uid, 'producer_123456');
    assert.equal(parsed.ticketId, created.ticketId);
    assert.ok(created.expiresAt > Date.now());
    assert.ok(secretMatches(hashMigrationSecret(created.secret), parsed.secret));
    assert.equal(secretMatches(hashMigrationSecret(created.secret), 'otro-secreto-invalido'), false);
    assert.throws(() => parseMigrationTicket('not-a-ticket'), /formato válido/);
});

test('el registro de catálogo sólo acepta enlaces proxy de BEATSS y separa los archivos privados', () => {
    const valid = validateMigrationBeat({
        beat: {
            id: 'beat_diamond',
            name: 'Diamond',
            bpm: 96,
            genre: 'Dancehall',
            files: {
                mp3: 'https://beatss.app/api/proxy-audio?id=abc_def-123',
                preview: 'https://beatss.app/api/proxy-audio?id=preview_def-000',
                wav: 'https://beatss.app/api/proxy-audio?id=wav_def-456',
                stems: 'https://beatss.app/api/proxy-audio?id=stems_def-789',
                artwork: 'https://beatss.app/api/proxy-audio?id=art_def-123'
            }
        }
    });

    assert.equal(valid.publicData.wav, undefined);
    assert.equal(valid.publicData.preview, undefined);
    assert.equal(valid.publicData.mp3, undefined);
    assert.equal(valid.privateData.mp3.includes('proxy-audio'), true);
    assert.equal(valid.privateData.preview.includes('proxy-audio'), true);
    assert.equal(valid.privateData.wav.includes('proxy-audio'), true);
    assert.throws(() => validateMigrationBeat({
        beat: {
            id: 'beat_diamond',
            name: 'Diamond',
            files: { mp3: 'https://example.com/audio.mp3' }
        }
}), /enlace seguro/);
});

test('la actualización de archivos conserva los campos existentes que no formen parte de la migración', () => {
    const valid = validateMigrationBeat({
        allowUpdate: true,
        beat: {
            id: 'beat_now',
            name: 'Now',
            files: { wav: 'https://beatss.app/api/proxy-audio?id=wav_new-123' }
        }
    });

    assert.deepEqual(Object.keys(valid.publicData).sort(), ['id', 'name', 'updatedAt']);
    assert.deepEqual(valid.privateData, { wav: 'https://beatss.app/api/proxy-audio?id=wav_new-123' });
    assert.equal(valid.publicData.source, undefined);
});

test('el endpoint usa autorización temporal y nunca incorpora secretos de Drive en el cliente', () => {
    const endpoint = read('server-handlers/beatstars-migration.js');
    const helper = read('api/_beatstars-migration.js');
    const html = read('index.html');
    const editor = read('editor.js');

    assert.match(endpoint, /X-BEATSS-Migration-Key/);
    assert.match(endpoint, /verifyIdToken/);
    assert.match(endpoint, /async function catalogStatus\(req, res\) \{\s*initFirebaseAdmin\(\);\s*const db = getFirestore\(\);/);
    assert.match(endpoint, /async function createUploadSession\(req, res\) \{\s*initFirebaseAdmin\(\);\s*const db = getFirestore\(\);/);
    assert.match(endpoint, /async function upsertCatalogBeat\(req, res\) \{\s*initFirebaseAdmin\(\);\s*const db = getFirestore\(\);/);
    assert.match(endpoint, /secretHash/);
    assert.match(endpoint, /refreshDriveAccessToken/);
    assert.match(endpoint, /action === 'catalog_status'/);
    assert.match(helper, /timingSafeEqual/);
    assert.doesNotMatch(endpoint, /GOOGLE_DRIVE_CLIENT_SECRET\s*[:=]/);
    assert.doesNotMatch(endpoint, /GOOGLE_DRIVE_REFRESH_TOKEN\s*[:=]/);
    assert.match(html, /btn-create-beatstars-migration-ticket/);
    assert.match(html, /type="password" id="cfg-beatstars-migration-ticket"/);
    assert.match(editor, /navigator\.clipboard\.writeText\(beatStarsMigrationTicket\)/);
});

test('la ruta pública de migración se conserva dentro del handler consolidado de Drive', () => {
    const endpoint = read('api/gdrive.js');
    const rewrites = read('vercel.json');
    const ignored = read('.vercelignore');
    assert.match(endpoint, /route === 'beatstars-migration'\) return beatstarsMigration/);
    assert.match(rewrites, /"source": "\/api\/beatstars-migration"[\s\S]*?"destination": "\/api\/gdrive\?route=beatstars-migration"/);
    assert.match(ignored, /api\/beatstars-migration\.js/);
});
