import { initializeApp, cert } from 'firebase-admin/app';
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

import { getFirestore } from 'firebase-admin/firestore';
initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function printConfigs() {
  const snapshot = await db.collectionGroup("config").get();
  snapshot.forEach(doc => {
    console.log(`PATH: ${doc.ref.path}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    console.log('---');
  });
}
printConfigs();
