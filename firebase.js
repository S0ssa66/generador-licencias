// Compatibilidad para los módulos del Studio. La landing y el modal de
// acceso importan `firebase-core.js` directamente para no descargar Firestore
// ni Storage antes de que exista una sesión o una vista que los necesite.
export * from './firebase-core.js';
export * from './firebase-data.js';
