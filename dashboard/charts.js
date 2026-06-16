// Locals / Globals
const currentLang = window.currentLang;
const loadScript = (...args) => window.loadScript(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);
const initTooltips = (...args) => window.initTooltips(...args);

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
    }


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

    let segments = [];
    let totalCount = 0;

    if (Array.isArray(licenses) && licenses.length > 0 && licenses[0].pct !== undefined) {
        segments = licenses;
        totalCount = segments.reduce((sum, s) => sum + s.count, 0);
    } else {
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

        segments = Object.keys(typesCount).map(type => {
            const count = typesCount[type];
            const pct = (count / licenses.length) * 100;
            return {
                type,
                count,
                pct,
                color: colors[type] || "#718096"
            };
        });
        totalCount = licenses.length;
    }


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



async function updateDashboardView() {
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

                    if (revenueEl) revenueEl.textContent = `$${parseFloat(data.totalRevenue || 0).toFixed(2)}`;
                    if (licensesEl) licensesEl.textContent = data.totalLicenses || 0;
                    if (beatsEl) beatsEl.textContent = data.uniqueBeats || 0;
                    if (topClientEl) {
                        topClientEl.textContent = data.topBuyerName !== 'N/A' 
                            ? `${data.topBuyerName} ($${parseFloat(data.topBuyerVal || 0).toFixed(2)})`
                            : 'N/A';
                        topClientEl.setAttribute('title', data.topBuyerName || 'N/A');
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


function showChartTooltip(e) {
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


function hideChartTooltip() {
    const tooltip = document.getElementById('sales-chart-tooltip');
    if (tooltip) tooltip.style.opacity = '0';
};


// Bindings to global scope for backward compatibility
window.updateDashboardView = updateDashboardView;
window.showChartTooltip = showChartTooltip;
window.hideChartTooltip = hideChartTooltip;

window.renderMonthlySalesChart = renderMonthlySalesChart;
window.renderLicenseTypesChart = renderLicenseTypesChart;
window.renderTopBeatsChart = renderTopBeatsChart;
window.renderTopBuyersTable = renderTopBuyersTable;
