function cleanText(value, maxLength, label) {
    const raw = String(value ?? '').trim();
    if (raw.length > maxLength || /[\u0000-\u001f\u007f]/.test(raw)) {
        throw Object.assign(new Error(`${label} supera el formato permitido.`), { status: 400 });
    }
    return raw.replace(/\s+/g, ' ');
}

export function isValidEcuadorBuyerId(value) {
    const id = String(value || '').trim();
    if (!/^\d{10}(?:\d{3})?$/.test(id) || /^0+$/.test(id)) return false;
    const province = Number(id.slice(0, 2));
    const third = Number(id[2]);
    if (!((province >= 1 && province <= 24) || province === 30)) return false;
    if (id.length === 10 && third < 6) {
        const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2];
        const sum = weights.reduce((total, weight, index) => {
            const product = Number(id[index]) * weight;
            return total + (product >= 10 ? product - 9 : product);
        }, 0);
        return ((10 - (sum % 10)) % 10) === Number(id[9]);
    }
    if (id.length === 13 && third < 6) {
        if (id.slice(-3) === '000') return false;
        const weights = [2, 1, 2, 1, 2, 1, 2, 1, 2];
        const sum = weights.reduce((total, weight, index) => {
            const product = Number(id[index]) * weight;
            return total + (product >= 10 ? product - 9 : product);
        }, 0);
        return ((10 - (sum % 10)) % 10) === Number(id[9]);
    }
    if (id.length === 13 && third === 9) {
        if (id.slice(-3) === '000') return false;
        const weights = [4, 3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
        const mod = 11 - (sum % 11);
        const verifier = mod === 11 ? 0 : mod;
        return verifier === Number(id[9]);
    }
    if (id.length === 13 && third === 6) {
        if (id.slice(-3) === '000') return false;
        const weights = [3, 2, 7, 6, 5, 4, 3, 2];
        const sum = weights.reduce((total, weight, index) => total + Number(id[index]) * weight, 0);
        const mod = 11 - (sum % 11);
        const verifier = mod === 11 ? 0 : mod;
        return verifier === Number(id[8]);
    }
    return false;
}

export function normalizeSriInvoiceDetails(raw, payment = {}) {
    const numericTotal = Number(payment.finalPrice ?? payment.price ?? payment.value ?? payment.amount);
    if (raw?.mode === 'consumer_final') {
        if (raw.consumerFinalConfirmed !== true || !Number.isFinite(numericTotal) || numericTotal <= 0 || numericTotal > 50) {
            throw Object.assign(new Error('Consumidor Final sólo procede con confirmación expresa y un total de hasta USD 50.'), { status: 400 });
        }
        return {
            mode: 'consumer_final', consumerFinalConfirmed: true,
            buyerName: 'CONSUMIDOR FINAL', buyerId: '9999999999999',
            buyerAddress: 'CONSUMIDOR FINAL',
            buyerEmail: cleanText(raw.buyerEmail || payment.buyerEmail, 254, 'El correo').toLowerCase()
        };
    }
    if (!raw || raw.mode !== 'identified') {
        throw Object.assign(new Error('Solicita la emisión desde Facturador SRI para elegir Consumidor Final (si aplica) o ingresar los datos de una factura nominativa.'), { status: 400 });
    }
    const buyerName = cleanText(raw.buyerName, 300, 'El nombre');
    const buyerId = cleanText(raw.buyerId, 20, 'La identificación').toUpperCase();
    const buyerAddress = cleanText(raw.buyerAddress, 300, 'La dirección');
    const buyerEmail = cleanText(raw.buyerEmail || payment.buyerEmail, 254, 'El correo').toLowerCase();
    if (!buyerName || !buyerAddress || !buyerId) {
        throw Object.assign(new Error('Completa nombre o razón social, identificación fiscal y dirección del comprador.'), { status: 400 });
    }
    const validId = isValidEcuadorBuyerId(buyerId) || /^[A-Z0-9]{5,20}$/.test(buyerId) && /[A-Z]/.test(buyerId);
    if (!validId) {
        throw Object.assign(new Error('La identificación del comprador no es válida. Verifica la cédula/RUC o pasaporte.'), { status: 400 });
    }
    if (buyerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyerEmail)) {
        throw Object.assign(new Error('El correo del comprador no tiene un formato válido.'), { status: 400 });
    }
    if (!Number.isFinite(numericTotal) || numericTotal <= 0) {
        throw Object.assign(new Error('No se pudo verificar el total aprobado de la venta.'), { status: 409 });
    }
    return { mode: 'identified', buyerName, buyerId, buyerAddress, buyerEmail };
}
