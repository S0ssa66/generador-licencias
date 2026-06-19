// api/payments/config.js — Vercel Serverless Function
// Retorna la configuración pública de pagos del administrador (sossa)

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ADMIN_UID = 'paXbnNbHMMPC31X3hf0oTUx4bbr2';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://generador-licencias.vercel.app';

// Inicializar Firebase Admin (solo una vez)
function initFirebaseAdmin() {
    if (getApps().length > 0) return;
    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        })
    });
}

export default async function handler(req, res) {
    // CORS headers - restringido al dominio propio
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Preflight
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Solo GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        initFirebaseAdmin();
        const db = getFirestore();

        // Cargar configuración del productor administrador (sossa)
        const docRef = db.collection('users').doc(ADMIN_UID).collection('config').doc('producer');
        const snap = await docRef.get();

        if (!snap.exists) {
            // Fallback de contingencia si no se encuentra en la BD
            return res.status(200).json({
                paypalClientId: 'AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-',
                paypalPlanIdPro: '',
                paypalPlanIdElite: '',
                payphoneClientId: '',
                payphoneAppId: '',
                deunaPhone: '+593961201184',
                deunaName: 'Joao David Dominguez Sosa',
                bankPichinchaName: 'Joao Dominguez'
            });
        }

        const config = snap.data();
        return res.status(200).json({
            paypalClientId: config.paypalClientId || 'AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-',
            paypalPlanIdPro: config.paypalPlanIdPro || '',
            paypalPlanIdElite: config.paypalPlanIdElite || '',
            payphoneClientId: config.payphoneClientId || '',
            payphoneAppId: config.payphoneAppId || '',
            deunaPhone: config.deunaPhone || '+593961201184',
            deunaName: config.deunaName || 'Joao David Dominguez Sosa',
            bankPichinchaName: config.bankPichinchaName || 'Joao Dominguez'
        });

    } catch (error) {
        console.error('❌ Error al obtener config de pagos:', error);
        return res.status(500).json({
            error: 'Error interno del servidor',
            details: error.message
        });
    }
}
