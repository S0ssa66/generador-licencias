// Modo de venta de BEATSS por productor — arquitectura C + B con A opt-in.
//
// Todo queda APAGADO por defecto: mientras `EXTERNAL_PRODUCERS_ENABLED` no sea
// verdadero, sólo el productor de plataforma (Sossa) puede vender y el
// marketplace general no expone productos de terceros.
//
// Ejes independientes:
//   - paymentMode ('platform_seller' | 'producer_gateway'):
//       platform_seller  → BEATSS cobra con sus llaves, factura y liquida (C).
//       producer_gateway → el productor cobra con su propia pasarela (A).
//   - monetización: suscripción por plan (B) + comisión (según plan/modo).
//
// Este módulo es puro (sin red ni Firebase) para poder probarlo aislado.

export const EXTERNAL_PRODUCERS_FLAG = 'EXTERNAL_PRODUCERS_ENABLED';

export const PAYMENT_MODES = Object.freeze({
    PLATFORM_SELLER: 'platform_seller',
    PRODUCER_GATEWAY: 'producer_gateway'
});

// Comisión por venta cuando BEATSS es el vendedor central (C).
// Plan gratuito `inicial` paga más; planes pagos pagan menos (incentivo B).
export const COMMISSION_BY_PLAN = Object.freeze({
    inicial: 15,
    free: 15,
    creador: 5,
    'artista pro': 5,
    artista_pro: 5,
    pro: 5,
    elite: 5
});

export const DEFAULT_EXTERNAL_COMMISSION_PERCENT = 15;

export function externalProducersEnabled(env = process.env) {
    const value = String(env?.[EXTERNAL_PRODUCERS_FLAG] ?? '').trim().toLowerCase();
    return value === 'true' || value === '1' || value === 'yes' || value === 'on';
}

function platformProducerId(env = process.env) {
    return String(env?.STRIPE_PLATFORM_PRODUCER_ID || '').trim();
}

export function normalizePlan(plan) {
    return String(plan || 'inicial')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');
}

export function commissionPercentForPlan(plan) {
    const normalized = normalizePlan(plan);
    if (Object.prototype.hasOwnProperty.call(COMMISSION_BY_PLAN, normalized)) {
        return COMMISSION_BY_PLAN[normalized];
    }
    // Ante una etiqueta desconocida se aplica la tarifa más alta, nunca una
    // comisión accidentalmente menor que el costo real de procesamiento.
    return DEFAULT_EXTERNAL_COMMISSION_PERCENT;
}

export function normalizePaymentMode(value) {
    return value === PAYMENT_MODES.PRODUCER_GATEWAY
        ? PAYMENT_MODES.PRODUCER_GATEWAY
        : PAYMENT_MODES.PLATFORM_SELLER;
}

/**
 * Resuelve si un productor puede vender y bajo qué condiciones.
 * Devuelve un objeto sin secretos, seguro para server.
 */
export function resolveProducerSalesMode({ producerId = '', publicConfig = {}, privateConfig = {}, env = process.env } = {}) {
    const isPlatform = Boolean(platformProducerId(env)) && producerId === platformProducerId(env);
    const plan = publicConfig.plan || privateConfig.plan || 'inicial';
    const paymentMode = normalizePaymentMode(privateConfig.paymentMode || publicConfig.paymentMode);

    if (isPlatform) {
        return {
            salesEnabled: true,
            isPlatform: true,
            source: 'platform',
            paymentMode: PAYMENT_MODES.PLATFORM_SELLER,
            monetizationPlan: 'platform',
            commissionPercent: 0,
            reason: 'platform_producer'
        };
    }

    const enabled = externalProducersEnabled(env);
    const commissionPercent = paymentMode === PAYMENT_MODES.PRODUCER_GATEWAY
        ? 0
        : commissionPercentForPlan(plan);

    return {
        salesEnabled: enabled,
        isPlatform: false,
        source: 'external',
        paymentMode,
        monetizationPlan: normalizePlan(plan),
        commissionPercent,
        reason: enabled ? 'external_enabled' : 'external_producers_disabled'
    };
}

/**
 * Calcula el reparto de una venta. Importes en centavos enteros.
 */
export function computeSettlement({ amountCents, commissionPercent } = {}) {
    const amount = Number(amountCents);
    const percent = Number(commissionPercent);
    if (!Number.isInteger(amount) || amount < 0) {
        throw new TypeError('amountCents debe ser un entero >= 0.');
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        throw new TypeError('commissionPercent debe estar entre 0 y 100.');
    }
    const platformFeeCents = Math.round((amount * percent) / 100);
    return {
        amountCents: amount,
        commissionPercent: percent,
        platformFeeCents,
        producerShareCents: amount - platformFeeCents
    };
}
