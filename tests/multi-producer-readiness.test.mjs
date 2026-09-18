import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el alta exige consentimiento, contraseña reforzada y verificación de correo', () => {
    const html = read('index.html');
    const auth = read('auth.js');
    const setup = read('auth-account-setup.js');
    assert.match(html, /id="auth-register-consent"[^>]*required/);
    assert.match(html, /id="auth-register-password"[^>]*minlength="10"/);
    assert.match(auth, /sendEmailVerification\(credential\.user\)/);
    assert.match(setup, /termsAcceptedAt/);
    assert.match(setup, /requiresEmailVerification/);
});

test('la configuración de cada productor no tiene lectura anónima', () => {
    const rules = read('firestore.rules');
    const producerRule = rules.match(/match \/config\/producer \{([\s\S]*?)\n\s*\}/)?.[1] || '';
    assert.match(producerRule, /allow read: if request\.auth != null/);
    assert.doesNotMatch(producerRule, /allow read: if true/);
    assert.match(rules, /stripeConnectAccountId/);
    assert.match(rules, /bankGuayaquilAcc/);
    assert.match(rules, /sriRazonSocial/);
    assert.match(rules, /'id', 'address', 'birthdate'/);
});

test('el checkout público usa la proyección del servidor y capacidades por tienda', () => {
    const checkout = read('checkout.js');
    assert.match(checkout, /storePayload\.paymentCapabilities/);
    assert.match(checkout, /window\.storePaymentCapabilities\?\.stripe === true/);
    assert.doesNotMatch(checkout, /getDoc\(doc\(db, ['"]users['"], result\.producerId, ['"]config['"], ['"]producer['"]\)\)/);
});

test('las cuentas nuevas usan almacenamiento propio y un slug único', () => {
    const defaults = read('producerDefaults.js');
    const main = read('main.js');
    assert.match(defaults, /storageProvider: "firebase"/);
    assert.match(defaults, /onboardingCompleted: false/);
    assert.match(main, /createProducerStoreSlug/);
    assert.match(main, /INITIAL_PLAN_MONTHLY_LICENSE_LIMIT = 5/);
});

test('los contratos de un productor nuevo no heredan la identidad de Sossa', () => {
    const html = read('index.html');
    const main = read('main.js');
    const editor = read('editor.js');
    assert.doesNotMatch(html, /id="cfg-producer-name" value="Joao David Dominguez"/);
    assert.doesNotMatch(main, /name: "Sossa",\s*\n\s*aka: "Sossa"/);
    assert.doesNotMatch(editor, /producerConfig\.id \|\| "0803743111"/);
    assert.doesNotMatch(editor, /producerConfig\.ipi \|\| "01170943066"/);
});

test('la facturación acepta datos fiscales migrados al documento privado', () => {
    const queue = read('api/_sri_queue.js');
    const main = read('main.js');
    const sriConfig = read('sri_config.py');
    assert.match(queue, /\.\.\.\(privateConfig \|\| \{\}\)/);
    assert.match(main, /'sriRazonSocial', 'sriNombreComercial'/);
    assert.match(sriConfig, /"sriRazonSocial"/);
});

test('los correos no conservan una configuración compartida de respaldo', () => {
    const files = ['checkout.js', 'editor.js', 'dashboard_modules/email_history.js', 'api/confirm-purchase.js'];
    for (const file of files) {
        const source = read(file);
        assert.doesNotMatch(source, /\|\|\s*['"]service_[A-Za-z0-9_-]+['"]/);
        assert.doesNotMatch(source, /\|\|\s*['"]template_[A-Za-z0-9_-]+['"]/);
    }
});

test('las compras sintéticas nunca envían correo fuera de BEATSS', () => {
    const delivery = read('api/_purchase-delivery.js');
    assert.match(delivery, /isSandboxEmailRecipient\(claim\.payment\.buyerEmail\)/);
    assert.match(delivery, /deliveryStatus: claim\.payment\.contractPdfUrl \? 'sandbox_complete' : 'portal_ready_sandbox'/);
    assert.match(delivery, /deliveryEmailMode: 'sandbox'/);
    assert.match(delivery, /return \{ complete: true, sandbox: true \}/);
});

test('los cobros de suscripción fallan cerrados sin configuración', () => {
    const payments = read('paymentPasarelas.js');
    const legacyConfig = read('admin_config.py');
    assert.doesNotMatch(payments, /PAYPAL-SUB-MOCK-CREATOR/);
    assert.doesNotMatch(payments, /sossamusic@gmail\.com/);
    assert.doesNotMatch(legacyConfig, /AaZODyYne1mAl_/);
    assert.doesNotMatch(legacyConfig, /2205256268/);
});

test('la cuenta ofrece una solicitud autenticada y reversible de eliminación', () => {
    const html = read('index.html');
    const main = read('main.js');
    const dispatcher = read('api/account.js');
    const handler = read('server-handlers/account-deletion-request.js');
    const vercel = read('vercel.json');
    assert.match(html, /id="btn-account-deletion-request"/);
    assert.match(main, /getIdToken\(true\)/);
    assert.match(main, /\/api\/account\/deletion-request/);
    assert.match(dispatcher, /deletion-request/);
    assert.match(handler, /verifyIdToken/);
    assert.match(handler, /normalizeDeletionAction/);
    assert.match(handler, /isTrustedBeatssOrigin\(requestOrigin\)/);
    assert.match(vercel, /\/api\/account\/deletion-request/);
});

test('el estado del sistema no afirma verificaciones que la interfaz no realiza', () => {
    const translations = read('i18n.js');
    assert.doesNotMatch(translations, /Operativo \(100% online\)/);
    assert.doesNotMatch(translations, /Latency: 14ms/);
    assert.match(translations, /no realiza monitoreo en tiempo real/);
});
