#!/usr/bin/env node

/**
 * Fast pre-deploy security gate for BEATSS.
 * It checks configuration and source invariants only; it never contacts
 * Firebase, Vercel, or a payment provider.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const failures = [];
const warnings = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const signingKey = process.env.DOWNLOAD_SIGNING_KEY || '';
if (process.env.NODE_ENV === 'production') {
  assert(signingKey.length >= 32, 'DOWNLOAD_SIGNING_KEY debe tener al menos 32 caracteres en producción.');
} else if (!signingKey) {
  warnings.push('DOWNLOAD_SIGNING_KEY no está en este entorno (esperado en una revisión local).');
}

const serverlessFiles = [
  'api/order.js',
  'api/account.js',
  'api/_purchase-delivery.js',
  'api/proxy-audio.js',
  'api/confirm-purchase.js',
  'api/convert-referral.js',
  'api/gdrive.js',
  'api/stripe.js',
  'api/payments/deuna.js',
  'api/payments/payphone/confirm.js',
  'api/payments/webhook.js',
  'server-handlers/activate-pro.js',
  'server-handlers/cancel-subscription.js',
  'server-handlers/create-pending-order.js',
  'server-handlers/redeem-vip.js',
  'server-handlers/stripe-create-checkout-session.js',
  'server-handlers/stripe-retry-deliveries.js',
  'server-handlers/stripe-session-status.js',
];
for (const file of serverlessFiles) {
  const source = read(file);
  assert(!source.includes("Access-Control-Allow-Origin', '*'"), `${file} contiene CORS abierto (*).`);
  assert(!source.includes('Access-Control-Allow-Origin", "*"'), `${file} contiene CORS abierto (*).`);
  assert(!source.includes('default_fallback_secret') && !source.includes('dev-signing-key'), `${file} contiene una clave de firma insegura.`);
  assert(!source.includes('details: error.message'), `${file} no debe exponer detalles de error internos.`);
}

const browserSourceFiles = ['main.js', 'config.js', 'producerDefaults.js'];
for (const file of browserSourceFiles) {
  const source = read(file);
  assert(!/data:application\/x-pkcs12;base64,[A-Za-z0-9+/=]{100,}/.test(source), `${file} contiene un certificado SRI incrustado.`);
  assert(!/sriP12Password\s*:\s*['"][^'"]+['"]/.test(source), `${file} contiene una contraseña SRI incrustada.`);
}

const corsFiles = [
  'api/gdrive.js',
  'api/confirm-purchase.js',
  'api/convert-referral.js',
  'api/payments/deuna.js',
  'server-handlers/activate-pro.js',
  'server-handlers/cancel-subscription.js',
  'server-handlers/redeem-vip.js',
  'server-handlers/stripe-create-checkout-session.js',
  'server-handlers/stripe-session-status.js',
];
assert(!fs.existsSync('api/payments/payphone/confirm 2.js'), 'api/payments/payphone/confirm 2.js no debe existir.');
for (const file of corsFiles) {
  assert(!read(file).includes("endsWith('.vercel.app')"), `${file} no debe aceptar cualquier origen Vercel.`);
}

const vercel = JSON.parse(read('vercel.json'));
const headers = JSON.stringify(vercel.headers || []);
assert(headers.includes('X-Content-Type-Options'), 'vercel.json debe publicar X-Content-Type-Options.');
assert(headers.includes('Strict-Transport-Security'), 'vercel.json debe publicar HSTS.');
assert(headers.includes('Cross-Origin-Resource-Policy'), 'vercel.json debe publicar CORP.');
assert(headers.includes('Content-Security-Policy'), 'vercel.json debe publicar Content-Security-Policy.');
assert(headers.includes('Permissions-Policy') && headers.includes('payment=(self)'), 'vercel.json debe restringir Permissions-Policy con payment=(self).');

const firestore = read('firestore.rules');
assert(firestore.includes('allow delete: if false;'), 'Firestore debe mantener borrado bloqueado por defecto en pagos.');
const paymentsStart = firestore.indexOf('match /payments/{paymentId}');
const paymentsEnd = firestore.indexOf('// Regla para referidos', paymentsStart);
const paymentRules = paymentsStart >= 0 ? firestore.slice(paymentsStart, paymentsEnd >= 0 ? paymentsEnd : undefined) : '';
const anonymousGet = paymentRules.match(/allow get:[\s\S]*?;/)?.[0] || '';
assert(paymentRules.length > 0, 'No se encontró el bloque de reglas de pagos.');
assert(!anonymousGet.includes('request.auth == null'), 'Firestore no debe permitir lectura anónima del documento completo de pago.');
assert(!anonymousGet.includes("!('userId' in resource.data)"), 'Un usuario autenticado no debe leer pagos de invitados ajenos.');
assert(!paymentRules.includes('request.auth == null'), 'Firestore no debe permitir creación ni actualización anónima de pagos.');
assert(paymentRules.includes('allow create: if isValidSubscriptionPayment();'), 'Firestore debe reservar la creación cliente a suscripciones autenticadas validadas.');

const checkout = read('checkout.js');
assert(!/onSnapshot\s*\(\s*doc\([^\n]*["']payments["']/.test(checkout), 'checkout.js no debe escuchar documentos completos de pagos como invitado.');
assert(!/addDoc\s*\(\s*collection\(\s*db\s*,\s*["']payments["']/.test(checkout), 'checkout.js no debe crear pagos directamente en Firestore.');
assert(!/updateDoc\s*\(\s*doc\(\s*db\s*,\s*["']payments["']/.test(checkout), 'checkout.js no debe actualizar pagos directamente en Firestore.');

const pendingOrder = read('server-handlers/create-pending-order.js');
assert(pendingOrder.includes('getCanonicalLicensePrice'), 'El endpoint de pedidos debe calcular precios canónicos en el servidor.');
assert(pendingOrder.includes('resolveCanonicalCoupon'), 'El endpoint de pedidos debe validar cupones en el servidor.');
assert(pendingOrder.includes('parseReceiptDataUrl'), 'El endpoint de pedidos debe validar el comprobante antes de guardarlo.');
assert(pendingOrder.includes('nextRateLimitState'), 'El endpoint de pedidos debe aplicar límites de frecuencia.');
assert(pendingOrder.includes('DEUNA_NOT_CONFIGURED'), 'El endpoint debe bloquear Deuna cuando falta el secreto del webhook.');

const storage = read('storage.rules');
assert(storage.includes('match /receipts/saas/{userId}/{fileName}'), 'Storage debe aislar comprobantes SaaS por usuario.');
assert(storage.includes("request.resource.contentType.matches('image/(jpeg|png|webp)')"), 'Storage debe limitar comprobantes SaaS a imágenes permitidas.');

const paymentStatus = read('server-handlers/payment-status.js');
assert(paymentStatus.includes('serializePaymentStatus'), 'Falta el serializador mínimo del estado de pago.');
assert(!/buyer(Name|Email|Phone|Dni|City|Country)/.test(paymentStatus), 'El endpoint de estado no debe manejar ni devolver PII del comprador.');
assert(paymentStatus.includes("headers['x-beatss-status-token']"), 'La credencial de estado debe viajar en un header y no en la URL.');
assert(!paymentStatus.includes("req.query?.token"), 'La credencial de estado no debe aceptarse desde query params.');
assert(paymentStatus.includes('checkStatusRateLimit'), 'server-handlers/payment-status.js debe aplicar límites de frecuencia.');
assert(paymentStatus.includes('isTrustedBeatssOrigin'), 'server-handlers/payment-status.js debe consolidar CORS con isTrustedBeatssOrigin.');

const proxyAudio = read('api/proxy-audio.js');
assert(proxyAudio.includes('terminalRevokedStatuses') && proxyAudio.includes('accessRevoked'), 'api/proxy-audio.js debe revocar el acceso a pedidos cancelados, disputados o reembolsados.');
assert(proxyAudio.includes('checkProxyRateLimit'), 'api/proxy-audio.js debe aplicar límites de frecuencia.');

const secureDelivery = read('server-handlers/secure-license-delivery.js');
assert(secureDelivery.includes('checkDeliveryRateLimit'), 'server-handlers/secure-license-delivery.js debe aplicar límites de frecuencia.');
assert(!secureDelivery.includes('.json({ error: error?.message'), 'server-handlers/secure-license-delivery.js no debe exponer mensajes de error internos en 500.');

const clearanceHtml = read('clearance.html');
assert(clearanceHtml.includes('showAlert(err.message ||'), 'clearance.html debe propagar mensajes de validación del servidor al usuario.');

const orderDownloads = read('server-handlers/get-order-downloads.js');
assert(orderDownloads.includes('isAuthorized && paymentIsApproved'), 'Los enlaces firmados solo deben generarse para pagos aprobados.');
assert(orderDownloads.includes('terminalRevokedStatuses') && orderDownloads.includes('accessRevoked'), 'server-handlers/get-order-downloads.js debe revocar el acceso a pedidos cancelados, disputados o reembolsados.');
assert(orderDownloads.includes('checkDownloadsRateLimit') && orderDownloads.includes('isTrustedBeatssOrigin'), 'server-handlers/get-order-downloads.js debe consolidar CORS seguro e implementar rate limiting.');

const logDownload = read('server-handlers/log-download.js');
assert(logDownload.includes('terminalRevokedStatuses') && logDownload.includes('accessRevoked'), 'server-handlers/log-download.js debe revocar el registro a pedidos cancelados, disputados o reembolsados.');
assert(logDownload.includes('checkLogRateLimit'), 'server-handlers/log-download.js debe aplicar límites de frecuencia.');

const confirmPurchase = read('api/confirm-purchase.js');
assert(confirmPurchase.includes('checkConfirmRateLimit'), 'api/confirm-purchase.js debe aplicar límites de frecuencia.');

const deletionRequest = read('server-handlers/account-deletion-request.js');
assert(deletionRequest.includes('checkDeletionRateLimit'), 'server-handlers/account-deletion-request.js debe aplicar límites de frecuencia.');

const clearance = read('server-handlers/clearance.js');
assert(clearance.includes('getMaxChannelsForLicense'), 'server-handlers/clearance.js debe implementar límite de canales por licencia.');

const deuna = read('api/payments/deuna.js');
assert(deuna.includes('bodyParser: false'), 'El webhook Deuna debe conservar el cuerpo crudo para validar la firma.');
assert(deuna.includes('verifyDeunaWebhookSignature'), 'El webhook Deuna debe validar X-Deuna-Signature.');
assert(deuna.includes('isFreshDeunaWebhook'), 'El webhook Deuna debe rechazar firmas vencidas.');
assert(deuna.includes("env.NODE_ENV === 'production'"), 'La simulación Deuna debe permanecer bloqueada en producción.');

const paypalWebhook = read('api/payments/webhook.js');
assert(paypalWebhook.includes('verifyPayPalWebhookSignature'), 'El webhook PayPal debe verificar la firma con PayPal.');
assert(paypalWebhook.includes('batch.create(eventRef'), 'El webhook PayPal debe registrar idempotencia en la misma escritura del plan.');
assert(!paypalWebhook.includes('omitiendo verificación') && !paypalWebhook.includes('permitimos continuar'), 'PayPal no debe omitir la firma en sandbox ni desarrollo.');

const payphone = read('api/payments/payphone/confirm.js');
assert(payphone.includes('getCanonicalLicensePrice'), 'PayPhone debe calcular precios canónicos en el servidor.');
assert(payphone.includes('resolveCanonicalCoupon'), 'PayPhone debe validar cupones en el servidor.');
assert(payphone.includes('verifyPendingStatusToken'), 'PayPhone debe ligar la confirmación a una credencial opaca.');

const paymentConfig = read('api/payments/config.js');
assert(paymentConfig.includes('serializePublicPaymentConfig'), 'La configuración pública de pagos debe usar una lista permitida explícita.');
assert(paymentConfig.includes('paymentCapabilities'), 'La configuración pública debe anunciar capacidades del servidor sin exponer secretos.');
assert(!paymentConfig.includes("origin.endsWith('.vercel.app')"), 'La configuración de pagos no debe aceptar cualquier origen Vercel.');
assert(!paymentConfig.includes('details: error.message'), 'La configuración de pagos no debe exponer errores internos.');

assert(checkout.includes('deunaBackendReady'), 'El checkout debe ocultar Deuna mientras falte la verificación segura del webhook.');

const chatbot = read('chatbot.js');
assert(chatbot.includes('formatChatMessage') && chatbot.includes('escapeChatHtml'), 'chatbot.js debe sanitizar y escapar HTML antes de procesar texto para prevenir DOM XSS.');

const stripeCreateCheckout = read('server-handlers/stripe-create-checkout-session.js');
assert(stripeCreateCheckout.includes('checkStripeCheckoutRateLimit'), 'server-handlers/stripe-create-checkout-session.js debe implementar rate limiting.');

const sriDownload = read('server-handlers/sri-download.js');
assert(sriDownload.includes('checkSriDownloadRateLimit'), 'server-handlers/sri-download.js debe implementar rate limiting.');

const retrySri = read('server-handlers/sri-retry.js');
assert(retrySri.includes('checkRetrySriRateLimit'), 'server-handlers/sri-retry.js debe implementar rate limiting.');

const gdrive = read('api/gdrive.js');
assert(gdrive.includes('checkDriveUploadRateLimit'), 'api/gdrive.js debe limitar la creación de sesiones de subida.');

const beatstarsMigration = read('server-handlers/beatstars-migration.js');
assert(beatstarsMigration.includes('checkMigrationTicketRateLimit'), 'api/beatstars-migration.js debe limitar la emisión de tickets de migración.');

const activatePro = read('server-handlers/activate-pro.js');
assert(activatePro.includes('checkActivateProRateLimit'), 'server-handlers/activate-pro.js debe aplicar rate limiting.');

const cancelSub = read('server-handlers/cancel-subscription.js');
assert(cancelSub.includes('checkCancelSubscriptionRateLimit'), 'server-handlers/cancel-subscription.js debe aplicar rate limiting.');

const convertReferral = read('api/convert-referral.js');
assert(convertReferral.includes('checkConvertReferralRateLimit'), 'api/convert-referral.js debe aplicar rate limiting.');

assert(paymentConfig.includes('checkPaymentConfigRateLimit'), 'api/payments/config.js debe aplicar rate limiting.');
assert(paymentConfig.includes('isTrustedBeatssOrigin'), 'api/payments/config.js debe usar isTrustedBeatssOrigin.');

assert(pendingOrder.includes('isTrustedBeatssOrigin'), 'server-handlers/create-pending-order.js debe usar isTrustedBeatssOrigin.');

assert(clearance.includes('isTrustedBeatssOrigin'), 'server-handlers/clearance.js debe usar isTrustedBeatssOrigin.');

assert(payphone.includes('isTrustedBeatssOrigin'), 'api/payments/payphone/confirm.js debe usar isTrustedBeatssOrigin.');

const publicStore = read('server-handlers/public-store.js');
assert(publicStore.includes('checkCatalogRateLimit'), 'server-handlers/public-store.js debe aplicar rate limiting al catálogo público.');
assert(publicStore.includes('checkArtworkRateLimit'), 'server-handlers/public-store.js debe aplicar rate limiting a las portadas públicas.');
assert(publicStore.includes('isTrustedBeatssOrigin'), 'server-handlers/public-store.js debe consolidar CORS con isTrustedBeatssOrigin.');

const accounting = read('dashboard_modules/accounting.js');
assert(accounting.includes('sanitizeHtml(favLabel)'), 'dashboard_modules/accounting.js debe sanitizar favLabel.');
assert(accounting.includes('sanitizeHtml(producerName)'), 'dashboard_modules/accounting.js debe sanitizar producerName en transacciones.');
assert(accounting.includes("sanitizeHtml(lic.buyerName || 'N/A')"), 'dashboard_modules/accounting.js debe sanitizar lic.buyerName.');
assert(accounting.includes('sanitizeHtml(code.redeemedByEmail)'), 'dashboard_modules/accounting.js debe sanitizar code.redeemedByEmail.');

const publicBeatUtils = read('public-beat-utils.js');
assert(publicBeatUtils.includes('isSafeArtworkUrl'), 'public-beat-utils.js debe validar URLs seguras de portadas para prevenir esquemas javascript/data peligrosos.');

// Lote 10: Prevención DOM XSS en checkout, consolidación CORS y rate limiting Deuna QR
assert(checkout.includes('makeCopyBtn') && checkout.includes('encodeURIComponent'), 'checkout.js debe proteger makeCopyBtn codificando valores para evitar escapes en atributos inline.');
assert(checkout.includes('sanitizeHtml(pichinchaAcc)') && checkout.includes('sanitizeHtml(deunaPhone)'), 'checkout.js debe sanitizar cuentas bancarias y teléfonos de productores.');
assert(checkout.includes('isSafeArtworkUrl'), 'checkout.js debe validar portadas de beats con isSafeArtworkUrl.');

assert(confirmPurchase.includes('isTrustedBeatssOrigin'), 'api/confirm-purchase.js debe validar orígenes con isTrustedBeatssOrigin.');
assert(confirmPurchase.includes("res.status(204).end()"), 'api/confirm-purchase.js debe responder 204 en preflights OPTIONS.');

assert(deuna.includes('checkDeunaQrRateLimit'), 'api/payments/deuna.js debe aplicar rate limiting para generación de QR.');
assert(deuna.includes('isTrustedBeatssOrigin'), 'api/payments/deuna.js debe validar orígenes con isTrustedBeatssOrigin.');
assert(deuna.includes("res.status(204).end()"), 'api/payments/deuna.js debe responder 204 en preflights OPTIONS.');

// Lote 11: Prevención DOM XSS en sales (el asistente Copilot fue retirado).
const sales = read('dashboard_modules/sales.js');
assert(sales.includes('sanitizeHtml(pay.reference') && sales.includes('sanitizeHtml(pay.buyerName'), 'dashboard_modules/sales.js debe sanitizar campos de pedidos en la tabla.');
assert(sales.includes('decodeURIComponent') && sales.includes('encodeURIComponent'), 'dashboard_modules/sales.js debe codificar IDs en botones inline.');
assert(sales.includes('isSafeArtworkUrl'), 'dashboard_modules/sales.js debe validar URLs de portadas y comprobantes.');

assert(sriDownload.includes("res.status(204).end()") && !sriDownload.includes("corsOrigin(req)"), 'server-handlers/sri-download.js debe usar OPTIONS 204 y no recurrir a fallback de CORS inseguro.');
assert(retrySri.includes("res.status(204).end()") && !retrySri.includes("corsOrigin(req)"), 'server-handlers/sri-retry.js debe usar OPTIONS 204 y no recurrir a fallback de CORS inseguro.');
assert(gdrive.includes("res.status(204).end()") && !gdrive.includes("getCorsOrigin(req)"), 'api/gdrive.js debe responder OPTIONS 204 y no usar getCorsOrigin.');
assert(beatstarsMigration.includes("res.setHeader('Vary', 'Origin')") && !beatstarsMigration.includes("corsOrigin(req)"), 'server-handlers/beatstars-migration.js debe usar Vary: Origin y no recurrir a corsOrigin.');

// Lote 12: Inyección de fórmulas CSV, DOM XSS en archivos y consolidación universal OPTIONS 204
const history = read('dashboard_modules/history.js');
assert(history.includes('sanitizeCsvFormula') && history.includes("formatCsvCell(buyerName)"), 'dashboard_modules/history.js debe proteger contra inyección de fórmulas CSV (CWE-1236).');

const emailHistory = read('dashboard_modules/email_history.js');
assert(emailHistory.includes('sanitizeCsvFormula'), 'dashboard_modules/email_history.js debe proteger contra inyección de fórmulas CSV.');

const csvImporter = read('dashboard_modules/csv_importer.js');
assert(csvImporter.includes('sanitizeImportText'), 'dashboard_modules/csv_importer.js debe sanitizar campos extraídos de CSVs.');

const mainSrc = read('main.js');
assert(mainSrc.includes('sanitizeHtml(file.name)'), 'main.js debe sanitizar file.name antes de asignarlo a innerHTML.');

const catalogSrc = read('catalog.js');
assert(catalogSrc.includes('safeFileName') && catalogSrc.includes('beats/${window.currentUser || \'anonymous\'}/${Date.now()}_${safeFileName}'), 'catalog.js debe sanitizar el nombre de archivo en storagePath.');

const activateProSrc = read('server-handlers/activate-pro.js');
assert(activateProSrc.includes('res.status(204).end()') && !activateProSrc.includes('res.status(200).end()'), 'server-handlers/activate-pro.js debe usar OPTIONS 204.');

const redeemVipSrc = read('server-handlers/redeem-vip.js');
assert(redeemVipSrc.includes('res.status(204).end()') && !redeemVipSrc.includes('res.status(200).end()'), 'server-handlers/redeem-vip.js debe usar OPTIONS 204.');

const cancelSubSrc = read('server-handlers/cancel-subscription.js');
assert(cancelSubSrc.includes('res.status(204).end()') && !cancelSubSrc.includes('res.status(200).end()'), 'server-handlers/cancel-subscription.js debe usar OPTIONS 204.');

const accountDelSrc = read('server-handlers/account-deletion-request.js');
assert(accountDelSrc.includes('res.status(204).end()') && !accountDelSrc.includes('res.status(200).end()'), 'server-handlers/account-deletion-request.js debe usar OPTIONS 204.');

const stripeCheckoutSrc = read('server-handlers/stripe-create-checkout-session.js');
assert(stripeCheckoutSrc.includes('res.status(204).end()') && stripeCheckoutSrc.includes('resolveAppOrigin'), 'server-handlers/stripe-create-checkout-session.js debe usar OPTIONS 204 y resolveAppOrigin.');

const stripeStatusSrc = read('server-handlers/stripe-session-status.js');
assert(stripeStatusSrc.includes('res.status(204).end()'), 'server-handlers/stripe-session-status.js debe usar OPTIONS 204.');

const orderDownloadsSrc = read('server-handlers/get-order-downloads.js');
assert(orderDownloadsSrc.includes('res.status(204).end()'), 'server-handlers/get-order-downloads.js debe usar OPTIONS 204.');

const logDownloadSrc = read('server-handlers/log-download.js');
assert(logDownloadSrc.includes('res.status(204).end()'), 'server-handlers/log-download.js debe usar OPTIONS 204.');

const paymentStatusSrc = read('server-handlers/payment-status.js');
assert(paymentStatusSrc.includes('res.status(204).end()'), 'server-handlers/payment-status.js debe usar OPTIONS 204.');

const proxyAudioSrc = read('api/proxy-audio.js');
assert(proxyAudioSrc.includes('res.status(204).end()'), 'api/proxy-audio.js debe usar OPTIONS 204.');

const convertReferralSrc = read('api/convert-referral.js');
assert(convertReferralSrc.includes('res.status(204).end()'), 'api/convert-referral.js debe usar OPTIONS 204.');

const paymentsConfigSrc = read('api/payments/config.js');
assert(paymentsConfigSrc.includes('res.status(204).end()'), 'api/payments/config.js debe usar OPTIONS 204.');

// Lote 13: Stored DOM XSS en analítica/gráficos, validación de contactos, firestore.rules y webhook stripe
const chartsSrc = read('dashboard_modules/charts.js');
assert(chartsSrc.includes('sanitizeHtml(buyer.name)') && chartsSrc.includes('sanitizeHtml(beat.name)'), 'dashboard_modules/charts.js debe sanitizar buyer.name y beat.name contra Stored DOM XSS.');

const contactsSrc = read('dashboard_modules/contacts.js');
assert(contactsSrc.includes('safeContactDocId') && contactsSrc.includes('cleanContactText'), 'dashboard_modules/contacts.js debe usar safeContactDocId y cleanContactText.');

const contactsRule = firestore.match(/match \/contacts\/\{contactId\} \{([\s\S]*?)\n\s*\}/)?.[1] || '';
assert(contactsRule.length > 0 && !contactsRule.includes('allow read, write:'), 'firestore.rules no debe contener allow read, write en contactos.');
assert(contactsRule.includes('allow create, update:') && contactsRule.includes('isValidContact()'), 'firestore.rules debe exigir isValidContact() en create y update de contactos.');

const stripeWebhookSrc = read('api/payments/stripe/webhook.js');
assert(stripeWebhookSrc.includes("res.setHeader('Cache-Control', 'private, no-store')"), 'api/payments/stripe/webhook.js debe emitir Cache-Control: private, no-store.');
assert(stripeWebhookSrc.includes("res.setHeader('Allow', 'POST')"), 'api/payments/stripe/webhook.js debe emitir Allow: POST ante métodos no permitidos.');

const pendingOrderSrc = read('server-handlers/create-pending-order.js');
assert(pendingOrderSrc.includes("if (req.method === 'OPTIONS') return res.status(204).end();\n    if (!origin)"), 'server-handlers/create-pending-order.js debe resolver preflight OPTIONS antes del chequeo de origen.');

// Lote 14: Hardening de contabilidad admin (DOM XSS / inline onclick), validación de recibos, dispatchers 404 Cache-Control y stripe-retry-deliveries
const accountingSrc = read('dashboard_modules/accounting.js');
assert(accountingSrc.includes('isSafeReceiptUrl') && accountingSrc.includes('btn-admin-view-receipt'), 'dashboard_modules/accounting.js debe usar isSafeReceiptUrl y listeners delegados.');
assert(!accountingSrc.includes('onclick="viewReceiptLarge(') && !accountingSrc.includes('onclick="approvePaymentAdmin('), 'dashboard_modules/accounting.js no debe contener onclick inline.');

const accountDispatcherSrc = read('api/account.js');
assert(accountDispatcherSrc.includes("res.setHeader('Cache-Control', 'private, no-store')"), 'api/account.js debe emitir Cache-Control: private, no-store en 404.');

const orderDispatcherSrc = read('api/order.js');
assert(orderDispatcherSrc.includes("res.setHeader('Cache-Control', 'private, no-store')"), 'api/order.js debe emitir Cache-Control: private, no-store en 404.');

const stripeDispatcherSrc = read('api/stripe.js');
assert(stripeDispatcherSrc.includes("res.setHeader('Cache-Control', 'private, no-store')"), 'api/stripe.js debe emitir Cache-Control: private, no-store en 404.');

const stripeRetrySrc = read('server-handlers/stripe-retry-deliveries.js');
assert(stripeRetrySrc.includes("res.setHeader('Allow', 'GET, OPTIONS')") && stripeRetrySrc.includes('res.status(204).end()'), 'server-handlers/stripe-retry-deliveries.js debe manejar OPTIONS 204 y cabecera Allow.');

if (failures.length) {
  console.error('SECURITY CHECK FAILED');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log('SECURITY CHECK PASSED');
}
for (const warning of warnings) console.warn(`WARNING: ${warning}`);
