import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { isTrustedBeatssOrigin } from '../api/_cors-origin.js';

function configureCors(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'private, no-store');
    if (origin && isTrustedBeatssOrigin(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT = 60;
const adminRateWindows = new Map();

export function resetAdminRateLimit() {
    adminRateWindows.clear();
}

export function checkAdminRateLimit(ip, now = Date.now(), limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    const record = adminRateWindows.get(ip);
    if (!record || now - record.start >= windowMs || now < record.start) {
        adminRateWindows.set(ip, { start: now, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
    }
    if (record.count >= limit) {
        const retryAfterSeconds = Math.max(1, Math.ceil((record.start + windowMs - now) / 1000));
        return { allowed: false, retryAfterSeconds };
    }
    record.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
}

function getSanitizedClientIp(req) {
    const headers = req?.headers || {};
    const forwarded = headers['x-vercel-forwarded-for'] || headers['x-forwarded-for'] || req?.socket?.remoteAddress || 'unknown';
    return String(Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .at(-1)
        ?.slice(0, 128) || 'unknown';
}

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
    const requestOrigin = String(req.headers?.origin || '');
    configureCors(req, res);

    if (req.method === 'OPTIONS') {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
        return res.status(204).end();
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST, OPTIONS');
        return res.status(405).json({ error: 'Método no permitido.' });
    }

    if (requestOrigin && !isTrustedBeatssOrigin(requestOrigin)) {
        return res.status(403).json({ error: 'Origen no permitido.' });
    }

    const clientIp = getSanitizedClientIp(req);
    const rateCheck = checkAdminRateLimit(clientIp);
    if (!rateCheck.allowed) {
        res.setHeader('Retry-After', String(rateCheck.retryAfterSeconds));
        return res.status(429).json({ error: 'Demasiadas solicitudes. Inténtalo más tarde.' });
    }

    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'No autorizado: Falta token de autenticación.' });
    }

    let decodedToken;
    try {
        initFirebaseAdmin();
        const idToken = authHeader.slice(7).trim();
        decodedToken = await getAuth().verifyIdToken(idToken);
    } catch (authError) {
        console.warn('[BEATSS Admin] Falló la verificación del token:', authError.code || 'AUTH_FAILED');
        return res.status(401).json({ error: 'No se pudo validar la sesión de administrador.' });
    }

    const email = String(decodedToken.email || '').toLowerCase();
    const SOSSA_ADMIN_EMAILS = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com'];
    const isAdmin = decodedToken.admin === true || SOSSA_ADMIN_EMAILS.includes(email);

    if (!isAdmin) {
        return res.status(403).json({ error: 'Acceso restringido: Se requieren privilegios de administrador.' });
    }

    const db = getFirestore();

    // Actualización de plan administrativo (POST)
    if (req.method === 'POST') {
        const { targetUserId, plan, expirationPro, email: targetEmail } = req.body || {};
        if (!targetUserId || !plan) {
            return res.status(400).json({ error: 'Parámetros incompletos.' });
        }
        const cleanPlan = String(plan).toLowerCase();
        if (!['inicial', 'pro', 'elite'].includes(cleanPlan)) {
            return res.status(400).json({ error: 'Plan inválido.' });
        }

        try {
            const now = new Date().toISOString();
            const updates = {
                plan: cleanPlan,
                planActivatedAt: now,
                planPayPalOrderId: 'manual_admin_activation'
            };
            if (targetEmail) updates.planPayerEmail = String(targetEmail).trim();
            if (cleanPlan === 'inicial') {
                updates.expirationPro = null;
            } else if (expirationPro) {
                updates.expirationPro = expirationPro;
            }

            // Actualizar config/producer y raíz de usuario
            const configRef = db.collection('users').doc(targetUserId).collection('config').doc('producer');
            const userRef = db.collection('users').doc(targetUserId);

            await Promise.all([
                configRef.set(updates, { merge: true }),
                userRef.set({ plan: cleanPlan, planActivatedAt: now }, { merge: true })
            ]);

            return res.status(200).json({ ok: true, plan: cleanPlan });
        } catch (updateErr) {
            console.error('[BEATSS Admin] Error al actualizar plan de usuario:', updateErr);
            return res.status(500).json({ error: 'No se pudo actualizar el plan del productor.' });
        }
    }

    // Consulta de datos consolidados (GET)
    try {
        // 1. Obtener todos los usuarios de /users
        const usersSnap = await db.collection('users').get();
        const usersMap = new Map();
        usersSnap.forEach(doc => {
            usersMap.set(doc.id, { id: doc.id, ...doc.data() });
        });

        // 2. Obtener todas las configuraciones de productores (collectionGroup 'config')
        const configSnap = await db.collectionGroup('config').get();
        const producerConfigs = [];
        const seenUserIds = new Set();

        configSnap.forEach(doc => {
            if (doc.id === 'producer') {
                const data = doc.data();
                const pathSegments = doc.ref.path.split('/');
                const userId = (pathSegments.length >= 2 && pathSegments[0] === 'users')
                    ? pathSegments[1]
                    : (doc.ref.parent.parent ? doc.ref.parent.parent.id : '');

                if (userId) {
                    seenUserIds.add(userId);
                    const userRoot = usersMap.get(userId) || {};
                    producerConfigs.push({
                        userId,
                        aka: data.aka || userRoot.aka || userRoot.displayName || (data.email || userRoot.email || '').split('@')[0] || 'Productor',
                        name: data.name || userRoot.name || userRoot.displayName || 'Sin Nombre',
                        email: data.email || userRoot.email || '',
                        plan: data.plan || userRoot.plan || 'inicial',
                        expirationPro: data.expirationPro || userRoot.expirationPro || null,
                        registeredAt: userRoot.registeredAt || userRoot.createdAt || null,
                        lastActiveDate: data.updatedAt || userRoot.lastLoginAt || null
                    });
                }
            }
        });

        // 3. Incluir usuarios de /users que aún no tengan doc config/producer
        usersSnap.forEach(doc => {
            if (!seenUserIds.has(doc.id)) {
                const u = doc.data();
                producerConfigs.push({
                    userId: doc.id,
                    aka: u.aka || u.displayName || (u.email ? u.email.split('@')[0] : 'Productor'),
                    name: u.name || u.displayName || 'Sin Nombre',
                    email: u.email || '',
                    plan: u.plan || 'inicial',
                    expirationPro: u.expirationPro || null,
                    registeredAt: u.registeredAt || u.createdAt || null,
                    lastActiveDate: u.lastLoginAt || null
                });
            }
        });

        // 4. Asegurar que Sossa siempre esté como principal si no vino de la BD
        const hasSossa = producerConfigs.some(p => {
            const em = (p.email || '').toLowerCase();
            return SOSSA_ADMIN_EMAILS.includes(em);
        });
        if (!hasSossa) {
            producerConfigs.unshift({
                userId: decodedToken.uid,
                aka: 'Sossa (Principal)',
                name: 'Joao David Domínguez (Sossa)',
                email: decodedToken.email || 'admin@sossamusic.com',
                plan: 'elite',
                expirationPro: null,
                registeredAt: '2026-01-01',
                lastActiveDate: new Date().toISOString()
            });
        }

        // Ordenar: Sossa siempre primero, luego alfabéticamente
        producerConfigs.sort((a, b) => {
            const emailA = (a.email || '').toLowerCase();
            const emailB = (b.email || '').toLowerCase();
            const isSossaA = SOSSA_ADMIN_EMAILS.includes(emailA);
            const isSossaB = SOSSA_ADMIN_EMAILS.includes(emailB);
            if (isSossaA && !isSossaB) return -1;
            if (!isSossaA && isSossaB) return 1;
            const nameA = (a.aka || a.name || a.email || '').toLowerCase();
            const nameB = (b.aka || b.name || b.email || '').toLowerCase();
            return nameA.localeCompare(nameB);
        });

        // 5. Obtener licencias consolidadas (collectionGroup 'licencias')
        const licSnap = await db.collectionGroup('licencias').get();
        const allLicenses = [];
        licSnap.forEach(doc => {
            const data = doc.data();
            const pathSegments = doc.ref.path.split('/');
            const userId = (pathSegments.length >= 2 && pathSegments[0] === 'users')
                ? pathSegments[1]
                : (doc.ref.parent.parent ? doc.ref.parent.parent.id : '');
            allLicenses.push({
                ...data,
                userId
            });
        });

        return res.status(200).json({
            ok: true,
            producers: producerConfigs,
            licenses: allLicenses
        });
    } catch (error) {
        console.error('[BEATSS Admin] Error al consolidar contabilidad:', error);
        return res.status(500).json({ error: 'Error interno al consultar datos consolidados.' });
    }
}
