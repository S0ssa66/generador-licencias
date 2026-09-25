import { auth } from '../firebase.js';

const PENDING_STATES = new Set(['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA', 'PENDING_AUTORIZACION']);
const REVIEW_STATES = new Set(['AUTORIZADO_ENTREGA_PENDIENTE', 'ERROR_REQUIERE_REVISION']);
const OFFICIAL_SRI_INVOICER_URL = 'https://www.sri.gob.ec/facturador-sri';

function safeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function invoiceKey(invoice) {
    return String(invoice?.firestoreId || invoice?.paymentId || invoice?.id || invoice?.reference || invoice?.refCode || '').trim();
}

const KNOWN_BUYER_CORRECTIONS = {
    'BS3-20260913-BAS-EQTS-W2T4-YQZS-H3QB-43PN': {
        buyerName: 'Jefferson Andrés Ambuludi Ordóñez',
        buyerId: '1900680164',
        buyerAddress: 'Zamora, Zamora Chinchipe, Ecuador',
        buyerCity: 'Zamora',
        buyerCountry: 'Ecuador',
        buyerPhone: '+593 99 758 7297',
        buyerEmail: 'ordonezjeffer798@gmail.com'
    }
};

function getBuyerCorrection(invoice) {
    const keys = [
        invoice?.refCode,
        invoice?.reference,
        invoice?.contractReference,
        invoice?.firestoreId,
        invoice?.paymentId,
        invoice?.id,
        invoiceKey(invoice)
    ].filter(Boolean).map(v => String(v).trim());
    for (const key of keys) {
        if (KNOWN_BUYER_CORRECTIONS[key]) return KNOWN_BUYER_CORRECTIONS[key];
    }
    return {};
}

function currentHistory() {
    const list = Array.isArray(window.licenseHistory) ? window.licenseHistory : [];
    return list
        .filter(item => item && typeof item === 'object')
        .map(item => {
            if (item.value == null && (item.finalPrice != null || item.price != null || item.amount != null)) {
                item.value = item.finalPrice ?? item.price ?? item.amount;
            }
            const correction = getBuyerCorrection(item);
            if (correction.buyerId) {
                if (!item.buyerDni || /^no proporcionad/i.test(item.buyerDni)) item.buyerDni = correction.buyerId;
                if (!item.buyerCity || /^no proporcionad/i.test(item.buyerCity)) item.buyerCity = correction.buyerCity;
                if (!item.buyerAddress || /^no proporcionad/i.test(item.buyerAddress)) item.buyerAddress = correction.buyerAddress;
                if (!item.buyerPhone) item.buyerPhone = correction.buyerPhone;
                if (!item.buyerEmail || /^no proporcionad/i.test(item.buyerEmail)) item.buyerEmail = correction.buyerEmail;
                if (!item.buyerName || /^no proporcionad/i.test(item.buyerName)) item.buyerName = correction.buyerName;
                if (item.formData) {
                    if (!item.formData.buyerId || /^no proporcionad/i.test(item.formData.buyerId)) item.formData.buyerId = correction.buyerId;
                    if (!item.formData.buyerCity || /^no proporcionad/i.test(item.formData.buyerCity)) item.formData.buyerCity = correction.buyerCity;
                    if (!item.formData.buyerAddress || /^no proporcionad/i.test(item.formData.buyerAddress)) item.formData.buyerAddress = correction.buyerAddress;
                    if (!item.formData.buyerPhone) item.formData.buyerPhone = correction.buyerPhone;
                    if (!item.formData.buyerEmail || /^no proporcionad/i.test(item.formData.buyerEmail)) item.formData.buyerEmail = correction.buyerEmail;
                    if (!item.formData.buyerName || /^no proporcionad/i.test(item.formData.buyerName)) item.formData.buyerName = correction.buyerName;
                }
            }
            return item;
        });
}

function statusOf(invoice) {
    return String(invoice?.sriEstado || '').trim().toUpperCase();
}

function stateClass(status) {
    if (status === 'AUTORIZADO') return 'authorized';
    if (status === 'ARCHIVOS_MANUALES_REGISTRADOS') return 'pending';
    if (status === 'ARCHIVOS_MANUALES_VERIFICADOS') return 'manual';
    if (PENDING_STATES.has(status)) return 'pending';
    if (REVIEW_STATES.has(status)) return 'failed';
    if (status.startsWith('ERROR_') || status.startsWith('RECHAZADO_')) return 'failed';
    return 'none';
}

function stateLabel(status) {
    if (status === 'AUTORIZADO') return 'AUTORIZADA';
    if (status === 'ARCHIVOS_MANUALES_REGISTRADOS') return 'ARCHIVOS MANUALES · REVISAR';
    if (status === 'ARCHIVOS_MANUALES_VERIFICADOS') return 'REVISIÓN HUMANA CONFIRMADA';
    if (status === 'EN_COLA_EMISION') return 'EN COLA DE EMISIÓN';
    if (status === 'EN_PROCESO') return 'EN PROCESO SRI';
    if (status === 'PENDIENTE_AUTORIZACION') return 'PENDIENTE DE AUTORIZACIÓN';
    if (status === 'AUTORIZADO_ENTREGA_PENDIENTE') return 'AUTORIZADA · ENTREGA PENDIENTE';
    if (status === 'ERROR_REQUIERE_REVISION') return 'REQUIERE REVISIÓN';
    if (PENDING_STATES.has(status)) return 'EN PROCESO';
    if (status.startsWith('ERROR_') || status.startsWith('RECHAZADO_')) return 'REVISAR';
    return 'SIN EMITIR';
}

function isSandboxInvoice(invoice) {
    const reference = String(invoice?.reference || invoice?.refCode || invoiceKey(invoice));
    return invoice?.providerLivemode === false || invoice?.sandbox === true || invoice?.isSandbox === true || invoice?.testMode === true || /^cs_test_/i.test(reference);
}

