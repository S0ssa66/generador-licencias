import { LICENSE_CONFIGS, SEED_LICENSES, DEFAULT_TEMPLATES } from './config.js';
import { TRANSLATIONS, UI_TRANSLATIONS } from './i18n.js';
import {
    createManualContractReference,
    getLicenseReferenceVersion,
    INVALID_REFERENCE_PREVIEW,
    isValidLicenseReference,
    normalizeLicenseReference,
    resolveLicenseReference
} from './license-reference.js';
import { 
    auth,
    googleProvider,
    linkWithPopup,
    unlink,
    db, 
    storage,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    collectionGroup,
    deleteDoc,
    addDoc,
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "./firebase.js";

// Alias locales para funciones en otros módulos asignadas al objeto global window
const checkPlanLimitExceeded = (...args) => window.checkPlanLimitExceeded(...args);
const autoSaveContact = (...args) => window.autoSaveContact(...args);
const saveCurrentLicenseToHistory = (...args) => window.saveCurrentLicenseToHistory(...args);
const saveHistory = (...args) => window.saveHistory(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const openSettingsModal = (...args) => window.openSettingsModal(...args);
const openPaymentModal = (...args) => window.openPaymentModal(...args);
const addCustomFieldRow = (...args) => window.addCustomFieldRow(...args);
const initDefaultDate = (...args) => window.initDefaultDate(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
const safeGetItem = (...args) => window.safeGetItem(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);
const showToast = (...args) => window.showToast?.(...args);

// `editor.js` es un ES module independiente de `main.js`: sus variables
// léxicas no se comparten. Estos puentes leen el estado vigente desde window
// en cada acceso, incluso cuando la configuración se actualiza después de que
// el editor ya fue cargado.
const producerConfig = new Proxy({}, {
    get(_target, property) {
        return (window.producerConfig || {})[property];
    },
    set(_target, property, value) {
        const config = window.producerConfig || {};
        config[property] = value;
        window.producerConfig = config;
        return true;
    }
});

const licenseHistory = new Proxy([], {
    get(_target, property) {
        const history = Array.isArray(window.licenseHistory) ? window.licenseHistory : [];
        const value = Reflect.get(history, property, history);
        return typeof value === 'function' ? value.bind(history) : value;
    },
    set(_target, property, value) {
        const history = Array.isArray(window.licenseHistory) ? window.licenseHistory : [];
        Reflect.set(history, property, value, history);
        window.licenseHistory = history;
        return true;
    }
});

function getEditorLanguage() {
    return window.currentLang === 'en' ? 'en' : 'es';
}

// El editor se carga como un modulo independiente. Por eso no puede depender
// de la variable lexical `activeTemplates` declarada en main.js: las variables
// de un ES module no son visibles dentro de otro. Mantener una copia propia con
// las plantillas base garantiza que el primer contrato pueda renderizarse aun
// antes de terminar la carga de personalizaciones del productor.
let activeTemplates = DEFAULT_TEMPLATES.map(template => ({ ...template }));
if (typeof window !== 'undefined') {
    window.activeTemplates = activeTemplates;
}

export function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
if (typeof window !== 'undefined') {
    window.escapeHtml = escapeHtml;
}

function getRequiredManualReference() {
    const input = document.getElementById('ref-code');
    const reference = normalizeLicenseReference(input?.value);
    if (isValidLicenseReference(reference)) {
        if (input && input.value !== reference) input.value = reference;
        return reference;
    }

    showToast('Asigna un código de referencia válido antes de generar, guardar o enviar una licencia. Un borrador sin referencia no es un documento oficial.', true);
    input?.focus();
    return '';
}


// Helper to dynamically load external scripts inside module scope
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

async function ensureGoogleIdentityServices() {
    if (window.google?.accounts?.oauth2) return;
    await loadScript('https://accounts.google.com/gsi/client');
    if (!window.google?.accounts?.oauth2) {
        throw new Error('Google Identity Services no cargó. Verifica tu conexión a Internet.');
    }
}


// ==================== EDITOR BLOCK 1 ====================
function selectLicenseType(type) {
    const config = LICENSE_CONFIGS[type];
    if (!config) return;

    // Actualizar campos principales
    document.getElementById('license-value').value = config.price;
    
    // Una licencia ya iniciada conserva su referencia al cambiar de nivel. Si
    // el formulario es nuevo, se asigna el formato público v2 antes de emitir.
    const referenceInput = document.getElementById('ref-code');
    if (referenceInput && !isValidLicenseReference(referenceInput.value)) {
        referenceInput.value = generateReferenceCode(type);
    }

    // Actualizar cláusulas avanzadas
    document.getElementById('clause-formats').value = config.formats;
    document.getElementById('clause-streams').value = config.streams;
    document.getElementById('clause-physical').value = config.physical;
    document.getElementById('clause-videos').value = config.videos;
    document.getElementById('clause-video-duration').value = config.videoDuration;
    document.getElementById('clause-years').value = config.years;
    
    // Calcular multa de rescisión (200% del precio)
    const doublePrice = (config.price * 2).toFixed(2);
    let terminationFeeText = "";
    if (type === 'exclusive') {
        terminationFeeText = "No aplica (Exclusivo)";
    } else {
        terminationFeeText = `200% de la Tarifa de Licencia pagada originalmente (un total de $${doublePrice} USD)`;
    }
    document.getElementById('clause-termination-fee').value = terminationFeeText;
    
    document.getElementById('clause-writer-share').value = config.writerShare;
    document.getElementById('clause-producer-share').value = config.producerShare;
    
    // Hacer dinámico según el aka del productor actual
    const producerAka = producerConfig.aka || 'Productor';
    const creditsStr = `"Producido por ${producerAka}" o "Prod. por ${producerAka}"`;
    document.getElementById('clause-credits').value = creditsStr;
    document.getElementById('clause-content-id').checked = config.contentId;

    // Mostrar/ocultar botón DocuSign según el tipo
    const docusignBtn = document.getElementById('btn-docusign');
    if (docusignBtn) {
        docusignBtn.style.display = (type === 'exclusive') ? 'flex' : 'none';
    }

    generatePreview();
}

// Generar el código público que verá el cliente. No incluye correos, IDs de
// pago ni el ID interno de Firestore; esos datos se trazan por separado.
function generateReferenceCode(type) {
    try {
        return createManualContractReference({ licenseType: type });
    } catch (error) {
        console.error('No se pudo crear una referencia segura:', error);
        showToast('No se pudo generar un código seguro. Actualiza el navegador antes de emitir una licencia.', true);
        return '';
    }
}

// Convertir número a texto en español para contratos legales
function numeroALetras(num) {
    const decs = Math.round((num - Math.floor(num)) * 100);
    const entero = Math.floor(num);
    
    const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
    const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const especiales = {
        11: 'once', 12: 'doce', 13: 'trece', 14: 'catorce', 15: 'quince',
        16: 'dieciséis', 17: 'diecisiete', 18: 'dieciocho', 19: 'diecinueve',
        21: 'veintiuno', 22: 'veintidós', 23: 'veintitrés', 24: 'veinticuatro',
        25: 'veinticinco', 26: 'veintiséis', 27: 'veintisiete', 28: 'veintiocho', 29: 'veintinueve'
    };
    const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

    function convertirGrupo(n) {
        if (n === 0) return 'cero';
        if (n === 100) return 'cien';
        let output = '';
        if (n >= 100) {
            output += centenas[Math.floor(n / 100)] + ' ';
            n %= 100;
        }
        if (n > 0) {
            if (especiales[n]) {
                output += especiales[n];
            } else {
                let dec = Math.floor(n / 10);
                let uni = n % 10;
                if (dec > 0) {
                    output += decenas[dec];
                    if (uni > 0) output += ' y ';
                }
                if (uni > 0) {
                    output += unidades[uni];
                }
            }
        }
        return output.trim();
    }

    let result = '';
    if (entero === 0) {
        result = 'cero';
    } else if (entero < 1000) {
        result = convertirGrupo(entero);
    } else {
        let mil = Math.floor(entero / 1000);
        let resto = entero % 1000;
        if (mil === 1) {
            result = 'mil ';
        } else {
            result = convertirGrupo(mil) + ' mil ';
        }
        if (resto > 0) {
            result += convertirGrupo(resto);
        }
    }
    
    result = result.trim();
    
    if (decs > 0) {
        let decsTexto = especiales[decs] || (decenas[Math.floor(decs / 10)] + (decs % 10 > 0 ? ' y ' + unidades[decs % 10] : ''));
        return `${result} con ${decsTexto.trim()} centavos`;
    }
    return result;
}

// Formatear fecha en formato formal en español
function formatFechaEspanol(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const diaSemana = dias[date.getDay()];
    const diaMes = String(date.getDate()).padStart(2, '0');
    const mes = meses[date.getMonth()];
    const anio = date.getFullYear();
    
    return `${diaSemana}, ${diaMes} de ${mes} de ${anio}`;
}

function formatFechaIngles(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const dayName = days[date.getDay()];
    const month = months[date.getMonth()];
    const day = date.getDate();
    const year = date.getFullYear();
    
    return `${dayName}, ${month} ${day}, ${year}`;
}

function numberToEnglishWords(num) {
    const decs = Math.round((num - Math.floor(num)) * 100);
    const entero = Math.floor(num);

    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 
                  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    function convert(n) {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 > 0 ? '-' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 > 0 ? ' and ' + convert(n % 100) : '');
        if (n < 1000000) return convert(Math.floor(n / 1000)) + ' thousand' + (n % 1000 > 0 ? ' ' + convert(n % 1000) : '');
        return '';
    }

    let result = entero === 0 ? 'zero' : convert(entero);
    result = result.trim();

    if (decs > 0) {
        return `${result} and ${decs}/100`;
    }
    return result;
}


// Obtener nombre del tipo de licencia activo
function getActiveLicenseType() {
    const activeBtn = document.querySelector('.license-btn.active');
    return activeBtn ? activeBtn.dataset.type : 'basic';
}

// ==========================================================================
// SISTEMA DE PLANTILLAS Y MOTOR MARKDOWN
// ==========================================================================

function parseInlineMarkdown(text) {
    let parsed = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
        
    // Bold: **text** or __text__
    parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsed = parsed.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Italic: *text* or _text_
    parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    parsed = parsed.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Code: `code`
    parsed = parsed.replace(/`(.*?)`/g, '<code>$1</code>');
    
    return parsed;
}

function parseMarkdownToHTML(markdown) {
    if (!markdown) return '';
    
    const lines = markdown.split('\n');
    let html = [];
    let inList = false;
    let inBlockquote = false;
    
    let inTable = false;
    let tableHeaders = [];
    let tableRows = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Handle table rows
        if (line.startsWith('|')) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            
            const cells = line.split('|').map(c => c.trim()).filter((c, index, arr) => index > 0 && index < arr.length - 1);
            
            if (!inTable) {
                inTable = true;
                tableHeaders = cells;
            } else {
                const isSeparator = cells.every(c => /^:?-+:?$/.test(c));
                if (!isSeparator) {
                    tableRows.push(cells);
                }
            }
            continue;
        } else if (inTable) {
            html.push('<table class="limits-table">');
            html.push('<thead><tr>');
            tableHeaders.forEach(h => html.push(`<th>${parseInlineMarkdown(h)}</th>`));
            html.push('</tr></thead>');
            html.push('<tbody>');
            tableRows.forEach(row => {
                html.push('<tr>');
                row.forEach(cell => html.push(`<td>${parseInlineMarkdown(cell)}</td>`));
                html.push('</tr>');
            });
            html.push('</tbody></table>');
            inTable = false;
            tableHeaders = [];
            tableRows = [];
        }
        
        // Handle horizontal rules
        if (line === '---' || line === '***') {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            html.push('<hr>');
            continue;
        }
        
        // Handle Headings
        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            const level = headingMatch[1].length;
            const content = parseInlineMarkdown(headingMatch[2]);
            html.push(`<h${level}>${content}</h${level}>`);
            continue;
        }
        
        // Handle List Items
        const listMatch = line.match(/^[\*\-\+]\s+(.*)$/);
        if (listMatch) {
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            if (!inList) {
                html.push('<ul>');
                inList = true;
            }
            const content = parseInlineMarkdown(listMatch[1]);
            html.push(`<li>${content}</li>`);
            continue;
        }
        
        // Handle Blockquotes
        const quoteMatch = line.match(/^>\s+(.*)$/);
        if (quoteMatch) {
            if (inList) { html.push('</ul>'); inList = false; }
            if (!inBlockquote) {
                html.push('<blockquote><div>');
                inBlockquote = true;
            }
            const content = parseInlineMarkdown(quoteMatch[1]);
            html.push(content + '<br>');
            continue;
        }
        
        // Handle Empty Lines
        if (line === '') {
            if (inList) { html.push('</ul>'); inList = false; }
            if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
            continue;
        }
        
        // Regular Paragraph
        if (inList) { html.push('</ul>'); inList = false; }
        if (inBlockquote) { html.push('</div></blockquote>'); inBlockquote = false; }
        
        const content = parseInlineMarkdown(line);
        html.push(`<p>${content}</p>`);
    }
    
    if (inTable) {
        html.push('<table class="limits-table">');
        html.push('<thead><tr>');
        tableHeaders.forEach(h => html.push(`<th>${parseInlineMarkdown(h)}</th>`));
        html.push('</tr></thead>');
        html.push('<tbody>');
        tableRows.forEach(row => {
            html.push('<tr>');
            row.forEach(cell => html.push(`<td>${parseInlineMarkdown(cell)}</td>`));
            html.push('</tr>');
        });
        html.push('</tbody></table>');
    }
    if (inList) html.push('</ul>');
    if (inBlockquote) html.push('</div></blockquote>');
    
    return html.join('\n');
}

// html2pdf respeta con mayor fiabilidad un contenedor real que la regla
// break-after aplicada únicamente al encabezado. Agrupar cada título con su
// primer bloque evita títulos huérfanos sin forzar una cláusula larga completa
// a una sola página.
function protectContractPageBreaks(html) {
    if (!html || typeof document === 'undefined') return html;
    const template = document.createElement('template');
    template.innerHTML = `<div>${html}</div>`;
    const root = template.content.firstElementChild;
    if (!root) return html;

    [...root.querySelectorAll('h2, h3')].forEach(heading => {
        if (heading.closest('.contract-heading-group')) return;
        const next = heading.nextElementSibling;
        if (!next) return;
        const group = document.createElement('div');
        group.className = 'contract-heading-group';
        heading.before(group);
        group.append(heading, next);
    });

    return root.innerHTML;
}

const ELECTRONIC_PAYMENT_RE = /(stripe|paypal|payphone|deuna|tarjeta|credit\s*card|card)/i;

function isElectronicContractPayment(paymentMethod) {
    return ELECTRONIC_PAYMENT_RE.test(String(paymentMethod || ''));
}

function formatContractPaymentMethod(paymentMethod, lang = 'es') {
    const raw = String(paymentMethod || '').trim();
    const normalized = raw.toLowerCase();
    const provider = normalized.includes('stripe') ? 'Stripe'
        : normalized.includes('paypal') ? 'PayPal'
            : normalized.includes('payphone') ? 'PayPhone'
                : normalized.includes('deuna') ? 'Deuna!'
                    : /(tarjeta|credit\s*card|card)/i.test(raw) ? (lang === 'en' ? 'card' : 'tarjeta')
                        : raw;

    if (!isElectronicContractPayment(raw)) {
        if (lang === 'en' && normalized === 'transferencia bancaria') return 'Bank transfer';
        return raw;
    }
    return lang === 'en'
        ? `Electronic payment through ${provider}`
        : `Pago electrónico mediante ${provider}`;
}

function getContractVerificationCopy(paymentMethod, formattedDate, refCode, lang = 'es', needsBuyerSignature = false, hasBuyerSignature = false) {
    const electronic = isElectronicContractPayment(paymentMethod);
    if (lang === 'en') {
        return {
            acceptanceTitle: electronic ? '✓ Accepted through electronic payment' : '✓ Accepted after payment verification',
            acceptanceBody: electronic
                ? `This agreement does not require a handwritten signature. Electronic payment was confirmed on <strong>${formattedDate}</strong> under reference <strong class="font-data-mono">${refCode}</strong>.`
                : `This agreement does not require a handwritten signature. The Producer verified the payment on <strong>${formattedDate}</strong> under reference <strong class="font-data-mono">${refCode}</strong>.`,
            sealStatus: hasBuyerSignature
                ? 'Status: electronically signed and valid'
                : needsBuyerSignature
                    ? 'Status: pending Licensee signature'
                    : electronic
                        ? 'Status: valid license · electronic payment confirmed'
                        : 'Status: valid license · payment verified by the Producer'
        };
    }

    return {
        acceptanceTitle: electronic ? '✓ Aceptado mediante pago electrónico' : '✓ Aceptado mediante verificación del pago',
        acceptanceBody: electronic
            ? `Este acuerdo no requiere firma manuscrita. El pago electrónico fue confirmado el <strong>${formattedDate}</strong> bajo el código de referencia <strong class="font-data-mono">${refCode}</strong>.`
            : `Este acuerdo no requiere firma manuscrita. El Productor verificó el pago el <strong>${formattedDate}</strong> bajo el código de referencia <strong class="font-data-mono">${refCode}</strong>.`,
        sealStatus: hasBuyerSignature
            ? 'Estado: firmado electrónicamente y vigente'
            : needsBuyerSignature
                ? 'Estado: pendiente de firma del Licenciatario'
                : electronic
                    ? 'Estado: licencia vigente · pago electrónico confirmado'
                    : 'Estado: licencia vigente · pago verificado por el Productor'
    };
}

async function loadTemplates() {
    activeTemplates = DEFAULT_TEMPLATES.map(t => ({ ...t }));
    window.activeTemplates = activeTemplates;
    
    if (!window.currentUser) {
        console.warn("No hay usuario autenticado, usando plantillas por defecto.");
        return;
    }

    if (window.currentUserIsPro) {
        console.log("Cargando plantillas desde Firestore para Plan Pro...");
        try {
            const templatesRef = collection(db, "users", window.currentUser, "templates");
            const qSnap = await getDocs(templatesRef);
            qSnap.forEach(doc => {
                const data = doc.data();
                const tid = doc.id;
                const activeT = activeTemplates.find(t => t.id === tid);
                if (activeT && data.markdown) {
                    activeT.markdown = data.markdown;
                }
            });
            console.log("Plantillas cargadas desde Firestore.");
        } catch (err) {
            console.error("Error al cargar plantillas desde Firestore:", err);
        }
    } else {
        console.log("Cargando plantillas desde localStorage para Plan Inicial...");
        activeTemplates.forEach(t => {
            const saved = localStorage.getItem(`${window.currentUser}_template_${t.id}`);
            if (saved) {
                t.markdown = saved;
            }
        });
        console.log("Plantillas cargadas desde localStorage.");
    }
}

async function saveTemplateCustom(templateId, markdown) {
    const activeT = activeTemplates.find(t => t.id === templateId);
    if (activeT) {
        activeT.markdown = markdown;
    }
    
    if (!window.currentUser) return;
    
    if (window.currentUserIsPro) {
        const docRef = doc(db, "users", window.currentUser, "templates", templateId);
        await setDoc(docRef, { markdown: markdown }, { merge: true });
    } else {
        localStorage.setItem(`${window.currentUser}_template_${templateId}`, markdown);
    }
}

async function resetTemplateCustom(templateId) {
    const defaultT = DEFAULT_TEMPLATES.find(t => t.id === templateId);
    const activeT = activeTemplates.find(t => t.id === templateId);
    if (defaultT && activeT) {
        activeT.markdown = defaultT.markdown;
        
        if (window.currentUser) {
            if (window.currentUserIsPro) {
                const docRef = doc(db, "users", window.currentUser, "templates", templateId);
                await deleteDoc(docRef);
            } else {
                localStorage.removeItem(`${window.currentUser}_template_${templateId}`);
            }
        }
    }
}

function openTemplatesEditor() {
    const modal = document.getElementById('templates-editor-modal');
    if (modal) {
        modal.style.display = 'flex';
        const activeSel = document.getElementById('contract-template-select');
        const editSel = document.getElementById('edit-template-select');
        if (activeSel && editSel) {
            editSel.value = activeSel.value;
        }
        loadTemplateToEditor(editSel.value);
    }
}

