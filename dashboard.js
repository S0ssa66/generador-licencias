import { LICENSE_CONFIGS } from './config.js';
import { TRANSLATIONS } from './i18n.js';
import { 
    auth,
    onSnapshot,
    db, 
    collection, 
    getDocs, 
    getDoc, 
    doc, 
    setDoc, 
    addDoc, 
    deleteDoc, 
    collectionGroup, 
    query, 
    where,
    updateDoc
} from "./firebase.js";

// Alias locales para funciones en otros módulos asignadas al objeto global window
const getActiveLicenseType = (...args) => window.getActiveLicenseType(...args);
const checkPlanLimitExceeded = (...args) => window.checkPlanLimitExceeded(...args);
const saveHistory = (...args) => window.saveHistory(...args);
const loadHistory = (...args) => window.loadHistory(...args);
const downloadPDF = (...args) => window.downloadPDF(...args);
const selectLicenseType = (...args) => window.selectLicenseType(...args);
const compileContract = (...args) => window.compileContract(...args);
const sendEmailDelivery = (...args) => window.sendEmailDelivery(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
const safeGetItem = (...args) => window.safeGetItem(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);
const initTooltips = (...args) => window.initTooltips(...args);

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

let salesChartInstance = null;


// ==================== DASHBOARD BLOCK 1 ====================
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
    const index = licenseHistory.findIndex(l => l.refCode === refCode);
    if (index !== -1) {
        licenseHistory[index] = licenseData;
        if (!isSilent) showToast('Licencia actualizada en el historial');
    } else {
        // Límite del Plan Inicial
        if (checkPlanLimitExceeded('guardar esta nueva licencia en el historial')) {
            return;
        }
        licenseHistory.unshift(licenseData);
        if (!isSilent) showToast('Licencia guardada en el historial');
    }

    saveHistory();
}

