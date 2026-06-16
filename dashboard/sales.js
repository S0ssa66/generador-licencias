import { db, collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const getActiveLicenseType = (...args) => window.getActiveLicenseType(...args);
const compileContract = (...args) => window.compileContract(...args);
const sendEmailDelivery = (...args) => window.sendEmailDelivery(...args);
const selectLicenseType = (...args) => window.selectLicenseType(...args);

let _salesFirstLoad = true;
let _knownPaymentIds = new Set();

function initSalesRealtimeListener() {
    if (!window.currentUser) return;

    // Cancelar listener anterior si existe
    if (window._salesUnsubscribe) { window._salesUnsubscribe(); window._salesUnsubscribe = null; }
    _salesFirstLoad   = true;
    _knownPaymentIds  = new Set();
    window.storePayments = [];

    const paymentsCol = collection(db, "payments");
    // Consulta sin ordenar para evitar requerir índices compuestos en Firestore
    const q = query(
        paymentsCol,
        where("producerId", "==", window.currentUser)
    );

    window._salesUnsubscribe = onSnapshot(q, (snapshot) => {
        const newDocs = [];

        snapshot.docChanges().forEach(change => {
            const data = change.doc.data();
            if (data.type !== 'beat_purchase' && data.type !== 'exclusive_offer') return;

            if (change.type === 'added') {
                // Si ya lo conocíamos, ignorar (evita notificar duplicados en hot-reload)
                if (!_salesFirstLoad && !_knownPaymentIds.has(change.doc.id)) {
                    newDocs.push({ id: change.doc.id, ...data });
                }
                _knownPaymentIds.add(change.doc.id);
            }
        });

        // Reconstruir array completo
        window.storePayments = [];
        snapshot.forEach(d => {
            const data = d.data();
            if (data.type === 'beat_purchase' || data.type === 'exclusive_offer') {
                window.storePayments.push({ id: d.id, ...data });
            }
        });

        // Ordenar en memoria por fecha descendente
        window.storePayments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        renderSalesTable();
        renderSalesStats();
        updateSalesBadge();

        // Notificaciones de nuevos pedidos (solo tras carga inicial)
        if (!_salesFirstLoad && newDocs.length > 0) {
            newDocs.forEach(pay => {
                const isOffer = pay.type === 'exclusive_offer';
                const icon    = isOffer ? '🏷️' : '🛒';
                const title   = isOffer ? '¡Nueva Oferta Exclusiva!' : '¡Nuevo Pedido!';
                const beat    = pay.beatName || 'Beat';
                const buyer   = pay.buyerName || 'Comprador';
                const amount  = `$${parseFloat(pay.price || 0).toFixed(2)}`;

                showToast(`${icon} ${title}: ${buyer} quiere "${beat}" por ${amount}`, false);

                // Notificación nativa del browser si está permitida
                if (Notification?.permission === 'granted') {
                    new Notification(`${icon} BEATSS – ${title}`, {
                        body: `${buyer} → "${beat}" · ${amount}`,
                        icon: '/favicon.ico'
                    });
                }
            });
        }

        _salesFirstLoad = false;
    }, (err) => {
        console.error("Error en listener de pagos:", err);
        // Fallback a getDocs si el listener falla (ej. sin índice)
        loadSalesDataFallback();
    });
}

function updateSalesBadge() {
    const pending = (window.storePayments || []).filter(p => p.status === 'pending').length;
    let badge = document.getElementById('sales-tab-badge');
    const salesTab = document.querySelector('[data-tab="beats-store"]') ||
                     document.querySelector('#tab-beats-store') ||
                     document.querySelector('.nav-btn[data-section="beats-store"]');

    if (pending > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.id = 'sales-tab-badge';
            badge.style.cssText = `
                display: inline-flex; align-items: center; justify-content: center;
                background: #ef4444; color: #fff; font-size: 10px; font-weight: 800;
                border-radius: 999px; min-width: 18px; height: 18px; padding: 0 5px;
                margin-left: 6px; line-height: 1; animation: pulse-badge 1.5s ease-in-out infinite;
            `;
            if (!document.getElementById('sales-badge-style')) {
                const st = document.createElement('style');
                st.id = 'sales-badge-style';
                st.textContent = `
                    @keyframes pulse-badge {
                        0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(239,68,68,0.6); }
                        50%       { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(239,68,68,0); }
                    }
                `;
                document.head.appendChild(st);
            }
            if (salesTab) salesTab.appendChild(badge);
            else document.body.appendChild(badge); // fallback temporal
        }
        badge.textContent = pending > 99 ? '99+' : pending;
        badge.style.display = 'inline-flex';
    } else if (badge) {
        badge.style.display = 'none';
    }
}