function closeTemplatesEditor() {
    const modal = document.getElementById('templates-editor-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function loadTemplateToEditor(templateId) {
    const textarea = document.getElementById('template-editor-textarea');
    if (textarea) {
        const template = activeTemplates.find(t => t.id === templateId);
        textarea.value = template ? template.markdown : '';
    }
}

// COMPILAR CONTRATO (Generación de contenido de texto Markdown y HTML)
function compileContract() {
    const currentLang = getEditorLanguage();
    const type = getActiveLicenseType();
    const isExclusive = type === 'exclusive';
    
    const beatName = document.getElementById('beat-name').value.trim() || "[Nombre del Beat]";
    const beatBpm = document.getElementById('beat-bpm') ? document.getElementById('beat-bpm').value.trim() : "";
    const beatKey = document.getElementById('beat-key') ? document.getElementById('beat-key').value.trim() : "";
    const buyerName = document.getElementById('buyer-name').value.trim() || "[Nombre del Comprador]";
    const buyerId = document.getElementById('buyer-id').value.trim() || "[Cédula/DNI]";
    const buyerEmail = document.getElementById('buyer-email').value.trim() || "[Correo del Comprador]";
    const buyerPhone = document.getElementById('buyer-phone').value.trim();
    const buyerCity = document.getElementById('buyer-city').value.trim() || "[Ciudad]";
    const buyerCountry = document.getElementById('buyer-country').value.trim() || "[País]";
    const value = parseFloat(document.getElementById('license-value').value) || 0;
    const refCode = normalizeLicenseReference(document.getElementById('ref-code').value) || INVALID_REFERENCE_PREVIEW;
    const effectiveDate = document.getElementById('effective-date').value;
    const dateFormatted = (currentLang === 'en' ? formatFechaIngles(effectiveDate) : formatFechaEspanol(effectiveDate)) || "[Fecha]";
    const isSossaProducer = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')) || 
                            (producerConfig.name && producerConfig.name.toLowerCase().includes('sossa'));

    let celebrationPlace = document.getElementById('celebration-place').value.trim() || "[Lugar de Celebración]";
    if (isSossaProducer) {
        celebrationPlace = currentLang === 'en'
            ? "Executed electronically in Quito, Ecuador"
            : "Celebrado de forma electrónica en Quito - Ecuador.";
    }

    const paymentMethod = document.getElementById('payment-method').value;
    const displayPaymentMethod = formatContractPaymentMethod(paymentMethod, currentLang);
    
    // Cláusulas editadas
    const formats = document.getElementById('clause-formats').value.trim() || "[Formatos]";
    const streams = document.getElementById('clause-streams').value.trim() || "[Límite Streams]";
    const physical = document.getElementById('clause-physical').value.trim() || "[Límite Físicas]";
    const videos = document.getElementById('clause-videos').value.trim() || "[Videos]";
    const videoDuration = document.getElementById('clause-video-duration').value.trim() || "[Duración Video]";
    const years = document.getElementById('clause-years').value.trim() || "[Años de Vigencia]";
    const terminationFee = document.getElementById('clause-termination-fee').value.trim() || "[Multa Rescisión]";
    const writerShare = document.getElementById('clause-writer-share').value;
    const producerShare = document.getElementById('clause-producer-share').value;
    const credits = document.getElementById('clause-credits').value.trim() || "[Créditos]";
    const contentIdProhibited = document.getElementById('clause-content-id').checked;

    const valueLetters = currentLang === 'en' ? numberToEnglishWords(value) : numeroALetras(value);
    const tierName = LICENSE_CONFIGS[type] 
        ? (currentLang === 'en' ? (type === 'exclusive' ? 'Exclusive' : type === 'premium' ? 'Premium' : type === 'premium_plus' ? 'Premium Plus' : type === 'unlimited_flp' ? 'Unlimited' : 'Basic') : LICENSE_CONFIGS[type].name)
        : (currentLang === 'en' ? 'Custom' : 'Personalizada');

    // Extraer ciudad del lugar de firma para la jurisdicción
    const cityParts = celebrationPlace.split(',');
    const cityOfJurisdiction = cityParts[0].trim();

    // Obtener la plantilla activa
    const activeTemplateSelect = document.getElementById('contract-template-select');
    const activeTemplateId = activeTemplateSelect ? activeTemplateSelect.value : 'licencia_uso';
    let activeTemplate = activeTemplates.find(t => t.id === activeTemplateId);
    if (!activeTemplate) {
        activeTemplate = DEFAULT_TEMPLATES.find(t => t.id === activeTemplateId) || DEFAULT_TEMPLATES[0];
    }

    // Resolver cláusulas condicionales
    const clause_rescission_rules = isExclusive 
        ? (currentLang === 'en' 
            ? 'Once the agreement expires or becomes perpetual, the rights will be maintained as stipulated without the need for renewal.'
            : 'Una vez vencido o perpetuo el acuerdo, los derechos se mantendrán según lo estipulado sin necesidad de renovación.')
        : (currentLang === 'en'
            ? 'Consequently, this license will automatically expire upon the completion of the term stipulated, counted from the date stipulated in the header.'
            : 'En consecuencia, esta licencia expirará automáticamente al cumplirse el término estipulado contados a partir de la fecha estipulada en el encabezado.');

    const clause_content_id_rules = contentIdProhibited
        ? (currentLang === 'en'
            ? 'The Licensee is **strictly prohibited** from registering the Beat or the New Song in any automated content identification system (such as *Content ID*, *Facebook Rights Manager*, *Identifyy*, or automatic digital distribution tools like TuneCore, CD Baby, or DistroKid that index audio fingerprints). This measure is mandatory to protect the rights of other legitimate licensees of the same Beat. The original material has already been indexed and preventively protected by the Producer. Failure to comply with this rule will result in the immediate revocation of the license.'
            : 'El Licenciatario tiene **estrictamente prohibido** registrar el Beat o la Nueva Canción en cualquier plataforma de identificación automatizada de contenido (*Content ID*, *Facebook Rights Manager*, *Identifyy*, o herramientas de distribución digital automáticas como TuneCore, CD Baby o DistroKid que indexen huellas de audio). Esta medida es obligatoria para resguardar los derechos de otros licenciatarios legítimos del mismo Beat. El material original ya ha sido indexado y protegido preventivamente por el Productor. El incumplimiento de esta norma provocará la revocación inmediata de la licencia.')
        : (currentLang === 'en'
            ? 'As this is an Exclusive License, the Licensee is authorized to execute standard digital distribution and use the Content ID system in a controlled manner on their final version (the New Song), provided they strictly refrain from claiming exclusive ownership or monetization rights over the instrumental track itself, and they are obligated to whitelist any pre-existing legitimate non-exclusive derivative songs created by other licensees prior to this agreement.'
            : 'Al tratarse de una Licencia Exclusiva, el Licenciatario está facultado para la distribución digital estándar y el uso del sistema Content ID de manera controlada sobre su versión final (la Nueva Canción) siempre y cuando se abstenga estrictamente de reclamar la propiedad exclusiva o la monetización de la pista instrumental en sí misma, quedando obligado a incluir en lista blanca (*whitelist*) cualquier canción derivada legítima no exclusiva preexistente creada por otros licenciatarios antes de este acuerdo.');

    const clause_prior_license_upgrade_rules = isExclusive
        ? (currentLang === 'en'
            ? '**4.1. Prior Licenses and Reserved Upgrade Right.** This Exclusive License is granted subject to any valid non-exclusive license issued before its Effective Date. Each prior Licensee retains the authorized use of the same New Song under their original license and may, even after this exclusive sale, purchase upgrades of that license up to the Unlimited License. This reservation does not authorize new non-exclusive licenses, new derivative songs, assignments, sublicenses, or another exclusive license. The Exclusive Licensee must respect those prior uses and whitelist them in any content-identification system.'
            : '**4.1. Licencias Previas y Derecho de Ampliación Reservado.** Esta Licencia Exclusiva se concede sujeta a toda licencia no exclusiva válida emitida antes de su Fecha de Entrada en Vigor. Cada Licenciatario previo conserva el uso autorizado de la misma Nueva Canción bajo su licencia original y podrá, aun después de esta venta exclusiva, adquirir ampliaciones de esa licencia hasta la Licencia Ilimitada. Esta reserva no autoriza nuevas licencias no exclusivas, nuevas canciones derivadas, cesiones, sublicencias ni otra licencia exclusiva. El Licenciatario Exclusivo deberá respetar tales usos previos y mantenerlos en lista blanca en cualquier sistema de identificación de contenido.')
        : (currentLang === 'en'
            ? '**4.1. Later Exclusive Sale and Reserved Upgrade.** If the Producer later grants an Exclusive License for the Beat, this prior non-exclusive license is not revoked. The Licensee may continue exploiting the same New Song within the terms of this Agreement and may purchase upgrades of this license up to the Unlimited License. The upgrade is personal to the original Licensee and applies only to the same Beat and New Song; it does not authorize a new derivative song, an assignment, a sublicense, or an exclusive license.'
            : '**4.1. Exclusiva Posterior y Ampliación Reservada.** Si el Productor concede posteriormente una Licencia Exclusiva sobre el Beat, esta licencia no exclusiva previa no queda revocada. El Licenciatario podrá continuar explotando la misma Nueva Canción dentro de los términos de este Contrato y podrá adquirir ampliaciones de esta licencia hasta la Licencia Ilimitada. La ampliación es personal para el Licenciatario original y aplica únicamente al mismo Beat y a la misma Nueva Canción; no autoriza una nueva canción derivada, cesión, sublicencia ni licencia exclusiva.');

    // Configurar variables de reemplazo

    // 1. Declaración legal del productor (persona natural y nombre artístico)
    let producer_legal_declaration = "";
    let producer_legal_declaration_en = "";
    if (isSossaProducer) {
        const prodName = producerConfig.name || producerConfig.aka || "Productor";
        const prodAka = producerConfig.aka || prodName;
        producer_legal_declaration = `**${prodAka}**, nombre artístico de **${prodName}**, quien actúa como persona natural y titular de los derechos objeto de esta licencia`;
        producer_legal_declaration_en = `**${prodAka}**, the professional name of **${prodName}**, acting as a natural person and holder of the rights covered by this license`;
    } else {
        const prodName = producerConfig.name || "Productor";
        const prodAka = producerConfig.aka || prodName;
        const identityText = producerConfig.id ? `, con documento de identidad Nro. ${producerConfig.id}` : '';
        const identityTextEn = producerConfig.id ? `, with ID/Passport No. ${producerConfig.id}` : '';
        producer_legal_declaration = `**${prodName}**, conocido profesionalmente en la industria musical como **${prodAka}**${identityText}`;
        producer_legal_declaration_en = `**${prodName}**, professionally known in the music industry as **${prodAka}**${identityTextEn}`;
    }

    // 2. Jurisdicción y ley aplicable
    let laws_jurisdiction = "";
    let laws_jurisdiction_en = "";
    let jurisdiction_place = "";
    let jurisdiction_place_en = "";
    if (isSossaProducer) {
        laws_jurisdiction = "la República del Ecuador";
        laws_jurisdiction_en = "the Republic of Ecuador";
        jurisdiction_place = "Quito - Ecuador";
        jurisdiction_place_en = "Quito - Ecuador";
    } else {
        laws_jurisdiction = "la República del Ecuador";
        laws_jurisdiction_en = "the Republic of Ecuador";
        jurisdiction_place = `la ciudad de ${cityOfJurisdiction}`;
        jurisdiction_place_en = `the city of ${cityOfJurisdiction}`;
    }

    // 3. Reglas de sincronización comercial (especial para Exclusive)
    let clause_sync_rules = "";
    let clause_sync_rules_en = "";
    if (isExclusive) {
        clause_sync_rules = `Se concede al Licenciatario el derecho ilimitado y perpetuo de sincronizar la Nueva Canción en producciones audiovisuales (tales como cine, televisión, cortometrajes, videojuegos o comerciales publicitarios de marcas). No obstante, el Productor retiene su participación del 50% de las regalías de composición (Publishing / Writer's Share) administradas a través de su sociedad de gestión colectiva (${producerConfig.pro || 'BMI'} / ${producerConfig.publisher || 'Songtrust'}) sobre cualquier explotación comercial de sincronización.`;
        clause_sync_rules_en = `The Licensee is granted the unlimited and perpetual right to synchronize the New Song in audiovisual productions (such as film, television, short films, video games, or commercial brand advertisements). However, the Producer retains their 50% share of composition royalties (Publishing / Writer's Share) administered through their collective rights organization (${producerConfig.pro || 'BMI'} / ${producerConfig.publisher || 'Songtrust'}) on any commercial synchronization exploitation.`;
    } else {
        clause_sync_rules = `Queda expresamente prohibida la sincronización del Beat o de la Nueva Canción en producciones de cine, cortometrajes, programas de televisión, videojuegos o comerciales publicitarios de marcas de consumo masivo, salvo acuerdo y licenciamiento independiente con el Productor.`;
        clause_sync_rules_en = `The synchronization of the Beat or the New Song in film productions, short films, television programs, video games, or commercial advertisements of mass consumer brands is expressly prohibited, except by independent agreement and licensing with the Producer.`;
    }

    // 4. Cláusula de rescisión dinámica (Clause 9)
    let clause_rescission_title = "";
    let clause_rescission_title_en = "";
    let clause_rescission_body = "";
    let clause_rescission_body_en = "";
    if (isExclusive) {
        clause_rescission_title = "Irrevocabilidad del Acuerdo";
        clause_rescission_title_en = "Irrevocability of the Agreement";
        clause_rescission_body = "Al tratarse de una transferencia de derechos exclusivos sobre el instrumental, el presente Contrato es definitivo, irrevocable y perpetuo. El Licenciante renuncia de forma expresa e irrevocable a cualquier facultad de rescisión unilateral o terminación anticipada una vez perfeccionada la compraventa.";
        clause_rescission_body_en = "As this is a transfer of exclusive rights over the instrumental, this Agreement is final, irrevocable, and perpetual. The Licensor expressly and irrevocably waives any power of unilateral termination or early rescission once the sale is finalized.";
    } else {
        clause_rescission_title = "Opción de Rescisión del Licenciante (Cláusula de Salvaguarda)";
        clause_rescission_title_en = "Licensor's Termination Option (Safeguard Clause)";
        clause_rescission_body = `El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente a **${terminationFee}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción.`;
        clause_rescission_body_en = `The Licensor reserves the discretionary power and exclusive option, executable within the first **three (3) years** from the signing of this Contract, to terminate this agreement early and unilaterally by written notice. For this termination to take effect, the Licensor will pay the Licensee compensation equivalent to **${terminationFee}**. Following notification and payment of said penalty, the Licensee will have a period of seven (7) days to take down and withdraw the New Song from all physical and digital distribution channels in the market. The Licensee expressly agrees that the payment of said penalty constitutes a full, sole, and final compensation for the termination of the agreement, and irrevocably waives the right to claim any other value, compensation, or damages for promotion, marketing, video production expenses, or any other investment made in connection with the New Song.`;
    }

    const vars = {
        producer_name: producerConfig.name || "Productor",
        producer_aka: producerConfig.aka || producerConfig.name || "Productor",
        producer_id: producerConfig.id || "",
        producer_email: producerConfig.email || "",
        producer_phone: producerConfig.phone || "",
        producer_pro: producerConfig.pro || "BMI",
        producer_ipi: producerConfig.ipi || "",
        producer_publisher: producerConfig.publisher || "",
        
        buyer_name: buyerName,
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        buyer_city: buyerCity,
        buyer_country: buyerCountry,
        
        beat_name: beatName,
        beat_bpm: beatBpm ? '(' + beatBpm + ' BPM)' : '',
        beat_key: beatKey,
        license_value: value.toFixed(2),
        license_value_letters: valueLetters,
        ref_code: refCode,
        effective_date: dateFormatted,
        celebration_place: celebrationPlace,
        payment_method: displayPaymentMethod,
        jurisdiction_city: cityOfJurisdiction,
        current_year: effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear(),
        
        clause_formats: formats,
        clause_streams: streams,
        clause_physical: physical,
        clause_videos: videos,
        clause_video_duration: videoDuration,
        clause_years: years,
        clause_termination_fee: terminationFee,
        clause_writer_share: writerShare,
        clause_producer_share: producerShare,
        clause_credits: credits,
        
        license_type: tierName,
        license_exclusivity: isExclusive ? (currentLang === 'en' ? 'Exclusive' : 'Exclusiva') : (currentLang === 'en' ? 'Non-Exclusive' : 'No Exclusiva'),
        license_exclusivity_lower: isExclusive ? (currentLang === 'en' ? 'exclusive' : 'exclusiva') : (currentLang === 'en' ? 'non-exclusive' : 'no exclusiva'),
        clause_rescission_rules: clause_rescission_rules,
        clause_content_id_rules: clause_content_id_rules,
        clause_prior_license_upgrade_rules: clause_prior_license_upgrade_rules,

        // Variables legales del productor
        producer_legal_declaration: producer_legal_declaration,
        producer_legal_declaration_en: producer_legal_declaration_en,
        laws_jurisdiction: laws_jurisdiction,
        laws_jurisdiction_en: laws_jurisdiction_en,
        jurisdiction_place: jurisdiction_place,
        jurisdiction_place_en: jurisdiction_place_en,
        clause_sync_rules: clause_sync_rules,
        clause_sync_rules_en: clause_sync_rules_en,
        clause_rescission_title: clause_rescission_title,
        clause_rescission_title_en: clause_rescission_title_en,
        clause_rescission_body: clause_rescission_body,
        clause_rescission_body_en: clause_rescission_body_en
    };

    // Leer campos personalizados de la barra lateral
    const customContainer = document.getElementById('custom-fields-container');
    if (customContainer) {
        const rows = customContainer.querySelectorAll('.custom-field-row');
        rows.forEach(row => {
            const tagInput = row.querySelector('.field-tag');
            const valInput = row.querySelector('.field-value');
            if (tagInput && valInput) {
                const key = tagInput.value.trim().toLowerCase();
                if (key) {
                    vars[key] = valInput.value;
                }
            }
        });
    }

    // Compilar Markdown
    const templateMarkdown = (currentLang === 'en' && activeTemplate.markdown_en) ? activeTemplate.markdown_en : activeTemplate.markdown;
    let md = templateMarkdown.replace(/\{\{(\w+)\}\}/g, (match, tag) => {
        const tagLower = tag.toLowerCase();
        return tagLower in vars ? vars[tagLower] : match;
    });
    // Las plantillas personalizadas antiguas pueden no contener todavía el
    // marcador nuevo. La licencia comercial no pierde esta salvaguarda por
    // usar una personalización visual del productor.
    if (activeTemplateId === 'licencia_uso' && !templateMarkdown.includes('{{clause_prior_license_upgrade_rules}}')) {
        md += `\n\n---\n\n${clause_prior_license_upgrade_rules}`;
    }

    // Compilar HTML
    const t = TRANSLATIONS[currentLang] || {};
    const isMonarco = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('monarco'));
    const isSossa = (window.currentUserIsAdmin || (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')));
    const hasCustomLogo = (producerConfig.plan === 'elite' || window.currentUserIsAdmin) && producerConfig.logoBase64;
    const logoHtml = hasCustomLogo
            ? `<div style="text-align: center; margin-bottom: 15px;"><img src="${producerConfig.logoBase64}" alt="Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
            : (isMonarco
                ? `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">CG MONARCO</div>` 
                : (isSossa 
                    ? `<div style="text-align: center; margin-bottom: 15px;"><img src="/logo.png" alt="SOSSA Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
                    : `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">${escapeHtml((producerConfig.aka || 'PRODUCTOR').toUpperCase())}</div>`
                  )
              );

    const bodyHtml = protectContractPageBreaks(parseMarkdownToHTML(md));

    // Determinar firmas requeridas
    const needsBuyerSignature = (activeTemplateId === 'split_sheet' || activeTemplateId === 'coproduccion' || isExclusive);
    
    // Auto-detectar etiqueta RUC si tiene 13 dígitos
    let idLabelL = t.buyerId || 'Identificación/RUT:';
    if (producerConfig.id && producerConfig.id.trim().length === 13) {
        idLabelL = 'RUC (Ecuador):';
    }
    
    let idLabelR = t.buyerId || 'Identificación/RUT:';
    if (buyerId && buyerId.trim().length === 13) {
        idLabelR = 'RUC (Ecuador):';
    }
    
    let signatureRoleL = t.producerRole || 'El Licenciante (Productor)';
    let signatureNameL = producerConfig.name;
    let signatureIdL = producerConfig.id ? `${idLabelL} ${producerConfig.id}` : idLabelL;
    let signatureAkaL = `AKA: ${producerConfig.aka}`;
    
    if (activeTemplateId === 'coproduccion') {
        signatureRoleL = 'Productor Principal';
    }
    
    let signatureRoleR = t.buyerRole || 'El Licenciatario (Usuario)';
    let signatureNameR = buyerName;
    let signatureIdR = `${idLabelR} ${buyerId}`;
    
    if (activeTemplateId === 'coproduccion') {
        signatureRoleR = 'Coproductor / Colaborador';
    } else if (activeTemplateId === 'split_sheet') {
        signatureRoleR = 'Autor/Letra/Voz';
    }

    let signatureSectionHtml = '';
    
    if (needsBuyerSignature) {
        const safeRoleL = escapeHtml(signatureRoleL);
        const safeNameL = escapeHtml(signatureNameL);
        const safeIdL = escapeHtml(signatureIdL);
        const safeAkaL = escapeHtml(signatureAkaL);
        const safeRoleR = escapeHtml(signatureRoleR);
        const safeNameR = escapeHtml(signatureNameR);
        const safeIdR = escapeHtml(signatureIdR);
        const safeDocusign = escapeHtml(t.buyerSignatureDocusign || 'Firma vía DocuSign');
        const safeProducerAka = escapeHtml(producerConfig.aka || '');
        const safeProducerName = escapeHtml(producerConfig.name || '');

        const signatureLeftHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    ${producerConfig.signature
                        ? `<img src="${producerConfig.signature}" alt="Firma ${safeProducerAka}" class="signature-img">`
                        : (isMonarco 
                            ? `<img src="/firma-cgmonarco.png" alt="Firma ${safeProducerAka}" class="signature-img">`
                            : (isSossa
                                ? `<img src="/firma-sossa.png" alt="Firma ${safeProducerAka}" class="signature-img">`
                                : `<div class="signature-placeholder" style="font-family:'Brush Script MT', cursive; font-size:28px; color:var(--accent); text-align:center; padding-top:5px; width:150px; margin:0 auto;">${safeProducerName}</div>`
                              )
                          )
                    }
                </div>
                <div class="signature-line"></div>
                <div class="signature-role">${safeRoleL}</div>
                <div class="signature-name">${safeNameL}</div>
                <div class="signature-aka">${safeIdL}</div>
                <div class="signature-aka">${safeAkaL}</div>
            </div>
        `;
        
        const signatureRightHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    <!-- Espacio en blanco reservado para alineación de firmas -->
                </div>
                <div class="signature-line"></div>
                <div class="signature-role">${safeRoleR}</div>
                <div class="signature-name">${safeNameR}</div>
                <div class="signature-aka">${safeIdR}</div>
                <div class="signature-aka">${safeDocusign}</div>
            </div>
        `;

        signatureSectionHtml = `
            <div class="signature-section" style="margin-top: 30px;">
                ${signatureLeftHtml}
                ${signatureRightHtml}
            </div>
        `;
    } else {
        const formattedDate = new Date(effectiveDate + 'T12:00:00').toLocaleDateString(currentLang === 'en' ? 'en-US' : 'es-ES', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const verificationCopy = getContractVerificationCopy(paymentMethod, formattedDate, refCode, currentLang);
        signatureSectionHtml = `
            <div class="signature-section non-exclusive-acceptance" style="margin-top: 30px; display: flex; justify-content: center; width: 100%;">
                <div style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 15px 30px; background: rgba(16, 185, 129, 0.02); text-align: center; max-width: 500px; width: 100%;">
                    <div style="font-size: 18px; color: #10b981; font-weight: 800; margin-bottom: 5px;">${verificationCopy.acceptanceTitle}</div>
                    <div style="font-size: 11px; color: #636366; line-height: 1.4;">
                        ${verificationCopy.acceptanceBody}
                    </div>
                </div>
            </div>
        `;
    }

    const verificationCopy = getContractVerificationCopy(paymentMethod, dateFormatted, refCode, currentLang, needsBuyerSignature, false);

    let html = `
        <div class="contract-doc">
            ${isSossa 
                ? `<div class="contract-watermark" style="background-image: url('/logo.png');"></div>`
                : (!window.currentUserIsPro ? `<div class="contract-watermark free-watermark"></div>` : '')
            }
            <div class="doc-header" style="text-align: center; margin-bottom: 30px;">
                <div class="doc-logo-container" style="margin-bottom: 15px;">
                    ${logoHtml}
                </div>
            </div>
            
            <div class="doc-body">
                ${bodyHtml}
            </div>

            <div class="contract-closure">
                ${signatureSectionHtml}
                
                <div class="digital-seal-container" style="margin-top: 25px;">
                    <div class="digital-seal">
                        <div class="seal-icon">✓</div>
                        <div class="seal-text">
                            <strong>${t.sealVerified || 'DOCUMENTO VERIFICADO'}</strong><br>
                            ${t.sealRef || 'Ref:'} ${refCode}<br>
                            ${verificationCopy.sealStatus}
                        </div>
                    </div>
                </div>

                <hr style="margin: 15px 0;">

                <div class="doc-footer" style="text-align: center; font-size: 11px; color: #8a91a6;">
                    <p><em>${t.footerText || 'Este documento fue generado por la plataforma BEATSS.'} ${tierName} — ${producerConfig.aka} ${effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear()}.</em></p>
                </div>
            </div>
        </div>
    `;

    return { md, html };
}

// Actualizar la previsualización en vivo en la pantalla
function generatePreview() {
    const renderedContent = document.getElementById('rendered-contract-content');
    const markdownContent = document.getElementById('markdown-contract-content');
    if (!renderedContent || !markdownContent) return false;

    try {
        const { md, html } = compileContract();

        // Inyectar en el HTML renderizado
        document.getElementById('rendered-contract-content').innerHTML = html;

        // Inyectar en el contenedor de Markdown
        markdownContent.textContent = md;
    } catch (error) {
        console.error('[BEATSS] No se pudo generar la vista previa del contrato:', error);
        const fallback = document.createElement('section');
        const title = document.createElement('strong');
        const message = document.createElement('p');
        fallback.className = 'contract-preview-error';
        title.textContent = 'No se pudo generar la vista previa.';
        message.textContent = 'Revisa los datos del contrato e inténtalo nuevamente. El documento no se descargará mientras la vista previa no esté lista.';
        fallback.append(title, message);
        renderedContent.replaceChildren(fallback);
        markdownContent.textContent = '';
        showToast('No se pudo generar la vista previa del contrato. Revisa los datos e inténtalo de nuevo.', true);
        return false;
    }

    // Un fallo de guardado local no debe borrar un documento ya renderizado.
    try {
        saveFormDraft();
    } catch (error) {
        console.warn('[BEATSS] No se pudo guardar el borrador del contrato:', error);
    }
    return true;
}
window.generatePreview = generatePreview;

// Validar el formulario de licencia usando la API nativa de HTML5
function validateLicenseForm() {
    const beatName = document.getElementById('beat-name');
    const buyerName = document.getElementById('buyer-name');
    const buyerEmail = document.getElementById('buyer-email');

    if (!beatName.reportValidity()) {
        if (typeof window.nextStep === 'function') window.nextStep(2);
        beatName.focus();
        return false;
    }
    if (!buyerName.reportValidity()) {
        if (typeof window.nextStep === 'function') window.nextStep(2);
        buyerName.focus();
        return false;
    }
    if (!buyerEmail.reportValidity()) {
        if (typeof window.nextStep === 'function') window.nextStep(2);
        buyerEmail.focus();
        return false;
    }
    return true;
}

// Descargar el contrato en PDF usando html2pdf.js
async function downloadPDF() {
    const refCode = getRequiredManualReference();
    if (!refCode) return;
    const currentLang = getEditorLanguage();
    const isNew = !licenseHistory.some(l => l.refCode === refCode);
    if (isNew && checkPlanLimitExceeded('descargar esta nueva licencia')) {
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();

    const btn = document.getElementById('btn-download-pdf');
    const originalText = btn.innerHTML;

    if (typeof html2pdf === 'undefined') {
        try {
            btn.innerHTML = '⏳ Cargando librería PDF...';
            btn.disabled = true;
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        } catch (e) {
            showToast('La librería PDF no se pudo cargar. Revisa tu conexión.', true);
            return;
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    const beatName = document.getElementById('beat-name').value.trim() || "Beat";
    const buyerName = document.getElementById('buyer-name').value.trim() || "Comprador";
    const type = getActiveLicenseType();
    const finalRef = refCode;
    
    // Auto-guardar en historial al descargar si tiene nombre de comprador
    const buyerNameField = document.getElementById('buyer-name').value.trim();
    if (buyerNameField) {
        saveCurrentLicenseToHistory(true);
    }

    const element = document.getElementById('rendered-contract-content');
    
    // Mostrar cargando en el botón
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Generando PDF...';
    safeCreateIcons();
    btn.disabled = true;

    // La descarga normal siempre se compone desde la vista HTML que el usuario
    // está revisando. Así el PDF conserva tipografías, colores, logo, márgenes
    // y estructura visual. El renderizador Python queda solo como diagnóstico
    // opcional, nunca como el formato de entrega por defecto.
    const useServerPdfRenderer = window.BEATSS_USE_SERVER_PDF === true;
    if (useServerPdfRenderer && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
        try {
            const { md } = compileContract();
            
            const buyerId = document.getElementById('buyer-id').value.trim() || "";
            const buyerEmail = document.getElementById('buyer-email').value.trim() || "";
            const buyerPhone = document.getElementById('buyer-phone').value.trim() || "";
            const buyerCity = document.getElementById('buyer-city').value.trim() || "";
            const buyerCountry = document.getElementById('buyer-country').value.trim() || "";
            const value = parseFloat(document.getElementById('license-value').value) || 0;
            const date = document.getElementById('effective-date').value || new Date().toISOString().split('T')[0];
            
            const activeTemplateSelect = document.getElementById('contract-template-select');
            const activeTemplateId = activeTemplateSelect ? activeTemplateSelect.value : 'licencia_uso';
            const needsBuyerSig = (activeTemplateId === 'split_sheet' || activeTemplateId === 'coproduccion' || type === 'exclusive');
            
            const pConfig = window.producerConfig || {};
            
            const payload = {
                refCode: finalRef,
                beatName: beatName,
                beatBpm: document.getElementById('beat-bpm') ? document.getElementById('beat-bpm').value.trim() : "",
                beatKey: document.getElementById('beat-key') ? document.getElementById('beat-key').value.trim() : "",
                buyerName: buyerName,
                buyerId: buyerId,
                buyerEmail: buyerEmail,
                buyerPhone: buyerPhone,
                buyerCity: buyerCity,
                buyerCountry: buyerCountry,
                value: value,
                date: date,
                paymentMethod: document.getElementById('payment-method').value,
                licenseType: type,
                markdownText: md,
                producerId: window.currentUser || 'sossa',
                producerName: pConfig.name || "Productor",
                aka: pConfig.aka || pConfig.name || "Productor",
                producerIdNum: pConfig.id || "",
                producerRole: (activeTemplateId === 'coproduccion') ? 'Productor Principal' : 'El Licenciante (Productor)',
                buyerRole: (activeTemplateId === 'coproduccion') ? 'Coproductor / Colaborador' : (activeTemplateId === 'split_sheet' ? 'Autor/Letra/Voz' : 'El Licenciatario (Usuario)'),
                producerSignatureBase64: pConfig.signature || "",
                buyerSignatureBase64: "", // En espera de DocuSign si aplica
                needsBuyerSignature: needsBuyerSig,
                logoBase64: (pConfig.plan === 'elite' || window.currentUserIsAdmin) ? (pConfig.logoBase64 || "") : "",
                lang: currentLang
            };
            
            const res = await fetch('/api/generate-contract-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            if (!res.ok) {
                const errJson = await res.json();
                throw new Error(errJson.error || 'Fallo al generar PDF criptográfico.');
            }
            
            const blob = await res.blob();
            const cryptoHash = res.headers.get('X-Crypto-Hash') || '';
            
            // Actualizar hash criptográfico localmente en la lista de licencias
            const existingIdx = licenseHistory.findIndex(l => l.refCode === finalRef);
            if (existingIdx !== -1) {
                licenseHistory[existingIdx].cryptoHash = cryptoHash;
                // Guardar historial para que se sincronice en local y Firestore
                if (typeof saveHistory === 'function') {
                    await saveHistory();
                }
            }
            
            // Forzar descarga del archivo
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `Licencia_${type.toUpperCase()}_${finalRef} - ${beatName} - ${buyerName}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(downloadUrl);
            
            showToast('📄 PDF Criptográfico descargado con éxito y guardado en Documentos/Licencias');
        } catch (err) {
            console.error('Error al generar PDF criptográfico en el servidor:', err);
            // Si el proceso local abierto es una versión anterior del servidor,
            // la entrega no queda bloqueada: el navegador genera el PDF desde
            // la vista contractual actual, conservando exactamente su diseño.
            try {
                const fallbackOpt = {
                    margin: [15, 20, 15, 20],
                    filename: `Licencia_${type.toUpperCase()}_${finalRef} - ${beatName} - ${buyerName}.pdf`,
                    image: { type: 'jpeg', quality: 0.98 },
                    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
                    jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
                    pagebreak: { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
                };
                element.classList.add('printing-pdf');
                await html2pdf().from(element).set(fallbackOpt).save();
                showToast('PDF descargado desde la vista del contrato. El respaldo local se actualizará al reiniciar BeatSS.');
                element.classList.remove('printing-pdf');
            } catch (fallbackErr) {
                console.error('Error en la descarga de respaldo del navegador:', fallbackErr);
                showToast('No se pudo generar el PDF: ' + err.message, true);
            }
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            safeCreateIcons();
        }
    } else {
        // En producción / Vercel: Descarga clásica del navegador con html2pdf.js
        const opt = {
            margin:       [15, 20, 15, 20],
            filename:     `Licencia_${type.toUpperCase()}_${finalRef} - ${beatName} - ${buyerName}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
        };
        
        element.classList.add('printing-pdf');
        
        if (typeof html2pdf === 'undefined') {
            try {
                btn.innerHTML = '⏳ Cargando librería PDF...';
                await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
            } catch (e) {
                showToast('La librería PDF no se pudo cargar. Revisa tu conexión.', true);
                btn.innerHTML = originalText;
                btn.disabled = false;
                safeCreateIcons();
                return;
            }
        }
        
        try {
            const worker = html2pdf().from(element).set(opt);
            await worker.save();
            showToast('PDF descargado con éxito');
        } catch (err) {
            console.error('Error al generar PDF en producción:', err);
            showToast('Error al generar el PDF', true);
        } finally {
            element.classList.remove('printing-pdf');
            btn.innerHTML = originalText;
            btn.disabled = false;
            safeCreateIcons();
        }
    }
}


// Copiar formato markdown al portapapeles
function copyMarkdown() {
    const text = document.getElementById('markdown-contract-content').textContent;
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('Contrato copiado al portapapeles en formato Markdown');
        })
        .catch(err => {
            console.error('Error al copiar:', err);
            showToast('No se pudo copiar el contrato', true);
        });
}

// Guardar licencia actual en el historial de localStorage


// ==================== EDITOR BLOCK 2 ====================


// ==========================================================================
// IMPORTACIÓN DE PDFs — LEE TEXTO CON PDF.js + FALLBACK POR NOMBRE
// ==========================================================================

async function handleFolderImport(filesList) {
    if (!filesList || filesList.length === 0) {
        showToast('No se seleccionaron archivos', true);
        return;
    }

    const pdfFiles = Array.from(filesList).filter(f =>
        f.name.split('.').pop().toLowerCase() === 'pdf'
    );

    if (pdfFiles.length === 0) {
        showToast('No se encontraron archivos PDF en la carpeta', true);
        document.getElementById('folder-import-input').value = '';
        return;
    }

    showToast(`Leyendo ${pdfFiles.length} PDF(s)...`);

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (const file of pdfFiles) {
        try {
            const fileDate = new Date(file.lastModified).toISOString().split('T')[0];
            let lic = null;

            // Intentar 1: leer el texto del PDF con PDF.js
            try {
                const text = await extractPdfText(file);
                if (text && text.length > 100) {
                    lic = parsePdfText(text, fileDate);
                }
            } catch (e) {
                console.warn('PDF.js no pudo leer:', file.name, e);
            }

            // Intentar 2: fallback por nombre de archivo
            if (!lic) {
                lic = parsePdfFilename(file.name, fileDate);
            }

            if (lic && lic.refCode && lic.buyerName && lic.beatName) {
                const existingIdx = licenseHistory.findIndex(l => l.refCode === lic.refCode);
                if (existingIdx !== -1) {
                    licenseHistory[existingIdx] = lic;
                    duplicateCount++;
                } else {
                    licenseHistory.push(lic);
                    importedCount++;
                }
            } else {
                console.warn('No se pudo interpretar:', file.name);
                errorCount++;
            }
        } catch (err) {
            console.error('Error procesando', file.name, err);
            errorCount++;
        }
    }

    if (importedCount > 0 || duplicateCount > 0) {
        saveHistory();
        updateHistoryTable();
        let msg = `Importación finalizada. `;
        if (importedCount > 0) msg += `Añadidas ${importedCount}. `;
        if (duplicateCount > 0) msg += `Actualizadas ${duplicateCount}. `;
        if (errorCount > 0) msg += `${errorCount} no reconocidos.`;
        showToast(msg);
    } else {
        showToast('No se pudo interpretar ningún PDF', true);
    }

    document.getElementById('folder-import-input').value = '';
}

// Variables globales para el ZIP cargado temporalmente
let selectedZipPdfEntries = [];
let isAnalyzingZip = false;

// Manejar la selección del archivo ZIP
async function handleZipSelect(e) {
    const file = e.target.files[0];
    if (!file) return;

    const statusPanel = document.getElementById('zip-status-panel');
    const statusText = document.getElementById('zip-status-text');

    try {
        statusPanel.style.display = 'block';
        statusText.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:12px;height:12px;margin-right:4px;vertical-align:middle;"></i> Leyendo archivo ZIP...';
        safeCreateIcons();

        // Cargar ZIP usando la librería JSZip
        if (typeof JSZip === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }

        const zip = await JSZip.loadAsync(file);
        selectedZipPdfEntries = [];

        // Buscar todos los PDFs dentro del ZIP
        zip.forEach((relativePath, zipEntry) => {
            if (!zipEntry.dir && relativePath.split('.').pop().toLowerCase() === 'pdf') {
                selectedZipPdfEntries.push(zipEntry);
            }
        });

        if (selectedZipPdfEntries.length === 0) {
            statusText.innerText = '⚠️ No se encontraron archivos PDF dentro del archivo ZIP.';
            document.getElementById('btn-analyze-zip').style.display = 'none';
        } else {
            statusText.innerText = `📦 Se encontraron ${selectedZipPdfEntries.length} archivo(s) PDF de licencias en el ZIP.`;
            document.getElementById('btn-analyze-zip').style.display = 'block';
        }
    } catch (err) {
        console.error('Error al abrir el ZIP:', err);
        statusText.innerText = '❌ Error al leer el archivo ZIP: ' + err.message;
        document.getElementById('btn-analyze-zip').style.display = 'none';
    } finally {
        safeCreateIcons();
    }
}

// Analizar y cargar los PDFs del ZIP
async function analyzeSelectedZip() {
    if (selectedZipPdfEntries.length === 0 || isAnalyzingZip) return;

    isAnalyzingZip = true;
    const btn = document.getElementById('btn-analyze-zip');
    const originalText = btn.innerHTML;
    const statusText = document.getElementById('zip-status-text');

    btn.disabled = true;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:12px;height:12px;margin-right:4px;"></i> Analizando...';
    safeCreateIcons();

    let importedCount = 0;
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selectedZipPdfEntries.length; i++) {
        const entry = selectedZipPdfEntries[i];
        statusText.innerText = `⏳ Analizando archivo ${i + 1} de ${selectedZipPdfEntries.length}: ${entry.name.split('/').pop()}`;
        
        try {
            // Leer el archivo como ArrayBuffer
            const arrayBuffer = await entry.async('arraybuffer');
            const fileDate = new Date().toISOString().split('T')[0]; // fecha por defecto
            
            let lic = null;

            // Intentar 1: leer el texto del PDF con PDF.js
            try {
                if (typeof pdfjsLib !== 'undefined') {
                    // Configurar worker
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    
                    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
                    let fullText = '';
                    for (let pIdx = 1; pIdx <= Math.min(pdf.numPages, 4); pIdx++) {
                        const page = await pdf.getPage(pIdx);
                        const content = await page.getTextContent();
                        const pageText = content.items.map(item => item.str).join(' ');
                        fullText += pageText + '\n';
                    }
                    
                    if (fullText && fullText.length > 100) {
                        lic = parsePdfText(fullText, fileDate);
                    }
                }
            } catch (e) {
                console.warn('PDF.js no pudo leer del ZIP:', entry.name, e);
            }

            // Intentar 2: fallback por nombre de archivo
            if (!lic) {
                const baseFilename = entry.name.split('/').pop();
                lic = parsePdfFilename(baseFilename, fileDate);
            }

            if (lic && lic.refCode && lic.buyerName && lic.beatName) {
                const existingIdx = licenseHistory.findIndex(l => l.refCode === lic.refCode);
                if (existingIdx !== -1) {
                    licenseHistory[existingIdx] = lic;
                    duplicateCount++;
                } else {
                    licenseHistory.push(lic);
                    importedCount++;
                }
            } else {
                console.warn('No se pudo interpretar la licencia del ZIP:', entry.name);
                errorCount++;
            }
        } catch (err) {
            console.error('Error procesando entrada del ZIP:', entry.name, err);
            errorCount++;
        }
    }

    // Guardar cambios e informar
    if (importedCount > 0 || duplicateCount > 0) {
        saveHistory();
        let msg = `Análisis de ZIP finalizado. `;
        if (importedCount > 0) msg += `Añadidas ${importedCount}. `;
        if (duplicateCount > 0) msg += `Actualizadas ${duplicateCount}. `;
        if (errorCount > 0) msg += `${errorCount} no reconocidos.`;
        showToast(msg);
        statusText.innerHTML = `✅ ¡Análisis completado! Añadidas: ${importedCount}, Actualizadas: ${duplicateCount}, Errores: ${errorCount}`;
    } else {
        showToast('No se pudo interpretar ningún PDF del ZIP', true);
        statusText.innerHTML = `⚠️ No se cargó ninguna licencia. Errores: ${errorCount}`;
    }

    // Resetear
    selectedZipPdfEntries = [];
    document.getElementById('input-import-zip').value = '';
    btn.innerHTML = originalText;
    btn.disabled = false;
    btn.style.display = 'none';
    isAnalyzingZip = false;
    safeCreateIcons();
}

// Extraer todo el texto de un PDF usando PDF.js
async function extractPdfText(file) {
    if (typeof pdfjsLib === 'undefined') {
        try {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        } catch (e) {
            console.error("No se pudo cargar PDF.js:", e);
            return null;
        }
    }
    if (typeof pdfjsLib === 'undefined') return null;

    // Configurar worker
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map(item => item.str).join(' ');
        fullText += pageText + '\n';
    }

    return fullText;
}

// Parsear texto de contrato extraído del PDF
// Funciona con: sossa.pdf, LICENCIA 60$.pdf, contratos en español e inglés
function parsePdfText(text, fileDate) {
    const t = text;

    // ── TIPO DE LICENCIA ─────────────────────────────────────────
    let type = 'basic';
    if (/premium[\s_]?plus/i.test(t)) type = 'premium_plus';
    else if (/premium/i.test(t))   type = 'premium';
    if (/ilimitad|unlimited/i.test(t)) type = 'unlimited_flp';
    if (/exclusiv/i.test(t))  type = 'exclusive';

    // ── BEAT NAME ────────────────────────────────────────────────
    let beatName = '';
    const beatPatterns = [
        // Formato exclusivo: LICENCIA EXCLUSIVA BANDIDAJE Y TRIP en encabezado
        /LICENCIA EXCLUSIVA\s+([A-ZÁÉÍÓÚ][^"\n]{2,50})/i,
        // Formato estándar español: titulado "Beat"
        /titulado\s+["«]([^"»\n]+)["»]/i,
        // Formato exclusivo: composiciones tituladas "X" y "Y"
        /composiciones? musicales? tituladas?\s+["«]([^"»\n]+)["»]/i,
        // Formato inglés: entitled Beat
        /entitled\s+([^\s(\n]+)/i,
        // Formato fallback: la Obra "..."
        /la Obra\s+["«]([^"»\n]+)["»]/i,
        /Explotaci[oó]n de la Obra\s+"([^"]+)"/i,
        // Beat: "nombre" — capturer genérico
        /[Bb]eat["\s:]+["«]?([^"»\n,\.]{2,40})["»]?/i,
    ];
    for (const p of beatPatterns) {
        const m = t.match(p);
        if (m && m[1].trim().length > 1) { beatName = m[1].trim(); break; }
    }

    // ── COMPRADOR / ARTISTA ───────────────────────────────────────
    let buyerName = '';
    const buyerPatterns = [
        // Formato exclusivo: "Sossa ... y NOMBRE ( el "Artista")"
        /[Ss]ossa[^\n]*?y\s+([A-ZÁÉÍÓÚ][a-záéíóúA-Z][^(\n]{5,50})\s*\(/,
        // Formato exclusivo: "Acuerdo entre: Sossa ... y Nombre"
        /Acuerdo entre[:\s]+[^\n]+?y\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+){1,4})/i,
        // Formato estándar español
        /El Licenciatario \(Usuario\):\*\*\s+([^,\n]+)/i,
        // Formato inglés
        /Licensee \(Artist\):\s+\[?([^\]\n]+)\]?/i,
        // Licenciatario genérico
        /Licenciatario[^:]*:\s+([A-ZÁÉÍÓÚ][a-záéíóú]+(?:\s+[A-ZÁÉÍÓÚ][a-záéíóú]+){1,4})/,
    ];
    for (const p of buyerPatterns) {
        const m = t.match(p);
        if (m) {
            buyerName = (m[1] || m[0]).trim()
                .replace(/\*+/g, '').replace(/^\[|\]$/g, '').trim();
            if (buyerName.length > 3) break;
        }
    }

    // ── CEDULA / ID ───────────────────────────────────────────────
    let buyerId = '';
    const idMatch = t.match(/identidad Nro\.?\s+([\d\w-]+)/i) ||
                    t.match(/C[eé]dula[:\s]+(\d{6,12})/i);
    if (idMatch) buyerId = idMatch[1].trim();

    // ── EMAIL ─────────────────────────────────────────────────────
    let buyerEmail = '';
    const emailMatch = t.match(/correo electr[oó]nico[^:]*:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
    if (emailMatch) buyerEmail = emailMatch[1].trim();

    // ── CIUDAD / PAÍS ─────────────────────────────────────────────
    let buyerCity = '', buyerCountry = '';
    const cityMatch = t.match(/ciudad de ([^,\n]+),\s*([A-Z][a-záéíóú]+)/i);
    if (cityMatch) { buyerCity = cityMatch[1].trim(); buyerCountry = cityMatch[2].trim(); }

    // ── LUGAR DE CELEBRACIÓN ──────────────────────────────────────
    let celebrationPlace = '';
    const placeMatch = t.match(/Lugar de Celebraci[oó]n[*:\s]+([^\n*]+)/i);
    if (placeMatch) celebrationPlace = placeMatch[1].trim();

    // ── FECHA ─────────────────────────────────────────────────────
    let date = fileDate;
    const datePatterns = [
        /Fecha de Entrada en Vigor[*:\s]+([^\n*]+)/i,
        /Effective Date:\s+([^\n]+)/i,
        /having been made on and effective as of\s+([^-\n]+)/i,
    ];
    for (const p of datePatterns) {
        const m = t.match(p);
        if (m) { const d = parseEspanolDate(m[1].trim()); if (d) { date = d; break; } }
    }

    // ── VALOR ─────────────────────────────────────────────────────
    let value = LICENSE_CONFIGS[type]?.price || 29.99;
    const valueMatch = t.match(/tarifa[^$]*\$\s*([\d,]+(?:\.\d{2})?)\s*USD/i) ||
                       t.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*USD/i) ||
                       t.match(/License Fee[^$]*\$\s*\[?([\d,]+(?:\.\d{2})?)\]?/i) ||
                       t.match(/cantidad de[^$]*\$\s*([\d.]+)\s*USD/i);
    if (valueMatch) value = parseFloat(valueMatch[1].replace(',', '')) || value;

    // ── LUGAR (exclusivo usa "leyes de CIUDAD") ───────────────────
    if (!celebrationPlace) {
        const lawMatch = t.match(/leyes de ([^,\n]+),\s*([A-Z]+)/i);
        if (lawMatch) celebrationPlace = `${lawMatch[1].trim()}, ${lawMatch[2].trim()}`;
    }

    // ── CÓDIGO DE REFERENCIA ──────────────────────────────────────
    let refCode = '';
    const refMatch = t.match(/Invoice\s*#\s*([A-Za-z0-9._\-]+)/i) ||
                     t.match(/C[oó]digo de Referencia[^#]*#\s*([A-Za-z0-9._\-]+)/i) ||
                     t.match(/\b(BS3-\d{8}-(?:BAS|PRE|PPL|ILM|EXC|GEN)-(?:[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-){4}[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}|BS-\d{8}-(?:BAS|PRE|PPL|ILM|EXC|GEN)-[A-Z0-9]{6,12}|LIC-[A-Z]+-\d{8}-\d+)\b/i);
    if (refMatch) refCode = refMatch[1].trim();
    // Un PDF histórico sin referencia no se convierte artificialmente en una
    // licencia válida al importarlo. Debe regularizarse con una adenda/registro
    // verificable, no con un código nuevo creado al leerlo.
    if (!isValidLicenseReference(refCode)) return null;

    // ── MÉTODO DE PAGO ────────────────────────────────────────────
    let paymentMethod = 'Transferencia Bancaria';
    const payMatch = t.match(/M[eé]todo de Pago[*:\s]+([^\n*]+)/i);
    if (payMatch) paymentMethod = payMatch[1].trim();

    // Validación mínima
    if (!beatName || !buyerName) return null;

    const config = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;
    return {
        refCode, date, beatName, buyerName, type, value, paymentMethod,
        formData: {
            buyerId, buyerEmail,
            buyerPhone: '',
            buyerCity, buyerCountry, celebrationPlace,
            formats: config.formats,
            streams: config.streams,
            physical: config.physical,
            videos: config.videos,
            videoDuration: config.videoDuration,
            years: config.years,
            terminationFee: type === 'exclusive'
                ? 'No aplica'
                : `200% ($${(value * 2).toFixed(2)} USD)`,
            writerShare: 50, producerShare: 50,
            credits: config.credits,
            contentId: config.contentId
        }
    };
}

// Convertir fecha en español o inglés a YYYY-MM-DD
function parseEspanolDate(str) {
    if (!str) return null;
    str = str.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const months = {
        enero:'01',february:'02',feb:'02',febrero:'02',march:'03',marzo:'03',
        april:'04',abril:'04',may:'05',mayo:'05',june:'06',junio:'06',
        july:'07',julio:'07',august:'08',agosto:'08',september:'09',
        septiembre:'09',october:'10',octubre:'10',november:'11',noviembre:'11',
        december:'12',diciembre:'12',jan:'01',jun:'06',jul:'07',aug:'08',
        sep:'09',oct:'10',nov:'11',dec:'12'
    };

    // DD de MES de YYYY / Day, DD de MES de YYYY
    const m1 = str.match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    if (m1) {
        const mm = months[m1[2].toLowerCase()] || '01';
        return `${m1[3]}-${mm}-${m1[1].padStart(2,'0')}`;
    }
    // Month DD, YYYY (English)
    const m2 = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
    if (m2) {
        const mm = months[m2[1].toLowerCase()] || '01';
        return `${m2[3]}-${mm}-${m2[2].padStart(2,'0')}`;
    }
    // DD/MM/YYYY
    const m3 = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (m3) return `${m3[3]}-${m3[2].padStart(2,'0')}-${m3[1].padStart(2,'0')}`;

    return null;
}

// Parsear SOLO por nombre de archivo (fallback)
function parsePdfFilename(filename, fileDate) {
    let name = filename.replace(/\.pdf$/i, '');
    let type = 'basic', refCode = '', beatName = '', buyerName = '', date = fileDate;

    // Formato actual: Licencia_PREMIUM_BS3-20260913-PRE-7K2M-9Q4D-H6J8-ABCD-EFGH - Beat - Comprador.
    // Se conservan también los formatos BS-* y LIC-* usados anteriormente.
    const m1 = name.match(
        /^Licencia[_ ](BASICA|B[AÁ]SICA|PREMIUM(?:[_ ]PLUS)?|ILIMITADA|EXCLUSIVA)[_ ]([A-Za-z0-9][A-Za-z0-9._-]{2,159})\s*-\s*(.+?)\s*-\s*(.+)$/i
    );
    if (m1 && isValidLicenseReference(m1[2])) {
        type = mapTypeWord(m1[1]); refCode = m1[2].trim();
        beatName = m1[3].trim(); buyerName = m1[4].trim();
        date = extractDateFromRefCode(refCode) || fileDate;
        return buildLicenseRecord(refCode, date, beatName, buyerName, type);
    }

    // Formato: Licencia_PREMIUM_LIC-PREM-20260525-2872_Pa_Un_Lao_Comprador
    const parts = name.split('_');
    const refIdx = parts.findIndex(p => isValidLicenseReference(p));
    if (refIdx !== -1) {
        refCode = parts[refIdx];
        type = mapTypeWord(parts[refIdx - 1] || '');
        date = extractDateFromRefCode(refCode) || fileDate;
        const rem = parts.slice(refIdx + 1).filter(p => p.length > 0);
        if (rem.length >= 5) {
            beatName  = rem.slice(0, rem.length - 4).join(' ');
            buyerName = rem.slice(rem.length - 4).join(' ');
        } else if (rem.length >= 2) {
            const mid = Math.ceil(rem.length / 2);
            beatName = rem.slice(0, mid).join(' ');
            buyerName = rem.slice(mid).join(' ');
        } else {
            beatName = rem[0] || 'Beat'; buyerName = 'Comprador';
        }
        return buildLicenseRecord(refCode, date, beatName, buyerName, type);
    }

    return null;
}

function extractDateFromRefCode(rc) {
    const m = rc.match(/(\d{4})(\d{2})(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function mapTypeWord(w) {
    w = w.toUpperCase();
    if (w.includes('PPLUS')) return 'premium_plus';
    if (w.includes('PREM')) return 'premium';
    if (w.includes('ILIM') || w.includes('ULFLP') || w.includes('UNLIM')) return 'unlimited_flp';
    if (w.includes('EXCL')) return 'exclusive';
    return 'basic';
}

function buildLicenseRecord(refCode, date, beatName, buyerName, type) {
    const config = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;
    return {
        refCode,
        contractReference: refCode,
        reference: refCode,
        referenceVersion: getLicenseReferenceVersion(refCode),
        date, beatName, buyerName, type,
        value: config.price,
        paymentMethod: 'Transferencia Bancaria',
        formData: {
            buyerId: '', buyerEmail: '', buyerPhone: '',
            buyerCity: '', buyerCountry: '', celebrationPlace: '',
            formats: config.formats, streams: config.streams,
            physical: config.physical, videos: config.videos,
            videoDuration: config.videoDuration, years: config.years,
            terminationFee: type === 'exclusive'
                ? 'No aplica' : `200% ($${(config.price * 2).toFixed(2)} USD)`,
            writerShare: 50, producerShare: 50,
            credits: config.credits, contentId: config.contentId
        }
    };
}

// ==========================================================================
// INTEGRACIÓN DOCUSIGN - OAUTH Y REST API (CLIENT-SIDE)
// ==========================================================================

// Detección y lectura del Token OAuth de DocuSign
function checkDocuSignOAuth() {
    const hash = window.location.hash;
    if (hash && hash.includes('access_token=')) {
        const params = new URLSearchParams(hash.substring(1)); // remover el '#'
        const accessToken = params.get('access_token');
        const expiresIn = params.get('expires_in');
        
        if (accessToken) {
            // Guardar token en sessionStorage (válido para la pestaña actual)
            sessionStorage.setItem('docusign_access_token', accessToken);
            // Calcular fecha de expiración
            const expiryTime = Date.now() + (Number(expiresIn) || 28800) * 1000;
            sessionStorage.setItem('docusign_access_token_expiry', expiryTime);
            
            // Limpiar el hash de la URL para estética y seguridad
            history.pushState("", document.title, window.location.pathname + window.location.search);
            
            // Mostrar confirmación
            setTimeout(() => {
                showToast('Sesión con DocuSign iniciada con éxito');
            }, 1000);
        }
    }
}

// Iniciar sesión en DocuSign (OAuth Implicit Grant)
function loginToDocuSign() {
    const clientId = producerConfig.dsClientId;
    if (!clientId) {
        showToast('Por favor, ingresa tu Integration Key (Client ID) en la Configuración de Productor.', true);
        openSettingsModal();
        return;
    }

    const env = producerConfig.dsEnv || "demo";
    // Determinar la URL de autenticación
    const authUrl = env === "live" 
        ? "https://account.docusign.com/oauth/auth"
        : "https://account-d.docusign.com/oauth/auth";

    // Registrar esta misma página como redirect_uri
    const redirectUri = encodeURIComponent(window.location.origin + window.location.pathname);
    
    // Armar URL de redirección OAuth
    const loginUrl = `${authUrl}?response_type=token&scope=signature%20cors&client_id=${clientId}&redirect_uri=${redirectUri}&state=docusign`;
    
    // Redirigir a DocuSign
    window.location.href = loginUrl;
}

// Generar PDF y enviar sobre a DocuSign
async function sendToDocuSign() {
    if (!window.currentUserIsPro) {
        openPaymentModal('La firma digital con DocuSign es una característica exclusiva del Plan Pro.');
        return;
    }

    const contractReference = getRequiredManualReference();
    if (!contractReference) return;

    // Validaciones de formulario necesarias
    if (!validateLicenseForm()) {
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();

    // Validar configuración de DocuSign
    const clientId = producerConfig.dsClientId;
    if (!clientId) {
        showToast('Configura tu Integration Key (Client ID) de DocuSign antes de enviar a firmar.', true);
        openSettingsModal();
        return;
    }

    // Comprobar token activo en la sesión
    const token = sessionStorage.getItem('docusign_access_token');
    const expiry = sessionStorage.getItem('docusign_access_token_expiry');
    
    if (!token || (expiry && Date.now() > Number(expiry))) {
        showToast('Iniciando sesión en tu cuenta de DocuSign...');
        setTimeout(() => {
            loginToDocuSign();
        }, 1000);
        return;
    }

    const btn = document.getElementById('btn-docusign');
    const originalText = btn.innerHTML;

    if (typeof html2pdf === 'undefined') {
        try {
            btn.innerHTML = '⏳ Cargando librería PDF...';
            btn.disabled = true;
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        } catch (e) {
            showToast('Librería PDF no cargada. Conéctate a Internet e inténtalo de nuevo.', true);
            return;
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Generando PDF...';
    btn.disabled = true;
    safeCreateIcons();

    // Generar el PDF en memoria y obtener base64
    const element = document.getElementById('rendered-contract-content');
    const opt = {
        margin:       [15, 20, 15, 20],
        filename:     'Contrato.pdf',
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
        pagebreak:    { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
    };

    element.classList.add('printing-pdf');

    html2pdf().from(element).set(opt).outputPdf('datauristring')
        .then(dataUriStr => {
            element.classList.remove('printing-pdf');
            const base64Str = dataUriStr.split(',')[1];
            postEnvelopeToDocuSign(token, base64Str);
        })
        .catch(err => {
            element.classList.remove('printing-pdf');
            console.error('Error al compilar base64 para DocuSign:', err);
            showToast('Error al procesar el PDF para DocuSign', true);
            btn.innerHTML = originalText;
            btn.disabled = false;
        });
}

// Limpiar y extraer mensajes útiles de respuestas de error HTML de DocuSign
function cleanHtmlError(htmlStr) {
    if (!htmlStr) return '';
    if (htmlStr.includes('<html') || htmlStr.includes('<HTML') || htmlStr.includes('<!DOCTYPE') || htmlStr.includes('<!doctype')) {
        const titleMatch = htmlStr.match(/<title>([\s\S]*?)<\/title>/i);
        const h1Match = htmlStr.match(/<h1>([\s\S]*?)<\/h1>/i);
        let extracted = '';
        if (titleMatch && titleMatch[1]) {
            extracted += 'Título: ' + titleMatch[1].trim() + '. ';
        }
        if (h1Match && h1Match[1]) {
            extracted += 'Detalle: ' + h1Match[1].trim() + '. ';
        }
        if (extracted) {
            let clean = extracted.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
            if (clean.length > 300) clean = clean.substring(0, 300) + '...';
            return clean;
        }
        let clean = htmlStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        if (clean.length > 300) clean = clean.substring(0, 300) + '...';
        return clean;
    }
    let clean = htmlStr.trim();
    if (clean.length > 300) clean = clean.substring(0, 300) + '...';
    return clean;
}

// Llamar a la REST API de sobres de DocuSign
async function postEnvelopeToDocuSign(token, base64Str) {
    const btn = document.getElementById('btn-docusign');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Conectando DocuSign...';
    safeCreateIcons();

    const env = producerConfig.dsEnv || "demo";
    const userinfoUrl = env === "live"
        ? "https://account.docusign.com/oauth/userinfo"
        : "https://account-d.docusign.com/oauth/userinfo";

    try {
        // 1. Obtener información de cuenta del usuario
        const userinfoRes = await fetch(userinfoUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!userinfoRes.ok) {
            throw new Error('Token expirado o no autorizado. Por favor, vuelve a iniciar sesión en DocuSign.');
        }
        
        let userInfo;
        const userinfoType = userinfoRes.headers.get("content-type");
        if (userinfoType && userinfoType.includes("application/json")) {
            userInfo = await userinfoRes.json();
        } else {
            const textErr = await userinfoRes.text();
            console.error('Respuesta no-JSON de UserInfo:', textErr);
            const cleanErr = cleanHtmlError(textErr);
            throw new Error(`Error de DocuSign (HTTP ${userinfoRes.status}) al obtener datos del usuario: ${cleanErr || 'Respuesta HTML no válida'}`);
        }
        
        const account = userInfo.accounts.find(acc => acc.is_default) || userInfo.accounts[0];
        
        if (!account) {
            throw new Error('No se encontró ninguna cuenta de DocuSign vinculada a tus credenciales.');
        }

        const accountId = account.account_id;
        const baseUri = account.base_uri + "/restapi";

        // 2. Definir datos de sobre
        const buyerName = document.getElementById('buyer-name').value.trim();
        const buyerEmail = document.getElementById('buyer-email').value.trim();
        const beatName = document.getElementById('beat-name').value.trim() || "Beat";
        const type = getActiveLicenseType();
        const refCode = contractReference;

        btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Enviando sobre...';
        safeCreateIcons();

        const envelopeData = {
            emailSubject: `Firma Requerida: Licencia de Uso Musical - ${beatName} (${buyerName})`,
            documents: [
                {
                    documentBase64: base64Str,
                    name: `Licencia_${type.toUpperCase()}_${refCode}.pdf`,
                    fileExtension: "pdf",
                    documentId: "1"
                }
            ],
            recipients: {
                signers: [
                    {
                        email: buyerEmail,
                        name: buyerName,
                        recipientId: "1",
                        routingOrder: "1",
                        tabs: {
                            signHereTabs: [
                                {
                                    anchorString: "Firma del Licenciatario",
                                    anchorXOffset: "10",
                                    anchorYOffset: "20",
                                    anchorIgnoreIfNotPresent: "true",
                                    anchorUnits: "pixels"
                                }
                            ]
                        }
                    }
                ]
            },
            status: "sent"
        };

        // 3. POST a Envelopes Endpoint
        const envelopesUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes`;
        const envelopesRes = await fetch(envelopesUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(envelopeData)
        });

        let results;
        const envelopesType = envelopesRes.headers.get("content-type");
        if (envelopesType && envelopesType.includes("application/json")) {
            results = await envelopesRes.json();
        } else {
            const textErr = await envelopesRes.text();
            console.error('Respuesta de error no-JSON de DocuSign:', textErr);
            const cleanErr = cleanHtmlError(textErr);
            throw new Error(`Error de DocuSign (HTTP ${envelopesRes.status}) al llamar a ${envelopesUrl}: ${cleanErr || 'Respuesta HTML no válida'}`);
        }
        
        if (!envelopesRes.ok) {
            console.error('Error de API DocuSign:', results);
            throw new Error(results.message || 'Error al procesar el sobre en DocuSign.');
        }

        showToast('¡Contrato de licencia enviado con éxito vía DocuSign! El comprador recibirá el email de firma en breve.');
        console.log('Envelope ID generado:', results.envelopeId);

        // Guardar la licencia en el historial automáticamente
        saveCurrentLicenseToHistory(true);

        // Guardar datos del sobre para el envío posterior de entrega
        const currentBuyerName  = document.getElementById('buyer-name').value.trim();
        const currentBuyerEmail = document.getElementById('buyer-email').value.trim();
        sessionStorage.setItem('ds_pending_envelope', JSON.stringify({
            envelopeId:  results.envelopeId,
            accountId:   accountId,
            baseUri:     baseUri,
            buyerName:   currentBuyerName,
            buyerEmail:  currentBuyerEmail
        }));

        // Mostrar el botón de entrega con PDF firmado
        const signedBtn = document.getElementById('btn-send-signed-delivery');
        if (signedBtn) {
            signedBtn.style.display = 'block';
            safeCreateIcons();
        }

    } catch (err) {
        console.error('Fallo en la integración de DocuSign:', err);
        showToast(err.message, true);
        
        // Limpiar sesión en caso de expiración o fallo de credenciales (incluyendo 401 y 403)
        if (err.message.includes('Token') || err.message.includes('autenticar') || err.message.includes('autorizado') || err.message.includes('401') || err.message.includes('403')) {
            sessionStorage.removeItem('docusign_access_token');
            sessionStorage.removeItem('docusign_access_token_expiry');
        }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// Convertir data URI (base64) de html2pdf a un objeto Blob usando fetch nativo
async function dataURLtoBlob(dataurl) {
    const res = await fetch(dataurl);
    return await res.blob();
}
window.dataURLtoBlob = dataURLtoBlob;

// ============================================================
// INTEGRACIÓN GOOGLE DRIVE
// ============================================================

let platformGDriveClientId = '';
let platformGDriveExpectedEmail = 'sossamusic@gmail.com';
let beatStarsMigrationTicket = '';

function setBeatStarsMigrationStatus(message, color = '#8a91a6') {
    const statusEl = document.getElementById('cfg-beatstars-migration-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.style.color = color;
}

function clearBeatStarsMigrationTicket() {
    beatStarsMigrationTicket = '';
    const ticketInput = document.getElementById('cfg-beatstars-migration-ticket');
    const copyButton = document.getElementById('btn-copy-beatstars-migration-ticket');
    if (ticketInput) ticketInput.value = '';
    if (copyButton) copyButton.disabled = true;
}

async function createBeatStarsMigrationTicket() {
    const createButton = document.getElementById('btn-create-beatstars-migration-ticket');
    if (!auth.currentUser) {
        showToast('Inicia sesión de nuevo para crear una clave de migración.', true);
        return;
    }
    const originalLabel = createButton?.innerHTML;
    try {
        if (createButton) {
            createButton.disabled = true;
            createButton.textContent = 'Creando clave temporal...';
        }
        clearBeatStarsMigrationTicket();
        setBeatStarsMigrationStatus('Verificando tu sesión y preparando la autorización temporal...');
        const idToken = await auth.currentUser.getIdToken();
        const response = await fetch('/api/beatstars-migration', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ action: 'create_ticket' })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ticket) {
            throw new Error(data.error || 'No se pudo crear la clave temporal.');
        }
        beatStarsMigrationTicket = String(data.ticket);
        const ticketInput = document.getElementById('cfg-beatstars-migration-ticket');
        const copyButton = document.getElementById('btn-copy-beatstars-migration-ticket');
        if (ticketInput) ticketInput.value = beatStarsMigrationTicket;
        if (copyButton) copyButton.disabled = false;
        const expiry = new Date(Number(data.expiresAt));
        const expiryLabel = Number.isNaN(expiry.getTime())
            ? '20 minutos'
            : expiry.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setBeatStarsMigrationStatus(`Clave lista y oculta. Cópiala para el MCP; vence a las ${expiryLabel}.`, '#48bb78');
        showToast('Clave temporal creada. Cópiala sólo en la configuración local del MCP.');
    } catch (error) {
        clearBeatStarsMigrationTicket();
        setBeatStarsMigrationStatus(error.message || 'No se pudo crear la clave temporal.', '#e53e3e');
        showToast(error.message || 'No se pudo crear la clave temporal.', true);
    } finally {
        if (createButton) {
            createButton.disabled = false;
            createButton.innerHTML = originalLabel || 'Crear clave temporal';
            safeCreateIcons();
        }
    }
}

async function copyBeatStarsMigrationTicket() {
    if (!beatStarsMigrationTicket) {
        showToast('Primero crea una clave temporal de migración.', true);
        return;
    }
    try {
        await navigator.clipboard.writeText(beatStarsMigrationTicket);
        showToast('Clave temporal copiada. Pégala sólo en la variable local BEATSS_MIGRATION_KEY del MCP.');
    } catch (error) {
        showToast('No se pudo copiar la clave. Intenta crear una nueva.', true);
    }
}

// Cargar estado de la cuenta central de Google Drive (Admin)
async function loadPlatformGDriveStatus() {
    const statusEl = document.getElementById('cfg-gdrive-central-status');
    const linkButton = document.getElementById('btn-link-central-gdrive');
    if (!statusEl) return;
    statusEl.textContent = 'Verificando estado...';
    statusEl.style.color = '#8a91a6';
    if (linkButton) linkButton.disabled = true;
    try {
        if (!auth.currentUser) {
            platformGDriveClientId = '';
            statusEl.textContent = 'Inicia sesión como administrador para verificar Google Drive.';
            statusEl.style.color = '#e53e3e';
            if (linkButton) linkButton.disabled = true;
            return;
        }
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/gdrive-status', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await res.json();
        platformGDriveClientId = '';
        platformGDriveExpectedEmail = res.ok
            ? String(data.expectedEmail || 'sossamusic@gmail.com').trim().toLowerCase()
            : 'sossamusic@gmail.com';

        if (res.ok && data.linked) {
            statusEl.textContent = `✓ Vinculado de forma segura a ${data.email}`;
            statusEl.style.color = '#48bb78';
            if (linkButton) linkButton.textContent = `Volver a vincular ${data.email}`;
        } else if (res.ok && !data.oauthReady) {
            statusEl.textContent = 'Falta configurar Google OAuth en el servidor.';
            statusEl.style.color = '#e6a23c';
        } else {
            statusEl.textContent = `No vinculado. Autoriza la cuenta ${data.expectedEmail || 'sossamusic@gmail.com'}.`;
            statusEl.style.color = '#e53e3e';
        }

        if (linkButton) {
            linkButton.disabled = !res.ok || !data.oauthReady;
            if (!data.linked && data.oauthReady) {
                linkButton.textContent = `Vincular ${data.expectedEmail || 'sossamusic@gmail.com'}`;
            }
        }
    } catch (e) {
        console.error('Error al cargar estado de Drive Central:', e);
        platformGDriveClientId = '';
        statusEl.textContent = 'No se pudo verificar Google Drive en este momento.';
        statusEl.style.color = '#e53e3e';
        if (linkButton) linkButton.disabled = true;
    }
}

// Iniciar flujo de vinculación OAuth (Admin)
async function initPlatformGDriveOAuth() {
    if (!auth.currentUser) {
        showToast('Inicia sesión de nuevo para administrar Google Drive.', true);
        return;
    }

    try {
        const idToken = await auth.currentUser.getIdToken();
        const oauthResponse = await fetch('/api/gdrive-oauth-client', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const oauthData = await oauthResponse.json();
        if (!oauthResponse.ok || !oauthData.clientId) {
            throw new Error(oauthData.error || 'Google OAuth todavía no está configurado en el servidor.');
        }
        platformGDriveClientId = String(oauthData.clientId).trim();
        platformGDriveExpectedEmail = String(oauthData.expectedEmail || 'sossamusic@gmail.com').trim().toLowerCase();
    } catch (error) {
        platformGDriveClientId = '';
        showToast(error.message || 'No se pudo preparar la vinculación con Google.', true);
        return;
    }

    try {
        await ensureGoogleIdentityServices();
    } catch (error) {
        showToast(error.message, true);
        return;
    }

    showToast('☁️ Abriendo ventana de Google para vinculación central...');
    
    const client = google.accounts.oauth2.initCodeClient({
        client_id: platformGDriveClientId,
        scope: 'openid email https://www.googleapis.com/auth/drive.file',
        ux_mode: 'popup',
        login_hint: platformGDriveExpectedEmail,
        select_account: true,
        callback: async (response) => {
            if (response.error) {
                showToast('Error de Google: ' + response.error, true);
                return;
            }
            const code = response.code;
            
            // Mostrar cargando
            const statusEl = document.getElementById('cfg-gdrive-central-status');
            if (statusEl) statusEl.textContent = 'Guardando vinculación en el servidor...';
            
            try {
                const idToken = await auth.currentUser.getIdToken();
                const res = await fetch('/api/gdrive-setup', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`,
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({ code })
                });
                const resData = await res.json();
                if (res.ok && resData.success) {
                    window.producerConfig = window.producerConfig || {};
                    window.producerConfig.storageProvider = 'gdrive-central';
                    const storageSelect = document.getElementById('cfg-storage-provider');
                    if (storageSelect) storageSelect.value = 'gdrive-central';
                    showToast(`¡Google Drive Central vinculado con éxito a ${resData.email}!`);
                    loadPlatformGDriveStatus();
                } else {
                    showToast('Error al vincular: ' + (resData.error || 'error desconocido'), true);
                    loadPlatformGDriveStatus();
                }
            } catch (e) {
                console.error(e);
                showToast('Error de red al conectar con el servidor', true);
                loadPlatformGDriveStatus();
            }
        },
        error_callback: (error) => {
            const type = String(error?.type || 'desconocido');
            if (type === 'popup_closed') {
                showToast('Cerraste la ventana de Google antes de autorizar.', true);
            } else if (type === 'popup_failed_to_open') {
                showToast('Chrome bloqueó la ventana de Google. Permite ventanas emergentes y vuelve a intentarlo.', true);
            } else {
                showToast(`No se pudo abrir la autorización de Google (${type}).`, true);
            }
            loadPlatformGDriveStatus();
        }
    });
    client.requestCode();
}

// Cargar estado de la cuenta de Google vinculada para iniciar sesión
function updateGoogleLoginLinkStatus() {
    const statusEl = document.getElementById('cfg-google-login-status');
    const btnLink = document.getElementById('btn-link-google-login');
    if (!statusEl || !btnLink) return;

    const user = auth.currentUser;
    if (!user) {
        statusEl.textContent = 'Inicia sesión para administrar el acceso con Google.';
        statusEl.style.color = '#e53e3e';
        btnLink.disabled = true;
        safeCreateIcons();
        return;
    }

    btnLink.disabled = false;
    const googleProv = user.providerData.find(p => p.providerId === 'google.com');
    if (googleProv) {
        statusEl.innerHTML = `<span style="color: #48bb78; font-weight: 600;">✓ Vinculado a:</span> ${googleProv.email || user.email}`;
        btnLink.innerHTML = `<i data-lucide="link-2-off" style="width: 14px; height: 14px;"></i> Desvincular Cuenta`;
        btnLink.className = "btn btn-secondary";
        btnLink.style.background = "rgba(239, 68, 68, 0.1)";
        btnLink.style.borderColor = "rgba(239, 68, 68, 0.2)";
        btnLink.style.color = "#ef4444";
    } else {
        statusEl.innerHTML = `<span style="color: #e53e3e; font-weight: 600;">✗ No vinculado</span><br><span style="font-size: 10px; color: #8a91a6;">Vincula tu cuenta de Google para iniciar sesión con un solo clic.</span>`;
        btnLink.innerHTML = `<i data-lucide="link" style="width: 14px; height: 14px;"></i> Vincular Cuenta de Google`;
        btnLink.className = "btn btn-secondary";
        btnLink.style.background = "rgba(255, 255, 255, 0.05)";
        btnLink.style.borderColor = "var(--border-color)";
        btnLink.style.color = "#fff";
    }
    safeCreateIcons();
}

// Iniciar flujo para vincular/desvincular cuenta de Google de inicio de sesión
async function linkGoogleAccountForLogin() {
    const user = auth.currentUser;
    if (!user) return;

    const googleProv = user.providerData.find(p => p.providerId === 'google.com');
    if (googleProv) {
        if (!confirm("¿Estás seguro de desvincular tu cuenta de Google? Tendrás que iniciar sesión con tu correo y contraseña.")) return;
        try {
            showToast("Desvinculando cuenta de Google...");
            await unlink(user, 'google.com');
            showToast("Cuenta de Google desvinculada");
            updateGoogleLoginLinkStatus();
        } catch (err) {
            console.error("Error al desvincular Google:", err);
            showToast("Error al desvincular: " + err.message, true);
        }
    } else {
        try {
            showToast("Iniciando vinculación con Google...");
            const result = await linkWithPopup(user, googleProvider);
            if (result && result.user) {
                showToast("¡Cuenta de Google vinculada con éxito!");
                updateGoogleLoginLinkStatus();
            }
        } catch (err) {
            console.error("Error al vincular Google:", err);
            if (err.code === 'auth/credential-already-in-use') {
                showToast("Esta cuenta de Google ya está vinculada a otro usuario.", true);
            } else {
                showToast("Error al vincular: " + err.message, true);
            }
        }
    }
}

// Obtener token de acceso para la cuenta central de Google Drive de Sossa
async function getCentralGdriveToken() {
    throw new Error("getCentralGdriveToken está deshabilitado por motivos de seguridad.");
}
window.getCentralGdriveToken = getCentralGdriveToken;

// Obtener token de acceso de Google Drive (abre popup si es necesario)
async function getGdriveToken() {
    const cachedToken = sessionStorage.getItem('gdrive_access_token');
    const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
    if (cachedToken && Date.now() < expiry - 60000) return cachedToken;

    const clientId = producerConfig.gdriveClientId;
    if (!clientId) throw new Error('Google Drive Client ID no configurado.');
    await ensureGoogleIdentityServices();

    showToast('☁️ Abriendo ventana de Google Drive... (acepta el permiso en el popup)');

    return new Promise((resolve, reject) => {
        // Timeout de 20 segundos para no quedar colgado si Chrome bloquea el popup
        const timeoutId = setTimeout(() => {
            reject(new Error(`Timeout de autenticación con Google Drive. Asegúrate de permitir popups para el dominio activo (${window.location.host}) y vuelve a intentarlo.`));
        }, 20000);

        const tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response) => {
                clearTimeout(timeoutId);
                if (response.error) {
                    reject(new Error('Error de autenticación con Google Drive: ' + response.error));
                    return;
                }
                sessionStorage.setItem('gdrive_access_token', response.access_token);
                sessionStorage.setItem('gdrive_token_expiry', String(Date.now() + response.expires_in * 1000));
                resolve(response.access_token);
            },
            error_callback: (err) => {
                clearTimeout(timeoutId);
                if (err.type === 'popup_closed') {
                    reject(new Error('Cerraste la ventana de Google sin autorizar. Vuelve a intentarlo.'));
                } else if (err.type === 'popup_failed_to_open') {
                    reject(new Error(`Chrome bloqueó el popup de Google Drive. Haz clic en el ícono de popup bloqueado en la barra de dirección y permite popups para el dominio activo (${window.location.host}).`));
                } else {
                    reject(new Error('Error en popup de Google: ' + (err.type || JSON.stringify(err))));
                }
            }
        });
        tokenClient.requestAccessToken({ prompt: '' });
    });
}
window.getGdriveToken = getGdriveToken;

// Buscar o crear una carpeta en Drive
async function getOrCreateDriveFolder(token, folderName, parentId = null) {
    const q = `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false${parentId ? ` and '${parentId}' in parents` : ''}`;
    const searchRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
        { headers: { 'Authorization': `Bearer ${token}` } }
    );
    const searchData = await searchRes.json();
    if (searchData.files && searchData.files.length > 0) return searchData.files[0].id;

    const meta = { name: folderName, mimeType: 'application/vnd.google-apps.folder', ...(parentId && { parents: [parentId] }) };
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(meta)
    });
    const folder = await createRes.json();
    if (!folder.id) throw new Error('No se pudo crear la carpeta en Google Drive.');
    return folder.id;
}
window.getOrCreateDriveFolder = getOrCreateDriveFolder;

// Subir archivo a Google Drive y devolver link compartible
async function uploadToGoogleDrive(dataUri, filename) {
    const token = await getGdriveToken();
    const blob = await dataURLtoBlob(dataUri);

    // Crear estructura dinámica basada en el productor
    const folderName = `${producerConfig.aka || producerConfig.name || 'BEATSS'} Licencias`;
    const rootId = await getOrCreateDriveFolder(token, folderName);
    const contractsId = await getOrCreateDriveFolder(token, 'Contratos', rootId);

    // Subida multipart
    const metadata = { name: filename, parents: [contractsId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob, filename);

    const uploadRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
        { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
    );
    if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Error al subir a Google Drive (HTTP ${uploadRes.status}): ${err}`);
    }
    const fileData = await uploadRes.json();
    const fileId = fileData.id;

    // Hacer el archivo público (cualquiera con el link puede verlo)
    try {
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'anyone', role: 'reader' })
        });
    } catch (permErr) {
        console.warn("No se pudieron cambiar los permisos del archivo en Google Drive (posible restricción de la cuenta):", permErr);
    }

    const shareLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    console.log('☁️ Subido a Google Drive:', shareLink);
    return shareLink;
}

// Subir archivo (Blob/File) a Firebase Storage
async function uploadFileToStorage(blob, path) {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, blob);
    
    return new Promise((resolve, reject) => {
        // Timeout de 10 segundos para cancelar la tarea si Firebase Storage se queda colgado
        const timeoutId = setTimeout(() => {
            try {
                uploadTask.cancel();
                console.warn('Firebase Storage upload cancelado por timeout.');
            } catch (err) {
                console.error('Error al cancelar uploadTask:', err);
            }
            reject(new Error('Timeout al subir a Firebase Storage (10s)'));
        }, 10000);

        uploadTask.on('state_changed', 
            null, 
            (error) => {
                clearTimeout(timeoutId);
                reject(error);
            }, 
            async () => {
                clearTimeout(timeoutId);
                try {
                    const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                    resolve(downloadUrl);
                } catch (e) {
                    reject(e);
                }
            }
        );
    });
}
window.uploadFileToStorage = uploadFileToStorage;

// Helper to perform fetch with a timeout
async function fetchWithTimeout(resource, options = {}) {
    const { timeout = 8000 } = options;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

function getFirebaseStorageErrorMessage(error) {
    const code = error?.code || '';
    if (code === 'storage/unauthorized') {
        return 'Firebase rechazó la subida por permisos. Confirma que las reglas publicadas permiten la ruta licenses/{tu-uid}/... para tu sesión actual.';
    }
    if (code === 'storage/unauthenticated') {
        return 'Tu sesión de BeatSS no está autenticada en Firebase. Cierra sesión, vuelve a iniciar sesión y reintenta.';
    }
    if (code === 'storage/retry-limit-exceeded' || /timeout/i.test(error?.message || '')) {
        return 'Firebase agotó el tiempo de subida. Revisa tu conexión e inténtalo otra vez.';
    }
    return `Firebase Storage no pudo guardar el PDF${code ? ` (${code})` : ''}${error?.message ? `: ${error.message}` : '.'}`;
}

function getSafePdfFilename(filename) {
    const safe = String(filename || 'Contrato.pdf')
        .replace(/[\\/:*?"<>|]+/g, '_')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 180) || 'Contrato.pdf';
    return safe.toLowerCase().endsWith('.pdf') ? safe : `${safe}.pdf`;
}

function uploadPdfDirectlyToFirebase(blob, filename) {
    const uid = auth.currentUser.uid;
    const objectPath = `licenses/${uid}/${Date.now()}_${getSafePdfFilename(filename)}`;
    const storageRef = ref(storage, objectPath);
    const uploadTask = uploadBytesResumable(storageRef, blob, {
        contentType: 'application/pdf',
        cacheControl: 'private, max-age=0, no-transform'
    });

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            try { uploadTask.cancel(); } catch (_) { /* Firebase ya terminó la tarea. */ }
            reject(new Error('Timeout al subir el PDF directamente a Firebase Storage (45s).'));
        }, 45000);

        uploadTask.on('state_changed', null, error => {
            clearTimeout(timeoutId);
            reject(error);
        }, async () => {
            clearTimeout(timeoutId);
            try {
                resolve(await getDownloadURL(uploadTask.snapshot.ref));
            } catch (error) {
                reject(error);
            }
        });
    });
}

async function uploadPdfThroughLocalBridge(blob, filename) {
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch('/api/firebase-upload-pdf', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/pdf',
            'X-Firebase-Uid': auth.currentUser.uid,
            'X-File-Name': encodeURIComponent(getSafePdfFilename(filename))
        },
        body: blob
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.downloadUrl) {
        throw new Error(result.details || result.error || `Firebase respondió HTTP ${response.status}.`);
    }
    return result.downloadUrl;
}

// Subir el PDF de contrato a Firebase. La SDK es la vía principal, tanto en
// localhost como en producción. El puente Python solo respalda pruebas locales
// donde el navegador no pueda acceder al bucket directamente.
async function uploadPDFToCloud(base64DataUri, filename) {
    const blob = await dataURLtoBlob(base64DataUri);
    const pdfStorageProvider = producerConfig.pdfStorageProvider || 'firebase';
    if (pdfStorageProvider !== 'firebase') {
        throw new Error('El almacenamiento de PDFs debe configurarse en Firebase Storage.');
    }
    if (typeof storage === 'undefined') {
        throw new Error('Firebase Storage no se cargó en la aplicación. Recarga BeatSS e inténtalo otra vez.');
    }
    if (!auth.currentUser) {
        throw new Error('Tu sesión de BeatSS no está autenticada en Firebase. Cierra sesión, vuelve a iniciar sesión y reintenta.');
    }

    let directError;
    try {
        console.log('Subiendo PDF directamente a Firebase Storage...');
        const downloadUrl = await uploadPdfDirectlyToFirebase(blob, filename);
        console.log('PDF subido directamente a Firebase Storage.');
        return downloadUrl;
    } catch (error) {
        directError = error;
        console.warn('La subida directa a Firebase falló; se intentará el puente local si está disponible.', error);
    }

    const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (isLocal) {
        try {
            console.log('Subiendo PDF mediante el puente local de Firebase...');
            const downloadUrl = await uploadPdfThroughLocalBridge(blob, filename);
            console.log('PDF subido a Firebase mediante el puente local.');
            return downloadUrl;
        } catch (bridgeError) {
            console.error('El puente local de Firebase también falló:', bridgeError);
            throw new Error(`${getFirebaseStorageErrorMessage(directError)} Respaldo local: ${getFirebaseStorageErrorMessage(bridgeError)}`);
        }
    }

    throw new Error(getFirebaseStorageErrorMessage(directError));
}

function getDeliveryErrorMessage(error) {
    if (!error) return 'No se recibió un detalle del servicio de correo.';

    const candidates = [
        error.message,
        error.text,
        error.response?.data?.message,
        error.response?.data?.text,
        typeof error === 'string' ? error : ''
    ];
    const detail = candidates.find(value => typeof value === 'string' && value.trim());

    if (detail) return detail.trim().slice(0, 280);
    if (error.status) return `El servicio de correo respondió con estado ${error.status}.`;
    return 'No fue posible contactar el servicio de correo. Revisa tu conexión y la configuración de EmailJS.';
}

function resolveRegisteredBeatForDelivery(beatName) {
    const normalized = String(beatName || '').trim().toLocaleLowerCase('es');
    const matches = (window.localBeats || []).filter((beat) =>
        String(beat?.name || '').trim().toLocaleLowerCase('es') === normalized
    );
    if (matches.length !== 1 || !matches[0]?.id) {
        throw new Error(matches.length > 1
            ? 'Hay varios beats con ese nombre. Abre la venta desde Pedidos para identificar la compra exacta.'
            : 'Este beat no está registrado en tu catálogo. Regístralo antes de enviar archivos privados.');
    }
    return matches[0];
}

async function submitSecureLicenseDelivery({ paymentId = '', pdfBase64, contractRendererVersion = 'studio-contract-v1' }) {
    if (!auth.currentUser) throw new Error('Inicia sesión en BeatSS para enviar una licencia segura.');
    const beatName = document.getElementById('beat-name').value.trim();
    const beat = paymentId ? null : resolveRegisteredBeatForDelivery(beatName);
    const idToken = await auth.currentUser.getIdToken();
    const response = await fetch('/api/license-delivery', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${idToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            paymentId,
            beatId: beat?.id || '',
            beatName,
            buyerName: document.getElementById('buyer-name').value.trim(),
            buyerEmail: document.getElementById('buyer-email').value.trim(),
            buyerPhone: document.getElementById('buyer-phone').value.trim(),
            buyerDni: document.getElementById('buyer-id').value.trim(),
            buyerCity: document.getElementById('buyer-city').value.trim(),
            buyerCountry: document.getElementById('buyer-country').value.trim(),
            licenseType: getActiveLicenseType(),
            value: Number(document.getElementById('license-value').value) || 0,
            paymentMethod: document.getElementById('payment-method').value,
            effectiveDate: document.getElementById('effective-date').value,
            contractReference: getRequiredManualReference(),
            contractRendererVersion,
            pdfBase64
        })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
        throw new Error(result.error || 'No se pudo crear el portal privado de entrega.');
    }
    return result;
}

// Envía el contrato y un único portal firmado. Nunca incluye las URLs privadas
// de MP3, WAV o stems dentro del correo.
async function sendEmailDelivery(paymentId = '') {
    const refCode = getRequiredManualReference();
    if (!refCode) return false;
    const isNew = !licenseHistory.some(l => l.refCode === refCode);
    if (isNew && checkPlanLimitExceeded('enviar esta nueva licencia por correo')) {
        return false;
    }

    // Validaciones de formulario necesarias
    if (!validateLicenseForm()) {
        return false;
    }

    if (!auth.currentUser) {
        showToast('Inicia sesión en BeatSS antes de enviar una licencia.', true);
        return false;
    }

    // Guardar contacto automáticamente
    autoSaveContact();
    
    // Auto-guardar en historial al enviar por correo
    saveCurrentLicenseToHistory(true);

    const btn = document.getElementById('btn-send-email');
    const originalText = btn.innerHTML;

    if (typeof html2pdf === 'undefined') {
        try {
            btn.innerHTML = '⏳ Cargando librería PDF...';
            btn.disabled = true;
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        } catch (e) {
            showToast('La librería PDF no está disponible. Conéctate a Internet.', true);
            return false;
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Generando PDF...';
    btn.disabled = true;
    safeCreateIcons();

    try {
        showProgressModal('Enviando Licencia', 'Preparando archivos y contrato...', 'Generar PDF de Licencia', 'Subir contrato a la nube', 'Enviar correo de entrega');
        updateProgressStep('step-pdf', 'Procesando...', false);

        // 1. Compilar el PDF en memoria y obtener su datauristring
        const element = document.getElementById('rendered-contract-content');
        const opt = {
            margin:       [15, 20, 15, 20],
            filename:     'Contrato.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, letterRendering: true },
            jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' },
            pagebreak:    { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
        };

        element.classList.add('printing-pdf');
        let base64DataUri;
        try {
            base64DataUri = await html2pdf().from(element).set(opt).outputPdf('datauristring');
        } finally {
            element.classList.remove('printing-pdf');
        }
        updateProgressStep('step-pdf', 'Completado', true);
        
        // 2. El servidor registra la compra, guarda el PDF y envía únicamente
        // el portal firmado. Las rutas privadas nunca salen del servidor.
        updateProgressStep('step-cloud', 'Procesando...', false);
        const type = getActiveLicenseType();
        const beatName = document.getElementById('beat-name').value.trim() || "Beat";
        const buyerName = document.getElementById('buyer-name').value.trim() || "Comprador";
        const buyerEmail = document.getElementById('buyer-email').value.trim();
        const pdfFilename = `Licencia_${type.toUpperCase()}_${refCode} - ${beatName} - ${buyerName}.pdf`;
        updateProgressStep('step-email', 'Procesando...', false);
        const delivery = await submitSecureLicenseDelivery({ paymentId, pdfBase64: base64DataUri });
        updateProgressStep('step-cloud', 'Completado', true);
        window.recordEmailEvent?.({
            category: 'license_delivery', status: 'sent', recipientEmail: buyerEmail, recipientName: buyerName,
            subject: `Tu licencia de "${beatName}" - BEATSS`, beatName, reference: refCode, licenseType: type,
            paymentId: delivery.paymentId,
            templateId: producerConfig.emailjsTemplateId || '',
            resources: [{ kind: 'portal', label: 'Portal privado de compra', filename: pdfFilename }]
        });
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Enviada!', 'El comprador recibió un portal privado con el contrato y los archivos autorizados.');
        return true;

    } catch (err) {
        console.error('Error al enviar correo por EmailJS:', err);
        window.recordEmailEvent?.({
            category: 'license_delivery', status: 'failed',
            recipientEmail: document.getElementById('buyer-email')?.value?.trim(),
            recipientName: document.getElementById('buyer-name')?.value?.trim(),
            subject: `Tu licencia de "${document.getElementById('beat-name')?.value?.trim() || 'Beat'}" - BEATSS`,
            beatName: document.getElementById('beat-name')?.value?.trim(), reference: refCode,
            licenseType: getActiveLicenseType(),
            templateId: producerConfig.emailjsTemplateId || '',
            errorMessage: err?.message || 'Error de EmailJS'
        });
        showProgressError('Fallo en el Envío', getDeliveryErrorMessage(err));
        
        const steps = ['step-pdf', 'step-cloud', 'step-email'];
        steps.forEach(stepId => {
            const stepEl = document.getElementById(stepId);
            const statusEl = stepEl?.querySelector('.step-status');
            if (statusEl && (statusEl.textContent === 'Esperando...' || statusEl.textContent === 'Procesando...')) {
                updateProgressStep(stepId, 'Cancelado', false, true);
            }
        });
        return false;
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// Guardar borrador actual del formulario en localStorage
function saveFormDraft() {
    if (window.isInitializing) return;
    try {
        const customFields = [];
        const customContainer = document.getElementById('custom-fields-container');
        if (customContainer) {
            const rows = customContainer.querySelectorAll('.custom-field-row');
            rows.forEach(row => {
                const tagInput = row.querySelector('.field-tag');
                const valInput = row.querySelector('.field-value');
                if (tagInput && valInput) {
                    customFields.push({
                        key: tagInput.value,
                        value: valInput.value
                    });
                }
            });
        }

        const draft = {
            savedAt: new Date().toISOString(),
            activeLicenseType: getActiveLicenseType(),
            beatName: document.getElementById('beat-name').value,
            beatBpm: document.getElementById('beat-bpm') ? document.getElementById('beat-bpm').value : '',
            beatKey: document.getElementById('beat-key') ? document.getElementById('beat-key').value : '',
            buyerName: document.getElementById('buyer-name').value,
            buyerId: document.getElementById('buyer-id').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            licenseValue: document.getElementById('license-value').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            audioLinkMp3: document.getElementById('audio-link-mp3').value,
            audioLinkWav: document.getElementById('audio-link-wav').value,
            audioLinkStems: document.getElementById('audio-link-stems').value,
            refCode: document.getElementById('ref-code').value,
            paymentMethod: document.getElementById('payment-method').value,
            effectiveDate: document.getElementById('effective-date').value,
            celebrationPlace: document.getElementById('celebration-place').value,
            clauseFormats: document.getElementById('clause-formats').value,
            clauseStreams: document.getElementById('clause-streams').value,
            clausePhysical: document.getElementById('clause-physical').value,
            clauseVideos: document.getElementById('clause-videos').value,
            clauseVideoDuration: document.getElementById('clause-video-duration').value,
            clauseYears: document.getElementById('clause-years').value,
            clauseTerminationFee: document.getElementById('clause-termination-fee').value,
            clauseWriterShare: document.getElementById('clause-writer-share').value,
            clauseProducerShare: document.getElementById('clause-producer-share').value,
            clauseCredits: document.getElementById('clause-credits').value,
            clauseContentId: document.getElementById('clause-content-id').checked,
            customFields: customFields
        };
        safeSetItem(`${window.currentUser}_form_draft`, JSON.stringify(draft));
    } catch (e) {
        console.error('Error al guardar borrador de formulario:', e);
    }
}

// Restaurar borrador del formulario desde localStorage si existe
function loadFormDraft() {
    const saved = localStorage.getItem(`${window.currentUser}_form_draft`);
    if (!saved) return;
    try {
        const draft = JSON.parse(saved);
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const savedDate = draft.savedAt ? new Date(draft.savedAt) : null;
        const savedLocalDate = savedDate && !Number.isNaN(savedDate.getTime())
            ? `${savedDate.getFullYear()}-${String(savedDate.getMonth() + 1).padStart(2, '0')}-${String(savedDate.getDate()).padStart(2, '0')}`
            : '';
        // Un borrador de otro día no puede reutilizar silenciosamente una fecha
        // legal antigua. El usuario aún puede escoger una fecha histórica si la
        // necesita para una licencia manual.
        const refreshEffectiveDate = savedLocalDate !== today;
        
        // 1. Restaurar tipo de licencia activa si existe
        if (draft.activeLicenseType) {
            const cards = document.querySelectorAll('.license-card');
            cards.forEach(card => {
                if (card.dataset.type === draft.activeLicenseType) {
                    cards.forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                }
            });
            const btns = document.querySelectorAll('.license-btn');
            btns.forEach(btn => {
                if (btn.dataset.type === draft.activeLicenseType) {
                    btns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                }
            });
        }
        
        // 2. Restaurar campos de texto y número
        const fields = {
            'beat-name': draft.beatName,
            'beat-bpm': draft.beatBpm || '',
            'beat-key': draft.beatKey || '',
            'buyer-name': draft.buyerName,
            'buyer-id': draft.buyerId,
            'buyer-email': draft.buyerEmail,
            'buyer-phone': draft.buyerPhone,
            'license-value': draft.licenseValue,
            'buyer-city': draft.buyerCity,
            'buyer-country': draft.buyerCountry,
            'audio-link-mp3': draft.audioLinkMp3,
            'audio-link-wav': draft.audioLinkWav,
            'audio-link-stems': draft.audioLinkStems,
            'ref-code': draft.refCode,
            'payment-method': draft.paymentMethod || 'Transferencia Bancaria',
            'effective-date': refreshEffectiveDate ? today : draft.effectiveDate,
            'celebration-place': draft.celebrationPlace,
            'clause-formats': draft.clauseFormats,
            'clause-streams': draft.clauseStreams,
            'clause-physical': draft.clausePhysical,
            'clause-videos': draft.clauseVideos,
            'clause-video-duration': draft.clauseVideoDuration,
            'clause-years': draft.clauseYears,
            'clause-termination-fee': draft.clauseTerminationFee,
            'clause-writer-share': draft.clauseWriterShare,
            'clause-producer-share': draft.clauseProducerShare,
            'clause-credits': draft.clauseCredits
        };

        for (const [id, value] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el && value !== undefined) {
                el.value = value;
            }
        }

        // 3. Restaurar checkbox
        const cb = document.getElementById('clause-content-id');
        if (cb && draft.clauseContentId !== undefined) {
            cb.checked = draft.clauseContentId;
        }

        // 4. Restaurar campos personalizados
        const container = document.getElementById('custom-fields-container');
        if (container) {
            container.innerHTML = '';
            if (draft.customFields && Array.isArray(draft.customFields)) {
                draft.customFields.forEach(field => {
                    addCustomFieldRow(field.key, field.value);
                });
            }
        }

        // 5. Actualizar previsualización
        generatePreview();

    } catch (e) {
        console.error('Error al cargar borrador de formulario:', e);
    }
}

// Limpiar todos los campos del formulario y borrar el borrador
function clearFormFields() {
    if (confirm('¿Estás seguro de que deseas limpiar todos los campos del formulario?')) {
        document.getElementById('beat-name').value = '';
        const bpmEl = document.getElementById('beat-bpm');
        if (bpmEl) bpmEl.value = '';
        const keyEl = document.getElementById('beat-key');
        if (keyEl) keyEl.value = '';
        
        document.getElementById('buyer-name').value = '';
        document.getElementById('buyer-id').value = '';
        document.getElementById('buyer-email').value = '';
        document.getElementById('buyer-phone').value = '';
        document.getElementById('buyer-city').value = '';
        document.getElementById('buyer-country').value = 'Ecuador';
        document.getElementById('audio-link-mp3').value = '';
        document.getElementById('audio-link-wav').value = '';
        document.getElementById('audio-link-stems').value = '';
        
        const celebEl = document.getElementById('celebration-place');
        if (celebEl) {
            celebEl.value = producerConfig.place || 'Quito, Ecuador';
        }
        
        const payEl = document.getElementById('payment-method');
        if (payEl) {
            payEl.value = 'Transferencia Bancaria';
        }
        
        initDefaultDate();
        
        try {
            localStorage.removeItem(`${window.currentUser}_form_draft`);
            localStorage.removeItem('sossa_form_draft'); // legacy
        } catch (e) {
            console.error(e);
        }

        const container = document.getElementById('custom-fields-container');
        if (container) {
            container.innerHTML = '';
        }

        // Una nueva licencia jamás reutiliza la referencia de la anterior.
        // Las referencias históricas sólo se cargan desde su propio registro.
        document.getElementById('ref-code').value = '';
        selectLicenseType('basic');
        showToast('Campos del formulario limpiados');
    }
}


// ==================== EDITOR BLOCK 3 ====================

// ==========================================================================
// VERIFICAR FIRMA DOCUSIGN Y ENVIAR ENTREGA COMPLETA (PDF FIRMADO + LINKS)
// ==========================================================================
async function checkAndSendSignedDelivery() {
    const contractReference = getRequiredManualReference();
    if (!contractReference) return false;
    const btn = document.getElementById('btn-send-signed-delivery');
    const originalText = btn.innerHTML;

    // Recuperar datos del sobre guardado
    const pendingRaw = sessionStorage.getItem('ds_pending_envelope');
    if (!pendingRaw) {
        showToast('No se encontró ningún sobre pendiente de DocuSign. Primero envía el contrato a firmar.', true);
        return;
    }
    const pending = JSON.parse(pendingRaw);
    const { envelopeId, accountId, baseUri, buyerName, buyerEmail } = pending;

    // Recuperar token de sesión
    const token = sessionStorage.getItem('docusign_access_token');
    if (!token) {
        showToast('Sesión de DocuSign expirada. Haz clic en "Firmar DocuSign" para volver a iniciar sesión.', true);
        return;
    }

    if (!auth.currentUser) {
        showToast('Inicia sesión en BeatSS antes de enviar la entrega firmada.', true);
        return false;
    }

    btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Verificando firma...';
    btn.disabled = true;
    safeCreateIcons();

    try {
        showProgressModal('Verificando Firma', 'Consultando DocuSign...', 'Verificar firma en DocuSign', 'Descargar y subir PDF firmado', 'Enviar correo de entrega');
        updateProgressStep('step-pdf', 'Procesando...', false);

        // 1. Verificar el estado del sobre
        const statusUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}`;
        const statusRes = await fetch(statusUrl, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!statusRes.ok) {
            const errText = await statusRes.text();
            throw new Error(`Error al consultar el estado del sobre (HTTP ${statusRes.status}): ${cleanHtmlError(errText)}`);
        }

        const statusData = await statusRes.json();
        const envelopeStatus = statusData.status;

        if (envelopeStatus !== 'completed') {
            const statusLabels = {
                sent:      'enviado y esperando firma',
                delivered: 'abierto por el firmante',
                declined:  'rechazado por el firmante',
                voided:    'anulado',
                created:   'creado pero no enviado'
            };
            const label = statusLabels[envelopeStatus] || envelopeStatus;
            throw new Error(`El contrato aún no ha sido firmado. Estado: "${label}". Vuelve a intentar cuando el comprador haya firmado.`);
        }

        updateProgressStep('step-pdf', 'Completado', true);

        // 2. Descargar el PDF firmado de DocuSign
        updateProgressStep('step-cloud', 'Procesando...', false);

        const pdfDownloadUrl = `${baseUri}/v2.1/accounts/${accountId}/envelopes/${envelopeId}/documents/combined`;
        const pdfRes = await fetch(pdfDownloadUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/pdf'
            }
        });

        if (!pdfRes.ok) {
            const errText = await pdfRes.text();
            throw new Error(`Error al descargar el PDF firmado (HTTP ${pdfRes.status}): ${cleanHtmlError(errText)}`);
        }

        const pdfBlob = await pdfRes.blob();

        const reader = new FileReader();
        const dataUri = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(pdfBlob);
        });

        // 3. Guardar y enviar a través del portal firmado del comprador.
        updateProgressStep('step-email', 'Procesando...', false);
        await submitSecureLicenseDelivery({
            pdfBase64: dataUri,
            contractRendererVersion: 'docusign-signed-v1'
        });
        updateProgressStep('step-cloud', 'Completado', true);
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Completada!', 'El comprador recibió un portal privado con el PDF firmado y sus archivos autorizados.');
        console.log('Entrega con PDF firmado enviada. EnvelopeId:', envelopeId);

        btn.style.display = 'none';
        sessionStorage.removeItem('ds_pending_envelope');

    } catch (err) {
        console.error('Error en checkAndSendSignedDelivery:', err);
        showProgressError('Fallo en la Entrega', err.message || 'Ocurrió un error al procesar o enviar el PDF firmado.');
        
        const steps = ['step-pdf', 'step-cloud', 'step-email'];
        steps.forEach(stepId => {
            const stepEl = document.getElementById(stepId);
            const statusEl = stepEl?.querySelector('.step-status');
            if (statusEl && (statusEl.textContent === 'Esperando...' || statusEl.textContent === 'Procesando...')) {
                updateProgressStep(stepId, 'Cancelado', false, true);
            }
        });
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        safeCreateIcons();
    }
}