// Actualizar tabla del historial
function updateHistoryTable() {
    const tbody = document.getElementById('history-table-body');
    const emptyEl = document.getElementById('history-empty');
    const badgeEl = document.getElementById('history-count');
    const statsContainer = document.getElementById('history-stats-container');
    
    tbody.innerHTML = '';
    badgeEl.textContent = licenseHistory.length;

    if (licenseHistory.length === 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = currentLang === 'es' ? 'No hay licencias registradas' : 'No licenses registered';
        emptyEl.querySelector('p').textContent = currentLang === 'es'
            ? 'Las licencias que guardes aparecerán en esta lista para descargarlas o copiarlas rápidamente.'
            : 'Saved licenses will appear in this list for quick download or copying.';
        document.querySelector('.history-table').style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
        return;
    }

    emptyEl.style.display = 'none';
    document.querySelector('.history-table').style.display = 'table';

    if (statsContainer) {
        statsContainer.style.display = 'grid';
        const totalCollected = licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
        document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
        document.getElementById('stat-total-licenses').textContent = licenseHistory.length;
        const avg = licenseHistory.length > 0 ? (totalCollected / licenseHistory.length) : 0;
        document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;

        // ── Promedio Mensual ─────────────────────────────────────────────
        const monthlyMap = {};
        licenseHistory.forEach(lic => {
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

    licenseHistory.forEach(lic => {
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
        tr.appendChild(tdBuyer); tr.appendChild(tdType); tr.appendChild(tdValue); tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });

    safeCreateIcons();
    setupHistoryRowEvents();
    initTooltips();
}

// Eventos para botones dentro del historial
function setupHistoryRowEvents() {
    // Cargar en el editor
    document.querySelectorAll('.btn-row-load').forEach(btn => {
        btn.addEventListener('click', () => {
            const ref = btn.dataset.ref;
            const lic = licenseHistory.find(l => l.refCode === ref);
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
            const lic = licenseHistory.find(l => l.refCode === ref);
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
                licenseHistory = licenseHistory.filter(l => l.refCode !== ref);
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

    // Sincronizar y actualizar el dashboard de ventas
    updateDashboardView();
}

// Cargar datos de licencia al editor
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

// Borrar todo el historial
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
        
        licenseHistory = [];
        await loadHistory(); // reinyecta semillas solo para sossa
        showToast('Historial borrado con éxito.');
    }
}

// Filtrar historial por texto (búsqueda)
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
    if (statsContainer && licenseHistory.length > 0) {
        if (query !== '') {
            document.getElementById('stat-total-collected').textContent = `$${filteredTotal.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = `${matches} (filtradas)`;
            const avg = matches > 0 ? (filteredTotal / matches) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        } else {
            const totalCollected = licenseHistory.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
            document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
            document.getElementById('stat-total-licenses').textContent = licenseHistory.length;
            const avg = licenseHistory.length > 0 ? (totalCollected / licenseHistory.length) : 0;
            document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;
        }
    }

    if (matches === 0 && licenseHistory.length > 0) {
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = 'No se encontraron resultados';
        emptyEl.querySelector('p').textContent = 'Prueba con otra palabra clave o limpia el buscador.';
        tableEl.style.display = 'none';
        if (statsContainer) statsContainer.style.display = 'none';
    } else if (licenseHistory.length > 0) {
        emptyEl.style.display = 'none';
        tableEl.style.display = 'table';
        if (statsContainer) statsContainer.style.display = 'grid';
    }
}


// ==================== DASHBOARD BLOCK 2 ====================

// Exportar historial de licencias a formato CSV para Excel
function exportHistoryToCSV() {
    if (licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    
    // Cabecera del CSV con BOM UTF-8 para compatibilidad de acentos en Excel
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "Referencia,Fecha,Beat,Comprador,Cedula DNI,Email,Telefono,Ciudad,Pais,Tipo Licencia,Valor USD,Metodo Pago\r\n";
    
    licenseHistory.forEach(lic => {
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
    link.setAttribute("download", `Contabilidad_Licencias_${producerConfig.aka}_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Historial exportado para Excel con éxito');
}

// Exportar historial completo como JSON (backup)
function exportHistoryToJSON() {
    if (licenseHistory.length === 0) {
        showToast('No hay licencias en el historial para exportar', true);
        return;
    }
    const jsonStr = JSON.stringify(licenseHistory, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Historial_Licencias_${producerConfig.aka}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Historial exportado como JSON con éxito');
}

// Guardar automáticamente el comprador actual como contacto en localStorage
// Cargar contactos desde Firestore
async function loadContacts() {
    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUserIsPro) {
        try {
            const colRef = collection(db, "users", window.currentUser, "contacts");
            const querySnapshot = await getDocs(colRef);
            querySnapshot.forEach((docSnap) => {
                savedList.push(docSnap.data());
            });
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar contactos de Firestore:", err);
        }
    }

    let localList = [];
    try {
        const saved = localStorage.getItem(`${window.currentUser}_contacts`);
        if (saved) {
            localList = JSON.parse(saved);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    let mergedList = [...savedList];
    let needsSaveToFirestore = false;

    localList.forEach(localCont => {
        if (localCont && localCont.email) {
            const exists = mergedList.some(c => c.email && c.email.toLowerCase() === localCont.email.toLowerCase());
            if (!exists) {
                mergedList.push(localCont);
                needsSaveToFirestore = true;
            }
        }
    });

    contactsList = mergedList;

    if (needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
        if (firestoreLoaded && window.currentUserIsPro) {
            console.log("Subiendo contactos locales combinados a Firestore...");
            for (const cont of contactsList) {
                if (!cont.email) continue;
                try {
                    const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
                    const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                    await setDoc(contDocRef, cont);
                } catch (err) {
                    console.error("Error al guardar contacto en Firestore:", err);
                }
            }
        }
    }
}

// Guardar automáticamente el comprador actual como contacto
async function autoSaveContact() {
    const name = document.getElementById('buyer-name').value.trim();
    const email = document.getElementById('buyer-email').value.trim();
    const id = document.getElementById('buyer-id').value.trim();
    const phone = document.getElementById('buyer-phone').value.trim();
    const city = document.getElementById('buyer-city').value.trim();
    const country = document.getElementById('buyer-country').value.trim();

    // Solo guardar si se provee nombre y correo electrónico
    if (!name || !email) return;

    const contactData = {
        name,
        email,
        id,
        phone,
        city,
        country,
        updatedAt: Date.now()
    };

    const index = contactsList.findIndex(c => c.email.toLowerCase() === email.toLowerCase());

    if (index !== -1) {
        contactsList[index] = { ...contactsList[index], ...contactData };
    } else {
        contactsList.push(contactData);
    }

    try {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
    } catch (e) {
        console.error('Error al guardar contactos localmente:', e);
    }

    if (!window.currentUserIsPro) return;

    // Guardar en Firestore: coleccion users/{uid}/contacts con email sanitizado como documentID
    const contactId = email.toLowerCase().replace(/[/.]/g, '_');
    try {
        const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
        await setDoc(docRef, contactData);
    } catch (err) {
        console.error("Error al guardar contacto en Firestore:", err);
    }
}

// Abrir modal de contactos
function openContactsModal() {
    document.getElementById('contacts-modal').style.display = 'flex';
    document.getElementById('search-contacts').value = '';
    renderContactsTable();
}

// Cerrar modal de contactos
function closeContactsModal() {
    document.getElementById('contacts-modal').style.display = 'none';
}

// Cargar y mostrar contactos en la tabla del modal
function renderContactsTable() {
    const searchQuery = document.getElementById('search-contacts').value.toLowerCase().trim();
    let contacts = [...contactsList];

    // Ordenar por fecha de actualización descendente (últimos modificados primero)
    contacts.sort((a, b) => b.updatedAt - a.updatedAt);

    // Filtrar si hay búsqueda
    if (searchQuery) {
        contacts = contacts.filter(c => 
            c.name.toLowerCase().includes(searchQuery) ||
            c.email.toLowerCase().includes(searchQuery) ||
            (c.id && c.id.includes(searchQuery))
        );
    }

    // Actualizar cantidad en la etiqueta
    document.getElementById('contacts-count-label').textContent = `${contacts.length} contacto(s) guardado(s)`;

    const tbody = document.getElementById('contacts-table-body');
    tbody.innerHTML = '';

    if (contacts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="padding: 20px; text-align: center; color: #718096;">
                    No se encontraron contactos.
                </td>
            </tr>
        `;
        return;
    }

    contacts.forEach(contact => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2e39';
        tr.style.cursor = 'pointer';
        
        // Al hacer clic en la fila se selecciona el contacto (excepto si hace clic en eliminar)
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.delete-contact-btn')) return;
            selectContact(contact);
        });

        tr.innerHTML = `
            <td style="padding: 10px 10px;">
                <div style="font-weight: bold; color: #fff;">${contact.name}</div>
                <div style="font-size: 11px; color: #718096;">Cédula/DNI: ${contact.id || 'N/A'}</div>
            </td>
            <td style="padding: 10px 10px;">
                <div style="color: #cbd5e0;">${contact.email}</div>
                <div style="font-size: 11px; color: #718096;">Telf: ${contact.phone || 'N/A'}</div>
            </td>
            <td style="padding: 10px 10px; text-align: right; white-space: nowrap;">
                <button class="btn btn-secondary contact-action-btn select-contact-btn" title="Seleccionar" style="padding: 4px 8px; font-size: 12px; margin-right: 4px; background-color: #2d3748; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn btn-danger-outline contact-action-btn delete-contact-btn" data-email="${contact.email}" title="Eliminar" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        
        tr.querySelector('.select-contact-btn').addEventListener('click', () => {
            selectContact(contact);
        });

        tr.querySelector('.delete-contact-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteContact(contact.email);
        });

        tbody.appendChild(tr);
    });

    safeCreateIcons();
    initTooltips();
}

// Seleccionar un contacto y rellenar el formulario
function selectContact(contact) {
    document.getElementById('buyer-name').value = contact.name || '';
    document.getElementById('buyer-email').value = contact.email || '';
    document.getElementById('buyer-id').value = contact.id || '';
    document.getElementById('buyer-phone').value = contact.phone || '';
    document.getElementById('buyer-city').value = contact.city || '';
    document.getElementById('buyer-country').value = contact.country || 'Ecuador';
    
    // Regenerar la previsualización
    generatePreview();
    
    // Cerrar modal
    closeContactsModal();
    showToast(`Contacto "${contact.name}" cargado con éxito`);
}

// Eliminar un contacto
async function deleteContact(email) {
    if (confirm(`¿Estás seguro de que deseas eliminar este contacto (${email})?`)) {
        contactsList = contactsList.filter(c => c.email.toLowerCase() !== email.toLowerCase());

        try {
            safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
            renderContactsTable();
            showToast('Contacto eliminado');
        } catch (e) {
            console.error(e);
        }

        // Delete from Firestore
        const contactId = email.toLowerCase().replace(/[/.]/g, '_');
        try {
            const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
            await deleteDoc(docRef);
        } catch (err) {
            console.error("Error al eliminar contacto de Firestore:", err);
        }
    }
}

// Cargar la contabilidad consolidada de todos los productores (Sossa Admin)
async function loadConsolidatedAccounting() {
    if (!window.currentUserIsAdmin) return;
    
    // Cargar también las solicitudes de pago pendientes
    await loadPendingPaymentsAdmin();
    
    // Cargar también los códigos VIP
    await loadVipCodesAdmin();
    
    const tbody = document.getElementById('admin-table-body');
    const emptyEl = document.getElementById('admin-empty');
    const usersTbody = document.getElementById('admin-users-table-body');
    
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando datos consolidados...
            </td>
        </tr>
    `;
    if (emptyEl) emptyEl.style.display = 'none';

    if (usersTbody) {
        usersTbody.innerHTML = `
            <tr>
                <td colspan="6" style="padding: 20px; text-align: center; color: #a0aec0;">
                    <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                    Cargando productores registrados...
                </td>
            </tr>
        `;
    }

    let allLicenses = [];
    let uniqueUsers = new Set();
    let totalRevenue = 0;
    let producerConfigs = [];

    try {
        // Query across all "licencias" subcollections
        const licenciasQuery = collectionGroup(db, "licencias");
        const querySnapshot = await getDocs(licenciasQuery);
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allLicenses.push(data);
            
            // Extraer el uid del path para contar productores únicos
            const pathSegments = docSnap.ref.path.split('/');
            if (pathSegments.length >= 2 && pathSegments[0] === 'users') {
                uniqueUsers.add(pathSegments[1]);
            }
        });

        // Ordenar por fecha descendente
        allLicenses.sort((a, b) => {
            const dateA = a.date || "";
            const dateB = b.date || "";
            return dateB.localeCompare(dateA);
        });

        // Calcular ingresos totales y poblar la tabla
        tbody.innerHTML = '';
        
        if (allLicenses.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            allLicenses.forEach(lic => {
                // Sumar valor
                const valueNum = parseFloat(lic.value) || 0;
                totalRevenue += valueNum;

                // Crear fila
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                // Obtener nombre del productor o usar aka
                const producerName = lic.producerConfig?.aka || lic.producerConfig?.name || "Desconocido";

                tr.innerHTML = `
                    <td style="padding: 12px 10px;">
                        <span style="font-weight: 500; color: #fff;">${producerName}</span>
                    </td>
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 12px; color: #a0aec0;">
                        ${lic.refCode || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${lic.date || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px;">
                        <div style="font-weight: 500; color: #fff;">${lic.beatName || 'N/A'}</div>
                    </td>
                    <td style="padding: 12px 10px;">
                        <div style="color: #cbd5e0;">${lic.buyerName || 'N/A'}</div>
                        <div style="font-size: 11px; color: #718096;">${lic.formData?.buyerEmail || ''}</div>
                    </td>
                    <td style="padding: 12px 10px;">
                        <span style="font-size: 11px; background: #2d3748; color: #cbd5e0; padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">
                            ${lic.type || 'N/A'}
                        </span>
                    </td>
                    <td style="padding: 12px 10px; text-align: right; font-weight: bold; color: var(--bs-green-50);">
                        $${valueNum.toFixed(2)}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        // Obtener todos los productores (config) registrados
        const configQuery = collectionGroup(db, "config");
        const configSnapshot = await getDocs(configQuery);
        
        configSnapshot.forEach((docSnap) => {
            if (docSnap.id === 'producer') {
                const data = docSnap.data();
                const pathSegments = docSnap.ref.path.split('/');
                let userId = '';
                if (pathSegments.length >= 2 && pathSegments[0] === 'users') {
                    userId = pathSegments[1];
                } else {
                    userId = docSnap.ref.parent.parent ? docSnap.ref.parent.parent.id : '';
                }
                producerConfigs.push({
                    userId,
                    ...data
                });
            }
        });

        // Ordenar productores: Sossa siempre primero, luego alfabéticamente por AKA o nombre
        producerConfigs.sort((a, b) => {
            const emailA = (a.email || "").toLowerCase();
            const emailB = (b.email || "").toLowerCase();
            if (emailA === 'masterjuego25@gmail.com') return -1;
            if (emailB === 'masterjuego25@gmail.com') return 1;
            
            const akaA = (a.aka || a.name || a.email || "").toLowerCase();
            const akaB = (b.aka || b.name || b.email || "").toLowerCase();
            return akaA.localeCompare(akaB);
        });


        // Poblar la tabla de productores registrados
        if (usersTbody) {
            usersTbody.innerHTML = '';
            if (producerConfigs.length === 0) {
                usersTbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="padding: 20px; text-align: center; color: #8a91a6;">
                            No hay productores registrados.
                        </td>
                    </tr>
                `;
            } else {
                producerConfigs.forEach(user => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #2a2e39';

                    // Formatear plan
                    const plan = (user.plan || 'inicial').toLowerCase();
                    let planBadge = '';
                    if (plan === 'pro') {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(0, 102, 255, 0.2); color: #33b5ff; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(0, 102, 255, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">Pro ⚡</span>`;
                    } else if (plan === 'elite') {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(212, 175, 55, 0.2); color: #ffd700; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(212, 175, 55, 0.4); text-transform: uppercase; letter-spacing: 0.5px;">Elite 👑</span>`;
                    } else {
                        planBadge = `<span style="font-size: 11px; font-weight: 600; background: rgba(138, 145, 166, 0.2); color: #8a91a6; padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(138, 145, 166, 0.3); text-transform: uppercase; letter-spacing: 0.5px;">Inicial</span>`;
                    }

                    // Formatear fecha de vencimiento
                    let expStr = 'No aplica';
                    if ((plan === 'pro' || plan === 'elite') && user.expirationPro) {
                        const expDate = new Date(user.expirationPro);
                        if (!isNaN(expDate.getTime())) {
                            const formattedDate = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            if (expDate < new Date()) {
                                expStr = `<span style="color: #f56565; font-weight: 500;">${formattedDate} (Expirado)</span>`;
                            } else {
                                expStr = `<span style="color: #cbd5e0;">${formattedDate}</span>`;
                            }
                        } else {
                            expStr = `<span style="color: #718096;">Sin fecha</span>`;
                        }
                    }

                    tr.innerHTML = `
                        <td style="padding: 12px 10px;">
                            <span style="font-weight: 600; color: #fff;">${user.aka || 'Sin AKA'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0;">${user.name || 'Sin Nombre'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #a0aec0; font-size: 13px;">${user.email || 'N/A'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0; font-size: 13px;">${user.phone || 'N/A'}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            ${planBadge}
                        </td>
                        <td style="padding: 12px 10px;">
                            ${expStr}
                        </td>
                        <td style="padding: 12px 10px; text-align: right;">
                            <button class="btn btn-secondary btn-icon-only btn-admin-edit-plan tooltip-left" data-user-id="${user.userId}" data-user-email="${user.email || ''}" data-user-name="${user.name || ''}" data-user-aka="${user.aka || ''}" data-user-plan="${plan}" data-user-exp="${user.expirationPro || ''}" title="Modificar plan de este productor" style="display: inline-flex; width: 28px; height: 28px; border-radius: 6px; padding: 0; justify-content: center; align-items: center;">
                                <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
                            </button>
                        </td>
                    `;
                    usersTbody.appendChild(tr);
                });

                // Vincular eventos de click para cambiar plan
                document.querySelectorAll('.btn-admin-edit-plan').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const target = e.currentTarget;
                        const userId = target.getAttribute('data-user-id');
                        const userEmail = target.getAttribute('data-user-email');
                        const userName = target.getAttribute('data-user-name');
                        const userAka = target.getAttribute('data-user-aka');
                        const userPlan = target.getAttribute('data-user-plan');
                        const userExp = target.getAttribute('data-user-exp');
                        
                        openAdminPlanModal(userId, userEmail, userName, userAka, userPlan, userExp);
                    });
                });
            }
        }

        // Actualizar widgets de resumen
        const totalCollectedEl = document.getElementById('admin-stat-total-collected');
        const totalLicensesEl = document.getElementById('admin-stat-total-licenses');
        const totalUsersEl = document.getElementById('admin-stat-total-users');

        if (totalCollectedEl) totalCollectedEl.textContent = `$${totalRevenue.toFixed(2)} USD`;
        if (totalLicensesEl) totalLicensesEl.textContent = allLicenses.length;
        if (totalUsersEl) totalUsersEl.textContent = producerConfigs.length;

    } catch (err) {
        console.error("Error al cargar contabilidad consolidada:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar datos consolidados de la nube: ${err.message}
                </td>
            </tr>
        `;
        if (usersTbody) {
            usersTbody.innerHTML = `
                <tr>
                    <td colspan="6" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                        Error al cargar productores registrados: ${err.message}
                    </td>
                </tr>
            `;
        }
    }
    
    safeCreateIcons();
    initTooltips();
}

// Variable global y funciones para asignación manual de planes (Solo Sossa Admin)
let adminSelectedUserId = '';

function openAdminPlanModal(userId, email, name, aka, plan, expirationPro) {
    adminSelectedUserId = userId;
    
    const modal = document.getElementById('admin-plan-modal');
    const nameEl = document.getElementById('admin-plan-user-name');
    const emailEl = document.getElementById('admin-plan-user-email');
    const planSelect = document.getElementById('admin-plan-select');
    const durationSelect = document.getElementById('admin-plan-duration');
    const dateInput = document.getElementById('admin-plan-date');
    const dateContainer = document.getElementById('admin-plan-date-container');
    const durationContainer = document.getElementById('admin-plan-duration-container');
    const statusEl = document.getElementById('admin-plan-status');
    
    if (!modal) return;
    
    nameEl.textContent = `${aka || 'Sin AKA'} (${name || 'Sin Nombre'})`;
    emailEl.textContent = email;
    planSelect.value = plan || 'inicial';
    
    // Configurar campos según el plan
    if (plan === 'inicial') {
        durationContainer.style.display = 'none';
        dateContainer.style.display = 'none';
    } else {
        durationContainer.style.display = 'block';
        if (expirationPro) {
            durationSelect.value = 'custom';
            try {
                const d = new Date(expirationPro);
                if (!isNaN(d.getTime())) {
                    dateInput.value = d.toISOString().split('T')[0];
                    dateContainer.style.display = 'block';
                } else {
                    dateInput.value = '';
                    dateContainer.style.display = 'none';
                }
            } catch (err) {
                dateInput.value = '';
                dateContainer.style.display = 'none';
            }
        } else {
            durationSelect.value = 'no-expire';
            dateInput.value = '';
            dateContainer.style.display = 'none';
        }
    }
    
    statusEl.style.display = 'none';
    modal.style.display = 'flex';
    safeCreateIcons();
}

function setupAdminPlanModalEvents() {
    const modal = document.getElementById('admin-plan-modal');
    const closeBtn = document.getElementById('btn-close-admin-plan');
    const cancelBtn = document.getElementById('btn-cancel-admin-plan');
    const saveBtn = document.getElementById('btn-save-admin-plan');
    const planSelect = document.getElementById('admin-plan-select');
    const durationSelect = document.getElementById('admin-plan-duration');
    const dateInput = document.getElementById('admin-plan-date');
    const dateContainer = document.getElementById('admin-plan-date-container');
    const durationContainer = document.getElementById('admin-plan-duration-container');
    const statusEl = document.getElementById('admin-plan-status');
    
    if (!modal) return;
    
    const hideModal = () => {
        modal.style.display = 'none';
    };
    
    closeBtn.addEventListener('click', hideModal);
    cancelBtn.addEventListener('click', hideModal);
    
    planSelect.addEventListener('change', () => {
        const val = planSelect.value;
        if (val === 'inicial') {
            durationContainer.style.display = 'none';
            dateContainer.style.display = 'none';
        } else {
            durationContainer.style.display = 'block';
            if (durationSelect.value === 'custom') {
                dateContainer.style.display = 'block';
            } else {
                dateContainer.style.display = 'none';
            }
        }
    });
    
    durationSelect.addEventListener('change', () => {
        if (durationSelect.value === 'custom') {
            dateContainer.style.display = 'block';
        } else {
            dateContainer.style.display = 'none';
        }
    });
    
    saveBtn.addEventListener('click', async () => {
        if (!adminSelectedUserId) return;
        
        statusEl.textContent = 'Guardando cambios...';
        statusEl.style.color = '#ffd700';
        statusEl.style.display = 'block';
        saveBtn.disabled = true;
        
        try {
            const selectedPlan = planSelect.value;
            let expirationPro = null;
            
            if (selectedPlan !== 'inicial') {
                const durationVal = durationSelect.value;
                if (durationVal === 'no-expire') {
                    expirationPro = null;
                } else if (durationVal === 'custom') {
                    if (!dateInput.value) {
                        throw new Error('Por favor, selecciona una fecha de vencimiento.');
                    }
                    expirationPro = new Date(dateInput.value).toISOString();
                } else {
                    const months = parseInt(durationVal) || 1;
                    const d = new Date();
                    d.setMonth(d.getMonth() + months);
                    expirationPro = d.toISOString();
                }
            }
            
            // 1. Actualizar en config/producer
            const configRef = doc(db, 'users', adminSelectedUserId, 'config', 'producer');
            const configUpdates = {
                plan: selectedPlan,
                planActivatedAt: new Date().toISOString(),
                planPayPalOrderId: 'manual_admin_activation',
                planPayerEmail: document.getElementById('admin-plan-user-email').textContent
            };
            
            // Si es inicial o no expira, expirationPro es null
            configUpdates.expirationPro = expirationPro;
            
            await setDoc(configRef, configUpdates, { merge: true });
            
            // 2. Actualizar en el documento principal del usuario
            const userRef = doc(db, 'users', adminSelectedUserId);
            const userUpdates = {
                plan: selectedPlan,
                planActivatedAt: new Date().toISOString()
            };
            await setDoc(userRef, userUpdates, { merge: true });
            
            statusEl.textContent = '¡Plan actualizado exitosamente!';
            statusEl.style.color = '#10b981';
            
            setTimeout(() => {
                hideModal();
                saveBtn.disabled = false;
                loadConsolidatedAccounting();
            }, 1000);
            
        } catch (err) {
            console.error('Error al actualizar plan manual:', err);
            statusEl.textContent = `Error: ${err.message}`;
            statusEl.style.color = '#ef4444';
            saveBtn.disabled = false;
        }
    });
}

// ==========================================
// DASHBOARD DE VENTAS Y ANALÍTICAS (JS LOGIC)
// ==========================================

async function updateDashboardView() {
    const periodVal = document.getElementById('dashboard-period')?.value || 'all';
    
    // 1. Filtrar el historial según el periodo seleccionado
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthPrefix = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = `${currentYear}`;

    const filtered = licenseHistory.filter(lic => {
        if (!lic.date) return false;
        
        // Formato esperado de fecha: YYYY-MM-DD
        const licDate = new Date(lic.date);
        
        if (periodVal === '30') {
            const diffTime = Math.abs(now - licDate);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays <= 30;
        } else if (periodVal === 'month') {
            return lic.date.startsWith(currentMonthPrefix);
        } else if (periodVal === 'year') {
            return lic.date.startsWith(currentYearPrefix);
        }
        return true; // 'all'
    });

    // 2. Calcular Métricas KPI
    let totalRevenue = 0;
    let beatsSet = new Set();
    let buyersMap = {}; // nombre -> { count: 0, total: 0, email: '' }

    filtered.forEach(lic => {
        const val = parseFloat(lic.value) || 0;
        totalRevenue += val;
        if (lic.beatName) beatsSet.add(lic.beatName);
        
        if (lic.buyerName) {
            const bName = lic.buyerName;
            if (!buyersMap[bName]) {
                buyersMap[bName] = { count: 0, total: 0, email: lic.formData?.buyerEmail || '' };
            }
            buyersMap[bName].count++;
            buyersMap[bName].total += val;
        }
    });

    // Determinar Top Buyer
    let topBuyerName = 'N/A';
    let topBuyerVal = 0;
    Object.keys(buyersMap).forEach(name => {
        if (buyersMap[name].total > topBuyerVal) {
            topBuyerVal = buyersMap[name].total;
            topBuyerName = name;
        }
    });

    // 3. Renderizar KPIs en el DOM
    const revenueEl = document.getElementById('db-stat-revenue');
    const licensesEl = document.getElementById('db-stat-licenses');
    const beatsEl = document.getElementById('db-stat-beats');
    const topClientEl = document.getElementById('db-stat-top-client');

    if (revenueEl) revenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
    if (licensesEl) licensesEl.textContent = filtered.length;
    if (beatsEl) beatsEl.textContent = beatsSet.size;
    if (topClientEl) {
        topClientEl.textContent = topBuyerName !== 'N/A' 
            ? `${topBuyerName} ($${topBuyerVal.toFixed(2)})`
            : 'N/A';
        topClientEl.setAttribute('title', topBuyerName);
    }

    // 4. Renderizar Gráficos y Tablas
    renderMonthlySalesChart(filtered);
    renderLicenseTypesChart(filtered);
    renderTopBeatsChart(filtered);
    renderTopBuyersTable(buyersMap);

    // Reinicializar iconos y tooltips
    safeCreateIcons();
    initTooltips();
}

// GRAFICO 1: Historial de Ventas Mensuales (SVG interactivo de línea/área)
function renderMonthlySalesChart(licenses) {
    const container = document.getElementById('monthly-sales-chart-container');
    if (!container) return;

    // Obtener los últimos 6 meses cronológicos
    const monthsData = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const monthLabel = d.toLocaleString('es', { month: 'short' });
        monthsData.push({
            prefix: `${yyyy}-${mm}`,
            label: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
            revenue: 0,
            count: 0
        });
    }

    // Sumar ingresos de licencias por mes
    licenses.forEach(lic => {
        if (!lic.date) return;
        const licPrefix = lic.date.substring(0, 7);
        const mData = monthsData.find(m => m.prefix === licPrefix);
        if (mData) {
            mData.revenue += parseFloat(lic.value) || 0;
            mData.count++;
        }
    });

    // Calcular dimensiones del gráfico
    const width = 500;
    const height = 220;
    const paddingLeft = 45;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;

    // Calcular valores Y max
    const maxVal = Math.max(...monthsData.map(d => d.revenue), 10);
    const yMax = Math.ceil(maxVal / 10) * 10; // Redondear hacia arriba

    // Generar líneas de cuadrícula y etiquetas Y
    let yGridHtml = '';
    const yTicks = 4;
    for (let i = 0; i <= yTicks; i++) {
        const yVal = (yMax / yTicks) * i;
        const yPos = height - paddingBottom - ((height - paddingTop - paddingBottom) / yTicks) * i;
        yGridHtml += `
            <line class="chart-grid-line" x1="${paddingLeft}" y1="${yPos}" x2="${width - paddingRight}" y2="${yPos}" />
            <text class="chart-axis-text" x="${paddingLeft - 8}" y="${yPos + 4}" text-anchor="end">$${yVal.toFixed(0)}</text>
        `;
    }

    // Calcular puntos de datos
    const points = [];
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    monthsData.forEach((d, i) => {
        const x = paddingLeft + (chartWidth / 5) * i;
        const y = height - paddingBottom - (d.revenue / yMax) * chartHeight;
        points.push({ x, y, label: d.label, revenue: d.revenue, count: d.count });
    });

    // Construir trazado del área y de la línea
    let linePathStr = '';
    let areaPathStr = '';

    if (points.length > 0) {
        linePathStr = `M ${points[0].x} ${points[0].y}`;
        areaPathStr = `M ${points[0].x} ${height - paddingBottom} L ${points[0].x} ${points[0].y}`;
        
        for (let i = 1; i < points.length; i++) {
            linePathStr += ` L ${points[i].x} ${points[i].y}`;
            areaPathStr += ` L ${points[i].x} ${points[i].y}`;
        }
        areaPathStr += ` L ${points[points.length - 1].x} ${height - paddingBottom} Z`;
    }

    // Dibujar X axis labels
    let xLabelsHtml = '';
    points.forEach(p => {
        xLabelsHtml += `
            <text class="chart-axis-text" x="${p.x}" y="${height - 10}" text-anchor="middle">${p.label}</text>
        `;
    });

    // Dibujar los círculos interactivos
    let dotsHtml = '';
    points.forEach((p, idx) => {
        dotsHtml += `
            <circle class="chart-dot" cx="${p.cx || p.x}" cy="${p.cy || p.y}" r="5" 
                    data-month="${p.label}" data-revenue="${p.revenue}" data-count="${p.count}"
                    onmouseover="showChartTooltip(event)" onmouseout="hideChartTooltip()" />
        `;
    });

    // Renderizar el SVG completo
    container.innerHTML = `
        <svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
            <defs>
                <linearGradient id="chart-gradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.4"/>
                    <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0"/>
                </linearGradient>
            </defs>
            
            <!-- Cuadrícula e Ejes -->
            ${yGridHtml}
            <line class="chart-axis-line" x1="${paddingLeft}" y1="${height - paddingBottom}" x2="${width - paddingRight}" y2="${height - paddingBottom}" />
            
            <!-- Área y Línea -->
            <path class="chart-area" d="${areaPathStr}" />
            <path class="chart-line" d="${linePathStr}" />
            
            <!-- Textos y Círculos -->
            ${xLabelsHtml}
            ${dotsHtml}
        </svg>
        <div class="chart-tooltip-bubble" id="sales-chart-tooltip"></div>
    `;
}

// Tooltips flotantes interactivos de SVG
window.showChartTooltip = function(e) {
    const dot = e.target;
    const tooltip = document.getElementById('sales-chart-tooltip');
    if (!tooltip) return;

    const month = dot.getAttribute('data-month');
    const revenue = parseFloat(dot.getAttribute('data-revenue')).toFixed(2);
    const count = dot.getAttribute('data-count');

    tooltip.innerHTML = `
        <div style="font-weight:700; color:#fff;">${month}</div>
        <div style="color:var(--accent); margin-top:2px;">Ventas: $${revenue}</div>
        <div style="font-size:10px; color:#a0aec0; margin-top:2px;">${count} Licencia(s)</div>
    `;

    // Posicionar tooltip relativo al contenedor
    const rect = dot.getBoundingClientRect();
    const containerRect = dot.closest('.chart-container').getBoundingClientRect();
    
    tooltip.style.left = `${rect.left - containerRect.left + (rect.width / 2)}px`;
    tooltip.style.top = `${rect.top - containerRect.top}px`;
    tooltip.style.opacity = '1';
};

window.hideChartTooltip = function() {
    const tooltip = document.getElementById('sales-chart-tooltip');
    if (tooltip) tooltip.style.opacity = '0';
};

// GRAFICO 2: Distribución por Tipo de Licencia (Donut SVG + Leyenda)
function renderLicenseTypesChart(licenses) {
    const container = document.getElementById('license-types-chart-container');
    if (!container) return;

    if (licenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096;">
                <i data-lucide="pie-chart" style="width: 48px; height: 48px; stroke-width: 1.5; color: #4a5568; margin-bottom: 8px;"></i>
                <div style="font-size: 13px;">Sin datos para clasificar</div>
            </div>
        `;
        return;
    }

    // Contar tipos de licencia
    const typesCount = {};
    licenses.forEach(lic => {
        const type = lic.type || "Desconocido";
        typesCount[type] = (typesCount[type] || 0) + 1;
    });

    // Definir colores y mapear segmentos
    const colors = {
        "Básica": "#3b82f6",     // Azul
        "Premium": "#10b981",    // Verde
        "Ilimitada": "#f59e0b",  // Naranja
        "Exclusiva": "#a855f7",   // Violeta
        "Desconocido": "#718096" // Gris
    };

    const segments = Object.keys(typesCount).map(type => {
        const count = typesCount[type];
        const pct = (count / licenses.length) * 100;
        return {
            type,
            count,
            pct,
            color: colors[type] || "#718096"
        };
    });

    // Dibujar Donut SVG
    let svgHtml = '';
    let accumulatedAngle = 0;
    const r = 50;
    const cx = 80;
    const cy = 100;
    const strokeWidth = 14;
    const circ = 2 * Math.PI * r; // ~314.16

    segments.forEach(seg => {
        const dashArray = `${circ}`;
        const dashOffset = circ - (seg.pct / 100) * circ;
        const rotate = (accumulatedAngle * 3.6) - 90; // Convertir a grados y girar 90
        
        svgHtml += `
            <circle cx="${cx}" cy="${cy}" r="${r}" 
                    fill="none" 
                    stroke="${seg.color}" 
                    stroke-width="${strokeWidth}" 
                    stroke-dasharray="${dashArray}" 
                    stroke-dashoffset="${dashOffset}"
                    transform="rotate(${rotate} ${cx} ${cy})"
                    style="transition: stroke-dashoffset 0.6s ease;"
                    data-tooltip="${seg.type}: ${seg.count} (${seg.pct.toFixed(1)}%)" />
        `;
        accumulatedAngle += seg.pct;
    });

    // Si solo hay un tipo, o para cerrar el fondo
    if (segments.length === 0) {
        svgHtml = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#2d3748" stroke-width="${strokeWidth}" />`;
    }

    // Construir la leyenda
    let legendHtml = '<div style="display:flex; flex-direction:column; gap:10px; margin-left: 20px; flex: 1;">';
    segments.forEach(seg => {
        legendHtml += `
            <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; color: #cbd5e0;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; background-color: ${seg.color};"></span>
                    <span style="font-weight: 500;">${seg.type}</span>
                </div>
                <div style="font-weight: 700; color: #fff;">
                    ${seg.count} <span style="font-size: 11px; font-weight: 500; color: #718096; margin-left: 2px;">(${seg.pct.toFixed(0)}%)</span>
                </div>
            </div>
        `;
    });
    legendHtml += '</div>';

    container.innerHTML = `
        <div style="display: flex; width: 100%; align-items: center;">
            <svg viewBox="0 0 160 200" style="width: 140px; height: 140px;">
                <!-- Fondo vacío para el donut -->
                <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1d2026" stroke-width="${strokeWidth}" />
                ${svgHtml}
                <!-- Texto en el centro -->
                <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="#fff" font-size="14" font-weight="800">${licenses.length}</text>
                <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="#718096" font-size="8" font-weight="600" text-transform="uppercase" letter-spacing="0.5">Ventas</text>
            </svg>
            ${legendHtml}
        </div>
    `;
}

// GRAFICO 3: Top 5 Beats Más Vendidos (Progress Bars horizontales)
function renderTopBeatsChart(licenses) {
    const container = document.getElementById('top-beats-chart-container');
    if (!container) return;

    if (licenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096; padding: 20px 0;">
                <i data-lucide="music-4" style="width: 48px; height: 48px; stroke-width: 1.5; color: #4a5568; margin-bottom: 8px;"></i>
                <div style="font-size: 13px;">No hay ventas registradas</div>
            </div>
        `;
        return;
    }

    // Contar beats
    const beatsCount = {};
    licenses.forEach(lic => {
        if (lic.beatName) {
            beatsCount[lic.beatName] = (beatsCount[lic.beatName] || 0) + 1;
        }
    });

    // Ordenar y tomar los top 5
    const topBeats = Object.keys(beatsCount)
        .map(name => ({ name, count: beatsCount[name] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

    const maxCount = topBeats.length > 0 ? topBeats[0].count : 1;

    let barsHtml = '';
    topBeats.forEach((beat, index) => {
        const pct = (beat.count / maxCount) * 100;
        
        // Asignar colores dinámicos basados en la posición
        const colors = [
            "linear-gradient(90deg, #a855f7 0%, #d8b4fe 100%)", // Top 1: Violeta Sparkle
            "linear-gradient(90deg, #3b82f6 0%, #93c5fd 100%)", // Top 2: Azul Neon
            "linear-gradient(90deg, #10b981 0%, #6ee7b7 100%)", // Top 3: Esmeralda
            "linear-gradient(90deg, #f59e0b 0%, #fcd34d 100%)", // Top 4: Ámbar
            "linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)"  // Top 5: Gris
        ];
        const barColor = colors[index] || colors[4];

        barsHtml += `
            <div class="horizontal-bar-row">
                <div class="horizontal-bar-label-container">
                    <span style="font-weight: 600; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">
                        ${index + 1}. ${beat.name}
                    </span>
                    <span style="font-weight: 700; color: var(--accent);">${beat.count} venta(s)</span>
                </div>
                <div class="horizontal-bar-track">
                    <div class="horizontal-bar-fill" style="width: ${pct}%; background: ${barColor};"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = barsHtml;
}

// TABLA 4: Compradores Destacados
function renderTopBuyersTable(buyersMap) {
    const tbody = document.getElementById('db-top-buyers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    const buyers = Object.keys(buyersMap)
        .map(name => ({
            name,
            count: buyersMap[name].count,
            total: buyersMap[name].total,
            email: buyersMap[name].email
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

    if (buyers.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; padding: 20px; color: #718096; font-size: 13px;">
                    No hay registros de clientes en este período.
                </td>
            </tr>
        `;
        return;
    }

    buyers.forEach(buyer => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid rgba(255, 255, 255, 0.03)';
        tr.innerHTML = `
            <td style="padding: 10px 0;">
                <div style="font-weight: 600; color: #fff;">${buyer.name}</div>
                <div style="font-size: 11px; color: #718096; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${buyer.email || 'Sin correo'}</div>
            </td>
            <td style="padding: 10px 0; text-align: center; font-weight: 600; color: #cbd5e0;">
                ${buyer.count}
            </td>
            <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #10b981;">
                $${buyer.total.toFixed(2)}
            </td>
        `;
        tbody.appendChild(tr);
    });
}



// Cargar solicitudes de pago local pendientes para Sossa Admin
async function loadPendingPaymentsAdmin() {
    if (!window.currentUserIsAdmin) return;
    
    const container = document.getElementById('admin-payments-container');
    const tbody = document.getElementById('admin-payments-table-body');
    const emptyEl = document.getElementById('admin-payments-empty');
    
    if (!container || !tbody) return;
    
    // Mostrar el contenedor para el administrador
    container.style.display = 'block';
    
    tbody.innerHTML = `
        <tr>
            <td colspan="7" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando solicitudes de pago...
            </td>
        </tr>
    `;
    if (emptyEl) emptyEl.style.display = 'none';

    try {
        const paymentsCol = collection(db, "payments");
        // Consulta para obtener solicitudes pendientes (ordenadas en memoria para evitar requerir índices compuestos de Firestore)
        const q = query(paymentsCol, where("status", "==", "pending"));
        const querySnapshot = await getDocs(q);

        const pendingPayments = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            pendingPayments.push({ id: docSnap.id, ...data });
        });

        // Ordenar en memoria por fecha descendente
        pendingPayments.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

        tbody.innerHTML = '';
        
        if (pendingPayments.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            pendingPayments.forEach(pay => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                // Formatear fecha
                const dateStr = pay.timestamp ? pay.timestamp.split('T')[0] : 'N/A';
                
                tr.innerHTML = `
                    <td style="padding: 12px 10px;">
                        <div style="font-weight: 600; color: #fff;">${pay.userEmail}</div>
                        <div style="font-size: 11px; color: #718096; font-family: monospace;">UID: ${pay.userId}</div>
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0;">
                        ${pay.aka || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        <span style="display:inline-block; padding: 2px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${pay.plan === 'elite' ? 'rgba(236,72,153,0.15)' : 'rgba(168,85,247,0.15)'}; color: ${pay.plan === 'elite' ? '#ec4899' : '#a855f7'}; border: 1px solid ${pay.plan === 'elite' ? 'rgba(236,72,153,0.3)' : 'rgba(168,85,247,0.3)'};">
                            ${pay.plan ? pay.plan.toUpperCase() : 'PRO'}
                        </span>
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${pay.method || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 12px; color: #a0aec0;">
                        ${pay.reference || 'N/A'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0; font-size: 13px;">
                        ${dateStr}
                    </td>
                    <td style="padding: 12px 10px; text-align: center;">
                        <button type="button" class="btn btn-secondary" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; display: inline-flex; align-items: center; gap: 4px;" onclick="viewReceiptLarge('${pay.receiptUrl}')">
                            <i data-lucide="eye" style="width: 12px; height: 12px;"></i> Ver
                        </button>
                    </td>
                    <td style="padding: 12px 10px; text-align: right;">
                        <div style="display: inline-flex; gap: 6px;">
                            <button type="button" class="btn btn-success" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #10b981; color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="approvePaymentAdmin('${pay.id}', '${pay.userId}', '${pay.userEmail}')">
                                <i data-lucide="check" style="width: 12px; height: 12px;"></i> Aprobar
                            </button>
                            <button type="button" class="btn btn-danger" style="height: 28px; padding: 0 10px; font-size: 11px; font-weight: 600; border-radius: 6px; background: #ef4444; color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;" onclick="rejectPaymentAdmin('${pay.id}')">
                                <i data-lucide="x" style="width: 12px; height: 12px;"></i> Rechazar
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Error al cargar solicitudes de pago pendientes:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar pagos pendientes: ${err.message}
                </td>
            </tr>
        `;
    }
    
    safeCreateIcons();
}

// Funciones globales para que onclick de HTML las pueda usar
window.viewReceiptLarge = function(receiptUrl) {
    const modal = document.getElementById('admin-receipt-preview-modal');
    const img = document.getElementById('admin-receipt-preview-large-img');
    if (modal && img) {
        img.src = receiptUrl;
        modal.style.display = 'flex';
    }
};

window.approvePaymentAdmin = async function(paymentId, userId, userEmail) {
    if (!confirm(`¿Estás seguro de aprobar este pago y activar la suscripción del usuario?`)) return;
    
    try {
        // 1. Obtener detalles del pago para saber qué plan se solicitó
        const paymentDocRef = doc(db, "payments", paymentId);
        const paymentSnap = await getDoc(paymentDocRef);
        const paymentData = paymentSnap.exists() ? paymentSnap.data() : {};
        const targetPlan = paymentData.plan || 'pro';
        
        // 2. Actualizar el plan del usuario en Firestore en su config
        const configDocRef = doc(db, "users", userId, "config", "producer");
        const docSnap = await getDoc(configDocRef);
        
        const now = new Date();
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        
        let newConfig = {};
        if (docSnap.exists()) {
            newConfig = { 
                ...docSnap.data(), 
                plan: targetPlan, 
                expirationPro: thirtyDaysLater.toISOString() 
            };
        } else {
            newConfig = {
                plan: targetPlan,
                expirationPro: thirtyDaysLater.toISOString(),
                name: "Productor",
                email: userEmail,
                aka: "Productor"
            };
        }
        
        await setDoc(configDocRef, newConfig);
        
        // 3. Actualizar en el documento raíz del usuario
        const userRef = doc(db, "users", userId);
        await setDoc(userRef, {
            plan: targetPlan,
            planActivatedAt: now.toISOString(),
        }, { merge: true });
        
        // 4. Actualizar el estado del pago en la colección payments a 'approved'
        await updateDoc(paymentDocRef, {
            status: 'approved',
            approvedAt: now.toISOString()
        });
        
        alert(`Plan ${targetPlan.toUpperCase()} activado con éxito para ${userEmail}.`);
        
        // 3. Recargar datos del panel admin
        await loadPendingPaymentsAdmin();
        await loadConsolidatedAccounting();
    } catch (err) {
        console.error("Error al aprobar pago:", err);
        alert('Error al aprobar pago: ' + err.message);
    }
};

window.rejectPaymentAdmin = async function(paymentId) {
    if (!confirm('¿Estás seguro de rechazar este pago? El usuario no recibirá el plan Pro.')) return;
    
    try {
        const paymentDocRef = doc(db, "payments", paymentId);
        await updateDoc(paymentDocRef, {
            status: 'rejected',
            rejectedAt: new Date().toISOString()
        });
        
        alert('Pago rechazado.');
        
        // Recargar datos
        await loadPendingPaymentsAdmin();
    } catch (err) {
        console.error("Error al rechazar pago:", err);
        alert('Error al rechazar pago: ' + err.message);
    }
};



// Cargar datos del programa de referidos del usuario
async function loadReferralData() {
    const linkInput = document.getElementById('referral-link-input');
    const countBox = document.getElementById('referrals-count-box');
    const countVal = document.getElementById('referrals-count-val');
    if (!linkInput) return;

    // 1. Generar enlace de referido basado en el URL actual y el UID del usuario
    const baseUrl = window.location.origin + window.location.pathname;
    linkInput.value = `${baseUrl}?ref=${window.currentUser}`;

    // 2. Copiar enlace al hacer clic
    const copyBtn = document.getElementById('btn-copy-referral');
    if (copyBtn) {
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(linkInput.value).then(() => {
                showToast('Enlace de referido copiado al portapapeles');
                copyBtn.textContent = '✓';
                setTimeout(() => copyBtn.textContent = '⧉', 1500);
            });
        };
    }

    // 3. Consultar referidos en Firestore
    try {
        const q = query(collection(db, "referrals"), where("referrerId", "==", window.currentUser));
        const snap = await getDocs(q);
        const count = snap.size;
        if (count > 0 && countBox && countVal) {
            countVal.textContent = count;
            countBox.style.display = 'block';
        } else if (countBox) {
            countBox.style.display = 'none';
        }
    } catch (err) {
        console.error("Error al cargar referidos:", err);
    }
}
window.loadReferralData = loadReferralData;

// ==========================================
// CÓDIGOS VIP Y REFERIDOS (SOSA ADMIN & SaaS)
// ==========================================

// Desactivar un código VIP
window.deactivateVipCodeAdmin = async function(codeId) {
    if (!confirm(`¿Estás seguro de desactivar el código ${codeId}?`)) return;
    try {
        const docRef = doc(db, "vip_codes", codeId);
        await updateDoc(docRef, { active: false });
        alert(`Código ${codeId} desactivado.`);
        await loadVipCodesAdmin();
    } catch (err) {
        console.error("Error al desactivar código VIP:", err);
        alert("Error al desactivar código: " + err.message);
    }
};

// Generar un nuevo código VIP aleatorio
window.generateVipCodeAdmin = async function() {
    const planType = document.getElementById('admin-vip-plan').value;
    const months = parseInt(document.getElementById('admin-vip-months').value) || 1;
    
    // Formato VIP-XXXX-XXXX
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const randStr = (len) => Array.from({length: len}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    const codeId = `VIP-${randStr(4)}-${randStr(4)}`;
    
    try {
        const docRef = doc(db, "vip_codes", codeId);
        await setDoc(docRef, {
            active: true,
            planType: planType,
            planDurationMonths: months,
            createdAt: new Date().toISOString()
        });
        alert(`Código VIP generado con éxito: ${codeId}`);
        await loadVipCodesAdmin();
    } catch (err) {
        console.error("Error al generar código VIP:", err);
        alert("Error al generar código: " + err.message);
    }
};

// Cargar y listar todos los códigos VIP generados
async function loadVipCodesAdmin() {
    const tbody = document.getElementById('admin-vip-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="5" style="padding: 20px; text-align: center; color: #a0aec0;">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando códigos VIP...
            </td>
        </tr>
    `;
    
    try {
        const querySnapshot = await getDocs(collection(db, "vip_codes"));
        const vipCodes = [];
        querySnapshot.forEach(docSnap => {
            vipCodes.push({ id: docSnap.id, ...docSnap.data() });
        });
        
        vipCodes.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        
        tbody.innerHTML = '';
        if (vipCodes.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" style="padding: 20px; text-align: center; color: #8a91a6;">
                        No se han generado códigos VIP aún.
                    </td>
                </tr>
            `;
        } else {
            vipCodes.forEach(code => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid #2a2e39';
                
                let statusDetails = '';
                if (!code.active && code.redeemedByEmail) {
                    const dateStr = code.redeemedAt ? new Date(code.redeemedAt).toLocaleDateString('es-ES', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '';
                    statusDetails = `<div style="font-size: 10px; color: #8a91a6; margin-top: 4px; line-height: 1.2;">
                        Por: ${code.redeemedByEmail}<br>${dateStr}
                    </div>`;
                }

                const statusBadge = code.active 
                    ? `<span style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">Activo</span>`
                    : `<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 600; text-transform: uppercase;">Inactivo</span>${statusDetails}`;
                
                const actionsHtml = code.active
                    ? `<button type="button" class="btn btn-danger" style="height: 26px; padding: 0 8px; font-size: 11px; font-weight: 600; border-radius: 6px;" onclick="deactivateVipCodeAdmin('${code.id}')">Desactivar</button>`
                    : `<span style="color: #718096; font-size: 11px;">N/A</span>`;
                
                tr.innerHTML = `
                    <td style="padding: 12px 10px; font-family: monospace; font-size: 13px; font-weight: 700; color: #fff;">
                        ${code.id}
                    </td>
                    <td style="padding: 12px 10px; font-weight: 600; color: ${code.planType === 'elite' ? '#ffd700' : '#33b5ff'}; text-transform: uppercase;">
                        ${code.planType === 'elite' ? 'Elite 👑' : 'Pro ⚡'}
                    </td>
                    <td style="padding: 12px 10px; color: #cbd5e0;">
                        ${code.planDurationMonths} ${code.planDurationMonths === 1 ? 'Mes' : 'Meses'}
                    </td>
                    <td style="padding: 12px 10px;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 12px 10px; text-align: right;">
                        ${actionsHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }
    } catch (err) {
        console.error("Error al cargar códigos VIP:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="padding: 20px; text-align: center; color: var(--bs-red-50);">
                    Error al cargar códigos VIP: ${err.message}
                </td>
            </tr>
        `;
    }
}
window.loadVipCodesAdmin = loadVipCodesAdmin;

// Disparar la llamada a la API para convertir el referido cuando el usuario tiene licencias
async function triggerReferralConversion() {
    const referralProcessed = localStorage.getItem('beatss_referral_processed');
    if (referralProcessed) return;

    try {
        const idToken = await auth.currentUser.getIdToken(true);
        const response = await fetch('/api/convert-referral', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ uid: window.currentUser })
        });
        const resData = await response.json();
        if (resData.success) {
            localStorage.setItem('beatss_referral_processed', 'true');
            console.log("👥 Conversión de referido registrada con éxito:", resData.message);
        }
    } catch (err) {
        console.error("Error al convertir referido:", err);
    }
}

// ==========================================
// IMPORTADOR VISUAL DE CSV DE BEATSTARS
// ==========================================

async function saveAllContacts() {
    safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(contactsList));
    if (window.currentUserIsPro) {
        for (const cont of contactsList) {
            if (!cont.email) continue;
            try {
                const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
                const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                await setDoc(contDocRef, cont);
            } catch (err) {
                console.error("Error al guardar contacto:", err);
            }
        }
    }
}

async function saveAllBeats() {
    safeSetItem(`${window.currentUser}_beats`, JSON.stringify(localBeats));
    if (window.currentUserIsPro) {
        for (const beat of localBeats) {
            if (!beat.id) continue;
            try {
                const beatDocRef = doc(db, "users", window.currentUser, "beats", beat.id);
                await setDoc(beatDocRef, beat);
            } catch (err) {
                console.error("Error al guardar beat:", err);
            }
        }
    }
}

async function handleBeatStarsCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('⏳ Procesando archivo CSV...');
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const text = evt.target.result;
            const rows = parseCSV(text);
            if (rows.length === 0) {
                showToast('El archivo CSV está vacío o no es válido.', true);
                return;
            }

            // Mapeos rápidos para evitar duplicados
            const existingRefs = new Set(licenseHistory.map(h => h.refCode));
            const existingEmails = new Set(contactsList.map(c => (c.email || '').toLowerCase()));
            const existingBeats = new Set(localBeats.map(b => (b.name || '').toLowerCase()));

            let newContactsCount = 0;
            let newBeatsCount = 0;
            let newLicensesCount = 0;

            let lastInvoice = "";
            let lastDate = "";
            let lastCustomerName = "";
            let lastCustomerEmail = "";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                const invoice = row["Invoice Number"] || lastInvoice;
                const dateRaw = row["Date"] || lastDate;
                const customerName = row["Customer Name"] || lastCustomerName;
                const customerEmail = row["Customer Email"] || lastCustomerEmail;

                lastInvoice = invoice;
                lastDate = dateRaw;
                lastCustomerName = customerName;
                lastCustomerEmail = customerEmail;

                if (!invoice) continue;

                const itemName = row["Item Name"] || "";
                if (!itemName) continue;

                const cleanedBeat = cleanBeatName(itemName);
                const salePrice = parseFloat(row["Sale Price"]) || 0.0;

                // 1. Agregar Contacto
                const emailLower = (customerEmail || '').trim().toLowerCase();
                if (emailLower && !existingEmails.has(emailLower)) {
                    const newContact = {
                        name: customerName || "Comprador Beatstars",
                        email: customerEmail,
                        phone: "",
                        city: "",
                        country: "",
                        id: "",
                        updatedAt: Date.now()
                    };
                    contactsList.push(newContact);
                    existingEmails.add(emailLower);
                    newContactsCount++;
                }

                // 2. Agregar Beat
                const beatLower = cleanedBeat.toLowerCase();
                if (beatLower && !existingBeats.has(beatLower)) {
                    const newBeat = {
                        id: makeBeatId(cleanedBeat),
                        name: cleanedBeat,
                        mp3: "",
                        wav: "",
                        stems: "",
                        updatedAt: Date.now()
                    };
                    localBeats.push(newBeat);
                    existingBeats.add(beatLower);
                    newBeatsCount++;
                }

                // 3. Agregar Licencia
                let refCode = invoice;
                if (existingRefs.has(refCode)) {
                    refCode = `${invoice}-${cleanedBeat.toUpperCase().replace(/\s+/g, '_')}`;
                }

                if (!existingRefs.has(refCode)) {
                    const formattedDate = parseBeatStarsDate(dateRaw);
                    
                    let licType = "basic";
                    let formats = "MP3";
                    let streams = "100,000";
                    let physical = "3,000";
                    let videos = "1";

                    if (salePrice <= 35) {
                        licType = "basic";
                        formats = "MP3";
                        streams = "100,000";
                        physical = "3,000";
                        videos = "1";
                    } else if (salePrice <= 65) {
                        licType = "premium";
                        formats = "MP3 y WAV";
                        streams = "500,000";
                        physical = "10,000";
                        videos = "2";
                    } else {
                        licType = "premium_plus";
                        formats = "MP3, WAV y STEMS";
                        streams = "Ilimitado";
                        physical = "Ilimitado";
                        videos = "Ilimitado";
                    }

                    const currentAka = producerConfig.aka || "Productor";

                    const newLicense = {
                        refCode: refCode,
                        date: formattedDate,
                        beatName: cleanedBeat,
                        buyerName: customerName || "Comprador Beatstars",
                        type: licType,
                        value: salePrice > 0 ? salePrice : 30.0,
                        paymentMethod: "PayPal (Beatstars)",
                        formData: {
                            buyerId: "",
                            buyerEmail: customerEmail,
                            buyerPhone: "",
                            buyerCity: "",
                            buyerCountry: "",
                            celebrationPlace: producerConfig.place || "Quito, Ecuador",
                            formats: formats,
                            streams: streams,
                            physical: physical,
                            videos: videos,
                            videoDuration: licType !== "premium_plus" ? "cinco (5) minutos" : "Sin límite",
                            years: licType !== "premium_plus" ? "diez (10) años" : "Perpetuo",
                            terminationFee: `200% ($${2 * (salePrice > 0 ? Math.floor(salePrice) : 30)}.00 USD)`,
                            writerShare: 50,
                            producerShare: 50,
                            credits: `"Producido por ${currentAka}" o "Prod. por ${currentAka}"`,
                            contentId: true
                        }
                    };
                    licenseHistory.unshift(newLicense);
                    existingRefs.add(refCode);
                    newLicensesCount++;
                }
            }

            licenseHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            if (newContactsCount > 0) await saveAllContacts();
            if (newBeatsCount > 0) await saveAllBeats();
            if (newLicensesCount > 0) {
                await saveHistory();
                updateHistoryTable();
            }

            showToast(`🚀 Importación completa:\n- ${newLicensesCount} licencias\n- ${newBeatsCount} beats\n- ${newContactsCount} contactos.`);
            
            if (window.currentUserIsAdmin) {
                await loadConsolidatedAccounting();
            }

            e.target.value = '';

        } catch (err) {
            console.error('Error al procesar el archivo CSV:', err);
            showToast('Error al parsear el archivo CSV. Verifica su formato.', true);
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let headers = [];
    
    let parsedHeader = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line === "Transactions") continue;
        
        const row = [];
        let insideQuote = false;
        let currentCell = '';
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                row.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        row.push(currentCell.trim());
        
        if (!parsedHeader) {
            headers = row.map(h => h.replace(/^"|"$/g, '').trim());
            parsedHeader = true;
        } else {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] || '';
                val = val.replace(/^"|"$/g, '').trim();
                obj[header] = val;
            });
            result.push(obj);
        }
    }
    return result;
}

