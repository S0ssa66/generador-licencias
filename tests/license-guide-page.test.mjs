import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('la guía de licencias tiene una ruta pública ligera y compartible', () => {
    const bootstrap = read('app-bootstrap.js');
    const router = read('license-guide-router.js');
    const vercel = JSON.parse(read('vercel.json'));
    const sitemap = read('public/sitemap.xml');

    assert.match(bootstrap, /const isPublicLicenseGuideRoute = path === '\/guia-licencias';/);
    assert.match(bootstrap, /isPublicLicenseGuideRoute[\s\S]*import\('\.\/license-guide-router\.js'\)/);
    assert.doesNotMatch(router, /firebase|ensureBeatssAuth|ensureBeatssApp|main\.js/);
    assert.ok(vercel.rewrites.some((rule) => rule.source === '/guia-licencias' && rule.destination === '/index.html'));
    assert.match(sitemap, /<loc>https:\/\/beatss\.app\/guia-licencias<\/loc>/);
});

test('la página explica los cinco niveles y conserva los límites desde la configuración central', () => {
    const router = read('license-guide-router.js');
    const index = read('index.html');

    assert.match(router, /import \{ LICENSE_CONFIGS \} from '\.\/config\.js';/);
    for (const tier of ['basic', 'premium', 'premium_plus', 'unlimited_flp', 'exclusive']) {
        assert.match(router, new RegExp(`${tier.replace('_', '\\_')}: \\{`));
    }
    assert.match(router, /100\.000\.000/);
    assert.match(router, /no promete el proyecto FL Studio/);
    assert.match(router, /No borra las licencias válidas vendidas antes/);
    assert.match(router, /Prohibido en licencias no exclusivas/);
    assert.match(router, /Tu contrato PDF es el documento que manda/);
    assert.match(router, /navigator\.share/);
    assert.match(router, /navigator\.clipboard\.writeText/);
    assert.match(index, /id="public-license-guide-view"/);
    assert.match(index, /class="store-license-guide-link" href="\/guia-licencias"/);
});

test('la guía mantiene contenido legal esencial y áreas táctiles móviles', () => {
    const router = read('license-guide-router.js');
    const css = read('license-guide.css');

    assert.match(router, /50% artista · 50% productor/);
    assert.match(router, /indemnización del 200%/);
    assert.match(router, /el comprador tendría 7 días/);
    assert.match(router, /Guía informativa basada en la configuración contractual vigente/);
    assert.match(css, /min-height: 44px/);
    assert.match(css, /@media \(max-width: 620px\)/);
    assert.doesNotMatch(css, /backdrop-filter|linear-gradient|radial-gradient/);
});