// Bindings to global window object for HTML access and cross-module usage
window.selectLicenseType = selectLicenseType;
window.generateReferenceCode = generateReferenceCode;
window.numeroALetras = numeroALetras;
window.formatFechaEspanol = formatFechaEspanol;
window.formatFechaIngles = formatFechaIngles;
window.numberToEnglishWords = numberToEnglishWords;
window.getActiveLicenseType = getActiveLicenseType;
window.parseInlineMarkdown = parseInlineMarkdown;
window.parseMarkdownToHTML = parseMarkdownToHTML;
window.loadTemplates = loadTemplates;
window.saveTemplateCustom = saveTemplateCustom;
window.resetTemplateCustom = resetTemplateCustom;
window.openTemplatesEditor = openTemplatesEditor;
window.closeTemplatesEditor = closeTemplatesEditor;
window.loadTemplateToEditor = loadTemplateToEditor;
window.compileContract = compileContract;
window.generatePreview = generatePreview;
window.validateLicenseForm = validateLicenseForm;
window.downloadPDF = downloadPDF;
window.copyMarkdown = copyMarkdown;
window.handleFolderImport = handleFolderImport;
window.handleZipSelect = handleZipSelect;
window.analyzeSelectedZip = analyzeSelectedZip;
window.extractPdfText = extractPdfText;
window.parsePdfText = parsePdfText;
window.parseEspanolDate = parseEspanolDate;
window.parsePdfFilename = parsePdfFilename;
window.extractDateFromRefCode = extractDateFromRefCode;
window.mapTypeWord = mapTypeWord;
window.buildLicenseRecord = buildLicenseRecord;
window.checkDocuSignOAuth = checkDocuSignOAuth;
window.loginToDocuSign = loginToDocuSign;
window.sendToDocuSign = sendToDocuSign;
window.cleanHtmlError = cleanHtmlError;
window.postEnvelopeToDocuSign = postEnvelopeToDocuSign;
window.loadPlatformGDriveStatus = loadPlatformGDriveStatus;
window.initPlatformGDriveOAuth = initPlatformGDriveOAuth;
window.createBeatStarsMigrationTicket = createBeatStarsMigrationTicket;
window.copyBeatStarsMigrationTicket = copyBeatStarsMigrationTicket;
window.clearBeatStarsMigrationTicket = clearBeatStarsMigrationTicket;
window.updateGoogleLoginLinkStatus = updateGoogleLoginLinkStatus;
window.linkGoogleAccountForLogin = linkGoogleAccountForLogin;
window.getCentralGdriveToken = getCentralGdriveToken;
window.getGdriveToken = getGdriveToken;
window.getOrCreateDriveFolder = getOrCreateDriveFolder;
window.uploadToGoogleDrive = uploadToGoogleDrive;
window.uploadPDFToCloud = uploadPDFToCloud;
window.sendEmailDelivery = sendEmailDelivery;
window.saveFormDraft = saveFormDraft;
window.loadFormDraft = loadFormDraft;
window.clearFormFields = clearFormFields;
window.checkAndSendSignedDelivery = checkAndSendSignedDelivery;

