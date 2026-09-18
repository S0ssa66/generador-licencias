import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el historial de Emails no presenta como error una importación que no fue solicitada', () => {
    const emailHistory = read('dashboard_modules/email_history.js');

    assert.match(emailHistory, /export async function loadEmailHistory\(\)/);
    assert.doesNotMatch(emailHistory, /autoImportEmailHistory/);
    assert.doesNotMatch(emailHistory, /setInterval\([^)]*EmailJS/);
    assert.match(emailHistory, /btn-import-email-history[\s\S]*?try \{ await importEmailHistory\(\); \} catch \(error\) \{ window\.showToast\?\.\(error\.message, true\); \}/);
});

test('el historial vuelve a dibujarse al regresar a Emails con la suscripción activa', () => {
    const emailHistory = read('dashboard_modules/email_history.js');

    assert.match(emailHistory, /const hasLiveHistory = Boolean\(liveUnsubscribe && liveUid === user\.uid\);/);
    assert.match(emailHistory, /if \(hasLiveHistory\) \{\s*renderStats\(\);\s*renderRows\(\);\s*return;/);
});

test('filterResourcesForLicense excluye WAV y Stems en licencias básicas y Stems en premium', async () => {
    const { filterResourcesForLicense } = await import('../dashboard_modules/email_history.js');

    const sampleResources = [
        { kind: 'pdf', label: 'Licencia.pdf', url: 'https://beatss.app/pdf' },
        { kind: 'mp3', label: 'Audio MP3', url: 'https://beatss.app/mp3' },
        { kind: 'wav', label: 'Audio WAV', url: 'https://beatss.app/wav' },
        { kind: 'stems', label: 'Stems', url: 'https://beatss.app/stems' }
    ];

    // Para basic, solo debe quedar pdf y mp3
    const basicFiltered = filterResourcesForLicense(sampleResources, 'basic');
    assert.deepEqual(basicFiltered.map((r) => r.kind), ['pdf', 'mp3']);

    // Para premium, solo debe quedar pdf, mp3 y wav (sin stems)
    const premiumFiltered = filterResourcesForLicense(sampleResources, 'premium');
    assert.deepEqual(premiumFiltered.map((r) => r.kind), ['pdf', 'mp3', 'wav']);

    // Para unlimited o exclusive, se conservan todos
    const unlimitedFiltered = filterResourcesForLicense(sampleResources, 'unlimited');
    assert.deepEqual(unlimitedFiltered.map((r) => r.kind), ['pdf', 'mp3', 'wav', 'stems']);

    const exclusiveFiltered = filterResourcesForLicense(sampleResources, 'exclusive');
    assert.deepEqual(exclusiveFiltered.map((r) => r.kind), ['pdf', 'mp3', 'wav', 'stems']);
});

