import './sonic-ledger.css';

/* Sonic Ledger public shell: Plataforma Integral de Música Independiente.
 * Diseñado con enfoque generalizado de producto: Catálogo, Licencias y Contratos,
 * Facturación SRI, Cobros Multi-Pasarela y Entrega Criptográfica de Archivos.
 */
const sonicLedgerMarkup = `
  <main class="ledger-home" id="ledger-home" aria-label="BEATSS">
    <a class="ledger-skip" href="#ledger-stack">Saltar al contenido</a>
    <div class="ledger-shell">
      <nav class="ledger-nav" aria-label="Navegación principal">
        <button class="ledger-brand" type="button" data-ledger-scroll="#ledger-overview"><span class="ledger-brand-mark">B</span><span>BEATSS<em>•</em></span></button>
        <div class="ledger-nav-links">
          <button type="button" data-ledger-scroll="#ledger-overview" aria-current="page">Inicio</button>
          <button type="button" data-ledger-action="catalog">Catálogo</button>
          <button type="button" data-ledger-scroll="#ledger-stack">Plataforma</button>
          <button type="button" data-ledger-scroll="#ledger-compare">Ventajas</button>
        </div>
        <button class="ledger-nav-cta" type="button" data-ledger-action="studio">
          <span class="ledger-nav-cta-label ledger-nav-cta-label-full">Entrar al Studio</span>
          <span class="ledger-nav-cta-label ledger-nav-cta-label-short">Entrar</span>
          <span aria-hidden="true">→</span>
        </button>
      </nav>

      <!-- Hero de Plataforma Integral -->
      <section class="ledger-hero" id="ledger-overview">
        <div class="ledger-hero-content">
          <p class="ledger-kicker"><b></b> INFRAESTRUCTURA PARA LA MÚSICA INDEPENDIENTE</p>
          <h1>Tu catálogo, tus licencias y tus cobros.<br><span>En una sola operación.</span></h1>
          <p class="ledger-intro">BEATSS unifica lo que antes requería múltiples herramientas dispersas: catálogo y venta directa de instrumentales, contratos legales con splits protegidos, cobros en Ecuador y el mundo, facturación SRI y entrega criptográfica de archivos.</p>
          <div class="ledger-actions">
            <button class="ledger-primary" type="button" data-ledger-action="catalog">Explorar catálogo <span aria-hidden="true">↗</span></button>
            <button class="ledger-secondary" type="button" data-ledger-action="studio">Abrir Studio <span aria-hidden="true">→</span></button>
          </div>
          <div class="ledger-proof-badges">
            <span>CATÁLOGO PROPIO</span>
            <span>·</span>
            <span>CONTRATOS BMI/ASCAP</span>
            <span>·</span>
            <span>PAGOS DEUNA! & TARJETA</span>
            <span>·</span>
            <span>FACTURACIÓN SRI</span>
          </div>
        </div>

        <!-- Vitrina Operativa Modular (Operating Stack) -->
        <div class="ledger-stack-showcase" aria-label="Arquitectura del registro operativo de BEATSS">
          <!-- Tarjeta 1: Contrato Legal Digital -->
          <article class="ledger-showcase-card card-contract">
            <div class="showcase-card-header">
              <div class="showcase-tag">CONTRATO DE LICENCIA</div>
              <div class="showcase-status"><span class="status-dot"></span> VIGENTE</div>
            </div>
            <div class="showcase-card-body">
              <div class="showcase-title">Licencia Premium WAV</div>
              <div class="showcase-meta">
                <span>Ref: <strong>BS3-8821</strong></span>
                <span>Split: <strong>50% Composición / 50% Master</strong></span>
              </div>
              <div class="showcase-clause">Distribución hasta 500,000 streams · Radio y videoclips autorizados · Registro BMI/ASCAP</div>
            </div>
          </article>

          <!-- Tarjeta 2: Cobro Multi-Pasarela & SRI -->
          <article class="ledger-showcase-card card-settlement">
            <div class="showcase-card-header">
              <div class="showcase-tag">COBRO & FACTURACIÓN</div>
              <div class="showcase-pill-green">PAGO CONFIRMADO</div>
            </div>
            <div class="showcase-card-body">
              <div class="showcase-payment-row">
                <span class="payment-method-chip">Deuna! QR / Tarjeta</span>
                <span class="payment-amount">$49.99 USD</span>
              </div>
              <div class="showcase-sri-badge">
                <span class="sri-icon">🧾</span>
                <div>
                  <strong>Factura Electrónica SRI (Solo Ecuador)</strong>
                  <small>RIDE generado · Clave de acceso autorizada</small>
                </div>
              </div>
            </div>
          </article>

          <!-- Tarjeta 3: Bóveda de Entrega Inmediata -->
          <article class="ledger-showcase-card card-vault">
            <div class="showcase-card-header">
              <div class="showcase-tag">BÓVEDA DE ENTREGA</div>
              <div class="showcase-status-cyan"><span class="status-dot-cyan"></span> TOKEN HMAC ACTIVO</div>
            </div>
            <div class="showcase-files-list">
              <div class="showcase-file-item"><span>🎵 Master WAV 24-Bit (Sin tag)</span><small>Listo</small></div>
              <div class="showcase-file-item"><span>📦 Trackout / Stems Separados</span><small>Comprimido</small></div>
              <div class="showcase-file-item"><span>📄 Contrato PDF firmado</span><small>Descargable</small></div>
            </div>
          </article>
        </div>
      </section>

      <!-- Barra de Métricas y Estándares -->
      <section class="ledger-metrics-strip" aria-label="Métricas y garantías de la plataforma">
        <div class="metric-item">
          <strong class="metric-value">100%</strong>
          <span class="metric-label">Validez contractual</span>
          <small class="metric-desc">Cláusulas estructuradas para registro internacional y sincronización.</small>
        </div>
        <div class="metric-item">
          <strong class="metric-value">SRI Directo</strong>
          <span class="metric-label">Facturación electrónica (Solo Ecuador)</span>
          <small class="metric-desc">Emisión automática de RIDE y XML legal en cada venta (exclusivo para Ecuador).</small>
        </div>
        <div class="metric-item">
          <strong class="metric-value">Multi-Pasarela</strong>
          <span class="metric-label">Cobros locales y globales</span>
          <small class="metric-desc">Deuna! QR en Ecuador, tarjetas de débito/crédito y PayPal.</small>
        </div>
        <div class="metric-item">
          <strong class="metric-value">Anti-Filtración</strong>
          <span class="metric-label">Entrega criptográfica</span>
          <small class="metric-desc">Tokens privados temporales con firma HMAC para proteger tus masters.</small>
        </div>
      </section>

      <!-- Grid Bento: Los 4 Pilares de la Plataforma -->
      <section class="ledger-platform-section" id="ledger-stack">
        <div class="ledger-section-head">
          <div>
            <p class="ledger-kicker"><b></b> LA ARQUITECTURA DEL SISTEMA</p>
            <h2>La infraestructura completa<br>para monetizar tu música.</h2>
          </div>
          <p>Se acabaron los archivos perdidos en chats y las ventas sin respaldo legal. Cada instrumental opera como un activo digital formalmente registrado.</p>
        </div>

        <div class="ledger-bento-grid">
          <!-- Pilar 1 -->
          <article class="ledger-bento-card">
            <span class="bento-num">01 / DISTRIBUCIÓN</span>
            <h3>Catálogo público y storefront directo</h3>
            <p>Expón tus producciones con metadatos completos: BPM, escala tonal, género musical y etiquetas de estilo. Enlaces canónicos listos para compartir con artistas y sellos.</p>
            <div class="bento-footer">
              <button class="bento-link" type="button" data-ledger-action="catalog">Explorar catálogo público →</button>
            </div>
          </article>

          <!-- Pilar 2 -->
          <article class="ledger-bento-card">
            <span class="bento-num">02 / LICENCIAMIENTO</span>
            <h3>Studio legal de contratos automatizados</h3>
            <p>Genera acuerdos no exclusivos y exclusivos en PDF con validez formal. Configura límites de streaming, presentaciones en vivo, radio y splits editoriales sin depender de abogados.</p>
            <div class="bento-footer">
              <button class="bento-link" type="button" data-ledger-action="studio">Abrir Studio de licencias →</button>
            </div>
          </article>

          <!-- Pilar 3 -->
          <article class="ledger-bento-card">
            <span class="bento-num">03 / LIQUIDACIÓN</span>
            <h3>Cobros sin fronteras para LATAM y el mundo</h3>
            <p>Derriba la barrera del pago. Permite a los artistas de Ecuador pagar en segundos con el QR de su app bancaria (Deuna!) o con tarjeta y PayPal a compradores internacionales.</p>
            <div class="bento-chips">
              <span>Deuna! QR</span>
              <span>Tarjetas débito / crédito</span>
              <span>PayPal Live</span>
            </div>
          </article>

          <!-- Pilar 4 -->
          <article class="ledger-bento-card">
            <span class="bento-num">04 / CUMPLIMIENTO</span>
            <h3>Entrega inmediata y facturación SRI (Solo Ecuador)</h3>
            <p>La entrega es automática y segura: al confirmarse el cobro, el cliente recibe un portal firmado para descargar sus masters y, para operaciones en Ecuador, su factura electrónica autorizada por el SRI.</p>
            <div class="bento-chips">
              <span>RIDE y XML (Solo Ecuador)</span>
              <span>Tokens HMAC</span>
              <span>Historial trazable</span>
            </div>
          </article>
        </div>
      </section>

      <!-- Sección de Comparativa: Informal vs BEATSS -->
      <section class="ledger-compare-section" id="ledger-compare">
        <div class="ledger-section-head">
          <div>
            <p class="ledger-kicker"><b></b> LA DIFERENCIA OPERATIVA</p>
            <h2>Venta informal vs. Operación profesional.</h2>
          </div>
          <p>Compara el desorden de operar por mensajes contra la certeza de un registro automatizado.</p>
        </div>

        <div class="ledger-compare-grid">
          <div class="compare-card compare-legacy">
            <div class="compare-header">
              <span class="compare-badge-legacy">VENTA POR CHAT / INFORMAL</span>
              <h3>El riesgo habitual</h3>
            </div>
            <ul class="compare-list">
              <li><span class="icon-cross">✕</span> Enlaces de Google Drive o WeTransfer que caducan o se filtran sin control.</li>
              <li><span class="icon-cross">✕</span> Acuerdos verbales sin validez legal que causan disputas por regalías y copyright.</li>
              <li><span class="icon-cross">✕</span> Pérdida de ventas: artistas locales sin tarjeta de crédito internacional no pueden comprar.</li>
              <li><span class="icon-cross">✕</span> Sin comprobante tributario ni registro contable de ingresos para el productor.</li>
            </ul>
          </div>

          <div class="compare-card compare-beatss">
            <div class="compare-header">
              <span class="compare-badge-beatss">CON BEATSS</span>
              <h3>La operación profesional</h3>
            </div>
            <ul class="compare-list">
              <li><span class="icon-check">✓</span> Bóveda de entrega con enlace privado firmado criptográficamente anti-leaks.</li>
              <li><span class="icon-check">✓</span> Contrato formal en PDF con splits protegidos para registro en BMI / ASCAP.</li>
              <li><span class="icon-check">✓</span> Cobro instantáneo con Deuna! QR directo, tarjetas locales e internacionales y PayPal.</li>
              <li><span class="icon-check">✓</span> Emisión automática de facturación electrónica SRI para ventas en Ecuador (RIDE y XML autorizados).</li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Banner de Cierre / Call to Action -->
      <section class="ledger-cta-banner" aria-label="Comenzar con BEATSS">
        <div class="cta-banner-content">
          <p class="ledger-kicker kicker-light"><b></b> EMPIEZA A OPERAR HOY</p>
          <h2>Haz de tu música un negocio formal y escalable.</h2>
          <p>Catálogo, contratos, pasarelas de pago y entrega automatizada en una sola plataforma diseñada para productores y artistas independientes.</p>
          <div class="ledger-actions">
            <button class="ledger-primary-light" type="button" data-ledger-action="studio">Abrir Studio / Entrar →</button>
            <button class="ledger-secondary-light" type="button" data-ledger-action="catalog">Ver catálogo disponible ↗</button>
          </div>
        </div>
      </section>

      <footer class="ledger-footer">
        <span>BEATSS</span>
        <span>CATÁLOGO · CONTRATOS LEGALES · FACTURACIÓN SRI · COBROS MULTI-PASARELA</span>
        <span>ESMERALDAS, ECUADOR</span>
        <span class="ledger-vibe-credit">
          <strong>Creado con Vibe Coding</strong>
          <small>Diseñado para la música independiente</small>
        </span>
      </footer>
    </div>
  </main>`;

