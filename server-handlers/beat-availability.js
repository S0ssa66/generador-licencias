// Condición canónica para exponer o cobrar un instrumental. Las rutas públicas
// y Stripe deben coincidir: no basta con que el documento aún exista. `mp3`
// queda como compatibilidad para previews ya publicados; los MP3 de entrega
// nuevos viven exclusivamente en la subcolección privada.
export function resolvePublicPreview(beat = {}) {
    const preview = typeof beat.preview === 'string' ? beat.preview.trim() : '';
    if (preview) return preview;
    return typeof beat.mp3 === 'string' ? beat.mp3.trim() : '';
}

export function isBeatAvailableForSale(beat = {}) {
    return Boolean(resolvePublicPreview(beat))
        && beat.sold !== true
        && beat.isSold !== true
        && beat.published !== false
        && beat.isPublished !== false;
}
