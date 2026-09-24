import './license-guide.css';
import { LICENSE_CONFIGS } from './config.js';

const GUIDE_PATH = '/guia-licencias';
const STORE_PATH = '/tienda/sossa';

const LICENSE_META = Object.freeze({
    basic: {
        label: 'Básica',
        badge: 'NO EXCLUSIVA',
        accent: 'blue',
        summary: 'Para un lanzamiento inicial con MP3 y límites definidos.',
        note: 'Al terminar el plazo o alcanzar un límite, necesitas renovar o ampliar antes de seguir explotando la canción.'
    },
    premium: {
        label: 'Premium',
        badge: 'NO EXCLUSIVA',
        accent: 'indigo',
        summary: 'Incluye WAV y aumenta los límites de reproducción, copias y video.',
        note: 'Recibir WAV mejora el trabajo de mezcla y masterización, pero no elimina los límites de la licencia.'
    },
    premium_plus: {
        label: 'Premium Plus',
        badge: 'NO EXCLUSIVA',
        accent: 'violet',
        summary: 'Añade stems/trackouts y una vigencia perpetua.',
        note: 'Los stems permiten mezclar por pistas o grupos. No transfieren la propiedad del beat ni se pueden revender.'
    },
    unlimited_flp: {
        label: 'Ilimitada',
        badge: 'NO EXCLUSIVA',
        accent: 'teal',
        summary: 'Mayor alcance no exclusivo con MP3, WAV y stems.',
        note: 'La configuración contractual vigente no promete el proyecto FL Studio en este nivel. El FLP aparece expresamente sólo en la Exclusiva.'
    },
    exclusive: {
        label: 'Exclusiva',
        badge: 'EXCLUSIVA',
        accent: 'amber',
        summary: 'Detiene nuevas licencias después de la fecha efectiva e incluye el proyecto FLP.',
        note: 'No borra las licencias válidas vendidas antes. Esos compradores conservan sus derechos y deben quedar en lista blanca cuando corresponda.'
    }
});

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    })[character]);
}

function setVisible(element, visible) {
    if (!element) return;
    element.style.display = visible ? 'block' : 'none';
    element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    element.inert = !visible;
}

function showGuideShell() {
    [
        'landing-page',
        'app-container',
        'global-catalog-view',
        'buyer-download-view',
        'public-store-view',
        'public-purchase-view',
        'login-modal'
    ].forEach((id) => setVisible(document.getElementById(id), false));

    const guide = document.getElementById('public-license-guide-view');
    setVisible(guide, true);
    document.body.classList.remove('landing-active');
    document.body.dataset.beatssView = 'license-guide';
    window.dismissBeatssBootScreen?.();
    return guide;
}

function updateDocumentMetadata() {
    document.title = 'Guía de licencias para compradores · BEATSS';
    const description = document.querySelector('meta[name="description"]');
    if (description) {
        description.content = 'Compara las licencias Básica, Premium, Premium Plus, Ilimitada y Exclusiva de BEATSS antes de comprar un beat.';
    }
}