function canRegisterManualPayment(invoice, isSandbox) {
    const status = statusOf(invoice);
    const clearFiscalStates = new Set(['', 'SIN_EMITIR', 'NO_EMITIDA']);
    const referenceValues = [invoice?.reference, invoice?.refCode, invoice?.contractReference, invoice?.firestoreId]
        .map(value => String(value || '').trim());
    const amount = Number(invoice?.value ?? invoice?.finalPrice ?? invoice?.price ?? invoice?.amount);
    const hasFiscalArtifacts = Boolean(invoice?.sriClaveAcceso || invoice?.sriJobId || invoice?.sriNumeroAutorizacion ||
        invoice?.sriXmlStoragePath || invoice?.sriRideStoragePath || invoice?.sriXmlSha256 || invoice?.sriRideSha256 ||
        ['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'].includes(String(invoice?.sriManualArtifactsStatus || '')));
    const hasPaymentProof = invoice?.status === 'approved' || invoice?.paymentStatus === 'approved' ||
        invoice?.manualPaymentAttestation?.status === 'owner_confirmed_received';
    return Boolean(
        !isSandbox && invoice?.providerLivemode !== false && invoice?.sandbox !== true && invoice?.isSandbox !== true && invoice?.testMode !== true &&
        /^[A-Za-z0-9_-]{3,160}$/.test(String(invoice?.firestoreId || '')) &&
        invoice?.historyStatus !== 'archived' && !invoice?.archivedAt && !invoice?.deletedAt && invoice?.isDeleted !== true &&
        clearFiscalStates.has(status) && !hasFiscalArtifacts && !hasPaymentProof &&
        Number.isFinite(amount) && amount > 0 && amount <= 1_000_000 &&
        !referenceValues.some(value => /^cs_test_/i.test(value) || /^test[-_]/i.test(value) || /(^|[-_])sandbox([-_]|$)/i.test(value)) &&
        (!invoice?.currency || String(invoice.currency).trim().toLowerCase() === 'usd')
    );
}

function formatMoney(value) {
    return `$${(Number(value) || 0).toFixed(2)}`;
}

function invoiceConfirmationDetails(invoice) {
    const details = invoice?.formData || {};
    const fiscalBuyer = invoice?.sriInvoiceDetails || {};
    const config = window.producerConfig || {};
    const correction = getBuyerCorrection(invoice);
    const line = (label, ...values) => {
        const value = values.find(candidate => {
            const s = String(candidate ?? '').trim();
            return s && !/^no proporcionad[oa]$/i.test(s) && !/^pendiente/i.test(s);
        });
        const normalized = String(value ?? 'NO REGISTRADO').replace(/[\r\n\t]+/g, ' ').trim();
        return `${label}: ${normalized || 'NO REGISTRADO'}`;
    };
    const vatRate = String(config.sriIvaTarifa || (config.sriRimpe === 'rimpe_popular' ? '0' : '15')).toUpperCase();
    const vatRateLabel = vatRate === 'NO_OBJETO' ? 'No objeto de IVA' : vatRate === 'EXENTO' ? 'Exento de IVA' : `${vatRate}%`;
    const ivaIncluded = !['0', 'false', 'no', 'off'].includes(String(config.sriIvaIncluido ?? 'true').trim().toLowerCase());
    return [
        'EMISOR',
        line('Razón social', config.sriRazonSocial),
        line('RUC emisor', config.sriRuc),
        line('Matriz', config.sriDirMatriz),
        '',
        'VENTA SELECCIONADA',
        line('Referencia BEATSS', invoice?.refCode, invoice?.reference, invoiceKey(invoice)),
        line('Fecha', invoice?.date),
        line('Beat / concepto', invoice?.beatName),
        line('Licencia', invoice?.licenseType, invoice?.type),
        line('Pago', invoice?.status),
        line('Importe cobrado', invoice?.value == null ? '' : formatMoney(invoice.value)),
        line('Método de pago', invoice?.paymentMethod),
        '',
        'COMPRADOR',
        line('Modalidad', fiscalBuyer.mode === 'consumer_final' ? 'Consumidor Final' : 'Nominativa'),
        line('Nombre / razón social', fiscalBuyer.buyerName, invoice?.invoiceCompany, details.invoiceCompany, invoice?.buyerName, details.buyerName, correction.buyerName),
        line('RUC / identificación', fiscalBuyer.buyerId, invoice?.invoiceRuc, details.invoiceRuc, invoice?.buyerDni, invoice?.buyerId, details.buyerId, correction.buyerId),
        line('Correo', fiscalBuyer.buyerEmail, invoice?.invoiceEmail, invoice?.buyerEmail, details.invoiceEmail, details.buyerEmail, correction.buyerEmail),
        line('Dirección', fiscalBuyer.buyerAddress, invoice?.invoiceAddress, details.invoiceAddress, invoice?.buyerCity, correction.buyerAddress),
        '',
        'IMPUESTOS CONFIGURADOS EN BEATSS',
        `IVA tarifa: ${vatRateLabel} · ${ivaIncluded ? 'incluido en el importe cobrado' : 'se añadirá al importe cobrado'}`,
        '',
        'ENTREGA AL COMPRADOR',
        'Si el SRI autoriza la factura y hay un correo registrado, BEATSS intentará enviar automáticamente el XML y el RIDE a ese destinatario. Verifica el correo antes de confirmar.',
        '',
        'Confirma que esta tarifa y modalidad corresponden a tu RUC, régimen y operación. Los campos “NO REGISTRADO” deben verificarse antes de emitir.'
    ].join('\n');
}

