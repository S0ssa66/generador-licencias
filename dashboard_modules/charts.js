// Locals / Globals
const currentLang = typeof window !== 'undefined' ? window.currentLang : 'es';
const loadScript = (...args) => typeof window !== 'undefined' ? window.loadScript(...args) : Promise.resolve();
const safeCreateIcons = (...args) => typeof window !== 'undefined' ? window.safeCreateIcons?.(...args) : null;
const initTooltips = (...args) => typeof window !== 'undefined' ? window.initTooltips?.(...args) : null;

export const sanitizeHtml = (value) => {
    if (typeof window !== 'undefined' && typeof window.sanitizeHtml === 'function') {
        return window.sanitizeHtml(value);
    }
    return value == null ? '' : String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};

let monthlySalesChartInstance = null;
let licenseTypesChartInstance = null;
let topBeatsChartInstance = null;

function renderMonthlySalesChart(licenses) {
    const container = document.getElementById('monthly-sales-chart-container');
    if (!container) return;

    let monthsData = [];
    if (Array.isArray(licenses) && licenses.length > 0 && licenses[0].prefix !== undefined) {
        monthsData = licenses;
    } else {
        // Obtener los últimos 6 meses cronológicos
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const yyyy = d.getFullYear();
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const monthLabel = d.toLocaleString(currentLang === 'es' ? 'es-ES' : 'en-US', { month: 'short' });
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
    }

    // Limpiar contenedor e insertar un canvas
    container.innerHTML = '<canvas id="monthly-sales-chart" style="width: 100%; height: 100%; max-height: 220px;"></canvas>';
    
    if (monthlySalesChartInstance) {
        monthlySalesChartInstance.destroy();
        monthlySalesChartInstance = null;
    }

    const ctx = document.getElementById('monthly-sales-chart').getContext('2d');
    
    // Dashboard experimental claro: leer los tokens de Flow, no el acento
    // morado heredado del tema oscuro anterior.
    const rootStyles = getComputedStyle(document.documentElement);
    const accentColor = rootStyles.getPropertyValue('--flow-orange').trim() || '#ff6433';
    const accentAlpha10 = 'rgba(255, 100, 51, 0.12)';

    const labels = monthsData.map(d => d.label);
    const revenues = monthsData.map(d => d.revenue);
    const counts = monthsData.map(d => d.count);

    if (typeof Chart === 'undefined') {
        console.warn("Chart.js no está cargado aún.");
        return;
    }

    monthlySalesChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: currentLang === 'es' ? 'Ingresos ($)' : 'Revenue ($)',
                data: revenues,
                borderColor: accentColor,
                backgroundColor: accentAlpha10,
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: accentColor,
                pointBorderColor: '#fbfaf7',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: '#ffffff',
                    titleColor: '#172238',
                    titleFont: {
                        family: 'Montserrat, sans-serif',
                        weight: 'bold'
                    },
                    bodyColor: '#68758c',
                    bodyFont: {
                        family: 'Outfit, sans-serif'
                    },
                    borderColor: '#dbe3ef',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const index = context.dataIndex;
                            const rev = context.raw;
                            const count = counts[index];
                            return [
                                `${currentLang === 'es' ? 'Ingresos' : 'Revenue'}: $${rev.toFixed(2)}`,
                                `${currentLang === 'es' ? 'Licencias' : 'Licenses'}: ${count}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#d9d8d1',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6c6c68',
                        font: {
                            family: 'Outfit, sans-serif',
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: '#d9d8d1',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#6c6c68',
                        font: {
                            family: 'Outfit, sans-serif',
                            size: 11
                        },
                        callback: function(value) {
                            return '$' + value;
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}

function renderLicenseTypesChart(licenses) {
    const container = document.getElementById('license-types-chart-container');
    if (!container) return;

    if (!Array.isArray(licenses) || licenses.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #718096; padding: 20px;">
                <i data-lucide="pie-chart" style="width: 48px; height: 48px; stroke-width: 1.5; color: #4a5568; margin-bottom: 8px;"></i>
                <div style="font-size: 13px;">${currentLang === 'es' ? 'Sin datos para clasificar' : 'No data to classify'}</div>
            </div>
        `;
        safeCreateIcons();
        return;
    }

    let segments = [];
    if (Array.isArray(licenses) && licenses.length > 0 && licenses[0].pct !== undefined) {
        segments = licenses;
    } else {
        // Contar tipos de licencia
        const typesCount = {};
        licenses.forEach(lic => {
            const type = lic.type || "Desconocido";
            typesCount[type] = (typesCount[type] || 0) + 1;
        });

        // Definir colores y mapear segmentos
        const colors = {
            "Básica": "#3157e8",
            "Premium": "#6680e8",
            "Ilimitada": "#91a4ea",
            "Exclusiva": "#b9c5ec",
            "Desconocido": "#cbd3df"
        };

        segments = Object.keys(typesCount).map(type => {
            const count = typesCount[type];
            const pct = (count / licenses.length) * 100;
            return {
                type,
                count,
                pct,
                color: colors[type] || "#9aa7ba"
            };
        });
    }

    // Limpiar contenedor e insertar estructura para Chart.js con leyenda a la derecha
    container.innerHTML = `
        <div class="sales-license-distribution">
            <div class="sales-license-distribution__chart">
                <canvas id="license-types-chart"></canvas>
                <div class="sales-license-distribution__total">
                    <strong id="license-chart-total">0</strong>
                    <span>${currentLang === 'es' ? 'Ventas' : 'Sales'}</span>
                </div>
            </div>
            <div id="license-chart-legend" class="sales-license-distribution__legend"></div>
        </div>
    `;

    const totalSales = segments.reduce((sum, s) => sum + s.count, 0);
    const totalEl = document.getElementById('license-chart-total');
    if (totalEl) totalEl.textContent = totalSales;

    // Poblar la leyenda
    const legendContainer = document.getElementById('license-chart-legend');
    if (legendContainer) {
        legendContainer.innerHTML = segments.map(seg => `
            <div class="sales-license-distribution__legend-row">
                <div>
                    <span style="background-color: ${seg.color};"></span>
                    <em>${sanitizeHtml(seg.type)}</em>
                </div>
                <strong>${seg.count} <small>(${seg.pct.toFixed(0)}%)</small></strong>
            </div>
        `).join('');
    }

    if (licenseTypesChartInstance) {
        licenseTypesChartInstance.destroy();
        licenseTypesChartInstance = null;
    }

    const ctx = document.getElementById('license-types-chart').getContext('2d');
    
    if (typeof Chart === 'undefined') {
        console.warn("Chart.js no está cargado aún.");
        return;
    }

    licenseTypesChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: segments.map(s => s.type),
            datasets: [{
                data: segments.map(s => s.count),
                backgroundColor: segments.map(s => s.color),
                borderColor: '#fbfaf7', // Fondo del card para separar segmentos
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', // Grosor del donut
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#172238',
                    titleFont: {
                        family: 'Montserrat, sans-serif',
                        weight: 'bold'
                    },
                    bodyColor: '#68758c',
                    bodyFont: {
                        family: 'Outfit, sans-serif'
                    },
                    borderColor: '#dbe3ef',
                    borderWidth: 1,
                    padding: 8,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const val = context.raw;
                            const pct = ((val / totalSales) * 100).toFixed(1);
                            return ` ${label}: ${val} (${pct}%)`;
                        }
                    }
                }
            }
        }
    });
}

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

    let topBeats = [];
    if (Array.isArray(licenses) && licenses.length > 0 && licenses[0].name !== undefined) {
        topBeats = licenses;
    } else {
        // Contar beats
        const beatsCount = {};
        licenses.forEach(lic => {
            if (lic.beatName) {
                beatsCount[lic.beatName] = (beatsCount[lic.beatName] || 0) + 1;
            }
        });

        // Ordenar y tomar los top 5
        topBeats = Object.keys(beatsCount)
            .map(name => ({ name, count: beatsCount[name] }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
    }

    const maxCount = topBeats.length > 0 ? topBeats[0].count : 1;

    let barsHtml = '';
    topBeats.forEach((beat, index) => {
        const pct = (beat.count / maxCount) * 100;
        
        barsHtml += `
            <div class="horizontal-bar-row">
                <div class="horizontal-bar-label-container">
                        <span style="font-weight: 600; color: var(--flow-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">
                        ${index + 1}. ${sanitizeHtml(beat.name)}
                    </span>
                    <span style="font-weight: 700; color: var(--flow-blue);">${beat.count} venta(s)</span>
                </div>
                <div class="horizontal-bar-track">
                    <div class="horizontal-bar-fill" style="width: ${pct}%;"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = barsHtml;
}

function renderTopBuyersTable(buyersData) {
    const tbody = document.getElementById('db-top-buyers-tbody');
    if (!tbody) return;

    tbody.innerHTML = '';

    let buyers = [];
    if (Array.isArray(buyersData)) {
        buyers = buyersData;
    } else {
        buyers = Object.keys(buyersData)
            .map(name => ({
                name,
                count: buyersData[name].count,
                total: buyersData[name].total,
                email: buyersData[name].email
            }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);
    }

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
                <div style="font-weight: 600; color: var(--flow-ink);">${sanitizeHtml(buyer.name)}</div>
                <div style="font-size: 11px; color: var(--flow-muted); max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${sanitizeHtml(buyer.email || 'Sin correo')}</div>
            </td>
            <td style="padding: 10px 0; text-align: center; font-weight: 600; color: var(--flow-ink);">
                ${buyer.count}
            </td>
            <td style="padding: 10px 0; text-align: right; font-weight: 700; color: #2f7c45;">
                $${buyer.total.toFixed(2)}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function updateDashboardView() {
    // 1. Cargar Chart.js de forma diferida vía CDN si no está definido
    try {
        if (typeof Chart === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js');
        }
    } catch (err) {
        console.error("Error al cargar Chart.js desde CDN:", err);
    }

    const periodVal = document.getElementById('dashboard-period')?.value || 'all';
    
    // Si estamos en localhost, consumir el endpoint de analíticas del servidor Python
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        try {
            const user = window.currentUser || 'sossa';
            const headers = window.getLocalHeaders ? await window.getLocalHeaders() : {};
            const response = await fetch(`/api/admin/sales-analytics?period=${periodVal}&user=${user}`, {
                headers: headers
            });
            if (response.ok) {
                const data = await response.json();
                if (!data.error) {
                    // 1. Renderizar KPIs en el DOM
                    const revenueEl = document.getElementById('db-stat-revenue');
                    const licensesEl = document.getElementById('db-stat-licenses');
                    const beatsEl = document.getElementById('db-stat-beats');
                    const topClientEl = document.getElementById('db-stat-top-client');
                    const mrrEl = document.getElementById('db-stat-mrr');
                    const ltvEl = document.getElementById('db-stat-ltv');

                    if (revenueEl) revenueEl.textContent = `$${parseFloat(data.totalRevenue || 0).toFixed(2)}`;
                    if (licensesEl) licensesEl.textContent = data.totalLicenses || 0;
                    if (beatsEl) beatsEl.textContent = data.uniqueBeats || 0;
                    if (topClientEl) {
                        topClientEl.textContent = data.topBuyerName !== 'N/A' 
                            ? `${data.topBuyerName} ($${parseFloat(data.topBuyerVal || 0).toFixed(2)})`
                            : 'N/A';
                        topClientEl.setAttribute('title', data.topBuyerName || 'N/A');
                    }

                    // Calcular MRR y LTV con datos dinámicos del servidor
                    const mrrValue = data.mrr !== undefined ? parseFloat(data.mrr) : ((window.producerConfig?.plan || 'inicial').toLowerCase() === 'elite' ? 30 : ((window.producerConfig?.plan || 'inicial').toLowerCase() === 'pro' ? 10 : 0));
                    if (mrrEl) {
                        mrrEl.textContent = `${currentLang === 'es' ? 'MRR Plataforma' : 'Platform MRR'}: $${mrrValue.toFixed(2)}`;
                    }
                    if (ltvEl) {
                        const ltvValue = data.avgLtv !== undefined ? parseFloat(data.avgLtv) : parseFloat(data.topBuyerVal || 0);
                        ltvEl.textContent = `${currentLang === 'es' ? 'LTV Promedio' : 'Average LTV'}: $${ltvValue.toFixed(2)}`;
                    }

                    // 2. Renderizar Gráficos y Tablas
                    renderMonthlySalesChart(data.monthlySales || []);
                    renderLicenseTypesChart(data.licenseTypes || []);
                    renderTopBeatsChart(data.topBeats || []);
                    renderTopBuyersTable(data.topBuyers || []);

                    // Reinicializar iconos y tooltips
                    safeCreateIcons();
                    initTooltips();
                    return;
                }
            }
        } catch (err) {
            console.warn("Error cargando analíticas desde el servidor, usando respaldo en cliente:", err);
        }
    }

    // Fallback: Filtrar el historial según el periodo seleccionado (Offline en Cliente)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthPrefix = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentYearPrefix = `${currentYear}`;

    const filtered = (window.licenseHistory || []).filter(lic => {
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
    const mrrEl = document.getElementById('db-stat-mrr');
    const ltvEl = document.getElementById('db-stat-ltv');

    if (revenueEl) revenueEl.textContent = `$${totalRevenue.toFixed(2)}`;
    if (licensesEl) licensesEl.textContent = filtered.length;
    if (beatsEl) beatsEl.textContent = beatsSet.size;
    if (topClientEl) {
        topClientEl.textContent = topBuyerName !== 'N/A' 
            ? `${topBuyerName} ($${topBuyerVal.toFixed(2)})`
            : 'N/A';
        topClientEl.setAttribute('title', topBuyerName);
    }

    // Calcular MRR y LTV sub-labels
    const producerPlan = (window.producerConfig?.plan || 'inicial').toLowerCase();
    const mrrValue = producerPlan === 'elite' ? 30 : (producerPlan === 'pro' ? 10 : 0);
    if (mrrEl) {
        mrrEl.textContent = `${currentLang === 'es' ? 'MRR Est.' : 'Est. MRR'}: $${mrrValue.toFixed(2)}`;
    }
    if (ltvEl) {
        ltvEl.textContent = `${currentLang === 'es' ? 'LTV Acum.' : 'Accum. LTV'}: $${topBuyerVal.toFixed(2)}`;
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

async function exportDashboardToPDF() {
    const element = document.getElementById('tab-dashboard');
    if (!element) return;

    // Obtener elementos a ocultar para la exportación limpia
    const controls = element.querySelector('.sales-analytics__actions');
    const originalDisplay = controls ? controls.style.display : '';
    if (controls) controls.style.display = 'none';

    // Mostrar un toast cargando
    if (typeof window.showToast === 'function') {
        window.showToast(window.currentLang === 'es' ? 'Generando reporte PDF...' : 'Generating PDF report...');
    }

    const producerName = window.producerConfig?.aka || window.producerConfig?.name || 'Productor';
    const today = new Date().toISOString().split('T')[0];

    // Configuración de html2pdf
    const opt = {
        margin:       [12, 12, 12, 12],
        filename:     `Reporte_Estadisticas_${producerName}_${today}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: '#f5f7fb'
        },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
    };

    try {
        // Ejecutar html2pdf y descargar
        await html2pdf().set(opt).from(element).save();
        if (typeof window.showToast === 'function') {
            window.showToast(window.currentLang === 'es' ? 'Reporte PDF descargado con éxito' : 'PDF report downloaded successfully');
        }
    } catch (err) {
        console.error('Error generating PDF:', err);
        if (typeof window.showToast === 'function') {
            window.showToast(window.currentLang === 'es' ? 'Error al generar el PDF' : 'Error generating PDF', true);
        }
    } finally {
        // Restaurar controles y bordes ocultos
        if (controls) controls.style.display = originalDisplay;
    }
}

// Bindings to global scope for backward compatibility
if (typeof window !== 'undefined') {
    window.updateDashboardView = updateDashboardView;
    window.renderMonthlySalesChart = renderMonthlySalesChart;
    window.renderLicenseTypesChart = renderLicenseTypesChart;
    window.renderTopBeatsChart = renderTopBeatsChart;
    window.renderTopBuyersTable = renderTopBuyersTable;
    window.exportDashboardToPDF = exportDashboardToPDF;
    window.sanitizeChartHtml = sanitizeHtml;
}
