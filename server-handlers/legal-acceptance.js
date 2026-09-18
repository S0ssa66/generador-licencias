export const CHECKOUT_TERMS_VERSION = '2026-08-14';

export class LegalAcceptanceError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}

export function normalizeCheckoutLegalAcceptance(body = {}, nowMs = Date.now()) {
    if (body.acceptedTerms !== true) {
        throw new LegalAcceptanceError('TERMS_REQUIRED', 'Debes aceptar los términos y la licencia antes de continuar.');
    }

    const termsVersion = String(body.termsVersion || '').trim();
    if (termsVersion !== CHECKOUT_TERMS_VERSION) {
        throw new LegalAcceptanceError('TERMS_VERSION_REQUIRED', 'Actualiza y acepta la versión vigente de los términos antes de continuar.');
    }

    const acceptedAt = Date.parse(String(body.acceptanceTimestamp || '').trim());
    if (!Number.isFinite(acceptedAt) || acceptedAt > nowMs + 5 * 60 * 1000 || acceptedAt < nowMs - 24 * 60 * 60 * 1000) {
        throw new LegalAcceptanceError('INVALID_ACCEPTANCE', 'La aceptación de términos no es válida.');
    }

    return {
        termsVersion,
        acceptanceTimestamp: new Date(acceptedAt).toISOString()
    };
}
