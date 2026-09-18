import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const retiredSecondaryPages = [
    'concept.html',
    'dashboard-concept.html',
    'webflow-concept.html',
    'flow-dashboard.html',
    'prompt-demo.html',
    'beatss-vision.html',
    'beatss-relay-directions.html',
    'reset-local.html'
];

const restrictedPublicPaths = [
    'Analisis_Codigo_BEATSS.pdf',
    'banks/paypal.png',
    'banks/guayaquil.png',
    'banks/pichincha.png',
    'crop_1.jpg',
    'crop_2.jpg',
    'crop_3.jpg',
    'crop_4.jpg'
];

const revalidatableBrandAssets = [
    'logo.png',
    'producer_sossa.webp',
    'beat-thumbnail-sossa.jpg',
    'producer_monarco.jpg',
    'producer_mrmicua.jpg',
    'producer_sauce.jpg'
];

test('los recursos de marca públicos apuntan a archivos existentes', () => {
    const clearance = read('clearance.html');
    const player = read('player.js');
    const sales = read('dashboard_modules/sales.js');
    const checkout = read('checkout.js');
    const sitemap = read('public/sitemap.xml');
    const manifest = JSON.parse(read('public/manifest.json'));
    const viteConfig = read('vite.config.js');
    const vercelConfig = JSON.parse(read('vercel.json'));

    assert.equal(existsSync(new URL('../public/logo.png', import.meta.url)), true);
    assert.equal(existsSync(new URL('../public/producer_sossa.webp', import.meta.url)), true);
    assert.equal(existsSync(new URL('../public/beat-thumbnail-sossa.jpg', import.meta.url)), true);
    assert.doesNotMatch(clearance, /logo-sossa\.png/);
    assert.doesNotMatch(player, /logo-sossa\.png/);
    assert.doesNotMatch(sales, /favicon\.ico/);
    assert.match(sales, /window\.Notification\?\.permission/);
    assert.match(sales, /icon: '\/logo\.png'/);
    assert.match(checkout, /return '\/producer_sossa\.webp';/);
    assert.doesNotMatch(checkout, /return '\/producer_sossa\.png';/);
    assert.doesNotMatch(sitemap, /<loc>https:\/\/beatss\.app\/catalogo<\/loc>/);
    assert.match(sitemap, /<loc>https:\/\/beatss\.app\/tienda\/sossa<\/loc>/);
    assert.doesNotMatch(sitemap, /clearance\.html|concept\.html|dashboard-concept\.html|webflow-concept\.html|flow-dashboard\.html|prompt-demo\.html/);
    const sossaStoreShortcut = manifest.shortcuts.find((shortcut) => shortcut.short_name === 'Sossa');
    assert.equal(sossaStoreShortcut?.url, '/tienda/sossa');
    assert.match(sossaStoreShortcut?.description || '', /Sossa/i);
    assert.ok(
        vercelConfig.redirects.some((redirect) => redirect.source === '/catalogo' && redirect.destination === '/tienda/sossa' && redirect.permanent === true),
        'el catálogo general retirado debe redirigir a la tienda de Sossa'
    );
    assert.equal(
        vercelConfig.rewrites.some((rewrite) => rewrite.source === '/catalogo'),
        false,
        'Vercel no debe volver a servir la SPA del catálogo general'
    );
    for (const page of retiredSecondaryPages) {
        assert.equal(existsSync(new URL(`../${page}`, import.meta.url)), false);
        assert.doesNotMatch(viteConfig, new RegExp(`['"]${page.replace('.', '\\.')}`));
        assert.ok(
            vercelConfig.redirects.some((redirect) => redirect.source === `/${page}` && redirect.destination === '/' && redirect.permanent === true),
            `${page} debe redirigir a la portada`
        );
    }
    for (const path of restrictedPublicPaths) {
        assert.ok(
            vercelConfig.redirects.some((redirect) => redirect.source === `/${path}` && redirect.destination === '/404' && redirect.permanent === true),
            `${path} no debe quedar disponible públicamente`
        );
    }
    for (const path of revalidatableBrandAssets) {
        assert.ok(
            vercelConfig.headers.some((rule) => rule.source === `/${path}` && rule.headers.some((header) => header.key === 'Cache-Control' && header.value === 'public, max-age=86400, stale-while-revalidate=604800')),
            `${path} debe conservar una caché revalidable`
        );
    }
});

test('el build conserva solo las dos superficies HTML públicas aprobadas', () => {
    const rootHtml = readdirSync(new URL('../', import.meta.url))
        .filter((entry) => entry.endsWith('.html'))
        .sort();
    const viteConfig = read('vite.config.js');
    const tailwindConfig = read('tailwind.config.cjs');

    assert.deepEqual(rootHtml, ['clearance.html', 'index.html']);
    assert.match(viteConfig, /main:\s*resolve\(import\.meta\.dirname, 'index\.html'\)/);
    assert.match(viteConfig, /clearance:\s*resolve\(import\.meta\.dirname, 'clearance\.html'\)/);
    assert.equal(existsSync(new URL('../public/tailwind-config-cdn.js', import.meta.url)), false);
    assert.equal(existsSync(new URL('../tailwind-design-tokens.js', import.meta.url)), true);
    assert.match(tailwindConfig, /tailwind-design-tokens\.js/);
});
