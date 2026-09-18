import { db, collection, getDocs, doc, updateDoc, getDoc, collectionGroup, query, where, auth, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = typeof window !== 'undefined' ? window.currentLang : 'es';
const showToast = (...args) => (typeof window !== 'undefined' && window.showToast ? window.showToast(...args) : undefined);
const sanitizeHtml = (...args) => ((typeof window !== 'undefined' && typeof window.sanitizeHtml === 'function')
    ? window.sanitizeHtml(...args)
    : String(args[0] ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'));
const safeCreateIcons = (...args) => (typeof window !== 'undefined' && window.safeCreateIcons ? window.safeCreateIcons(...args) : undefined);

let adminSelectedUserId = '';

async function loadConsolidatedAccounting() {
    const isAdmin = window.currentUserIsAdmin ||
        (auth.currentUser?.email && ['masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(auth.currentUser.email.toLowerCase())) ||
        (window.currentUser?.email && ['masterjuego25@gmail.com', 'sossabeatz1@gmail.com'].includes(window.currentUser.email.toLowerCase()));
    if (!isAdmin) return;
    window.currentUserIsAdmin = true;
    
    // Configurar navegación segmentada, eventos de Obsidian y del modal de plan manual para admin
    setupAdminSubnav();
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
            <td colspan="7" style="padding: 24px; text-align: center; color: var(--adm-muted, #64748b);">
                <span class="animate-spin" style="display:inline-block; margin-right: 8px;">⏳</span>
                Cargando datos consolidados...
            </td>
        </tr>
    `;
    if (emptyEl) emptyEl.style.display = 'none';

    if (usersTbody) {
        usersTbody.innerHTML = `
            <tr>
                <td colspan="7" style="padding: 24px; text-align: center; color: var(--adm-muted, #64748b);">
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
        // 0. Consultar datos consolidados completos a través del endpoint administrativo autenticado
        let serverDataLoaded = false;
        try {
            const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
            if (token) {
                const resp = await fetch('/api/account?route=admin-producers', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (resp.ok) {
                    const json = await resp.json();
                    if (Array.isArray(json.producers) && json.producers.length > 0) {
                        producerConfigs = json.producers;
                        producerConfigs.forEach(p => {
                            if (p.userId) uniqueUsers.add(p.userId);
                        });
                        serverDataLoaded = true;
                    }
                    if (Array.isArray(json.licenses) && json.licenses.length > 0) {
                        allLicenses = json.licenses;
                        allLicenses.forEach(l => {
                            if (l.userId) uniqueUsers.add(l.userId);
                        });
                    }
                }
            }
        } catch (serverErr) {
            console.warn('[BEATSS Accounting] Endpoint serverless de administración no disponible, usando fallback directo:', serverErr);
        }

        // 1. Si no se cargó por servidor, obtener productores por Firestore cliente
        if (!serverDataLoaded) {
            try {
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
            } catch (cgConfigErr) {
                console.warn("[BEATSS Accounting] Consulta collectionGroup(config) no disponible, usando fallback directo:", cgConfigErr);
                if (auth.currentUser) {
                    try {
                        const myConfigRef = doc(db, 'users', auth.currentUser.uid, 'config', 'producer');
                        const myConfigSnap = await getDoc(myConfigRef);
                        if (myConfigSnap.exists()) {
                            producerConfigs.push({
                                userId: auth.currentUser.uid,
                                ...myConfigSnap.data()
                            });
                        }
                    } catch (_) {}
                }
            }
        }

        // Si producerConfigs no obtuvo datos, garantizar la presencia del productor principal
        if (producerConfigs.length === 0 && auth.currentUser) {
            producerConfigs.push({
                userId: auth.currentUser.uid,
                email: auth.currentUser.email || 'sossabeatz1@gmail.com',
                name: 'Joao David Domínguez (Sossa)',
                aka: 'Sossa',
                plan: 'elite'
            });
        }

        // Ordenar productores: Sossa siempre primero, luego alfabéticamente por AKA o nombre
        producerConfigs.sort((a, b) => {
            const emailA = (a.email || "").toLowerCase();
            const emailB = (b.email || "").toLowerCase();
            if (emailA === 'masterjuego25@gmail.com' || emailA === 'sossabeatz1@gmail.com') return -1;
            if (emailB === 'masterjuego25@gmail.com' || emailB === 'sossabeatz1@gmail.com') return 1;
            
            const akaA = (a.aka || a.name || a.email || "").toLowerCase();
            const akaB = (b.aka || b.name || b.email || "").toLowerCase();
            return akaA.localeCompare(akaB);
        });

        // 2. Si no se cargaron licencias por servidor, consultar vía collectionGroup("licencias")
        if (allLicenses.length === 0) {
            try {
                const licenciasQuery = collectionGroup(db, "licencias");
                const querySnapshot = await getDocs(licenciasQuery);
                
                querySnapshot.forEach((docSnap) => {
                    const data = docSnap.data();
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
            } catch (cgLicErr) {
                console.warn("[BEATSS Accounting] Consulta collectionGroup(licencias) no disponible, usando licencias del productor:", cgLicErr);
                if (auth.currentUser) {
                    try {
                        const myLicRef = collection(db, 'users', auth.currentUser.uid, 'licencias');
                        const myLicSnap = await getDocs(myLicRef);
                        myLicSnap.forEach(docSnap => {
                            allLicenses.push({
                                ...docSnap.data(),
                                userId: auth.currentUser.uid
                            });
                            uniqueUsers.add(auth.currentUser.uid);
                        });
                    } catch (_) {}
                }
                try {
                    const localLics = JSON.parse(localStorage.getItem('beatss_licenses') || '[]');
                    if (Array.isArray(localLics) && localLics.length > 0 && allLicenses.length === 0) {
                        localLics.forEach(lic => {
                            allLicenses.push({
                                ...lic,
                                userId: auth.currentUser?.uid || 'local'
                            });
                            if (auth.currentUser) uniqueUsers.add(auth.currentUser.uid);
                        });
                    }
                } catch (_) {}
            }
        }

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
                        planBadge = `<span class="admin-plan-badge admin-plan-badge--pro">Pro ⚡</span>`;
                    } else if (plan === 'elite') {
                        planBadge = `<span class="admin-plan-badge admin-plan-badge--elite">Elite 👑</span>`;
                    } else {
                        planBadge = `<span class="admin-plan-badge admin-plan-badge--inicial">Inicial</span>`;
                    }

                    // Formatear fecha de vencimiento
                    let expStr = '<span style="color: var(--adm-muted-light, #94a3b8); font-size: 12px;">No aplica</span>';
                    if ((plan === 'pro' || plan === 'elite') && user.expirationPro) {
                        const expDate = new Date(user.expirationPro);
                        if (!isNaN(expDate.getTime())) {
                            const formattedDate = expDate.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
                            if (expDate < new Date()) {
                                expStr = `<span style="color: var(--adm-red, #ef4444); font-weight: 600; font-size: 12px;">${formattedDate} (Expirado)</span>`;
                            } else {
                                expStr = `<span style="color: var(--adm-ink, #0f172a); font-weight: 500; font-size: 12px;">${formattedDate}</span>`;
                            }
                        } else {
                            expStr = `<span style="color: var(--adm-muted-light, #94a3b8); font-size: 12px;">Sin fecha</span>`;
                        }
                    }

                    tr.innerHTML = `
                        <td style="padding: 14px 16px;">
                            <span style="font-weight: 700; color: var(--adm-ink, #0f172a);">${sanitizeHtml(user.aka || 'Sin AKA')}</span>
                        </td>
                        <td style="padding: 14px 16px;">
                            <span style="color: var(--adm-muted, #475569); font-weight: 500;">${sanitizeHtml(user.name || 'Sin Nombre')}</span>
                        </td>
                        <td style="padding: 14px 16px;">
                            <span style="color: var(--adm-muted, #64748b); font-family: ui-monospace, monospace; font-size: 12px;">${sanitizeHtml(user.email || 'N/A')}</span>
                        </td>
                        <td style="padding: 14px 16px;">
                            <span style="color: var(--adm-muted, #475569); font-size: 13px;">${sanitizeHtml(user.phone || 'N/A')}</span>
                        </td>
                        <td style="padding: 14px 16px;">
                            ${planBadge}
                        </td>
                        <td style="padding: 14px 16px;">
                            ${expStr}
                        </td>
                        <td style="padding: 14px 16px; text-align: right;">
                            <button class="btn btn-secondary btn-icon-only btn-admin-edit-plan tooltip-left" data-user-id="${sanitizeHtml(user.userId)}" data-user-email="${sanitizeHtml(user.email || '')}" data-user-name="${sanitizeHtml(user.name || '')}" data-user-aka="${sanitizeHtml(user.aka || '')}" data-user-plan="${sanitizeHtml(plan)}" data-user-exp="${sanitizeHtml(user.expirationPro || '')}" title="Modificar plan de este productor" style="display: inline-flex; width: 32px; height: 32px; border-radius: 8px; padding: 0; justify-content: center; align-items: center; border: 1px solid var(--adm-line, #dfe4ec); background: #ffffff; color: var(--adm-ink, #0f172a); cursor: pointer;">
                                <i data-lucide="edit-3" style="width: 15px; height: 15px;"></i>
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
                    planBadge = `<span class="admin-plan-badge admin-plan-badge--pro">PRO ⚡</span>`;
                } else if (plan === 'elite') {
                    planBadge = `<span class="admin-plan-badge admin-plan-badge--elite">ELITE 👑</span>`;
                } else {
                    planBadge = `<span class="admin-plan-badge admin-plan-badge--inicial">INICIAL</span>`;
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
                    <div class="producer-card-header">
                        <div class="producer-card-identity">
                            <h4 class="producer-card-aka" title="${sanitizeHtml(s.aka)}">${sanitizeHtml(s.aka)}</h4>
                            <span class="producer-card-email" title="${sanitizeHtml(s.email)}">${sanitizeHtml(s.email)}</span>
                        </div>
                        ${planBadge}
                    </div>
                    
                    <div class="producer-metrics-row">
                        <div class="producer-metric-box">
                            <span class="producer-metric-label">Facturado</span>
                            <span class="producer-metric-val-sales">$${s.totalSales.toFixed(2)}</span>
                        </div>
                        <div class="producer-metric-box">
                            <span class="producer-metric-label">Licencias</span>
                            <span class="producer-metric-val-count">${s.licensesCount}</span>
                        </div>
                    </div>
                    
                    <div class="producer-secondary-row">
                        <span>Ticket: <strong>$${aov.toFixed(1)}</strong></span>
                        <span>Favorita: <strong>${sanitizeHtml(favLabel)}</strong></span>
                    </div>

                    <div class="breakdown-row" style="margin-top: 2px;">
                        <div class="breakdown-info">
                            <span class="breakdown-label" style="font-size: 11px; color: var(--adm-muted);">Cuota GMV</span>
                            <span class="breakdown-value" style="font-size: 11px; color: var(--adm-ink);">${share.toFixed(1)}%</span>
                        </div>
                        <div class="admin-progress-container">
                            <div class="admin-progress-bar" style="width: ${share}%; background: linear-gradient(90deg, #3157e8, #10b981);"></div>
                        </div>
                    </div>
                    
                    <div class="producer-active-date">
                        Activo: ${sanitizeHtml(s.lastActiveDate || 'Sin actividad')}
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
                const defaultMethods = [
                    { name: 'Stripe', dotColor: '#635bff', barBg: 'linear-gradient(90deg, #635bff, #00d4ff)' },
                    { name: 'PayPhone', dotColor: '#ff6600', barBg: 'linear-gradient(90deg, #ff6600, #ff9933)' },
                    { name: 'Deuna! QR', dotColor: '#00cc66', barBg: 'linear-gradient(90deg, #00cc66, #33ff99)' },
                    { name: 'PayPal', dotColor: '#0079c1', barBg: 'linear-gradient(90deg, #0079c1, #00457c)' }
                ];
                defaultMethods.forEach(dm => {
                    const row = document.createElement('div');
                    row.className = 'breakdown-row';
                    row.innerHTML = `
                        <div class="breakdown-info">
                            <span class="breakdown-label" style="display:flex; align-items:center; gap: 6px; font-size: 12px; color: var(--adm-ink, #0f172a);">
                                <span style="width: 7px; height: 7px; border-radius: 50%; background: ${dm.dotColor};"></span>
                                ${dm.name}
                            </span>
                            <span class="breakdown-value" style="color: var(--adm-muted, #64748b); font-size: 12px;">$0.00 (0%)</span>
                        </div>
                        <div class="admin-progress-container">
                            <div class="admin-progress-bar" style="width: 0%; background: ${dm.barBg};"></div>
                        </div>
                    `;
                    paymentMethodsContainer.appendChild(row);
                });
            } else {
                sortedMethods.forEach(([method, data]) => {
                    const pct = totalRevenue > 0 ? (data.amount / totalRevenue) * 100 : 0;
                    
                    const row = document.createElement('div');
                    row.className = 'breakdown-row';
                    row.innerHTML = `
                        <div class="breakdown-info">
                            <span class="breakdown-label" style="display:flex; align-items:center; gap: 6px; font-size: 12px; color: var(--adm-ink, #0f172a);">
                                <span style="width: 7px; height: 7px; border-radius: 50%; background: var(--adm-purple, #8b5cf6);"></span>
                                ${sanitizeHtml(method)}
                            </span>
                            <span class="breakdown-value" style="color: var(--adm-muted, #64748b); font-size: 12px;">$${data.amount.toFixed(2)} (${pct.toFixed(0)}%)</span>
                        </div>
                        <div class="admin-progress-container">
                            <div class="admin-progress-bar" style="width: ${pct}%; background: linear-gradient(90deg, #8b5cf6, #ec4899);"></div>
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
                { key: 'elite', label: 'Elite 👑', color: '#ec4899', barBg: 'linear-gradient(90deg, #8b5cf6, #ec4899)' },
                { key: 'pro', label: 'Pro ⚡', color: '#0284c7', barBg: 'linear-gradient(90deg, #3157e8, #0284c7)' },
                { key: 'inicial', label: 'Inicial', color: '#64748b', barBg: '#cbd5e1' }
            ];
            
            plansList.forEach(p => {
                const count = saasPlansMap[p.key] || 0;
                const pct = totalProds > 0 ? (count / totalProds) * 100 : 0;
                
                const row = document.createElement('div');
                row.className = 'breakdown-row';
                row.innerHTML = `
                    <div class="breakdown-info">
                        <span class="breakdown-label" style="display:flex; align-items:center; gap: 6px; color: ${p.color}; font-size: 12px; font-weight: 700;">
                            ${p.label}
                        </span>
                        <span class="breakdown-value" style="font-size: 12px; color: var(--adm-muted, #64748b);">${count} prod. (${pct.toFixed(0)}%)</span>
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
                        <td style="padding: 14px 16px;">
                            <span style="font-weight: 700; color: var(--adm-ink, #0f172a);">${sanitizeHtml(producerName)}</span>
                        </td>
                        <td style="padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--adm-muted, #64748b);">
                            ${sanitizeHtml(lic.refCode || 'N/A')}
                        </td>
                        <td style="padding: 14px 16px; color: var(--adm-muted, #475569); font-size: 13px;">
                            ${sanitizeHtml(lic.date || 'N/A')}
                        </td>
                        <td style="padding: 14px 16px;">
                            <div style="font-weight: 700; color: var(--adm-ink, #0f172a);">${sanitizeHtml(lic.beatName || 'N/A')}</div>
                        </td>
                        <td style="padding: 14px 16px;">
                            <div style="color: var(--adm-ink, #0f172a); font-weight: 500;">${sanitizeHtml(lic.buyerName || 'N/A')}</div>
                            <div style="font-size: 11px; color: var(--adm-muted-light, #94a3b8); font-family: ui-monospace, monospace;">${sanitizeHtml(lic.formData?.buyerEmail || '')}</div>
                        </td>
                        <td style="padding: 14px 16px;">
                            <span style="font-size: 11px; font-weight: 700; background: rgba(148, 163, 184, 0.12); color: #475569; padding: 3px 8px; border-radius: 6px; text-transform: uppercase;">
                                ${sanitizeHtml(lic.type || 'N/A')}
                            </span>
                        </td>
                        <td style="padding: 14px 16px; text-align: right; font-weight: 800; font-size: 15px; color: var(--adm-green, #10b981);">
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
                <td colspan="7" style="padding: 24px; text-align: center; color: var(--adm-red, #ef4444); font-weight: 600;">
                    Error al cargar datos consolidados de la nube: ${sanitizeHtml(err.message)}
                </td>
            </tr>
        `;
        if (usersTbody) {
            usersTbody.innerHTML = `
                <tr>
                    <td colspan="7" style="padding: 24px; text-align: center; color: var(--adm-red, #ef4444); font-weight: 600;">
                        Error al cargar productores registrados: ${sanitizeHtml(err.message)}
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

function setupAdminSubnav() {
    const navBar = document.getElementById('admin-subnav-bar');
    if (!navBar || window._adminSubnavSetup) return;
    window._adminSubnavSetup = true;

    navBar.addEventListener('click', (e) => {
        const btn = e.target.closest('.admin-nav-pill');
        if (!btn) return;
        const view = btn.dataset.adminView;
        if (!view) return;

        navBar.querySelectorAll('.admin-nav-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const sections = document.querySelectorAll('#tab-admin .admin-section');
        sections.forEach(sec => {
            const secName = sec.dataset.sectionName;
            if (view === 'all' || secName === view) {
                sec.style.display = 'block';
            } else {
                sec.style.display = 'none';
            }
        });
    });
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
            const localApiUrl = '/api/organize-obsidian';
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
            
            let updatedViaServer = false;
            try {
                const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
                if (token) {
                    const resp = await fetch('/api/account?route=admin-producers', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify({
                            targetUserId: adminSelectedUserId,
                            plan: selectedPlan,
                            expirationPro,
                            email: document.getElementById('admin-plan-user-email')?.textContent || ''
                        })
                    });
                    if (resp.ok) {
                        updatedViaServer = true;
                    }
                }
            } catch (postErr) {
                console.warn('[BEATSS Admin] Error en actualización serverless de plan, probando Firestore directo:', postErr);
            }

            if (!updatedViaServer) {
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
            }
            
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
            <td colspan="5" style="padding: 24px; text-align: center; color: var(--adm-muted, #64748b);">
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
                    <td colspan="5" style="padding: 24px; text-align: center; color: var(--adm-muted, #64748b);">
                        No se han generado códigos VIP aún.
                    </td>
                </tr>
            `;
        } else {
            vipCodes.forEach(code => {
                const tr = document.createElement('tr');
                
                let statusDetails = '';
                if (!code.active && code.redeemedByEmail) {
                    const dateStr = code.redeemedAt ? new Date(code.redeemedAt).toLocaleDateString('es-ES', {
                        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    }) : '';
                    statusDetails = `<div style="font-size: 11px; color: var(--adm-muted, #64748b); margin-top: 4px; line-height: 1.3;">
                        Por: ${sanitizeHtml(code.redeemedByEmail)}<br>${dateStr}
                    </div>`;
                }

                const statusBadge = code.active 
                    ? `<span style="background: var(--adm-green-tint, rgba(16, 185, 129, 0.1)); color: var(--adm-green, #10b981); border: 1px solid var(--adm-green-border, rgba(16, 185, 129, 0.3)); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Activo</span>`
                    : `<span style="background: var(--adm-red-tint, rgba(239, 68, 68, 0.1)); color: var(--adm-red, #ef4444); border: 1px solid var(--adm-red-border, rgba(239, 68, 68, 0.3)); padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase;">Inactivo</span>${statusDetails}`;
                
                const safeCodeId = sanitizeHtml(code.id || '');
                const actionsHtml = code.active
                    ? `<button type="button" class="btn btn-danger btn-admin-deactivate-vip" data-code-id="${safeCodeId}" style="height: 30px; padding: 0 12px; font-size: 12px; font-weight: 600; border-radius: 8px; background: var(--adm-red-tint, rgba(239, 68, 68, 0.1)); color: var(--adm-red, #ef4444); border: 1px solid var(--adm-red-border, rgba(239, 68, 68, 0.3)); cursor: pointer;">Desactivar</button>`
                    : `<span style="color: var(--adm-muted-light, #94a3b8); font-size: 12px;">N/A</span>`;
                
                tr.innerHTML = `
                    <td style="padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 14px; font-weight: 800; color: var(--adm-ink, #0f172a); letter-spacing: 0.5px;">
                        ${sanitizeHtml(code.id)}
                    </td>
                    <td style="padding: 14px 16px;">
                        <span class="admin-plan-badge ${code.planType === 'elite' ? 'admin-plan-badge--elite' : 'admin-plan-badge--pro'}">
                            ${code.planType === 'elite' ? 'Elite 👑' : 'Pro ⚡'}
                        </span>
                    </td>
                    <td style="padding: 14px 16px; color: var(--adm-muted, #475569); font-weight: 500;">
                        ${code.planDurationMonths} ${code.planDurationMonths === 1 ? 'Mes' : 'Meses'}
                    </td>
                    <td style="padding: 14px 16px;">
                        ${statusBadge}
                    </td>
                    <td style="padding: 14px 16px; text-align: right;">
                        ${actionsHtml}
                    </td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.btn-admin-deactivate-vip').forEach(btn => {
                btn.addEventListener('click', () => {
                    const codeId = btn.dataset.codeId;
                    if (codeId) deactivateVipCodeAdmin(codeId);
                });
            });
        }
    } catch (err) {
        console.error("Error al cargar códigos VIP:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="padding: 24px; text-align: center; color: var(--adm-red, #ef4444); font-weight: 600;">
                    Error al cargar códigos VIP: ${sanitizeHtml(err.message)}
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
            <td colspan="8" style="padding: 24px; text-align: center; color: var(--adm-muted, #64748b);">
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

        // Actualizar contador en subnavegación admin
        const navBadge = document.getElementById('admin-nav-pending-count');
        if (navBadge) {
            if (pendingPayments.length > 0) {
                navBadge.textContent = pendingPayments.length;
                navBadge.style.display = 'inline-flex';
            } else {
                navBadge.style.display = 'none';
            }
        }

        tbody.innerHTML = '';
        
        if (pendingPayments.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
        } else {
            if (emptyEl) emptyEl.style.display = 'none';
            
            pendingPayments.forEach(pay => {
                const tr = document.createElement('tr');
                
                // Formatear fecha
                const dateStr = pay.timestamp ? sanitizeHtml(pay.timestamp.split('T')[0]) : 'N/A';
                const cleanEmail = sanitizeHtml(pay.userEmail || 'N/A');
                const cleanUid = sanitizeHtml(pay.userId || 'N/A');
                const cleanAka = sanitizeHtml(pay.aka || 'N/A');
                const cleanMethod = sanitizeHtml(pay.method || 'N/A');
                const cleanRef = sanitizeHtml(pay.reference || 'N/A');
                const cleanPlan = sanitizeHtml(pay.plan ? pay.plan.toUpperCase() : 'PRO');
                const cleanPayId = sanitizeHtml(pay.id || '');
                const rawReceiptUrl = String(pay.receiptUrl || '').trim();
                const safeReceipt = isSafeReceiptUrl(rawReceiptUrl) ? sanitizeHtml(rawReceiptUrl) : '';
                
                tr.innerHTML = `
                    <td style="padding: 14px 16px;">
                        <div style="font-weight: 700; color: var(--adm-ink, #0f172a);">${cleanEmail}</div>
                        <div style="font-size: 11px; color: var(--adm-muted, #64748b); font-family: ui-monospace, monospace;">UID: ${cleanUid}</div>
                    </td>
                    <td style="padding: 14px 16px; color: var(--adm-ink, #0f172a); font-weight: 600;">
                        ${cleanAka}
                    </td>
                    <td style="padding: 14px 16px;">
                        <span class="admin-plan-badge ${pay.plan === 'elite' ? 'admin-plan-badge--elite' : 'admin-plan-badge--pro'}">
                            ${cleanPlan}
                        </span>
                    </td>
                    <td style="padding: 14px 16px; color: var(--adm-muted, #475569); font-size: 13px;">
                        ${cleanMethod}
                    </td>
                    <td style="padding: 14px 16px; font-family: ui-monospace, monospace; font-size: 12px; color: var(--adm-muted, #64748b);">
                        ${cleanRef}
                    </td>
                    <td style="padding: 14px 16px; color: var(--adm-muted, #475569); font-size: 13px;">
                        ${dateStr}
                    </td>
                    <td style="padding: 14px 16px; text-align: center;">
                        ${safeReceipt ? `
                        <button type="button" class="btn btn-secondary btn-admin-view-receipt" data-receipt-url="${safeReceipt}" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 600; border-radius: 8px; border: 1px solid var(--adm-line, #dfe4ec); background: #ffffff; color: var(--adm-ink, #0f172a); cursor: pointer; display: inline-flex; align-items: center; gap: 6px;">
                            <i data-lucide="eye" style="width: 14px; height: 14px;"></i> Ver
                        </button>` : `<span style="color: var(--adm-muted-light, #94a3b8); font-size: 12px;">Sin recibo</span>`}
                    </td>
                    <td style="padding: 14px 16px; text-align: right;">
                        <div style="display: inline-flex; gap: 8px;">
                            <button type="button" class="btn btn-success btn-admin-approve-payment" data-payment-id="${cleanPayId}" data-user-id="${cleanUid}" data-user-email="${cleanEmail}" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 700; border-radius: 8px; background: var(--adm-green, #10b981); color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);">
                                <i data-lucide="check" style="width: 14px; height: 14px;"></i> Aprobar
                            </button>
                            <button type="button" class="btn btn-danger btn-admin-reject-payment" data-payment-id="${cleanPayId}" style="height: 32px; padding: 0 12px; font-size: 12px; font-weight: 700; border-radius: 8px; background: var(--adm-red, #ef4444); color: #fff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; box-shadow: 0 2px 8px rgba(239, 68, 68, 0.25);">
                                <i data-lucide="x" style="width: 14px; height: 14px;"></i> Rechazar
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });

            tbody.querySelectorAll('.btn-admin-view-receipt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const url = btn.dataset.receiptUrl;
                    if (url) viewReceiptLarge(url);
                });
            });

            tbody.querySelectorAll('.btn-admin-approve-payment').forEach(btn => {
                btn.addEventListener('click', () => {
                    const { paymentId, userId, userEmail } = btn.dataset;
                    if (paymentId && userId) approvePaymentAdmin(paymentId, userId, userEmail || '');
                });
            });

            tbody.querySelectorAll('.btn-admin-reject-payment').forEach(btn => {
                btn.addEventListener('click', () => {
                    const { paymentId } = btn.dataset;
                    if (paymentId) rejectPaymentAdmin(paymentId);
                });
            });
        }
    } catch (err) {
        console.error("Error al cargar solicitudes de pago pendientes:", err);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="padding: 24px; text-align: center; color: var(--adm-red, #ef4444); font-weight: 600;">
                    Error al cargar pagos pendientes: ${sanitizeHtml(err.message)}
                </td>
            </tr>
        `;
    }
    
    safeCreateIcons();
}

export function isSafeReceiptUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
    if (/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed)) return true;
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,[a-z0-9+/=]+$/i.test(trimmed)) return true;
    if (/^blob:/i.test(trimmed)) return true;
    return false;
}

function viewReceiptLarge(receiptUrl) {
    if (!isSafeReceiptUrl(receiptUrl)) {
        showToast?.('URL de comprobante no válida o insegura.', true);
        return;
    }
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
if (typeof window !== 'undefined') {
    window.loadPendingPaymentsAdmin = loadPendingPaymentsAdmin;
    window.approvePaymentAdmin = approvePaymentAdmin;
    window.rejectPaymentAdmin = rejectPaymentAdmin;
    window.deactivateVipCodeAdmin = deactivateVipCodeAdmin;
    window.generateVipCodeAdmin = generateVipCodeAdmin;
    window.viewReceiptLarge = viewReceiptLarge;
    window.isSafeReceiptUrl = isSafeReceiptUrl;

    window.loadConsolidatedAccounting = loadConsolidatedAccounting;
    window.openAdminPlanModal = openAdminPlanModal;
    window.setupAdminPlanModalEvents = setupAdminPlanModalEvents;
    window.loadReferralData = loadReferralData;
    window.loadVipCodesAdmin = loadVipCodesAdmin;
    window.triggerReferralConversion = triggerReferralConversion;
    window.setupAdminSubnav = setupAdminSubnav;
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupAdminSubnav);
    } else {
        setupAdminSubnav();
    }
}

export { viewReceiptLarge };
