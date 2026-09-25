import { LICENSE_CONFIGS } from '../config.js';
import { TRANSLATIONS } from '../i18n.js';
import { db, doc, updateDoc, deleteDoc, collection, getDocs, writeBatch, auth } from "../firebase.js";
import {
    getLicenseReferenceVersion,
    isValidLicenseReference,
    normalizeLicenseReference,
    resolveLicenseReference
} from '../license-reference.js';

// Locals / Globals
const currentLang = typeof window !== 'undefined' ? (window.currentLang || 'es') : 'es';
const showToast = (...args) => (typeof window !== 'undefined' && window.showToast ? window.showToast(...args) : console.log(...args));
const loadScript = (...args) => (typeof window !== 'undefined' && window.loadScript ? window.loadScript(...args) : Promise.resolve());
const sanitizeHtml = (...args) => (typeof window !== 'undefined' && window.sanitizeHtml ? window.sanitizeHtml(...args) : args[0]);
const autoSaveContact = (...args) => (typeof window !== 'undefined' && window.autoSaveContact ? window.autoSaveContact(...args) : undefined);
const getActiveLicenseType = (...args) => (typeof window !== 'undefined' && window.getActiveLicenseType ? window.getActiveLicenseType(...args) : 'basic');
const checkPlanLimitExceeded = (...args) => (typeof window !== 'undefined' && window.checkPlanLimitExceeded ? window.checkPlanLimitExceeded(...args) : false);
const saveHistory = (...args) => (typeof window !== 'undefined' && window.saveHistory ? window.saveHistory(...args) : Promise.resolve());
const loadHistory = (...args) => (typeof window !== 'undefined' && window.loadHistory ? window.loadHistory(...args) : Promise.resolve());
const downloadPDF = (...args) => (typeof window !== 'undefined' && window.downloadPDF ? window.downloadPDF(...args) : Promise.resolve());
const generatePreview = (...args) => (typeof window !== 'undefined' && window.generatePreview ? window.generatePreview(...args) : undefined);
const updateDashboardView = (...args) => (typeof window !== 'undefined' && window.updateDashboardView ? window.updateDashboardView(...args) : undefined);
const safeCreateIcons = (...args) => {
    if (typeof window !== 'undefined' && typeof window.safeCreateIcons === 'function') {
        return window.safeCreateIcons(...args);
    }
    if (typeof lucide !== 'undefined' && typeof lucide.createIcons === 'function') {
        return lucide.createIcons();
    }
};
const initTooltips = () => {
    if (typeof window !== 'undefined' && typeof window.initTooltips === 'function') {
        window.initTooltips();
    }
};

let salesChartInstance = null;

// Lista cerrada aprobada por Sossa el 2026-09-16. El archivado por lote nunca
// busca por palabras ni fechas: sólo puede afectar estas referencias de prueba.
const CONFIRMED_TEST_LICENSE_REFS = new Set([
    'cs_test_a1PXOM5SxUUwYlyuYLYiGp7yf8oYfz2hJff2pTdbNosRmYoLzGGkW79Pid',
    'cs_test_a1AtV9XluVCsm5rqAyNybdvqNyEvKwg0PvCvEAhlmx3HeaNBU0yB1DyP0g',
    'cs_test_a15dLEmxpeK2rWRW2QxzYzUipsU4cUFFgmdTr1ZZe5mroDCtunkMLfALV1',
    'cs_test_a1zMHTiSHCeCkbEKtiTC0WC9QpmIhVfQ2g242mVL5Q6jcICvscSyEBJzSN',
    'cs_test_a1tb5GqRihPUHXOYnJFsuTxuw4tNzcTgfwrGBeM81Bsb5mwYACsfKKCc5h',
    'cs_test_a1o2FwVm5RMZyd9nb7A780id2WUrRzeXhIySk5kC1fu986qzclRaBcbNU1',
    'LIC-BAS-20260605-6364',
    'LIC-BAS-20260605-7214',
    'LIC-BAS-20260605-7537'
]);

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

function sriRecordId(license) {
    return String(license?.firestoreId || license?.id || license?.refCode || license?.reference || '').trim();
}

