import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

test('proxy-audio no permite bypass de contratos PDF y exige autorización antes de llamar al almacenamiento', () => {
    const proxySource = read('api/proxy-audio.js');
    
    // Validar formato estricto de fileId
    assert.ok(proxySource.includes('^[A-Za-z0-9_-]{5,128}$'));

    // No debe contener el bypass inseguro de PDF
    assert.doesNotMatch(proxySource, /!contentType\.toLowerCase\(\)\.includes\('pdf'\)/);

    // Debe verificar autorización explícita antes de contactar a Google Drive (paso 5)
    const beforeStep5 = proxySource.split('// 5. Descargar y transmitir')[0];
    assert.match(beforeStep5, /if \(!isAuthorized\)\s*\{\s*return res\.status\(403\)/);

    // Debe limitar el escaneo de la colección beats
    assert.match(proxySource, /db\.collectionGroup\('beats'\)\.limit\(\d+\)/);
});

test('el archivo huérfano confirm 2.js fue eliminado y los patrones duplicados están ignorados', () => {
    assert.equal(existsSync(new URL('api/payments/payphone/confirm 2.js', root)), false);

    const gitignore = read('.gitignore');
    assert.match(gitignore, /\* 2\.\*/);
    assert.match(gitignore, /\* copy\.\*/);

    const vercelignore = read('.vercelignore');
    assert.match(vercelignore, /\* 2\.\*/);
    assert.match(vercelignore, /\* copy\.\*/);
});

test('la configuración pública de tienda no expone los cupones privados del productor', async () => {
    const { sanitizePublicProducer } = await import('../server-handlers/public-store.js');
    const producerData = {
        aka: 'Sossa',
        name: 'Joao Dominguez',
        coupons: [{ code: 'PROMO100', discount: 100 }],
        paypalClientId: 'client-123'
    };
    const sanitized = sanitizePublicProducer(producerData);
    assert.equal('coupons' in sanitized, false);
    assert.equal(sanitized.aka, 'Sossa');

    const publicStoreSource = read('server-handlers/public-store.js');
    assert.doesNotMatch(publicStoreSource, /'coupons'/);
});

test('catalog.js sanea metadatos e IDs de beats contra DOM XSS', () => {
    const catalogSource = read('catalog.js');

    // renderGlobalBeats debe usar sanitizeHtml para bpm, key y genre
    assert.match(catalogSource, /sanitizeHtml\(beat\.bpm\)/);
    assert.match(catalogSource, /sanitizeHtml\(beat\.key\)/);
    assert.match(catalogSource, /sanitizeHtml\(beat\.genre\)/);

    // safeBeatId debe limpiar caracteres especiales
    assert.match(catalogSource, /const safeBeatId = String\(beat\.id \|\| ''\)\.replace/);
});

test('las reglas de Firestore y convert-referral bloquean auto-referidos y premios sin compra calificada', () => {
    const rules = read('firestore.rules');
    const referralRule = rules.match(/match \/referrals\/\{referralId\} \{([\s\S]*?)\n\s*\}/)?.[1] || '';
    
    // Prohíbe self-referral y referidos pre-convertidos en create
    assert.match(referralRule, /request\.resource\.data\.referrerId != request\.auth\.uid/);
    assert.match(referralRule, /converted == false/);
    // Solo admin puede actualizar
    assert.match(referralRule, /allow update: if isAdmin\(\);/);

    const convertSource = read('api/convert-referral.js');
    assert.match(convertSource, /if \(referrerId === uid\)/);
    assert.match(convertSource, /db\.collection\('payments'\)/);
    assert.match(convertSource, /hasApprovedPayment/);
});
