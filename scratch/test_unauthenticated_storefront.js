import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs, query, where, collection } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDV2GaYmyXXF6cYACk--bQLbAJZhyrng6k",
  authDomain: "licencias-musicales.firebaseapp.com",
  projectId: "licencias-musicales",
  storageBucket: "licencias-musicales.firebasestorage.app",
  messagingSenderId: "301787407086",
  appId: "1:301787407086:web:387cb9764b53feb05909ff",
  measurementId: "G-VB4EFVEKTD"
};

async function testPublicQueries() {
    console.log("Initializing Firebase app...");
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    try {
        console.log("1. Querying config using unfiltered collectionGroup...");
        const q = collectionGroup(db, "config");
        const snapshot = await getDocs(q);
        console.log(`Success! Found config docs: ${snapshot.size}`);
        
        let producerDoc = null;
        for (const doc of snapshot.docs) {
            const akaVal = (doc.data().aka || '').toLowerCase();
            if (akaVal === "sossa".toLowerCase()) {
                producerDoc = doc;
                break;
            }
        }

        if (producerDoc) {
            const doc = producerDoc;
            const data = doc.data();
            const pathParts = doc.ref.path.split('/');
            const producerUid = pathParts[1];
            console.log(`Producer UID: ${producerUid}`);
            console.log(`AKA: ${data.aka}, Email: ${data.email}`);

            console.log(`2. Querying beats for producer ${producerUid}...`);
            const beatsCol = collection(db, "users", producerUid, "beats");
            const beatsSnapshot = await getDocs(beatsCol);
            console.log(`Success! Found beats: ${beatsSnapshot.size}`);
            beatsSnapshot.forEach(b => {
                console.log(` - Beat: ${b.data().name} (${b.id})`);
            });
        } else {
            console.log("No config document found with aka 'sossa'.");
        }
    } catch (error) {
        console.error("❌ Failed public query:", error);
    }
}

testPublicQueries();
