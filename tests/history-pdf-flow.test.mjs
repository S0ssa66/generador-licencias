import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('history.js implementa descarga directa de PDF sin depender de tab-editor visible', () => {
    const history = read('dashboard_modules/history.js');

    // 1. Debe existir la rutina de descarga dedicada con sandbox off-screen
    assert.match(history, /async function downloadLicensePdfFromHistory\(lic, btnEl\)/);
    assert.match(history, /window\.downloadLicensePdfFromHistory\s*=\s*downloadLicensePdfFromHistory/);
    assert.match(history, /pdf-render-sandbox/);
    assert.match(history, /sandbox\.style\.left = '-9999px'/);
    assert.match(history, /sandbox\.parentNode\.removeChild\(sandbox\)/);

    // 2. Debe compilar el contrato y cargar dinámicamente editor.js si no está en memoria
    assert.match(history, /window\.compileContractData/);
    assert.match(history, /import\(['"]\.\.\/editor\.js['"]\)/);

    // 3. Manejo de estado de carga en el botón durante la generación
    assert.match(history, /Generando\.\.\./);
    assert.match(history, /btnEl\.disabled = true/);
    assert.match(history, /btnEl\.disabled = false/);

    // 4. Soporte para URL pre-generada en Storage si está disponible
    assert.match(history, /lic\.contractPdfUrl/);
});

test('history.js busca licencias de forma robusta por índice, ID o referencia canónica', () => {
    const history = read('dashboard_modules/history.js');

    // Debe contener helper findLicenseFromButton
    assert.match(history, /function findLicenseFromButton\(btn\)/);
    assert.match(history, /btn\.dataset\.index/);
    assert.match(history, /btn\.dataset\.id/);
    assert.match(history, /btn\.dataset\.ref/);
    assert.match(history, /resolveLicenseReference/);

    // Los botones de acción deben incluir data-index, data-id y data-ref
    assert.match(history, /data-index="\$\{idx\}" data-id="\$\{safeId\}" data-ref="\$\{safeRef\}"/);
});

test('al hacer clic en Editar se cargan los datos y se conmuta a tab-preview', () => {
    const history = read('dashboard_modules/history.js');

    assert.match(history, /btn-row-load/);
    assert.match(history, /loadLicenseIntoEditor\(lic\)/);
    assert.match(history, /window\.switchTab\('tab-preview'\)/);
});

test('las bajas de licencia se archivan con trazabilidad y se excluyen del historial activo', () => {
    const history = read('dashboard_modules/history.js');
    const html = read('index.html');

    assert.match(history, /function isArchivedLicense\(license\)/);
    assert.match(history, /function getActiveLicenses\(\)/);
    assert.match(history, /function renderArchivedLicenses\(\)/);
    assert.match(history, /historyStatus: 'archived'/);
    assert.match(history, /archivedAt/);
    assert.match(history, /archiveReason/);
    assert.match(history, /await updateDoc\(licDocRef, archivePatch\)/);
    assert.match(history, /Registro de prueba eliminado por Sossa/);
    assert.doesNotMatch(history, /await deleteDoc\(licDocRef\)/);

    assert.match(html, /id="deleted-licenses-section"/);
    assert.match(html, /id="deleted-licenses-list"/);
    assert.match(html, /Licencias eliminadas/);
});

test('el archivado de pruebas usa IDs reales de Firestore y una lista cerrada de nueve referencias', () => {
    const history = read('dashboard_modules/history.js');
    const backup = read('storageBackup.js');
    const html = read('index.html');

    assert.match(backup, /firestoreId: docSnap\.id/);
    assert.match(backup, /lic\.firestoreId \|\| lic\.refCode/);
    assert.match(history, /const CONFIRMED_TEST_LICENSE_REFS = new Set\(\[/);
    assert.match(history, /'LIC-BAS-20260605-6364'/);
    assert.match(history, /'LIC-BAS-20260605-7537'/);
    assert.match(history, /const batch = writeBatch\(db\)/);
    assert.match(history, /await batch\.commit\(\)/);
    assert.match(history, /missing\.length/);
    assert.match(history, /findFirestoreLicenseDocument/);
    assert.match(html, /id="btn-archive-confirmed-tests"/);
});

test('license-library.css define estilos de insignias, botón de copia y feedback de carga de PDF', () => {
    const css = read('license-library.css');

    // Insignias por tipo de licencia
    assert.match(css, /\.license-record-type \.type-badge\.basic/);
    assert.match(css, /\.license-record-type \.type-badge\.premium/);
    assert.match(css, /\.license-record-type \.type-badge\.exclusive/);

    // Botón de copia de referencia
    assert.match(css, /\.btn-copy-ref-badge/);

    // Animación de spinner y hover en botón PDF
    assert.match(css, /\.btn-row-pdf:hover/);
    assert.match(css, /\.animate-spin/);
    assert.match(css, /@keyframes spin/);

    // Prohibido usar el verde antiguo
    assert.doesNotMatch(css, /#00e676|rgba\(0, 230, 118/);
});

test('el encabezado de licencias es compacto y no fuerza un salto de línea en escritorio', () => {
    const html = read('index.html');
    const css = read('license-library.css');

    assert.match(html, /Tus acuerdos, <em>en orden\.<\/em>/);
    assert.doesNotMatch(html, /Tus acuerdos,<br><em>en orden\.<\/em>/);
    assert.match(css, /min-height: 178px/);
    assert.match(css, /font-size: clamp\(34px, 3\.3vw, 52px\)/);
});
