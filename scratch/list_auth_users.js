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

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();

async function listUsers() {
    try {
        const listUsersResult = await auth.listUsers(100);
        console.log(`Found ${listUsersResult.users.length} users in Auth:`);
        listUsersResult.users.forEach((userRecord) => {
            console.log(`- UID: ${userRecord.uid}, Email: ${userRecord.email}, DisplayName: ${userRecord.displayName}`);
        });
    } catch (error) {
        console.error('Error listing users:', error);
    }
}

listUsers();