function metric(label, value) {
    return `<div class="license-guide-metric"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function licenseCard(type) {
    const config = LICENSE_CONFIGS[type];
    const meta = LICENSE_META[type];
    if (!config || !meta) return '';
    const isExclusive = type === 'exclusive';
    const ambiguity = type === 'premium_plus' || type === 'unlimited_flp'
        ? '<p class="license-guide-card__clarification"><strong>Aclaración:</strong> la configuración muestra 100.000.000 y también la palabra “Ilimitados”. Confirma el límite literal en el contrato de tu orden.</p>'
        : '';

    return `
        <article class="license-guide-card license-guide-card--${meta.accent}" id="licencia-${type.replace('_flp', '')}">
            <div class="license-guide-card__topline">
                <span class="license-guide-card__badge">${escapeHtml(meta.badge)}</span>
                <span class="license-guide-card__number">${escapeHtml(isExclusive ? '05' : ({ basic: '01', premium: '02', premium_plus: '03', unlimited_flp: '04' })[type])}</span>
            </div>
            <h3>${escapeHtml(meta.label)}</h3>
            <p class="license-guide-card__summary">${escapeHtml(meta.summary)}</p>
            <dl class="license-guide-card__metrics">
                ${metric('Archivos', config.formats)}
                ${metric('Streams', config.streams)}
                ${metric('Copias', config.physical)}
                ${metric('Video', `${config.videos} · ${config.videoDuration}`)}
                ${metric('Vigencia', config.years)}
                ${metric('Content ID', config.contentId ? 'Prohibido sin permiso escrito' : 'Uso controlado')}
            </dl>
            ${ambiguity}
            <p class="license-guide-card__note">${escapeHtml(meta.note)}</p>
        </article>`;
}

function renderGuide() {
    const guide = showGuideShell();
    if (!guide) return;
    updateDocumentMetadata();

    guide.innerHTML = `
        <header class="license-guide-header">
            <a class="license-guide-brand" href="${STORE_PATH}" aria-label="Ir a la tienda de Sossa">
                <img src="/logo.png" alt="" width="52" height="26">
                <span>BEATSS</span>
            </a>
            <nav aria-label="Acciones de la guía">
                <a class="license-guide-header__store" href="${STORE_PATH}">Ver beats</a>
                <button class="license-guide-share" type="button" data-license-guide-share aria-describedby="license-guide-share-status">
                    <span aria-hidden="true">↗</span> Compartir
                </button>
            </nav>
        </header>

        <main>
            <section class="license-guide-hero" aria-labelledby="license-guide-title">
                <div class="license-guide-hero__copy">
                    <p class="license-guide-kicker">GUÍA PARA COMPRADORES</p>
                    <h1 id="license-guide-title">Entiende tu licencia <span>antes de lanzar.</span></h1>
                    <p>Compara archivos, streams, copias, videos, vigencia, Content ID y derechos. Lee lo importante antes de pagar por un beat.</p>
                    <div class="license-guide-hero__actions">
                        <a class="license-guide-primary" href="#comparacion">Comparar licencias</a>
                        <a class="license-guide-secondary" href="${STORE_PATH}">Ir a la tienda</a>
                    </div>
                    <p id="license-guide-share-status" class="license-guide-share-status" role="status" aria-live="polite"></p>
                </div>
                <aside class="license-guide-contract-rule">
                    <span>REGLA PRINCIPAL</span>
                    <strong>Tu contrato PDF es el documento que manda.</strong>
                    <p>Debe mostrar el beat, comprador, precio, fecha, referencia y límites de tu orden. Esta página te ayuda a comparar, pero no reemplaza ese contrato.</p>
                </aside>
            </section>

            <nav class="license-guide-jump" aria-label="Contenido de la guía">
                <a href="#comparacion">Licencias</a>
                <a href="#reglas">Reglas comunes</a>
                <a href="#derechos">Derechos</a>
                <a href="#compra">Compra segura</a>
                <a href="#checklist">Checklist</a>
            </nav>

            <section class="license-guide-section" id="comparacion" aria-labelledby="comparison-title">
                <div class="license-guide-section__heading">
                    <p>01 · COMPARACIÓN</p>
                    <h2 id="comparison-title">Cinco licencias. Un alcance distinto.</h2>
                    <span>El precio final puede variar por beat. Revisa siempre el checkout y el contrato de tu orden.</span>
                </div>
                <div class="license-guide-grid">
                    ${['basic', 'premium', 'premium_plus', 'unlimited_flp', 'exclusive'].map(licenseCard).join('')}
                </div>
            </section>

            <section class="license-guide-section license-guide-section--soft" id="reglas" aria-labelledby="rules-title">
                <div class="license-guide-section__heading">
                    <p>02 · REGLAS COMUNES</p>
                    <h2 id="rules-title">Lo que todas las licencias exigen.</h2>
                </div>
                <div class="license-guide-rule-grid">
                    <article><span>01</span><h3>Una canción</h3><p>La licencia permite crear una nueva canción derivada con el beat. No permite revender el instrumental original.</p></article>
                    <article><span>02</span><h3>Uso personal</h3><p>No puedes vender, ceder, sublicenciar ni transferir la licencia a un sello o tercero sin permiso escrito.</p></article>
                    <article><span>03</span><h3>Crédito obligatorio</h3><p>Usa “Producido por sossa” o “Prod. por sossa”, salvo que tu contrato indique otra forma exacta.</p></article>
                    <article><span>04</span><h3>Límites acumulados</h3><p>Streams, copias, videos y plazo se cuentan durante la explotación. Amplía la licencia antes de superarlos.</p></article>
                </div>
                <div class="license-guide-warning">
                    <strong>No exclusiva vs. exclusiva</strong>
                    <p>En Básica, Premium, Premium Plus e Ilimitada, el productor conserva el beat y puede seguir licenciándolo. La Exclusiva detiene nuevas licencias después de su fecha efectiva, pero respeta las licencias válidas anteriores.</p>
                </div>
            </section>

            <section class="license-guide-section" id="derechos" aria-labelledby="rights-title">
                <div class="license-guide-section__heading">
                    <p>03 · DERECHOS Y REGALÍAS</p>
                    <h2 id="rights-title">Master, composición y Content ID no son lo mismo.</h2>
                </div>
                <div class="license-guide-rights">
                    <article>
                        <p class="license-guide-rights__eyebrow">MASTER DE TU CANCIÓN</p>
                        <strong>100% de los ingresos netos para el comprador*</strong>
                        <p>La plantilla vigente concede esos ingresos dentro de los límites de la licencia, salvo que exista un split sheet u otro acuerdo específico. No equivale a poseer el master original del beat.</p>
                    </article>
                    <article>
                        <p class="license-guide-rights__eyebrow">COMPOSICIÓN / PUBLISHING</p>
                        <strong>50% artista · 50% productor*</strong>
                        <p>Registra exactamente los nombres, porcentajes e identificadores del contrato. Un acuerdo firmado más específico puede cambiar este reparto.</p>
                    </article>
                    <article>
                        <p class="license-guide-rights__eyebrow">CONTENT ID</p>
                        <strong>Prohibido en licencias no exclusivas</strong>
                        <p>La Exclusiva permite uso controlado sobre la canción final, sin reclamar el instrumental y manteniendo en whitelist a compradores anteriores legítimos.</p>
                    </article>
                </div>
                <p class="license-guide-footnote">* Siempre prevalecen el contrato individual y cualquier split sheet firmado aplicable.</p>
            </section>

            <section class="license-guide-section license-guide-section--dark" id="compra" aria-labelledby="purchase-title">
                <div class="license-guide-section__heading">
                    <p>04 · COMPRA Y ENTREGA</p>
                    <h2 id="purchase-title">Una orden abierta no es una licencia válida.</h2>
                </div>
                <ol class="license-guide-timeline">
                    <li><span>1</span><div><strong>Revisa</strong><p>Confirma beat, licencia, precio, archivos, límites, porcentajes y tus datos.</p></div></li>
                    <li><span>2</span><div><strong>Acepta</strong><p>Lee la licencia seleccionada y los términos antes de continuar al pago.</p></div></li>
                    <li><span>3</span><div><strong>Espera confirmación</strong><p>La pantalla de pago, una captura o una orden pendiente no prueban que el pago fue aprobado.</p></div></li>
                    <li><span>4</span><div><strong>Guarda la entrega</strong><p>Conserva el contrato PDF, código de referencia, recibo/factura y todos los archivos.</p></div></li>
                </ol>
                <div class="license-guide-dark-notes">
                    <article><strong>Mejoras</strong><p>Antes de alcanzar un límite, solicita una ampliación. Si hubo una exclusiva posterior, la mejora sólo protege al comprador original, el mismo beat y la misma canción.</p></article>
                    <article><strong>Terminación no exclusiva</strong><p>La plantilla reserva al productor una opción durante los primeros 3 años, con aviso escrito e indemnización del 200% de la tarifa original; el comprador tendría 7 días para retirar la canción.</p></article>
                    <article><strong>Incumplimiento</strong><p>Exceder límites, ceder sin permiso, omitir crédito o registrar Content ID cuando está prohibido puede causar rescisión sin reembolso y responsabilidad por daños.</p></article>
                </div>
            </section>

            <section class="license-guide-section" id="checklist" aria-labelledby="checklist-title">
                <div class="license-guide-section__heading">
                    <p>05 · CHECKLIST</p>
                    <h2 id="checklist-title">Antes y después de pagar.</h2>
                </div>
                <div class="license-guide-checklists">
                    <article>
                        <h3>Antes de pagar</h3>
                        <ul>
                            <li>Beat y productor correctos.</li>
                            <li>Licencia, precio final y moneda.</li>
                            <li>Archivos prometidos y disponibles.</li>
                            <li>Streams, copias, videos, plazo y Content ID.</li>
                            <li>Split de composición y cualquier split de master.</li>
                            <li>En Exclusiva: licencias previas, whitelist, FLP y fecha efectiva.</li>
                            <li>Nombre, correo, identificación y datos fiscales correctos.</li>
                        </ul>
                    </article>
                    <article>
                        <h3>Después de pagar</h3>
                        <ul>
                            <li>Estado aprobado del pago.</li>
                            <li>Contrato PDF legible y sin campos pendientes.</li>
                            <li>Código de referencia único.</li>
                            <li>Recibo o factura cuando corresponda.</li>
                            <li>Descarga de todos los formatos prometidos.</li>
                            <li>Copia de seguridad del contrato, recibo y archivos.</li>
                            <li>Crédito del productor en metadatos y publicación.</li>
                        </ul>
                    </article>
                </div>
            </section>

            <section class="license-guide-cta" aria-label="Comprar beats">
                <p>YA SABES QUÉ REVISAR</p>
                <h2>Elige un beat con la licencia correcta para tu lanzamiento.</h2>
                <div>
                    <a class="license-guide-primary" href="${STORE_PATH}">Ver catálogo de Sossa</a>
                    <button class="license-guide-secondary" type="button" data-license-guide-share>Compartir esta guía</button>
                </div>
            </section>
        </main>

        <footer class="license-guide-footer">
            <a class="license-guide-brand" href="${STORE_PATH}"><img src="/logo.png" alt="" width="44" height="22"><span>BEATSS</span></a>
            <p>Guía informativa basada en la configuración contractual vigente al 24 de septiembre de 2026. No confirma un pago ni reemplaza el contrato de una compra concreta.</p>
            <a href="${STORE_PATH}">Tienda de Sossa</a>
        </footer>`;

    guide.querySelectorAll('[data-license-guide-share]').forEach((button) => {
        button.addEventListener('click', shareGuide);
    });
}

async function shareGuide() {
    const url = new URL(GUIDE_PATH, window.location.origin).toString();
    const payload = {
        title: 'Guía de licencias BEATSS',
        text: 'Lee qué incluye cada licencia de beat antes de comprar.',
        url
    };
    const status = document.getElementById('license-guide-share-status');
    try {
        if (navigator.share) {
            await navigator.share(payload);
            if (status) status.textContent = 'Guía compartida.';
            return;
        }
        await navigator.clipboard.writeText(url);
        if (status) status.textContent = 'Enlace copiado. Ya puedes enviarlo.';
    } catch (error) {
        if (error?.name === 'AbortError') return;
        if (status) status.textContent = `Copia este enlace: ${url}`;
    }
}

window.showAppView = (view) => {
    if (view === 'license-guide') return renderGuide();
    if (view === 'home' || view === 'store') return window.location.assign(STORE_PATH);
    window.location.assign(STORE_PATH);
};

renderGuide();