function cleanBeatName(name) {
    if (!name) return "Beat";
    name = name.replace(/\s*\(collaborator\)\s*/gi, "");
    name = name.replace(/^type beat\s+/gi, "");
    return name.trim();
}

function makeBeatId(name) {
    const normalized = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
    return "beat_" + normalized.replace(/\s+/g, "_");
}

function parseBeatStarsDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const monthsMap = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
        "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
        "jan": 1, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sept": 9, "oct": 10, "nov": 11, "dec": 12
    };
    const match = dateStr.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/);
    if (match) {
        const monthName = match[1].toLowerCase();
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const monthNum = monthsMap[monthName] || 1;
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
}

// PANEL DEL PRODUCTOR: GESTIÓN DE VENTAS
// ── Listener de pagos en tiempo real ──────────────────────────────────────────
window._salesUnsubscribe = window._salesUnsubscribe || null; // guarda el unsubscribe para limpieza
let _salesFirstLoad   = true;          // para no notificar en la carga inicial
let _knownPaymentIds  = new Set();     // IDs ya conocidos

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

// Actualiza el badge numérico en el tab de Ventas
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

// Solicitar permiso de notificaciones nativas al browser
async function requestNotificationPermission() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (_) {}
    }
}

// Fallback: carga única (sin tiempo real) si onSnapshot falla
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

