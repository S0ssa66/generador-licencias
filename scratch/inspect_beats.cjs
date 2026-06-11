const { initializeApp } = require('firebase/app');
const { getFirestore, collectionGroup, getDocs, collection } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "AIzaSyDV2GaYmyXXF6cYACk--bQLbAJZhyrng6k",
  authDomain: "licencias-musicales.firebaseapp.com",
  projectId: "licencias-musicales",
  storageBucket: "licencias-musicales.firebasestorage.app",
  messagingSenderId: "301787407086",
  appId: "1:301787407086:web:387cb9764b53feb05909ff",
  measurementId: "G-VB4EFVEKTD"
};

async function inspect() {
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    const q = collectionGroup(db, "config");
    const snapshot = await getDocs(q);
    
    let producerUid = null;
    for (const doc of snapshot.docs) {
        if ((doc.data().aka || '').toLowerCase() === 'sossa') {
            producerUid = doc.ref.path.split('/')[1];
            break;
        }
    }

    if (producerUid) {
        console.log("Found Sossa UID:", producerUid);
        const beatsCol = collection(db, "users", producerUid, "beats");
        const beatsSnapshot = await getDocs(beatsCol);
        beatsSnapshot.forEach(b => {
            const data = b.data();
            console.log(`Beat: ${data.name}`);
            console.log(` - mp3: ${data.mp3}`);
            console.log(` - wav: ${data.wav}`);
            console.log(` - stems: ${data.stems}`);
        });
    } else {
        console.log("Sossa not found");
    }
}

inspect().catch(console.error);
