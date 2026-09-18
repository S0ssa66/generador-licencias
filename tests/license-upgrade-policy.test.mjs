import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    LicenseUpgradeError,
    availablePriorLicenseUpgrades,
    evaluatePriorLicenseUpgrade
} from '../server-handlers/license-upgrade-policy.js';

const priorBasicLicense = {
    id: 'payment_prior',
    producerId: 'producer-1',
    beatId: 'beat-1',
    status: 'approved',
    buyerEmail: 'artist@example.com',
    licenseType: 'basic',
    finalPrice: 30,
    timestamp: '2026-05-15T10:00:00.000Z'
};

const exclusivelySoldBeat = {
    id: 'beat-1',
    sold: true,
    exclusiveEffectiveAt: '2026-05-16T10:00:00.000Z',
    price_basic: 30,
    price_premium: 60,
    price_premium_plus: 100,
    price_unlimited_flp: 200
};

test('una licencia anterior a la exclusiva conserva ampliaciones hasta Ilimitada y descuenta lo pagado', () => {
    const options = availablePriorLicenseUpgrades({ sourcePayment: priorBasicLicense, beat: exclusivelySoldBeat });
    assert.deepEqual(options.map(option => [option.targetLicenseType, option.amountDue]), [
        ['premium', 30],
        ['premium_plus', 70],
        ['unlimited_flp', 170]
    ]);
    assert.equal(options[2].creditApplied, 30);
    assert.equal(options[2].targetLicensePrice, 200);
});

test('la ampliación protege al titular y no permite saltar a exclusiva ni usar una licencia posterior', () => {
    assert.throws(() => evaluatePriorLicenseUpgrade({
        sourcePayment: priorBasicLicense,
        beat: exclusivelySoldBeat,
        buyerEmail: 'other@example.com',
        targetLicense: 'premium'
    }), error => error instanceof LicenseUpgradeError && error.code === 'UPGRADE_HOLDER_MISMATCH');

    assert.throws(() => evaluatePriorLicenseUpgrade({
        sourcePayment: { ...priorBasicLicense, timestamp: '2026-05-17T10:00:00.000Z' },
        beat: exclusivelySoldBeat,
        buyerEmail: priorBasicLicense.buyerEmail,
        targetLicense: 'premium'
    }), error => error instanceof LicenseUpgradeError && error.code === 'LICENSE_NOT_PRIOR_TO_EXCLUSIVE');

    assert.throws(() => evaluatePriorLicenseUpgrade({
        sourcePayment: priorBasicLicense,
        beat: exclusivelySoldBeat,
        buyerEmail: priorBasicLicense.buyerEmail,
        targetLicense: 'exclusive'
    }), error => error instanceof LicenseUpgradeError && error.code === 'INVALID_UPGRADE_TIER');
});

test('el contrato, el portal y la aceptación de la exclusiva usan la misma reserva de licencias previas', async () => {
    const [config, editor, checkout, sales] = await Promise.all([
        readFile(new URL('../config.js', import.meta.url), 'utf8'),
        readFile(new URL('../editor.js', import.meta.url), 'utf8'),
        readFile(new URL('../checkout.js', import.meta.url), 'utf8'),
        readFile(new URL('../dashboard_modules/sales.js', import.meta.url), 'utf8')
    ]);
    assert.match(config, /\{\{clause_prior_license_upgrade_rules\}\}/);
    assert.equal((editor.match(/const clause_prior_license_upgrade_rules/g) || []).length, 2);
    assert.match(checkout, /upgradeFromPaymentId: window\.checkoutUpgradeContext\?\.sourcePaymentId/);
    assert.doesNotMatch(checkout, /beatId: 'UPGRADE-'/);
    assert.match(sales, /exclusiveEffectiveAt/);
    assert.match(sales, /exclusiveSoldAt/);
});
