import { createHash, randomUUID } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { findInvoice, initFirebaseAdmin, requireSession } from './sri-download.js';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

const MAX_TOTAL_BYTES = 2_000_000;
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 6;
const importRateWindows = new Map();

function limited(ip, now = Date.now()) {
    const current = importRateWindows.get(ip);
    if (!current || now - current.start >= RATE_WINDOW_MS || now < current.start) {
        importRateWindows.set(ip, { start: now, count: 1 });
        return false;
    }
    current.count += 1;
    return current.count > RATE_LIMIT;
}

export function decodeSriBase64(value, label) {
    if (typeof value !== 'string' || !value || value.length > Math.ceil(MAX_TOTAL_BYTES * 4 / 3) + 8 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
        throw Object.assign(new Error(`El archivo ${label} no tiene un formato válido.`), { status: 400 });
    }
    return Buffer.from(value, 'base64');
}

function localTag(xml, name) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(xml || '').match(new RegExp(`<(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[A-Za-z_][\\w.-]*):)?${escaped}\\s*>`, 'i'));
    return match ? match[1].trim() : '';
}

function decodeXmlText(value) {
    return String(value || '')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}

function authorizedInvoiceDetails(xmlText) {
    const status = localTag(xmlText, 'estado');
    if (status !== 'AUTORIZADO') {
        throw Object.assign(new Error('El XML no indica estado AUTORIZADO. Descarga el XML autorizado desde el SRI.'), { status: 400 });
    }
    const authorizationNumber = localTag(xmlText, 'numeroAutorizacion').replace(/\s+/g, '');
    const accessKey = localTag(xmlText, 'claveAcceso').replace(/\s+/g, '') || authorizationNumber;
    if (!/^\d{49}$/.test(authorizationNumber) || !/^\d{49}$/.test(accessKey) || accessKey !== authorizationNumber) {
        throw Object.assign(new Error('La clave de acceso de la factura no coincide con la autorización del SRI.'), { status: 400 });
    }

    let comprobante = localTag(xmlText, 'comprobante');
    const cdata = comprobante.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/i);
    comprobante = cdata ? cdata[1] : decodeXmlText(comprobante);
    comprobante = comprobante.replace(/^\s*<\?xml[^?]*\?>/i, '').trim();
    const invoiceMatch = comprobante.match(/<(?:[A-Za-z_][\w.-]*:)?factura\b[^>]*>[\s\S]*?<\/(?:[A-Za-z_][\w.-]*:)?factura\s*>/i);
    if (!invoiceMatch) {
        throw Object.assign(new Error('No se encontró la factura original dentro de la autorización del SRI.'), { status: 400 });
    }
    const factura = invoiceMatch[0];
    const details = {
        accessKey,
        documentType: localTag(factura, 'codDoc'),
        issuerRuc: localTag(localTag(factura, 'infoTributaria'), 'ruc').replace(/\D/g, ''),
        buyerId: localTag(localTag(factura, 'infoFactura'), 'identificacionComprador').replace(/\D/g, ''),
        total: localTag(localTag(factura, 'infoFactura'), 'importeTotal')
    };
    if (details.documentType !== '01' || !/^\d{13}$/.test(details.issuerRuc) || !details.buyerId || !details.total) {
        throw Object.assign(new Error('La factura autorizada no contiene tipo, emisor, identificación del comprador e importe total verificables.'), { status: 400 });
    }
    const total = Number(details.total);
    if (!Number.isFinite(total) || total <= 0) {
        throw Object.assign(new Error('El importe total del XML no es válido.'), { status: 400 });
    }
    return { ...details, total };
}

function saleBuyerId(sale) {
    const formData = sale?.formData && typeof sale.formData === 'object' ? sale.formData : {};
    return String(sale?.buyerId || sale?.buyerDni || sale?.buyerIdentification || formData.buyerId || '').replace(/\D/g, '');
}

function saleTotal(sale) {
    const value = sale?.finalPrice ?? sale?.value ?? sale?.price;
    const total = Number(value);
    return Number.isFinite(total) && total > 0 ? total : null;
}

