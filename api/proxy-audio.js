// api/proxy-audio.js — Vercel Edge Function
// Transmite el flujo de audio de Google Drive a través de nuestro propio dominio para evitar políticas restrictivas de CORS/CORP en el navegador.

export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    
    if (!id) {
        return new Response(JSON.stringify({ error: 'Falta el ID del archivo' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const targetUrl = `https://docs.google.com/uc?export=download&id=${id}`;
    
    try {
        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        if (!response.ok) {
            return new Response(JSON.stringify({ error: 'Error al recuperar el archivo de Google Drive' }), {
                status: response.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        
        const headers = new Headers();
        headers.set('Access-Control-Allow-Origin', '*');
        headers.set('Cache-Control', 'public, max-age=86400');
        
        const contentType = response.headers.get('content-type');
        const contentLength = response.headers.get('content-length');
        const acceptRanges = response.headers.get('accept-ranges');
        const contentRange = response.headers.get('content-range');
        
        if (contentType) headers.set('Content-Type', contentType);
        if (contentLength) headers.set('Content-Length', contentLength);
        if (acceptRanges) headers.set('Accept-Ranges', acceptRanges);
        if (contentRange) headers.set('Content-Range', contentRange);
        
        return new Response(response.body, {
            status: 200,
            headers: headers
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Error interno en el proxy de audio', details: err.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
