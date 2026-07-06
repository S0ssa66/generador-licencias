import { LICENSE_CONFIGS, SEED_LICENSES, DEFAULT_TEMPLATES } from './config.js';
import { TRANSLATIONS, UI_TRANSLATIONS } from './i18n.js';
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


// ==================== EDITOR BLOCK 1 ====================
function selectLicenseType(type) {
    const config = LICENSE_CONFIGS[type];
    if (!config) return;

    // Actualizar campos principales
    document.getElementById('license-value').value = config.price;
    
    // Auto-generar código de referencia
    const refCode = generateReferenceCode(type);
    document.getElementById('ref-code').value = refCode;

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

// Generar código de referencia formal y entendible en español
function generateReferenceCode(type) {
    const today = new Date();
    const dateStr = today.getFullYear().toString() + 
                    String(today.getMonth() + 1).padStart(2, '0') + 
                    String(today.getDate()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    
    // Mapear los tipos de licencia a abreviaciones claras en español
    const typeMap = {
        basic: 'BAS',           // Básica
        premium: 'PREM',        // Premium
        premium_plus: 'PPLUS',  // Premium Plus
        unlimited_flp: 'ULIM', // Ilimitada
        exclusive: 'EXCL'       // Exclusiva
    };
    
    const typeCode = typeMap[type] || 'PERS'; // PERS para Personalizada
    return `LIC-${typeCode}-${dateStr}-${random}`;
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

async function loadTemplates() {
    activeTemplates = DEFAULT_TEMPLATES.map(t => ({ ...t }));
    
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
    const refCode = document.getElementById('ref-code').value.trim() || "[Código Referencia]";
    const effectiveDate = document.getElementById('effective-date').value;
    const dateFormatted = (currentLang === 'en' ? formatFechaIngles(effectiveDate) : formatFechaEspanol(effectiveDate)) || "[Fecha]";
    const isSossaProducer = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')) || 
                            (producerConfig.name && producerConfig.name.toLowerCase().includes('sossa'));

    let celebrationPlace = document.getElementById('celebration-place').value.trim() || "[Lugar de Celebración]";
    if (isSossaProducer) {
        celebrationPlace = currentLang === 'en' 
            ? "Executed electronically under the jurisdiction of New Mexico, USA" 
            : "Celebrado de forma electrónica bajo la jurisdicción de Nuevo México, EE. UU.";
    }

    const paymentMethod = document.getElementById('payment-method').value;
    let displayPaymentMethod = paymentMethod;
    if (isSossaProducer && ['PayPal', 'Tarjeta de Crédito', 'deuna', 'payphone', 'Stripe'].includes(paymentMethod)) {
        displayPaymentMethod = currentLang === 'en'
            ? "Authorized electronic payment processing (Stripe, PayPal, PayPhone, Deuna!)"
            : "Procesamiento electrónico de pago autorizado (Stripe, PayPal, PayPhone, Deuna!)";
    } else if (currentLang === 'en') {
        const paymentTranslations = {
            'PayPal': 'PayPal',
            'Transferencia Bancaria': 'Bank Transfer',
            'Tarjeta de Crédito': 'Credit Card',
            'Western Union': 'Western Union',
            'Otro': 'Other',
            'deuna': 'Deuna!',
            'payphone': 'PayPhone'
        };
        displayPaymentMethod = paymentTranslations[paymentMethod] || paymentMethod;
    }
    
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

    // Configurar variables de reemplazo

    // 1. Declaración legal del productor (Persona Natural vs. LLC de Nuevo México)
    let producer_legal_declaration = "";
    let producer_legal_declaration_en = "";
    if (isSossaProducer) {
        producer_legal_declaration = `**Sossa Music LLC**, una compañía de responsabilidad limitada constituida bajo las leyes del Estado de Nuevo México, EE. UU., representada legalmente por su Gerente **Joao David Dominguez** (quien opera bajo el seudónimo profesional de **Sossa**)`;
        producer_legal_declaration_en = `**Sossa Music LLC**, a limited liability company incorporated under the laws of the State of New Mexico, USA, legally represented by its Manager **Joao David Dominguez** (who operates under the professional pseudonym **Sossa**)`;
    } else {
        const prodName = producerConfig.name || "Joao David Dominguez";
        const prodAka = producerConfig.aka || "Sossa";
        const prodId = producerConfig.id || "0803743111";
        producer_legal_declaration = `**${prodName}**, conocido profesionalmente en la industria musical como **${prodAka}**, con documento de identidad Nro. ${prodId}`;
        producer_legal_declaration_en = `**${prodName}**, professionally known in the music industry as **${prodAka}**, with ID/Passport No. ${prodId}`;
    }

    // 2. Jurisdicción y ley aplicable
    let laws_jurisdiction = "";
    let laws_jurisdiction_en = "";
    let jurisdiction_place = "";
    let jurisdiction_place_en = "";
    if (isSossaProducer) {
        laws_jurisdiction = "Nuevo México, Estados Unidos de América";
        laws_jurisdiction_en = "New Mexico, United States of America";
        jurisdiction_place = "Nuevo México, EE. UU.";
        jurisdiction_place_en = "New Mexico, USA";
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
        clause_rescission_body = `El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente al **${terminationFee}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción.`;
        clause_rescission_body_en = `The Licensor reserves the discretionary power and exclusive option, executable within the first **three (3) years** from the signing of this Contract, to terminate this agreement early and unilaterally by written notice. For this termination to take effect, the Licensor will pay the Licensee compensation equivalent to **${terminationFee}**. Following notification and payment of said penalty, the Licensee will have a period of seven (7) days to take down and withdraw the New Song from all physical and digital distribution channels in the market. The Licensee expressly agrees that the payment of said penalty constitutes a full, sole, and final compensation for the termination of the agreement, and irrevocably waives the right to claim any other value, compensation, or damages for promotion, marketing, video production expenses, or any other investment made in connection with the New Song.`;
    }

    const vars = {
        producer_name: producerConfig.name || "Joao David Dominguez",
        producer_aka: producerConfig.aka || "Sossa",
        producer_id: producerConfig.id || "0803743111",
        producer_email: producerConfig.email || "masterjuego25@gmail.com",
        producer_phone: producerConfig.phone || "",
        producer_pro: producerConfig.pro || "BMI",
        producer_ipi: producerConfig.ipi || "01170943066",
        producer_publisher: producerConfig.publisher || "Songtrust",
        
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

        // Nuevas variables para Sossa Music LLC
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
                    ? `<div style="text-align: center; margin-bottom: 15px;"><img src="/logo-sossa.png" alt="SOSSA Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
                    : `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">${(producerConfig.aka || 'PRODUCTOR').toUpperCase()}</div>`
                  )
              );

    const bodyHtml = parseMarkdownToHTML(md);

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
    let signatureIdL = `${idLabelL} ${producerConfig.id || "0803743111"}`;
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
        const signatureLeftHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    ${producerConfig.signature
                        ? `<img src="${producerConfig.signature}" alt="Firma ${producerConfig.aka}" class="signature-img">`
                        : (isMonarco 
                            ? `<img src="/firma-cgmonarco.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                            : (isSossa
                                ? `<img src="/firma-sossa.png" alt="Firma ${producerConfig.aka}" class="signature-img">`
                                : `<div class="signature-placeholder" style="font-family:'Brush Script MT', cursive; font-size:28px; color:var(--accent); text-align:center; padding-top:5px; width:150px; margin:0 auto;">${producerConfig.name}</div>`
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
        
        const signatureRightHtml = `
            <div class="signature-block">
                <div class="signature-img-wrap">
                    <!-- Espacio en blanco reservado para alineación de firmas -->
                </div>
                <div class="signature-line"></div>
                <div class="signature-role">${signatureRoleR}</div>
                <div class="signature-name">${signatureNameR}</div>
                <div class="signature-aka">${signatureIdR}</div>
                <div class="signature-aka">${t.buyerSignatureDocusign || 'Firma vía DocuSign'}</div>
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
        signatureSectionHtml = `
            <div class="signature-section non-exclusive-acceptance" style="margin-top: 30px; display: flex; justify-content: center; width: 100%;">
                <div style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 15px 30px; background: rgba(16, 185, 129, 0.02); text-align: center; max-width: 500px; width: 100%;">
                    <div style="font-size: 18px; color: #10b981; font-weight: 800; margin-bottom: 5px;">✓ Aceptado vía Pago</div>
                    <div style="font-size: 11px; color: #636366; line-height: 1.4;">
                        Este acuerdo no requiere firma física de conformidad con los términos y condiciones de la plataforma y el pago registrado de manera electrónica el <strong>${formattedDate}</strong> bajo la referencia: <strong class="font-data-mono">${refCode}</strong>.
                    </div>
                </div>
            </div>
        `;
    }

    let html = `
        <div class="contract-doc">
            ${isSossa 
                ? `<div class="contract-watermark" style="background-image: url('/logo-sossa.png');"></div>` 
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
                            <strong>${t.sealVerified || 'DOCUMENTO INTEGRAL VERIFICADO'}</strong><br>
                            ${t.sealRef || 'Ref:'} ${refCode}<br>
                            ${t.sealStatus || 'Estado: Firmado y Vigente'}
                        </div>
                    </div>
                </div>
            </div>
            
            <hr style="margin: 15px 0;">
            
            <div class="doc-footer" style="text-align: center; font-size: 11px; color: #8a91a6;">
                <p><em>${t.footerText || 'Este documento fue generado por la plataforma BEATSS.'} ${tierName} — ${producerConfig.aka} ${effectiveDate ? new Date(effectiveDate + 'T00:00:00').getFullYear() : new Date().getFullYear()}.</em></p>
            </div>
        </div>
    `;

    return { md, html };
}

// Actualizar la previsualización en vivo en la pantalla
function generatePreview() {
    const { md, html } = compileContract();
    
    // Inyectar en el HTML renderizado
    document.getElementById('rendered-contract-content').innerHTML = html;
    
    // Inyectar en el contenedor de Markdown
    document.getElementById('markdown-contract-content').textContent = md;
    
    // Guardar borrador del formulario
    saveFormDraft();
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
    const refCode = document.getElementById('ref-code').value.trim();
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
    const finalRef = refCode || "REF";
    
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

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
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
                licenseType: type,
                markdownText: md,
                producerId: window.currentUser || 'sossa',
                producerName: pConfig.name || "Joao David Dominguez",
                aka: pConfig.aka || "Sossa",
                producerIdNum: pConfig.id || "0803743111",
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
            showToast('Error al generar el PDF criptográfico: ' + err.message, true);
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
            pagebreak:    { mode: ['css', 'legacy'] }
        };
        
        element.classList.add('printing-pdf');
        const paper = document.getElementById('license-paper');
        if (paper) paper.classList.add('printing-pdf');
        
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
            if (paper) paper.classList.remove('printing-pdf');
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
    const refMatch = t.match(/Invoice\s*#\s*([A-Za-z0-9_\-]+)/i) ||
                     t.match(/C[oó]digo de Referencia[^#]*#\s*([A-Za-z0-9_\-]+)/i) ||
                     t.match(/(LIC-[A-Z]+-\d{8}-\d+)/i);
    if (refMatch) refCode = refMatch[1].trim();
    if (!refCode) refCode = generateReferenceCode(type);

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

    // Formato: Licencia_PREMIUM_LIC-PREM-20260525-2872 - Beat - Comprador
    const m1 = name.match(
        /^Licencia[_ ](BASICA|B[AÁ]SICA|PREMIUM|ILIMITADA|EXCLUSIVA)[_ ](LIC-[A-Z]+-\d{8}-\d+)\s*-\s*(.+?)\s*-\s*(.+)$/i
    );
    if (m1) {
        type = mapTypeWord(m1[1]); refCode = m1[2].trim();
        beatName = m1[3].trim(); buyerName = m1[4].trim();
        date = extractDateFromRefCode(refCode) || fileDate;
        return buildLicenseRecord(refCode, date, beatName, buyerName, type);
    }

    // Formato: Licencia_PREMIUM_LIC-PREM-20260525-2872_Pa_Un_Lao_Comprador
    const parts = name.split('_');
    const refIdx = parts.findIndex(p => /^LIC-[A-Z]+-\d{8}-\d+$/i.test(p));
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
        refCode, date, beatName, buyerName, type,
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
        pagebreak:    { mode: ['css', 'legacy'] }
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
        const refCode = document.getElementById('ref-code').value.trim() || "REF";

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

// Cargar estado de la cuenta central de Google Drive (Admin)
async function loadPlatformGDriveStatus() {
    const statusEl = document.getElementById('cfg-gdrive-central-status');
    if (!statusEl) return;
    statusEl.textContent = 'Verificando estado...';
    try {
        const idToken = await auth.currentUser.getIdToken();
        const res = await fetch('/api/gdrive-status', {
            headers: { 'Authorization': `Bearer ${idToken}` }
        });
        const data = await res.json();
        if (res.ok && data.linked) {
            statusEl.innerHTML = `<span style="color: #48bb78; font-weight: 600;">✓ Vinculado a:</span> ${data.email}`;
            // Rellenar Client ID si está vacío
            const idInput = document.getElementById('cfg-gdrive-client-id');
            if (idInput && !idInput.value.trim()) {
                idInput.value = data.clientId || '';
            }
            const secretInput = document.getElementById('cfg-gdrive-client-secret');
            if (secretInput) {
                secretInput.placeholder = '•••••••••••••••••••••••• (Guardado)';
            }
        } else {
            statusEl.innerHTML = `<span style="color: #e53e3e; font-weight: 600;">✗ No vinculado</span>`;
            const secretInput = document.getElementById('cfg-gdrive-client-secret');
            if (secretInput) {
                secretInput.placeholder = 'Ingresa el Client Secret de Google Cloud';
            }
        }
    } catch (e) {
        console.error('Error al cargar estado de Drive Central:', e);
        statusEl.textContent = 'Error al obtener estado.';
    }
}

// Iniciar flujo de vinculación OAuth (Admin)
function initPlatformGDriveOAuth() {
    const clientId = document.getElementById('cfg-gdrive-client-id').value.trim();
    const clientSecret = document.getElementById('cfg-gdrive-client-secret').value.trim();
    if (!clientId) {
        showToast('Por favor, ingresa el Client ID de Google para vincular.', true);
        return;
    }
    if (!clientSecret) {
        showToast('Por favor, ingresa el Client Secret de Google para vincular.', true);
        return;
    }
    
    showToast('☁️ Abriendo ventana de Google para vinculación central...');
    
    const client = google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        ux_mode: 'popup',
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
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({
                        code: code,
                        clientId: clientId,
                        clientSecret: clientSecret
                    })
                });
                const resData = await res.json();
                if (res.ok && resData.success) {
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
    if (user) {
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
    if (typeof google === 'undefined' || !google.accounts) {
        throw new Error('Google Identity Services no cargó. Verifica tu conexión a Internet.');
    }

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

// Subir PDF a la nube usando Google Drive > GoFile > PixelDrain > file.io > tmpfiles.org
async function uploadPDFToCloud(base64DataUri, filename) {
    const blob = await dataURLtoBlob(base64DataUri);
    let storageProvider = producerConfig.storageProvider || 'gdrive-central';

    // Si eligió Drive personal pero no configuró las credenciales, usar el central
    if (storageProvider === 'gdrive' && !producerConfig.gdriveClientId) {
        storageProvider = 'gdrive-central';
    }

    async function uploadToCentral() {
        console.log('Subiendo PDF a Google Drive Central...');
        const idToken = await auth.currentUser.getIdToken();
        const sessionRes = await fetch('/api/gdrive-upload-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                fileName: filename,
                subFolder: 'Contratos',
                contentType: 'application/pdf',
                producerAka: producerConfig.aka || producerConfig.name
            })
        });

        if (!sessionRes.ok) {
            let errMsg = 'No se pudo iniciar la sesión de subida en Google Drive Central.';
            try {
                const sessionErr = await sessionRes.json();
                errMsg = sessionErr.error || errMsg;
            } catch (e) {
                try {
                    errMsg = await sessionRes.text();
                } catch (textErr) {}
            }
            throw new Error(`HTTP ${sessionRes.status}: ${errMsg}`);
        }

        const sessionData = await sessionRes.json();
        const uploadUrl = sessionData.uploadUrl;

        const resJson = await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.setRequestHeader('Content-Type', 'application/pdf');
            xhr.onreadystatechange = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(JSON.parse(xhr.responseText));
                        } catch (e) {
                            reject(e);
                        }
                    } else {
                        reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText}`));
                    }
                }
            };
            xhr.send(blob);
        });

        const downloadUrl = `${window.location.origin}/api/proxy-audio?id=${resJson.id}`;
        console.log('PDF subido con éxito a Google Drive Central:', downloadUrl);
        return downloadUrl;
    }

    // 0. Intentar con Google Drive Central (plataforma)
    if (storageProvider === 'gdrive-central' && auth.currentUser) {
        try {
            return await uploadToCentral();
        } catch (centralDriveErr) {
            console.warn('Google Drive Central falló, intentando otros métodos:', centralDriveErr.message);
        }
    }

    // 0.1 Intentar con Google Drive Personal
    if (storageProvider === 'gdrive') {
        try {
            console.log('Subiendo PDF a Google Drive Personal...');
            const driveUrl = await uploadToGoogleDrive(base64DataUri, filename);
            console.log('PDF subido con éxito a Google Drive Personal:', driveUrl);
            return driveUrl;
        } catch (driveErr) {
            console.warn('Google Drive Personal falló, intentando fallback a Google Drive Central:', driveErr.message);
            if (auth.currentUser) {
                try {
                    return await uploadToCentral();
                } catch (centralErr) {
                    console.warn('Fallo también en Google Drive Central:', centralErr.message);
                }
            }
        }
    }

    // 0.1 Intentar con Firebase Storage (Excelente alternativa oficial, 100% segura y estable)
    if (typeof storage !== 'undefined' && auth.currentUser) {
        try {
            console.log('Subiendo PDF a Firebase Storage...');
            const storagePath = `licenses/${auth.currentUser.uid}/${Date.now()}_${filename}`;
            const downloadUrl = await uploadFileToStorage(blob, storagePath);
            console.log('PDF subido con éxito a Firebase Storage:', downloadUrl);
            return downloadUrl;
        } catch (storageErr) {
            console.warn('Firebase Storage falló, intentando otros métodos:', storageErr.message);
        }
    }
    
    // 1. Intentar con PixelDrain (Limpio, sin cookies ni credenciales locales para evitar 401)
    try {
        console.log('Subiendo a PixelDrain...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetchWithTimeout('https://pixeldrain.com/api/file', {
            method: 'POST',
            body: formData,
            credentials: 'omit',
            timeout: 8000
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido a PixelDrain con éxito ID:', data.id);
                return `https://pixeldrain.com/api/file/${data.id}`;
            }
        }
    } catch (e) {
        console.error('Error al subir a PixelDrain:', e);
    }

    // 2. Intentar con tmpfiles.org (Directo y con CORS)
    try {
        console.log('Subiendo a tmpfiles.org...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetchWithTimeout('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData,
            timeout: 8000
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const viewerUrl = data.data.url;
                const downloadUrl = viewerUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log('Subido a tmpfiles.org con éxito:', downloadUrl);
                return downloadUrl;
            }
        }
    } catch (e) {
        console.error('Error al subir a tmpfiles.org:', e);
    }

    // 3. Intentar con GoFile (Recomendado, sin límites de descarga)
    try {
        console.log('Subiendo a GoFile...');
        const serverResponse = await fetchWithTimeout('https://api.gofile.io/getServer', { timeout: 6000 });
        let server = 'store1';
        if (serverResponse.ok) {
            const serverData = await serverResponse.json();
            if (serverData.status === 'ok' && serverData.data && serverData.data.server) {
                server = serverData.data.server;
            }
        }
        
        const formData = new FormData();
        formData.append('file', blob, filename);
        
        const uploadResponse = await fetchWithTimeout(`https://${server}.gofile.io/uploadFile`, {
            method: 'POST',
            body: formData,
            timeout: 8000
        });
        
        if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            if (uploadData.status === 'ok' && uploadData.data && uploadData.data.downloadPage) {
                console.log('Subido a GoFile con éxito:', uploadData.data.downloadPage);
                return uploadData.data.downloadPage;
            }
        }
    } catch (e) {
        console.error('Error al subir a GoFile:', e);
    }

    // 4. Intentar con file.io (1 sola descarga, pero muy fiable)
    try {
        console.log('Subiendo a file.io...');
        const formData = new FormData();
        formData.append('file', blob, filename);

        const response = await fetchWithTimeout('https://file.io/', {
            method: 'POST',
            body: formData,
            timeout: 8000
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido a file.io con éxito:', data.link);
                return data.link;
            }
        }
    } catch (e) {
        console.error('Error al subir a file.io:', e);
    }

    throw new Error('No se pudo subir el PDF del contrato a ningún servidor de almacenamiento temporal.');
}

