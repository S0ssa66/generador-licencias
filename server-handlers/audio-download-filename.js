const FORMAT_LABELS = Object.freeze({
    mp3: 'MP3',
    wav: 'WAV',
    stems: 'Stems'
});

const FIXED_EXTENSIONS = Object.freeze({
    mp3: 'mp3',
    wav: 'wav'
});

const STEM_EXTENSIONS = new Set(['zip', 'rar', '7z', 'tar', 'gz']);

function cleanFilenamePart(value, fallback) {
    const cleaned = String(value || '')
        .normalize('NFC')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[\\/:*?"<>|%]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/^[.\s-]+|[.\s-]+$/g, '')
        .slice(0, 100)
        .trim();
    return cleaned || fallback;
}

function extensionFromContentDisposition(value) {
    const match = String(value || '').match(/filename\*?=(?:UTF-8''|["'])?[^;"']*?\.([A-Za-z0-9]{1,5})(?:["';]|$)/i);
    return match ? match[1].toLowerCase() : '';
}

function resolveExtension(fileType, contentType, upstreamDisposition) {
    const normalizedType = String(fileType || '').toLowerCase();
    if (FIXED_EXTENSIONS[normalizedType]) return FIXED_EXTENSIONS[normalizedType];

    const upstreamExtension = extensionFromContentDisposition(upstreamDisposition);
    if (normalizedType === 'stems' && STEM_EXTENSIONS.has(upstreamExtension)) return upstreamExtension;

    const normalizedContentType = String(contentType || '').toLowerCase();
    if (normalizedContentType.includes('mpeg') || normalizedContentType.includes('mp3')) return 'mp3';
    if (normalizedContentType.includes('wav') || normalizedContentType.includes('wave')) return 'wav';
    if (normalizedContentType.includes('rar')) return 'rar';
    if (normalizedContentType.includes('7z')) return '7z';
    if (normalizedContentType.includes('gzip')) return 'gz';
    if (normalizedContentType.includes('tar')) return 'tar';
    if (normalizedContentType.includes('zip')) return 'zip';
    return normalizedType === 'stems' ? 'zip' : 'bin';
}

export function buildPurchasedAudioFilename({ beatName, producerName, fileType, contentType, upstreamDisposition } = {}) {
    const safeBeat = cleanFilenamePart(beatName, 'Instrumental');
    const safeProducer = cleanFilenamePart(producerName, 'BeatSS');
    const normalizedType = String(fileType || '').toLowerCase();
    const formatLabel = FORMAT_LABELS[normalizedType] || 'Audio';
    const extension = resolveExtension(normalizedType, contentType, upstreamDisposition);
    return `${safeBeat} - ${safeProducer} - ${formatLabel}.${extension}`;
}

function asciiFallback(filename) {
    return String(filename || '')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '')
        .replace(/["\\]/g, '-')
        .replace(/\s+/g, ' ')
        .trim() || 'BeatSS-Audio';
}

function encodeRfc5987(value) {
    return encodeURIComponent(value).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function buildInlineContentDisposition(filename) {
    const safeFilename = cleanFilenamePart(filename, 'BeatSS-Audio');
    return `inline; filename="${asciiFallback(safeFilename)}"; filename*=UTF-8''${encodeRfc5987(safeFilename)}`;
}
