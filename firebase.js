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
    onAuthStateChanged,
    unlink,
    linkWithPopup
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
    limit,
    startAfter,
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc,
    onSnapshot
} from "firebase/firestore";
import {
    getStorage,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
} from "firebase/storage";

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
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

export { 
    auth, 
    db, 
    storage,
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    unlink,
    linkWithPopup,
    doc,
    setDoc,
    getDoc,
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    collectionGroup,
    deleteDoc,
    addDoc,
    updateDoc,
    onSnapshot,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
};
