import './sonic-ledger.css';

/* Sonic Ledger public shell. It delegates to the existing BEATSS actions. */
const sonicLedgerMarkup = `
  <main class="ledger-home" id="ledger-home" aria-label="BEATSS">
    <a class="ledger-skip" href="#ledger-route">Saltar al contenido</a>
    <div class="ledger-shell">
      <nav class="ledger-nav" aria-label="Navegación principal">
        <button class="ledger-brand" type="button" data-ledger-scroll="#ledger-overview"><span class="ledger-brand-mark">B</span><span>BEATSS<em>•</em></span></button>
        <div class="ledger-nav-links"><button type="button" data-ledger-scroll="#ledger-overview" aria-current="page">Inicio</button><button type="button" data-ledger-action="catalog">Catálogo</button><button type="button" data-ledger-scroll="#ledger-route">Cómo funciona</button></div>
        <button class="ledger-nav-cta" type="button" data-ledger-action="studio"><span class="ledger-nav-cta-label ledger-nav-cta-label-full">Abrir operación</span><span class="ledger-nav-cta-label ledger-nav-cta-label-short">Entrar</span><span aria-hidden="true">→</span></button>
      </nav>

      <section class="ledger-hero" id="ledger-overview">
        <div>
          <p class="ledger-kicker"><b></b> Licencias, ventas y entregas</p>
          <h1>Tu beat no termina cuando lo exportas.<br><span>Empieza a operar.</span></h1>
          <p class="ledger-intro">BEATSS convierte cada beat en una venta ordenada: catálogo, licencia, pago y archivos en un mismo registro.</p>
          <div class="ledger-actions"><button class="ledger-primary" type="button" data-ledger-action="studio">Crear una licencia <span aria-hidden="true">→</span></button><button class="ledger-secondary" type="button" data-ledger-action="catalog">Ver catálogo <span aria-hidden="true">↗</span></button></div>
          <p class="ledger-proofline">HECHO PARA PRODUCTORES, ARTISTAS Y EQUIPOS INDEPENDIENTES</p>
        </div>
        <article class="ledger-operation-card" aria-label="Ejemplo de una operación musical activa">
          <div class="ledger-card-label"><span>OPERACIÓN / 024</span><span class="ledger-live">LISTA</span></div>
          <div class="ledger-track"><small>Beat publicado</small><h2>OOUUHH</h2><div class="ledger-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="ledger-track-footer"><b>Dancehall</b><span>96 BPM</span><span>Licencia disponible</span></div></div>
        </article>
      </section>

      <section class="ledger-route" id="ledger-route">
        <div class="ledger-section-head"><div><p class="ledger-kicker"><b></b> La operación completa</p><h2>Una ruta clara<br>para cada beat.</h2></div><p>Los derechos, el pago y los archivos no tienen por qué quedar repartidos entre mensajes, carpetas y documentos aislados.</p></div>
        <div class="ledger-route-grid"><article class="ledger-stage"><span>01 / PUBLICA</span><h3>Catálogo</h3><p>Sube audio, arte y detalles de tu beat para ponerlo disponible.</p></article><article class="ledger-stage"><span>02 / DEFINE</span><h3>Licencia</h3><p>Elige condiciones y genera un contrato que explica cada uso.</p></article><article class="ledger-stage"><span>03 / COBRA</span><h3>Pago</h3><p>Registra la venta con la opción de cobro disponible para tu negocio.</p></article><article class="ledger-stage"><span>04 / ENTREGA</span><h3>Archivos</h3><p>Conserva la licencia y los enlaces autorizados para el comprador.</p></article></div>
      </section>

      <section class="ledger-utility" aria-label="Herramientas de BEATSS">
        <article class="ledger-utility-main"><p class="ledger-kicker"><b></b> Tu mesa de control</p><h2>Haz seguimiento sin perseguir nada.</h2><div class="ledger-utility-row"><span class="ledger-utility-index">01</span><div><b>Catálogo público</b><small>Beats preparados para ser descubiertos y licenciados.</small></div><button type="button" data-ledger-action="catalog">Abrir →</button></div><div class="ledger-utility-row"><span class="ledger-utility-index">02</span><div><b>Studio de licencias</b><small>Contratos, clientes e historial de cada operación.</small></div><button type="button" data-ledger-action="studio">Entrar →</button></div><div class="ledger-utility-row"><span class="ledger-utility-index">03</span><div><b>Ventas y entrega</b><small>Pedidos, archivos autorizados y estado de cobro.</small></div><button type="button" data-ledger-action="studio">Gestionar →</button></div></article>
        <aside class="ledger-utility-side"><p class="ledger-kicker"><b></b> BEATSS</p><h2>Menos trabajo manual. Más música publicada.</h2><p>La infraestructura operativa para que un beat pueda convertirse en una venta clara y trazable.</p><button type="button" data-ledger-action="studio">Entrar a mi operación →</button></aside>
      </section>

      <footer class="ledger-footer"><span>BEATSS</span><span>CATÁLOGO · LICENCIAS · COBROS · ENTREGAS</span><span>ESMERALDAS, ECUADOR</span><span class="ledger-vibe-credit"><strong>Creado con Vibe Coding</strong></span></footer>
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
