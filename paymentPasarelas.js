/**
 * BEATSS - Payment Pasarelas Module
 * Handles PayPal subscriptions, PayPhone checkout initialization, and payment simulation endpoints.
 * Modularized to reduce index.html size and optimize token processing.
 */

window.selectedPaymentPlan = 'pro';
window.adminPaymentConfig = null;
let paymentConfigPromise = null;

async function ensurePaymentConfig() {
    if (window.adminPaymentConfig) return window.adminPaymentConfig;
    if (paymentConfigPromise) return paymentConfigPromise;

    paymentConfigPromise = fetch('/api/payments/config')
        .then((res) => {
            if (!res.ok) throw new Error('Error al cargar config de pagos');
            return res.json();
        })
        .then((config) => {
            window.adminPaymentConfig = config;
            return config;
        })
        .catch((error) => {
            paymentConfigPromise = null;
            console.error('Failed to load payment config:', error);
            throw error;
        });

    return paymentConfigPromise;
}

async function initPaymentModalPasarelas() {
    try {
        await ensurePaymentConfig();
    } catch (_) {
        return;
    }

    // 2. Show simulation buttons if local or admin
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isAdmin = window.currentUser === 'paXbnNbHMMPC31X3hf0oTUx4bbr2';
    if (isLocal || isAdmin) {
        const paypalSim = document.getElementById('simulate-paypal-btn');
        if (paypalSim) paypalSim.style.display = 'block';
        const payphoneSim = document.getElementById('simulate-payphone-btn');
        if (payphoneSim) payphoneSim.style.display = 'block';
    }
}

