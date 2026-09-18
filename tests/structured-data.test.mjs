import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('los datos estructurados no duplican portadas Base64', () => {
    for (const file of ['catalog.js', 'checkout.js']) {
        const source = read(file);
        assert.match(source, /\^https:\\\/\\\//);
        assert.doesNotMatch(source, /"image":\s*window\.getBeatArtwork\(/);
    }
});
