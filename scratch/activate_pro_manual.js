import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceAccount = null;
const possiblePaths = [
  path.join(__dirname, '..', 'firebase-adminsdk.json'),
  path.join(__dirname, 'firebase-adminsdk.json'),
  path.join(__dirname, '..', 'service-account.json'),
  path.join(__dirname, 'service-account.json')
];

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
    break;
  }
}

if (!serviceAccount) {
  console.error("❌ Error: No se encontró un archivo de credenciales de Firebase.");
  console.error("Por favor descarga el JSON de tu cuenta de servicio de Firebase y guárdalo como 'firebase-adminsdk.json' en la raíz del proyecto.");
  process.exit(1);
}

// Initialize Firebase Admin
initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

async function activatePro(email) {
    try {
        console.log(`Buscando usuario con email: ${email}`);
        const userRecord = await auth.getUserByEmail(email);
        const uid = userRecord.uid;
        console.log(`Usuario encontrado: ${userRecord.displayName || email} (UID: ${uid})`);

        // Actualizar en config/producer
        const configRef = db.collection('users').doc(uid).collection('config').doc('producer');
        await configRef.set({
            plan: 'pro',
            planActivatedAt: new Date().toISOString(),
            planPayPalOrderId: 'manual_admin_activation',
            planPayerEmail: email,
        }, { merge: true });

        // Actualizar en el documento principal del usuario
        const userRef = db.collection('users').doc(uid);
        await userRef.set({
            plan: 'pro',
            planActivatedAt: new Date().toISOString(),
        }, { merge: true });

        console.log(`¡Plan Pro activado exitosamente en Firestore para ${email}!`);
    } catch (error) {
        console.error(`Error al activar Plan Pro para ${email}:`, error);
    }
}

async function run() {
    await activatePro('beatscgmonarco@gmail.com');
}

run();
