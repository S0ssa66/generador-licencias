import { LICENSE_CONFIGS } from '../config.js';
import { TRANSLATIONS } from '../i18n.js';
import { db, doc, updateDoc, deleteDoc, collection, getDocs, auth } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadScript = (...args) => window.loadScript(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const autoSaveContact = (...args) => window.autoSaveContact(...args);
const getActiveLicenseType = (...args) => window.getActiveLicenseType(...args);
const checkPlanLimitExceeded = (...args) => window.checkPlanLimitExceeded(...args);
const saveHistory = (...args) => window.saveHistory(...args);
const loadHistory = (...args) => window.loadHistory(...args);
const downloadPDF = (...args) => window.downloadPDF(...args);
const generatePreview = (...args) => window.generatePreview(...args);
const updateDashboardView = (...args) => window.updateDashboardView(...args);

let salesChartInstance = null;

function getLegacyUser() {
    let legacyUser = 'sossa';
    if (auth.currentUser && auth.currentUser.email) {
        const email = auth.currentUser.email.toLowerCase();
        if (email === 'beatscgmonarco@gmail.com') {
            legacyUser = 'cgmonarco';
        }
    }
    return legacyUser;
}

function saveCurrentLicenseToHistory(silent = false) {
    // Guardar contacto automáticamente
    autoSaveContact();

    const beatName = document.getElementById('beat-name').value.trim();
    const buyerName = document.getElementById('buyer-name').value.trim();
    const value = parseFloat(document.getElementById('license-value').value) || 0;
    const refCode = document.getElementById('ref-code').value.trim();
    const effectiveDate = document.getElementById('effective-date').value;
    const type = getActiveLicenseType();

    if (!buyerName) {
        if (silent !== true) {
            showToast('Por favor escribe el nombre de quien compra antes de guardar', true);
        }
        return;
    }

    const licenseData = {
        refCode,
        date: effectiveDate,
        beatName,
        buyerName,
        type,
        value,
        paymentMethod: document.getElementById('payment-method').value,
        audioLinks: {
            mp3: document.getElementById('audio-link-mp3').value.trim(),
            wav: document.getElementById('audio-link-wav').value.trim(),
            stems: document.getElementById('audio-link-stems').value.trim()
        },
        formData: {
            buyerId: document.getElementById('buyer-id').value.trim(),
            buyerEmail: document.getElementById('buyer-email').value.trim(),
            buyerPhone: document.getElementById('buyer-phone').value.trim(),
            buyerCity: document.getElementById('buyer-city').value.trim(),
            buyerCountry: document.getElementById('buyer-country').value.trim(),
            celebrationPlace: document.getElementById('celebration-place').value.trim(),
            formats: document.getElementById('clause-formats').value.trim(),
            streams: document.getElementById('clause-streams').value.trim(),
            physical: document.getElementById('clause-physical').value.trim(),
            videos: document.getElementById('clause-videos').value.trim(),
            videoDuration: document.getElementById('clause-video-duration').value.trim(),
            years: document.getElementById('clause-years').value.trim(),
            terminationFee: document.getElementById('clause-termination-fee').value.trim(),
            writerShare: document.getElementById('clause-writer-share').value,
            producerShare: document.getElementById('clause-producer-share').value,
            credits: document.getElementById('clause-credits').value.trim(),
            contentId: document.getElementById('clause-content-id').checked
        }
    };

    const isSilent = silent === true;

    // Verificar si ya existe una con ese mismo código de referencia para actualizarla
    const index = window.licenseHistory.findIndex(l => l.refCode === refCode);
    if (index !== -1) {
        window.licenseHistory[index] = licenseData;
        if (!isSilent) showToast('Licencia actualizada en el historial');
    } else {
        // Límite del Plan Inicial
        if (checkPlanLimitExceeded('guardar esta nueva licencia en el historial')) {
            return;
        }
        window.licenseHistory.unshift(licenseData);
        if (!isSilent) showToast('Licencia guardada en el historial');
    }

    saveHistory();
}

function updateHistoryTable() {
    const legacyUser = getLegacyUser();
    const tbody = document.getElementById('history-table-body');
    const emptyEl = document.getElementById('history-empty');
    const badgeEl = document.getElementById('history-count');
    const statsContainer = document.getElementById('history-stats-container');
    const mainLayout = document.getElementById('history-main-layout');
    
    tbody.innerHTML = '';
    badgeEl.textContent = window.licenseHistory.length;

    if (window.licenseHistory.length === 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = currentLang === 'es' ? 'No hay licencias registradas' : 'No licenses registered';
        emptyEl.querySelector('p').textContent = currentLang === 'es'
            ? 'Las licencias que guardes aparecerán en esta lista para descargarlas o copiarlas rápidamente.'
            : 'Saved licenses will appear in this list for quick download or copying.';
        if (mainLayout) mainLayout.style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    if (mainLayout) mainLayout.style.display = 'grid';

    if (statsContainer) {
        statsContainer.style.display = 'grid';
        const totalCollected = window.licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
        document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
        document.getElementById('stat-total-licenses').textContent = window.licenseHistory.length;
        const avg = window.licenseHistory.length > 0 ? (totalCollected / window.licenseHistory.length) : 0;
        document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;

        // ── Promedio Mensual ─────────────────────────────────────────────
        const monthlyMap = {};
        window.licenseHistory.forEach(lic => {
            if (!lic.date) return;
            const monthKey = lic.date.slice(0, 7); // "2026-04"
            if (!monthlyMap[monthKey]) monthlyMap[monthKey] = 0;
            monthlyMap[monthKey] += Number(lic.value) || 0;
        });
        const activeMonths = Object.keys(monthlyMap).length;
        const monthlyAvg = activeMonths > 0 ? (totalCollected / activeMonths) : 0;
        const monthlyAvgEl = document.getElementById('stat-monthly-avg');
        const monthlyMonthsEl = document.getElementById('stat-monthly-months');
        if (monthlyAvgEl) monthlyAvgEl.textContent = `$${monthlyAvg.toFixed(2)}`;
        if (monthlyMonthsEl) {
            if (currentLang === 'es') {
                monthlyMonthsEl.textContent = activeMonths === 1 ? '1 mes activo' : `${activeMonths} meses activos`;
            } else {
                monthlyMonthsEl.textContent = activeMonths === 1 ? '1 active month' : `${activeMonths} active months`;
            }
        }

        // ── Renderizar Gráfico de Ventas (Chart.js) ──────────────────────
        const chartContainer = document.getElementById('history-chart-container');
        if (chartContainer) {
            chartContainer.style.display = 'block';
            (async () => {
                try {
                    if (typeof Chart === 'undefined') {
                        await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js');
                    }
                    const ctx = document.getElementById('salesChart').getContext('2d');
                    
                    // Ordenar cronológicamente
                    const sortedMonths = Object.keys(monthlyMap).sort();
                    const dataValues = sortedMonths.map(m => monthlyMap[m]);
                    
                    // Formatear etiquetas de mes (ej. "2026-04" -> "Abr 2026")
                    const labels = sortedMonths.map(m => {
                        const [year, month] = m.split('-');
                        const date = new Date(year, parseInt(month) - 1);
                        return date.toLocaleDateString(currentLang === 'es' ? 'es-ES' : 'en-US', { month: 'short', year: 'numeric' });
                    });

                    if (salesChartInstance) {
                        salesChartInstance.data.labels = labels;
                        salesChartInstance.data.datasets[0].data = dataValues;
                        salesChartInstance.data.datasets[0].label = currentLang === 'es' ? 'Ingresos Mensuales ($)' : 'Monthly Revenue ($)';
                        salesChartInstance.update();
                    } else {
                        salesChartInstance = new Chart(ctx, {
                            type: 'line',
                            data: {
                                labels: labels,
                                datasets: [{
                                    label: currentLang === 'es' ? 'Ingresos Mensuales ($)' : 'Monthly Revenue ($)',
                                    data: dataValues,
                                    borderColor: '#00e676',
                                    backgroundColor: 'rgba(0, 230, 118, 0.2)',
                                    borderWidth: 2,
                                    fill: true,
                                    tension: 0.4
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                scales: {
                                    y: {
                                        beginAtZero: true,
                                        ticks: {
                                            callback: function(value) {
                                                return '$' + value;
                                            }
                                        }
                                    }
                                },
                                plugins: {
                                    legend: {
                                        display: false
                                    }
                                }
                            }
                        });
                    }
                } catch (e) {
                    console.error("Error al renderizar el gráfico de ventas:", e);
                }
            })();
        }
    }

    window.licenseHistory.forEach(lic => {
        const tr = document.createElement('tr');

        const typeLabels = currentLang === 'es' ? {
            basic: 'Básica',
            premium: 'Premium',
            premium_plus: 'Prem. Plus',
            unlimited_flp: 'Ilim. + FLP',
            unlimited: 'Ilimitada',
            exclusive: 'Exclusiva'
        } : {
            basic: 'Basic',
            premium: 'Premium',
            premium_plus: 'Prem. Plus',
            unlimited_flp: 'Unlim. + FLP',
            unlimited: 'Unlimited',
            exclusive: 'Exclusive'
        };
        const typeKey = lic.type || 'basic';
        const licenseValue = Number(lic.value) || 0;
        tr.dataset.value = licenseValue;

        // Sanitize: usar textContent para datos de usuario, evitar XSS
        const refCode = lic.refCode || '';
        const date    = lic.date || '';
        const beat    = lic.beatName || '';
        const buyer   = lic.buyerName || '';

        const tdRef   = document.createElement('td'); tdRef.dataset.label = currentLang === 'es' ? 'Referencia' : 'Reference';
        const spanRef = document.createElement('span'); spanRef.className = 'ref-code-cell'; spanRef.title = refCode; spanRef.textContent = refCode;
        tdRef.appendChild(spanRef);

        const tdDate = document.createElement('td'); tdDate.dataset.label = currentLang === 'es' ? 'Fecha' : 'Date'; tdDate.textContent = date;
        const tdBeat = document.createElement('td'); tdBeat.dataset.label = currentLang === 'es' ? 'Beat' : 'Beat';
        const strongBeat = document.createElement('strong'); strongBeat.textContent = beat; tdBeat.appendChild(strongBeat);
        const tdBuyer = document.createElement('td'); tdBuyer.dataset.label = currentLang === 'es' ? 'Comprador' : 'Buyer'; tdBuyer.textContent = buyer;

        const tdType  = document.createElement('td'); tdType.dataset.label = currentLang === 'es' ? 'Tipo' : 'Type';
        const spanType = document.createElement('span'); spanType.className = `type-badge ${typeKey}`; spanType.textContent = typeLabels[typeKey] || typeKey;
        tdType.appendChild(spanType);

        const tdValue = document.createElement('td'); tdValue.dataset.label = currentLang === 'es' ? 'Valor' : 'Value'; tdValue.textContent = `$${licenseValue.toFixed(2)}`;

        // --- Celda Facturación SRI ---
        const tdSri = document.createElement('td');
        tdSri.dataset.label = currentLang === 'es' ? 'Facturación SRI' : 'SRI Invoicing';
        
        const sriContainer = document.createElement('div');
        sriContainer.className = 'sri-container';
        
        const sriEstado = lic.sriEstado || '';
        const sriError = lic.sriErrorMensaje || '';
        
        if (sriEstado === 'AUTORIZADO') {
            const badge = document.createElement('span');
            badge.className = 'sri-badge autorizado';
            badge.textContent = currentLang === 'es' ? 'AUTORIZADO' : 'AUTHORIZED';
            sriContainer.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            
            // Botón RIDE PDF
            const btnRide = document.createElement('a');
            btnRide.className = 'btn-sri-action';
            const rideUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `/api/payments/download-ride?paymentId=${lic.id || lic.refCode || lic.reference}&user=${legacyUser}`
                : `http://localhost:8000/api/payments/download-ride?paymentId=${lic.id || lic.refCode || lic.reference}&user=${legacyUser}`;
            btnRide.href = rideUrl;
            btnRide.target = '_blank';
            btnRide.title = currentLang === 'es' ? 'Descargar RIDE PDF' : 'Download RIDE PDF';
            btnRide.innerHTML = `<i data-lucide="file-text"></i> PDF`;
            actions.appendChild(btnRide);
            
            // Botón XML
            const btnXml = document.createElement('a');
            btnXml.className = 'btn-sri-action';
            const xmlUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `/api/payments/download-xml?paymentId=${lic.id || lic.refCode || lic.reference}&user=${legacyUser}`
                : `http://localhost:8000/api/payments/download-xml?paymentId=${lic.id || lic.refCode || lic.reference}&user=${legacyUser}`;
            btnXml.href = xmlUrl;
            btnXml.target = '_blank';
            btnXml.title = currentLang === 'es' ? 'Descargar XML Autorizado' : 'Download Authorized XML';
            btnXml.innerHTML = `<i data-lucide="code"></i> XML`;
            actions.appendChild(btnXml);
            
            sriContainer.appendChild(actions);
        } else if (sriEstado === 'PENDIENTE') {
            const badge = document.createElement('span');
            badge.className = 'sri-badge pendiente';
            badge.textContent = currentLang === 'es' ? 'PROCESANDO' : 'PROCESSING';
            sriContainer.appendChild(badge);
        } else if (sriEstado.startsWith('ERROR_') || sriEstado.startsWith('RECHAZADO_')) {
            const badge = document.createElement('span');
            badge.className = 'sri-badge fallido tooltip-left';
            badge.textContent = currentLang === 'es' ? 'FALLIDO' : 'FAILED';
            badge.title = sriError || sriEstado;
            sriContainer.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            
            const btnRetry = document.createElement('button');
            btnRetry.className = 'btn-sri-action btn-sri-retry';
            btnRetry.dataset.id = lic.id || lic.refCode;
            btnRetry.title = currentLang === 'es' ? 'Reemitir Factura' : 'Reissue Invoice';
            btnRetry.innerHTML = `<i data-lucide="refresh-cw"></i> ${currentLang === 'es' ? 'Reemitir' : 'Retry'}`;
            actions.appendChild(btnRetry);
            
            sriContainer.appendChild(actions);
        } else {
            const badge = document.createElement('span');
            badge.className = 'sri-badge no-emitida';
            badge.textContent = currentLang === 'es' ? 'NO EMITIDA' : 'NOT ISSUED';
            sriContainer.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            
            const btnRetry = document.createElement('button');
            btnRetry.className = 'btn-sri-action btn-sri-retry';
            btnRetry.dataset.id = lic.id || lic.refCode;
            btnRetry.title = currentLang === 'es' ? 'Emitir Factura' : 'Issue Invoice';
            btnRetry.innerHTML = `<i data-lucide="plus"></i> ${currentLang === 'es' ? 'Generar' : 'Generate'}`;
            actions.appendChild(btnRetry);
            
            sriContainer.appendChild(actions);
        }
        tdSri.appendChild(sriContainer);

        const tdActions = document.createElement('td'); tdActions.className = 'actions-cell';
        const safeRef = refCode.replace(/"/g, '&quot;');
        
        const titleLoad = currentLang === 'es' ? 'Cargar en el editor' : 'Load into editor';
        const titlePdf = currentLang === 'es' ? 'Descargar PDF' : 'Download PDF';
        const titleDelete = currentLang === 'es' ? 'Eliminar' : 'Delete';

        tdActions.innerHTML = `
            <button class="btn-icon-only btn-row-load" data-ref="${safeRef}" title="${titleLoad}"><i data-lucide="edit-3"></i></button>
            <button class="btn-icon-only btn-row-pdf" data-ref="${safeRef}" title="${titlePdf}"><i data-lucide="file-text"></i></button>
            <button class="btn-icon-only btn-row-delete text-danger tooltip-left" data-ref="${safeRef}" title="${titleDelete}"><i data-lucide="trash-2"></i></button>
        `;

        tr.appendChild(tdRef); tr.appendChild(tdDate); tr.appendChild(tdBeat);
        tr.appendChild(tdBuyer); tr.appendChild(tdType); tr.appendChild(tdValue);
        tr.appendChild(tdSri);
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    safeCreateIcons();
    setupHistoryRowEvents();
    initTooltips();
}

function setupHistoryRowEvents() {
    // Cargar en el editor
    document.querySelectorAll('.btn-row-load').forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.dataset.ref;
            const lic = window.licenseHistory.find(l => l.refCode === ref);
            if (lic) {
                loadLicenseIntoEditor(lic);
                // Cambiar a la pestaña de previsualización
                document.querySelector('.tab-btn[data-tab="tab-preview"]').click();
                const msg = currentLang === 'es'
                    ? `Licencia ${lic.refCode} cargada en el editor`
                    : `License ${lic.refCode} loaded into editor`;
                showToast(msg);
            }
        });
    });

    // Descargar PDF del historial directamente
    document.querySelectorAll('.btn-row-pdf').forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.dataset.ref;
            const lic = window.licenseHistory.find(l => l.refCode === ref);
            if (lic) {
                // Cargar temporalmente, generar y descargar
                loadLicenseIntoEditor(lic);
                downloadPDF();
            }
        });
    });

    // Eliminar fila
    document.querySelectorAll('.btn-row-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const ref = btn.dataset.ref;
            const confirmMsg = currentLang === 'es' 
                ? `¿Estás seguro de eliminar la licencia con referencia ${ref}?` 
                : `Are you sure you want to delete the license with reference ${ref}?`;
            if (confirm(confirmMsg)) {
                window.licenseHistory = window.licenseHistory.filter(l => l.refCode !== ref);
                saveHistory();
                const msg = currentLang === 'es'
                    ? 'Licencia eliminada del historial'
                    : 'License deleted from history';
                showToast(msg);

                // Eliminar de Firestore
                if (ref) {
                    try {
                        const licDocRef = doc(db, "users", window.currentUser, "licencias", ref);
                        await deleteDoc(licDocRef);
                    } catch (err) {
                        console.error("Error al eliminar licencia de Firestore:", err);
                    }
                }
            }
        });
    });

    // Evento Reemitir / Generar Factura SRI
    document.querySelectorAll('.btn-sri-retry').forEach(btn => {
        btn.addEventListener('click', async () => {
            const paymentId = btn.dataset.id;
            const legacyUser = getLegacyUser();
            const producerId = window.currentUser || legacyUser;
            
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="refresh-cw" class="animate-spin" style="width: 12px; height: 12px; margin-right: 4px;"></i>...`;
            
            const initMsg = currentLang === 'es'
                ? 'Iniciando proceso de facturación con el SRI...'
                : 'Starting billing process with the SRI...';
            showToast(initMsg);
            
            try {
                const localApiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                    ? '/api/payments/retry-sri'
                    : 'http://localhost:8000/api/payments/retry-sri';
                const localHeaders = window.getLocalHeaders ? await window.getLocalHeaders() : {};
                const response = await fetch(localApiUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        ...localHeaders
                    },
                    body: JSON.stringify({ paymentId, producerId })
                });
                
                const result = await response.json();
                if (response.ok) {
                    const successMsg = currentLang === 'es'
                        ? 'Facturación iniciada. El estado se actualizará en segundos.'
                        : 'Billing started. The status will update in a few seconds.';
                    showToast(successMsg);
                    
                    // Cambiar a PENDIENTE localmente para actualizar la UI de inmediato e ignorar el estado fallido anterior en el polling
                    const localLic = window.licenseHistory.find(l => (l.id && l.id === paymentId) || (l.refCode && l.refCode === paymentId));
                    if (localLic) {
                        localLic.sriEstado = 'PENDIENTE';
                        localLic.sriErrorMensaje = '';
                        updateHistoryTable();
                    }
                    
                    // Polling para actualizar el estado del SRI de forma fluida
                    let pollCount = 0;
                    const intervalId = setInterval(async () => {
                        pollCount++;
                        await reloadHistoryFromLocalServer();
                        
                        const currentLic = window.licenseHistory.find(l => (l.id && l.id === paymentId) || (l.refCode && l.refCode === paymentId));
                        if (!currentLic || currentLic.sriEstado === 'AUTORIZADO' || (currentLic.sriEstado && currentLic.sriEstado !== 'PENDIENTE' && (currentLic.sriEstado.startsWith('ERROR_') || currentLic.sriEstado.startsWith('RECHAZADO_'))) || pollCount >= 10) {
                            clearInterval(intervalId);
                        }
                    }, 2000);
                } else {
                    const errMsg = result.error || (currentLang === 'es' ? 'Error desconocido' : 'Unknown error');
                    showToast(`❌ Error: ${errMsg}`, 'error');
                    btn.disabled = false;
                    btn.innerHTML = `<i data-lucide="refresh-cw"></i> ${currentLang === 'es' ? 'Reemitir' : 'Retry'}`;
                    safeCreateIcons();
                }
            } catch (err) {
                console.error("Error al reemitir factura:", err);
                showToast(`❌ Error: ${err.message}`, 'error');
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="refresh-cw"></i> ${currentLang === 'es' ? 'Reemitir' : 'Retry'}`;
                safeCreateIcons();
            }
        });
    });

    // Sincronizar y actualizar el dashboard de ventas
    updateDashboardView();
}

