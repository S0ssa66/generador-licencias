import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { basename, join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const indexPath = join(dist, 'index.html');

if (!existsSync(indexPath)) {
    console.error('PERFORMANCE BUDGET FAILED: ejecuta npm run build primero.');
    process.exit(1);
}

const gzipBytes = (path) => gzipSync(readFileSync(path)).byteLength;
const html = readFileSync(indexPath, 'utf8');
const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)]
    .map((match) => join(dist, match[1].replace(/^\//, '')))
    .filter(existsSync);
const initialJs = assetPaths.filter((path) => path.endsWith('.js'));
const initialCss = assetPaths.filter((path) => path.endsWith('.css'));
const allAssets = readdirSync(join(dist, 'assets')).map((file) => join(dist, 'assets', file));
const mainAppCandidates = allAssets
    .filter((path) => /^main-.*\.js$/.test(basename(path)) && statSync(path).size > 50_000)
    .sort((a, b) => statSync(b).size - statSync(a).size);
const allJs = allAssets.filter((path) => path.endsWith('.js'));
const firebaseJs = allJs.filter((path) => /^firebase(?:-|\.).*\.js$/.test(basename(path)));
const authCandidates = allJs.filter((path) => /^auth-.*\.js$/.test(basename(path)));

const measurements = {
    htmlGzip: gzipBytes(indexPath),
    initialJsGzip: initialJs.reduce((sum, path) => sum + gzipBytes(path), 0),
    initialCssGzip: initialCss.reduce((sum, path) => sum + gzipBytes(path), 0),
    mainAppGzip: mainAppCandidates[0] ? gzipBytes(mainAppCandidates[0]) : 0,
    authGzip: authCandidates.reduce((largest, path) => Math.max(largest, gzipBytes(path)), 0),
    largestJsGzip: allJs.reduce((largest, path) => Math.max(largest, gzipBytes(path)), 0),
    firebaseJsGzip: firebaseJs.reduce((sum, path) => sum + gzipBytes(path), 0)
};
const budgets = {
    htmlGzip: 66_000,
    initialJsGzip: 8_000,
    initialCssGzip: 14_000,
    mainAppGzip: 40_000,
    // Incluye verificación de correo y consentimiento versionado del alta.
    authGzip: 5_400,
    largestJsGzip: 145_000,
    firebaseJsGzip: 185_000
};

const failures = Object.entries(budgets)
    .filter(([key, max]) => measurements[key] > max)
    .map(([key, max]) => `${key}: ${measurements[key]} > ${max}`);

console.log('PERFORMANCE BUDGET', measurements);
if (html.includes('cdn.tailwindcss.com')) failures.push('Tailwind CDN reapareció en index.html');
if (failures.length) {
    console.error(`PERFORMANCE BUDGET FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
}
console.log('PERFORMANCE BUDGET PASSED');
