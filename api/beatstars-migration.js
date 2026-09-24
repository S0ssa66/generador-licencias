// Compatibilidad para el servidor local. En Vercel esta ruta se reescribe a
// /api/gdrive?route=beatstars-migration para respetar el límite de funciones.
export { default, makeBeatssProxyUrl, resetMigrationTicketRateLimit, checkMigrationTicketRateLimit, getSanitizedClientIp }
    from '../server-handlers/beatstars-migration.js';