async function reloadHistoryFromLocalServer() {
    try {
        const legacyUser = getLegacyUser();
        const user = window.currentUser || legacyUser;
        const localApiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? `/api/load-local?user=${legacyUser}`
            : `http://localhost:8000/api/load-local?user=${legacyUser}`;
        const headers = window.getLocalHeaders ? await window.getLocalHeaders() : {};
        const res = await fetch(localApiUrl, { headers: headers });
        if (res.ok) {
            const backupData = await res.json();
            const historyStr = backupData[`${user}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]';
            localStorage.setItem(`${user}_license_history`, historyStr);
            window.licenseHistory = JSON.parse(historyStr);
            updateHistoryTable();
        }
    } catch (e) {
        console.error("Error al recargar desde el servidor local:", e);
    }
}

function loadLicenseIntoEditor(lic) {
    // Activar botón de tipo de licencia correspondiente
    document.querySelectorAll('.license-btn').forEach(btn => {
        if (btn.dataset.type === lic.type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    const fd = lic.formData || {};

    // Llenar inputs principales
    document.getElementById('beat-name').value = lic.beatName || "";
    document.getElementById('buyer-name').value = lic.buyerName || "";
    document.getElementById('buyer-email').value = fd.buyerEmail || lic.buyerEmail || "";
    document.getElementById('buyer-phone').value = fd.buyerPhone || lic.buyerPhone || "";
    document.getElementById('buyer-id').value = fd.buyerId || lic.buyerId || "";
    document.getElementById('license-value').value = lic.value !== undefined ? lic.value : 29.99;
    document.getElementById('buyer-city').value = fd.buyerCity || lic.buyerCity || "";
    document.getElementById('buyer-country').value = fd.buyerCountry || lic.buyerCountry || "Ecuador";
    document.getElementById('ref-code').value = lic.refCode || "";
    document.getElementById('effective-date').value = lic.date || "";
    document.getElementById('celebration-place').value = fd.celebrationPlace || lic.celebrationPlace || "";
    document.getElementById('payment-method').value = lic.paymentMethod || "Transferencia Bancaria";

    // Llenar enlaces de audio
    const al = lic.audioLinks || {};
    document.getElementById('audio-link-mp3').value = al.mp3 || "";
    document.getElementById('audio-link-wav').value = al.wav || "";
    document.getElementById('audio-link-stems').value = al.stems || "";

    // Llenar avanzados
    document.getElementById('clause-formats').value = fd.formats || "";
    document.getElementById('clause-streams').value = fd.streams || "";
    document.getElementById('clause-physical').value = fd.physical || "";
    document.getElementById('clause-videos').value = fd.videos || "";
    document.getElementById('clause-video-duration').value = fd.videoDuration || "";
    document.getElementById('clause-years').value = fd.years || "";
    document.getElementById('clause-termination-fee').value = fd.terminationFee || "";
    document.getElementById('clause-writer-share').value = fd.writerShare !== undefined ? fd.writerShare : 50;
    document.getElementById('clause-producer-share').value = fd.producerShare !== undefined ? fd.producerShare : 50;
    document.getElementById('clause-credits').value = fd.credits || "";
    document.getElementById('clause-content-id').checked = fd.contentId !== undefined ? fd.contentId : true;

    generatePreview();
}

async function clearAllHistory() {
    if (confirm('¿Estás seguro de que deseas eliminar todo el historial?')) {
        try { localStorage.removeItem(`${window.currentUser}_license_history`); } catch(e) {}
        
        // Eliminar todos de Firestore en users/{uid}/licencias
        const colRef = collection(db, "users", window.currentUser, "licencias");
        try {
            const querySnapshot = await getDocs(colRef);
            const deletePromises = [];
            querySnapshot.forEach((docSnap) => {
                deletePromises.push(deleteDoc(docSnap.ref));
            });
            await Promise.all(deletePromises);
        } catch (err) {
            console.error("Error al borrar historial en Firestore:", err);
        }
        
        window.licenseHistory = [];
        await loadHistory(); // reinyecta semillas solo para sossa
        showToast('Historial borrado con éxito.');
    }
}

function filterHistory(e) {
    const query = e.target.value.toLowerCase().trim();
    const rows = document.querySelectorAll('#history-table-body tr');
    let matches = 0;
    let filteredTotal = 0;

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const value = Number(row.dataset.value) || 0;
        if (text.includes(query)) {
            row.style.display = 'table-row';
            matches++;
            filteredTotal += value;
        } else {
            row.style.display = 'none';
        }
    });

    const tableEl = document.querySelector('.history-table');
    const emptyEl = document.getElementById('history-empty');
    const statsContainer = document.getElementById('history-stats-container');

    // Actualizar tarjetas de estadísticas en base al filtro en tiempo real
    if (statsContainer && window.licenseHistory.length > 0) {
        if (query !== '') {
            document.getElementById('stat-total-collected').textContent = `$${filteredTotal.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = `${matches} (filtradas)`;
            const avg = matches > 0 ? (filteredTotal / matches) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        } else {
            const totalCollected = window.licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
            document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = window.licenseHistory.length;
            const avg = window.licenseHistory.length > 0 ? (totalCollected / window.licenseHistory.length) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        }
    }

    if (matches === 0 && window.licenseHistory.length > 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = 'No se encontraron resultados';
        emptyEl.querySelector('p').textContent = 'Prueba con otra palabra clave o limpia el buscador.';
        tableEl.style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
    } else if (window.licenseHistory.length > 0) {
        emptyEl.style.display = 'none';
        tableEl.style.display = 'table';
        if (statsContainer) statsContainer.style.display = 'grid';
    }
}

function exportHistoryToCSV() {
    if (window.licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    
    // Cabecera del CSV con BOM UTF-8 para compatibilidad de acentos en Excel
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Referencia,Fecha,Beat,Comprador,Cedula DNI,Email,Telefono,Ciudad,Pais,Tipo Licencia,Valor USD,Metodo Pago\r\n";
    
    window.licenseHistory.forEach(lic => {
        const fd = lic.formData || {};
        const beatName = lic.beatName || "";
        const buyerName = lic.buyerName || "";
        const type = lic.type || "basic";
        const val = lic.value !== undefined ? lic.value : 0;

        const row = [
            lic.refCode || "",
            lic.date || "",
            `"${beatName.replace(/"/g, '""')}"`,
            `"${buyerName.replace(/"/g, '""')}"`,
            `"${(fd.buyerId || lic.buyerId || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerEmail || lic.buyerEmail || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerPhone || lic.buyerPhone || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerCity || lic.buyerCity || '').replace(/"/g, '""')}"`,
            `"${(fd.buyerCountry || lic.buyerCountry || '').replace(/"/g, '""')}"`,
            type.toUpperCase(),
            val,
            lic.paymentMethod || "Transferencia Bancaria"
        ].join(",");
        csvContent += row + "\r\n";
    });
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Contabilidad_Licencias_${window.producerConfig.aka}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Historial exportado para Excel con éxito');
}

function exportHistoryToJSON() {
    if (window.licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    const jsonStr = JSON.stringify(window.licenseHistory, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Historial_Licencias_${window.producerConfig.aka}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Historial exportado como JSON con éxito');
}


// Bindings to global scope for backward compatibility
window.saveCurrentLicenseToHistory = saveCurrentLicenseToHistory;
window.updateHistoryTable = updateHistoryTable;
window.setupHistoryRowEvents = setupHistoryRowEvents;
window.loadLicenseIntoEditor = loadLicenseIntoEditor;
window.clearAllHistory = clearAllHistory;
window.filterHistory = filterHistory;
window.exportHistoryToCSV = exportHistoryToCSV;
window.exportHistoryToJSON = exportHistoryToJSON;