export function validateManualSriArtifacts(xml, ride, issuerRuc, sale = null) {
    if (!xml.length || !ride.length || xml.length + ride.length > MAX_TOTAL_BYTES) {
        throw Object.assign(new Error('Los archivos superan el tamaño máximo combinado de 2 MB.'), { status: 413 });
    }
    if (ride.subarray(0, 5).toString('ascii') !== '%PDF-') {
        throw Object.assign(new Error('El archivo RIDE debe ser un PDF válido.'), { status: 400 });
    }
    let xmlText;
    try {
        xmlText = new TextDecoder('utf-8', { fatal: true }).decode(xml);
    } catch {
        throw Object.assign(new Error('El XML debe estar codificado como UTF-8.'), { status: 400 });
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(xmlText) || !/<\s*\??(?:autorizacion|factura)\b/i.test(xmlText)) {
        throw Object.assign(new Error('El XML no parece un comprobante SRI válido.'), { status: 400 });
    }
    if (!/<\s*(?:[A-Za-z_][\w.-]*:)?autorizacion\b/i.test(xmlText)) {
        throw Object.assign(new Error('El XML no parece una respuesta de autorización del SRI.'), { status: 400 });
    }
    const details = authorizedInvoiceDetails(xmlText);
    const normalizedIssuerRuc = String(issuerRuc || '').replace(/\D/g, '');
    if (!/^\d{13}$/.test(normalizedIssuerRuc)) {
        throw Object.assign(new Error('Configura un RUC emisor válido antes de asociar comprobantes SRI.'), { status: 409 });
    }
    if (details.issuerRuc !== normalizedIssuerRuc) {
        throw Object.assign(new Error('El RUC emisor del XML no coincide con el RUC configurado en BEATSS.'), { status: 409 });
    }
    if (!sale || typeof sale !== 'object') {
        throw Object.assign(new Error('No se pudo cotejar el XML con la venta seleccionada.'), { status: 409 });
    }
    const expectedBuyerId = saleBuyerId(sale);
    if (expectedBuyerId && details.buyerId !== expectedBuyerId) {
        throw Object.assign(new Error('La identificación del comprador del XML no coincide con la venta seleccionada.'), { status: 409 });
    }
    const expectedTotal = saleTotal(sale);
    if (expectedTotal === null || Math.round(expectedTotal * 100) !== Math.round(details.total * 100)) {
        throw Object.assign(new Error('El total de la factura XML no coincide con el importe registrado para esta venta.'), { status: 409 });
    }
    return { xmlText, accessKey: details.accessKey, invoice: details };
}

function hash(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}