async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
    }
}

async function loadSalesDataFallback() {
    if (!window.currentUser) return;
    try {
        const q = query(
            collection(db, "payments"),
            where("producerId", "==", window.currentUser)
        );
        const snap = await getDocs(q);
        window.storePayments = [];
        snap.forEach(d => {
            const data = d.data();
            if (data.type === 'beat_purchase' || data.type === 'exclusive_offer') {
                window.storePayments.push({ id: d.id, ...data });
            }
        });
        // Ordenar en memoria por fecha descendente
        window.storePayments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        renderSalesTable();
        renderSalesStats();
        updateSalesBadge();
    } catch (e) { console.error("Error cargando pedidos (fallback):", e); }
}

function loadSalesData() {
    initSalesRealtimeListener();
}

function renderSalesTable() {
    const tbody = document.getElementById('sales-table-tbody');
    const emptyState = document.getElementById('sales-empty-state');
    
    if (!window.storePayments || window.storePayments.length === 0) {
        tbody.innerHTML = '';
        emptyState.style.display = 'block';
        document.getElementById('sales-pending-count').style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';

    let pendingCount = 0;

    tbody.innerHTML = window.storePayments.map(pay => {
        const dateStr = pay.timestamp ? pay.timestamp.split('T')[0] : 'N/A';
        const isOffer = pay.type === 'exclusive_offer';
        const methodLabel = isOffer ? '💬 Oferta' : (pay.method === 'deuna' ? 'Deuna!' : (pay.method === 'paypal' ? 'PayPal' : 'Transf.'));
        
        let statusBadge = '';
        let actionButtons = '';
        
        if (pay.status === 'pending') {
            pendingCount++;
            statusBadge = `<span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">${isOffer ? 'Oferta Pendiente' : 'Pendiente'}</span>`;
            if (isOffer) {
                actionButtons = `
                    <button class="btn btn-primary" onclick="window.acceptExclusiveOffer('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px;">✓ Aceptar</button>
                    <button class="btn" onclick="window.rejectBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; margin-left: 4px;">✕ Rechazar</button>
                `;
            } else {
                actionButtons = `
                    <button class="btn btn-primary" onclick="window.approveBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px;">Aprobar</button>
                    <button class="btn" onclick="window.rejectBeatSale('${pay.id}')" style="padding: 4px 8px; font-size: 11px; height: 26px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); color: #ef4444; margin-left: 4px;">Rechazar</button>
                `;
            }
        } else if (pay.status === 'approved') {
            statusBadge = `<span style="background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Aprobado</span>`;
            actionButtons = `<span style="font-size: 11px; color: #8a91a6;">Completado</span>`;
        } else {
            statusBadge = `<span style="background: rgba(239, 68, 68, 0.15); color: #ef4444; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">Rechazado</span>`;
            actionButtons = `<span style="font-size: 11px; color: #8a91a6;">Cancelado</span>`;
        }

        const receiptLink = pay.receiptUrl 
            ? `<a href="${pay.receiptUrl}" target="_blank" style="color: var(--accent); font-weight: 600; text-decoration: underline;">Ver Captura</a>` 
            : `<span style="color: #8a91a6;">${isOffer ? 'N/A' : 'N/A (PayPal)'}</span>`;

        // Mostrar precio propuesto en la oferta vs precio original
        const priceDisplay = isOffer
            ? `<div style="font-weight: 700; color: #f59e0b;">$${parseFloat(pay.price).toFixed(2)}</div><div style="font-size: 10px; color: #8a91a6;">Precio orig: $${parseFloat(pay.originalPrice || pay.price).toFixed(2)}</div>`
            : `<div style="font-weight: 700; color: #fff;">$${parseFloat(pay.price).toFixed(2)}</div>`;

        // Mensaje de la oferta si existe
        const offerMessageRow = isOffer && pay.offerMessage
            ? `<tr><td colspan="8" style="background: rgba(245, 158, 11, 0.05); padding: 8px 12px; font-size: 12px; color: #8a91a6; font-style: italic; border-bottom: 1px solid rgba(255,255,255,0.04);">💬 Mensaje: "${pay.offerMessage}"</td></tr>`
            : '';

        // Detectar si el pedido es "nuevo" (menos de 5 minutos)
        const tsMs = pay.timestamp ? new Date(pay.timestamp).getTime() : 0;
        const isNew = pay.status === 'pending' && (Date.now() - tsMs) < 5 * 60 * 1000;
        const newBadge = isNew ? `<span style="background: #ef4444; color: #fff; font-size: 9px; font-weight: 800; padding: 2px 6px; border-radius: 4px; margin-left: 6px; animation: pulse-badge 1.5s ease-in-out infinite; vertical-align: middle;">NUEVO</span>` : '';

        return `
            ${offerMessageRow}
            <tr onclick="if(!event.target.closest('button') && !event.target.closest('a')) window.openSaleDetailsModal('${pay.id}')" style="cursor: pointer; ${isOffer ? 'border-left: 3px solid #f59e0b;' : (isNew ? 'border-left: 3px solid #ef4444;' : '')}">
                <td data-label="Fecha / ID">
                    <div style="font-weight: 600;">${dateStr}${newBadge}</div>
                    <div style="font-size: 10px; color: #8a91a6;">ID: ${pay.reference}</div>
                </td>
                <td data-label="Beat / Licencia">
                    <div style="font-weight: 600; color: #fff;">${pay.beatName}</div>
                    <div style="font-size: 11px; text-transform: uppercase; color: var(--accent);">${pay.licenseType}${isOffer ? ' 🏷️' : ''}</div>
                </td>
                <td data-label="Comprador">
                    <div>${pay.buyerName}</div>
                    <div style="font-size: 11px; color: #8a91a6;">${pay.buyerEmail}</div>
                </td>
                <td data-label="Monto">${priceDisplay}</td>
                <td data-label="Método">${methodLabel}</td>
                <td data-label="Comprobante">${receiptLink}</td>
                <td data-label="Estado">${statusBadge}</td>
                <td class="actions-cell" style="text-align: right; white-space: nowrap;">${actionButtons}</td>
            </tr>
        `;
    }).join('');

    const badge = document.getElementById('sales-pending-count');
    if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderSalesStats() {
    let pending = 0;
    let approved = 0;
    let revenue = 0.0;

    window.storePayments.forEach(pay => {
        if (pay.status === 'pending') pending++;
        if (pay.status === 'approved') {
            approved++;
            revenue += parseFloat(pay.price) || 0.0;
        }
    });

    document.getElementById('sales-stat-pending').textContent = pending;
    document.getElementById('sales-stat-approved').textContent = approved;
    document.getElementById('sales-stat-revenue').textContent = `$${revenue.toFixed(2)}`;
}



async function openSaleDetailsModal(paymentId) {
    console.log("👁️ Abriendo modal de detalles de venta para:", paymentId);
    
    // Obtener elementos del modal
    const modal = document.getElementById('admin-sale-details-modal');
    const beatArtwork = document.getElementById('admin-sale-beat-artwork');
    const beatArtworkIcon = document.getElementById('admin-sale-beat-artwork-icon');
    const beatNameEl = document.getElementById('admin-sale-beat-name');
    const beatMetaEl = document.getElementById('admin-sale-beat-meta');
    const orderRefEl = document.getElementById('admin-sale-order-ref');
    
    const buyerNameEl = document.getElementById('admin-sale-buyer-name');
    const buyerEmailEl = document.getElementById('admin-sale-buyer-email');
    const buyerPhoneEl = document.getElementById('admin-sale-buyer-phone');
    const buyerDniEl = document.getElementById('admin-sale-buyer-dni');
    const buyerLocEl = document.getElementById('admin-sale-buyer-loc');
    const timestampEl = document.getElementById('admin-sale-timestamp');
    
    const historyList = document.getElementById('admin-sale-history-list');

    // Inicializar estado de carga
    beatArtwork.style.display = 'none';
    beatArtworkIcon.style.display = 'block';
    beatNameEl.textContent = 'Cargando...';
    beatMetaEl.textContent = '';
    orderRefEl.textContent = '';
    
    buyerNameEl.textContent = '...';
    buyerEmailEl.textContent = '...';
    buyerPhoneEl.textContent = '...';
    buyerDniEl.textContent = '...';
    buyerLocEl.textContent = '...';
    timestampEl.textContent = '...';
    
    historyList.innerHTML = '<div class="text-on-surface-variant/40 italic">⏳ Cargando historial de descargas...</div>';

    modal.style.display = 'flex';
    if (window.safeCreateIcons) window.safeCreateIcons();

    try {
        // Pasar token de sesión para autenticación
        let fetchHeaders = {};
        if (window._firebaseAuth && window._firebaseAuth.currentUser) {
            try {
                const idToken = await window._firebaseAuth.currentUser.getIdToken();
                fetchHeaders['Authorization'] = `Bearer ${idToken}`;
            } catch (e) { console.warn('No se pudo obtener el token de sesión:', e.message); }
        }
        const response = await fetch(`/api/get-order-downloads?id=${paymentId}`, { headers: fetchHeaders });
        if (!response.ok) {
            throw new Error("No se pudo obtener el historial de descargas.");
        }

        const data = await response.json();
        
        const payment = data.payment;
        const beat = data.beat;
        const downloads = data.downloads;

        // Poblar beat details
        if (beat.artwork) {
            beatArtwork.src = beat.artwork;
            beatArtwork.style.display = 'block';
            beatArtworkIcon.style.display = 'none';
        } else {
            beatArtwork.style.display = 'none';
            beatArtworkIcon.style.display = 'block';
        }
        beatNameEl.textContent = beat.name;
        
        const priceFormatted = parseFloat(payment.finalPrice !== undefined ? payment.finalPrice : payment.price).toFixed(2);
        const licenseLabels = {
            basic: 'Licencia Básica',
            premium: 'Licencia Premium',
            premium_plus: 'Licencia Premium Plus',
            unlimited_flp: 'Licencia Ilimitada + FLP',
            unlimited: 'Licencia Ilimitada',
            exclusive: 'Licencia Exclusiva'
        };
        const licenseLabel = licenseLabels[payment.licenseType] || payment.licenseType;
        beatMetaEl.textContent = `Pista • ${licenseLabel} • $${priceFormatted}`;
        orderRefEl.textContent = `Ref: ${payment.reference} | ID: ${payment.id}`;

        // Poblar buyer details
        buyerNameEl.textContent = payment.buyerName || 'N/A';
        buyerEmailEl.textContent = payment.buyerEmail || 'N/A';
        buyerPhoneEl.textContent = payment.buyerPhone || '-';
        buyerDniEl.textContent = payment.buyerDni || payment.buyerId || '-';
        
        const city = payment.buyerCity || '';
        const country = payment.buyerCountry || '';
        buyerLocEl.textContent = (city && country) ? `${city}, ${country}` : (city || country || '-');
        
        timestampEl.textContent = payment.timestamp ? new Date(payment.timestamp).toLocaleString() : 'N/A';

        // Render downloads history
        if (!downloads || downloads.length === 0) {
            historyList.innerHTML = '<div class="text-on-surface-variant/40 italic">Ninguna descarga registrada aún.</div>';
        } else {
            historyList.innerHTML = downloads.map(log => {
                const timestampFormatted = log.timestamp ? log.timestamp.split('.')[0] + 'Z' : 'N/A';
                const fileTypeLabel = {
                    mp3: 'MP3',
                    wav: 'WAV',
                    stems: 'Stems',
                    license: 'Licencia PDF'
                }[log.fileType] || log.fileType;
                
                return `<div class="flex justify-between items-center py-1 border-b border-white/[0.02]">
                    <span>${timestampFormatted} [${log.ip}]</span>
                    <span class="text-neon-blue font-semibold uppercase text-[9px] bg-neon-blue/10 px-2 py-0.5 rounded border border-neon-blue/20">${fileTypeLabel}</span>
                </div>`;
            }).join('');
        }

        if (window.safeCreateIcons) window.safeCreateIcons();

    } catch (err) {
        console.error("Error al cargar detalles de auditoría de descargas:", err);
        beatNameEl.textContent = 'Error';
        beatMetaEl.textContent = 'No se pudo recuperar la información de descargas.';
        historyList.innerHTML = '<div class="text-red-500 italic">Error al cargar historial.</div>';
    }
};


async function approveBeatSale(paymentId) {
    const payment = window.storePayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!confirm(`¿Estás seguro de que deseas aprobar la venta de $${payment.price} por "${payment.beatName}"? Esto compilará el contrato PDF, guardará la licencia en el historial y enviará la entrega por EmailJS.`)) {
        return;
    }

    try {
        // 1. Obtener datos del beat de la base de datos
        const beatDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId);
        const beatSnap = await getDoc(beatDocRef);
        let beatData = null;
        if (beatSnap.exists()) {
            beatData = beatSnap.data();
            try {
                const privateDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId, "private", "files");
                const privateSnap = await getDoc(privateDocRef);
                if (privateSnap.exists()) {
                    const privateData = privateSnap.data();
                    beatData.wav = privateData.wav || "";
                    beatData.stems = privateData.stems || "";
                }
            } catch (privateErr) {
                console.warn("No se pudieron cargar enlaces privados para la entrega manual:", privateErr.message);
            }
        } else {
            beatData = window.localBeats.find(b => b.id === payment.beatId);
        }

        if (!beatData) {
            alert("Error: No se encontraron los datos del beat en el catálogo. Verifica que el beat aún exista.");
            return;
        }

        // 2. Guardar estado actual del formulario de licencias
        const originalForm = {
            beatName: document.getElementById('beat-name').value,
            buyerName: document.getElementById('buyer-name').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            buyerDni: document.getElementById('buyer-id').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            refCode: document.getElementById('ref-code').value,
            effectiveDate: document.getElementById('effective-date').value,
            audioMp3: document.getElementById('audio-link-mp3').value,
            audioWav: document.getElementById('audio-link-wav').value,
            audioStems: document.getElementById('audio-link-stems').value,
            licenseType: getActiveLicenseType(),
            licenseValue: document.getElementById('license-value').value,
            paymentMethod: document.getElementById('payment-method').value
        };

        // 3. Rellenar formulario con los datos de la venta
        document.getElementById('beat-name').value = payment.beatName;
        document.getElementById('buyer-name').value = payment.buyerName;
        document.getElementById('buyer-email').value = payment.buyerEmail;
        document.getElementById('buyer-phone').value = payment.buyerPhone || "";
        document.getElementById('buyer-id').value = payment.buyerDni || "";
        document.getElementById('buyer-city').value = payment.buyerCity || "";
        document.getElementById('buyer-country').value = payment.buyerCountry || "";
        document.getElementById('ref-code').value = payment.reference;
        document.getElementById('effective-date').value = payment.timestamp.split('T')[0];
        document.getElementById('audio-link-mp3').value = beatData.mp3 || "";
        document.getElementById('audio-link-wav').value = beatData.wav || "";
        document.getElementById('audio-link-stems').value = beatData.stems || "";
        document.getElementById('license-value').value = payment.price;
        document.getElementById('payment-method').value = payment.method === 'deuna' ? 'Deuna!' : (payment.method === 'paypal' ? 'PayPal' : 'Transferencia Bancaria');

        // Seleccionar tipo de licencia
        selectLicenseType(payment.licenseType);

        // Compilar contrato en pantalla
        compileContract();

        // 4. Ejecutar entrega por correo y generación de PDF
        await sendEmailDelivery();

        // 5. Actualizar estado del pago en Firestore
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'approved' });

        payment.status = 'approved';

        // 6. Restaurar el estado previo del formulario
        document.getElementById('beat-name').value = originalForm.beatName;
        document.getElementById('buyer-name').value = originalForm.buyerName;
        document.getElementById('buyer-email').value = originalForm.buyerEmail;
        document.getElementById('buyer-phone').value = originalForm.buyerPhone;
        document.getElementById('buyer-id').value = originalForm.buyerDni;
        document.getElementById('buyer-city').value = originalForm.buyerCity;
        document.getElementById('buyer-country').value = originalForm.buyerCountry;
        document.getElementById('ref-code').value = originalForm.refCode;
        document.getElementById('effective-date').value = originalForm.effectiveDate;
        document.getElementById('audio-link-mp3').value = originalForm.audioMp3;
        document.getElementById('audio-link-wav').value = originalForm.audioWav;
        document.getElementById('audio-link-stems').value = originalForm.audioStems;
        document.getElementById('license-value').value = originalForm.licenseValue;
        document.getElementById('payment-method').value = originalForm.paymentMethod;

        selectLicenseType(originalForm.licenseType);
        compileContract();

        showToast("¡Venta de beat aprobada y entregada con éxito!");
        loadSalesData();

    } catch (err) {
        console.error("Error al aprobar venta de beat:", err);
        showToast("Error al aprobar: " + err.message, true);
    }
};


