import { db, collection, getDocs, doc, updateDoc, getDoc, collectionGroup, query, where, auth, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);

let adminSelectedUserId = '';

async function loadConsolidatedAccounting() {
    if (!window.currentUserIsAdmin) return;
    
    // Configurar eventos de Obsidian y del modal de plan manual para admin
    setupObsidianEvents();
    setupAdminPlanModalEvents();
    
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
    let totalSaasRevenue = 0;

    try {
        // 1. Obtener todos los productores (config) registrados
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

        // 2. Query across all "licencias" subcollections
        const licenciasQuery = collectionGroup(db, "licencias");
        const querySnapshot = await getDocs(licenciasQuery);
        
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            
            // Extraer el uid del path para contar productores únicos y asociarlo
            const pathSegments = docSnap.ref.path.split('/');
            let userId = 'unknown';
            if (pathSegments.length >= 2 && pathSegments[0] === 'users') {
                userId = pathSegments[1];
                uniqueUsers.add(userId);
            }
            
            allLicenses.push({
                ...data,
                userId: userId
            });
        });

        // Ordenar por fecha descendente
        allLicenses.sort((a, b) => {
            const dateA = a.date || "";
            const dateB = b.date || "";
            return dateB.localeCompare(dateA);
        });

        // Calcular volumen bruto total de beats (GMV)
        allLicenses.forEach(lic => {
            const valueNum = parseFloat(lic.value) || 0;
            totalRevenue += valueNum;
        });

        // 3. Query approved payments from "payments" to calculate SaaS platform subscription revenue
        try {
            const paymentsCol = collection(db, "payments");
            const qPayments = query(paymentsCol, where("status", "==", "approved"));
            const paymentsSnapshot = await getDocs(qPayments);
            
            paymentsSnapshot.forEach((docSnap) => {
                const pay = docSnap.data();
                if (pay.plan) { // It is a SaaS plan subscription payment
                    const valObj = { pro: 10, elite: 30 };
                    const value = parseFloat(pay.price) || valObj[pay.plan.toLowerCase()] || 0;
                    totalSaasRevenue += value;
                }
            });
        } catch (payErr) {
            console.warn("No se pudieron cargar pagos SaaS aprobados para la métrica consolidada:", payErr);
        }

        // 4. Poblar la tabla de productores registrados
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
                            <span style="font-weight: 600; color: #fff;">${sanitizeHtml(user.aka || 'Sin AKA')}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0;">${sanitizeHtml(user.name || 'Sin Nombre')}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #a0aec0; font-size: 13px;">${sanitizeHtml(user.email || 'N/A')}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            <span style="color: #cbd5e0; font-size: 13px;">${sanitizeHtml(user.phone || 'N/A')}</span>
                        </td>
                        <td style="padding: 12px 10px;">
                            ${planBadge}
                        </td>
                        <td style="padding: 12px 10px;">
                            ${expStr}
                        </td>
                        <td style="padding: 12px 10px; text-align: right;">
                            <button class="btn btn-secondary btn-icon-only btn-admin-edit-plan tooltip-left" data-user-id="${sanitizeHtml(user.userId)}" data-user-email="${sanitizeHtml(user.email || '')}" data-user-name="${sanitizeHtml(user.name || '')}" data-user-aka="${sanitizeHtml(user.aka || '')}" data-user-plan="${sanitizeHtml(plan)}" data-user-exp="${sanitizeHtml(user.expirationPro || '')}" title="Modificar plan de este productor" style="display: inline-flex; width: 28px; height: 28px; border-radius: 6px; padding: 0; justify-content: center; align-items: center;">
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

        // 5. Agrupación y Cálculo de Estadísticas por Productor (GMV, Licencias, AOV, etc.)
        const producerStats = {};
        
        // Inicializar con todos los registrados
        producerConfigs.forEach(prod => {
            producerStats[prod.userId] = {
                userId: prod.userId,
                aka: prod.aka || 'Sin AKA',
                name: prod.name || 'Sin Nombre',
                email: prod.email || 'N/A',
                plan: prod.plan || 'inicial',
                totalSales: 0,
                licensesCount: 0,
                lastActiveDate: '',
                licenseTypes: {}
            };
        });

        // Sumar datos de licencias
        allLicenses.forEach(lic => {
            const uId = lic.userId || 'unknown';
            
            // Si el productor no está registrado en config, lo creamos dinámicamente
            if (uId !== 'unknown' && !producerStats[uId]) {
                const producerName = lic.producerConfig?.aka || lic.producerConfig?.name || "Desconocido";
                producerStats[uId] = {
                    userId: uId,
                    aka: producerName,
                    name: lic.producerConfig?.name || 'Desconocido',
                    email: lic.producerConfig?.email || 'N/A',
                    plan: 'inicial',
                    totalSales: 0,
                    licensesCount: 0,
                    lastActiveDate: '',
                    licenseTypes: {}
                };
            }

            const stats = producerStats[uId];
            if (stats) {
                const val = parseFloat(lic.value) || 0;
                stats.totalSales += val;
                stats.licensesCount++;
                
                const type = lic.type || 'basic';
                stats.licenseTypes[type] = (stats.licenseTypes[type] || 0) + 1;
                
                if (lic.date && (!stats.lastActiveDate || lic.date > stats.lastActiveDate)) {
                    stats.lastActiveDate = lic.date;
                }
            }
        });

        // 6. Calcular Distribución de Métodos de Pago y Suscripciones SaaS
        const paymentMethodsMap = {};
        allLicenses.forEach(lic => {
            const rawMethod = lic.paymentMethod || 'Otros';
            let method = rawMethod;
            if (method.toLowerCase().includes('deuna')) method = 'Deuna!';
            else if (method.toLowerCase().includes('paypal')) method = 'PayPal';
            else if (method.toLowerCase().includes('payphone')) method = 'PayPhone';
            else if (method.toLowerCase().includes('transferencia') || method.toLowerCase().includes('banco') || method.toLowerCase().includes('pichincha')) method = 'Transferencia Bancaria';
            
            const val = parseFloat(lic.value) || 0;
            if (!paymentMethodsMap[method]) {
                paymentMethodsMap[method] = { count: 0, amount: 0 };
            }
            paymentMethodsMap[method].count++;
            paymentMethodsMap[method].amount += val;
        });

        const saasPlansMap = { inicial: 0, pro: 0, elite: 0 };
        producerConfigs.forEach(prod => {
            const p = (prod.plan || 'inicial').toLowerCase();
            if (saasPlansMap[p] !== undefined) {
                saasPlansMap[p]++;
            } else {
                saasPlansMap.inicial++;
            }
        });

        // 7. Actualizar Tarjetas de Resumen Consolidado (Fila Superior)
        const totalCollectedEl = document.getElementById('admin-stat-total-collected');
        const totalSaasEl = document.getElementById('admin-stat-total-saas');
        const totalLicensesEl = document.getElementById('admin-stat-total-licenses');
        const totalUsersEl = document.getElementById('admin-stat-total-users');

        if (totalCollectedEl) totalCollectedEl.textContent = `$${totalRevenue.toFixed(2)} USD`;
        if (totalSaasEl) totalSaasEl.textContent = `$${totalSaasRevenue.toFixed(2)} USD`;
        if (totalLicensesEl) totalLicensesEl.textContent = allLicenses.length;
        if (totalUsersEl) totalUsersEl.textContent = producerConfigs.length;

        // 8. Renderizar Tarjetas de Rendimiento por Productor (Filtros Reactivos en Memoria)
        const producerGrid = document.getElementById('admin-producer-stats-grid');
        
        window.renderAdminProducerStats = function() {
            if (!producerGrid) return;
            producerGrid.innerHTML = '';
            
            const searchTerm = (document.getElementById('admin-producer-search')?.value || '').toLowerCase().trim();
            const planFilter = document.getElementById('admin-producer-filter-plan')?.value || 'all';
            
            const statsList = Object.values(producerStats);
            
            const filteredStats = statsList.filter(s => {
                const matchesSearch = s.aka.toLowerCase().includes(searchTerm) || s.email.toLowerCase().includes(searchTerm) || s.name.toLowerCase().includes(searchTerm);
                const matchesPlan = planFilter === 'all' || s.plan.toLowerCase() === planFilter;
                return matchesSearch && matchesPlan;
            });
            
            // Ordenar por facturación desc
            filteredStats.sort((a, b) => b.totalSales - a.totalSales);
            
            if (filteredStats.length === 0) {
                producerGrid.innerHTML = `
                    <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; color: #8a91a6; font-size: 13px;">
                        <i data-lucide="search-code" style="width: 24px; height: 24px; margin-bottom: 8px; opacity: 0.4; display: inline-block;"></i>
                        <p style="margin:0;">No se encontraron productores con los filtros aplicados.</p>
                    </div>
                `;
                safeCreateIcons();
                return;
            }
            
            filteredStats.forEach(s => {
                const share = totalRevenue > 0 ? (s.totalSales / totalRevenue) * 100 : 0;
                
                let planBadge = '';
                const plan = s.plan.toLowerCase();
                if (plan === 'pro') {
                    planBadge = `<span style="font-size: 9px; font-weight: 700; background: rgba(0, 102, 255, 0.15); color: #33b5ff; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 102, 255, 0.25);">PRO ⚡</span>`;
                } else if (plan === 'elite') {
                    planBadge = `<span style="font-size: 9px; font-weight: 700; background: rgba(212, 175, 55, 0.15); color: #ffd700; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(212, 175, 55, 0.3);">ELITE 👑</span>`;
                } else {
                    planBadge = `<span style="font-size: 9px; font-weight: 700; background: rgba(138, 145, 166, 0.15); color: #8a91a6; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(138, 145, 166, 0.25);">INICIAL</span>`;
                }
                
                let favoriteLicense = 'Ninguna';
                let maxCount = 0;
                Object.entries(s.licenseTypes).forEach(([type, count]) => {
                    if (count > maxCount) {
                        maxCount = count;
                        favoriteLicense = type;
                    }
                });
                
                const licenseLabels = {
                    basic: 'Básica',
                    premium: 'Premium',
                    premium_plus: 'Prem. Plus',
                    unlimited_flp: 'Ilim. + FLP',
                    unlimited: 'Ilimitada',
                    exclusive: 'Exclusiva'
                };
                const favLabel = licenseLabels[favoriteLicense.toLowerCase()] || favoriteLicense;
                const aov = s.licensesCount > 0 ? s.totalSales / s.licensesCount : 0;
                
                const card = document.createElement('div');
                card.className = 'producer-analytics-card';
                card.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                        <div style="min-width: 0; flex: 1;">
                            <h4 style="color: #ffffff; font-size: 13px; font-weight: 700; margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${sanitizeHtml(s.aka)}">${sanitizeHtml(s.aka)}</h4>
                            <span style="font-size: 11px; color: #8a91a6; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;" title="${sanitizeHtml(s.email)}">${sanitizeHtml(s.email)}</span>
                        </div>
                        ${planBadge}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
                        <div>
                            <div style="font-size: 9px; color: #8a91a6; text-transform: uppercase; font-weight: 600; letter-spacing: 0.3px;">Facturado</div>
                            <div style="color: #10b981; font-size: 15px; font-weight: 800;">$${s.totalSales.toFixed(2)}</div>
                        </div>
                        <div>
                            <div style="font-size: 9px; color: #8a91a6; text-transform: uppercase; font-weight: 600; letter-spacing: 0.3px;">Licencias</div>
                            <div style="color: #ffffff; font-size: 15px; font-weight: 800;">${s.licensesCount}</div>
                        </div>
                    </div>
                    
                    <div style="font-size: 11px; color: #cbd5e0; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px; display: flex; justify-content: space-between;">
                        <span>Ticket: <strong>$${aov.toFixed(1)}</strong></span>
                        <span>Favorita: <strong>${favLabel}</strong></span>
                    </div>

                    <div class="breakdown-row" style="margin-top: 4px;">
                        <div class="breakdown-info">
                            <span class="breakdown-label" style="font-size: 10px; color: #8a91a6;">Cuota de Ventas</span>
                            <span class="breakdown-value" style="font-size: 10px; color: #fff;">${share.toFixed(1)}%</span>
                        </div>
                        <div class="admin-progress-container">
                            <div class="admin-progress-bar" style="width: ${share}%; background: linear-gradient(90deg, #0066ff, #10b981);"></div>
                        </div>
                    </div>
                    
                    <div style="font-size: 9px; color: #718096; text-align: right; margin-top: auto; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 4px;">
                        Activo: ${s.lastActiveDate || 'Sin actividad'}
                    </div>
                `;
                producerGrid.appendChild(card);
            });
            safeCreateIcons();
        };

        const searchInput = document.getElementById('admin-producer-search');
        const planSelectFilter = document.getElementById('admin-producer-filter-plan');
        
        if (searchInput) {
            searchInput.removeEventListener('input', window.renderAdminProducerStats);
            searchInput.addEventListener('input', window.renderAdminProducerStats);
        }
        if (planSelectFilter) {
            planSelectFilter.removeEventListener('change', window.renderAdminProducerStats);
            planSelectFilter.addEventListener('change', window.renderAdminProducerStats);
        }
        
        window.renderAdminProducerStats();

        // 9. Renderizar Desglose de Métodos de Pago
        const paymentMethodsContainer = document.getElementById('admin-payment-methods-breakdown');
        if (paymentMethodsContainer) {
            paymentMethodsContainer.innerHTML = '';
            const sortedMethods = Object.entries(paymentMethodsMap).sort((a, b) => b[1].amount - a[1].amount);
            
            if (sortedMethods.length === 0) {
                paymentMethodsContainer.innerHTML = `<div style="font-size: 12px; color: #8a91a6; text-align: center; padding: 10px 0;">Sin transacciones.</div>`;
            } else {
                sortedMethods.forEach(([method, data]) => {
                    const pct = totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0;
                    
                    const row = document.createElement('div');
                    row.className = 'breakdown-row';
                    row.innerHTML = `
                        <div class="breakdown-info">
                            <span class="breakdown-label" style="display:flex; align-items:center; gap: 4px; font-size: 11px;">
                                <span style="width: 5px; height: 5px; border-radius: 50%; background: #a855f7;"></span>
                                ${method}
                            </span>
                            <span class="breakdown-value" style="color: #cbd5e0; font-size: 11px;">$${data.amount.toFixed(2)} (${pct.toFixed(0)}%)</span>
                        </div>
                        <div class="admin-progress-container">
                            <div class="admin-progress-bar" style="width: ${pct}%; background: linear-gradient(90deg, #a855f7, #ec4899);"></div>
                        </div>
                    `;
                    paymentMethodsContainer.appendChild(row);
                });
            }
        }

        // 10. Renderizar Desglose de Planes SaaS
        const saasPlansContainer = document.getElementById('admin-saas-plans-breakdown');
        if (saasPlansContainer) {
            saasPlansContainer.innerHTML = '';
            const totalProds = producerConfigs.length;
            
            const plansList = [
                { key: 'elite', label: 'Elite 👑', color: '#ffd700', barBg: 'linear-gradient(90deg, #ec4899, #ffd700)' },
                { key: 'pro', label: 'Pro ⚡', color: '#33b5ff', barBg: 'linear-gradient(90deg, #0066ff, #33b5ff)' },
                { key: 'inicial', label: 'Inicial', color: '#8a91a6', barBg: '#8a91a6' }
            ];
            
            plansList.forEach(p => {
                const count = saasPlansMap[p.key] || 0;
                const pct = totalProds > 0 ? (count / totalProds) * 100 : 0;
                
                const row = document.createElement('div');
                row.className = 'breakdown-row';
                row.innerHTML = `
                    <div class="breakdown-info">
                        <span class="breakdown-label" style="display:flex; align-items:center; gap: 4px; color: ${p.color}; font-size: 11px;">
                            ${p.label}
                        </span>
                        <span class="breakdown-value" style="font-size: 11px;">${count} prod. (${pct.toFixed(0)}%)</span>
                    </div>
                    <div class="admin-progress-container">
                        <div class="admin-progress-bar" style="width: ${pct}%; background: ${p.barBg};"></div>
                    </div>
                `;
                saasPlansContainer.appendChild(row);
            });
        }

        // 11. Poblar Filtro del Historial Consolidado (Filtros en el Cliente)
        const filterProducerSelect = document.getElementById('admin-filter-producer');
        if (filterProducerSelect) {
            const currentSelected = filterProducerSelect.value || 'all';
            filterProducerSelect.innerHTML = '<option value="all">Todos los Productores</option>';
            
            const sortedProducers = Object.values(producerStats).sort((a, b) => a.aka.localeCompare(b.aka));
            sortedProducers.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.userId;
                opt.textContent = `${p.aka} (${p.email})`;
                filterProducerSelect.appendChild(opt);
            });
            
            filterProducerSelect.value = currentSelected;
        }

        // Guardar licencias en variable global de modulo para el render
        window.allAdminLicenses = allLicenses;
        
        window.renderConsolidatedLicensesTable = function() {
            const selectedUserId = document.getElementById('admin-filter-producer')?.value || 'all';
            tbody.innerHTML = '';
            
            const filtered = selectedUserId === 'all' 
                ? window.allAdminLicenses 
                : window.allAdminLicenses.filter(l => l.userId === selectedUserId);
                
            const counterEl = document.getElementById('admin-licenses-count');
            if (counterEl) {
                counterEl.textContent = `${filtered.length} licencias`;
            }
            
            if (filtered.length === 0) {
                if (emptyEl) emptyEl.style.display = 'block';
            } else {
                if (emptyEl) emptyEl.style.display = 'none';
                
                filtered.forEach(lic => {
                    const valueNum = parseFloat(lic.value) || 0;
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid #2a2e39';
                    
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
        };

        if (filterProducerSelect) {
            filterProducerSelect.removeEventListener('change', window.renderConsolidatedLicensesTable);
            filterProducerSelect.addEventListener('change', window.renderConsolidatedLicensesTable);
        }

        window.renderConsolidatedLicensesTable();

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

function setupObsidianEvents() {
    if (window._obsidianEventsSetup) return;
    window._obsidianEventsSetup = true;

    const organizeBtn = document.getElementById('btn-admin-organize-obsidian');
    const statusEl = document.getElementById('obsidian-organize-status');

    if (!organizeBtn) return;

    organizeBtn.addEventListener('click', async () => {
        organizeBtn.disabled = true;
        const originalText = organizeBtn.innerHTML;
        organizeBtn.innerHTML = `⏳ Organizando...`;
        if (statusEl) {
            statusEl.textContent = 'Organizando bóveda de Obsidian...';
            statusEl.style.color = '#ffd700'; // Yellow
        }

        try {
            const localApiUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? '/api/organize-obsidian'
                : 'http://localhost:8000/api/organize-obsidian';
            const headers = window.getLocalHeaders ? await window.getLocalHeaders() : {};
            const response = await fetch(localApiUrl, {
                method: 'POST',
                headers: headers
            });
            const data = await response.json();

            if (response.ok && data.status === 'success') {
                if (statusEl) {
                    statusEl.textContent = '¡Bóveda organizada y Dashboard BEATSS.md actualizado!';
                    statusEl.style.color = '#10b981'; // Green
                }
                alert('¡Bóveda organizada y Dashboard BEATSS.md actualizado con éxito!');
            } else {
                throw new Error(data.error || 'Error desconocido');
            }
        } catch (err) {
            console.error('Error al organizar Obsidian:', err);
            if (statusEl) {
                statusEl.textContent = 'Error al organizar la bóveda.';
                statusEl.style.color = '#ef4444'; // Red
            }
            alert('Error al organizar la bóveda: ' + err.message);
        } finally {
            organizeBtn.disabled = false;
            organizeBtn.innerHTML = originalText;
            // Restore default text after 5 seconds
            setTimeout(() => {
                if (statusEl && statusEl.style.color !== '#ffd700') {
                    statusEl.textContent = 'Auto-organización en segundo plano activa';
                    statusEl.style.color = '#8a91a6';
                }
            }, 5000);
        }
    });
}

function setupAdminPlanModalEvents() {
    if (window._adminPlanModalEventsSetup) return;
    window._adminPlanModalEventsSetup = true;
    
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
                    Error al cargar códigos VIP
                </td>
            </tr>
        `;
    }
}

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


function viewReceiptLarge(receiptUrl) {
    const modal = document.getElementById('admin-receipt-preview-modal');
    const img = document.getElementById('admin-receipt-preview-large-img');
    if (modal && img) {
        img.src = receiptUrl;
        modal.style.display = 'flex';
    }
};


async function approvePaymentAdmin(paymentId, userId, userEmail) {
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


async function rejectPaymentAdmin(paymentId) {
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


async function deactivateVipCodeAdmin(codeId) {
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


async function generateVipCodeAdmin() {
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


// Bindings to global scope for backward compatibility
window.loadPendingPaymentsAdmin = loadPendingPaymentsAdmin;
window.approvePaymentAdmin = approvePaymentAdmin;
window.rejectPaymentAdmin = rejectPaymentAdmin;
window.deactivateVipCodeAdmin = deactivateVipCodeAdmin;
window.generateVipCodeAdmin = generateVipCodeAdmin;

window.loadConsolidatedAccounting = loadConsolidatedAccounting;
window.openAdminPlanModal = openAdminPlanModal;
window.setupAdminPlanModalEvents = setupAdminPlanModalEvents;
window.loadReferralData = loadReferralData;
window.loadVipCodesAdmin = loadVipCodesAdmin;
window.triggerReferralConversion = triggerReferralConversion;