// Helper functions for Visual Mailing Progress Modal
export function showProgressModal(title, subtitle, step1Text = "Generar PDF de Licencia", step2Text = "Subir contrato a la nube", step3Text = "Enviar correo de entrega") {
    const modal = document.getElementById('email-progress-modal');
    if (!modal) return;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    // Reset steps
    resetProgressStep('step-pdf', 'file-text', step1Text);
    resetProgressStep('step-cloud', 'cloud-lightning', step2Text);
    resetProgressStep('step-email', 'send', step3Text);
    
    // Hide close button
    const closeBtn = document.getElementById('btn-close-progress');
    if (closeBtn) closeBtn.hidden = true;
    
    // Reset spinner / icon
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div class="email-progress-modal__spinner">
            <div class="email-progress-modal__spinner-ring"></div>
            <i data-lucide="mail" aria-hidden="true"></i>
        </div>
    `;
    
    modal.hidden = false;
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function resetProgressStep(stepId, iconName, labelText) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    stepEl.dataset.progressState = 'waiting';
    stepEl.innerHTML = `
        <span class="email-progress-modal__step-label">
            <i data-lucide="${iconName}" aria-hidden="true"></i>
            <span>${labelText}</span>
        </span>
        <span class="step-status">Esperando...</span>
    `;
}

export function updateProgressStep(stepId, statusText, isCompleted, isError = false) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    
    const statusEl = stepEl.querySelector('.step-status');
    const iconEl = stepEl.querySelector('i');
    
    const progressState = isError ? 'error' : (isCompleted ? 'completed' : 'active');
    stepEl.dataset.progressState = progressState;
    if (statusEl) statusEl.textContent = statusText;
    if (iconEl) {
        iconEl.setAttribute('data-lucide', isError ? 'alert-triangle' : (isCompleted ? 'check-circle-2' : 'loader'));
    }
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function showProgressSuccess(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div class="email-progress-modal__result-mark email-progress-modal__result-mark--success">
            <i data-lucide="check" aria-hidden="true"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    if (closeBtn) closeBtn.hidden = false;
    
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function showProgressError(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div class="email-progress-modal__result-mark email-progress-modal__result-mark--error">
            <i data-lucide="x" aria-hidden="true"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    if (closeBtn) closeBtn.hidden = false;
    
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

// El cierre vive junto al modal para que siga funcionando incluso si la
// inicialización general de main.js se retrasa o falla después de una entrega.
export function closeEmailProgressModal() {
    const modal = document.getElementById('email-progress-modal');
    if (!modal) return;
    modal.hidden = true;
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

window.showProgressModal = showProgressModal;
window.resetProgressStep = resetProgressStep;
window.updateProgressStep = updateProgressStep;
window.showProgressSuccess = showProgressSuccess;
window.showProgressError = showProgressError;
window.closeEmailProgressModal = closeEmailProgressModal;

export function compileContractData(orderData, producerConfig, templateId = 'licencia_uso', lang = 'es') {
    // Las reemisiones deben partir de la fotografía contractual ya confirmada,
    // nunca de los campos vivos del formulario ni de una fecha nueva.
    const source = orderData.contractSnapshot
        ? { ...orderData, ...orderData.contractSnapshot }
        : orderData;
    // Las licencias históricas anteriores a la fotografía contractual guardan
    // los campos del comprador dentro de formData. Unificarlos permite
    // reemitirlas sin perder sus datos ni completar con valores del formulario.
    const sourceFormData = source.formData || {};
    const type = source.licenseType || source.type || 'basic';
    const isExclusive = type === 'exclusive';
    const defaultConfig = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;

    const beatName = source.beatName || "[Nombre del Beat]";
    const beatBpm = source.beatBpm || "";
    const beatKey = source.beatKey || "";
    const buyerName = source.buyerName || "[Nombre del Comprador]";
    const buyerId = source.buyerDni || source.buyerId || sourceFormData.buyerId || "[Cédula/DNI]";
    const buyerEmail = source.buyerEmail || sourceFormData.buyerEmail || "[Correo del Comprador]";
    const buyerPhone = source.buyerPhone || sourceFormData.buyerPhone || "";
    const buyerCity = source.buyerCity || sourceFormData.buyerCity || "[Ciudad]";
    const buyerCountry = source.buyerCountry || sourceFormData.buyerCountry || "[País]";
    const value = parseFloat(source.totalLicensePaid !== undefined
        ? source.totalLicensePaid
        : (source.finalPrice !== undefined ? source.finalPrice : (source.value ?? source.price ?? defaultConfig.price))) || 0;
    // El PDF público nunca puede presentar una referencia inventada. La vista
    // puede señalar un borrador pendiente, pero las rutas de entrega bloquean
    // su generación hasta que exista una referencia persistida.
    const canonicalReference = resolveLicenseReference(source);
    const refCode = canonicalReference || INVALID_REFERENCE_PREVIEW;
    const dateCandidate = source.contractEffectiveDate || source.date || source.purchaseConfirmedAt || source.timestamp;
    const effectiveDate = dateCandidate
        ? String(dateCandidate).slice(0, 10)
        : new Date().toLocaleDateString('en-CA');
    const dateFormatted = (lang === 'en' ? formatFechaIngles(effectiveDate) : formatFechaEspanol(effectiveDate)) || "[Fecha]";
    const isSossaProducer = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')) || 
                            (producerConfig.name && producerConfig.name.toLowerCase().includes('sossa'));

    let celebrationPlace = source.celebrationPlace || sourceFormData.celebrationPlace;
    if (!celebrationPlace) {
        if (isSossaProducer) {
            celebrationPlace = lang === 'en'
                ? "Executed electronically in Quito, Ecuador"
                : "Celebrado de forma electrónica en Quito - Ecuador.";
        } else {
            celebrationPlace = buyerCity ? `${buyerCity}, ${buyerCountry}` : "[Lugar de Celebración]";
        }
    }

    const paymentMethod = source.paymentMethod || source.method || "Transferencia Bancaria";
    const normalizedPaymentMethod = String(paymentMethod).toLowerCase() === 'stripe'
        ? 'Stripe'
        : paymentMethod;
    const displayPaymentMethod = formatContractPaymentMethod(normalizedPaymentMethod, lang);
    
    const formats = source.formats || sourceFormData.formats || defaultConfig.formats || "[Formatos]";
    const streams = source.streams || sourceFormData.streams || defaultConfig.streams || "[Límite Streams]";
    const physical = source.physical || sourceFormData.physical || defaultConfig.physical || "[Límite Físicas]";
    const videos = source.videos || sourceFormData.videos || defaultConfig.videos || "[Videos]";
    const videoDuration = source.videoDuration || sourceFormData.videoDuration || defaultConfig.videoDuration || "[Duración Video]";
    const years = source.years || sourceFormData.years || defaultConfig.years || "[Años de Vigencia]";
    const terminationFee = source.terminationFee || sourceFormData.terminationFee || '1000';
    const writerShare = source.writerShare !== undefined ? source.writerShare : (sourceFormData.writerShare !== undefined ? sourceFormData.writerShare : (defaultConfig.writerShare || 50));
    const producerShare = source.producerShare !== undefined ? source.producerShare : (sourceFormData.producerShare !== undefined ? sourceFormData.producerShare : (defaultConfig.producerShare || 50));
    const credits = source.credits || sourceFormData.credits || `Prod. por ${producerConfig.aka || 'Sossa'}`;
    const contentIdProhibited = source.contentIdProhibited !== undefined 
        ? source.contentIdProhibited 
        : (defaultConfig.contentId !== undefined ? defaultConfig.contentId : true);

    const valueLetters = lang === 'en' ? numberToEnglishWords(value) : numeroALetras(value);
    const tierName = LICENSE_CONFIGS[type] 
        ? (lang === 'en' ? (type === 'exclusive' ? 'Exclusive' : type === 'premium' ? 'Premium' : type === 'premium_plus' ? 'Premium Plus' : type === 'unlimited_flp' ? 'Unlimited' : 'Basic') : LICENSE_CONFIGS[type].name)
        : (lang === 'en' ? 'Custom' : 'Personalizada');

    const cityParts = celebrationPlace.split(',');
    const cityOfJurisdiction = cityParts[0].trim();

    let activeTemplate = activeTemplates.find(t => t.id === templateId);
    if (!activeTemplate) {
        activeTemplate = DEFAULT_TEMPLATES.find(t => t.id === templateId) || DEFAULT_TEMPLATES[0];
    }

    const isPerpetual = isExclusive || type === 'premium_plus' || type === 'unlimited_flp' || (defaultConfig.years && defaultConfig.years.toLowerCase().includes('perpetua'));
    const clause_rescission_rules = isPerpetual 
        ? (lang === 'en' 
            ? 'Once the agreement expires or becomes perpetual, the rights will be maintained as stipulated without the need for renewal.'
            : 'Una vez vencido o perpetuo el acuerdo, los derechos se mantendrán según lo estipulado sin necesidad de renovación.')
        : (lang === 'en'
            ? 'Consequently, this license will automatically expire upon the completion of the term stipulated, counted from the date stipulated in the header.'
            : 'En consecuencia, esta licencia expirará automáticamente al cumplirse el término estipulado contados a partir de la fecha estipulada en el encabezado.');

    const clause_content_id_rules = contentIdProhibited
        ? (lang === 'en'
            ? 'The Licensee is **strictly prohibited** from registering the Beat or the New Song in any automated content identification system (such as *Content ID*, *Facebook Rights Manager*, *Identifyy*, or automatic digital distribution tools like TuneCore, CD Baby, or DistroKid that index audio fingerprints). This measure is mandatory to protect the rights of other legitimate licensees of the same Beat. The original material has already been indexed and preventively protected by the Producer. Failure to comply with this rule will result in the immediate revocation of the license.'
            : 'El Licenciatario tiene **estrictamente prohibido** registrar el Beat o la Nueva Canción en cualquier plataforma de identificación automatizada de contenido (*Content ID*, *Facebook Rights Manager*, *Identifyy*, o herramientas de distribución digital automáticas como TuneCore, CD Baby o DistroKid que indexen huellas de audio). Esta medida es obligatoria para resguardar los derechos de otros licenciatarios legítimos del mismo Beat. El material original ya ha sido indexado y protegido preventivamente por el Productor. El incumplimiento de esta norma provocará la revocación inmediata de la licencia.')
        : (lang === 'en'
            ? 'As this is an Exclusive License, the Licensee is authorized to execute standard digital distribution and use the Content ID system in a controlled manner on their final version (the New Song), provided they strictly refrain from claiming exclusive ownership or monetization rights over the instrumental track itself, and they are obligated to whitelist any pre-existing legitimate non-exclusive derivative songs created by other licensees prior to this agreement.'
            : 'Al tratarse de una Licencia Exclusiva, el Licenciatario está facultado para la distribución digital estándar y el uso del sistema Content ID de manera controlada sobre su versión final (la Nueva Canción) siempre y cuando se abstenga estrictamente de reclamar la propiedad exclusiva o la monetización de la pista instrumental en sí misma, quedando obligado a incluir en lista blanca (*whitelist*) cualquier canción derivada legítima no exclusiva preexistente creada por otros licenciatarios antes de este acuerdo.');

    const clause_prior_license_upgrade_rules = isExclusive
        ? (lang === 'en'
            ? '**4.1. Prior Licenses and Reserved Upgrade Right.** This Exclusive License is granted subject to any valid non-exclusive license issued before its Effective Date. Each prior Licensee retains the authorized use of the same New Song under their original license and may, even after this exclusive sale, purchase upgrades of that license up to the Unlimited License. This reservation does not authorize new non-exclusive licenses, new derivative songs, assignments, sublicenses, or another exclusive license. The Exclusive Licensee must respect those prior uses and whitelist them in any content-identification system.'
            : '**4.1. Licencias Previas y Derecho de Ampliación Reservado.** Esta Licencia Exclusiva se concede sujeta a toda licencia no exclusiva válida emitida antes de su Fecha de Entrada en Vigor. Cada Licenciatario previo conserva el uso autorizado de la misma Nueva Canción bajo su licencia original y podrá, aun después de esta venta exclusiva, adquirir ampliaciones de esa licencia hasta la Licencia Ilimitada. Esta reserva no autoriza nuevas licencias no exclusivas, nuevas canciones derivadas, cesiones, sublicencias ni otra licencia exclusiva. El Licenciatario Exclusivo deberá respetar tales usos previos y mantenerlos en lista blanca en cualquier sistema de identificación de contenido.')
        : (lang === 'en'
            ? '**4.1. Later Exclusive Sale and Reserved Upgrade.** If the Producer later grants an Exclusive License for the Beat, this prior non-exclusive license is not revoked. The Licensee may continue exploiting the same New Song within the terms of this Agreement and may purchase upgrades of this license up to the Unlimited License. The upgrade is personal to the original Licensee and applies only to the same Beat and New Song; it does not authorize a new derivative song, an assignment, a sublicense, or an exclusive license.'
            : '**4.1. Exclusiva Posterior y Ampliación Reservada.** Si el Productor concede posteriormente una Licencia Exclusiva sobre el Beat, esta licencia no exclusiva previa no queda revocada. El Licenciatario podrá continuar explotando la misma Nueva Canción dentro de los términos de este Contrato y podrá adquirir ampliaciones de esta licencia hasta la Licencia Ilimitada. La ampliación es personal para el Licenciatario original y aplica únicamente al mismo Beat y a la misma Nueva Canción; no autoriza una nueva canción derivada, cesión, sublicencia ni licencia exclusiva.');

    // 1. Declaración legal del productor (persona natural y nombre artístico)
    let producer_legal_declaration = "";
    let producer_legal_declaration_en = "";
    if (isSossaProducer) {
        const prodName = producerConfig.name || producerConfig.aka || "Productor";
        const prodAka = producerConfig.aka || prodName;
        producer_legal_declaration = `**${prodAka}**, nombre artístico de **${prodName}**, quien actúa como persona natural y titular de los derechos objeto de esta licencia`;
        producer_legal_declaration_en = `**${prodAka}**, the professional name of **${prodName}**, acting as a natural person and holder of the rights covered by this license`;
    } else {
        const prodName = producerConfig.name || "Productor";
        const prodAka = producerConfig.aka || prodName;
        const identityText = producerConfig.id ? `, con documento de identidad Nro. ${producerConfig.id}` : '';
        const identityTextEn = producerConfig.id ? `, with ID/Passport No. ${producerConfig.id}` : '';
        producer_legal_declaration = `**${prodName}**, conocido profesionalmente en la industria musical como **${prodAka}**${identityText}`;
        producer_legal_declaration_en = `**${prodName}**, professionally known in the music industry as **${prodAka}**${identityTextEn}`;
    }

    // 2. Jurisdicción y ley aplicable
    let laws_jurisdiction = "";
    let laws_jurisdiction_en = "";
    let jurisdiction_place = "";
    let jurisdiction_place_en = "";
    if (isSossaProducer) {
        laws_jurisdiction = "la República del Ecuador";
        laws_jurisdiction_en = "the Republic of Ecuador";
        jurisdiction_place = "Quito - Ecuador";
        jurisdiction_place_en = "Quito - Ecuador";
    } else {
        laws_jurisdiction = "la República del Ecuador";
        laws_jurisdiction_en = "the Republic of Ecuador";
        jurisdiction_place = `la ciudad de ${cityOfJurisdiction}`;
        jurisdiction_place_en = `the city of ${cityOfJurisdiction}`;
    }

    // 3. Reglas de sincronización comercial (especial para Exclusive)
    let clause_sync_rules = "";
    let clause_sync_rules_en = "";
    if (isExclusive) {
        clause_sync_rules = `Se concede al Licenciatario el derecho ilimitado y perpetuo de sincronizar la Nueva Canción en producciones audiovisuales (tales como cine, televisión, cortometrajes, videojuegos o comerciales publicitarios de marcas). No obstante, el Productor retiene su participación del 50% de las regalías de composición (Publishing / Writer's Share) administradas a través de su sociedad de gestión colectiva (${producerConfig.pro || 'BMI'} / ${producerConfig.publisher || 'Songtrust'}) sobre cualquier explotación comercial de sincronización.`;
        clause_sync_rules_en = `The Licensee is granted the unlimited and perpetual right to synchronize the New Song in audiovisual productions (such as film, television, short films, video games, or commercial brand advertisements). However, the Producer retains their 50% share of composition royalties (Publishing / Writer's Share) administered through their collective rights organization (${producerConfig.pro || 'BMI'} / ${producerConfig.publisher || 'Songtrust'}) on any commercial synchronization exploitation.`;
    } else {
        clause_sync_rules = `Queda expresamente prohibida la sincronización del Beat o de la Nueva Canción en producciones de cine, cortometrajes, programas de televisión, videojuegos o comerciales publicitarios de marcas de consumo masivo, salvo acuerdo y licenciamiento independiente con el Productor.`;
        clause_sync_rules_en = `The synchronization of the Beat or the New Song in film productions, short films, television programs, video games, or commercial advertisements of mass consumer brands is expressly prohibited, except by independent agreement and licensing with the Producer.`;
    }

    // 4. Cláusula de rescisión dinámica (Clause 9)
    let clause_rescission_title = "";
    let clause_rescission_title_en = "";
    let clause_rescission_body = "";
    let clause_rescission_body_en = "";
    if (isExclusive) {
        clause_rescission_title = "Irrevocabilidad del Acuerdo";
        clause_rescission_title_en = "Irrevocability of the Agreement";
        clause_rescission_body = "Al tratarse de una transferencia de derechos exclusivos sobre el instrumental, el presente Contrato es definitivo, irrevocable y perpetuo. El Licenciante renuncia de forma expresa e irrevocable a cualquier facultad de rescisión unilateral o terminación anticipada una vez perfeccionada la compraventa.";
        clause_rescission_body_en = "As this is a transfer of exclusive rights over the instrumental, this Agreement is final, irrevocable, and perpetual. The Licensor expressly and irrevocably waives any power of unilateral termination or early rescission once the sale is finalized.";
    } else {
        clause_rescission_title = "Opción de Rescisión del Licenciante (Cláusula de Salvaguarda)";
        clause_rescission_title_en = "Licensor's Termination Option (Safeguard Clause)";
        clause_rescission_body = `El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente a **${terminationFee}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción.`;
        clause_rescission_body_en = `The Licensor reserves the discretionary power and exclusive option, executable within the first **three (3) years** from the signing of this Contract, to terminate this agreement early and unilaterally by written notice. For this termination to take effect, the Licensor will pay the Licensee compensation equivalent to **${terminationFee}**. Following notification and payment of said penalty, the Licensee will have a period of seven (7) days to take down and withdraw the New Song from all physical and digital distribution channels in the market. The Licensee expressly agrees that the payment of said penalty constitutes a full, sole, and final compensation for the termination of the agreement, and irrevocably waives the right to claim any other value, compensation, or damages for promotion, marketing, video production expenses, or any other investment made in connection with the New Song.`;
    }

    const vars = {
        producer_name: producerConfig.name || "Productor",
        producer_aka: producerConfig.aka || producerConfig.name || "Productor",
        producer_id: producerConfig.id || "",
        producer_email: producerConfig.email || "",
        producer_phone: producerConfig.phone || "",
        producer_pro: producerConfig.pro || "BMI",
        producer_ipi: producerConfig.ipi || "",
        producer_publisher: producerConfig.publisher || "",
        buyer_name: buyerName,
        buyer_id: buyerId,
        buyer_email: buyerEmail,
        buyer_phone: buyerPhone,
        buyer_city: buyerCity,
        buyer_country: buyerCountry,
        beat_name: beatName,
        beat_bpm: beatBpm ? '(' + beatBpm + ' BPM)' : '',
        beat_key: beatKey,
        license_value: value.toFixed(2),
        license_value_letters: valueLetters,
        ref_code: refCode,
        effective_date: dateFormatted,
        celebration_place: celebrationPlace,
        payment_method: displayPaymentMethod,
        jurisdiction_city: cityOfJurisdiction,
        current_year: effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear(),
        clause_formats: formats,
        clause_streams: streams,
        clause_physical: physical,
        clause_videos: videos,
        clause_video_duration: videoDuration,
        clause_years: years,
        clause_termination_fee: terminationFee,
        clause_writer_share: writerShare,
        clause_producer_share: producerShare,
        clause_credits: credits,
        license_type: tierName,
        license_exclusivity: isExclusive ? (lang === 'en' ? 'Exclusive' : 'Exclusiva') : (lang === 'en' ? 'Non-Exclusive' : 'No Exclusiva'),
        license_exclusivity_lower: isExclusive ? (lang === 'en' ? 'exclusive' : 'exclusiva') : (lang === 'en' ? 'non-exclusive' : 'no exclusiva'),
        clause_rescission_rules: clause_rescission_rules,
        clause_content_id_rules: clause_content_id_rules,
        clause_prior_license_upgrade_rules: clause_prior_license_upgrade_rules,
        
        // Nuevas variables inyectadas dinámicamente
        producer_legal_declaration: producer_legal_declaration,
        producer_legal_declaration_en: producer_legal_declaration_en,
        laws_jurisdiction: laws_jurisdiction,
        laws_jurisdiction_en: laws_jurisdiction_en,
        jurisdiction_place: jurisdiction_place,
        jurisdiction_place_en: jurisdiction_place_en,
        clause_sync_rules: clause_sync_rules,
        clause_sync_rules_en: clause_sync_rules_en,
        clause_rescission_title: clause_rescission_title,
        clause_rescission_title_en: clause_rescission_title_en,
        clause_rescission_body: clause_rescission_body,
        clause_rescission_body_en: clause_rescission_body_en
    };

    const templateMarkdown = (lang === 'en' && activeTemplate.markdown_en) ? activeTemplate.markdown_en : activeTemplate.markdown;
    let md = templateMarkdown.replace(/\{\{(\w+)\}\}/g, (match, tag) => {
        const tagLower = tag.toLowerCase();
        return tagLower in vars ? vars[tagLower] : match;
    });
    if (templateId === 'licencia_uso' && !templateMarkdown.includes('{{clause_prior_license_upgrade_rules}}')) {
        md += `\n\n---\n\n${clause_prior_license_upgrade_rules}`;
    }

    const t = TRANSLATIONS[lang] || {};
    const isMonarco = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('monarco'));
    const isStudioAdmin = typeof window !== 'undefined' && window.currentUserIsAdmin === true;
    const isStudioPro = typeof window !== 'undefined' && window.currentUserIsPro === true;
    const isSossa = isStudioAdmin || (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa'));
    const hasCustomLogo = Boolean(producerConfig.logoBase64 && (producerConfig.plan === 'elite' || isStudioAdmin));
    const logoHtml = hasCustomLogo
            ? `<div style="text-align: center; margin-bottom: 15px;"><img src="${producerConfig.logoBase64}" alt="Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
            : (isMonarco
                ? `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">CG MONARCO</div>` 
                : (isSossa 
                    ? `<div style="text-align: center; margin-bottom: 15px;"><img src="/logo.png" alt="SOSSA Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
                    : `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">${(producerConfig.aka || 'PRODUCTOR').toUpperCase()}</div>`
                  )
              );

    const bodyHtml = protectContractPageBreaks(parseMarkdownToHTML(md));
    const needsBuyerSignature = (templateId === 'split_sheet' || templateId === 'coproduccion' || isExclusive);
    
    // Auto-detectar etiqueta RUC si tiene 13 dígitos
    let idLabelL = t.buyerId || 'Identificación/RUT:';
    if (producerConfig.id && producerConfig.id.trim().length === 13) {
        idLabelL = 'RUC (Ecuador):';
    }
    
    let idLabelR = t.buyerId || 'Identificación/RUT:';
    if (buyerId && buyerId.trim().length === 13) {
        idLabelR = 'RUC (Ecuador):';
    }
    
    let signatureRoleL = t.producerRole || 'El Licenciante (Productor)';
    let signatureNameL = producerConfig.name;
    let signatureIdL = producerConfig.id ? `${idLabelL} ${producerConfig.id}` : idLabelL;
    let signatureAkaL = `AKA: ${producerConfig.aka}`;

    let signatureRoleR = t.buyerRole || 'El Licenciatario (Cliente)';
    let signatureNameR = buyerName;
    let signatureIdR = `${idLabelR} ${buyerId}`;
    let signatureAkaR = ``;

    let signaturesSectionHtml = '';
    
    if (needsBuyerSignature) {
        let signatureLeftHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    ${producerConfig.signatureBase64
                        ? `<img src="${producerConfig.signatureBase64}" alt="Firma ${producerConfig.aka}" class="signature-img">`
                        : (producerConfig.signature
                            ? `<img src="${producerConfig.signature}" alt="Firma ${producerConfig.aka}" class="signature-img">`
                            : (isMonarco
                                ? `<img src="/firma-cgmonarco.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                                : (isSossa
                                    ? `<img src="/firma-sossa.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                                    : `<div class="signature-placeholder" style="font-family:'Brush Script MT', cursive; font-size:28px; color:var(--accent); text-align:center; padding-top:5px; width:150px; margin:0 auto;">${producerConfig.name}</div>`
                                  )
                              )
                          )
                    }
                </div>
                <div class="signature-line"></div>
                <div class="signature-role">${signatureRoleL}</div>
                <div class="signature-name">${signatureNameL}</div>
                <div class="signature-aka">${signatureIdL}</div>
                <div class="signature-aka">${signatureAkaL}</div>
            </div>
        `;

        const buyerSig = orderData.buyerSignature || orderData.buyerSignatureBase64 || '';
        let signatureRightHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    ${buyerSig 
                        ? `<img src="${buyerSig}" alt="Firma Comprador" class="signature-img">` 
                        : '<!-- Espacio en blanco reservado para alineación de firmas -->'
                    }
                </div>
                <div class="signature-line"></div>
                <div class="signature-role">${signatureRoleR}</div>
                <div class="signature-name">${signatureNameR}</div>
                <div class="signature-aka">${signatureIdR}</div>
                <div class="signature-aka">${orderData.buyerSignatureDocusign || t.buyerSignatureDocusign || 'Firma vía DocuSign'}</div>
            </div>
        `;

        signaturesSectionHtml = `
            <div class="contract-signatures-wrapper">
                ${signatureLeftHtml}
                ${signatureRightHtml}
            </div>
        `;
    } else {
        const formattedDate = new Date(effectiveDate + 'T12:00:00').toLocaleDateString(lang === 'en' ? 'en-US' : 'es-ES', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
        const verificationCopy = getContractVerificationCopy(normalizedPaymentMethod, formattedDate, refCode, lang);
        signaturesSectionHtml = `
            <div class="non-exclusive-acceptance-wrapper" style="display: flex; justify-content: center; width: 100%; page-break-inside: avoid; break-inside: avoid;">
                <div style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 15px 30px; background: rgba(16, 185, 129, 0.02); text-align: center; max-width: 500px; width: 100%;">
                    <div style="font-size: 18px; color: #10b981; font-weight: 800; margin-bottom: 5px;">${verificationCopy.acceptanceTitle}</div>
                    <div style="font-size: 11px; color: #636366; line-height: 1.4;">
                        ${verificationCopy.acceptanceBody}
                    </div>
                </div>
            </div>
        `;
    }

    const hasBuyerSignature = Boolean(orderData.buyerSignature || orderData.buyerSignatureBase64);
    const verificationCopy = getContractVerificationCopy(
        normalizedPaymentMethod,
        dateFormatted,
        refCode,
        lang,
        needsBuyerSignature,
        hasBuyerSignature
    );

    // Se conserva el mismo marco visual usado por el editor manual. Así la
    // licencia descargada después de un pago Stripe y la previsualización del
    // Studio son el mismo documento, no dos formatos distintos.
    const html = `
        <div class="contract-doc">
            ${isSossa
                ? `<div class="contract-watermark" style="background-image: url('/logo.png');"></div>`
                : (!isStudioPro ? `<div class="contract-watermark free-watermark"></div>` : '')
            }
            <div class="doc-header" style="text-align: center; margin-bottom: 30px;">
                <div class="doc-logo-container" style="margin-bottom: 15px;">
                    ${logoHtml}
                </div>
            </div>
            <div class="doc-body">
                ${bodyHtml}
            </div>
            <div class="contract-closure">
                ${signaturesSectionHtml}
                <div class="digital-seal-container" style="margin-top: 25px;">
                    <div class="digital-seal">
                        <div class="seal-icon">✓</div>
                        <div class="seal-text">
                            <strong>${t.sealVerified || 'DOCUMENTO VERIFICADO'}</strong><br>
                            ${t.sealRef || 'Ref:'} ${refCode}<br>
                            ${verificationCopy.sealStatus}
                        </div>
                    </div>
                </div>
                <hr style="margin: 15px 0;">
                <div class="doc-footer" style="text-align: center; font-size: 11px; color: #8a91a6;">
                    <p><em>${t.footerText || 'Este documento fue generado por la plataforma BEATSS.'} ${tierName} — ${producerConfig.aka} ${effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear()}.</em></p>
                </div>
            </div>
        </div>
    `;

    return { md, html, needsBuyerSignature, reference: canonicalReference, referenceValid: Boolean(canonicalReference) };
}

