import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    CURRENT_REFERENCE_VERSION,
    createManualContractReference,
    createPublicContractReference,
    getLicenseReferenceVersion,
    INVALID_REFERENCE_PREVIEW,
    isCurrentLicenseReference,
    isValidLicenseReference,
    normalizeLicenseReference,
    referenceTokenFromBytes,
    resolveLicenseReference
} from '../license-reference.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('solo acepta referencias contractuales persistibles', () => {
    assert.equal(normalizeLicenseReference(' cs_live_123  '), 'cs_live_123');
    assert.equal(isValidLicenseReference('cs_live_123'), true);
    assert.equal(isValidLicenseReference('LIC-BAS-20260913-001'), true);
    assert.equal(isValidLicenseReference('REF'), false);
    assert.equal(isValidLicenseReference('[Código Referencia]'), false);
    assert.equal(isValidLicenseReference('PENDIENTE'), false);
    assert.equal(isValidLicenseReference(''), false);
});

test('las nuevas referencias públicas son uniformes y no exponen la pasarela', () => {
    const reference = createPublicContractReference({
        licenseType: 'premium_plus',
        issuedAt: '2026-09-13T12:00:00.000Z',
        token: '7K2M9Q4DH6J8ABCDEFGH'
    });
    assert.equal(reference, 'BS3-20260913-PPL-7K2M-9Q4D-H6J8-ABCD-EFGH');
    assert.equal(isCurrentLicenseReference(reference), true);
    assert.equal(isValidLicenseReference(reference), true);
    assert.equal(getLicenseReferenceVersion(reference), 'v3');
    assert.equal(CURRENT_REFERENCE_VERSION, 'v3');

    const manual = createManualContractReference({
        licenseType: 'basic',
        issuedAt: '2026-09-13T12:00:00.000Z',
        token: '2A3B4C5D6E7F8G9HJKMN'
    });
    assert.equal(manual, 'BS3-20260913-BAS-2A3B-4C5D-6E7F-8G9H-JKMN');
    assert.doesNotMatch(manual, /stripe|paypal|payphone|deuna|cs_/i);
    assert.throws(
        () => createPublicContractReference({ licenseType: 'basic', token: 'short' }),
        /20 caracteres seguros/
    );
});

test('el token v3 usa bloques de 100 bits sin caracteres ambiguos', () => {
    const token = referenceTokenFromBytes(new Uint8Array(13));
    assert.equal(token, '22222222222222222222');
    assert.match(token, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{20}$/);
    assert.equal(getLicenseReferenceVersion('BS-20260913-BAS-7K2M9Q4D'), 'v2');
    assert.equal(isCurrentLicenseReference('BS-20260913-BAS-7K2M9Q4D'), true);
});

test('rechaza los índices fuera del alfabeto sin producir texto undefined', () => {
    const entropy = new Uint8Array(32);
    entropy[0] = 0xff;
    const token = referenceTokenFromBytes(entropy);
    assert.equal(token.length, 20);
    assert.match(token, /^[23456789ABCDEFGHJKMNPQRSTVWXYZ]{20}$/);
    assert.doesNotMatch(token, /undefined/i);
});

test('prioriza la referencia contractual y conserva formatos históricos sin aceptar IDs internos', () => {
    assert.equal(resolveLicenseReference({
        contractReference: 'cs_live_contract',
        reference: 'stripe_internal_id',
        refCode: 'legacy'
    }), 'cs_live_contract');
    assert.equal(resolveLicenseReference({ reference: 'REF', refCode: 'LIC-BAS-20260913-001' }), 'LIC-BAS-20260913-001');
    assert.equal(resolveLicenseReference({ refCode: 'randomFirestoreDocumentId123' }), '');
    assert.match(INVALID_REFERENCE_PREVIEW, /NO VÁLIDO/);
});

test('las rutas de entrega bloquean PDF e historial sin referencia válida', () => {
    const editor = read('editor.js');
    const history = read('dashboard_modules/history.js');
    const checkout = read('checkout.js');
    const confirmPurchase = read('api/confirm-purchase.js');
    const fulfillment = read('api/_fulfill-beat-purchase.js');
    const pendingOrders = read('server-handlers/create-pending-order.js');
    const downloads = read('server-handlers/get-order-downloads.js');
    const index = read('index.html');

    assert.match(editor, /async function downloadPDF\(\) \{\s+const refCode = getRequiredManualReference\(\);/);
    assert.match(editor, /async function sendEmailDelivery\(paymentId = ''\) \{\s+const refCode = getRequiredManualReference\(\);/);
    assert.match(history, /if \(!isValidLicenseReference\(refCode\)\)/);
    assert.match(checkout, /La compra no tiene un código de referencia válido/);
    assert.match(confirmPurchase, /La compra no tiene un código de referencia contractual válido/);
    assert.match(fulfillment, /createPaidContractReference/);
    assert.match(fulfillment, /createHmac\('sha256', REFERENCE_SECRET\)/);
    assert.match(fulfillment, /referenceVersion: CURRENT_REFERENCE_VERSION/);
    assert.match(pendingOrders, /createPendingContractReference/);
    assert.match(pendingOrders, /createHmac\('sha256', REFERENCE_SECRET\)/);
    assert.match(pendingOrders, /referenceVersion: CURRENT_REFERENCE_VERSION/);
    assert.match(downloads, /providerReference: _providerReference/);
    assert.match(index, /id="ref-code" readonly/);
});

test('el PDF posterior al pago usa el mismo marco visual del editor manual', () => {
    const editor = read('editor.js');
    const compilerStart = editor.indexOf('export function compileContractData');
    const compiler = editor.slice(compilerStart, editor.indexOf('window.compileContractData = compileContractData;', compilerStart));

    assert.match(compiler, /class="contract-doc"/);
    assert.match(compiler, /class="digital-seal-container"/);
    assert.doesNotMatch(compiler, /class="contract-doc-header"/);
});