function collectSriInvoiceDetails(invoice) {
    const previous = invoice?.sriInvoiceDetails || {};
    const details = invoice?.formData || {};
    const correction = getBuyerCorrection(invoice);
    const cleanCandidate = val => {
        const str = String(val || '').trim();
        return (str && !/^no proporcionad[oa](?:,\s*no proporcionad[oa])?$/i.test(str) && !/^pendiente/i.test(str)) ? str : '';
    };
    const existingName = cleanCandidate(previous.buyerName || invoice?.invoiceCompany || details.invoiceCompany || invoice?.buyerName || details.buyerName || correction.buyerName);
    const existingId = cleanCandidate(previous.buyerId || invoice?.invoiceRuc || details.invoiceRuc || invoice?.buyerDni || invoice?.buyerId || details.buyerId || correction.buyerId);
    const existingAddress = cleanCandidate(previous.buyerAddress || invoice?.invoiceAddress || details.invoiceAddress || invoice?.buyerAddress || details.buyerAddress || invoice?.buyerCity || details?.buyerCity || correction.buyerAddress);
    const existingEmail = cleanCandidate(previous.buyerEmail || invoice?.invoiceEmail || details.invoiceEmail || invoice?.buyerEmail || details.buyerEmail || correction.buyerEmail);

    // Si la venta ya tiene los datos fiscales del cliente guardados, se usan directamente para la factura
    if (existingName && existingId) {
        return {
            mode: 'identified',
            buyerName: existingName,
            buyerId: existingId,
            buyerAddress: existingAddress || 'Ecuador',
            buyerEmail: existingEmail
        };
    }

    const promptValue = (label, existing) => window.prompt(label, String(existing || '').slice(0, 254));
    if (Number(invoice?.value) > 0 && Number(invoice.value) <= 50 && window.confirm('¿Esta operación corresponde a Consumidor Final y el comprador no requiere una factura nominativa? Pulsa Aceptar para Consumidor Final (hasta USD 50) o Cancelar para ingresar los datos nominativos.')) {
        const buyerEmail = promptValue('Correo para entregar XML/RIDE (opcional):', existingEmail || invoice?.invoiceEmail || details.invoiceEmail || invoice?.buyerEmail || details.buyerEmail);
        if (buyerEmail === null) return null;
        return { mode: 'consumer_final', consumerFinalConfirmed: true, buyerEmail };
    }
    const buyerName = promptValue('Nombre completo o razón social EXACTA del comprador para la factura:', existingName);
    if (buyerName === null) return null;
    const buyerId = promptValue('Cédula, RUC o pasaporte del comprador (confírmalo con él):', existingId);
    if (buyerId === null) return null;
    const buyerAddress = promptValue('Dirección del comprador para la factura:', existingAddress);
    if (buyerAddress === null) return null;
    const buyerEmail = promptValue('Correo para entregar XML/RIDE (opcional):', existingEmail);
    if (buyerEmail === null) return null;
    return { mode: 'identified', buyerName, buyerId, buyerAddress: buyerAddress || 'Ecuador', buyerEmail };
}

function maskedRuc(ruc) {
    const value = String(ruc || '').trim();
    return value.length >= 4 ? `•••••••••${value.slice(-4)}` : 'No configurado';
}

async function sriHeaders(forceRefresh = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth.currentUser) headers.Authorization = `Bearer ${await auth.currentUser.getIdToken(forceRefresh)}`;
    const localHeaders = window.getLocalHeaders ? await window.getLocalHeaders() : {};
    // El token de Firebase debe prevalecer si el entorno local también añade
    // cabeceras auxiliares; nunca sustituir la sesión del usuario por una
    // cabecera de desarrollo.
    return { ...localHeaders, ...headers };
}

