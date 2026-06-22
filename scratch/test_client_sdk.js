import { initializeApp as initAdmin, cert } from 'firebase-admin/app';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { initializeApp as initClient } from 'firebase/app';
import { getAuth as getClientAuth, signInWithCustomToken } from 'firebase/auth';
import { getFirestore as getClientFirestore, collectionGroup, getDocs } from 'firebase/firestore';
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

const firebaseConfig = {
  apiKey: "AIzaSyDV2GaYmyXXF6cYACk--bQLbAJZhyrng6k",
  authDomain: "licencias-musicales.firebaseapp.com",
  projectId: "licencias-musicales",
  storageBucket: "licencias-musicales.firebasestorage.app",
  messagingSenderId: "301787407086",
  appId: "1:301787407086:web:387cb9764b53feb05909ff",
  measurementId: "G-VB4EFVEKTD"
};

async function main() {
    try {
        // 1. Initialize Admin SDK and generate token
        initAdmin({
            credential: cert(serviceAccount)
        });
        const adminAuth = getAdminAuth();
        const sossaUid = "paXbnNbHMMPC31X3hf0oTUx4bbr2";
        // Create custom token with claims
        const customToken = await adminAuth.createCustomToken(sossaUid, {
            email: "sossabeatz1@gmail.com"
        });
        console.log("Custom token generated successfully.");

        // 2. Initialize Client SDK
        const clientApp = initClient(firebaseConfig);
        const clientAuth = getClientAuth(clientApp);
        const clientDb = getClientFirestore(clientApp);

        // Sign in with custom token
        const userCredential = await signInWithCustomToken(clientAuth, customToken);
        console.log(`Signed in successfully as: ${userCredential.user.email}`);

        // 3. Run the collection group query
        const configQuery = collectionGroup(clientDb, "config");
        const configSnapshot = await getDocs(configQuery);
        console.log(`Client SDK configSnapshot size: ${configSnapshot.size}`);

        configSnapshot.forEach((docSnap) => {
            console.log(`Document ID: ${docSnap.id}, Path: ${docSnap.ref.path}`);
        });

    } catch (error) {
        console.error("Error in simulation:", error);
    }
}

main();
