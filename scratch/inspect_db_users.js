import admin from "firebase-admin";
import fs from "fs";

// Cargar credenciales
const serviceAccount = JSON.parse(fs.readFileSync("./firebase-adminsdk.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function run() {
  console.log("Fetching users from Firestore...");
  const usersSnap = await db.collection("users").get();
  
  for (const doc of usersSnap.docs) {
    const uid = doc.id;
    const data = doc.data();
    console.log(`\nUser: ${data.name || data.aka || 'Unnamed'} (${data.email || 'No Email'}) | UID: ${uid}`);
    
    const templatesSnap = await db.collection("users").doc(uid).collection("templates").get();
    if (templatesSnap.empty) {
      console.log("  No custom templates.");
    } else {
      console.log("  Custom templates:");
      for (const tDoc of templatesSnap.docs) {
        console.log(`    - ${tDoc.id} (size: ${tDoc.data().markdown ? tDoc.data().markdown.length : 0} chars)`);
      }
    }
  }
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
