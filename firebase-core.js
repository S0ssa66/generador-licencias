import { initializeApp } from 'firebase/app';
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
    sendEmailVerification,
    sendPasswordResetEmail,
    unlink,
    linkWithPopup
} from 'firebase/auth';

const firebaseConfig = {
    apiKey: 'AIzaSyDV2GaYmyXXF6cYACk--bQLbAJZhyrng6k',
    // Este dominio coincide con el redirect URI ya autorizado en el cliente
    // OAuth de Google. No cambiarlo a beatss.app sin registrar primero
    // https://beatss.app/__/auth/handler en ese cliente OAuth.
    authDomain: 'licencias-musicales.firebaseapp.com',
    projectId: 'licencias-musicales',
    storageBucket: 'licencias-musicales.firebasestorage.app',
    messagingSenderId: '301787407086',
    appId: '1:301787407086:web:387cb9764b53feb05909ff',
    measurementId: 'G-VB4EFVEKTD'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export {
    app,
    auth,
    googleProvider,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    sendEmailVerification,
    sendPasswordResetEmail,
    unlink,
    linkWithPopup
};
