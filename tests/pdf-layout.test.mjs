import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el PDF usa el ancho imprimible de carta y un solo encabezado', () => {
    const styles = read('styles.css');
    const index = read('index.html');
    const editor = read('editor.js');

    assert.match(styles, /#rendered-contract-content\.printing-pdf,[\s\S]*width:\s*175\.9mm\s*!important/);
    assert.match(styles, /\.paper\s*\{[\s\S]*width:\s*min\(800px, 100%\)[\s\S]*box-sizing:\s*border-box/);
    assert.doesNotMatch(styles, /\/\* Modo exportación PDF[^*]*\*\/[\s\S]{0,80}\.printing-pdf,\s*\n\.printing-pdf \.contract-doc/);
    assert.doesNotMatch(index, /id="buyer-rendered-contract-content"\s+class="contract-doc"/);
    assert.doesNotMatch(editor, /paper\.classList\.(?:add|remove)\('printing-pdf'\)/);
});

test('los títulos, la aceptación, el sello y el pie no quedan partidos', () => {
    const styles = read('styles.css');
    const editor = read('editor.js');

    assert.match(styles, /\.contract-heading-group,[\s\S]*\.doc-footer\s*\{[\s\S]*break-inside:\s*avoid/);
    assert.equal((editor.match(/protectContractPageBreaks\(parseMarkdownToHTML\(md\)\)/g) || []).length, 2);
    assert.equal((editor.match(/<div class="contract-closure">/g) || []).length, 2);
    assert.match(editor, /<div class="contract-closure">[\s\S]*<div class="digital-seal-container"[\s\S]*<div class="doc-footer"/);
    assert.doesNotMatch(styles, /\.printing-pdf \.contract-closure,[\s\S]*page-break-before:\s*always/);
    assert.match(styles, /\.printing-pdf \.non-exclusive-acceptance-wrapper > div,[\s\S]*border-top-color:\s*transparent/);
    assert.match(styles, /\.printing-pdf \.non-exclusive-acceptance-wrapper > div::before,[\s\S]*top:\s*3px[\s\S]*border-top:\s*2px dashed/);
});

test('la aceptación y el sello distinguen pago electrónico y verificación manual', () => {
    const editor = read('editor.js');
    const translations = read('i18n.js');
    const pythonRenderer = read('pdf_generator.py');

    assert.match(editor, /Aceptado mediante pago electrónico/);
    assert.match(editor, /Aceptado mediante verificación del pago/);
    assert.match(editor, /pago verificado por el Productor/);
    assert.doesNotMatch(editor, /Aceptado vía Pago/);
    assert.match(translations, /sealVerified:\s*"DOCUMENTO VERIFICADO"/);
    assert.doesNotMatch(translations, /Estatus: Válido por Transacción y Firma Electrónica/);
    assert.doesNotMatch(pythonRenderer, /Aceptado vía Pago/);
});

test('la plantilla española no conserva los errores de redacción detectados', () => {
    const config = read('config.js');
    const spanishTemplate = config.slice(config.indexOf('markdown: `# {{producer_aka}}: Licencia'), config.indexOf('markdown_en:', config.indexOf('markdown: `# {{producer_aka}}: Licencia')));

    assert.match(spanishTemplate, /\* \*\*Código de referencia:\*\* \{\{ref_code\}\}/);
    assert.doesNotMatch(spanishTemplate, /Invoice #/);
    assert.doesNotMatch(spanishTemplate, /distribuídos/);
    assert.doesNotMatch(spanishTemplate, /desempeño \/ comunicación pública/);
    assert.doesNotMatch(spanishTemplate, /aceptación tácita|ratificación absoluta/);
    assert.match(spanishTemplate, /Cada obra audiovisual autorizada/);
});
