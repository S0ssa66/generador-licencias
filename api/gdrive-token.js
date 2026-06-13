// api/gdrive-token.js — Deshabilitado por seguridad
// Este endpoint ha sido reemplazado por /api/gdrive-upload-session.js para evitar la fuga de tokens OAuth al cliente.

export default async function handler(req, res) {
    return res.status(410).json({
        error: 'Este endpoint ha sido deshabilitado permanentemente por motivos de seguridad.',
        code: 'ENDPOINT_DEPRECATED'
    });
}