window.compileContractData = compileContractData;

// --- WHITING LIST / CONTENT ID LOGIC ---

// Cargar y mostrar la lista blanca de canales
async function loadWhitelistData() {
    if (!window.currentUser) return;

    const tbody = document.getElementById('whitelist-table-tbody');
    const emptyState = document.getElementById('whitelist-empty-state');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-secondary);">Cargando canales autorizados...</td></tr>';
    if (emptyState) emptyState.style.display = 'none';

    try {
        const qRef = collection(db, "users", window.currentUser, "whitelist");
        const snapshot = await getDocs(qRef);
        
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            if (emptyState) emptyState.style.display = 'block';
            return;
        }

        const items = [];
        snapshot.forEach(doc => {
            items.push({ id: doc.id, ...doc.data() });
        });

        // Ordenar por fecha de creación descendente
        items.sort((a, b) => {
            const dateA = a.createdAt || '';
            const dateB = b.createdAt || '';
            return dateB.localeCompare(dateA);
        });

        items.forEach(item => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid var(--border-color)';
            
            // Link de canal
            const channelUrl = item.channelUrl || '#';
            const artistName = item.artistName || 'Canal sin nombre';
            const songName = item.songName || '-';
            const licenseRef = item.licenseRef || '-';

            tr.innerHTML = `
                <td style="padding: 12px 8px; font-size: 13px; color: #fff;">
                    <a href="${channelUrl}" target="_blank" style="color: var(--accent); text-decoration: none; display: flex; align-items: center; gap: 6px; font-weight: 500;">
                        <i data-lucide="external-link" style="width: 12px; height: 12px;"></i> ${artistName}
                    </a>
                </td>
                <td style="padding: 12px 8px; font-size: 13px; color: var(--text-secondary);">${songName}</td>
                <td style="padding: 12px 8px; font-size: 13px; color: var(--text-secondary); font-family: monospace;">${licenseRef}</td>
                <td style="padding: 12px 8px; text-align: right;">
                    <button class="btn-copy-clearance btn btn-secondary" data-ref="${licenseRef}" style="padding: 4px 8px; font-size: 11px; height: 26px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-right: 6px;" title="Copiar enlace de clearance para el cliente">
                        <i data-lucide="copy" style="width: 12px; height: 12px;"></i> Clearance Link
                    </button>
                    <button class="btn-delete-whitelist btn btn-danger" data-id="${item.id}" style="padding: 4px 8px; font-size: 11px; height: 26px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); color: #ef4444;" title="Revocar autorización">
                        <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Revocar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Configurar eventos para copiar link de clearance
        tbody.querySelectorAll('.btn-copy-clearance').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ref = e.currentTarget.getAttribute('data-ref');
                const clearanceUrl = `${window.location.origin}/clearance.html?ref=${encodeURIComponent(ref)}&p=${window.currentUser}`;
                navigator.clipboard.writeText(clearanceUrl).then(() => {
                    if (typeof window.showToast === 'function') {
                        window.showToast('¡Enlace de clearance copiado al portapapeles!');
                    }
                }).catch(err => {
                    console.error('Error al copiar link:', err);
                });
            });
        });

        // Configurar eventos para revocar
        tbody.querySelectorAll('.btn-delete-whitelist').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const docId = e.currentTarget.getAttribute('data-id');
                if (confirm('¿Estás seguro de que deseas revocar la autorización para este canal? Recibirá reclamos de derechos de autor.')) {
                    try {
                        const docRef = doc(db, "users", window.currentUser, "whitelist", docId);
                        await deleteDoc(docRef);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Canal revocado correctamente.');
                        }
                        loadWhitelistData();
                    } catch (err) {
                        console.error('Error al eliminar de whitelist:', err);
                        if (typeof window.showToast === 'function') {
                            window.showToast('Error al revocar autorización', true);
                        }
                    }
                }
            });
        });

        if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
            lucide.createIcons();
        }

    } catch (err) {
        console.error("Error al cargar whitelist de Firestore:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: #ef4444;">Error al cargar los datos desde la nube.</td></tr>';
    }
}

// Agregar canal manualmente
async function addChannelToWhitelist(e) {
    e.preventDefault();
    if (!window.currentUser) return;

    const urlInput = document.getElementById('whitelist-channel-url');
    const artistInput = document.getElementById('whitelist-artist-name');
    const songInput = document.getElementById('whitelist-song-name');
    const refInput = document.getElementById('whitelist-license-ref');

    if (!urlInput || !artistInput || !songInput || !refInput) return;

    const channelUrl = urlInput.value.trim();
    const artistName = artistInput.value.trim();
    const songName = songInput.value.trim();
    const licenseRef = refInput.value.trim();

    if (!channelUrl || !artistName || !songName || !licenseRef) {
        if (typeof window.showToast === 'function') {
            window.showToast('Todos los campos son obligatorios.', true);
        }
        return;
    }

    const submitBtn = e.currentTarget.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="animate-spin">⏳</i> Autorizando...';

    try {
        const whitelistCollection = collection(db, "users", window.currentUser, "whitelist");
        await addDoc(whitelistCollection, {
            channelUrl: channelUrl,
            artistName: artistName,
            songName: songName,
            licenseRef: licenseRef,
            createdAt: new Date().toISOString()
        });

        if (typeof window.showToast === 'function') {
            window.showToast('Canal autorizado exitosamente.');
        }

        // Resetear formulario
        e.target.reset();
        
        // Recargar datos
        loadWhitelistData();
    } catch (err) {
        console.error("Error al añadir canal a whitelist:", err);
        if (typeof window.showToast === 'function') {
            window.showToast('Error al autorizar canal.', true);
        }
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
    }
}

// Configurar listeners para Whitelist
function setupWhitelistEvents() {
    const form = document.getElementById('form-add-whitelist');
    if (form) {
        form.removeEventListener('submit', addChannelToWhitelist); // Evitar duplicados
        form.addEventListener('submit', addChannelToWhitelist);
    }
}

window.loadWhitelistData = loadWhitelistData;
window.setupWhitelistEvents = setupWhitelistEvents;

// Inicializar eventos de whitelist
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupWhitelistEvents);
} else {
    setupWhitelistEvents();
}

// ==========================================================================
// CONTROLES DE ESTILO DE PAPEL VIRTUAL (SOFT PAPER MODE)
// ==========================================================================

// Establecer el estilo de tipografía del papel (Sans / Serif)
window.setPaperStyle = function(style) {
    const paper = document.getElementById('license-paper');
    const btnSans = document.getElementById('btn-paper-style-sans');
    const btnSerif = document.getElementById('btn-paper-style-serif');
    if (!paper) return;

    if (style === 'serif') {
        paper.classList.add('paper-serif');
        if (btnSans && btnSerif) {
            btnSans.style.background = 'transparent';
            btnSans.style.color = '#8a91a6';
            btnSerif.style.background = 'var(--accent)';
            btnSerif.style.color = '#fff';
        }
        localStorage.setItem('paper_preference_style', 'serif');
    } else {
        paper.classList.remove('paper-serif');
        if (btnSans && btnSerif) {
            btnSans.style.background = 'var(--accent)';
            btnSans.style.color = '#fff';
            btnSerif.style.background = 'transparent';
            btnSerif.style.color = '#8a91a6';
        }
        localStorage.setItem('paper_preference_style', 'sans');
    }
};

// Establecer el color de fondo del papel (White / Cream)
window.setPaperColor = function(color) {
    const paper = document.getElementById('license-paper');
    const btnWhite = document.getElementById('btn-paper-color-white');
    const btnCream = document.getElementById('btn-paper-color-cream');
    if (!paper) return;

    if (color === 'cream') {
        paper.classList.add('paper-cream');
        if (btnWhite && btnCream) {
            btnWhite.style.background = 'transparent';
            btnWhite.style.color = '#8a91a6';
            btnCream.style.background = 'var(--accent)';
            btnCream.style.color = '#fff';
        }
        localStorage.setItem('paper_preference_color', 'cream');
    } else {
        paper.classList.remove('paper-cream');
        if (btnWhite && btnCream) {
            btnWhite.style.background = 'var(--accent)';
            btnWhite.style.color = '#fff';
            btnCream.style.background = 'transparent';
            btnCream.style.color = '#8a91a6';
        }
        localStorage.setItem('paper_preference_color', 'white');
    }
};

// Cargar preferencias guardadas de estilo de papel
window.loadPaperPreferences = function() {
    const savedStyle = localStorage.getItem('paper_preference_style') || 'serif';
    const savedColor = localStorage.getItem('paper_preference_color') || 'cream';
    window.setPaperStyle(savedStyle);
    window.setPaperColor(savedColor);
};

// Inicializar preferencias del papel al cargar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.loadPaperPreferences);
} else {
    setTimeout(window.loadPaperPreferences, 100);
}
