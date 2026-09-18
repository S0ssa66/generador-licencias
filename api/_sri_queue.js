// Cola SRI compartida por las confirmaciones de pago server-side.
// Este módulo nunca devuelve ni persiste certificados o contraseñas.

function isValidEcuadorRuc(value) {
    const ruc = String(value || '').trim();
    if (!/^\d{13}$/.test(ruc) || /^0+$/.test(ruc) || ruc.slice(-3) === '000') return false;
    const province = Number(ruc.slice(0, 2));
    const third = Number(ruc[2]);
    if (!((province >= 1 && province <= 24) || province === 30)) return false;
    if (third < 6) {
        const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2];
        const sum = weights.reduce((total, weight, index) => {
            const product = Number(ruc[index]) * weight;
            return total + (product >= 10 ? product - 9 : product);
        }, 0);
        return ((10 - (sum % 10)) % 10) === Number(ruc[9]);
    }
    if (third === 9) {
        const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(ruc[index]) * weight, 0);
        return (((11 - (sum % 11)) % 11) % 10) === Number(ruc[9]);
    }
    if (third === 6) {
        const weights = [3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(ruc[index]) * weight, 0);
        return (((11 - (sum % 11)) % 11) % 10) === Number(ruc[8]);
    }
    return false;
}

export function hasCompleteSriConfig(publicConfig, privateConfig) {
    const config = { ...(publicConfig || {}), ...(privateConfig || {}) };
    const ruc = String(config.sriRuc || '').trim();
    const razonSocial = String(config.sriRazonSocial || '').trim();
    const ambiente = String(config.sriAmbiente || '1').trim();
    const estab = String(config.sriEstab || '001').trim();
    const ptoEmi = String(config.sriPtoEmi || '001').trim();
    return Boolean(
        isValidEcuadorRuc(ruc) &&
        razonSocial &&
        /^[12]$/.test(ambiente) &&
        /^\d{3}$/.test(estab) &&
        /^\d{3}$/.test(ptoEmi) &&
        String(privateConfig?.sriP12Base64 || '').trim() &&
        String(privateConfig?.sriP12Password || process.env.SRI_FIRMA_PASSWORD || '').trim()
    );
}

// La activación de la firma no equivale a autorización para facturar cada
// venta. La cola automática requiere una decisión explícita del productor y
// una solicitud fiscal concreta del pedido. Los eventos sandbox nunca pasan a
// la cola fiscal, aunque el productor tenga certificado configurado.
export function shouldQueueSriInvoice({
    publicConfig = {},
    invoiceRequested = false,
    isLivePayment = true,
    manualOverride = false
} = {}) {
    if (manualOverride) return true;
    return publicConfig?.sriAutoQueueEnabled === true
        && invoiceRequested === true
        && isLivePayment === true;
}

async function setSriStatus(db, { paymentId, producerId, status, now, extra = {} }) {
    const payload = {
        sriEstado: status,
        sriUltimoIntento: now,
        ...extra
    };
    const batch = db.batch();
    batch.set(db.collection('payments').doc(paymentId), payload, { merge: true });
    batch.set(db.collection('users').doc(producerId).collection('licencias').doc(paymentId), payload, { merge: true });
    await batch.commit();
}

function incompleteConfigStatus(now) {
    return {
        sriEstado: 'NO_CONFIGURADO',
        sriUltimoIntento: now,
        sriErrorMensaje: 'Configura el RUC, el certificado .p12/.pfx y su contraseña para emitir la factura SRI.'
    };
}

