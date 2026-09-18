import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('Contrato carga el editor y genera el documento al abrirse desde otra pestaña', () => {
    const main = read('main.js');

    assert.match(main, /if \(tabId === 'tab-preview'\) \{[\s\S]*?loadModule\('editor'\)[\s\S]*?window\.generatePreview\?\.\(\)/);
});

test('El editor usa el estado vigente entre módulos y nunca deja un visor vacío ante un error', () => {
    const editor = read('editor.js');

    assert.match(editor, /const producerConfig = new Proxy\(/);
    assert.match(editor, /const licenseHistory = new Proxy\(/);
    assert.match(editor, /const showToast = \(\.\.\.args\) => window\.showToast\?\.\(\.\.\.args\);/);
    assert.match(editor, /function getEditorLanguage\(\)/);
    assert.match(editor, /function compileContract\(\) \{\s*const currentLang = getEditorLanguage\(\);/);
    assert.match(editor, /function generatePreview\(\)[\s\S]*?try \{[\s\S]*?compileContract\(\)[\s\S]*?catch \(error\)[\s\S]*?renderedContent\.replaceChildren\(fallback\)/);
});