function loadAdminPayPalSDK(clientId, callback) {
    window.paypalLoadError = false;
    if (window.paypalLoadTimer) {
        clearTimeout(window.paypalLoadTimer);
        window.paypalLoadTimer = null;
    }
    const existing = document.getElementById('paypal-sdk-script');
    if (existing) {
        if (existing.getAttribute('data-client-id') === clientId) {
            if (callback) callback();
            return;
        }
        existing.remove();
    }
    const script = document.createElement('script');
    script.id = 'paypal-sdk-script';
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&vault=true&intent=subscription`;
    script.setAttribute('data-client-id', clientId);
    script.onload = () => {
        if (window.paypalLoadTimer) {
            clearTimeout(window.paypalLoadTimer);
            window.paypalLoadTimer = null;
        }
        if (callback) callback();
    };
    script.onerror = () => {
        window.paypalLoadError = true;
        if (window.paypalLoadTimer) {
            clearTimeout(window.paypalLoadTimer);
            window.paypalLoadTimer = null;
        }
        renderPayPalButton();
    };
    document.head.appendChild(script);
}

function loadPayphoneStyles() {
    if (document.getElementById('payphone-payment-box-styles')) return;
    const link = document.createElement('link');
    link.id = 'payphone-payment-box-styles';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.css';
    document.head.appendChild(link);
}

function loadPayphoneSDK(callback) {
    const existing = document.getElementById('payphone-sdk-script');
    if (existing) {
        if (callback) callback();
        return;
    }
    loadPayphoneStyles();
    const sdk = document.createElement('script');
    sdk.id = 'payphone-sdk-script';
    sdk.src = 'https://cdn.payphonetodoesposible.com/box/v1.1/payphone-payment-box.js';
    sdk.onload = callback;
    document.head.appendChild(sdk);
}

function renderPayPalButton() {
    const container = document.getElementById('paypal-button-container');
    if (!container) return;

    if (!window.adminPaymentConfig) {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 13.5px; font-weight: 500; padding: 4px 0;">Cargando configuración de pagos...</div>';
        ensurePaymentConfig().then(renderPayPalButton).catch(() => {
            container.innerHTML = '<div style="color: #f87171; font-size: 13px;">No se pudo cargar la configuración de PayPal.</div>';
        });
        return;
    }

    const tier = window.selectedPaymentPlan;
    let planId = '';
    if (tier === 'elite') planId = window.adminPaymentConfig.paypalPlanIdElite;
    else if (tier === 'pro') planId = window.adminPaymentConfig.paypalPlanIdPro;
    else if (tier === 'creator') planId = window.adminPaymentConfig.paypalPlanIdCreator;
    else if (tier === 'pro_artist') planId = window.adminPaymentConfig.paypalPlanIdProArtist;

    const isMockPlan = !planId || planId.startsWith('PAYPAL-SUB-MOCK-');

    // Si ya está renderizado este mismo plan y tiene elementos del SDK de PayPal, no hacemos nada para evitar romper el DOM
    if (window.paypalCurrentlyRenderedPlan === tier && container.children.length > 0 && !isMockPlan) {
        console.log("ℹ️ Botón de PayPal ya renderizado para el plan:", tier);
        return;
    }

    container.innerHTML = ''; // Limpiar botón anterior
    window.paypalCurrentlyRenderedPlan = null; // Resetear plan actual en render

    if (isMockPlan) {
        const canSimulate = ['localhost', '127.0.0.1'].includes(window.location.hostname) || window.currentUser === 'paXbnNbHMMPC31X3hf0oTUx4bbr2';
        container.innerHTML = canSimulate
            ? `<button class="btn btn-secondary" onclick="simulatePaypalSubscription('${tier}')" style="width:100%;height:48px;border-radius:8px;font-weight:700;">Simular suscripción (${tier.toUpperCase()})</button>`
            : '<div style="color:#cbd5e0;font-size:12px;padding:10px;">PayPal no está configurado para este plan.</div>';
        return;
    }

    if (window.paypalLoadError) {
        container.innerHTML = `
            <div style="padding: 10px; background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); border-radius: 8px; color: #f87171; font-size: 13px; line-height: 1.5; font-weight: 500;">
                ⚠️ <strong>Error al cargar PayPal:</strong> No se pudo conectar con el servicio. Si utilizas un bloqueador de publicidad (AdBlock/Brave), desactívalo temporalmente o utiliza otro método.
            </div>
        `;
        return;
    }

    if (typeof paypal === 'undefined') {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 13.5px; font-weight: 500; padding: 4px 0;">Cargando portal de PayPal...</div>';
        
        // Cargar dinámicamente si no se ha intentado antes
        if (window.adminPaymentConfig.paypalClientId && !document.getElementById('paypal-sdk-script')) {
            loadAdminPayPalSDK(window.adminPaymentConfig.paypalClientId, () => {
                renderPayPalButton();
            });
        }

        if (!window.paypalLoadTimer) {
            window.paypalLoadTimer = setTimeout(() => {
                if (typeof paypal === 'undefined') {
                    window.paypalLoadError = true;
                    renderPayPalButton();
                }
            }, 7000);
        }
        
        if (window.paypalLoadRetryTimeout) {
            clearTimeout(window.paypalLoadRetryTimeout);
        }
        window.paypalLoadRetryTimeout = setTimeout(renderPayPalButton, 500);
        return;
    }

    // Registrar el plan actual en render
    window.paypalCurrentlyRenderedPlan = tier;

    paypal.Buttons({
        style: {
            layout: 'vertical',
            color: 'gold',
            shape: 'rect',
            label: 'subscribe',
            height: 55
        },
        createSubscription: function(data, actions) {
            return actions.subscription.create({
                plan_id: planId
            });
        },
        onApprove: async function(data, actions) {
            const subscriptionId = data.subscriptionID;
            const uid = window.currentUser || null;
            const email = window.currentUserEmail || '';

            try {
                const idToken = window.getFirebaseIdToken ? await window.getFirebaseIdToken() : '';
                const response = await fetch('/api/activate-pro', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ subscriptionId, uid, email, plan: tier })
                });
                const result = await response.json();

                document.getElementById('payment-modal').style.display = 'none';

                if (result.success) {
                    const toast = document.createElement('div');
                    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#0055ee,#00aacc);color:#fff;padding:18px 32px;border-radius:14px;font-weight:700;font-size:16px;z-index:99999;box-shadow:0 12px 32px rgba(0,102,255,0.4);text-align:center;max-width:90vw;';
                    const planLabel = result.plan === 'elite' ? 'Elite 👑' : 'Pro';
                    toast.innerHTML = `🎉 <strong>¡Suscripción ${planLabel} Activada!</strong><br><span style="font-weight:400;font-size:13px;">Recarga la página para disfrutar tus beneficios.</span>`;
                    document.body.appendChild(toast);
                    setTimeout(() => {
                        toast.remove();
                        window.location.reload();
                    }, 4000);
                } else {
                    throw new Error(result.error || 'Error desconocido');
                }
            } catch (err) {
                document.getElementById('payment-modal').style.display = 'none';
                const toast = document.createElement('div');
                toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#f59e0b;color:#000;padding:18px 32px;border-radius:14px;font-weight:700;font-size:14px;z-index:99999;box-shadow:0 12px 32px rgba(0,0,0,0.3);text-align:center;max-width:90vw;';
                toast.innerHTML = `⚠️ <strong>La suscripción requiere revisión</strong><br><span style="font-weight:400;font-size:12px;">Conserva esta referencia y revisa el estado en tu cuenta: ${subscriptionId}</span>`;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 8000);
            }
        },
        onError: function(err) {
            console.error('PayPal error:', err);
            alert('Hubo un error con PayPal. Por favor intenta de nuevo o usa la transferencia bancaria.');
        }
    }).render('#paypal-button-container');
}

function renderPayphoneSubscriptionButton() {
    const container = document.getElementById('payphone-subscription-button-container');
    if (!container) return;

    if (!window.adminPaymentConfig) {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 13.5px; font-weight: 500; padding: 4px 0;">Cargando configuración de pagos...</div>';
        ensurePaymentConfig().then(renderPayphoneSubscriptionButton).catch(() => {
            container.innerHTML = '<div style="color: #f87171; font-size: 13px;">No se pudo cargar la configuración de PayPhone.</div>';
        });
        return;
    }
    container.innerHTML = ''; // Limpiar anterior

    if (typeof PPaymentButtonBox === 'undefined') {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.6); font-size: 13.5px; font-weight: 500; padding: 4px 0;">Cargando PayPhone...</div>';
        if (!document.getElementById('payphone-sdk-script')) {
            loadPayphoneSDK(() => {
                renderPayphoneSubscriptionButton();
            });
        }
        setTimeout(renderPayphoneSubscriptionButton, 500);
        return;
    }

    const tier = window.selectedPaymentPlan;
    let priceDollars = 10;
    if (tier === 'elite') priceDollars = 30;
    else if (tier === 'creator') priceDollars = 9.99;
    else if (tier === 'pro_artist') priceDollars = 19.99;
    const priceCents = Math.round(priceDollars * 100);

    if (!window.adminPaymentConfig || !window.adminPaymentConfig.payphoneClientId || !window.adminPaymentConfig.payphoneAppId) {
        container.innerHTML = '<div style="color: #cbd5e0; font-size: 11px;">Credenciales de PayPhone no configuradas por admin.</div>';
        return;
    }

    const token = window.adminPaymentConfig.payphoneClientId;
    const appId = window.adminPaymentConfig.payphoneAppId;
    const clientTxId = 'PAYPHONE-SUB-' + Date.now();
    const buyerEmail = window.currentUserEmail || '';

    const state = {
        uid: window.currentUser || 'mock-uid',
        email: buyerEmail,
        plan: tier
    };
    localStorage.setItem('payphone_sub_pending_' + clientTxId, JSON.stringify(state));

    try {
        const ppb = new PPaymentButtonBox({
            token: token,
            clientTransactionId: clientTxId,
            amount: priceCents,
            amountWithoutTax: priceCents,
            amountWithTax: 0,
            tax: 0,
            service: 0,
            tip: 0,
            storeId: appId,
            reference: 'Suscripción BEATSS ' + tier.toUpperCase(),
            email: buyerEmail,
            documentId: '9999999999',
            phoneNumber: '0999999999'
        });
        ppb.render('#payphone-subscription-button-container');
    } catch (err) {
        console.error('Error rendering PayPhone subscription button:', err);
        container.innerHTML = '<div style="color: #ef4444; font-size: 11px;">Error al inicializar PayPhone.</div>';
    }
}

window.simulatePayphoneSubscription = async function() {
    const uid = window.currentUser;
    const email = window.currentUserEmail || '';
    const tier = window.selectedPaymentPlan;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isAdmin = uid === 'paXbnNbHMMPC31X3hf0oTUx4bbr2';

    if (!uid) {
        alert('Inicia sesión antes de simular el pago');
        return;
    }
    if (!isLocal && !isAdmin) {
        alert('La simulación de pago solo está disponible en entorno local o para el administrador.');
        return;
    }

    try {
        const idToken = window.getFirebaseIdToken ? await window.getFirebaseIdToken() : '';
        const response = await fetch('/api/payments/payphone/subscription/confirm', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({
                id: 999999,
                clientTxId: 'PAYPHONE-SUB-MOCK-' + Date.now(),
                uid: uid,
                plan: tier,
                email: email
            })
        });

        const result = await response.json();
        if (response.ok && result.status === 'success') {
            document.getElementById('payment-modal').style.display = 'none';
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#00aacc,#00ccff);color:#fff;padding:18px 32px;border-radius:14px;font-weight:700;font-size:16px;z-index:99999;box-shadow:0 12px 32px rgba(0,170,204,0.4);text-align:center;max-width:90vw;';
            const planLabel = tier === 'elite' ? 'Elite 👑' : 'Pro';
            toast.innerHTML = `🎉 <strong>¡Suscripción ${planLabel} Activada!</strong><br><span style="font-weight:400;font-size:13px;">Simulación exitosa. Recargando...</span>`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.remove();
                window.location.reload();
            }, 4000);
        } else {
            throw new Error(result.error || 'Error desconocido');
        }
    } catch (err) {
        alert('Error al simular pago: ' + err.message);
    }
}

window.simulatePaypalSubscription = async function(tier) {
    const uid = window.currentUser || 'mock-user-id';
    const email = window.currentUserEmail || 'artista@example.com';
    const mockId = 'PAYPAL-SUB-MOCK-' + Date.now();
    try {
        if (typeof window.showToast === 'function') window.showToast("Activando suscripción...");
        const idToken = window.getFirebaseIdToken ? await window.getFirebaseIdToken() : '';
        const response = await fetch('/api/activate-pro', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ subscriptionId: mockId, uid, email, plan: tier })
        });
        const result = await response.json();
        document.getElementById('payment-modal').style.display = 'none';
        if (result.success) {
            const toast = document.createElement('div');
            toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#0055ee,#00aacc);color:#fff;padding:18px 32px;border-radius:14px;font-weight:700;font-size:16px;z-index:99999;box-shadow:0 12px 32px rgba(0,102,255,0.4);text-align:center;max-width:90vw;';
            toast.innerHTML = `🎉 <strong>¡Suscripción ${tier.toUpperCase()} Activada!</strong><br><span style="font-weight:400;font-size:13px;">Recarga la página para disfrutar de tus beneficios.</span>`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.remove();
                window.location.reload();
            }, 4000);
        }
    } catch (err) {
        console.error("Error al simular suscripción:", err);
    }
};

window.checkPayphoneSubscriptionRedirectResult = async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    const clientTxId = urlParams.get('clientTransactionId');

    if (id && clientTxId && clientTxId.startsWith('PAYPHONE-SUB-')) {
        const pendingKey = 'payphone_sub_pending_' + clientTxId;
        const pendingStateStr = localStorage.getItem(pendingKey);
        if (!pendingStateStr) return;

        let state;
        try {
            state = JSON.parse(pendingStateStr);
        } catch (e) {
            console.error('Error parsing payphone sub pending state:', e);
            return;
        }

        const overlay = document.createElement('div');
        overlay.id = 'payphone-sub-processing-overlay';
        overlay.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(10,12,22,0.95); z-index:999999; display:flex; flex-direction:column; align-items:center; justify-content:center; color:#fff; font-family:sans-serif; gap:20px;';
        overlay.innerHTML = `
            <div style="width: 50px; height: 50px; border: 5px solid rgba(0,204,255,0.1); border-top-color: #00ccff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="font-size: 18px; font-weight: 700;">Verificando suscripción con PayPhone...</div>
            <div style="font-size: 13px; color: #8a91a6;">Por favor, no cierres esta ventana</div>
            <style>
                @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            </style>
        `;
        document.body.appendChild(overlay);

        try {
            const idToken = window.getFirebaseIdToken ? await window.getFirebaseIdToken() : '';
            const response = await fetch('/api/payments/payphone/subscription/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({
                    id: parseInt(id, 10),
                    clientTxId: clientTxId,
                    uid: state.uid,
                    plan: state.plan,
                    email: state.email
                })
            });

            const result = await response.json();

            localStorage.removeItem(pendingKey);
            window.history.replaceState({}, document.title, window.location.pathname);

            if (response.ok && result.status === 'success') {
                overlay.innerHTML = `
                    <div style="font-size: 40px; margin-bottom: 10px;">🎉</div>
                    <div style="font-size: 20px; font-weight: 700; color: #00ccff;">¡Suscripción Activada Exitosamente!</div>
                    <div style="font-size: 13px; color: #a3a9b9; margin-top: 8px;">Redirigiendo de vuelta a BEATSS...</div>
                `;
                setTimeout(() => {
                    overlay.remove();
                    window.location.reload();
                }, 3000);
            } else {
                throw new Error(result.error || 'Error al validar la suscripción');
            }
        } catch (err) {
            console.error('Error verifying PayPhone subscription:', err);
            overlay.innerHTML = `
                <div style="font-size: 40px; margin-bottom: 10px;">❌</div>
                <div style="font-size: 18px; font-weight: 700; color: #ef4444;">No se pudo verificar la suscripción</div>
                <div style="font-size: 13px; color: #a3a9b9; margin-top: 8px; max-width: 80%; text-align: center;">${err.message}</div>
                <button onclick="document.getElementById('payphone-sub-processing-overlay').remove(); window.location.reload();" style="margin-top: 20px; padding: 10px 20px; border-radius: 8px; border: none; background: #00ccff; color: #0f1320; font-weight: 700; cursor: pointer;">Volver a BEATSS</button>
            `;
        }
    }
}

window.selectedPaymentMethod = 'paypal';

window.selectPaymentMethod = function(method) {
    window.selectedPaymentMethod = method;
    
    // Quitar clase pm-active de todos los botones de metodo de pago
    document.querySelectorAll('#pm-step-1 .pm-card-btn').forEach(btn => {
        btn.classList.remove('pm-active');
        // Quitar indicador dot interno
        const indicator = btn.querySelector('div[style*="border-radius:50%"]') || btn.querySelector('div[style*="border-radius: 50%"]');
        if (indicator) {
            indicator.innerHTML = '';
            indicator.style.borderColor = 'rgba(255,255,255,0.25)';
        }
    });
    
    // Buscar el boton clickeado y activarlo
    const activeBtn = Array.from(document.querySelectorAll('#pm-step-1 .pm-card-btn')).find(btn => {
        const onclickAttr = btn.getAttribute('onclick') || '';
        return onclickAttr.includes(`'${method}'`) || onclickAttr.includes(`"${method}"`);
    });
    
    if (activeBtn) {
        activeBtn.classList.add('pm-active');
        const indicator = activeBtn.querySelector('div[style*="border-radius:50%"]') || activeBtn.querySelector('div[style*="border-radius: 50%"]');
        if (indicator) {
            indicator.style.borderColor = '#6366f1';
            indicator.innerHTML = '<div style="width:10px; height:10px; border-radius:50%; background:#6366f1;"></div>';
        }
    }
}

window.goToPaymentStep = function(step) {
    const step1 = document.getElementById('pm-step-1');
    const step2 = document.getElementById('pm-step-2');
    const title = document.getElementById('pm-modal-title');
    
    if (!step1 || !step2) return;
    
    if (step === 1) {
        step2.style.display = 'none';
        step1.style.display = 'block';
        if (title) title.textContent = 'Elige tu plan';
    } else if (step === 2) {
        step1.style.display = 'none';
        step2.style.display = 'block';
        
        // Configurar titulo segun el metodo elegido
        let methodName = 'PayPal';
        if (window.selectedPaymentMethod === 'deuna') methodName = 'Deuna!';
        else if (window.selectedPaymentMethod === 'transfer') methodName = 'Transferencia Bancaria';
        else if (window.selectedPaymentMethod === 'payphone') methodName = 'PayPhone';
        
        if (title) title.textContent = `Pagar con ${methodName}`;
        
        // Mostrar panel correspondiente
        window.switchPaymentMethodTab(window.selectedPaymentMethod);
        
        // Configurar visibilidad del formulario de comprobante manual
        const receiptForm = document.getElementById('payment-receipt-form');
        if (receiptForm) {
            if (window.selectedPaymentMethod === 'deuna' || window.selectedPaymentMethod === 'transfer') {
                receiptForm.style.display = 'block';
                const methodSelect = document.getElementById('receipt-method');
                if (methodSelect) {
                    if (window.selectedPaymentMethod === 'deuna') methodSelect.value = 'Deuna!';
                    else if (window.selectedPaymentMethod === 'transfer') methodSelect.value = 'Banco Pichincha';
                }
            } else {
                receiptForm.style.display = 'none';
            }
        }
        
        // Si es PayPal o PayPhone, inicializar o renderizar botones correspondientes
        if (window.selectedPaymentMethod === 'paypal') {
            renderPayPalButton();
        } else if (window.selectedPaymentMethod === 'payphone') {
            renderPayphoneSubscriptionButton();
        }
    }
    if (window.safeCreateIcons) window.safeCreateIcons();
}

window.switchPaymentMethodTab = function(method) {
    document.querySelectorAll('.pay-method-panel').forEach(panel => {
        panel.style.display = 'none';
    });
    const activePanel = document.getElementById(`pay-tab-${method}`);
    if (activePanel) activePanel.style.display = 'block';

    if (window.safeCreateIcons) window.safeCreateIcons();
}

window.switchPaymentPlan = function(plan) {
    window.selectedPaymentPlan = plan;

    const btnPro = document.getElementById('pay-select-pro');
    const btnElite = document.getElementById('pay-select-elite');

    if (plan === 'elite' || plan === 'pro_artist') {
        // Pro inactive
        btnPro.style.border = '1.5px solid rgba(255,255,255,0.08)';
        btnPro.style.background = 'rgba(255,255,255,0.03)';
        btnPro.style.boxShadow = 'none';
        btnPro.querySelector('div:first-child').style.color = 'rgba(255,255,255,0.35)';
        // Elite active
        btnElite.style.border = '1.5px solid #f59e0b';
        btnElite.style.background = 'rgba(245,158,11,0.1)';
        btnElite.style.boxShadow = '0 0 0 1px rgba(245,158,11,0.2)';
        btnElite.querySelector('div:first-child').style.color = '#fbbf24';
    } else {
        // Pro active
        btnPro.style.border = '1.5px solid #6366f1';
        btnPro.style.background = 'rgba(99,102,241,0.12)';
        btnPro.style.boxShadow = '0 0 0 1px rgba(99,102,241,0.2)';
        btnPro.querySelector('div:first-child').style.color = '#a5b4fc';
        // Elite inactive
        btnElite.style.border = '1.5px solid rgba(255,255,255,0.08)';
        btnElite.style.background = 'rgba(255,255,255,0.03)';
        btnElite.style.boxShadow = 'none';
        btnElite.querySelector('div:first-child').style.color = 'rgba(255,255,255,0.35)';
    }

    const refInput = document.getElementById('receipt-ref');
    if (refInput) {
        refInput.placeholder = (plan === 'elite' || plan === 'pro_artist') ? 'Ej. Ref Elite 123456' : 'Ej. 123456';
    }

    renderPayPalButton();
    renderPayphoneSubscriptionButton();
}

// Bind local functions to window explicitly for global backward compatibility
window.initPaymentModalPasarelas = initPaymentModalPasarelas;
window.ensurePaymentConfig = ensurePaymentConfig;
window.loadAdminPayPalSDK = loadAdminPayPalSDK;
window.loadPayphoneSDK = loadPayphoneSDK;
window.loadPayphoneStyles = loadPayphoneStyles;
window.renderPayPalButton = renderPayPalButton;
window.renderPayphoneSubscriptionButton = renderPayphoneSubscriptionButton;

// La configuración de pagos se solicita únicamente al abrir el flujo de pago.
// No debe bloquear la landing ni el Studio cuando el usuario no va a pagar.