export async function enqueueSriJob(db, {
    paymentId,
    producerId,
    publicConfig = {},
    privateConfig = {},
    requestedBy = 'payment-confirmation',
    invoiceRequested = false,
    isLivePayment = true,
    manualOverride = false
}) {
    if (!paymentId || !producerId) throw new Error('Faltan paymentId o producerId para crear el trabajo SRI.');

    const now = new Date().toISOString();
    const licenseRef = db.collection('users').doc(producerId).collection('licencias').doc(paymentId);
    const jobRef = db.collection('sriJobs').doc(paymentId);
    const existingJob = await jobRef.get();
    const paymentSnap = await db.collection('payments').doc(paymentId).get();

    // Idempotencia: una factura ya autorizada no se vuelve a encolar ni se
    // vuelve a emitir por una notificación duplicada del proveedor de pago.
    const payment = paymentSnap.exists ? paymentSnap.data() || {} : null;
    if (payment && (existingJob.exists && existingJob.data()?.status === 'DONE' || ['AUTORIZADO', 'AUTORIZADO_ENTREGA_PENDIENTE'].includes(payment.sriEstado))) {
        return { queued: false, alreadyAuthorized: true };
    }

    if (!shouldQueueSriInvoice({ publicConfig, invoiceRequested, isLivePayment, manualOverride })) {
        if (!paymentSnap.exists) return { queued: false, reason: 'payment_not_found' };
        await setSriStatus(db, {
            paymentId,
            producerId,
            status: 'NO_EMITIDA',
            now,
            extra: {
                sriInvoiceRequested: invoiceRequested === true,
                sriQueueReason: isLivePayment === false ? 'sandbox_payment' : 'producer_opt_in_required',
                sriErrorMensaje: ''
            }
        });
        return { queued: false, reason: isLivePayment === false ? 'sandbox_payment' : 'producer_opt_in_required' };
    }

    // Una licencia en el historial no demuestra un cobro. Encolar exige un
    // pago real, aprobado y ligado al mismo productor; batch.set con merge
    // podría crear de otro modo un documento payments ficticio.
    if (!payment || payment.status !== 'approved' || payment.producerId !== producerId) {
        throw Object.assign(new Error('Sólo se puede emitir una factura de un pago aprobado de este productor.'), { status: 409 });
    }
    if (payment.providerLivemode === false || isLivePayment !== true || /^cs_test_/i.test(String(payment.reference || paymentId))) {
        throw Object.assign(new Error('Un pago de prueba no puede generar factura SRI.'), { status: 409 });
    }

    if (!hasCompleteSriConfig(publicConfig, privateConfig)) {
        const status = incompleteConfigStatus(now);
        await setSriStatus(db, { paymentId, producerId, status: status.sriEstado, now, extra: status });
        return { queued: false, reason: 'configuration_incomplete' };
    }

    const status = {
        sriEstado: 'EN_COLA_EMISION',
        sriJobId: paymentId,
        sriUltimoIntento: now,
        sriErrorMensaje: '',
        sriInvoiceRequested: true,
        sriQueueReason: manualOverride ? 'manual_request' : 'automatic_opt_in'
    };

    const previous = existingJob.exists ? existingJob.data() : {};
    const previousStatus = String(previous.status || '');
    if (['PENDING', 'PROCESSING', 'CONTINGENCY'].includes(previousStatus)) return { queued: true, alreadyQueued: true };

    const batch = db.batch();
    batch.set(jobRef, {
        paymentId,
        reference: paymentId,
        producerId,
        status: 'PENDING',
        requestedBy,
        idempotencyKey: `sri:${paymentId}`,
        attempts: Number(previous.attempts || 0),
        createdAt: previous.createdAt || now,
        updatedAt: now,
        lastTransitionAt: now,
        nextAttemptAt: now,
        leaseOwner: '',
        leaseExpiresAt: '',
        lastError: ''
    }, { merge: true });
    batch.set(db.collection('payments').doc(paymentId), status, { merge: true });
    batch.set(licenseRef, status, { merge: true });
    await batch.commit();
    return { queued: true };
}

export async function enqueueSriForPayment(db, paymentId, payment, requestedBy, options = {}) {
    const producerId = String(payment?.producerId || '').trim();
    if (!producerId) throw new Error('El pago no tiene productor asociado.');

    const [publicConfigSnap, privateConfigSnap, sriConfigSnap] = await Promise.all([
        db.collection('users').doc(producerId).collection('config').doc('producer').get(),
        db.collection('users').doc(producerId).collection('private_config').doc('producer').get(),
        db.collection('users').doc(producerId).collection('private_config').doc('sri').get()
    ]);

    return enqueueSriJob(db, {
        paymentId,
        producerId,
        // La preferencia de emisión vive junto con la configuración fiscal
        // privada. Se usa sólo en el servidor para decidir la cola; nunca se
        // expone como una configuración pública de la tienda.
        publicConfig: {
            ...(publicConfigSnap.exists ? publicConfigSnap.data() : {}),
            ...(sriConfigSnap.exists ? sriConfigSnap.data() : {})
        },
        privateConfig: {
            ...(privateConfigSnap.exists ? privateConfigSnap.data() : {}),
            ...(sriConfigSnap.exists ? sriConfigSnap.data() : {})
        },
        requestedBy: requestedBy || `${payment?.method || 'payment'}-confirmation`,
        invoiceRequested: payment?.sriInvoiceRequested === true || payment?.needInvoice === true,
        isLivePayment: options.isLivePayment !== false && payment?.providerLivemode !== false,
        manualOverride: options.manualOverride === true
    });
}
