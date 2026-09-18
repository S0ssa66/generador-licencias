import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el progreso de entrega usa la paleta clara del Studio sin cambiar sus pasos', () => {
    const index = read('index.html');
    const main = read('main.js');
    const editor = read('editor.js');
    const styles = read('email-progress.css');
    const modal = index.match(/<div id="email-progress-modal"[\s\S]*?<\/div>\s*<\/div>\s*<!-- ===== MODAL MÉTODOS DE PAGO ===== -->/)?.[0] || '';

    assert.match(main, /import ['"]\.\/email-progress\.css\?v=email-progress-light-1['"]/);
    assert.match(modal, /class="email-progress-modal__card"/);
    assert.match(modal, /id="email-progress-modal"[^>]*\bhidden\b/);
    assert.match(modal, /data-progress-state="waiting"/);
    assert.match(modal, /role="dialog"[\s\S]*aria-modal="true"/);
    assert.doesNotMatch(modal, /#16161c|#0f0f13|#2b2b35|rgba\(8, 8, 10/);
    assert.match(styles, /--email-progress-blue: #3157e8/);
    assert.match(styles, /background: var\(--email-progress-paper\)/);
    assert.match(styles, /\[data-progress-state="completed"\][\s\S]*color: var\(--email-progress-success\)/);
    assert.match(styles, /\.email-progress-modal__close\.btn\.btn-primary[\s\S]*background: var\(--email-progress-blue\)/);
    assert.match(editor, /stepEl\.dataset\.progressState = progressState/);
    assert.match(editor, /email-progress-modal__result-mark--success/);
    assert.match(editor, /modal\.hidden = false[\s\S]*modal\.style\.display = 'flex'/);
    assert.match(editor, /closeEmailProgressModal[\s\S]*modal\.hidden = true/);
    assert.doesNotMatch(editor.slice(editor.indexOf('export function showProgressModal'), editor.indexOf('export function compileContractData')), /rgba\(0, 230, 118|style\.color = 'var\(--accent\)'/);
});
