import crypto from 'crypto';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { enqueueSriJob } from './_sri_queue.js';
import { notifyPurchaseOrderDelivery } from './_purchase-delivery.js';
import { normalizeLicenseTier } from '../server-handlers/license-upgrade-policy.js';
import { LICENSE_CONFIGS } from '../config.js';
import {
    CURRENT_REFERENCE_VERSION,
    createPublicContractReference,
    isValidLicenseReference,
    referenceTokenFromBytes,
    resolveLicenseReference
} from '../license-reference.js';

const STORAGE_BUCKET = process.env.FIREBASE_STORAGE_BUCKET || 'licencias-musicales.firebasestorage.app';
const SIGNING_SECRET = process.env.DOWNLOAD_SIGNING_KEY;
const REFERENCE_SECRET = process.env.LICENSE_REFERENCE_SIGNING_KEY || SIGNING_SECRET;
const DEFAULT_APP_ORIGIN = 'https://beatss.app';
const CONTRACT_RENDERER_VERSION = 'manual-contract-v1';

function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: STORAGE_BUCKET
    });
}

function generateDownloadToken(paymentId) {
    if (!SIGNING_SECRET) return '';
    return crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:download`).digest('hex');
}

function getSignedProxyUrl(rawUrl, appOrigin, paymentId, fileType) {
    if (!rawUrl || !SIGNING_SECRET) return '';
    if (!rawUrl.startsWith('https://') && !rawUrl.startsWith('/api/proxy-audio')) return '';
    let fileId = '';
    try {
        if (rawUrl.includes('id=')) fileId = new URL(rawUrl, 'https://localhost').searchParams.get('id') || '';
        else if (rawUrl.includes('drive.google.com')) fileId = rawUrl.split('/d/')[1]?.split('/')[0] || '';
        else return rawUrl;
    } catch (_) {
        return rawUrl;
    }
    if (!fileId) return rawUrl;
    const expires = Math.floor(Date.now() / 1000) + 86400 * 7;
    const dataToSign = `${fileId}:${expires}:${paymentId}:${fileType}`;
    const signature = crypto.createHmac('sha256', SIGNING_SECRET).update(dataToSign).digest('hex');
    return `${appOrigin || DEFAULT_APP_ORIGIN}/api/proxy-audio?id=${encodeURIComponent(fileId)}&expires=${expires}&paymentId=${encodeURIComponent(paymentId)}&fileType=${encodeURIComponent(fileType)}&signature=${signature}`;
}

function deterministicPaymentId(idempotencyKey, beatId, index, method = 'stripe') {
    if (!idempotencyKey) return '';
    const prefix = /^[a-z][a-z0-9_]{1,20}$/.test(String(method || '').toLowerCase())
        ? String(method).toLowerCase()
        : 'payment';
    return `${prefix}_${crypto.createHash('sha256').update(`${idempotencyKey}:${beatId}:${index}`).digest('hex').slice(0, 40)}`;
}

function deliveryToken(paymentId) {
    if (!SIGNING_SECRET) return '';
    return crypto.createHmac('sha256', SIGNING_SECRET).update(`${paymentId}:pdf-delivery`).digest('hex');
}

// El código contractual público es reproducible para un reintento del mismo
// pago, pero no revela la sesión de Stripe, el pedido de PayPal, ni el ID de
// Firestore. `paymentId` es generado por el servidor y el proveedor queda
// guardado únicamente en providerReference para conciliación interna.
function createPaidContractReference({ paymentId, providerReference, licenseType, issuedAt }) {
    if (!REFERENCE_SECRET || String(REFERENCE_SECRET).length < 32) {
        throw new Error('Falta una clave de firma segura para referencias contractuales.');
    }
    const token = referenceTokenFromBytes(
        crypto
            .createHmac('sha256', REFERENCE_SECRET)
            .update(`beatss-contract-reference-v3:${paymentId}:${providerReference || ''}`)
            .digest()
    );
    return createPublicContractReference({ licenseType, issuedAt, token });
}

const typeLabels = {
    basic: 'Básica',
    premium: 'Premium',
    premium_plus: 'Premium Plus',
    unlimited_flp: 'Ilimitada + FLP',
    exclusive: 'Exclusiva'
};

function paymentMethodLabel(method) {
    return String(method || '').toLowerCase() === 'stripe' ? 'Stripe' : String(method || 'Pago electrónico');
}

function buildContractSnapshot({
    reference,
    referenceVersion,
    method,
    item,
    beatData,
    buyerName,
    buyerEmail,
    buyerPhone,
    buyerDni,
    buyerCity,
    buyerCountry,
    finalPrice,
    timestamp
}) {
    const terms = LICENSE_CONFIGS[item.licenseType] || LICENSE_CONFIGS.basic;
    return {
        rendererVersion: CONTRACT_RENDERER_VERSION,
        contractReference: reference,
        reference,
        refCode: reference,
        referenceVersion,
        contractEffectiveDate: timestamp.slice(0, 10),
        date: timestamp.slice(0, 10),
        beatName: item.beatName,
        beatBpm: beatData.bpm || '',
        beatKey: beatData.key || '',
        buyerName,
        buyerEmail,
        buyerPhone,
        buyerId: buyerDni,
        buyerDni,
        buyerCity,
        buyerCountry,
        licenseType: item.licenseType,
        value: finalPrice,
        finalPrice,
        totalLicensePaid: finalPrice,
        paymentMethod: paymentMethodLabel(method),
        formats: terms.formats,
        streams: terms.streams,
        physical: terms.physical,
        videos: terms.videos,
        videoDuration: terms.videoDuration,
        years: terms.years,
        writerShare: terms.writerShare,
        producerShare: terms.producerShare,
        credits: terms.credits,
        contentIdProhibited: terms.contentId
    };
}

async function applyApprovedLicenseUpgrade(db, {
    producerId,
    sourcePaymentId,
    upgradePaymentId,
    targetLicenseType,
    amountDue,
    creditApplied,
    targetLicensePrice,
    timestamp
}) {
    const sourceRef = db.collection('payments').doc(sourcePaymentId);
    const licenseRef = db.collection('users').doc(producerId).collection('licencias').doc(sourcePaymentId);
    await db.runTransaction(async (transaction) => {
        const sourceSnap = await transaction.get(sourceRef);
        if (!sourceSnap.exists) throw new Error('No se encontró la licencia original de la ampliación.');
        const source = sourceSnap.data() || {};
        if (source.producerId !== producerId) throw new Error('La licencia original no pertenece a este productor.');
        const knownPaymentIds = Array.isArray(source.upgradePaymentIds) ? source.upgradePaymentIds : [];
        if (knownPaymentIds.includes(upgradePaymentId)) return;

        const previousTier = normalizeLicenseTier(source.licenseType);
        const nextTier = normalizeLicenseTier(targetLicenseType);
        if (previousTier === 'exclusive' || !['basic', 'premium', 'premium_plus', 'unlimited_flp'].includes(nextTier)) {
            throw new Error('La ampliación solicitada no tiene una licencia válida.');
        }
        const previousUpgradeTotal = Number(source.upgradeTotalPaid || 0);
        const upgradeTotalPaid = Number(((Number.isFinite(previousUpgradeTotal) ? previousUpgradeTotal : 0) + Number(amountDue || 0)).toFixed(2));
        const originalPaid = Number(source.finalPrice ?? source.price ?? source.originalPrice ?? 0);
        const totalLicensePaid = Number(((Number.isFinite(originalPaid) ? originalPaid : 0) + upgradeTotalPaid).toFixed(2));
        const update = {
            originalLicenseType: source.originalLicenseType || previousTier,
            licenseType: nextTier,
            upgradePaymentIds: [...knownPaymentIds, upgradePaymentId],
            upgradeTotalPaid,
            totalLicensePaid,
            latestUpgradePaymentId: upgradePaymentId,
            upgradedAt: timestamp,
            updatedAt: timestamp
        };
        transaction.update(sourceRef, update);
        transaction.set(licenseRef, {
            type: nextTier,
            licenseType: nextTier,
            originalLicenseType: source.originalLicenseType || previousTier,
            upgradePaymentIds: [...knownPaymentIds, upgradePaymentId],
            upgradeTotalPaid,
            totalLicensePaid,
            latestUpgradePaymentId: upgradePaymentId,
            latestUpgradeCreditApplied: Number(creditApplied || 0),
            latestUpgradeTargetPrice: Number(targetLicensePrice || 0),
            upgradedAt: timestamp
        }, { merge: true });
    });
}

/**
 * Registers an already-verified payment and creates its secure delivery records.
 * The deterministic Stripe id prevents a webhook retry from creating a second sale.
 */
export async function fulfillBeatPurchase({
    producerId,
    buyerName,
    buyerEmail,
    buyerPhone = '',
    buyerDni = '',
    buyerCity = '',
    buyerCountry = '',
    invoiceRuc = '',
    invoiceCompany = '',
    invoiceAddress = '',
    invoiceEmail = '',
    youtubeWhitelist = '',
    acceptedTerms = false,
    acceptanceTimestamp = '',
    termsVersion = '',
    items,
    discountPercent = 0,
    couponCode = '',
    reference,
    method = 'stripe',
    appOrigin = DEFAULT_APP_ORIGIN,
    idempotencyKey = '',
    providerReference = '',
    paymentIntentId = '',
    invoiceRequested = false,
    providerLivemode = true,
    upgrade = null
}) {
    if (!SIGNING_SECRET) throw new Error('Falta DOWNLOAD_SIGNING_KEY.');
    initFirebaseAdmin();
    const db = getFirestore();
    const publicConfigRef = db.collection('users').doc(producerId).collection('config').doc('producer');
    const privateConfigRef = db.collection('users').doc(producerId).collection('private_config').doc('producer');
    const sriConfigRef = db.collection('users').doc(producerId).collection('private_config').doc('sri');
    const [publicSnap, privateSnap, sriSnap] = await Promise.all([publicConfigRef.get(), privateConfigRef.get(), sriConfigRef.get()]);
    if (!publicSnap.exists) throw new Error('Productor no encontrado o no configurado.');
    const publicConfig = publicSnap.data();
    const privateConfig = privateSnap.exists ? privateSnap.data() : {};
    const sriPrivateConfig = { ...privateConfig, ...(sriSnap.exists ? sriSnap.data() : {}) };
    const deliveredItems = [];

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const isLicenseUpgrade = index === 0 && Boolean(upgrade?.sourcePaymentId);
        const beatRef = db.collection('users').doc(producerId).collection('beats').doc(item.beatId);
        const beatSnap = await beatRef.get();
        if (!beatSnap.exists) continue;
        const beatData = beatSnap.data();
        const privateFilesSnap = await beatRef.collection('private').doc('files').get();
        const privateFiles = privateFilesSnap.exists ? privateFilesSnap.data() : {};
        const paymentId = deterministicPaymentId(idempotencyKey, item.beatId, index, method);
        const paymentRef = paymentId ? db.collection('payments').doc(paymentId) : db.collection('payments').doc();
        const existingSnap = await paymentRef.get();
        const existingPayment = existingSnap.exists ? (existingSnap.data() || {}) : null;
        const now = existingPayment?.timestamp || new Date().toISOString();
        const providerTraceReference = String(providerReference || reference || '');
        const contractReference = existingPayment
            ? resolveLicenseReference(existingPayment)
            : createPaidContractReference({
                paymentId: paymentRef.id,
                providerReference: providerTraceReference,
                licenseType: item.licenseType,
                issuedAt: now
            });
        if (!isValidLicenseReference(contractReference)) {
            // No se intenta "arreglar" silenciosamente una transacción antigua
            // mal registrada. Así nunca se emite un documento oficial sin una
            // referencia persistida y verificable.
            throw new Error('El pago aprobado no contiene un código de referencia contractual válido.');
        }
        if (!existingSnap.exists) {
            const originalPrice = Number(item.price);
            const finalPrice = Number((originalPrice * (1 - Number(discountPercent || 0) / 100)).toFixed(2));
            const contractSnapshot = buildContractSnapshot({
                reference: contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                method,
                item,
                beatData,
                buyerName,
                buyerEmail,
                buyerPhone,
                buyerDni,
                buyerCity,
                buyerCountry,
                finalPrice,
                timestamp: now
            });
            await paymentRef.set({
                type: isLicenseUpgrade ? 'license_upgrade' : 'beat_purchase', producerId, beatId: item.beatId, beatName: item.beatName,
                licenseType: item.licenseType, price: originalPrice, originalPrice, finalPrice,
                buyerName, buyerEmail, buyerPhone, buyerDni, buyerCity, buyerCountry,
                invoiceRuc, invoiceCompany, invoiceAddress, invoiceEmail,
                sriInvoiceRequested: invoiceRequested === true,
                providerLivemode: providerLivemode === true,
                sriEstado: 'NO_EMITIDA',
                youtubeWhitelist, acceptedTerms: acceptedTerms === true, acceptanceTimestamp, termsVersion,
                method,
                reference: contractReference,
                contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                referenceSource: method,
                providerReference: providerTraceReference,
                paymentIntentId,
                contractRendererVersion: CONTRACT_RENDERER_VERSION, contractSnapshot,
                receiptUrl: '', status: 'approved', deliveryStatus: 'awaiting_contract',
                discountPercent: Number(discountPercent || 0), couponCode, timestamp: now,
                ...(isLicenseUpgrade ? {
                    upgradeOfPaymentId: upgrade.sourcePaymentId,
                    upgradeSourceLicenseType: upgrade.sourceLicenseType || '',
                    upgradeCreditApplied: Number(upgrade.creditApplied || 0),
                    targetLicensePrice: Number(upgrade.targetLicensePrice || 0),
                    purchaseKind: 'prior_license_upgrade'
                } : {})
            });
            await db.collection('users').doc(producerId).collection('licencias').doc(paymentRef.id).set({
                id: paymentRef.id,
                refCode: contractReference,
                reference: contractReference,
                contractReference,
                referenceVersion: CURRENT_REFERENCE_VERSION,
                referenceSource: method,
                beatId: item.beatId,
                beatName: item.beatName, type: item.licenseType, licenseType: item.licenseType,
                value: finalPrice, buyerName, buyerEmail, buyerPhone, buyerId: buyerDni,
                buyerCity, buyerCountry, invoiceRuc, invoiceCompany, invoiceAddress, invoiceEmail,
                sriInvoiceRequested: invoiceRequested === true,
                providerLivemode: providerLivemode === true,
                sriEstado: 'NO_EMITIDA',
                formData: { buyerName, buyerEmail, buyerPhone, buyerId: buyerDni, buyerCity, buyerCountry, invoiceRuc, invoiceCompany, invoiceAddress, invoiceEmail, youtubeWhitelist, acceptedTerms: acceptedTerms === true, acceptanceTimestamp, termsVersion },
                paymentMethod: paymentMethodLabel(method), status: 'approved',
                date: now.slice(0, 10), timestamp: now,
                contractRendererVersion: CONTRACT_RENDERER_VERSION, contractSnapshot,
                ...(isLicenseUpgrade ? {
                    upgradeOfPaymentId: upgrade.sourcePaymentId,
                    upgradeCreditApplied: Number(upgrade.creditApplied || 0),
                    targetLicensePrice: Number(upgrade.targetLicensePrice || 0),
                    purchaseKind: 'prior_license_upgrade'
                } : {})
            }, { merge: true });
            if (isLicenseUpgrade) {
                await applyApprovedLicenseUpgrade(db, {
                    producerId,
                    sourcePaymentId: upgrade.sourcePaymentId,
                    upgradePaymentId: paymentRef.id,
                    targetLicenseType: item.licenseType,
                    amountDue: finalPrice,
                    creditApplied: upgrade.creditApplied,
                    targetLicensePrice: upgrade.targetLicensePrice,
                    timestamp: now
                });
            }
            try {
                await enqueueSriJob(db, {
                    paymentId: paymentRef.id,
                    producerId,
                    // La opción explícita de facturación está protegida en la
                    // configuración SRI. Sólo el proceso server-side la mezcla
                    // para decidir si corresponde crear una factura.
                    publicConfig: { ...publicConfig, ...sriPrivateConfig },
                    privateConfig: sriPrivateConfig,
                    requestedBy: `${method}-fulfillment`,
                    invoiceRequested: invoiceRequested === true,
                    isLivePayment: providerLivemode === true
                });
            } catch (error) {
                console.error('No se pudo encolar la factura SRI:', error.message);
                await paymentRef.update({ sriEstado: 'ERROR_COLA', sriUltimoIntento: now, sriErrorMensaje: 'No se pudo crear el trabajo SRI; reintenta desde el historial.' });
            }
        }

        const wav = getSignedProxyUrl(privateFiles.wav || beatData.wav || '', appOrigin, paymentRef.id, 'wav');
        const stems = getSignedProxyUrl(privateFiles.stems || beatData.stems || '', appOrigin, paymentRef.id, 'stems');
        const mp3 = getSignedProxyUrl(privateFiles.mp3 || beatData.mp3 || '', appOrigin, paymentRef.id, 'mp3');
        const token = generateDownloadToken(paymentRef.id);
        const downloadUrl = `${appOrigin}/descargas/${encodeURIComponent(paymentRef.id)}?token=${encodeURIComponent(token)}`;
        deliveredItems.push({
            paymentId: paymentRef.id,
            beatName: item.beatName,
            licenseType: item.licenseType,
            reference: contractReference,
            deliveryToken: deliveryToken(paymentRef.id),
            downloadToken: token,
            links: { mp3, wav, stems, downloadUrl },
            linksHtml: `<div style="margin-bottom:20px;padding:15px;border:1px solid #edf2f7;border-radius:8px;background:#f8fafc"><h4 style="margin:0 0 10px;color:#2d3748">Instrumental: <strong>${item.beatName}</strong> (${typeLabels[item.licenseType] || item.licenseType})</h4><a href="${downloadUrl}" style="display:inline-block;padding:10px 20px;background:#0055ee;color:#fff!important;text-decoration:none;border-radius:6px;font-weight:bold">📥 Acceder a Descargas e Historial</a></div>`
        });
    }
    if (!deliveredItems.length) throw new Error('No se procesó ningún beat válido de la orden.');
    const producerEmailConfig = { ...publicConfig, ...privateConfig };
    let notificationResult;
    try {
        notificationResult = await notifyPurchaseOrderDelivery({
            db,
            deliveries: deliveredItems,
            producer: producerEmailConfig,
            appOrigin
        });
    } catch (error) {
        console.error('No se pudo preparar la notificación de entrega:', error.message);
        notificationResult = { complete: false, errorCode: 'DELIVERY_NOTIFICATION_FAILED' };
    }
    return {
        paymentId: deliveredItems[0].paymentId,
        deliveries: deliveredItems,
        deliveryNotificationComplete: notificationResult.complete === true,
        notificationResult
    };
}

export function getStripeFirebase() {
    initFirebaseAdmin();
    return getFirestore();
}
