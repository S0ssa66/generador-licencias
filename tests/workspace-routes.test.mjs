import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
    WORKSPACE_TAB_PATHS,
    normalizeWorkspacePathname,
    workspacePathForTab,
    workspaceTabForPath,
    workspaceTitleForTab
} from '../workspace-routes.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('cada sección privada tiene una ruta canónica propia', () => {
    assert.deepEqual(WORKSPACE_TAB_PATHS, {
        'tab-home': '/inicio',
        'tab-preview': '/contrato',
        'tab-history': '/licencias',
        'tab-beats': '/beats',
        'tab-dashboard': '/ventas',
        'tab-sales': '/pedidos',
        'tab-email-history': '/emails',
        'tab-invoicing': '/facturacion',
        'tab-whitelist': '/content-id',
        'tab-admin': '/contabilidad'
    });

    for (const [tabId, path] of Object.entries(WORKSPACE_TAB_PATHS)) {
        assert.equal(workspacePathForTab(tabId), path);
        assert.equal(workspaceTabForPath(path), tabId);
        assert.equal(workspaceTitleForTab(tabId), 'Beatss');
    }
    assert.equal(workspaceTitleForTab('tab-desconocida'), 'Beatss');
});

test('las rutas privadas antiguas siguen abriendo su sección canónica', () => {
    assert.equal(workspaceTabForPath('/studio'), 'tab-preview');
    assert.equal(workspaceTabForPath('/mis-beats'), 'tab-beats');
    assert.equal(workspaceTabForPath('/misbeats'), 'tab-beats');
    assert.equal(workspaceTabForPath('/dashboard'), 'tab-dashboard');
    assert.equal(normalizeWorkspacePathname('/LICENCIAS///?origen=guardado'), '/licencias');
    assert.equal(workspaceTabForPath('/desconocida'), null);
});

test('bootstrap, Studio y Vercel comparten el enrutamiento privado', () => {
    const bootstrap = read('app-bootstrap.js');
    const auth = read('auth.js');
    const main = read('main.js');
    const vercel = JSON.parse(read('vercel.json'));
    const rewrittenPaths = new Set(vercel.rewrites.map((rewrite) => rewrite.source));

    assert.match(bootstrap, /workspaceTabForPath/);
    assert.match(bootstrap, /const privateRouteTab = workspaceTabForPath\(path\)/);
    assert.match(bootstrap, /canonicalPrivatePath/);
    assert.match(bootstrap, /window\.history\.replaceState/);
    assert.match(auth, /import \{ workspacePathForTab, workspaceTabForPath \} from '\.\/workspace-routes\.js'/);
    assert.match(auth, /Boolean\(workspaceTabForPath\(currentPath\)\)/);
    assert.match(main, /window\.syncBeatssPathForTab\(tabId\)/);
    assert.match(main, /workspaceTabForPath\(pathname\)/);
    assert.match(main, /window\.history\.replaceState[\s\S]*canonicalPath/);

    for (const path of [
        ...Object.values(WORKSPACE_TAB_PATHS),
        '/studio',
        '/mis-beats',
        '/misbeats',
        '/dashboard'
    ]) {
        assert.equal(rewrittenPaths.has(path), true, `${path} debe resolver index.html en Vercel`);
    }
});