async function openArtifact(invoice, artifact) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const url = `/api/payments/download-${artifact}?paymentId=${encodeURIComponent(paymentId)}`;
    try {
        const response = await fetch(url, { headers: await sriHeaders() });
        if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.error || 'No se pudo descargar el comprobante.');
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `Factura_${paymentId}.${artifact === 'ride' ? 'pdf' : 'xml'}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

function manualInvoiceText(invoice) {
    const previous = invoice?.sriInvoiceDetails || {};
    const details = invoice?.formData || {};
    const issuer = window.producerConfig || {};
    const correction = getBuyerCorrection(invoice);
    const missing = value => {
        const str = String(value || '').trim();
        return (str && !/^no proporcionad[oa]$/i.test(str)) ? str : 'PENDIENTE DE COMPLETAR';
    };

    const buyerName = previous.buyerName || invoice?.invoiceCompany || details.invoiceCompany || invoice?.buyerName || details.buyerName || correction.buyerName;
    const buyerId = previous.buyerId || invoice?.invoiceRuc || details.invoiceRuc || invoice?.buyerDni || invoice?.buyerId || details.buyerId || details.buyerDni || correction.buyerId;
    const buyerEmail = previous.buyerEmail || invoice?.invoiceEmail || details.invoiceEmail || invoice?.buyerEmail || details.buyerEmail || correction.buyerEmail;
    const buyerCityCountry = [invoice?.buyerCity || details?.buyerCity || correction.buyerCity, invoice?.buyerCountry || details?.buyerCountry || correction.buyerCountry]
        .map(v => String(v || '').trim())
        .filter(v => v && !/^no proporcionad[oa]$/i.test(v))
        .join(', ');
    const buyerAddress = previous.buyerAddress || invoice?.invoiceAddress || details.invoiceAddress || invoice?.buyerAddress || details.buyerAddress || buyerCityCountry || correction.buyerAddress;
    const buyerRuc = previous.buyerId || invoice?.invoiceRuc || details.invoiceRuc || invoice?.buyerDni || invoice?.buyerId || details.buyerId || correction.buyerId;
    const buyerCompany = invoice?.invoiceCompany || details.invoiceCompany || buyerName;

    return [
        'BEATSS — DATOS PARA FACTURACIÓN MANUAL SRI',
        'Este archivo prepara información; no es una factura ni acredita emisión ante el SRI.',
        '',
        `Referencia BEATSS: ${missing(invoice?.refCode || invoice?.reference || invoiceKey(invoice))}`,
        `Fecha de venta: ${missing(invoice?.date)}`,
        `Estado fiscal en BEATSS: ${stateLabel(statusOf(invoice))}`,
        `Método de pago: ${missing(invoice?.paymentMethod)}`,
        '',
        'EMISOR',
        `RUC: ${missing(issuer.sriRuc)}`,
        `Razón social: ${missing(issuer.sriRazonSocial)}`,
        `Nombre comercial: ${missing(issuer.sriNombreComercial)}`,
        `Dirección matriz: ${missing(issuer.sriDirMatriz)}`,
        '',
        'CLIENTE',
        `Nombre: ${missing(buyerName)}`,
        `Identificación: ${missing(buyerId)}`,
        `Correo: ${missing(buyerEmail)}`,
        `Dirección: ${missing(buyerAddress)}`,
        `RUC para factura: ${missing(buyerRuc)}`,
        `Razón social: ${missing(buyerCompany)}`,
        '',
        'OPERACIÓN',
        `Concepto sugerido: Licencia ${missing(invoice?.licenseType || invoice?.type)} del beat ${missing(invoice?.beatName)}`,
        `Total cobrado: ${formatMoney(invoice?.value)}`,
        '',
        'PASOS',
        '1. Verifica el pago, la identidad y los datos fiscales con el cliente.',
        '2. Abre el Facturador SRI oficial y crea el comprobante con la fecha y tarifa aplicables.',
        '3. Revisa el borrador antes de firmar y enviar; BEATSS no transmite este archivo al SRI.',
        '4. Conserva el XML autorizado y el RIDE entregados por el SRI.',
        '',
        `Preparado por BEATSS: ${new Date().toISOString()}`
    ].join('\n');
}

function downloadManualInvoiceData(invoice) {
    const reference = String(invoice?.refCode || invoice?.reference || invoiceKey(invoice) || 'sin-referencia')
        .replace(/[^a-z0-9_-]+/gi, '-')
        .slice(0, 80);
    const blobUrl = URL.createObjectURL(new Blob([manualInvoiceText(invoice)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `Datos_factura_manual_${reference}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    window.showToast?.('Datos preparados para revisar. Este archivo no es factura ni transmite nada al SRI.');
}

function fileToBase64(file) {
    return file.arrayBuffer().then(buffer => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunkSize = 0x8000;
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
        }
        return btoa(binary);
    });
}