function renderSonicLedgerHome() {
    // El panel de progreso pertenece sólo al Studio. Si una navegación o una
    // caché conservó su estado visual, Inicio debe limpiarlo antes de montar
    // contenido público para no aparentar que se está enviando una licencia.
    const deliveryProgress = document.getElementById('email-progress-modal');
    if (deliveryProgress) {
        deliveryProgress.hidden = true;
        deliveryProgress.style.display = 'none';
        deliveryProgress.setAttribute('aria-hidden', 'true');
    }
    const landingMount = document.getElementById('landing-shell-root');
    if (!landingMount || document.getElementById('ledger-home')) return;
    // Remove legacy landing fragments before mounting the new shell. Keeping
    // them hidden is not enough: their styles and inline handlers can still
    // flash during route changes or be picked up by global observers.
    document.querySelectorAll('#landing-page > :not(#landing-shell-root)').forEach((node) => node.remove());
    landingMount.outerHTML = sonicLedgerMarkup;
    const home = document.getElementById('ledger-home');
    if (!home) return;

    // La página pública sólo se hace visible después de reemplazar por completo
    // el HTML histórico. Así, si Firebase tarda en resolver la sesión, se ve
    // una landing terminada y nunca contenido sin estilos ni una pantalla vacía.
    const landing = document.getElementById('landing-page');
    if (landing && !window.currentUser) {
        landing.style.display = 'block';
        landing.setAttribute('aria-hidden', 'false');
        landing.inert = false;
        document.body.classList.add('landing-active');
    }
    requestAnimationFrame(() => window.dismissBeatssBootScreen?.());

    const withApp = (action) => {
        const ready = typeof window.ensureBeatssApp === 'function'
            ? window.ensureBeatssApp()
            : Promise.resolve();
        return Promise.resolve(ready).then(action);
    };
    const withAuth = (action) => {
        const ready = typeof window.ensureBeatssAuth === 'function'
            ? window.ensureBeatssAuth()
            : withApp(() => undefined);
        return Promise.resolve(ready).then(action);
    };
    // Una primera interacción puede terminar de importar la app al mismo tiempo
    // que Firebase restaura la sesión. Conservamos la intención para que el
    // callback de Auth no vuelva a ocultar el catálogo o el modal recién abierto.
    const runPublicAction = (intent, action) => {
        window.beatssPendingPublicAction = intent;
        return withApp(() => {
            action();
            if (window.beatssAuthStateResolved) window.beatssPendingPublicAction = null;
        });
    };
    const goToSossaStore = () => window.location.assign('/tienda/sossa');
    const goToStudio = () => {
        window.beatssPendingPublicAction = 'login';
        if (window.currentUser) return withApp(() => {
            window.showAppView?.('home');
            if (window.beatssAuthStateResolved) window.beatssPendingPublicAction = null;
        });
        return withAuth(() => window.openAuthModal?.('login'));
    };
    const warmApp = () => { void window.ensureBeatssApp?.(); };
    const bindAction = (button, action) => {
        const warm = action === goToStudio
            ? () => { void window.ensureBeatssAuth?.(); }
            : action === goToSossaStore ? () => {} : warmApp;
        button.addEventListener('pointerenter', warm, { once: true });
        button.addEventListener('focus', warm, { once: true });
        button.addEventListener('touchstart', warm, { once: true, passive: true });
        button.addEventListener('click', action);
    };
    home.querySelectorAll('[data-ledger-action="catalog"]').forEach((button) => bindAction(button, goToSossaStore));
    home.querySelectorAll('[data-ledger-action="studio"]').forEach((button) => bindAction(button, goToStudio));
    home.querySelectorAll('[data-ledger-scroll]').forEach((button) => button.addEventListener('click', () => {
        home.querySelector(button.dataset.ledgerScroll)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    }));
}

// Este módulo se carga como script diferido: el HTML ya está parseado y la
// landing puede aparecer antes de descargar Firebase y el panel privado.
if (document.getElementById('landing-shell-root')) renderSonicLedgerHome();
else document.addEventListener('DOMContentLoaded', renderSonicLedgerHome, { once: true });