async function openSriArtifact(url, filename) {
    const token = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    const localHeaders = window.getLocalHeaders ? await window.getLocalHeaders() : {};
    const localAuth = localHeaders.Authorization;
    const response = await fetch(url, {
        headers: {
            ...localHeaders,
            ...(localAuth ? { 'X-Local-Auth': localAuth } : {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
    });
    if (!response.ok) {
        let detail = 'No se pudo descargar el comprobante SRI';
        try { detail = (await response.json()).error || detail; } catch (_) {}
        throw new Error(detail);
    }
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
}

function findLicenseFromButton(btn) {
    if (!btn || !window.licenseHistory || !window.licenseHistory.length) return null;
    const idx = parseInt(btn.dataset.index, 10);
    if (!isNaN(idx) && window.licenseHistory[idx]) {
        return window.licenseHistory[idx];
    }
    const id = btn.dataset.id;
    const ref = btn.dataset.ref;
    return window.licenseHistory.find(l => {
        if (!l) return false;
        if (id && l.id === id) return true;
        if (ref) {
            if (l.refCode === ref || l.reference === ref || l.contractReference === ref) return true;
            if (typeof resolveLicenseReference === 'function' && resolveLicenseReference(l) === ref) return true;
        }
        return false;
    }) || null;
}

function isArchivedLicense(license) {
    return license?.historyStatus === 'archived' || Boolean(license?.archivedAt);
}

function getActiveLicenses() {
    return (window.licenseHistory || []).filter((license) => !isArchivedLicense(license));
}

function getArchivedLicenses() {
    return (window.licenseHistory || []).filter(isArchivedLicense);
}

function getArchiveReason(license) {
    const reference = resolveLicenseReference(license) || license?.refCode || license?.reference || '';
    const beatName = String(license?.beatName || '').trim();
    return reference.startsWith('cs_test_') || /^prueba/i.test(beatName)
        ? 'Registro de prueba eliminado por Sossa'
        : 'Archivada por el productor';
}

function getLicenseReference(license) {
    return (typeof resolveLicenseReference === 'function' ? resolveLicenseReference(license) : null)
        || license?.refCode || license?.reference || license?.contractReference || '';
}

function isConfirmedTestLicense(license) {
    return CONFIRMED_TEST_LICENSE_REFS.has(getLicenseReference(license));
}

function persistHistoryCache() {
    if (!window.currentUser || !Array.isArray(window.licenseHistory)) return;
    const value = JSON.stringify(window.licenseHistory);
    if (typeof window.safeSetItem === 'function') {
        window.safeSetItem(`${window.currentUser}_license_history`, value);
    } else {
        localStorage.setItem(`${window.currentUser}_license_history`, value);
    }
}

async function findFirestoreLicenseDocument(license) {
    if (!window.currentUser) return null;
    if (license?.firestoreId) {
        return doc(db, 'users', window.currentUser, 'licencias', license.firestoreId);
    }

    // Los registros antiguos pueden tener un ID interno distinto a su
    // referencia. Como respaldo, se encuentra el documento por sus datos, no
    // se asume una ruta basada en la referencia visible.
    const expectedReference = getLicenseReference(license);
    if (!expectedReference) return null;
    const snapshots = await getDocs(collection(db, 'users', window.currentUser, 'licencias'));
    return snapshots.docs.find((docSnap) => getLicenseReference(docSnap.data()) === expectedReference)?.ref || null;
}

async function archiveConfirmedTestLicenses() {
    if (!window.currentUser) throw new Error('Debes iniciar sesión para archivar estas pruebas.');

    const snapshots = await getDocs(collection(db, 'users', window.currentUser, 'licencias'));
    const documentsByReference = new Map();
    snapshots.forEach((docSnap) => {
        const reference = getLicenseReference(docSnap.data());
        if (!CONFIRMED_TEST_LICENSE_REFS.has(reference)) return;
        const docs = documentsByReference.get(reference) || [];
        docs.push(docSnap);
        documentsByReference.set(reference, docs);
    });

    const missing = [...CONFIRMED_TEST_LICENSE_REFS].filter((reference) => !documentsByReference.has(reference));
    if (missing.length) {
        throw new Error(`No se archivó nada: faltan ${missing.length} de las 9 referencias de prueba aprobadas.`);
    }

    const archivedAt = new Date().toISOString();
    const archivePatch = {
        historyStatus: 'archived',
        archivedAt,
        archiveReason: 'Registro de prueba eliminado por Sossa'
    };
    const batch = writeBatch(db);
    documentsByReference.forEach((docs) => docs.forEach((docSnap) => batch.update(docSnap.ref, archivePatch)));
    await batch.commit();

    window.licenseHistory = (window.licenseHistory || []).map((license) => (
        isConfirmedTestLicense(license) ? { ...license, ...archivePatch } : license
    ));
    persistHistoryCache();
    updateHistoryTable();
    return { references: [...documentsByReference.keys()], archivedAt };
}

function renderConfirmedTestArchiveAction() {
    const button = document.getElementById('btn-archive-confirmed-tests');
    if (!button) return;
    const remaining = getActiveLicenses().filter(isConfirmedTestLicense).length;
    button.hidden = remaining === 0;
    button.disabled = remaining !== CONFIRMED_TEST_LICENSE_REFS.size;
    button.querySelector('span').textContent = remaining === CONFIRMED_TEST_LICENSE_REFS.size
        ? 'Archivar 9 pruebas confirmadas'
        : `Pruebas pendientes: ${remaining}/9`;
}

function setupConfirmedTestArchiveAction() {
    const button = document.getElementById('btn-archive-confirmed-tests');
    if (!button || button.dataset.bound === 'true') return;
    button.dataset.bound = 'true';
    button.addEventListener('click', async () => {
        const confirmed = confirm('Se archivarán únicamente las 9 referencias de prueba ya aprobadas. No se tocarán ventas reales, pagos, PDFs ni entregas. ¿Continuar?');
        if (!confirmed) return;
        const original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<i data-lucide="loader" class="animate-spin" aria-hidden="true"></i><span>Archivando 9 pruebas…</span>';
        safeCreateIcons();
        try {
            const result = await archiveConfirmedTestLicenses();
            showToast(`${result.references.length} registros de prueba archivados con trazabilidad.`);
        } catch (error) {
            console.error('Error al archivar pruebas confirmadas:', error);
            showToast(error?.message || 'No se pudo archivar las pruebas. No se modificó el registro activo.', true);
        } finally {
            button.innerHTML = original;
            renderConfirmedTestArchiveAction();
            safeCreateIcons();
        }
    });
}

function renderArchivedLicenses() {
    const section = document.getElementById('deleted-licenses-section');
    const count = document.getElementById('deleted-licenses-count');
    const list = document.getElementById('deleted-licenses-list');
    if (!section || !count || !list) return;

    const archived = getArchivedLicenses();
    count.textContent = archived.length;
    list.replaceChildren();
    section.hidden = archived.length === 0;
    if (archived.length === 0) return;

    archived
        .slice()
        .sort((a, b) => String(b.archivedAt || '').localeCompare(String(a.archivedAt || '')))
        .forEach((license) => {
            const row = document.createElement('article');
            row.className = 'deleted-license-record';
            const title = document.createElement('strong');
            title.textContent = resolveLicenseReference(license) || license.refCode || license.reference || 'Sin referencia';
            const detail = document.createElement('span');
            const archivedDate = license.archivedAt
                ? new Date(license.archivedAt).toLocaleString(currentLang === 'es' ? 'es-EC' : 'en-US')
                : '—';
            detail.textContent = `${license.beatName || 'Beat sin nombre'} · ${license.archiveReason || 'Archivada'} · ${archivedDate}`;
            row.append(title, detail);
            list.appendChild(row);
        });
}

async function downloadLicensePdfFromHistory(lic, btnEl) {
    if (!lic) {
        showToast(currentLang === 'es' ? 'No se encontró la información de la licencia.' : 'License information not found.', true);
        return;
    }

    const refCode = (typeof resolveLicenseReference === 'function' ? resolveLicenseReference(lic) : null) || lic.refCode || lic.reference || 'LIC-DOC';
    const beatName = lic.beatName || 'Beat';
    const buyerName = lic.buyerName || 'Comprador';
    const type = lic.type || 'basic';
    const lang = window.currentLang || currentLang || 'es';
    const cleanFileName = `Licencia_${type.toUpperCase()}_${refCode} - ${beatName} - ${buyerName}.pdf`
        .replace(/[/\\?%*:|"<>]/g, '_');

    // 1. Si ya tiene URL de PDF guardada en Cloud Storage, descargar directamente
    if (lic.contractPdfUrl && typeof lic.contractPdfUrl === 'string' && lic.contractPdfUrl.startsWith('http')) {
        const a = document.createElement('a');
        a.href = lic.contractPdfUrl;
        a.download = cleanFileName;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast(lang === 'en' ? 'Downloading PDF contract...' : 'Descargando contrato PDF...');
        return;
    }

    // 2. Feedback visual en el botón cliqueado
    let originalHtml = '';
    if (btnEl) {
        originalHtml = btnEl.innerHTML;
        btnEl.disabled = true;
        btnEl.innerHTML = `<i data-lucide="loader" class="animate-spin" style="width:13px;height:13px;margin-right:4px;"></i><span>${lang === 'en' ? 'Generating...' : 'Generando...'}</span>`;
        safeCreateIcons();
    }

    // 3. Crear sandbox off-screen y compilar contrato
    let sandbox = null;
    try {
        if (typeof html2pdf === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }

        let compiler = window.compileContractData;
        if (typeof compiler !== 'function') {
            try {
                const editorModule = await import('../editor.js');
                compiler = editorModule?.compileContractData || window.compileContractData;
            } catch (importErr) {
                console.warn('[BEATSS] Error cargando editor.js para compilación de contrato:', importErr);
            }
        }
        if (typeof compiler !== 'function') {
            throw new Error(lang === 'en' ? 'Contract compiler not available.' : 'El compilador de contratos no está disponible.');
        }

        const pConfig = window.producerConfig || lic.producerConfig || lic.producer || { name: 'Productor', aka: 'Productor' };
        const contractData = compiler(lic, pConfig, lic.templateId || 'licencia_uso', lang);
        if (!contractData || !contractData.html) {
            throw new Error(lang === 'en' ? 'Failed to compile contract document.' : 'No se pudo compilar el documento del contrato.');
        }

        sandbox = document.createElement('div');
        sandbox.id = 'pdf-render-sandbox';
        sandbox.style.position = 'fixed';
        sandbox.style.left = '-9999px';
        sandbox.style.top = '0';
        sandbox.style.width = '794px';
        sandbox.style.background = '#ffffff';
        sandbox.style.zIndex = '-9999';
        sandbox.style.pointerEvents = 'none';
        sandbox.innerHTML = contractData.html;
        document.body.appendChild(sandbox);

        const targetEl = sandbox.querySelector('.contract-doc') || sandbox.querySelector('.contract-preview') || sandbox;
        targetEl.classList.add('printing-pdf');

        const opt = {
            margin: [15, 20, 15, 20],
            filename: cleanFileName,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
            jsPDF: { unit: 'mm', format: 'letter', orientation: 'portrait' },
            pagebreak: { mode: ['css', 'legacy'], avoid: ['.contract-closure', '.non-exclusive-acceptance-wrapper', '.contract-signatures-wrapper', '.digital-seal-container', '.contract-heading-group'] }
        };

        await html2pdf().from(targetEl).set(opt).save();
        showToast(lang === 'en' ? 'PDF contract downloaded successfully' : 'Contrato PDF descargado con éxito');
    } catch (err) {
        console.error('Error al generar PDF desde el historial:', err);
        showToast(lang === 'en' ? `Error generating PDF: ${err.message}` : `Error al generar el PDF: ${err.message}`, true);
    } finally {
        if (sandbox && sandbox.parentNode) {
            sandbox.parentNode.removeChild(sandbox);
        }
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerHTML = originalHtml;
            safeCreateIcons();
        }
    }
}

function saveCurrentLicenseToHistory(silent = false) {
    const beatName = document.getElementById('beat-name').value.trim();
    const buyerName = document.getElementById('buyer-name').value.trim();
    const value = parseFloat(document.getElementById('license-value').value) || 0;
    const refCode = normalizeLicenseReference(document.getElementById('ref-code').value);
    const effectiveDate = document.getElementById('effective-date').value;
    const type = getActiveLicenseType();

    const existingIndex = window.licenseHistory.findIndex((license) => {
        const historicalReference = resolveLicenseReference(license) || license.refCode;
        return historicalReference === refCode || license.refCode === refCode;
    });
    const historicalRecord = existingIndex !== -1 ? window.licenseHistory[existingIndex] : null;
    if (!isValidLicenseReference(refCode)) {
        if (!silent) {
            showToast('No se guardó la licencia: falta un código de referencia válido. Los borradores sin referencia no cuentan como licencias.', true);
        }
        return false;
    }

    // Guardar contacto automáticamente solo después de confirmar que el
    // documento puede constituir una licencia oficial.
    autoSaveContact();

    if (!buyerName) {
        if (silent !== true) {
            showToast('Por favor escribe el nombre de quien compra antes de guardar', true);
        }
        return false;
    }

    const index = existingIndex;
    const existing = historicalRecord;
    const now = new Date().toISOString();
    const localNow = new Date();
    const today = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-${String(localNow.getDate()).padStart(2, '0')}`;

    const licenseData = {
        refCode,
        // La misma referencia pública se guarda en las tres claves por
        // compatibilidad con el historial anterior y los lectores del portal.
        // Los registros históricos conservan su propio formato al recargarse.
        reference: existing?.reference || refCode,
        contractReference: existing?.contractReference || refCode,
        referenceVersion: existing?.referenceVersion || getLicenseReferenceVersion(refCode),
        // Un reintento silencioso de PDF/correo no puede alterar la fecha
        // legal ya registrada para una referencia existente.
        date: (silent === true && existing?.date) || effectiveDate || existing?.date || today,
        issuedAt: existing?.issuedAt || now,
        updatedAt: now,
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

    const snapshot = {
        refCode: licenseData.refCode,
        reference: licenseData.reference,
        contractReference: licenseData.contractReference,
        referenceVersion: licenseData.referenceVersion,
        contractEffectiveDate: licenseData.date,
        beatName: licenseData.beatName,
        buyerName: licenseData.buyerName,
        buyerId: licenseData.formData.buyerId,
        buyerEmail: licenseData.formData.buyerEmail,
        buyerPhone: licenseData.formData.buyerPhone,
        buyerCity: licenseData.formData.buyerCity,
        buyerCountry: licenseData.formData.buyerCountry,
        licenseType: licenseData.type,
        value: licenseData.value,
        paymentMethod: licenseData.paymentMethod,
        celebrationPlace: licenseData.formData.celebrationPlace,
        ...licenseData.formData
    };
    licenseData.contractEffectiveDate = licenseData.date;
    licenseData.contractSnapshot = (silent === true && existing?.contractSnapshot)
        ? existing.contractSnapshot
        : snapshot;

    const isSilent = silent === true;

    // Verificar si ya existe una con ese mismo código de referencia para actualizarla
    if (index !== -1) {
        window.licenseHistory[index] = { ...existing, ...licenseData };
        if (!isSilent) showToast('Licencia actualizada en el historial');
    } else {
        // Límite del Plan Inicial
        if (checkPlanLimitExceeded('guardar esta nueva licencia en el historial')) {
            return false;
        }
        window.licenseHistory.unshift(licenseData);
        if (!isSilent) showToast('Licencia guardada en el historial');
    }

    saveHistory();
    return true;
}

function updateHistoryTable() {
    const legacyUser = getLegacyUser();
    const tbody = document.getElementById('history-table-body');
    const emptyEl = document.getElementById('history-empty');
    const badgeEl = document.getElementById('history-count');
    const statsContainer = document.getElementById('history-stats-container');
    const mainLayout = document.getElementById('history-main-layout');
    if (!tbody || !emptyEl || !badgeEl) return;
    
    const activeLicenses = getActiveLicenses();
    tbody.innerHTML = '';
    badgeEl.textContent = activeLicenses.length;
    renderArchivedLicenses();
    renderConfirmedTestArchiveAction();
    setupConfirmedTestArchiveAction();

    if (activeLicenses.length === 0) {
        emptyEl.hidden = false;
        emptyEl.style.display = 'flex';
        const emptyTitle = emptyEl.querySelector('h2, h3');
        const emptyDescription = emptyEl.querySelector('p:last-child');
        if (emptyTitle) {
            emptyTitle.textContent = currentLang === 'es' ? 'No hay licencias registradas' : 'No licenses registered';
        }
        if (emptyDescription) {
            emptyDescription.textContent = currentLang === 'es'
                ? 'Las licencias que guardes aparecerán en esta lista para descargarlas o copiarlas rápidamente.'
                : 'Saved licenses will appear in this list for quick download or copying.';
        }
        if (mainLayout) {
            mainLayout.hidden = true;
            mainLayout.style.display = 'none';
        }
        if (statsContainer) {
            statsContainer.hidden = true;
            statsContainer.style.display = 'none';
        }
        const chartContainer = document.getElementById('history-chart-container');
        if (chartContainer) chartContainer.hidden = true;
        return;
    }

    emptyEl.hidden = true;
    emptyEl.style.display = 'none';
    if (mainLayout) {
        mainLayout.hidden = false;
        mainLayout.style.display = 'grid';
    }

    if (statsContainer) {
        statsContainer.hidden = false;
        statsContainer.style.display = 'grid';
        const totalCollected = activeLicenses.reduce((sum, lic) => sum + (Number(lic.value) || 0), 0);
        document.getElementById('stat-total-collected').textContent = `$${totalCollected.toFixed(2)}`;
        document.getElementById('stat-total-licenses').textContent = activeLicenses.length;
        const avg = activeLicenses.length > 0 ? (totalCollected / activeLicenses.length) : 0;
        document.getElementById('stat-average-value').textContent = `$${avg.toFixed(2)}`;

        // ── Promedio Mensual ─────────────────────────────────────────────
        const monthlyMap = {};
        activeLicenses.forEach(lic => {
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
            chartContainer.hidden = false;
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
                                    borderColor: '#3157e8',
                                    backgroundColor: 'rgba(49, 87, 232, 0.12)',
                                    pointBackgroundColor: '#ffffff',
                                    pointBorderColor: '#3157e8',
                                    pointBorderWidth: 2,
                                    pointRadius: 3,
                                    borderWidth: 2.5,
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

    activeLicenses.forEach((lic) => {
        const idx = window.licenseHistory.indexOf(lic);
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
        const refCode = resolveLicenseReference(lic) || lic.refCode || '';
        const date    = lic.date || '';
        const beat    = lic.beatName || '';
        const buyer   = lic.buyerName || '';

        const tdRef   = document.createElement('td'); tdRef.className = 'license-record-ref'; tdRef.dataset.label = currentLang === 'es' ? 'Referencia' : 'Reference';
        const spanRef = document.createElement('span'); spanRef.className = 'ref-code-cell'; spanRef.title = refCode; spanRef.textContent = refCode;
        tdRef.appendChild(spanRef);

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'btn-copy-ref-badge';
        copyBtn.title = currentLang === 'es' ? 'Copiar código' : 'Copy code';
        copyBtn.setAttribute('aria-label', currentLang === 'es' ? 'Copiar referencia' : 'Copy reference');
        copyBtn.innerHTML = '<i data-lucide="copy" style="width:11px;height:11px;"></i>';
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (refCode && navigator.clipboard) {
                navigator.clipboard.writeText(refCode).then(() => {
                    showToast(currentLang === 'es' ? `Código copiado: ${refCode}` : `Reference copied: ${refCode}`);
                }).catch(() => {});
            }
        });
        tdRef.appendChild(copyBtn);

        const tdDate = document.createElement('td'); tdDate.className = 'license-record-date'; tdDate.dataset.label = currentLang === 'es' ? 'Fecha' : 'Date'; tdDate.textContent = date;
        const tdBeat = document.createElement('td'); tdBeat.className = 'license-record-beat'; tdBeat.dataset.label = currentLang === 'es' ? 'Beat' : 'Beat';
        const strongBeat = document.createElement('strong'); strongBeat.textContent = beat; tdBeat.appendChild(strongBeat);
        const tdBuyer = document.createElement('td'); tdBuyer.className = 'license-record-buyer'; tdBuyer.dataset.label = currentLang === 'es' ? 'Comprador' : 'Buyer'; tdBuyer.textContent = buyer;

        const tdType  = document.createElement('td'); tdType.className = 'license-record-type'; tdType.dataset.label = currentLang === 'es' ? 'Tipo' : 'Type';
        const spanType = document.createElement('span'); spanType.className = `type-badge ${typeKey}`; spanType.textContent = typeLabels[typeKey] || typeKey;
        tdType.appendChild(spanType);

        const tdValue = document.createElement('td'); tdValue.className = 'license-record-value'; tdValue.dataset.label = currentLang === 'es' ? 'Valor' : 'Value'; tdValue.textContent = `$${licenseValue.toFixed(2)}`;

        // --- Celda Facturación SRI ---
        const tdSri = document.createElement('td');
        tdSri.className = 'license-record-sri';
        tdSri.dataset.label = currentLang === 'es' ? 'Facturación SRI' : 'SRI Invoicing';
        
        const sriContainer = document.createElement('div');
        sriContainer.className = 'sri-container';
        
        const sriEstado = lic.sriEstado || '';
        const sriError = lic.sriErrorMensaje || '';
        
        const manualFilesPending = sriEstado === 'ARCHIVOS_MANUALES_REGISTRADOS' && lic.sriManualArtifactsStatus === 'PENDING_OWNER_VERIFICATION';
        const manualFilesVerified = sriEstado === 'ARCHIVOS_MANUALES_VERIFICADOS' && lic.sriManualArtifactsStatus === 'OWNER_VERIFIED';
        if (sriEstado === 'AUTORIZADO' || manualFilesPending || manualFilesVerified) {
            const badge = document.createElement('span');
            const manualImport = manualFilesPending || manualFilesVerified;
            badge.className = manualImport ? 'sri-badge pendiente' : 'sri-badge autorizado';
            badge.textContent = manualFilesPending
                ? (currentLang === 'es' ? 'ARCHIVOS MANUALES · REVISAR' : 'MANUAL FILES · REVIEW')
                : manualFilesVerified
                    ? (currentLang === 'es' ? 'REVISIÓN HUMANA CONFIRMADA' : 'HUMAN REVIEW CONFIRMED')
                    : (currentLang === 'es' ? 'AUTORIZADO' : 'AUTHORIZED');
            if (manualFilesPending) badge.title = 'Archivos adjuntados manualmente; confirma autenticidad y datos en SRI.';
            if (manualFilesVerified) badge.title = 'El titular confirmó la revisión en el portal SRI. BEATSS no validó criptográficamente la firma.';
            sriContainer.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            
            // Botón RIDE PDF
            const btnRide = document.createElement('a');
            btnRide.className = 'btn-sri-action';
            const rideUrl = `/api/payments/download-ride?paymentId=${encodeURIComponent(sriRecordId(lic))}&user=${encodeURIComponent(legacyUser)}`;
            btnRide.href = rideUrl;
            btnRide.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    await openSriArtifact(rideUrl, `Factura_${sriRecordId(lic)}.pdf`);
                } catch (error) {
                    showToast(`❌ ${error.message}`, true);
                }
            });
            btnRide.title = currentLang === 'es' ? 'Descargar RIDE PDF' : 'Download RIDE PDF';
            btnRide.innerHTML = `<i data-lucide="file-text"></i> PDF`;
            actions.appendChild(btnRide);
            
            // Botón XML
            const btnXml = document.createElement('a');
            btnXml.className = 'btn-sri-action';
            const xmlUrl = `/api/payments/download-xml?paymentId=${encodeURIComponent(sriRecordId(lic))}&user=${encodeURIComponent(legacyUser)}`;
            btnXml.href = xmlUrl;
            btnXml.addEventListener('click', async (event) => {
                event.preventDefault();
                try {
                    await openSriArtifact(xmlUrl, `Factura_${sriRecordId(lic)}.xml`);
                } catch (error) {
                    showToast(`❌ ${error.message}`, true);
                }
            });
            btnXml.title = currentLang === 'es' ? 'Descargar XML Autorizado' : 'Download Authorized XML';
            btnXml.innerHTML = `<i data-lucide="code"></i> XML`;
            actions.appendChild(btnXml);
            
            sriContainer.appendChild(actions);
        } else if (['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA', 'PENDING_AUTORIZACION'].includes(sriEstado)) {
            const badge = document.createElement('span');
            badge.className = 'sri-badge pendiente';
            const isContingency = sriEstado === 'CONTINGENCIA';
            const isQueued = sriEstado === 'EN_COLA_EMISION';
            const isProcessing = sriEstado === 'EN_PROCESO';
            badge.textContent = currentLang === 'es'
                ? (isContingency ? 'EN CONTINGENCIA' : (isQueued ? 'EN COLA DE EMISIÓN' : (isProcessing ? 'EN PROCESO SRI' : 'PENDIENTE DE AUTORIZACIÓN')))
                : (isContingency ? 'SRI CONTINGENCY' : (isQueued ? 'ISSUANCE QUEUED' : (isProcessing ? 'SRI PROCESSING' : 'AUTHORIZATION PENDING')));
            badge.title = currentLang === 'es'
                ? (isContingency
                    ? 'El comprobante espera un nuevo intento de conexión con el SRI.'
                    : (isQueued
                        ? 'El comprobante fue solicitado y espera su emisión; todavía no se ha enviado al SRI.'
                        : (isProcessing
                            ? 'BEATSS está firmando o enviando el comprobante al SRI.'
                            : 'El SRI recibió el comprobante y falta su autorización final.')))
                : (isContingency
                    ? 'The receipt is waiting for another connection attempt with the SRI.'
                    : (isQueued
                        ? 'The receipt was requested and is waiting for issuance; it has not been sent to the SRI yet.'
                        : (isProcessing
                            ? 'BEATSS is signing or sending the receipt to the SRI.'
                            : 'The SRI received the receipt and final authorization is pending.')));
            sriContainer.appendChild(badge);
        } else if (sriEstado === 'AUTORIZADO_ENTREGA_PENDIENTE' || sriEstado === 'ERROR_REQUIERE_REVISION') {
            const badge = document.createElement('span');
            badge.className = 'sri-badge fallido';
            badge.textContent = currentLang === 'es' ? 'REVISIÓN NECESARIA' : 'REVIEW REQUIRED';
            badge.title = sriEstado === 'AUTORIZADO_ENTREGA_PENDIENTE'
                ? 'La factura ya fue autorizada; falta recuperar sus archivos. No vuelvas a emitirla.'
                : 'Verifica la operación y su clave de acceso antes de cualquier nuevo intento.';
            sriContainer.appendChild(badge);
        } else if (sriEstado === 'NO_CONFIGURADO') {
            const badge = document.createElement('span');
            badge.className = 'sri-badge fallido tooltip-left';
            badge.textContent = currentLang === 'es' ? 'CONFIGURACIÓN PENDIENTE' : 'SETUP REQUIRED';
            badge.title = sriError || 'Completa la configuración SRI antes de solicitar la emisión.';
            sriContainer.appendChild(badge);
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            const btnRetry = document.createElement('button');
            btnRetry.className = 'btn-sri-action btn-sri-retry';
            btnRetry.dataset.id = lic.firestoreId || lic.id || lic.refCode;
            btnRetry.textContent = currentLang === 'es' ? 'Solicitar' : 'Request';
            actions.appendChild(btnRetry);
            sriContainer.appendChild(actions);
        } else if (sriEstado === 'ERROR_COLA' || sriEstado.startsWith('ERROR_') || sriEstado.startsWith('RECHAZADO_')) {
            const badge = document.createElement('span');
            badge.className = 'sri-badge fallido tooltip-left';
            badge.textContent = currentLang === 'es' ? 'FALLIDO' : 'FAILED';
            badge.title = sriError || sriEstado;
            sriContainer.appendChild(badge);

            // Después de un error podría existir una clave ya recibida por el
            // SRI. No ofrecer otro envío hasta conciliar ese comprobante.
        } else {
            const badge = document.createElement('span');
            badge.className = 'sri-badge no-emitida';
            badge.textContent = currentLang === 'es' ? 'NO EMITIDA' : 'NOT ISSUED';
            sriContainer.appendChild(badge);
            
            const actions = document.createElement('div');
            actions.className = 'sri-actions';
            
            const btnRetry = document.createElement('button');
            btnRetry.className = 'btn-sri-action btn-sri-retry';
            btnRetry.dataset.id = lic.firestoreId || lic.id || lic.refCode;
            btnRetry.title = currentLang === 'es' ? 'Solicitar emisión fiscal manual' : 'Request manual fiscal issuance';
            btnRetry.innerHTML = `<i data-lucide="plus"></i> ${currentLang === 'es' ? 'Solicitar' : 'Request'}`;
            actions.appendChild(btnRetry);
            
            sriContainer.appendChild(actions);
        }
        tdSri.appendChild(sriContainer);

        const tdActions = document.createElement('td'); tdActions.className = 'actions-cell license-record-actions';
        const safeRef = refCode.replace(/"/g, '&quot;');
        const safeId = (lic.id || '').replace(/"/g, '&quot;');
        
        const titleLoad = currentLang === 'es' ? 'Cargar en el editor' : 'Load into editor';
        const titlePdf = currentLang === 'es' ? 'Descargar PDF' : 'Download PDF';
        const titleDelete = currentLang === 'es' ? 'Archivar del registro activo' : 'Archive from active register';

        tdActions.innerHTML = `
            <button class="btn-icon-only btn-row-load" data-index="${idx}" data-id="${safeId}" data-ref="${safeRef}" title="${titleLoad}"><i data-lucide="edit-3"></i><span>${currentLang === 'es' ? 'Editar' : 'Edit'}</span></button>
            <button class="btn-icon-only btn-row-pdf" data-index="${idx}" data-id="${safeId}" data-ref="${safeRef}" title="${titlePdf}"><i data-lucide="file-text"></i><span>PDF</span></button>
            <button class="btn-icon-only btn-row-delete text-danger tooltip-left" data-index="${idx}" data-id="${safeId}" data-ref="${safeRef}" title="${titleDelete}"><i data-lucide="archive"></i><span>${currentLang === 'es' ? 'Archivar' : 'Archive'}</span></button>
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
            const lic = findLicenseFromButton(btn);
            if (lic) {
                loadLicenseIntoEditor(lic);
                // Cambiar a la pestaña de previsualización / contrato
                if (typeof window.switchTab === 'function') {
                    window.switchTab('tab-preview');
                } else {
                    document.querySelector('.tab-btn[data-tab="tab-preview"]')?.click();
                }
                const refCode = (typeof resolveLicenseReference === 'function' ? resolveLicenseReference(lic) : null) || lic.refCode || lic.reference || '';
                const msg = currentLang === 'es'
                    ? `Licencia ${refCode} cargada en el editor`
                    : `License ${refCode} loaded into editor`;
                showToast(msg);
            } else {
                showToast(currentLang === 'es' ? 'No se encontró la información de la licencia.' : 'License information not found.', true);
            }
        });
    });

    // Descargar PDF del historial directamente
    document.querySelectorAll('.btn-row-pdf').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lic = findLicenseFromButton(btn);
            if (lic) {
                await downloadLicensePdfFromHistory(lic, btn);
            } else {
                showToast(currentLang === 'es' ? 'No se encontró la información de la licencia.' : 'License information not found.', true);
            }
        });
    });

    // Archivar fila: mantiene una trazabilidad privada y la excluye de los
    // totales, sin borrar el documento ni alterar la venta/pago original.
    document.querySelectorAll('.btn-row-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const lic = findLicenseFromButton(btn);
            const ref = lic ? ((typeof resolveLicenseReference === 'function' ? resolveLicenseReference(lic) : null) || lic.refCode || lic.reference || '') : btn.dataset.ref;
            const confirmMsg = currentLang === 'es' 
                ? `¿Archivar la licencia ${ref}? Dejará de contar en el historial activo, pero quedará registrada como eliminada en el archivo privado.`
                : `Archive license ${ref}? It will stop counting in the active register but remain in the private archive.`;
            if (confirm(confirmMsg)) {
                const archivedAt = new Date().toISOString();
                const archiveReason = getArchiveReason(lic);
                const archivePatch = {
                    historyStatus: 'archived',
                    archivedAt,
                    archiveReason
                };

                // Persistir primero en la nube. Si falla, la vista activa no
                // cambia y el registro no queda en un estado ambiguo.
                if (window.currentUser && ref) {
                    try {
                        const licDocRef = await findFirestoreLicenseDocument(lic);
                        if (!licDocRef) throw new Error('No se encontró el documento de esta licencia en la nube.');
                        await updateDoc(licDocRef, archivePatch);
                    } catch (err) {
                        console.error("Error al archivar licencia en Firestore:", err);
                        showToast(currentLang === 'es'
                            ? 'No se pudo archivar la licencia. No se cambió el registro activo.'
                            : 'The license could not be archived. The active register was not changed.', true);
                        return;
                    }
                }

                const index = window.licenseHistory.indexOf(lic);
                if (index !== -1) {
                    window.licenseHistory[index] = { ...lic, ...archivePatch };
                }
                await saveHistory();
                updateHistoryTable();
                showToast(currentLang === 'es'
                    ? 'Licencia archivada y excluida del historial activo'
                    : 'License archived and removed from the active register');
            }
        });
    });

    // Evento Reemitir / Generar Factura SRI
    document.querySelectorAll('.btn-sri-retry').forEach(btn => {
        btn.addEventListener('click', async () => {
            const paymentId = btn.dataset.id;
            const legacyUser = getLegacyUser();
            const producerId = window.currentUser || legacyUser;
            const lic = window.licenseHistory.find(l => (l.id && l.id === paymentId) || (l.firestoreId && l.firestoreId === paymentId) || (l.refCode && l.refCode === paymentId));
            if (lic?.providerLivemode === false || /^cs_test_/i.test(String(lic?.reference || lic?.refCode || paymentId))) {
                showToast('Una compra de prueba no puede generar factura SRI.', true);
                return;
            }
            if (!window.confirm(`¿Solicitas la emisión fiscal de ${lic?.beatName || 'este beat'} para ${lic?.buyerName || 'el comprador'}? Esto sólo crea el trabajo; sin ejecutor activo tendrás que procesarlo puntualmente. Verifica antes el pago aprobado y los datos fiscales.`)) return;
            
            btn.disabled = true;
            btn.innerHTML = `<i data-lucide="refresh-cw" class="animate-spin" style="width: 12px; height: 12px; margin-right: 4px;"></i>...`;
            
            const initMsg = currentLang === 'es'
                ? 'Registrando solicitud fiscal...'
                : 'Registering fiscal request...';
            showToast(initMsg);
            
            try {
                const localApiUrl = '/api/payments/retry-sri';
                const localHeaders = window.getLocalHeaders ? await window.getLocalHeaders() : {};
                if (localHeaders.Authorization) localHeaders['X-Local-Auth'] = localHeaders.Authorization;
                if (auth.currentUser) {
                    localHeaders.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
                }
                const response = await fetch(localApiUrl, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        ...localHeaders
                    },
                    body: JSON.stringify({ paymentId, producerId, confirmManualIssue: true })
                });
                
                const result = await response.json();
                if (response.ok) {
                    const successMsg = result.message || (currentLang === 'es'
                        ? 'Solicitud registrada; aún no es una factura autorizada.'
                        : 'Request registered; not yet an authorized invoice.');
                    showToast(successMsg);
                    
                    // El comprobante sólo queda en cola. “Pendiente de autorización”
                    // se reserva para después de que el SRI reciba el XML.
                    const localLic = window.licenseHistory.find(l => (l.id && l.id === paymentId) || (l.firestoreId && l.firestoreId === paymentId) || (l.refCode && l.refCode === paymentId));
                    if (localLic) {
                        localLic.sriEstado = 'EN_COLA_EMISION';
                        localLic.sriErrorMensaje = '';
                        updateHistoryTable();
                    }
                    
                    // Polling para actualizar el estado del SRI de forma fluida
                    if (result.status === 'WAITING_FOR_OPERATOR') return;
                    let pollCount = 0;
                    const intervalId = setInterval(async () => {
                        pollCount++;
                        await reloadHistoryFromLocalServer();
                        
                        const currentLic = window.licenseHistory.find(l => (l.id && l.id === paymentId) || (l.firestoreId && l.firestoreId === paymentId) || (l.refCode && l.refCode === paymentId));
                        if (!currentLic || currentLic.sriEstado === 'AUTORIZADO' || (currentLic.sriEstado && !['EN_COLA_EMISION', 'EN_PROCESO', 'PENDIENTE_AUTORIZACION', 'CONTINGENCIA'].includes(currentLic.sriEstado) && (currentLic.sriEstado.startsWith('ERROR_') || currentLic.sriEstado.startsWith('RECHAZADO_'))) || pollCount >= 10) {
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
        const localApiUrl = `/api/load-local?user=${encodeURIComponent(legacyUser)}`;
        const headers = window.getLocalHeaders ? await window.getLocalHeaders() : {};
        const res = await fetch(localApiUrl, { headers: headers });
        if (res.ok) {
            const backupData = await res.json();
            const historyStr = backupData[`${user}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]';
            localStorage.setItem(`${user}_license_history`, historyStr);
            window.licenseHistory = JSON.parse(historyStr);
            updateHistoryTable();
        } else if (typeof loadHistory === 'function') {
            // En producción no existe el backup local; usa Firestore como
            // fuente de verdad para que el polling SRI no dependa de localhost.
            await loadHistory();
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
    document.getElementById('ref-code').value = resolveLicenseReference(lic) || lic.refCode || "";
    document.getElementById('effective-date').value = lic.contractEffectiveDate || lic.date || "";
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

    const tableEl = document.querySelector('#tab-history .history-table');
    const emptyEl = document.getElementById('history-empty');
    const statsContainer = document.getElementById('history-stats-container');
    const mainLayout = document.getElementById('history-main-layout');

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
        emptyEl.hidden = false;
        emptyEl.style.display = 'flex';
        emptyEl.querySelector('h3').textContent = 'No se encontraron resultados';
        emptyEl.querySelector('p').textContent = 'Prueba con otra palabra clave o limpia el buscador.';
        if (mainLayout) mainLayout.hidden = true;
        tableEl.style.display = 'none';
        if (statsContainer) {
            statsContainer.hidden = true;
            statsContainer.style.display = 'none';
        }
    } else if (window.licenseHistory.length > 0) {
        emptyEl.hidden = true;
        emptyEl.style.display = 'none';
        if (mainLayout) mainLayout.hidden = false;
        tableEl.style.display = 'table';
        if (statsContainer) {
            statsContainer.hidden = false;
            statsContainer.style.display = 'grid';
        }
    }
}

function sanitizeCsvFormula(value) {
    const raw = String(value ?? '');
    const trimmed = raw.trim();
    if (/^[=+\-@\t\r%]/.test(raw) || /^[=+\-@%]/.test(trimmed)) {
        return `'${raw}`;
    }
    return raw;
}

function formatCsvCell(value) {
    const safeVal = sanitizeCsvFormula(value);
    return `"${safeVal.replace(/"/g, '""')}"`;
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
            formatCsvCell(lic.refCode || ""),
            formatCsvCell(lic.date || ""),
            formatCsvCell(beatName),
            formatCsvCell(buyerName),
            formatCsvCell(fd.buyerId || lic.buyerId || ''),
            formatCsvCell(fd.buyerEmail || lic.buyerEmail || ''),
            formatCsvCell(fd.buyerPhone || lic.buyerPhone || ''),
            formatCsvCell(fd.buyerCity || lic.buyerCity || ''),
            formatCsvCell(fd.buyerCountry || lic.buyerCountry || ''),
            formatCsvCell(type.toUpperCase()),
            Number(val) || 0,
            formatCsvCell(lic.paymentMethod || "Transferencia Bancaria")
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
window.sanitizeCsvFormula = sanitizeCsvFormula;
window.downloadLicensePdfFromHistory = downloadLicensePdfFromHistory;
window.archiveConfirmedTestLicenses = archiveConfirmedTestLicenses;
