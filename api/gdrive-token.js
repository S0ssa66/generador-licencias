// api/gdrive-token.js — RETIRADO POR SEGURIDAD
// Este endpoint ha sido desactivado permanentemente para evitar la exposición de tokens de la plataforma en el frontend.
// La subida de beats y archivos ahora utiliza Firebase Storage de forma directa y segura.

export default async function handler(req, res) {
    const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') return res.status(200).end();

    return res.status(403).json({ 
        success: false,
        error: 'Forbidden: Este endpoint ha sido retirado por razones de seguridad. Utilice Firebase Storage.' 
    });
}