async function rejectBeatSale(paymentId) {
    if (!confirm("¿Estás seguro de que deseas rechazar este pedido? Esto cancelará la transacción.")) {
        return;
    }
    try {
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'rejected' });
        showToast("Pedido rechazado.");
        loadSalesData();
    } catch (err) {
        console.error("Error al rechazar:", err);
        showToast("Error al rechazar: " + err.message, true);
    }
};


async function acceptExclusiveOffer(paymentId) {
    const payment = window.storePayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!confirm(`¿Aceptar la oferta exclusiva de $${payment.price} USD por "${payment.beatName}"? Se generará el contrato y se enviará al comprador.`)) {
        return;
    }

    try {
        // 1. Obtener datos del beat
        const beatDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId);
        const beatSnap = await getDoc(beatDocRef);
        let beatData = beatSnap.exists() ? beatSnap.data() : window.localBeats.find(b => b.id === payment.beatId);

        if (!beatData) {
            alert("Error: No se encontraron los datos del beat.");
            return;
        }

        // 2. Guardar formulario actual
        const originalForm = {
            beatName: document.getElementById('beat-name').value,
            buyerName: document.getElementById('buyer-name').value,
            buyerEmail: document.getElementById('buyer-email').value,
            buyerPhone: document.getElementById('buyer-phone').value,
            buyerDni: document.getElementById('buyer-id').value,
            buyerCity: document.getElementById('buyer-city').value,
            buyerCountry: document.getElementById('buyer-country').value,
            refCode: document.getElementById('ref-code').value,
            effectiveDate: document.getElementById('effective-date').value,
            audioMp3: document.getElementById('audio-link-mp3').value,
            audioWav: document.getElementById('audio-link-wav').value,
            audioStems: document.getElementById('audio-link-stems').value,
            licenseType: getActiveLicenseType(),
            licenseValue: document.getElementById('license-value').value,
            paymentMethod: document.getElementById('payment-method').value
        };

        // 3. Rellenar formulario con datos de la oferta aceptada
        document.getElementById('beat-name').value = payment.beatName;
        document.getElementById('buyer-name').value = payment.buyerName;
        document.getElementById('buyer-email').value = payment.buyerEmail;
        document.getElementById('buyer-phone').value = payment.buyerPhone || "";
        document.getElementById('buyer-id').value = payment.buyerDni || "";
        document.getElementById('buyer-city').value = payment.buyerCity || "";
        document.getElementById('buyer-country').value = payment.buyerCountry || "";
        document.getElementById('ref-code').value = payment.reference;
        document.getElementById('effective-date').value = payment.timestamp.split('T')[0];
        document.getElementById('audio-link-mp3').value = beatData.mp3 || "";
        document.getElementById('audio-link-wav').value = beatData.wav || "";
        document.getElementById('audio-link-stems').value = beatData.stems || "";
        document.getElementById('license-value').value = payment.price; // precio negociado
        document.getElementById('payment-method').value = 'Oferta Aceptada';

        // Seleccionar tipo de licencia (exclusiva)
        selectLicenseType('exclusive');

        // Compilar contrato y enviar
        compileContract();
        await sendEmailDelivery();

        // 4. Marcar como aprobado en Firestore
        const payDocRef = doc(db, "payments", paymentId);
        await updateDoc(payDocRef, { status: 'approved' });
        payment.status = 'approved';

        // 5. Restaurar formulario anterior
        document.getElementById('beat-name').value = originalForm.beatName;
        document.getElementById('buyer-name').value = originalForm.buyerName;
        document.getElementById('buyer-email').value = originalForm.buyerEmail;
        document.getElementById('buyer-phone').value = originalForm.buyerPhone;
        document.getElementById('buyer-id').value = originalForm.buyerDni;
        document.getElementById('buyer-city').value = originalForm.buyerCity;
        document.getElementById('buyer-country').value = originalForm.buyerCountry;
        document.getElementById('ref-code').value = originalForm.refCode;
        document.getElementById('effective-date').value = originalForm.effectiveDate;
        document.getElementById('audio-link-mp3').value = originalForm.audioMp3;
        document.getElementById('audio-link-wav').value = originalForm.audioWav;
        document.getElementById('audio-link-stems').value = originalForm.audioStems;
        document.getElementById('license-value').value = originalForm.licenseValue;
        document.getElementById('payment-method').value = originalForm.paymentMethod;
        selectLicenseType(originalForm.licenseType);
        compileContract();

        showToast("✅ Oferta exclusiva aceptada y contrato enviado al comprador.");
        loadSalesData();

    } catch (err) {
        console.error("Error al aceptar oferta exclusiva:", err);
        showToast("Error al aceptar oferta: " + err.message, true);
    }
};



// Bindings to global scope for backward compatibility
window.openSaleDetailsModal = openSaleDetailsModal;
window.approveBeatSale = approveBeatSale;
window.rejectBeatSale = rejectBeatSale;
window.acceptExclusiveOffer = acceptExclusiveOffer;

window.initSalesRealtimeListener = initSalesRealtimeListener;
window.updateSalesBadge = updateSalesBadge;
window.requestNotificationPermission = requestNotificationPermission;
window.loadSalesDataFallback = loadSalesDataFallback;
window.loadSalesData = loadSalesData;
window.renderSalesTable = renderSalesTable;
window.renderSalesStats = renderSalesStats;