// Enviar correo de entrega usando EmailJS (Subiendo PDF a la nube para plan gratis)
async function sendEmailDelivery() {
    const refCode = document.getElementById('ref-code').value.trim();
    const isNew = !licenseHistory.some(l => l.refCode === refCode);
    if (isNew && checkPlanLimitExceeded('enviar esta nueva licencia por correo')) {
        return;
    }

    // Validaciones de formulario necesarias
    if (!validateLicenseForm()) {
        return;
    }

    // Guardar contacto automáticamente
    autoSaveContact();
    
    // Auto-guardar en historial al enviar por correo
    saveCurrentLicenseToHistory(true);

    const serviceId = producerConfig.emailjsServiceId || 'service_7ofza2v';
    const templateId = producerConfig.emailjsTemplateId || 'template_mlimkld';
    const publicKey = producerConfig.emailjsPublicKey || 'Xwfa8Ai2WcXXGThLI';

    const btn = document.getElementById('btn-send-email');
    const originalText = btn.innerHTML;

    if (typeof emailjs === 'undefined') {
        try {
            btn.innerHTML = '⏳ Cargando EmailJS...';
            btn.disabled = true;
            await loadScript('https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js');
        } catch (e) {
            showToast('El cargador de EmailJS no está disponible. Conéctate a Internet.', true);
            return;
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    if (typeof html2pdf === 'undefined') {
        try {
            btn.innerHTML = '⏳ Cargando librería PDF...';
            btn.disabled = true;
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        } catch (e) {
            showToast('La librería PDF no está disponible. Conéctate a Internet.', true);
            return;
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
            pagebreak:    { mode: ['css', 'legacy'] }
        };

        element.classList.add('printing-pdf');
        let base64DataUri;
        try {
            base64DataUri = await html2pdf().from(element).set(opt).outputPdf('datauristring');
        } finally {
            element.classList.remove('printing-pdf');
        }
        updateProgressStep('step-pdf', 'Completado', true);
        
        // 2. Subir el PDF a la nube
        updateProgressStep('step-cloud', 'Procesando...', false);
        
        const type = getActiveLicenseType();
        const refCode = document.getElementById('ref-code').value.trim() || "REF";
        const pdfFilename = `Licencia_${type.toUpperCase()}_${refCode}.pdf`;
        
        let pdfUrl = "";
        try {
            pdfUrl = await uploadPDFToCloud(base64DataUri, pdfFilename);
            updateProgressStep('step-cloud', 'Completado', true);
        } catch (uploadError) {
            console.error('Error al subir PDF:', uploadError);
            updateProgressStep('step-cloud', 'Error (Se omitirá)', false, true);
        }

        // 3. Inicializar EmailJS con la llave pública
        emailjs.init(publicKey);

        // 4. Preparar los enlaces de descarga en base al tipo de licencia
        const mp3 = document.getElementById('audio-link-mp3').value.trim();
        const wav = document.getElementById('audio-link-wav').value.trim();
        const stems = document.getElementById('audio-link-stems').value.trim();

        const typeLabels = {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Premium Plus',
            unlimited_flp: 'Ilimitada',
            unlimited: 'Ilimitada',
            exclusive: 'Exclusiva'
        };

        const producerDisplayName = producerConfig.aka || producerConfig.name || "Productor";
        let linksText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${pdfUrl ? `
    <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; text-align: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 10px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Documento Oficial y Legal</div>
        <a href="${pdfUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0055ee; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #0044cc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">📄 Descargar Contrato (PDF)</a>
    </div>
    ` : ''}
    
    <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 12px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Archivos de Audio de Alta Calidad</div>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            ${mp3 ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental MP3 (320kbps)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${mp3}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${wav && (type !== 'basic') ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental WAV (Master)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${wav}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${stems && (type !== 'basic' && type !== 'premium') ? `
            <tr>
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Pistas Separadas (Stems)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${stems}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
        </table>
    </div>
</div>
        `;

        const templateParams = {
            to_name: buyerName,
            to_email: buyerEmail,
            beat_name: beatName,
            license_type: typeLabels[type] || type,
            delivery_links: linksText,
            producer_name: "BEATSS",
            producer_email: producerConfig.email,
            pdf_filename: pdfFilename
        };

        // 5. Enviar usando emailjs.send
        updateProgressStep('step-email', 'Procesando...', false);

        const response = await emailjs.send(serviceId, templateId, templateParams);
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Enviada!', 'El comprador recibió el correo con el contrato PDF y los archivos de audio.');
        console.log('SUCCESS!', response.status, response.text);

    } catch (err) {
        console.error('Error al enviar correo por EmailJS:', err);
        showProgressError('Fallo en el Envío', err.message || 'Ocurrió un error inesperado al enviar el email.');
        
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
            'payment-method': draft.paymentMethod,
            'effective-date': draft.effectiveDate,
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
        
        selectLicenseType('basic');
        showToast('Campos del formulario limpiados');
    }
}


// ==================== EDITOR BLOCK 3 ====================

// ==========================================================================
// VERIFICAR FIRMA DOCUSIGN Y ENVIAR ENTREGA COMPLETA (PDF FIRMADO + LINKS)
// ==========================================================================
async function checkAndSendSignedDelivery() {
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

    // Validar credenciales de EmailJS
    const serviceId  = 'service_7ofza2v';
    const templateId = 'template_mlimkld';
    const publicKey  = 'Xwfa8Ai2WcXXGThLI';

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

        const beatName = document.getElementById('beat-name').value.trim() || 'Beat';
        const type     = getActiveLicenseType();
        const refCode  = document.getElementById('ref-code').value.trim() || 'REF';
        const filename = `Contrato_FIRMADO_${type.toUpperCase()}_${refCode}.pdf`;

        let cloudUrl = '';
        try {
            cloudUrl = await uploadPDFToCloud(dataUri, filename);
            updateProgressStep('step-cloud', 'Completado', true);
        } catch (uploadErr) {
            console.warn('No se pudo subir el PDF firmado a la nube:', uploadErr);
            updateProgressStep('step-cloud', 'Error (Se omitirá)', false, true);
        }

        // 3. Enviar email de entrega via EmailJS
        updateProgressStep('step-email', 'Procesando...', false);

        const mp3   = document.getElementById('audio-link-mp3').value.trim();
        const wav   = document.getElementById('audio-link-wav').value.trim();
        const stems = document.getElementById('audio-link-stems').value.trim();

        const typeLabels = {
            basic: 'Básica', premium: 'Premium',
            premium_plus: 'Premium Plus', unlimited_flp: 'Ilimitada',
            unlimited: 'Ilimitada', exclusive: 'Exclusiva'
        };

        const producerDisplayName = producerConfig.aka || producerConfig.name || "Productor";
        let linksText = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    ${cloudUrl ? `
    <div style="margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid #edf2f7; text-align: center;">
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 10px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Contrato Oficial Firmado</div>
        <a href="${cloudUrl}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #10b981; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-size: 13px; font-weight: 700; border: 1px solid #0f9f67; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">✅ Descargar Contrato Firmado (PDF)</a>
    </div>
    ` : ''}
    
    <div>
        <div style="font-size: 10px; text-transform: uppercase; color: #718096 !important; font-weight: 700; margin-bottom: 12px; letter-spacing: 1.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Archivos de Audio de Alta Calidad</div>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
            ${mp3 ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental MP3 (320kbps)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${mp3}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${wav && (type !== 'basic') ? `
            <tr style="border-bottom: 1px solid #edf2f7;">
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Instrumental WAV (Master)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${wav}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
            ${stems && (type !== 'basic' && type !== 'premium') ? `
            <tr>
                <td width="70%" style="padding: 12px 0; font-size: 13px; color: #1a202c !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; word-wrap: break-word;"><span style="color: #10b981; font-weight: bold; margin-right: 6px;">✔</span> Pistas Separadas (Stems)</td>
                <td width="30%" align="right" style="padding: 12px 0; text-align: right;"><a href="${stems}" target="_blank" style="display: inline-block; padding: 6px 12px; background-color: #f1f5f9; color: #0055ee !important; text-decoration: none; border-radius: 6px; font-size: 12px; font-weight: 700; border: 1px solid #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">Descargar</a></td>
            </tr>
            ` : ''}
        </table>
    </div>
</div>
        `;

        emailjs.init(publicKey);
        const templateParams = {
            to_name:        buyerName,
            to_email:       buyerEmail,
            beat_name:      beatName,
            license_type:   typeLabels[type] || type,
            delivery_links: linksText,
            producer_name:  "BEATSS",
            producer_email: producerConfig.email,
            pdf_filename:   filename
        };

        await emailjs.send(serviceId, templateId, templateParams);
        updateProgressStep('step-email', 'Completado', true);
        
        showProgressSuccess('¡Entrega Completada!', 'El comprador recibió el PDF firmado y sus archivos de audio.');
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
    closeBtn.style.display = 'none';
    
    // Reset spinner / icon
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="position: relative; width: 80px; height: 80px; display: flex; align-items: center; justify-content: center;">
            <div style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid rgba(0, 102, 255, 0.1); border-top-color: var(--accent); animation: spin 1s linear infinite; position: absolute;"></div>
            <i data-lucide="mail" style="width: 28px; height: 28px; color: var(--accent);"></i>
        </div>
    `;
    
    modal.style.display = 'flex';
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function resetProgressStep(stepId, iconName, labelText) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    stepEl.style.color = '#626475';
    stepEl.innerHTML = `
        <span style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="${iconName}" style="width: 16px; height: 16px; color: #626475;"></i>
            <span>${labelText}</span>
        </span>
        <span class="step-status" style="font-weight: 700;">Esperando...</span>
    `;
}

export function updateProgressStep(stepId, statusText, isCompleted, isError = false) {
    const stepEl = document.getElementById(stepId);
    if (!stepEl) return;
    
    const statusEl = stepEl.querySelector('.step-status');
    const iconEl = stepEl.querySelector('i');
    
    if (isError) {
        stepEl.style.color = 'var(--danger)';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--danger)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--danger)';
            iconEl.setAttribute('data-lucide', 'alert-triangle');
        }
    } else if (isCompleted) {
        stepEl.style.color = '#f5f5f9';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--success)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--success)';
            iconEl.setAttribute('data-lucide', 'check-circle-2');
        }
    } else {
        stepEl.style.color = '#f5f5f9';
        if (statusEl) {
            statusEl.textContent = statusText;
            statusEl.style.color = 'var(--accent)';
        }
        if (iconEl) {
            iconEl.style.color = 'var(--accent)';
        }
    }
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function showProgressSuccess(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(0, 230, 118, 0.1); border: 2px solid var(--success); display: flex; align-items: center; justify-content: center; animation: scaleUp 0.3s ease-out;">
            <i data-lucide="check" style="width: 40px; height: 40px; color: var(--success);"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    closeBtn.style.display = 'inline-flex';
    
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

export function showProgressError(title, subtitle) {
    const spinnerContainer = document.getElementById('progress-spinner-container');
    spinnerContainer.innerHTML = `
        <div style="width: 80px; height: 80px; border-radius: 50%; background: rgba(255, 79, 112, 0.1); border: 2px solid var(--danger); display: flex; align-items: center; justify-content: center;">
            <i data-lucide="x" style="width: 40px; height: 40px; color: var(--danger);"></i>
        </div>
    `;
    
    document.getElementById('progress-title').textContent = title;
    document.getElementById('progress-subtitle').textContent = subtitle;
    
    const closeBtn = document.getElementById('btn-close-progress');
    closeBtn.style.display = 'inline-flex';
    
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

window.showProgressModal = showProgressModal;
window.resetProgressStep = resetProgressStep;
window.updateProgressStep = updateProgressStep;
window.showProgressSuccess = showProgressSuccess;
window.showProgressError = showProgressError;

export function compileContractData(orderData, producerConfig, templateId = 'licencia_uso', lang = 'es') {
    const type = orderData.licenseType || 'basic';
    const isExclusive = type === 'exclusive';
    const defaultConfig = LICENSE_CONFIGS[type] || LICENSE_CONFIGS.basic;

    const beatName = orderData.beatName || "[Nombre del Beat]";
    const beatBpm = orderData.beatBpm || "";
    const beatKey = orderData.beatKey || "";
    const buyerName = orderData.buyerName || "[Nombre del Comprador]";
    const buyerId = orderData.buyerDni || orderData.buyerId || "[Cédula/DNI]";
    const buyerEmail = orderData.buyerEmail || "[Correo del Comprador]";
    const buyerPhone = orderData.buyerPhone || "";
    const buyerCity = orderData.buyerCity || "[Ciudad]";
    const buyerCountry = orderData.buyerCountry || "[País]";
    const value = parseFloat(orderData.finalPrice !== undefined ? orderData.finalPrice : (orderData.price || defaultConfig.price)) || 0;
    const refCode = orderData.reference || "[Código Referencia]";
    const effectiveDate = orderData.timestamp ? orderData.timestamp.split('T')[0] : new Date().toISOString().split('T')[0];
    const dateFormatted = (lang === 'en' ? formatFechaIngles(effectiveDate) : formatFechaEspanol(effectiveDate)) || "[Fecha]";
    const isSossaProducer = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa')) || 
                            (producerConfig.name && producerConfig.name.toLowerCase().includes('sossa'));

    let celebrationPlace = orderData.celebrationPlace;
    if (!celebrationPlace) {
        if (isSossaProducer) {
            celebrationPlace = lang === 'en' 
                ? "Executed electronically under the jurisdiction of New Mexico, USA" 
                : "Celebrado de forma electrónica bajo la jurisdicción de Nuevo México, EE. UU.";
        } else {
            celebrationPlace = buyerCity ? `${buyerCity}, ${buyerCountry}` : "[Lugar de Celebración]";
        }
    }

    const paymentMethod = orderData.method || "PayPal";
    
    let displayPaymentMethod = paymentMethod;
    if (isSossaProducer && ['PayPal', 'Tarjeta de Crédito', 'deuna', 'payphone', 'Stripe'].includes(paymentMethod)) {
        displayPaymentMethod = lang === 'en'
            ? "Authorized electronic payment processing (Stripe, PayPal, PayPhone, Deuna!)"
            : "Procesamiento electrónico de pago autorizado (Stripe, PayPal, PayPhone, Deuna!)";
    } else if (lang === 'en') {
        const paymentTranslations = {
            'PayPal': 'PayPal',
            'Transferencia Bancaria': 'Bank Transfer',
            'Tarjeta de Crédito': 'Credit Card',
            'Western Union': 'Western Union',
            'Otro': 'Other',
            'deuna': 'Deuna!',
            'payphone': 'PayPhone'
        };
        displayPaymentMethod = paymentTranslations[paymentMethod] || paymentMethod;
    }
    
    const formats = orderData.formats || defaultConfig.formats || "[Formatos]";
    const streams = orderData.streams || defaultConfig.streams || "[Límite Streams]";
    const physical = orderData.physical || defaultConfig.physical || "[Límite Físicas]";
    const videos = orderData.videos || defaultConfig.videos || "[Videos]";
    const videoDuration = orderData.videoDuration || defaultConfig.videoDuration || "[Duración Video]";
    const years = orderData.years || defaultConfig.years || "[Años de Vigencia]";
    const terminationFee = orderData.terminationFee || '1000';
    const writerShare = orderData.writerShare !== undefined ? orderData.writerShare : (defaultConfig.writerShare || 50);
    const producerShare = orderData.producerShare !== undefined ? orderData.producerShare : (defaultConfig.producerShare || 50);
    const credits = orderData.credits || `Prod. por ${producerConfig.aka || 'Sossa'}`;
    const contentIdProhibited = orderData.contentIdProhibited !== undefined 
        ? orderData.contentIdProhibited 
        : (defaultConfig.contentId !== undefined ? !defaultConfig.contentId : true);

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

    // 1. Declaración legal del productor (Persona Natural vs. LLC de Nuevo México)
    let producer_legal_declaration = "";
    let producer_legal_declaration_en = "";
    if (isSossaProducer) {
        producer_legal_declaration = `**Sossa Music LLC**, una compañía de responsabilidad limitada constituida bajo las leyes del Estado de Nuevo México, EE. UU., representada legalmente por su Gerente **Joao David Dominguez** (quien opera bajo el seudónimo profesional de **Sossa**)`;
        producer_legal_declaration_en = `**Sossa Music LLC**, a limited liability company incorporated under the laws of the State of New Mexico, USA, legally represented by its Manager **Joao David Dominguez** (who operates under the professional pseudonym **Sossa**)`;
    } else {
        const prodName = producerConfig.name || "Joao David Dominguez";
        const prodAka = producerConfig.aka || "Sossa";
        const prodId = producerConfig.id || "0803743111";
        producer_legal_declaration = `**${prodName}**, conocido profesionalmente en la industria musical como **${prodAka}**, con documento de identidad Nro. ${prodId}`;
        producer_legal_declaration_en = `**${prodName}**, professionally known in the music industry as **${prodAka}**, with ID/Passport No. ${prodId}`;
    }

    // 2. Jurisdicción y ley aplicable
    let laws_jurisdiction = "";
    let laws_jurisdiction_en = "";
    let jurisdiction_place = "";
    let jurisdiction_place_en = "";
    if (isSossaProducer) {
        laws_jurisdiction = "Nuevo México, Estados Unidos de América";
        laws_jurisdiction_en = "New Mexico, United States of America";
        jurisdiction_place = "Nuevo México, EE. UU.";
        jurisdiction_place_en = "New Mexico, USA";
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
        clause_rescission_body = `El Licenciante se reserva la facultad discrecional y la opción exclusiva, ejecutable dentro de los primeros **tres (3) años** a partir de la firma de este Contrato, de dar por terminado el presente acuerdo de forma anticipada y unilateral mediante notificación escrita. Para que esta rescisión surta efecto, el Licenciante pagará al Licenciatario una indemnización equivalente al **${terminationFee}**. Tras la notificación y el pago de dicha penalidad, el Licenciatario dispondrá de un plazo máximo de siete (7) días para dar de baja y retirar la Nueva Canción de todos los canales de distribución físicos y digitales del mercado. El Licenciatario acepta expresamente que el pago de dicha penalidad constituye una indemnización total, única y final por la terminación del contrato, y renuncia irrevocablemente a reclamar cualquier otro valor, compensación o indemnización por concepto de daños, pérdidas, gastos de promoción, marketing, producción de videoclips o cualquier otra inversión realizada en relación con la Nueva Canción.`;
        clause_rescission_body_en = `The Licensor reserves the discretionary power and exclusive option, executable within the first **three (3) years** from the signing of this Contract, to terminate this agreement early and unilaterally by written notice. For this termination to take effect, the Licensor will pay the Licensee compensation equivalent to **${terminationFee}**. Following notification and payment of said penalty, the Licensee will have a period of seven (7) days to take down and withdraw the New Song from all physical and digital distribution channels in the market. The Licensee expressly agrees that the payment of said penalty constitutes a full, sole, and final compensation for the termination of the agreement, and irrevocably waives the right to claim any other value, compensation, or damages for promotion, marketing, video production expenses, or any other investment made in connection with the New Song.`;
    }

    const vars = {
        producer_name: producerConfig.name || "Joao David Dominguez",
        producer_aka: producerConfig.aka || "Sossa",
        producer_id: producerConfig.id || "0803743111",
        producer_email: producerConfig.email || "masterjuego25@gmail.com",
        producer_phone: producerConfig.phone || "",
        producer_pro: producerConfig.pro || "BMI",
        producer_ipi: producerConfig.ipi || "01170943066",
        producer_publisher: producerConfig.publisher || "Songtrust",
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

    const t = TRANSLATIONS[lang] || {};
    const isMonarco = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('monarco'));
    const isSossa = (producerConfig.aka && producerConfig.aka.toLowerCase().includes('sossa'));
    const hasCustomLogo = producerConfig.logoBase64;
    const logoHtml = hasCustomLogo
            ? `<div style="text-align: center; margin-bottom: 15px;"><img src="${producerConfig.logoBase64}" alt="Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
            : (isMonarco
                ? `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">CG MONARCO</div>` 
                : (isSossa 
                    ? `<div style="text-align: center; margin-bottom: 15px;"><img src="/logo-sossa.png" alt="SOSSA Logo" class="doc-logo" style="max-height: 80px; width: auto; margin: 0 auto; display: block;"></div>`
                    : `<div style="font-size: 24px; font-weight: bold; color: #111112; padding: 10px; text-align: center; font-family: 'Montserrat', sans-serif;">${(producerConfig.aka || 'PRODUCTOR').toUpperCase()}</div>`
                  )
              );

    const bodyHtml = parseMarkdownToHTML(md);
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
    let signatureIdL = `${idLabelL} ${producerConfig.id || "0803743111"}`;
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
        signaturesSectionHtml = `
            <div class="non-exclusive-acceptance-wrapper" style="display: flex; justify-content: center; width: 100%; page-break-inside: avoid; break-inside: avoid;">
                <div style="border: 2px dashed rgba(16, 185, 129, 0.4); border-radius: 8px; padding: 15px 30px; background: rgba(16, 185, 129, 0.02); text-align: center; max-width: 500px; width: 100%;">
                    <div style="font-size: 18px; color: #10b981; font-weight: 800; margin-bottom: 5px;">✓ Aceptado vía Pago</div>
                    <div style="font-size: 11px; color: #636366; line-height: 1.4;">
                        Este acuerdo no requiere firma física de conformidad con los términos y condiciones de la plataforma y el pago registrado de manera electrónica el <strong>${formattedDate}</strong> bajo la referencia: <strong class="font-data-mono">${refCode}</strong>.
                    </div>
                </div>
            </div>
        `;
    }

    const html = `
        <div class="contract-doc-header">
            ${logoHtml}
            <h3>${activeTemplate.name ? activeTemplate.name.toUpperCase() : 'CONTRATO DE LICENCIA DE USO'}</h3>
            <div class="doc-header-meta">
                <span><strong>${t.refCodeLabel || 'REF:'}</strong> <span class="font-data-mono">${refCode}</span></span>
                <span style="margin: 0 10px;">|</span>
                <span><strong>${t.dateLabel || 'Fecha:'}</strong> ${dateFormatted}</span>
            </div>
        </div>
        
        <div class="contract-doc-body">
            ${bodyHtml}
        </div>

        <div class="contract-closure" style="page-break-inside: avoid !important; break-inside: avoid !important;">
            ${signaturesSectionHtml}
        </div>
    `;

    return { md, html, needsBuyerSignature };
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

