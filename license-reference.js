// Código de referencia contractual compartido por el Studio, checkout y API.
// Una referencia válida identifica una compra o una licencia ya registrada;
// textos de borrador nunca pueden usarse para emitir un documento oficial.
//
// Desde v3, la referencia que ve el cliente no reutiliza IDs de Stripe, PayPal
// ni de la base de datos. Esos valores se conservan aparte como trazabilidad
// técnica privada. Los formatos históricos siguen siendo válidos al leerlos.
// La referencia es un identificador público, nunca una credencial de descarga.
export const CURRENT_REFERENCE_VERSION = 'v3';

// 32 símbolos sin I, L, O ni U para reducir errores de lectura por teléfono.
// Cinco bloques de cuatro caracteres dan 100 bits de entropía cuando el token
// se origina en CSPRNG/HMAC del servidor.
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_TOKEN_LENGTH = 20;
const V2_REFERENCE_PATTERN = /^BS-\d{8}-(?:BAS|PRE|PPL|ILM|EXC|GEN)-[A-Z0-9]{6,12}$/;
const V3_REFERENCE_PATTERN = /^BS3-\d{8}-(?:BAS|PRE|PPL|ILM|EXC|GEN)-(?:[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-){4}[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$/;

const LICENSE_TIER_CODES = Object.freeze({
    basic: 'BAS',
    premium: 'PRE',
    premium_plus: 'PPL',
    unlimited_flp: 'ILM',
    exclusive: 'EXC'
});
const RESERVED_REFERENCE_VALUES = new Set([
    'ref',
    'reference',
    'codigo',
    'código',
    'pending',
    'pendiente',
    'draft',
    'borrador',
    'undefined',
    'null',
    'n/a',
    'na'
]);

export function normalizeLicenseReference(value) {
    return String(value ?? '')
        .trim()
        .replace(/\s+/g, '');
}

export function licenseTierCode(licenseType) {
    return LICENSE_TIER_CODES[String(licenseType || '').trim().toLowerCase()] || 'GEN';
}

function referenceDateSegment(value = new Date()) {
    const source = value instanceof Date ? value : new Date(value);
    const date = Number.isNaN(source.getTime()) ? new Date() : source;
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function normalizeReferenceToken(value) {
    return String(value ?? '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, REFERENCE_TOKEN_LENGTH);
}

export function referenceTokenFromBytes(bytes, length = REFERENCE_TOKEN_LENGTH) {
    if (!bytes || typeof bytes.length !== 'number' || length < 1) {
        throw new Error('No se recibió entropía válida para el código de referencia.');
    }
    let pendingBits = 0;
    let pendingValue = 0;
    let token = '';
    for (const byte of bytes) {
        pendingValue = (pendingValue << 8) | Number(byte);
        pendingBits += 8;
        while (pendingBits >= 5 && token.length < length) {
            pendingBits -= 5;
            const alphabetIndex = (pendingValue >>> pendingBits) & 31;
            // El alfabeto tiene 30 símbolos. Rechazar 30 y 31 mantiene una
            // distribución uniforme y evita concatenar `undefined` al token.
            if (alphabetIndex < REFERENCE_ALPHABET.length) {
                token += REFERENCE_ALPHABET[alphabetIndex];
            }
        }
        if (token.length === length) return token;
    }
    throw new Error('No hay suficiente entropía para el código de referencia.');
}

function formatReferenceToken(token) {
    const normalizedToken = normalizeReferenceToken(token);
    if (normalizedToken.length !== REFERENCE_TOKEN_LENGTH || !new RegExp(`^[${REFERENCE_ALPHABET}]{${REFERENCE_TOKEN_LENGTH}}$`).test(normalizedToken)) {
        throw new Error('El token de referencia debe tener 20 caracteres seguros.');
    }
    return normalizedToken.match(/.{4}/g).join('-');
}

/**
 * Creates the public contract code used in PDFs, emails and the buyer portal.
 * The caller supplies secure entropy; this module deliberately never embeds a
 * provider transaction identifier or customer information in the public code.
 */
export function createPublicContractReference({ licenseType, issuedAt = new Date(), token } = {}) {
    return `BS3-${referenceDateSegment(issuedAt)}-${licenseTierCode(licenseType)}-${formatReferenceToken(token)}`;
}

function browserReferenceToken() {
    // Nunca degradar a Date.now() o Math.random(): si el navegador no puede
    // generar aleatoriedad criptográfica, el Studio bloquea la emisión.
    if (!globalThis.crypto?.getRandomValues) {
        throw new Error('Este navegador no puede generar un código seguro de referencia.');
    }
    // Con rechazo uniforme de los valores 30 y 31, 13 bytes podrían no
    // alcanzar en una muestra aleatoria. 32 bytes mantienen margen amplio.
    const bytes = new Uint8Array(32);
    globalThis.crypto.getRandomValues(bytes);
    return referenceTokenFromBytes(bytes);
}

export function createManualContractReference({ licenseType, issuedAt = new Date(), token } = {}) {
    return createPublicContractReference({
        licenseType,
        issuedAt,
        token: token || browserReferenceToken()
    });
}

export function isValidLicenseReference(value) {
    const reference = normalizeLicenseReference(value);
    if (reference.length < 3 || reference.length > 160) return false;
    if (RESERVED_REFERENCE_VALUES.has(reference.toLowerCase())) return false;
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(reference);
}

export function isCurrentLicenseReference(value) {
    const reference = normalizeLicenseReference(value);
    return V3_REFERENCE_PATTERN.test(reference) || V2_REFERENCE_PATTERN.test(reference);
}

export function getLicenseReferenceVersion(value) {
    const reference = normalizeLicenseReference(value);
    if (V3_REFERENCE_PATTERN.test(reference)) return 'v3';
    if (V2_REFERENCE_PATTERN.test(reference)) return 'v2';
    return 'legacy';
}

function isLegacyPublicRefCode(value) {
    const reference = normalizeLicenseReference(value);
    return isCurrentLicenseReference(reference) ||
        /^LIC-[A-Z]+-\d{8}-\d+$/i.test(reference) ||
        /^REF-[A-Z0-9._-]{3,}$/i.test(reference) ||
        /^(?:CS|PI|PAYPAL|PP|TXN|DEUNA|OFERTA)[A-Z0-9._-]{3,}$/i.test(reference);
}

export function resolveLicenseReference(record = {}) {
    // No transformar ni migrar códigos antiguos: la primera referencia válida
    // ya persistida es la que sigue identificando ese documento histórico.
    const canonicalCandidates = [
        record.contractReference,
        record.reference,
        record.providerReference
    ];
    for (const candidate of canonicalCandidates) {
        const reference = normalizeLicenseReference(candidate);
        if (isValidLicenseReference(reference)) return reference;
    }
    // `refCode` en documentos antiguos sí puede ser el código impreso, pero
    // no tratamos un ID interno arbitrario de Firestore como contrato válido.
    const legacyRefCode = normalizeLicenseReference(record.refCode);
    if (isValidLicenseReference(legacyRefCode) && isLegacyPublicRefCode(legacyRefCode)) {
        return legacyRefCode;
    }
    return '';
}

export const INVALID_REFERENCE_PREVIEW = 'PENDIENTE — NO VÁLIDO';
