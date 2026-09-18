export function isSafeArtworkUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
    if (/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) return true;
    if (/^data:image\/(?:png|jpe?g|webp|gif|svg\+xml|avif);base64,[a-z0-9+/=]+$/i.test(trimmed)) return true;
    if (/^data:image\/svg\+xml,[a-z0-9%._~()+-]+$/i.test(trimmed)) return true;
    return false;
}

export function resolvePublicBeatArtwork(beat) {
    if (!beat) return '';
    const config = beat.producerConfig || (typeof window !== 'undefined' ? window.storeProducerConfig : {}) || {};
    const configuredArtwork = config.defaultBeatArtworkUrl || config.defaultBeatArtwork;
    if (typeof configuredArtwork === 'string' && isSafeArtworkUrl(configuredArtwork)) {
        return configuredArtwork.trim();
    }

    const artwork = String(beat.artwork || '').trim().replace(/^["']|["']$/g, '');
    if (artwork && !/^(null|undefined|none)$/i.test(artwork) && !artwork.toLowerCase().includes('placeholder') && isSafeArtworkUrl(artwork)) {
        return artwork;
    }

    const logo = config.logoBase64 || config.logo || '';
    if (typeof logo === 'string' && isSafeArtworkUrl(logo)) {
        return logo.trim();
    }

    const accent = (typeof document !== 'undefined' && document.documentElement?.style?.getPropertyValue('--accent')?.trim()) || '#00ccff';
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#11121a"/><path d="M42 65V35l26-4v30" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/><circle cx="35" cy="65" r="7" fill="${accent}"/><circle cx="61" cy="61" r="7" fill="${accent}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(fallback)}`;
}
