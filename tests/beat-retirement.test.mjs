import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('dar de baja un beat conserva documentos y archivos, y permite restaurarlo', () => {
    const catalog = read('catalog.js');
    const retireBeatSource = catalog.match(/export async function retireBeat\(id\) \{[\s\S]*?(?=\/\/ Conserva la API previa)/)?.[0] || '';
    const restoreBeatSource = catalog.match(/export async function restoreBeat\(id\) \{[\s\S]*?(?=export function selectBeat)/)?.[0] || '';

    assert.match(catalog, /export function isBeatRetired\(beat = \{\}\)/);
    assert.match(catalog, /return beat\?\.published === false \|\| beat\?\.isPublished === false;/);
    assert.match(retireBeatSource, /published: false/);
    assert.match(retireBeatSource, /retiredAt: changedAt/);
    assert.match(retireBeatSource, /setDoc\(doc\(db, 'users', window\.currentUser, 'beats', beatId\)/);
    assert.doesNotMatch(retireBeatSource, /batch\.delete|private\/files/);
    assert.match(restoreBeatSource, /published: true/);
    assert.match(restoreBeatSource, /retiredAt: deleteField\(\)/);
    assert.match(catalog, /window\.deleteBeat = deleteBeat;/);
    assert.match(catalog, /window\.retireBeat = retireBeat;/);
    assert.match(catalog, /window\.restoreBeat = restoreBeat;/);
});

test('el Studio separa los beats activos de los dados de baja y no permite licenciar los retirados', () => {
    const catalog = read('catalog.js');
    const index = read('index.html');
    const styles = read('beat-catalog.css');

    assert.match(catalog, /function activeCatalogBeats\(\)[\s\S]*?\.filter\(beat => !isBeatRetired\(beat\)\)/);
    assert.match(catalog, /let filtered = activeCatalogBeats\(\);/);
    assert.match(catalog, /renderRetiredBeats\(retiredBeats\);/);
    assert.match(catalog, /Ese beat está dado de baja\. Restáuralo antes de usarlo en una licencia\./);
    assert.match(index, /id="tab-retired-beats-section"[\s\S]*?id="tab-retired-beats-grid"/);
    assert.match(index, /Dados de baja <span id="tab-retired-beats-count">0<\/span>/);
    assert.match(styles, /\.tab-retired-beats-section \{/);
    assert.match(styles, /\.tab-retired-beat-restore/);
});