function chooseSriArtifacts(invoice) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = '.xml,.pdf,application/xml,text/xml,application/pdf';
    input.setAttribute('aria-label', 'Selecciona el XML autorizado y el RIDE PDF del SRI');
    input.addEventListener('change', async () => {
        const files = [...(input.files || [])];
        const xml = files.find(file => file.name.toLowerCase().endsWith('.xml'));
        const ride = files.find(file => file.name.toLowerCase().endsWith('.pdf'));
        if (files.length !== 2 || !xml || !ride) {
            window.showToast?.('Selecciona exactamente dos archivos: XML autorizado y RIDE PDF.', true);
            return;
        }
        if (xml.size + ride.size > 2_000_000) {
            window.showToast?.('Los archivos superan el máximo combinado de 2 MB.', true);
            return;
        }
        if (!window.confirm(`Asociar a esta venta los archivos que ya descargaste del SRI?\n\n${invoice.beatName || 'Venta'} · ${invoice.buyerName || 'Comprador'} · ${formatMoney(invoice.value)}\n\nEsto no emite una factura. BeatSS los marcará como archivos manuales pendientes de tu verificación.`)) return;
        try {
            const [xmlBase64, rideBase64] = await Promise.all([fileToBase64(xml), fileToBase64(ride)]);
            const response = await fetch('/api/payments/config?route=manual-sri-import', {
                method: 'POST',
                headers: await sriHeaders(),
                body: JSON.stringify({ paymentId, xmlBase64, rideBase64, confirmManualAssociation: true })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(payload.error || 'No se pudieron asociar los archivos.');
            Object.assign(invoice, {
                sriEstado: 'ARCHIVOS_MANUALES_REGISTRADOS',
                sriManualArtifactsStatus: 'PENDING_OWNER_VERIFICATION',
                sriClaveAcceso: payload.accessKey
            });
            window.showToast?.('XML y RIDE asociados. Verifica clave, comprador y total en el portal SRI.');
            renderSriInvoicingView();
        } catch (error) {
            window.showToast?.(`❌ ${error.message}`, true);
        }
    }, { once: true });
    input.click();
}

async function confirmManualSriReview(invoice, button) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId || invoice.sriEstado !== 'ARCHIVOS_MANUALES_REGISTRADOS' || invoice.sriManualArtifactsStatus !== 'PENDING_OWNER_VERIFICATION') return;
    const confirmed = window.confirm(`Confirma sólo si abriste el portal oficial del SRI y comparaste la autorización, clave de acceso, RUC emisor, identificación del comprador, total y RIDE con esta operación.\n\n${invoice.beatName || 'Venta'} · ${invoice.buyerName || 'Comprador'} · ${formatMoney(invoice.value)}\n\nBEATSS registrará tu revisión humana, pero no validará criptográficamente la firma ni marcará la factura como AUTORIZADO.`);
    if (!confirmed) return;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Verificando archivos…';
    try {
        const response = await fetch('/api/payments/config?route=manual-sri-verify', {
            method: 'POST',
            headers: await sriHeaders(),
            body: JSON.stringify({ paymentId, confirmManualVerification: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo registrar la revisión.');
        Object.assign(invoice, {
            sriEstado: 'ARCHIVOS_MANUALES_VERIFICADOS',
            sriManualArtifactsStatus: 'OWNER_VERIFIED',
            sriManualArtifactsVerifiedAt: payload.verifiedAt
        });
        window.showToast?.('Revisión humana guardada. El comprobante sigue distinguido de una autorización validada por BEATSS.');
        renderSriInvoicingView();
    } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

const MANUAL_PAYMENT_METHODS = new Map([
    ['1', 'transferencia'], ['transferencia', 'transferencia'], ['transferencia bancaria', 'transferencia'],
    ['2', 'efectivo'], ['efectivo', 'efectivo'],
    ['3', 'stripe'], ['stripe', 'stripe'],
    ['4', 'paypal'], ['paypal', 'paypal'], ['pay pal', 'paypal'],
    ['5', 'deuna'], ['deuna', 'deuna'], ['de una', 'deuna'],
    ['6', 'payphone'], ['payphone', 'payphone'], ['pay phone', 'payphone'],
    ['7', 'beatstars'], ['beatstars', 'beatstars'],
    ['8', 'otro'], ['otro', 'otro']
]);

async function registerManualPayment(invoice, button) {
    const paymentId = String(invoice?.firestoreId || '').trim();
    if (!paymentId || !canRegisterManualPayment(invoice, isSandboxInvoice(invoice))) {
        window.showToast?.('Esta operación no es elegible para registrar un cobro manual. Actualiza el historial y concíliala si ya tiene pago o trámite fiscal.', true);
        return;
    }
    const methodInput = window.prompt(
        '¿Por qué medio recibiste realmente este pago?\n1. Transferencia bancaria\n2. Efectivo\n3. Stripe\n4. PayPal\n5. Deuna\n6. PayPhone\n7. BeatStars\n8. Otro',
        '1'
    );
    if (methodInput === null) return;
    const paymentMethod = MANUAL_PAYMENT_METHODS.get(String(methodInput).trim().toLowerCase());
    if (!paymentMethod) {
        window.showToast?.('Elige uno de los métodos indicados (1–8) o escribe su nombre.', true);
        return;
    }
    const confirmation = [
        'REGISTRAR COBRO RECIBIDO — NO EMITE UNA FACTURA',
        '',
        `Beat/concepto: ${invoice.beatName || invoice.beat || 'Beat'}`,
        `Comprador: ${invoice.buyerName || invoice.clientName || 'No registrado'}`,
        `Referencia: ${invoice.refCode || invoice.reference || paymentId}`,
        `Fecha guardada en la licencia: ${invoice.date || 'No registrada'}`,
        `Importe guardado: ${formatMoney(invoice.value ?? invoice.finalPrice ?? invoice.price)}`,
        `Método indicado: ${paymentMethod}`,
        '',
        'Continúa únicamente si recibiste realmente ese dinero y el importe/fecha reflejan esa operación. Esto crea un registro auditable basado en tu confirmación; no valida un comprobante bancario, no contacta al SRI y no genera ni envía una factura. La emisión será un paso aparte.'
    ].join('\n');
    if (!window.confirm(confirmation)) return;

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'Registrando cobro…';
    try {
        const response = await fetch('/api/payments/config?route=manual-payment-attestation', {
            method: 'POST',
            headers: await sriHeaders(true),
            body: JSON.stringify({ paymentId, paymentMethod, confirmManualPayment: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo registrar el cobro recibido.');
        Object.assign(invoice, {
            status: 'approved',
            paymentStatus: 'approved',
            paymentMethod: payload.paymentMethod || paymentMethod,
            manualPaymentAttestation: {
                source: 'owner_manual_attestation',
                status: 'owner_confirmed_received',
                received: true,
                amount: payload.amount,
                method: payload.paymentMethod || paymentMethod,
                confirmedBy: window.currentUser,
                confirmedAt: new Date().toISOString()
            }
        });
        renderSriInvoicingView();
        window.showToast?.(payload.message || 'Cobro registrado. Revisa los datos de la venta; la factura aún no se ha emitido.');
    } catch (error) {
        button.disabled = false;
        button.textContent = originalText;
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

async function unblockSelectedSriInvoice(invoice, button) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const confirmed = window.confirm(
        `DESBLOQUEAR VENTA PARA EMISIÓN FISCAL\n\nBeat: ${invoice.beatName || 'Beat'}\nComprador: ${invoice.buyerName || 'Cliente'}\nReferencia: ${invoice.refCode || invoice.reference || paymentId}\n\nConfirma sólo si revisaste en el portal del SRI y comprobaste que NO existe ninguna factura previa emitida para esta venta.\n\nBeatSS verificará que no exista una clave reservada en el sistema y restablecerá el estado para que puedas emitir la factura. ¿Confirmas desbloquear?`
    );
    if (!confirmed) return;
    const originalText = button?.textContent || 'Desbloquear';
    if (button) {
        button.disabled = true;
        button.textContent = 'Desbloqueando…';
    }
    try {
        const authHeaders = await sriHeaders(true);
        const response = await fetch('/api/payments/retry-sri', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ paymentId, action: 'unblock', confirmManualIssue: true })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo desbloquear la venta.');
        invoice.sriEstado = '';
        invoice.sriClaveAcceso = '';
        invoice.sriErrorMensaje = '';
        renderSriInvoicingView();
        window.showToast?.('✅ Venta desbloqueada. Ya puedes hacer clic en "Emitir esta venta en SRI".');
    } catch (error) {
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

async function requestSelectedSriInvoice(invoice, button) {
    const paymentId = invoiceKey(invoice);
    if (!paymentId) return;
    const currentStatus = statusOf(invoice);
    if (isSandboxInvoice(invoice)) {
        window.showToast?.('Una compra de prueba no puede generar una factura fiscal.', true);
        return;
    }
    const isReconciliation = PENDING_STATES.has(currentStatus) && Boolean(invoice?.sriClaveAcceso);
    const fiscalAction = isReconciliation ? 'reconcile' : 'issue';
    const invoiceDetails = isReconciliation ? null : invoice.sriInvoiceDetails || collectSriInvoiceDetails(invoice);
    if (!isReconciliation && !invoiceDetails) return;
    const reviewDetails = isReconciliation
        ? [
            `Referencia BEATSS: ${invoice?.refCode || invoice?.reference || paymentId}`,
            `Beat / concepto: ${invoice?.beatName || invoice?.description || 'No registrado'}`,
            `Importe: ${invoice?.value == null ? 'No registrado' : formatMoney(invoice.value)}`,
            'Acción: consultar la clave fiscal existente; no se enviará otra factura.'
        ].join('\n')
        : invoiceConfirmationDetails({ ...invoice, sriInvoiceDetails: invoiceDetails });
    const confirmationMessage = isReconciliation
        ? `BeatSS consultará la autorización usando la misma clave fiscal; no volverá a enviar otra factura.\n\n${reviewDetails}\n\n¿Confirmas consultar el estado en el SRI?`
        : `BEATSS preparará, firmará y enviará al SRI únicamente esta venta en PRODUCCIÓN. Revisa la ficha antes de continuar.\n\n${reviewDetails}\n\nUna factura autorizada no se debe duplicar ni se puede deshacer desde BeatSS. ¿Confirmas la emisión de esta venta?`;
    const confirmed = window.confirm(confirmationMessage);
    if (!confirmed) {
        if (!isReconciliation) invoice.sriInvoiceDetails = null;
        return;
    }
    const originalText = button.textContent;
    let queueAccepted = false;
    button.disabled = true;
    button.textContent = 'Enviando solicitud…';
    try {
        // Renueva la sesión antes del primer efecto durable. Si la renovación
        // falla, no deja una solicitud en cola que el ejecutor puntual no
        // pueda autenticar inmediatamente después.
        const authHeaders = await sriHeaders(true);
        const response = await fetch('/api/payments/retry-sri', {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({ paymentId, producerId: window.currentUser, action: fiscalAction, confirmManualIssue: true, invoiceDetails })
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            if (response.status === 409 && payload.error?.includes('No hay un trabajo y una clave fiscal previa')) {
                const wantUnblock = window.confirm(
                    `${payload.error}\n\n¿Confirmaste en el SRI que no existe factura y deseas desbloquear esta venta ahora para emitirla desde BeatSS?`
                );
                if (wantUnblock) {
                    await unblockSelectedSriInvoice(invoice, button);
                    return;
                }
            }
            throw new Error(payload.error || 'No se pudo solicitar la emisión SRI.');
        }
        // El primer endpoint deja un trabajo durable en Firestore. Si la
        // invocación puntual falla después, no ocultes la cola ni invites a
        // comenzar una factura nueva: la misma fila podrá continuarla.
        queueAccepted = true;
        if (!isReconciliation) {
            invoice.sriInvoiceDetails = invoiceDetails;
            invoice.sriEstado = 'EN_COLA_EMISION';
            invoice.sriErrorMensaje = '';
        }
        button.textContent = isReconciliation ? 'Consultando estado…' : 'Enviando al SRI…';
        const issueResponse = await fetch('/api/sri-issue', {
            method: 'POST',
            // El ejecutor Python valida la misma sesión renovada de forma
            // independiente; no hay otra operación asíncrona entre ambos POST.
            headers: authHeaders,
            body: JSON.stringify({ paymentId, action: fiscalAction, confirmManualIssue: true, expectedEnvironment: '2' })
        });
        const issuePayload = await issueResponse.json().catch(() => ({}));
        if (!issueResponse.ok && issueResponse.status !== 202) {
            throw new Error(issuePayload.error || 'La solicitud quedó guardada. Continúa o actualiza esta misma venta; no crees otra factura.');
        }
        invoice.sriEstado = issuePayload.fiscalState || (isReconciliation ? currentStatus : 'EN_COLA_EMISION');
        invoice.sriErrorMensaje = '';
        renderSriInvoicingView();
        window.showToast?.(issuePayload.message || payload.message || 'Solicitud procesada; confirma la autorización y descarga XML/RIDE desde esta venta.');
    } catch (error) {
        if (queueAccepted) {
            if (!isReconciliation) {
                invoice.sriEstado = 'EN_COLA_EMISION';
                invoice.sriErrorMensaje = 'Solicitud registrada; actualiza o continúa esta misma venta antes de cualquier nuevo intento.';
            }
            renderSriInvoicingView();
            window.showToast?.(isReconciliation
                ? `No se inició otra emisión. La consulta de esta misma solicitud requiere revisión; actualiza su estado antes de volver a intentarla. ${error.message}`
                : `La solicitud quedó guardada para esta venta. No se inició otra factura. ${error.message}`, true);
            return;
        }
        button.disabled = false;
        button.textContent = originalText;
        window.showToast?.(`❌ ${error.message}`, true);
    }
}

function bindInvoicingActions() {
    const root = document.getElementById('tab-invoicing');
    if (!root || root.dataset.bound === 'true') return;
    root.dataset.bound = 'true';
    const refreshBtn = root.querySelector('#sri-invoicing-refresh');
    refreshBtn?.addEventListener('click', async () => {
        if (refreshBtn.disabled) return;
        refreshBtn.disabled = true;
        refreshBtn.classList.add('loading');
        try {
            await window.loadHistory?.();
        } catch (error) {
            console.warn('[BEATSS] Error al recargar historial en facturación:', error?.message || error);
        } finally {
            renderSriInvoicingView();
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('loading');
        }
    });
    root.querySelector('#sri-invoicing-settings')?.addEventListener('click', () => {
        window.openSettingsModal?.();
        requestAnimationFrame(() => window.activateSettingsSection?.('tax'));
    });
    root.querySelector('#sri-open-official')?.addEventListener('click', () => {
        window.open(OFFICIAL_SRI_INVOICER_URL, '_blank', 'noopener,noreferrer');
    });
    root.querySelector('#sri-invoicing-search')?.addEventListener('input', renderSriInvoicingView);
    root.querySelector('#sri-invoicing-filter')?.addEventListener('change', renderSriInvoicingView);
    window.addEventListener('beatss:history-updated', () => {
        const invoicingRoot = document.getElementById('tab-invoicing');
        if (invoicingRoot && !invoicingRoot.hidden) {
            renderSriInvoicingView();
        }
    });
}

function directIssuanceAction(invoice, { environment, config, isSandbox }) {
    if (isSandbox) return '<span class="sri-facturador-tracking">Prueba · no emitir</span>';
    if (invoice?.status !== 'approved') {
        if (canRegisterManualPayment(invoice, isSandbox)) {
            return '<button type="button" data-sri-action="attest-payment">Registrar cobro recibido</button><small class="sri-facturador-tracking-note">Sólo para un pago que realmente recibiste. Esto no emite una factura.</small>';
        }
        return '<span class="sri-facturador-tracking">Emisión desde BEATSS requiere un pago aprobado</span>';
    }
    if (environment !== 'Producción') {
        return '<span class="sri-facturador-tracking">Cambia el ambiente SRI a Producción para emitir</span>';
    }
    if (config.sriSignatureConfigured !== true) {
        return '<span class="sri-facturador-tracking">Configura la firma electrónica en Datos fiscales</span>';
    }
    if (!String(config.sriDirMatriz || '').trim()) {
        return '<span class="sri-facturador-tracking">Completa la dirección matriz según tu RUC vigente en Datos fiscales antes de emitir</span>';
    }
    return '<button type="button" data-sri-action="issue">Emitir esta venta en SRI</button>';
}

export function renderSriInvoicingView() {
    const root = document.getElementById('tab-invoicing');
    if (!root) return;
    const history = currentHistory();
    const config = window.producerConfig || {};
    const ruc = String(config.sriRuc || '').trim();
    const environment = String(config.sriAmbiente || '1') === '2' ? 'Producción' : 'Pruebas';
    const fiscalHistory = history.filter(item => !isSandboxInvoice(item));
    const authorized = fiscalHistory.filter(item => statusOf(item) === 'AUTORIZADO').length;
    const pending = fiscalHistory.filter(item => PENDING_STATES.has(statusOf(item)) || statusOf(item) === 'ARCHIVOS_MANUALES_REGISTRADOS').length;
    const failed = fiscalHistory.filter(item => stateClass(statusOf(item)) === 'failed').length;
    const total = fiscalHistory.length;

    const statusText = 'Modo manual';
    const statusPill = 'ready';
    const environmentPill = environment === 'Producción' ? 'production' : 'test';
    const query = String(root.querySelector('#sri-invoicing-search')?.value || '').trim().toLowerCase();
    const selected = String(root.querySelector('#sri-invoicing-filter')?.value || 'all');
    const rows = history.filter(item => {
        const sandbox = isSandboxInvoice(item);
        if ((selected === 'sandbox') !== sandbox) return false;
        const status = statusOf(item);
        const haystack = [item?.refCode, item?.reference, item?.beatName, item?.buyerName, item?.sriClaveAcceso]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
        const matchesQuery = !query || haystack.includes(query);
        const matchesStatus = selected === 'all' || selected === 'sandbox' || (selected === 'authorized' && status === 'AUTORIZADO') || (selected === 'pending' && (PENDING_STATES.has(status) || status === 'ARCHIVOS_MANUALES_REGISTRADOS')) || (selected === 'failed' && stateClass(status) === 'failed') || (selected === 'none' && stateClass(status) === 'none');
        return matchesQuery && matchesStatus;
    });

    const statusEl = root.querySelector('#sri-invoicing-status');
    if (statusEl) statusEl.innerHTML = `<div class="sri-facturador-status-copy"><strong>Tú eliges cada factura</strong><span>Selecciona una venta y solicita desde BeatSS que genere, firme y envíe sólo esa factura al SRI. Nada se emite automáticamente al cobrar. Si prefieres emitir fuera de BeatSS, puedes descargar la ficha y luego asociar el XML + RIDE oficiales.</span></div><span class="sri-facturador-pill ${statusPill}">${statusText}</span><span class="sri-facturador-pill ${environmentPill}">${environment}</span><span class="sri-facturador-ruc">RUC ${maskedRuc(ruc)}</span>`;
    const metricValues = { total, authorized, pending, failed };
    Object.entries(metricValues).forEach(([key, value]) => {
        const element = root.querySelector(`[data-sri-metric="${key}"]`);
        if (element) element.textContent = value;
    });

    const body = root.querySelector('#sri-invoicing-table-body');
    if (!body) return;
    if (!rows.length) {
        const hasSandbox = history.some(isSandboxInvoice);
        body.innerHTML = `<tr><td colspan="5"><div class="sri-facturador-empty"><strong>${selected === 'sandbox' ? 'No hay compras de prueba' : fiscalHistory.length ? 'No hay facturas que coincidan' : hasSandbox ? 'Aún no hay operaciones fiscales para facturar' : 'Aún no hay operaciones para facturar'}</strong><span>${selected === 'sandbox' ? 'Las compras Sandbox aparecerán aquí cuando existan.' : fiscalHistory.length || hasSandbox ? 'Cambia el filtro o la búsqueda. Las compras de prueba están separadas y no cuentan como operaciones fiscales.' : 'Las facturas se crean después de que una compra queda confirmada.'}</span></div></td></tr>`;
        return;
    }
    body.innerHTML = rows.map(item => {
        const status = statusOf(item);
        const key = invoiceKey(item);
        const error = item.sriErrorMensaje && status !== 'AUTORIZADO'
            ? `<small>${safeText(String(item.sriErrorMensaje).slice(0, 90))}</small>`
            : '';
        const isSandbox = isSandboxInvoice(item);
        const manuallyImported = status === 'ARCHIVOS_MANUALES_REGISTRADOS' && item.sriManualArtifactsStatus === 'PENDING_OWNER_VERIFICATION';
        const manuallyVerified = status === 'ARCHIVOS_MANUALES_VERIFICADOS' && item.sriManualArtifactsStatus === 'OWNER_VERIFIED';
        const downloads = `<button type="button" data-sri-action="ride">RIDE PDF</button><button type="button" data-sri-action="xml">XML</button>`;
        const requiresReconciliation = status === 'ERROR_REQUIERE_REVISION' || status.startsWith('ERROR_') || status.startsWith('RECHAZADO_');
        const actions = isSandbox
            ? '<span class="sri-facturador-tracking">Prueba · no fiscal · sin acciones SRI</span>'
            : status === 'AUTORIZADO' || manuallyVerified
            ? downloads
            : manuallyImported
                ? `${downloads}<button type="button" data-sri-action="verify">Confirmé revisión en SRI</button>`
            : status === 'AUTORIZADO_ENTREGA_PENDIENTE'
                ? `<span class="sri-facturador-tracking">No reemitir · recuperar archivos</span>`
                : requiresReconciliation
                    ? `<span class="sri-facturador-tracking">Conciliar en el SRI antes de cualquier reintento</span>${!item.sriClaveAcceso ? '<button type="button" data-sri-action="unblock">Desbloquear para emitir</button>' : ''}`
            : stateClass(status) === 'pending'
                ? `<span class="sri-facturador-tracking">Consulta únicamente una clave fiscal ya reservada; no se genera otra factura.</span><button type="button" data-sri-action="issue">Consultar / conciliar en SRI</button>${!item.sriClaveAcceso ? '<button type="button" data-sri-action="unblock">Desbloquear para emitir</button>' : ''}`
                : `<button type="button" data-sri-action="prepare">Ver datos de factura</button><button type="button" data-sri-action="import">Asociar XML + RIDE</button>${directIssuanceAction(item, { environment, config, isSandbox })}`;
        const manualNote = item.manualPaymentAttestation?.source === 'owner_manual_attestation'
            ? `<small>Cobro ${safeText(item.manualPaymentAttestation.method || item.paymentMethod || 'manual')} confirmado por el productor; registro auditable, todavía no es factura.</small>`
            : manuallyImported
            ? '<small>Archivos adjuntos; revisa en SRI la clave, comprador, total y RIDE.</small>'
            : manuallyVerified
                ? `<small>Revisión humana confirmada${item.sriManualArtifactsVerifiedAt ? ` · ${safeText(String(item.sriManualArtifactsVerifiedAt).slice(0, 10))}` : ''}; no es validación criptográfica de BEATSS.</small>`
                : status === 'EN_COLA_EMISION' ? '<small>Solicitud recibida; confirma el estado fiscal antes de cualquier nuevo intento.</small>' : '';
        const rowStatus = isSandbox ? 'Prueba · no fiscal' : stateLabel(status);
        const rowClass = isSandbox ? 'none' : stateClass(status);
        return `<tr data-sri-key="${safeText(key)}"><td><span class="sri-facturador-ref">${safeText(item.refCode || item.reference || key || 'Sin referencia')}</span>${!isSandbox && item.sriClaveAcceso ? `<small>Clave ${safeText(item.sriClaveAcceso)}</small>` : ''}</td><td>${safeText(item.date || '—')}</td><td><strong>${safeText(item.beatName || 'Beat')}</strong><small>${safeText(item.buyerName || 'Consumidor final')}</small></td><td>${formatMoney(item.value)}</td><td><span class="sri-facturador-state ${rowClass}">${safeText(rowStatus)}</span>${isSandbox ? '' : manualNote}${isSandbox ? '' : error}<div class="sri-facturador-row-actions">${actions}</div></td></tr>`;
    }).join('');

    body.querySelectorAll('tr[data-sri-key]').forEach(row => {
        const item = history.find(invoice => invoiceKey(invoice) === row.dataset.sriKey);
        if (!item) return;
        row.querySelector('[data-sri-action="ride"]')?.addEventListener('click', () => openArtifact(item, 'ride'));
        row.querySelector('[data-sri-action="xml"]')?.addEventListener('click', () => openArtifact(item, 'xml'));
        row.querySelector('[data-sri-action="prepare"]')?.addEventListener('click', () => downloadManualInvoiceData(item));
        row.querySelector('[data-sri-action="import"]')?.addEventListener('click', () => chooseSriArtifacts(item));
        const verifyButton = row.querySelector('[data-sri-action="verify"]');
        verifyButton?.addEventListener('click', () => confirmManualSriReview(item, verifyButton));
        const issueButton = row.querySelector('[data-sri-action="issue"]');
        issueButton?.addEventListener('click', () => requestSelectedSriInvoice(item, issueButton));
        const attestButton = row.querySelector('[data-sri-action="attest-payment"]');
        attestButton?.addEventListener('click', () => registerManualPayment(item, attestButton));
        const unblockButton = row.querySelector('[data-sri-action="unblock"]');
        unblockButton?.addEventListener('click', () => unblockSelectedSriInvoice(item, unblockButton));
    });
    window.safeCreateIcons?.(root);
}

export async function initSriInvoicingView() {
    bindInvoicingActions();
    renderSriInvoicingView();
    try {
        await window.loadHistory?.();
    } catch (error) {
        console.warn('[BEATSS] No se pudo cargar el historial en facturación:', error?.message || error);
    } finally {
        renderSriInvoicingView();
    }
}

window.initSriInvoicingView = initSriInvoicingView;
window.renderSriInvoicingView = renderSriInvoicingView;
