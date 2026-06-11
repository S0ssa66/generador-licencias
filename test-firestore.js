const { initializeApp } = require('firebase/app');
const { getFirestore, collectionGroup, getDocs } = require('firebase/firestore');

const firebaseConfig = {
  apiKey: "...", // I need to get his firebase config from main.js
};
