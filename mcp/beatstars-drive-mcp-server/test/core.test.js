import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
    beatIdForName,
    beatKey,
    catalogHasExistingBeat,
    createMigrationPlan,
    getMigrationPlan,
    inventoryBeatStarsExport,
    normalizeBeatssBaseUrl,
    normalizeBeatName,
    parseCsv,
    storeInventory
} from '../src/core.js';

test('detecta explícitamente un beat existente sin convertir el permiso de actualización en un número', () => {
    assert.equal(catalogHasExistingBeat({ existing: [] }), false);
    assert.equal(catalogHasExistingBeat({ existing: [{ id: 'beat_oouuhh' }] }), true);
    assert.equal(catalogHasExistingBeat({}), false);
});

test('normaliza títulos de BeatStars y conserva IDs seguros para el catálogo', () => {
    assert.equal(normalizeBeatName(' Type Beat  Diamond (COLLABORATOR) '), 'Diamond');
    assert.equal(beatKey('Díamond - Dancehall'), 'diamonddancehall');
    assert.equal(beatIdForName('Díamond - Dancehall'), 'beat_diamond_dancehall');
});

test('parsea CSV con comas dentro de campos entrecomillados', () => {
    const rows = parseCsv('Title,Genre,Description\nDiamond,Dancehall,"Fresco, oscuro"\n');
    assert.deepEqual(rows, [{ title: 'Diamond', genre: 'Dancehall', description: 'Fresco, oscuro' }]);
});

test('solo permite enviar la clave temporal al origen de BEATSS o a localhost', () => {
    assert.equal(normalizeBeatssBaseUrl('https://beatss.app'), 'https://beatss.app');
    assert.equal(normalizeBeatssBaseUrl('http://localhost:3000'), 'http://localhost:3000');
    assert.throws(() => normalizeBeatssBaseUrl('https://otro-sitio.example'), /sólo puede enviar la clave temporal/);
    assert.throws(() => normalizeBeatssBaseUrl('https://beatss.app/api/otro'), /sólo el origen/);
});

test('inventaría una exportación, asocia assets y detecta duplicados por checksum', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'beatss-export-'));
    const exportDir = path.join(root, 'export');
    await mkdir(exportDir);
    await writeFile(path.join(exportDir, 'Diamond delivery.mp3'), 'audio-data');
    await writeFile(path.join(exportDir, 'Diamond tagged.mp3'), 'tagged-preview-data');
    await writeFile(path.join(exportDir, 'Diamond.wav'), 'audio-data');
    await writeFile(path.join(exportDir, 'Diamond stems.zip'), 'stems-data');
    await writeFile(path.join(exportDir, 'Diamond cover.png'), 'image-data');
    const metadataPath = path.join(root, 'metadata.csv');
    await writeFile(metadataPath, 'Title,BPM,Genre,Key\nDiamond,96,Dancehall,F Min\n');
    const previousRoot = process.env.BEATSS_EXPORT_ROOT;
    process.env.BEATSS_EXPORT_ROOT = root;
    try {
        const inventory = await inventoryBeatStarsExport({ sourceDir: exportDir, metadataFile: metadataPath });
        assert.equal(inventory.beats.length, 1);
        assert.equal(inventory.beats[0].name, 'Diamond');
        assert.equal(inventory.beats[0].bpm, 96);
        assert.deepEqual(Object.keys(inventory.beats[0].files).sort(), ['artwork', 'mp3', 'preview', 'stems', 'wav']);
        assert.equal(inventory.beats[0].files.mp3.fileName, 'Diamond delivery.mp3');
        assert.equal(inventory.duplicateFiles.length, 1);
        const inventoryId = storeInventory(inventory);
        const plan = createMigrationPlan(inventory, { existingPolicy: 'update_assets' });
        assert.equal(getMigrationPlan(plan.id).id, plan.id);
        assert.ok(inventoryId);
        assert.match(plan.confirmationCode, /^MIGRATE-/);
        assert.equal(plan.existingPolicy, 'update_assets');
    } finally {
        if (previousRoot === undefined) delete process.env.BEATSS_EXPORT_ROOT;
        else process.env.BEATSS_EXPORT_ROOT = previousRoot;
    }
});

test('rechaza rutas de exportación fuera de la carpeta permitida', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'beatss-root-'));
    const other = await mkdtemp(path.join(os.tmpdir(), 'beatss-other-'));
    const previousRoot = process.env.BEATSS_EXPORT_ROOT;
    process.env.BEATSS_EXPORT_ROOT = root;
    try {
        await assert.rejects(() => inventoryBeatStarsExport({ sourceDir: other }), /fuera de BEATSS_EXPORT_ROOT/);
    } finally {
        if (previousRoot === undefined) delete process.env.BEATSS_EXPORT_ROOT;
        else process.env.BEATSS_EXPORT_ROOT = previousRoot;
    }
});
