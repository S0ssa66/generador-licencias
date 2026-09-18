import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const clearance = readFileSync(new URL('../clearance.html', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
const player = readFileSync(new URL('../player.js', import.meta.url), 'utf8');
const pdfGenerator = readFileSync(new URL('../pdf_generator.py', import.meta.url), 'utf8');

test('Clearance no vuelve a registrar el Service Worker retirado', () => {
    assert.match(clearance, /<link rel="manifest" href="\/manifest\.json">/);
    assert.match(clearance, /<link rel="icon" type="image\/png" href="\/logo\.png">/);
    assert.match(clearance, /<meta name="robots" content="noindex, nofollow">/);
    assert.match(clearance, /import \{ renderPublicIcons \} from '\.\/public-icons\.js';/);
    assert.doesNotMatch(clearance, /unpkg\.com\/lucide|window\.lucide/);
    assert.match(clearance, /fetch\('\/api\/clearance'/);
    assert.doesNotMatch(clearance, /from '\.\/firebase\.js'|\baddDoc\(/);
    assert.doesNotMatch(clearance, /logo-sossa\.png/);
    assert.doesNotMatch(clearance, /navigator\.serviceWorker\.register/);
    assert.match(serviceWorker, /self\.registration\.unregister/);
    assert.doesNotMatch(player, /logo-sossa\.png/);
    assert.match(player, /'\/logo\.png'/);
    assert.doesNotMatch(pdfGenerator, /logo-sossa\.png/);
    assert.match(pdfGenerator, /'public', 'logo\.png'/);
});
