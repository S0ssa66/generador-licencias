import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('el modal público de acceso no arrastra Firestore ni Storage', () => {
    const auth = read('auth.js');
    const bootstrap = read('app-bootstrap.js');
    const relay = read('relay-home.js');
    const index = read('index.html');

    assert.match(auth, /from\s+["']\.\/firebase-core\.js["']/);
    assert.doesNotMatch(auth, /firebase-data\.js/);
    assert.doesNotMatch(auth, /i18n\.js/);
    assert.match(auth, /window\.ensureBeatssApp/);
    assert.match(bootstrap, /window\.ensureBeatssAuth/);
    assert.match(relay, /withAuth/);
    assert.doesNotMatch(index, /src="\/relay-home\.js/);
    assert.match(bootstrap, /void import\('\.\/relay-home\.js'\)/);
});

test('la auditoría de identidad permanece en el bundle del Studio', () => {
    const main = read('main.js');
    assert.match(main, /window\.ensureUserIdentityRecord\s*=/);
    assert.match(main, /doc\(db, 'users', user\.uid\)/);
});

test('la tienda pública directa no vuelve a Inicio al resolver Auth', () => {
    const auth = read('auth.js');
    assert.match(auth, /currentPath\.startsWith\('\/tienda\/'\)/);
    assert.match(auth, /stateManager\?\.getState\?\.\('isPublicStoreMode'\)/);
});

test('el retorno de una sesión expirada carga Inicio junto con el acceso', () => {
    const bootstrap = read('app-bootstrap.js');

    assert.match(bootstrap, /const isExpiredSessionReturn = params\.get\('session'\) === 'expired';/);
    assert.match(bootstrap, /if \(isExpiredSessionReturn\) \{[\s\S]*void import\('\.\/relay-home\.js'\);[\s\S]*void loadBeatssAuth\(\);/);
});

test('Configuración actualiza Integraciones aunque Editor se cargue bajo demanda', () => {
    const main = read('main.js');
    const editor = read('editor.js');

    assert.match(main, /async function refreshSettingsIntegrationStatuses\(\)[\s\S]*?await loadModule\('editor'\);[\s\S]*?updateGoogleLoginLinkStatus\(\);[\s\S]*?await loadPlatformGDriveStatus\(\);/);
    assert.match(main, /function openSettingsModal\(\)[\s\S]*?modal\.style\.display = 'flex';[\s\S]*?void refreshSettingsIntegrationStatuses\(\);/);
    assert.match(editor, /function updateGoogleLoginLinkStatus\(\)[\s\S]*?if \(!user\) \{[\s\S]*?Inicia sesión para administrar el acceso con Google\.[\s\S]*?btnLink\.disabled = true;/);
    assert.match(editor, /async function loadPlatformGDriveStatus\(\)[\s\S]*?statusEl\.style\.color = '#8a91a6';[\s\S]*?linkButton\.disabled = true;/);
});

test('el catálogo general retirado redirige a la tienda de Sossa antes de cargar la aplicación', () => {
    const bootstrap = read('app-bootstrap.js');
    const publicRouter = read('public-router.js');
    const relay = read('relay-home.js');
    const main = read('main.js');
    assert.match(bootstrap, /const SOSSA_STORE_PATH = '\/tienda\/sossa';/);
    assert.match(bootstrap, /const isRetiredGlobalCatalogRoute = path === '\/catalogo'/);
    assert.match(bootstrap, /if \(isRetiredGlobalCatalogRoute\) \{[\s\S]*window\.location\.replace\(`\$\{SOSSA_STORE_PATH\}/);
    assert.doesNotMatch(bootstrap, /import\('\.\/public-router\.js'\)/);
    assert.doesNotMatch(publicRouter, /\.\/main\.js|firebase-data\.js|firebase\.js/);
    assert.match(publicRouter, /window\.location\.replace\(SOSSA_STORE_PATH\)/);
    assert.match(relay, /const goToSossaStore = \(\) => window\.location\.assign\('\/tienda\/sossa'\);/);
    assert.match(main, /if \(viewName === 'catalog'\) \{[\s\S]*window\.location\.assign\('\/tienda\/sossa'\);/);
});

test('la tienda pública individual tampoco arranca Studio antes de una compra', () => {
    const bootstrap = read('app-bootstrap.js');
    const publicStoreRouter = read('public-store-router.js');
    const publicStorefront = read('public-storefront.js');
    assert.match(bootstrap, /const isPublicStoreRoute = path\.startsWith\('\/tienda\/'\)/);
    assert.match(bootstrap, /import\('\.\/public-store-router\.js'\)/);
    assert.doesNotMatch(publicStoreRouter, /\.\/main\.js|firebase-data\.js|firebase\.js/);
    assert.doesNotMatch(publicStorefront, /firebase-data\.js|firebase\.js/);
    assert.match(publicStorefront, /from ['"]\.\/public-beat-utils\.js['"]/);
    assert.doesNotMatch(publicStorefront, /from ['"]\.\/public-catalog\.js['"]/);
    assert.match(publicStorefront, /ensureFullPublicIcons/);
    assert.match(publicStorefront, /fetch\(`\/api\/public-store\?producer=\$\{encodeURIComponent\(producerAka\)\}`\)/);
    assert.match(publicStorefront, /window\.storePaymentCapabilities = payload\.paymentCapabilities/);
    assert.match(publicStorefront, /await import\('\.\/checkout\.js'\)/);
});

test('el Studio mantiene el MP3 de entrega privado y solicita un preview público separado', () => {
    const catalog = read('catalog.js');
    const index = read('index.html');
    const firebaseData = read('firebase-data.js');

    assert.match(index, /id="tab-db-beat-preview"/);
    assert.match(index, /Preview MP3 etiquetado \(público\)/);
    assert.match(catalog, /const preview = document\.getElementById\('tab-db-beat-preview'\)\.value\.trim\(\);/);
    assert.match(catalog, /mp3: deleteField\(\)/);
    assert.match(catalog, /await setDoc\(privateDocRef, \{ mp3, wav, stems \}, \{ merge: true \}\);/);
    assert.match(firebaseData, /deleteField/);
});

test('la tienda pública tiene un tema claro propio y no depende del diseño oscuro heredado', () => {
    const publicStoreRouter = read('public-store-router.js');
    const publicStore = read('public-store.css');
    const publicStorefront = read('public-storefront.js');
    const index = read('index.html');
    const legacyStyles = read('styles.css');
    const checkout = read('checkout.js');
    const termsHandler = checkout.match(/export function onAcceptTermsChange\(\)[\s\S]*?(?=export function onPaymentClickWithoutTerms)/)?.[0] || '';

    assert.match(publicStoreRouter, /import ['"]\.\/public-store\.css['"]/);
    assert.match(publicStore, /#public-store-view \{[\s\S]*color-scheme: light;[\s\S]*--store-canvas: #f4f6fb;/);
    assert.match(publicStore, /#public-store-view \.store-header \{[\s\S]*background: #ffffff !important;/);
    assert.match(publicStore, /#public-store-view \.store-beat-card \{[\s\S]*background: #ffffff !important;/);
    assert.match(publicStore, /#beat-checkout-modal \{[\s\S]*background: #f4f6fb !important;/);
    assert.doesNotMatch(publicStore, /linear-gradient|radial-gradient|backdrop-filter|#0[fF]0[fF]12|#05070a/);
    assert.match(publicStorefront, /class="store-beat-card__title"/);
    assert.match(publicStorefront, /class="store-beat-card__buy"/);
    assert.match(index, /class="store-hero-copy"/);
    assert.match(index, /<h1>Escucha\. Elige\. Lanza\.<\/h1>/);
    assert.match(publicStore, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
    assert.match(publicStore, /grid-template-areas: "cover body" "buy buy";/);
    assert.match(publicStorefront, /slice\(0, 2\)/);
    assert.match(index, /id="store-beat-count"/);
    assert.match(index, /id="checkout-summary-card"/);
    assert.match(index, /class="checkout-close-glyph"/);
    assert.match(index, /id="checkout-terms-section"[\s\S]*data-checkout-legal="terms"[\s\S]*data-checkout-legal="license"/);
    assert.match(index, /id="btn-checkout-buy-now"[^>]*data-checkout-requires-terms[^>]*disabled/);
    assert.match(index, /id="btn-checkout-proceed-billing"[^>]*data-checkout-requires-terms[^>]*disabled/);
    assert.doesNotMatch(index, /openSupportModal\('terms'\)/);
    assert.match(index, /id="checkout-legal-modal"[\s\S]*role="dialog"[\s\S]*aria-modal="true"[\s\S]*inert hidden/);
    assert.match(checkout, /modal\.hidden = false;[\s\S]*modal\.removeAttribute\('inert'\)/);
    assert.match(checkout, /modal\.style\.display = 'none';[\s\S]*modal\.hidden = true;/);
    assert.match(checkout, /class="license-option-name"/);
    assert.match(checkout, /export function openCheckoutLegalDocument/);
    assert.match(checkout, /function setCheckoutTermsFeedback/);
    assert.match(checkout, /const CHECKOUT_TERMS_VERSION = '2026-08-14';/);
    assert.match(checkout, /function syncCheckoutContinuationControls\(\)[\s\S]*?\[data-checkout-requires-terms\][\s\S]*?button\.disabled = !accepted;/);
    assert.match(checkout, /function requireCheckoutTermsAcceptance\(\)[\s\S]*?onPaymentClickWithoutTerms\(\)/);
    assert.match(checkout, /if \(selectionChanged\) \{[\s\S]*?resetCheckoutTermsAcceptance\(\);/);
    assert.match(checkout, /termsVersion: legalAcceptance\.termsVersion/);
    assert.ok(termsHandler);
    assert.doesNotMatch(termsHandler, /nextBtn|btn-checkout-next/);
    assert.match(termsHandler, /checkoutCurrentStep === 3[\s\S]*initiateDeunaDynamicPayment/);
    assert.match(termsHandler, /checkoutCurrentStep === 3[\s\S]*renderStorePayphoneButton/);
    assert.match(publicStore, /#beat-checkout-modal #store-chk-accept-terms\s*\{[\s\S]*appearance: none;/);
    assert.match(publicStore, /\.checkout-legal-modal\s*\{[\s\S]*position: fixed;/);
    assert.match(index, /class="checkout-payment-heading">Elige cómo pagar<\/h3>/);
    assert.match(index, /class="checkout-payment-methods" aria-label="Métodos de pago disponibles"/);
    assert.match(index, /class="payment-method-visual payment-method-visual--stripe"[^>]*><img data-deferred-src="\/banks\/stripe\.svg" alt=""><\/span>/);
    assert.match(index, /class="payment-method-copy pointer-events-none"[\s\S]*?<strong>Tarjeta<\/strong>[\s\S]*?<small>Stripe · Internacional<\/small>/);
    assert.match(index, /<strong>Transferencia<\/strong>[\s\S]*?<small>Pichincha o Guayaquil<\/small>/);
    assert.match(publicStore, /\.checkout-payment-methods\s*\{[\s\S]*grid-template-columns: repeat\(auto-fit, minmax\(min\(100%, 210px\), 1fr\)\);/);
    assert.match(publicStore, /\.checkout-payment-methods \.pay-card-btn\s*\{[\s\S]*flex-direction: row !important;[\s\S]*text-align: left !important;/);
    assert.match(publicStore, /\.pay-card-btn\[aria-pressed="true"\]::after\s*\{[\s\S]*content: "✓";/);
    assert.match(publicStore, /#public-store-view\.public-store-shell/);
    assert.doesNotMatch(legacyStyles, /#public-store-view\s*\{\s*background:\s*radial-gradient/);
    assert.doesNotMatch(legacyStyles, /#public-store-view \.store-header\s*\{\s*background:\s*rgba\(255, 255, 255, 0\.01\)/);
});

test('las portadas públicas priorizan sólo el primer beat y difieren las demás', () => {
    const publicCatalog = read('public-catalog.js');
    const publicStorefront = read('public-storefront.js');
    for (const source of [publicCatalog, publicStorefront]) {
        assert.match(source, /loading="\$\{index === 0 \? 'eager' : 'lazy'\}"/);
        assert.match(source, /decoding="async"/);
        assert.match(source, /fetchpriority="high"/);
    }
});

test('las rutas públicas no descargan Material Symbols hasta abrir checkout', () => {
    const bootstrap = read('app-bootstrap.js');
    const publicRouter = read('public-router.js');
    const publicStoreRouter = read('public-store-router.js');
    const publicCatalog = read('public-catalog.js');
    const publicStorefront = read('public-storefront.js');
    assert.match(bootstrap, /window\.ensureBeatssMaterialSymbols = loadMaterialSymbols/);
    assert.doesNotMatch(publicRouter, /fonts\.googleapis\.com\/css2\?family=Material/);
    assert.doesNotMatch(publicStoreRouter, /fonts\.googleapis\.com\/css2\?family=Material/);
    assert.match(publicCatalog, /window\.ensureBeatssMaterialSymbols\?\.\(\)/);
    assert.match(publicStorefront, /window\.ensureBeatssMaterialSymbols\?\.\(\)/);
});

test('la tienda pública respeta su caché y el checkout puede conservar su recarga fresca', () => {
    const checkout = read('checkout.js');
    const catalog = read('public-catalog.js');
    assert.match(checkout, /fetch\(`\/api\/public-store\?producer=\$\{encodeURIComponent\(producerAka\)\}`\)/);
    assert.match(catalog, /fetch\(`\/api\/public-store\?producer=\$\{encodeURIComponent\(producer\)\}`,\s*\{ cache: 'no-store' \}\)/);
});

test('el checkout no expone trazas detalladas en la consola de producción', () => {
    const checkout = read('checkout.js');
    assert.match(checkout, /const checkoutDebugEnabled/);
    assert.match(checkout, /checkout_debug/);
    assert.match(checkout, /function checkoutDebug/);
    assert.match(checkout, /if \(!checkoutDebugEnabled\) return;/);
    assert.doesNotMatch(checkout, /console\.log/);
});

test('el acceso directo al Studio conserva su portal aislado y no deja trazas informativas', () => {
    const auth = read('auth.js');
    const authAccess = read('auth-access.css');
    const index = read('index.html');
    const main = read('main.js');
    assert.match(auth, /import ['"]\.\/auth-access\.css['"]/);
    assert.match(authAccess, /#login-modal\.ledger-auth-backdrop/);
    assert.match(authAccess, /#login-modal \.beatss-entry-card/);
    assert.match(authAccess, /min-height: 44px/);
    assert.match(index, /class="beatss-entry-card"/);
    assert.match(index, /class="beatss-entry-mark"/);
    assert.doesNotMatch(index, /ledger-auth-(aside|panel|benefits|security)/);
    assert.doesNotMatch(authAccess, /#login-modal \.ledger-auth-(card|aside|panel|benefits)/);
    assert.match(authAccess, /--entry-primary: #3157e8/);
    assert.doesNotMatch(authAccess.slice(0, authAccess.indexOf('Session-expiration warning')), /#191622|#ed4e8d|#ff7b5f|#633ceb|#b63fbd/);
    assert.doesNotMatch(auth, /console\.(log|debug|info)/);
    assert.doesNotMatch(main, /console\.(log|debug|info)/);
});

test('el acceso renovado oculta el modal por estado y ofrece recuperación segura', () => {
    const auth = read('auth.js');
    const authAccess = read('auth-access.css');
    const firebaseCore = read('firebase-core.js');
    const index = read('index.html');
    assert.match(authAccess, /#login-modal\.ledger-auth-backdrop\[aria-hidden="true"\]/);
    assert.match(authAccess, /display: none !important/);
    assert.match(auth, /sendPasswordResetEmail\(auth, email\)/);
    assert.match(firebaseCore, /sendPasswordResetEmail/);
    assert.match(index, /id="btn-reset-password"/);
    assert.match(index, /data-password-target="auth-login-password"/);
    assert.match(index, /role="tablist"/);
    assert.match(index, /id="auth-success-msg"[^>]*role="status"/);
});

test('el modal enlaza sus controles aunque Auth cargue antes que el HTML', () => {
    const auth = read('auth.js');
    assert.match(auth, /let authModalEventsBound = false/);
    assert.match(auth, /document\.addEventListener\('DOMContentLoaded',[\s\S]*setupAuthModalEvents\(\)/);
    assert.match(auth, /if \(authModalEventsBound\) return true/);
    assert.match(auth, /export function openAuthModal\(tabType = 'login'\)/);
    assert.match(auth, /setupAuthModalEvents\(\);\s*if \(authAndAppInitialized\) return;/);
    assert.match(auth, /window\.openAuthModal = openAuthModal/);
});

test('las rutas privadas sin sesión cargan Auth antes que Studio completo', () => {
    const bootstrap = read('app-bootstrap.js');
    const auth = read('auth.js');
    assert.match(bootstrap, /const requiresFullAppAtBootstrap = hasTransactionalParams \|\| hasKnownSession/);
    assert.match(bootstrap, /privateOrTransactionalRoute && requiresFullAppAtBootstrap/);
    assert.match(bootstrap, /else if \(privateOrTransactionalRoute\) \{[\s\S]*void loadBeatssAuth\(\)/);
    assert.match(auth, /const isPrivateWorkspaceRoute = Boolean\(workspaceTabForPath\(currentPath\)\)/);
    assert.match(auth, /\|\| isPrivateWorkspaceRoute\) && typeof window\.openAuthModal/);
});

test('el retorno de Stripe y las descargas se resuelven en un router público', () => {
    const bootstrap = read('app-bootstrap.js');
    const checkout = read('checkout.js');
    const purchaseRouter = read('public-purchase-router.js');
    assert.match(bootstrap, /const isPublicPurchaseRoute = path === '\/compra\/stripe'/);
    assert.match(bootstrap, /isPublicPurchaseRoute \|\| isBuyerDownloadRoute/);
    assert.match(bootstrap, /import\('\.\/public-purchase-router\.js'\)/);
    assert.match(bootstrap, /window\.location\.replace\('\/compra\/stripe\?session_id='/);
    assert.match(checkout, /window\.location\.replace\(`\/compra\/stripe\?session_id=/);
    assert.match(purchaseRouter, /Gracias por tu compra/);
    assert.match(purchaseRouter, /session-status\?sessionId=/);
    assert.match(purchaseRouter, /Abrir descargas/);
    assert.doesNotMatch(purchaseRouter, /import '\.\/auth\.js'/);
});

test('la vista previa del contrato conserva plantillas propias al cargar el editor modular', () => {
    const editor = read('editor.js');

    assert.match(editor, /let activeTemplates = DEFAULT_TEMPLATES\.map\(template => \(\{ \.\.\.template \}\)\);/);
    assert.match(editor, /window\.activeTemplates = activeTemplates;/);
    assert.match(editor, /async function loadTemplates\(\) \{[\s\S]*activeTemplates = DEFAULT_TEMPLATES\.map\(t => \(\{ \.\.\.t \}\)\);[\s\S]*window\.activeTemplates = activeTemplates;/);
    assert.match(editor, /if \(!activeTemplate\) \{[\s\S]*DEFAULT_TEMPLATES\.find/);
    assert.match(editor, /document\.getElementById\('rendered-contract-content'\)\.innerHTML = html;/);
});

test('el asistente usa un CTA legible y retira Continuar al llegar a Entrega', () => {
    const main = read('main.js');
    const viewport = read('viewport-coherence.css');

    assert.match(main, /nextButton\.hidden = step === 3/);
    assert.match(main, /3: \{ back: 'Editar datos' \}/);
    assert.match(viewport, /\.wizard-next-button span,[\s\S]*\.wizard-next-button svg \{[\s\S]*color: #ffffff !important;[\s\S]*stroke: currentColor !important;/);
    assert.match(viewport, /\.wizard-next-button\[hidden\],[\s\S]*\[data-editor-step-state="3"\] \.wizard-next-button \{[\s\S]*display: none !important;/);
    assert.match(viewport, /\.wizard-progress-actions\[data-editor-step-state="3"\] \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/);
});

test('las acciones finales caben en un pie compacto sin perder area tactil', () => {
    const studio = read('contract-studio.css');

    assert.match(studio, /#delivery-actions \{[\s\S]*display: grid !important;[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*gap: 8px !important;/);
    assert.match(studio, /#delivery-actions > button,[\s\S]*#delivery-actions \.action-row > button \{[\s\S]*min-height: 44px !important;[\s\S]*font-size: 12px !important;/);
    assert.match(studio, /#delivery-actions > \.action-row \{[\s\S]*display: contents !important;/);
    assert.match(studio, /#delivery-actions :is\(#btn-docusign, #btn-send-signed-delivery, #btn-clear-fields\) \{[\s\S]*grid-column: 1 \/ -1 !important;/);
    assert.doesNotMatch(studio, /#delivery-actions[\s\S]{0,180}min-height:\s*(?:3[0-9]|4[0-3])px/);
});

test('los filtros públicos tienen nombres accesibles', () => {
    const index = read('index.html');
    const viewport = read('viewport-coherence.css');
    for (const [id, label] of [
        ['global-genre-select', 'Género'],
        ['global-price-select', 'Precio Máximo'],
        ['global-bpm-select', 'BPM / Tempo'],
        ['global-sort-select', 'Ordenar por']
    ]) {
        assert.match(index, new RegExp(`<label for="${id}"[^>]*>${label}</label>`));
    }
    assert.match(index, /id="store-search-input"[^>]*aria-label="Buscar instrumentales"/);
    assert.match(index, /id="store-genre-select"[^>]*aria-label="Filtrar por género"/);
    assert.match(index, /id="store-key-select"[^>]*aria-label="Filtrar por escala musical"/);
    assert.match(viewport, /#catalog-btn-language, #catalog-btn-login, \.minimal-select/);
    assert.match(viewport, /min-height: 44px !important;/);
});

test('la tarjeta pública muestra basicPrice y la tarifa base cuando no hay una excepción', () => {
    const checkout = read('checkout.js');
    assert.match(checkout, /beat\.price_basic \?\? beat\.basicPrice/);
    assert.match(checkout, /\|\| 30/);
    const storefront = read('public-storefront.js');
    assert.match(storefront, /DEFAULT_BASIC_LICENSE_PRICE = 30/);
    assert.match(storefront, /beat\.price_basic \?\? beat\.basicPrice/);
});

test('Más herramientas se despliega por encima del contenido privado', () => {
    const dashboardHome = read('dashboard-home.css');
    const index = read('index.html');
    const main = read('main.js');
    const mobileStudio = read('mobile-studio.js');

    assert.match(index, /<details class="workspace-secondary-nav">/);
    assert.match(index, /<div class="workspace-secondary-menu">/);
    assert.match(index, /id="workspace-settings-btn"[\s\S]*Configuración/);
    assert.match(main, /getElementById\('workspace-settings-btn'\)[\s\S]*openSettingsModal\(\)/);
    assert.match(mobileStudio, /data-ledger-mobile-action="settings"[\s\S]*Configuración/);
    assert.match(mobileStudio, /data-ledger-mobile-action="settings"[\s\S]*getElementById\('btn-settings'\)\?\.click\(\)/);
    assert.match(dashboardHome, /#app-container\.saas-workspace \.main-header \{[\s\S]*position: relative;[\s\S]*z-index: 60;[\s\S]*overflow: visible;/);
    assert.match(dashboardHome, /#app-container\.saas-workspace \.workspace-secondary-menu \{[\s\S]*z-index: 61;/);
    assert.match(dashboardHome, /width: min\(304px, calc\(100vw - 32px\)\);/);
    assert.match(dashboardHome, /\.workspace-secondary-menu :is\(\.tab-btn, \.workspace-menu-action\) > span \{[\s\S]*text-overflow: ellipsis;[\s\S]*white-space: nowrap;/);
    assert.match(main, /const secondaryNav = document\.querySelector\('\.workspace-secondary-nav'\);[\s\S]*secondaryNav\.open = false;/);
});

test('Configuración oculta los datos privados hasta una revelación explícita', () => {
    const index = read('index.html');
    const main = read('main.js');
    const settings = read('settings-modern.css');

    assert.match(index, /id="btn-toggle-private-settings"[^>]*aria-pressed="false"[\s\S]*Mostrar datos privados/);
    assert.match(main, /const SETTINGS_PRIVATE_FIELD_IDS = Object\.freeze\(\[[\s\S]*'cfg-ds-client-id'[\s\S]*'cfg-paypal-client-secret'[\s\S]*'cfg-payphone-client-id'[\s\S]*'cfg-stripe-publishable-key'/);
    assert.match(main, /function setSettingsPrivateValuesVisible\(visible = false\)[\s\S]*input\.type = shouldReveal \? 'text' : 'password'/);
    assert.match(main, /function openSettingsModal\(\)[\s\S]*setSettingsPrivateValuesVisible\(false\);[\s\S]*modal\.style\.display = 'flex'/);
    assert.match(main, /function closeSettingsModal\(\)[\s\S]*setSettingsPrivateValuesVisible\(false\);/);
    assert.match(settings, /#settings-modal \.settings-private-toggle\[aria-pressed="true"\]/);
});

test('el Studio privado conserva un tema claro sin depender de la portada pública', () => {
    const main = read('main.js');
    const index = read('index.html');
    const workspaceTheme = read('workspace-theme.css');
    const dashboardHome = read('dashboard-home.css');
    const contractStudio = read('contract-studio.css');
    const viewport = read('viewport-coherence.css');
    const themeFixture = read('tests/fixtures/workspace-theme.html');

    const themeImport = main.indexOf("import './workspace-theme.css?v=workspace-theme-1';");
    const homeImport = main.indexOf("import './dashboard-home.css?v=dashboard-home-1';");
    assert.ok(themeImport >= 0, 'el bundle privado debe importar su tema base');
    assert.ok(themeImport < homeImport, 'los tokens deben existir antes de las vistas privadas');

    assert.match(workspaceTheme, /#app-container\.saas-workspace \{[\s\S]*color-scheme: light;/);
    assert.match(workspaceTheme, /#app-container\.saas-workspace #tab-home \{[\s\S]*background: var\(--workspace-canvas\) !important;/);
    assert.doesNotMatch(workspaceTheme, /(^|\n)\s*:root\s*\{/);
    assert.doesNotMatch(index, /id="btn-theme-toggle"|id="theme-icon"/);
    assert.doesNotMatch(main, /_theme`|classList\.toggle\('light-theme'\)/);
    assert.match(main, /async function initApp\(user\) \{[\s\S]*document\.body\.classList\.add\('light-theme'\);/);
    assert.match(themeFixture, /href="\/styles\.css"[\s\S]*href="\/workspace-theme\.css"[\s\S]*href="\/dashboard-home\.css"/);
    assert.doesNotMatch(themeFixture, /<body[^>]*class="[^"]*light-theme/);

    const consumers = [dashboardHome, contractStudio, viewport].join('\n');
    const requiredLedgerTokens = new Set(
        [...consumers.matchAll(/var\((--ledger-[a-z0-9-]+)/gi)].map(match => match[1])
    );
    const definedWorkspaceTokens = new Set(
        [...workspaceTheme.matchAll(/\s(--ledger-[a-z0-9-]+)\s*:/gi)].map(match => match[1])
    );

    for (const token of requiredLedgerTokens) {
        assert.ok(
            definedWorkspaceTokens.has(token),
            `${token} debe definirse en el bundle privado, no en la portada pública`
        );
    }
});

test('Licencias y Pedidos comparten una superficie clara sin tokens grises heredados', () => {
    const main = read('main.js');
    const index = read('index.html');
    const operations = read('operations-ledger.css');
    const licenseLibrary = read('license-library.css');
    const mobile = read('mobile.css');
    const mobileStudio = read('mobile-studio.js');
    const history = read('dashboard_modules/history.js');
    const sales = read('dashboard_modules/sales.js');

    assert.match(main, /import ['"]\.\/operations-ledger\.css\?v=operations-ledger-1['"]/);
    assert.match(main, /import ['"]\.\/license-library\.css\?v=license-library-1['"]/);
    assert.match(index, /id="tab-history"[^>]*operations-page|class="tab-content operations-page" id="tab-history"/);
    assert.match(index, /class="tab-content operations-page" id="tab-sales"/);
    assert.match(index, /id="history-stats-container" hidden/);
    assert.match(index, /id="sales-table-panel"[^>]*hidden/);
    assert.match(operations, /\.operations-metric \{[\s\S]*background: #ffffff !important;/);
    assert.match(operations, /\.operations-panel \{[\s\S]*background: #ffffff !important;/);
    assert.doesNotMatch(operations, /var\(--bg-card\)/);
    assert.match(index, /id="licenses-page-title">Tus acuerdos,[\s\S]*en orden\./);
    assert.match(index, /id="orders-page-title">Centro de pedidos</);
    assert.doesNotMatch(index, /operations-metric" data-tone=/);
    assert.match(operations, /\.main-header \.tab-btn\.active \{[\s\S]*background: #3157e8 !important;[\s\S]*color: #ffffff !important;/);
    assert.match(operations, /\.operations-metric\[data-tone\] \{[\s\S]*--metric-accent: #3157e8;/);
    assert.match(index, /class="history-main-layout license-library-layout" id="history-main-layout" hidden/);
    assert.match(index, /class="history-stats-cards license-library-stats" id="history-stats-container" hidden/);
    assert.match(licenseLibrary, /grid-template-columns: minmax\(250px, 300px\) minmax\(0, 1fr\) !important;/);
    assert.match(licenseLibrary, /grid-template-areas:[\s\S]*"beat type value actions"[\s\S]*"buyer sri sri actions"/);
    assert.match(licenseLibrary, /\.license-library-rail \{[^}]*position: static;[^}]*align-self: start;/);
    assert.doesNotMatch(licenseLibrary, /\.license-library-rail \{[^}]*position: sticky;/);
    assert.doesNotMatch(licenseLibrary, /#00e676|rgba\(0, 230, 118/);
    assert.match(mobile, /#app-container\.saas-workspace \.ledger-mobile-nav \{[\s\S]*background: rgba\(255, 255, 255, \.96\) !important;/);
    assert.match(mobileStudio, /secondaryViews = new Set\(\['tab-preview', 'tab-dashboard', 'tab-sales', 'tab-email-history', 'tab-whitelist'\]\)/);
    assert.match(history, /statsContainer\.hidden = true/);
    assert.match(history, /statsContainer\.hidden = false/);
    assert.match(history, /className = 'license-record-beat'/);
    assert.doesNotMatch(history, /'PROCESANDO'|'PROCESSING'/);
    assert.match(history, /EN_COLA_EMISION/);
    assert.match(history, /EN_PROCESO/);
    assert.match(licenseLibrary, /\.license-feed \.history-table td,[\s\S]*font-size: 15px !important;/);
    assert.match(licenseLibrary, /\.license-record-beat strong \{[\s\S]*font-size: 23px;/);
    assert.match(licenseLibrary, /\.license-record-ref \.ref-code-cell \{[\s\S]*font: 700 13px\/1\.45/);
    assert.match(licenseLibrary, /\.license-record-value \{[\s\S]*font-variant-numeric: tabular-nums;/);
    assert.match(history, /<span>\$\{currentLang === 'es' \? 'Editar' : 'Edit'\}<\/span>/);
    assert.match(sales, /tablePanel\.hidden = true/);
    assert.match(sales, /tablePanel\.hidden = false/);
});

test('Licencias conserva su cargador real y Emails vuelve a la navegación visible', () => {
    const main = read('main.js');
    const storage = read('storageBackup.js');
    const index = read('index.html');
    const mobileStudio = read('mobile-studio.js');

    assert.doesNotMatch(main, /window\.loadHistory\s*=\s*loadHistory/);
    assert.doesNotMatch(main, /window\.saveHistory\s*=\s*saveHistory/);
    assert.match(main, /const loadHistory = async[\s\S]*await loadModule\('storageBackup'\)/);
    assert.match(main, /history: \[[\s\S]*'updateHistoryTable'/);
    assert.doesNotMatch(main, /history: \[\s*'loadHistory'/);
    assert.match(storage, /if \(window\.currentUser\) \{[\s\S]*collection\(db, "users", window\.currentUser, "licencias"\)/);
    assert.match(storage, /query\(colRef, limit\(300\)\)/);
    assert.doesNotMatch(storage, /orderBy\("date"/);

    const primaryTabs = index.match(/<div class="workspace-primary-tabs">([\s\S]*?)<\/div>\s*<\/div>\s*<details class="workspace-secondary-nav">/)?.[1] || '';
    const secondaryMenu = index.match(/<div class="workspace-secondary-menu">([\s\S]*?)<\/div>\s*<\/details>/)?.[1] || '';
    assert.match(primaryTabs, /data-tab="tab-email-history"/);
    assert.doesNotMatch(secondaryMenu, /data-tab="tab-email-history"/);
    assert.match(mobileStudio, /data-ledger-mobile-view="tab-email-history"/);
    assert.match(index, /id="btn-refresh-history"/);
    assert.match(main, /getElementById\('btn-refresh-history'\)[\s\S]*loadHistory\(\)/);
});

test('Ventas usa un dashboard claro aislado y conserva sus datos funcionales', () => {
    const main = read('main.js');
    const index = read('index.html');
    const analytics = read('sales-analytics.css');
    const charts = read('dashboard_modules/charts.js');
    const dashboardSection = index.match(/<div class="tab-content sales-analytics" id="tab-dashboard"[\s\S]*?<div class="tab-content operations-page" id="tab-sales"/)?.[0] || '';

    assert.match(main, /import ['"]\.\/sales-analytics\.css\?v=sales-analytics-1['"]/);
    assert.match(dashboardSection, /class="sales-analytics__header"/);
    assert.match(dashboardSection, /id="dashboard-stats-container"/);
    assert.match(dashboardSection, /id="monthly-sales-chart-container"/);
    assert.match(dashboardSection, /id="license-types-chart-container"/);
    assert.match(dashboardSection, /id="top-beats-chart-container"/);
    assert.match(dashboardSection, /id="db-top-buyers-tbody"/);
    assert.doesNotMatch(dashboardSection, /sales-copilot|copilot-input-form/);
    assert.doesNotMatch(dashboardSection, /bg-charcoal-deep|bg-gradient-to-r|blur-3xl|border-white\/5/);
    assert.match(analytics, /--sales-blue: #3157e8;/);
    assert.match(analytics, /#dashboard-stats-container > \.sales-metric\.sales-metric--primary[\s\S]*background-color: var\(--sales-blue\) !important;/);
    assert.match(analytics, /font-variant-numeric: tabular-nums;/);
    assert.match(analytics, /@media \(max-width: 620px\)/);
    assert.doesNotMatch(analytics, /linear-gradient|radial-gradient|backdrop-filter|filter:\s*blur/);
    assert.match(charts, /const controls = element\.querySelector\('\.sales-analytics__actions'\)/);
    assert.doesNotMatch(charts, /linear-gradient\(90deg/);
});

test('Beats usa una biblioteca nueva y recupera la carátula configurada de Sossa', () => {
    const main = read('main.js');
    const index = read('index.html');
    const catalog = read('catalog.js');
    const beatCatalog = read('beat-catalog.css');

    assert.match(main, /import ['"]\.\/beat-catalog\.css\?v=beat-catalog-1['"]/);
    assert.match(index, /class="beat-catalog-toolbar"[\s\S]*id="beat-catalog-title">Mis beats</);
    assert.match(index, /class="beat-catalog-grid"/);
    assert.match(catalog, /export function resolveWorkspaceBeatArtwork\(beat\)/);
    assert.match(catalog, /if \(isUsableArtwork\(beat\?\.artwork\)\)[\s\S]*config\.defaultBeatArtworkUrl \|\| config\.defaultBeatArtwork/);
    assert.match(catalog, /if \(isSossaCatalog\) return '\/beat-thumbnail-sossa\.jpg';/);
    assert.match(catalog, /onerror="this\.onerror=null;this\.src='\/logo\.png'"/);
    assert.doesNotMatch(catalog, /isSossaCatalog\) return '\/producer_sossa\.webp'/);
    assert.match(catalog, /document\.createElement\('article'\)/);
    assert.match(catalog, /\['MP3', hasMp3\],[\s\S]*\['WAV', hasWav\],[\s\S]*\['STEMS', hasStems\]/);
    assert.match(catalog, /aria-label="Editar \$\{safeBeatName\}"/);
    assert.match(catalog, /aria-label="Dar de baja \$\{safeBeatName\}"/);
    assert.match(beatCatalog, /#tab-beats-grid\.beat-catalog-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
    assert.match(beatCatalog, /\.tab-beat-artwork \{[\s\S]*object-position: center !important;/);
    assert.match(beatCatalog, /\.tab-beat-file-status\.is-ready \{[\s\S]*color: var\(--ledger-blue/);
    assert.match(beatCatalog, /@media \(max-width: 760px\)[\s\S]*#tab-beats-grid\.beat-catalog-grid \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) !important;/);
    assert.doesNotMatch(beatCatalog, /linear-gradient|radial-gradient/);
});

test('el arranque directo mantiene el Studio en la columna principal', () => {
    const viewport = read('viewport-coherence.css');

    assert.match(viewport, /#app-container\.saas-workspace \.main-panel \{[\s\S]*grid-column: 1;[\s\S]*grid-row: 1;/);
    assert.match(viewport, /#app-container\.saas-workspace \.sidebar \{[\s\S]*grid-column: 2;[\s\S]*grid-row: 1;/);
    assert.match(viewport, /#app-container\.saas-workspace:has\(\.sidebar\.sidebar-hidden\) \{[\s\S]*grid-template-columns: minmax\(0, 1fr\) 0 !important;/);
});

test('la navegación móvil despeja el final de pantalla y cierra el menú Más al tocar fuera', () => {
    const mobile = read('mobile.css');
    const mobileStudio = read('mobile-studio.js');
    const dashboardHome = read('dashboard-home.css');

    assert.match(mobileStudio, /data-ledger-mobile-view="tab-invoicing"[\s\S]*Facturas SRI/);
    assert.match(mobileStudio, /document\.addEventListener\('pointerdown'/);
    assert.match(mobileStudio, /secondaryViews\.add\('tab-invoicing'\)/);
    assert.match(dashboardHome, /\.producer-home-shell \{[\s\S]*padding: 28px 0 calc\(115px \+ env\(safe-area-inset-bottom/);
    assert.match(mobile, /\.tab-content\.active,[\s\S]*padding: 12px 12px calc\(115px \+ env\(safe-area-inset-bottom/);
});

test('el login con Google preserva el gesto del usuario en móvil y evita redirecciones a dominios particionados', () => {
    const auth = read('auth.js');
    const firebaseCore = read('firebase-core.js');
    const vercel = JSON.parse(read('vercel.json'));

    // 1. Preservación del gesto de usuario (no deshabilitar de forma síncrona antes del popup)
    assert.match(auth, /let isGoogleAuthPending = false;/);
    assert.match(auth, /googleBtn\.setAttribute\('aria-busy', 'true'\);/);
    assert.doesNotMatch(
        auth.slice(auth.indexOf("googleBtn.addEventListener('click'"), auth.indexOf('signInWithPopup(auth, googleProvider)')),
        /googleBtn\.disabled\s*=\s*true|setButtonBusy\(googleBtn,\s*true/
    );

    // 2. No realizar signInWithRedirect ciego ante fallos de popup (evita error de storage partitioning)
    const googleCatchBlock = auth.slice(
        auth.indexOf('signInWithPopup(auth, googleProvider)'),
        auth.indexOf('// Abrir modal de login desde el Catálogo')
    );
    assert.doesNotMatch(googleCatchBlock, /signInWithRedirect\(auth,\s*googleProvider\)/);
    assert.match(auth, /case 'auth\/popup-blocked': return 'Tu navegador bloqueó la ventana de Google/);

    // 3. Selección de cuenta configurada en GoogleAuthProvider
    assert.match(firebaseCore, /googleProvider\.setCustomParameters\(\{\s*prompt:\s*['"]select_account['"]\s*\}\);/);

    // 4. Reverse-proxy de Firebase Auth configurado en vercel.json
    const authRewrite = vercel.rewrites.find(r => r.source === '/__/auth/:path*');
    assert.ok(authRewrite, 'vercel.json debe contener rewrite para /__/auth/:path*');
    assert.equal(authRewrite.destination, 'https://licencias-musicales.firebaseapp.com/__/auth/:path*');
});

