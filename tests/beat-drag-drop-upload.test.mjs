import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Mock minimal browser globals for importing catalog.js in node test
if (typeof globalThis.window === 'undefined') {
    globalThis.window = {
        stateManager: { getState: () => false, setState: () => {} },
        localBeats: [],
        globalBeats: [],
        filteredGlobalBeats: [],
        globalProducersConfig: {}
    };
}
if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
        getElementById: () => null,
        querySelectorAll: () => [],
        querySelector: () => null,
        addEventListener: () => {}
    };
}

const {
    parseBeatMetadataFromFilename,
    resolveTargetIdForFile
} = await import('../catalog.js');

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('parseBeatMetadataFromFilename extrae correctamente título, BPM y tonalidad musical', () => {
    const meta1 = parseBeatMetadataFromFilename('Drake x Travis - 140BPM - Dm.wav');
    assert.ok(meta1);
    assert.equal(meta1.title, 'Drake x Travis');
    assert.equal(meta1.bpm, '140');
    assert.equal(meta1.key, 'Dm');

    const meta2 = parseBeatMetadataFromFilename('Summer_Vibes_128_C#min.mp3');
    assert.ok(meta2);
    assert.equal(meta2.title, 'Summer Vibes');
    assert.equal(meta2.bpm, '128');
    assert.equal(meta2.key, 'C#min');

    const meta3 = parseBeatMetadataFromFilename('Chill_Hop_stems.zip');
    assert.ok(meta3);
    assert.equal(meta3.title, 'Chill Hop');
    assert.equal(meta3.bpm, '');
    assert.equal(meta3.key, '');

    const meta4 = parseBeatMetadataFromFilename('Dark Trap Type Beat (FREE) [130 bpm] Am.mp3');
    assert.ok(meta4);
    assert.equal(meta4.bpm, '130');
    assert.equal(meta4.key, 'Am');
});

test('resolveTargetIdForFile enruta cada tipo de archivo a su slot correspondiente', () => {
    // WAV
    assert.equal(resolveTargetIdForFile({ name: 'Beat.wav', type: 'audio/wav' }, false), 'tab-db-beat-wav');
    assert.equal(resolveTargetIdForFile({ name: 'Beat.wav', type: 'audio/wav' }, true), 'db-beat-wav');

    // Stems (ZIP / RAR)
    assert.equal(resolveTargetIdForFile({ name: 'Beat_stems.zip', type: 'application/zip' }, false), 'tab-db-beat-stems');
    assert.equal(resolveTargetIdForFile({ name: 'Beat_tracks.rar', type: 'application/x-rar-compressed' }, true), 'db-beat-stems');

    // Preview MP3 etiquetado
    assert.equal(resolveTargetIdForFile({ name: 'Beat_preview_tagged.mp3', type: 'audio/mpeg' }, false), 'tab-db-beat-preview');
    assert.equal(resolveTargetIdForFile({ name: 'Beat_demo.mp3', type: 'audio/mpeg' }, true), 'db-beat-preview');

    // MP3 de entrega
    assert.equal(resolveTargetIdForFile({ name: 'Beat_master.mp3', type: 'audio/mpeg' }, false), 'tab-db-beat-mp3');
    assert.equal(resolveTargetIdForFile({ name: 'Beat_master.mp3', type: 'audio/mpeg' }, true), 'db-beat-mp3');

    // Artwork
    assert.equal(resolveTargetIdForFile({ name: 'Cover.jpg', type: 'image/jpeg' }, false), 'tab-db-beat-artwork');
    assert.equal(resolveTargetIdForFile({ name: 'Cover.png', type: 'image/png' }, true), 'db-beat-artwork');
});

test('la interfaz index.html y beat-catalog.css contienen los elementos interactivos del Drag & Drop', () => {
    const html = read('index.html');
    const css = read('beat-catalog.css');
    const catalog = read('catalog.js');

    // Elementos en HTML
    assert.match(html, /id="tab-beat-dropzone"/);
    assert.match(html, /id="modal-beat-dropzone"/);
    assert.match(html, /id="tab-beats-drag-overlay"/);
    assert.match(html, /id="dropzone-file-input"/);
    assert.match(html, /data-lucide="cloud-upload"/);
    assert.match(html, /Arrastra tu audio aquí \(MP3, WAV o Stems\)/);

    // Clases y reglas CSS
    assert.match(css, /\.beat-dropzone\s*\{/);
    assert.match(css, /\.beat-dropzone\.is-dragover\s*\{/);
    assert.match(css, /\.input-group\.is-dragover\s*\{/);
    assert.match(css, /\.tab-beats-drag-overlay\s*\{/);
    assert.match(css, /\.tab-beats-drag-overlay\.is-active\s*\{/);
    assert.doesNotMatch(css, /linear-gradient|radial-gradient/);

    // Funciones exportadas y listeners en catalog.js
    assert.match(catalog, /export function parseBeatMetadataFromFilename/);
    assert.match(catalog, /export function resolveTargetIdForFile/);
    assert.match(catalog, /export async function uploadBeatFile/);
    assert.match(catalog, /export async function handleDroppedBeatFiles/);
    assert.match(catalog, /dropzone\.addEventListener\('dragover'/);
    assert.match(catalog, /dropzone\.addEventListener\('drop'/);
    assert.match(catalog, /tabBeats\.addEventListener\('dragenter'/);
});
