import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  "type": "service_account",
  "project_id": "licencias-musicales",
  "private_key_id": "dcad0c506ec75c571395c02bf0e95d9124020354",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQC/JYTyD6gZiyWM\niy30/K7y4u4DE7cbvfjRpJ1Tjjfa1hh7VnlQinEP2uetTX2FJvMgQAN6A/o8Rd45\n7Asms6/+VSWETvbKJt1p6h0cgoFKmB9XYA69bN35vKTjYw14cK4YCo415DtBO5AO\n9bUkg16T5WTNP5reBi2zp9PfP1ggob0TYGh9LaVRts9duHvWbBp4Pme0AyQ/ki9O\npPHx7ek44ObI+VpBvFuQk9+1HRXaaxsdFLLQ3W73lMBdJX4Ke929ZeO4EfMCX5hO\np4OzJxey+4y7aSo9ZjBHnsiLums18d8YALVH15ohZmAGTj4VKHxmBGBh3nUFwDd/\ne/GHfBarAgMBAAECggEAFWezMpQ0Q+AELW/sjpG5WbO16ZxMlgu5EGj5wUCc2qG9\nDhrJ7Q4DyT2/UfXqh32sHkFs4j4NyLAeSag4O3ZF0Bpi4CUjl9GwW8r+xZGLvvm4\nEMXOAMJvPSc148zU1lbv9/s+n6RWSmDMKhCz30nizncSybVEt3ZDqemyXT6vtL+W\nQD3tvWvJ15oOTh6x6QZSb+yRadwPT9beKklgywzdXT9B+W0dUiXgb1iouPc8RlGA\nkPuPq8j7BV5OMFqZb8bXeSuXgl/kUCWBfELzpz2cdwH/8KKDSQGgYiVeaS9jEFBl\n8FADyokZ/5WnECC+Ow7T0y5mrzkF7Ue8q2PUtnTh6QKBgQDwf21mPIwF6RnwYMnT\nxhpy4mkxRB+Yz8HbtUwyzkMVhrs+wpbp3bUjVPcM+xy3Xjk83dE/v+r7FbvtXRCI\nc17NaIdBB3qiUb+xEXAzBPHTbnHOJNCqIwRZBCPJ6TqSHUoB8lVqiFEJJg+zAVu3\nW9g99L6hTE2SUqDYrfv3W8Ab7wKBgQDLd7kswveq8OadeSXE68oNOSado22aKRn2\nbGZHMxjdmTg0tzLwOX//BLRvmsiMnWkOQ04rnZGyRjEFjnF5XKQwP43t7ocbHBFj\nQNQdA2p44h6Nsj3PRHQAOSEMkXvlzchUjwy21CUNWPlyvSqsiwXYKvEyYgC/UZGl\nYWf5iG4lBQKBgDHu0yEB+zSS9E7DWcQ9gmpN9fdDpKfOovpiBwMZbjY+9guOzVSb\nMqu2TWEFli3AQ3QOvg5VY41kMtOSmgcqpQlS5Zor2ltvS7SQ4VHGegsjCD/7xtM8\nV/+/a0rVwNJrgF0tGmz3BpQ2sdXBt3A3gotCkH3e4NA7lafHX+Q4yYdDAoGASs8a\nJnsI1LD+GagRWvXWtEXvDMap5aR3B0OT11nSKqfLIpa5A9ogVYNFVEN0uT6nAbd9\nZkvo5cMpAwH8dsK5G4RCitjIlA8d1YBgfMpku01oLnD6iNqCTBK1NAnJpBSlM3Hl\nGtOlS+MK1ET5C7eRzoj7Zari23UCN+w4bmbbGIECgYBD1EOZUGaSCcl33x3SYRBd\nz5owTX8Kc4LudQ3LpZeWGEVL/7bz03iFrGAErxN04DRRYdJD0A7HGRpVfl1aVm7C\nLyhkVYWrxIW2HfQZjf9M1bAtQSBI4g/vlo7hhEx8NfdSlFvpMXJKwAhTi/dE+tTW\nxiFufJ9Uxkx7w4ePng/3GA==\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-fbsvc@licencias-musicales.iam.gserviceaccount.com"
};

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
