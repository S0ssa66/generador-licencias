/**
 * Canonical routes for every private BEATSS workspace section.
 *
 * Keep this module free of DOM and Firebase dependencies: app-bootstrap uses
 * it before loading the private Studio bundle, while main.js uses the same
 * source of truth for clicks, refreshes and browser history navigation.
 */
export const WORKSPACE_TAB_PATHS = Object.freeze({
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

// Historical URLs remain valid, but the client replaces them with the
// canonical route as soon as the workspace router starts.
export const WORKSPACE_PATH_ALIASES = Object.freeze({
    '/studio': 'tab-preview',
    '/mis-beats': 'tab-beats',
    '/misbeats': 'tab-beats',
    '/dashboard': 'tab-dashboard'
});

export const WORKSPACE_TAB_TITLES = Object.freeze({
    'tab-home': 'Inicio',
    'tab-preview': 'Contrato',
    'tab-history': 'Licencias',
    'tab-beats': 'Beats',
    'tab-dashboard': 'Ventas',
    'tab-sales': 'Pedidos',
    'tab-email-history': 'Emails',
    'tab-invoicing': 'Facturación',
    'tab-whitelist': 'Content ID',
    'tab-admin': 'Contabilidad'
});

const CANONICAL_PATH_TO_TAB = Object.freeze(
    Object.fromEntries(Object.entries(WORKSPACE_TAB_PATHS).map(([tabId, path]) => [path, tabId]))
);

export function normalizeWorkspacePathname(pathname = '/') {
    const rawPath = String(pathname || '/').split(/[?#]/, 1)[0];
    const normalized = rawPath.replace(/\/+$/, '') || '/';
    return normalized.toLowerCase();
}

export function workspaceTabForPath(pathname) {
    const path = normalizeWorkspacePathname(pathname);
    return CANONICAL_PATH_TO_TAB[path] || WORKSPACE_PATH_ALIASES[path] || null;
}

export function workspacePathForTab(tabId) {
    return WORKSPACE_TAB_PATHS[tabId] || null;
}

export function workspaceTitleForTab(tabId) {
    return 'Beatss';
}
