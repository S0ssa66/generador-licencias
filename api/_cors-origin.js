const TRUSTED_ORIGINS = new Set([
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app'
]);

const PROJECT_PREVIEW_ORIGIN = /^https:\/\/generador-licencias-[a-z0-9-]+-masterjuego25-5300s-projects\.vercel\.app$/i;
const LOCAL_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/;

export function isTrustedBeatssOrigin(origin) {
    const value = String(origin || '');
    return TRUSTED_ORIGINS.has(value) || PROJECT_PREVIEW_ORIGIN.test(value) || LOCAL_ORIGIN.test(value);
}
