import { initializeApp, cert } from 'firebase-admin/app';
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

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function simulateConsolidatedAccounting() {
    let producerConfigs = [];
    try {
        const configSnapshot = await db.collectionGroup("config").get();
        console.log(`configSnapshot size: ${configSnapshot.size}`);
        
        configSnapshot.forEach((docSnap) => {
            console.log(`Document ID: ${docSnap.id}, Path: ${docSnap.ref.path}`);
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

        console.log(`\nproducerConfigs length before sorting: ${producerConfigs.length}`);
        
        producerConfigs.sort((a, b) => {
            const akaA = (a.aka || a.name || a.email || "").toLowerCase();
            const akaB = (b.aka || b.name || b.email || "").toLowerCase();
            return akaA.localeCompare(akaB);
        });

        console.log(`\nproducerConfigs length after sorting: ${producerConfigs.length}`);
        producerConfigs.forEach((user, idx) => {
            console.log(`\n[User ${idx + 1}]`);
            console.log(`UserId: ${user.userId}`);
            console.log(`AKA: ${user.aka}`);
            console.log(`Name: ${user.name}`);
            console.log(`Email: ${user.email}`);
            console.log(`Plan: ${user.plan}`);
        });

    } catch (err) {
        console.error("Error:", err);
    }
}

simulateConsolidatedAccounting();