export default async function registerManualSriArtifacts(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (origin && isTrustedBeatssOrigin(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (origin && !isTrustedBeatssOrigin(origin)) return res.status(403).json({ error: 'Origen no permitido.' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido.' });

    const ipHeader = req.headers?.['x-vercel-forwarded-for'] || req.headers?.['x-forwarded-for'] || 'unknown';
    const ip = String(Array.isArray(ipHeader) ? ipHeader[0] : ipHeader).split(',')[0].trim().slice(0, 128) || 'unknown';
    if (limited(ip)) return res.status(429).json({ error: 'Demasiadas cargas de comprobantes. Espera unos minutos.' });

    try {
        const decoded = await requireSession(req);
        const paymentId = String(req.body?.paymentId || '').trim();
        if (req.body?.confirmManualAssociation !== true) return res.status(400).json({ error: 'Confirma que vas a asociar los archivos SRI a esta venta.' });
        if (!/^[A-Za-z0-9_-]{3,160}$/.test(paymentId)) return res.status(400).json({ error: 'ID de venta inválido.' });
        initFirebaseAdmin();
        const db = getFirestore();
        const invoice = await findInvoice(db, paymentId, decoded);
        const paymentRecord = invoice.ref.parent.id === 'payments';
        const ownerLicenseRecord = invoice.ref.parent.id === 'licencias' && invoice.ref.parent.parent?.id === invoice.ownerUid;
        if (!(paymentRecord && invoice.data.status === 'approved') && !(ownerLicenseRecord && invoice.data.historyStatus !== 'archived' && !invoice.data.archivedAt)) {
            return res.status(409).json({ error: 'Sólo se pueden asociar comprobantes a una venta aprobada o a una licencia activa de tu historial.' });
        }
        const data = invoice.data;
        const reference = String(data.reference || data.refCode || paymentId);
        if (data.providerLivemode === false || /^cs_test_/i.test(reference)) {
            return res.status(409).json({ error: 'No se admiten compras de prueba en el registro fiscal.' });
        }
        if (['AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE'].includes(String(data.sriEstado || '').toUpperCase())) {
            return res.status(409).json({ error: 'Esta venta ya tiene una factura SRI autorizada registrada.' });
        }
        const fiscalState = String(data.sriEstado || '').toUpperCase();
        if (['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA', 'PENDING_AUTORIZACION', 'ERROR_REQUIERE_REVISION'].includes(fiscalState) || fiscalState.startsWith('ERROR_') || fiscalState.startsWith('RECHAZADO_')) {
            return res.status(409).json({ error: 'El estado fiscal requiere conciliación antes de asociar una factura manual, para evitar duplicados.' });
        }
        const sriJobSnap = await db.collection('sriJobs').doc(invoice.id).get();
        if (sriJobSnap.exists && ['PENDING', 'PROCESSING', 'CONTINGENCY'].includes(String(sriJobSnap.data()?.status || '').toUpperCase())) {
            return res.status(409).json({ error: 'Esta venta ya tiene una solicitud SRI activa. Espera o concilia ese trabajo antes de importar otra factura.' });
        }
        if (['PENDING_OWNER_VERIFICATION', 'OWNER_VERIFIED'].includes(String(data.sriManualArtifactsStatus || ''))) {
            return res.status(409).json({ error: 'Ya hay archivos manuales asociados a esta venta. Descárgalos o revisa la operación antes de reemplazarlos.' });
        }
        const xml = decodeSriBase64(req.body?.xmlBase64, 'XML');
        const ride = decodeSriBase64(req.body?.rideBase64, 'RIDE');
        const privateSri = await db.collection('users').doc(invoice.ownerUid).collection('private_config').doc('sri').get();
        const issuerRuc = String(privateSri.data()?.sriRuc || '').replace(/\D/g, '');
        const { accessKey } = validateManualSriArtifacts(xml, ride, issuerRuc, data);

        const producerId = String(data.producerId || invoice.ownerUid || '').replace(/[^A-Za-z0-9_-]/g, '');
        if (!producerId || producerId !== invoice.ownerUid) return res.status(409).json({ error: 'No se pudo validar el productor de esta venta.' });
        const safePaymentId = invoice.id.replace(/[^A-Za-z0-9_-]/g, '');
        const prefix = `sri/${producerId}/${safePaymentId}/manual-${randomUUID()}`;
        const bucket = getStorage().bucket();
        const xmlPath = `${prefix}-autorizado.xml`;
        const ridePath = `${prefix}-ride.pdf`;
        await Promise.all([
            bucket.file(xmlPath).save(xml, { resumable: false, metadata: { contentType: 'application/xml', cacheControl: 'private, no-store' } }),
            bucket.file(ridePath).save(ride, { resumable: false, metadata: { contentType: 'application/pdf', cacheControl: 'private, no-store' } })
        ]);

        const importedAt = new Date().toISOString();
        const patch = {
            sriEstado: 'ARCHIVOS_MANUALES_REGISTRADOS',
            sriManualArtifactsStatus: 'PENDING_OWNER_VERIFICATION',
            sriManualArtifactsSource: 'owner_upload_from_beatss',
            sriManualArtifactsUploadedAt: importedAt,
            sriManualArtifactsUploadedBy: decoded.uid,
            sriClaveAcceso: accessKey,
            sriXmlStoragePath: xmlPath,
            sriRideStoragePath: ridePath,
            sriXmlSha256: hash(xml),
            sriRideSha256: hash(ride),
            sriXmlSize: xml.length,
            sriRideSize: ride.length,
            sriErrorMensaje: ''
        };
        const batch = db.batch();
        batch.set(invoice.ref, patch, { merge: true });
        const licenseRef = db.collection('users').doc(invoice.ownerUid).collection('licencias').doc(invoice.id);
        if (invoice.ref.path !== licenseRef.path) batch.set(licenseRef, patch, { merge: true });
        const paymentRef = db.collection('payments').doc(invoice.id);
        if (invoice.ref.path !== paymentRef.path && paymentRecord) batch.set(paymentRef, patch, { merge: true });
        await batch.commit();
        return res.status(201).json({
            status: 'ARCHIVOS_MANUALES_REGISTRADOS',
            paymentId: invoice.id,
            accessKey,
            uploadedAt: importedAt,
            message: 'XML y RIDE asociados. Revisa en el portal SRI que clave, comprador y total correspondan; BEATSS no verificó criptográficamente la autorización.'
        });
    } catch (error) {
        const status = Number.isInteger(error.status) ? error.status : 500;
        console.error('Error al registrar archivos SRI manuales:', error.message);
        return res.status(status).json({ error: status === 500 ? 'No se pudieron registrar los archivos SRI.' : error.message });
    }
}
