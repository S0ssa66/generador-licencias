#!/usr/bin/env node
// scratch/register_paypal_webhook.js
// ─────────────────────────────────────────────────────────────────────────────
// Script ONE-TIME para registrar el webhook de PayPal que escucha eventos
// de suscripciones recurrentes. Ejecútalo UNA SOLA VEZ con:
//
//   node scratch/register_paypal_webhook.js
//
// Luego copia el WEBHOOK_ID que imprime y agrégalo como variable de entorno
// en Vercel: PAYPAL_WEBHOOK_ID = <id impreso>
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config';

const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_MODE = process.env.PAYPAL_MODE || 'live'; // 'sandbox' o 'live'

const BASE_URL = PAYPAL_MODE === 'sandbox'
    ? 'https://api-m.sandbox.paypal.com'
    : 'https://api-m.paypal.com';

const WEBHOOK_URL = 'https://generador-licencias.vercel.app/api/payments/webhook';

// Eventos que queremos escuchar
const EVENT_TYPES = [
    { name: 'BILLING.SUBSCRIPTION.ACTIVATED' },
    { name: 'BILLING.SUBSCRIPTION.CANCELLED' },
    { name: 'BILLING.SUBSCRIPTION.EXPIRED' },
    { name: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED' },
    { name: 'BILLING.SUBSCRIPTION.RENEWED' },
    { name: 'BILLING.SUBSCRIPTION.SUSPENDED' },
    { name: 'PAYMENT.SALE.COMPLETED' },
];

async function getAccessToken() {
    const creds = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64');
    const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials'
    });
    if (!res.ok) throw new Error(`Error al obtener token: ${await res.text()}`);
    const data = await res.json();
    return data.access_token;
}

async function listExistingWebhooks(token) {
    const res = await fetch(`${BASE_URL}/v1/notifications/webhooks`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`Error listando webhooks: ${await res.text()}`);
    return await res.json();
}

async function registerWebhook(token) {
    const res = await fetch(`${BASE_URL}/v1/notifications/webhooks`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            url: WEBHOOK_URL,
            event_types: EVENT_TYPES,
        })
    });

    const data = await res.json();
    if (!res.ok) {
        throw new Error(`Error al registrar webhook: ${JSON.stringify(data)}`);
    }
    return data;
}

async function main() {
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        console.error('❌ Faltan PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET en el .env');
        process.exit(1);
    }

    console.log(`\n🔗 Conectando a PayPal (${PAYPAL_MODE})...`);
    const token = await getAccessToken();
    console.log('✅ Token obtenido\n');

    // Verificar webhooks existentes
    console.log('🔍 Verificando webhooks existentes...');
    const existing = await listExistingWebhooks(token);
    const webhooks = existing.webhooks || [];

    const existingWebhook = webhooks.find(w => w.url === WEBHOOK_URL);
    if (existingWebhook) {
        console.log(`\n✅ El webhook ya existe:`);
        console.log(`   ID:  ${existingWebhook.id}`);
        console.log(`   URL: ${existingWebhook.url}`);
        console.log(`\n👉 Agrega esta variable en Vercel:`);
        console.log(`   PAYPAL_WEBHOOK_ID = ${existingWebhook.id}`);
        return;
    }

    // Registrar nuevo webhook
    console.log(`\n📡 Registrando webhook en: ${WEBHOOK_URL}`);
    console.log('   Eventos suscritos:');
    EVENT_TYPES.forEach(e => console.log(`   - ${e.name}`));

    const webhook = await registerWebhook(token);

    console.log(`\n✅ ¡Webhook registrado exitosamente!`);
    console.log(`   ID:  ${webhook.id}`);
    console.log(`   URL: ${webhook.url}`);
    console.log(`\n🔑 Agrega ESTA variable de entorno en Vercel:`);
    console.log(`   Nombre: PAYPAL_WEBHOOK_ID`);
    console.log(`   Valor:  ${webhook.id}`);
    console.log(`\n   Comando para agregar en Vercel CLI:`);
    console.log(`   npx vercel env add PAYPAL_WEBHOOK_ID`);
    console.log(`   (pega el valor cuando te lo pida)`);
}

main().catch(err => {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
});
