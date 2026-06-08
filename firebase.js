import { initializeApp } from "firebase/app";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged 
} from "firebase/auth";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    getDocs, 
    query, 
    where, 
    orderBy,
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDV2GaYmyXXF6cYACk--bQLbAJZhyrng6k",
  authDomain: "licencias-musicales.firebaseapp.com",
  projectId: "licencias-musicales",
  storageBucket: "licencias-musicales.firebasestorage.app",
  messagingSenderId: "301787407086",
  appId: "1:301787407086:web:387cb9764b53feb05909ff",
  measurementId: "G-VB4EFVEKTD"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

export { 
    auth, 
    db, 
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc
};
