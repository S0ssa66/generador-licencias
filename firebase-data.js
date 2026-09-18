import { getFirestore, doc, setDoc, getDoc, collection, getDocs, query, where, orderBy, limit, startAfter, collectionGroup, deleteDoc, deleteField, addDoc, updateDoc, onSnapshot, writeBatch } from 'firebase/firestore';
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import { app } from './firebase-core.js';

const db = getFirestore(app);
const storage = getStorage(app);

export {
    db,
    storage,
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
    deleteField,
    writeBatch,
    addDoc,
    updateDoc,
    onSnapshot,
    ref,
    uploadBytesResumable,
    getDownloadURL,
    deleteObject
};
