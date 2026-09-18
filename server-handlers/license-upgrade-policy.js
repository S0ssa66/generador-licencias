// Reglas canónicas para una ampliación de licencia después de que un beat se
// venda de forma exclusiva. La exclusiva detiene nuevas licencias públicas,
// pero no puede borrar derechos ya otorgados antes de su fecha efectiva.

export const LICENSE_TIERS = Object.freeze(['basic', 'premium', 'premium_plus', 'unlimited_flp']);
export const DEFAULT_LICENSE_PRICES = Object.freeze({
    basic: 30,
    premium: 60,
    premium_plus: 100,
    unlimited_flp: 200
});

export class LicenseUpgradeError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

export function normalizeLicenseTier(value) {
    const type = String(value || '').trim().toLowerCase();
    return type === 'unlimited' ? 'unlimited_flp' : type;
}

export function licenseTierRank(value) {
    return LICENSE_TIERS.indexOf(normalizeLicenseTier(value));
}

export function isApprovedLicenseStatus(value) {
    return ['approved', 'completed'].includes(String(value || '').trim().toLowerCase());
}

export function timestampMs(value) {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    if (typeof value === 'object' && Number.isFinite(value.seconds)) return Number(value.seconds) * 1000;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : 0;
}

export function paymentEffectiveAt(payment = {}) {
    return timestampMs(
        payment.contractEffectiveAt ||
        payment.contractEffectiveDate ||
        payment.purchaseConfirmedAt ||
        payment.timestamp ||
        payment.createdAt
    );
}

export function exclusiveEffectiveAt(beat = {}) {
    return timestampMs(
        beat.exclusiveEffectiveAt ||
        beat.exclusiveSoldAt ||
        beat.exclusiveLicense?.effectiveAt ||
        beat.exclusiveLicense?.soldAt
    );
}

export function catalogTierPrice(beat = {}, licenseType) {
    const tier = normalizeLicenseTier(licenseType);
    if (licenseTierRank(tier) < 0) return 0;
    const raw = Number(beat[`price_${tier}`] ?? beat[`${tier}Price`] ?? DEFAULT_LICENSE_PRICES[tier]);
    return Number.isFinite(raw) && raw > 0 ? Number(raw.toFixed(2)) : DEFAULT_LICENSE_PRICES[tier];
}

export function amountPaidForLicense(payment = {}) {
    const raw = Number(payment.finalPrice ?? payment.price ?? payment.originalPrice ?? 0);
    return Number.isFinite(raw) && raw > 0 ? Number(raw.toFixed(2)) : 0;
}

export function totalLicenseCredit(payment = {}) {
    const originalPaid = amountPaidForLicense(payment);
    const priorUpgrades = Number(payment.upgradeTotalPaid || 0);
    const credit = originalPaid + (Number.isFinite(priorUpgrades) && priorUpgrades > 0 ? priorUpgrades : 0);
    return Number(credit.toFixed(2));
}

function sameEmail(left, right) {
    return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

/**
 * Recalcula una ampliación autorizada. Debe llamarse de nuevo en el servidor
 * justo antes de crear el Checkout; los datos enviados por el navegador no
 * determinan ni el derecho ni el precio.
 */
export function evaluatePriorLicenseUpgrade({ sourcePayment = {}, beat = {}, buyerEmail = '', targetLicense = '' } = {}) {
    const sourceTier = normalizeLicenseTier(sourcePayment.licenseType);
    const targetTier = normalizeLicenseTier(targetLicense);
    const sourceRank = licenseTierRank(sourceTier);
    const targetRank = licenseTierRank(targetTier);
    const sourceDate = paymentEffectiveAt(sourcePayment);
    const exclusiveDate = exclusiveEffectiveAt(beat);

    if (!isApprovedLicenseStatus(sourcePayment.status)) {
        throw new LicenseUpgradeError('SOURCE_LICENSE_NOT_APPROVED', 'La licencia original todavía no está aprobada.');
    }
    if (sourceRank < 0 || sourceTier === 'exclusive') {
        throw new LicenseUpgradeError('SOURCE_LICENSE_NOT_ELIGIBLE', 'Esta licencia no puede usar la ampliación reservada.');
    }
    if (!sameEmail(sourcePayment.buyerEmail, buyerEmail)) {
        throw new LicenseUpgradeError('UPGRADE_HOLDER_MISMATCH', 'La ampliación debe ser adquirida por el titular de la licencia original.');
    }
    if (!exclusiveDate) {
        throw new LicenseUpgradeError('EXCLUSIVE_NOT_RECORDED', 'Este beat no registra todavía una exclusiva con fecha efectiva.');
    }
    if (!sourceDate || sourceDate > exclusiveDate) {
        throw new LicenseUpgradeError('LICENSE_NOT_PRIOR_TO_EXCLUSIVE', 'Solo las licencias emitidas antes de la exclusiva pueden usar esta ampliación.');
    }
    if (targetRank < 0 || targetRank <= sourceRank) {
        throw new LicenseUpgradeError('INVALID_UPGRADE_TIER', 'Selecciona una licencia superior a la ya adquirida.');
    }

    const targetPrice = catalogTierPrice(beat, targetTier);
    const creditApplied = Math.min(totalLicenseCredit(sourcePayment), targetPrice);
    const amountDue = Number((targetPrice - creditApplied).toFixed(2));
    if (amountDue <= 0) {
        throw new LicenseUpgradeError('UPGRADE_ALREADY_COVERED', 'El valor ya pagado cubre esta licencia; solicita la emisión sin costo al productor.');
    }

    return {
        sourceLicenseType: sourceTier,
        targetLicenseType: targetTier,
        sourceEffectiveAt: new Date(sourceDate).toISOString(),
        exclusiveEffectiveAt: new Date(exclusiveDate).toISOString(),
        targetLicensePrice: targetPrice,
        creditApplied,
        amountDue
    };
}

export function availablePriorLicenseUpgrades({ sourcePayment = {}, beat = {} } = {}) {
    const sourceTier = normalizeLicenseTier(sourcePayment.licenseType);
    const sourceRank = licenseTierRank(sourceTier);
    if (sourceRank < 0 || !isApprovedLicenseStatus(sourcePayment.status)) return [];
    const options = [];
    for (const targetLicenseType of LICENSE_TIERS.slice(sourceRank + 1)) {
        try {
            options.push(evaluatePriorLicenseUpgrade({
                sourcePayment,
                beat,
                buyerEmail: sourcePayment.buyerEmail,
                targetLicense: targetLicenseType
            }));
        } catch (_) {
            // El portal no revela condiciones internas de un pago no elegible.
        }
    }
    return options;
}