// Mantener compatibilidad con llamadas existentes a loadSalesData()
async function loadSalesData() {
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

window.openSaleDetailsModal = async function(paymentId) {
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
        const response = await fetch(`/api/get-order-downloads?id=${paymentId}`);
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

window.openSaleDetailsModal = openSaleDetailsModal;

window.approveBeatSale = async function(paymentId) {
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
            beatData = localBeats.find(b => b.id === payment.beatId);
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

window.rejectBeatSale = async function(paymentId) {
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

window.acceptExclusiveOffer = async function(paymentId) {
    const payment = window.storePayments.find(p => p.id === paymentId);
    if (!payment) return;

    if (!confirm(`¿Aceptar la oferta exclusiva de $${payment.price} USD por "${payment.beatName}"? Se generará el contrato y se enviará al comprador.`)) {
        return;
    }

    try {
        // 1. Obtener datos del beat
        const beatDocRef = doc(db, "users", window.currentUser, "beats", payment.beatId);
        const beatSnap = await getDoc(beatDocRef);
        let beatData = beatSnap.exists() ? beatSnap.data() : localBeats.find(b => b.id === payment.beatId);

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

// Bindings to global window object for HTML access and cross-module usage
window.saveCurrentLicenseToHistory = saveCurrentLicenseToHistory;
window.updateHistoryTable = updateHistoryTable;
window.setupHistoryRowEvents = setupHistoryRowEvents;
window.loadLicenseIntoEditor = loadLicenseIntoEditor;
window.clearAllHistory = clearAllHistory;
window.filterHistory = filterHistory;
window.exportHistoryToCSV = exportHistoryToCSV;
window.exportHistoryToJSON = exportHistoryToJSON;
window.loadContacts = loadContacts;
window.autoSaveContact = autoSaveContact;
window.openContactsModal = openContactsModal;
window.closeContactsModal = closeContactsModal;
window.renderContactsTable = renderContactsTable;
window.selectContact = selectContact;
window.deleteContact = deleteContact;
window.loadConsolidatedAccounting = loadConsolidatedAccounting;
window.updateDashboardView = updateDashboardView;
window.renderMonthlySalesChart = renderMonthlySalesChart;
window.showChartTooltip = showChartTooltip;
window.hideChartTooltip = hideChartTooltip;
window.renderLicenseTypesChart = renderLicenseTypesChart;
window.renderTopBeatsChart = renderTopBeatsChart;
window.renderTopBuyersTable = renderTopBuyersTable;
window.loadPendingPaymentsAdmin = loadPendingPaymentsAdmin;
window.approvePaymentAdmin = approvePaymentAdmin;
window.rejectPaymentAdmin = rejectPaymentAdmin;
window.loadReferralData = loadReferralData;
window.deactivateVipCodeAdmin = deactivateVipCodeAdmin;
window.generateVipCodeAdmin = generateVipCodeAdmin;
window.loadVipCodesAdmin = loadVipCodesAdmin;
window.triggerReferralConversion = triggerReferralConversion;
window.saveAllContacts = saveAllContacts;
window.saveAllBeats = saveAllBeats;
window.handleBeatStarsCsvImport = handleBeatStarsCsvImport;
window.requestNotificationPermission = requestNotificationPermission;
window.loadSalesDataFallback = loadSalesDataFallback;
window.loadSalesData = loadSalesData;
window.renderSalesTable = renderSalesTable;
window.renderSalesStats = renderSalesStats;
window.approveBeatSale = approveBeatSale;
window.rejectBeatSale = rejectBeatSale;
window.acceptExclusiveOffer = acceptExclusiveOffer;
