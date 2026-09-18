import { auth, db, collection, query, limit, getDocs, doc, setDoc } from "./firebase.js";
import { SEED_LICENSES } from './config.js';

let autoBackupTimeout = null;

const showToast = (...args) => window.showToast(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const triggerReferralConversion = (...args) => window.triggerReferralConversion(...args);
const getGdriveToken = (...args) => window.getGdriveToken(...args);
const getOrCreateDriveFolder = (...args) => window.getOrCreateDriveFolder(...args);

// Registros de prueba eliminados por solicitud del propietario. Se filtran
// también del caché del navegador para que una sesión antigua no los vuelva a
// subir a Firestore durante la siguiente sincronización.
const REMOVED_TEST_LICENSE_REFS = new Set([
    'LIC-BAS-20260606-1363', 'LIC-BAS-20260606-1876',
    'LIC-BAS-20260607-8681', 'LIC-BAS-20260614-2265',
    'LIC-BAS-20260707-2543', 'LIC-BAS-20260707-6307',
    'LIC-EXCL-20260724-2801', 'LIC-PREM-20260723-4544',
    'LIC-PREM-20260724-1677', 'LIC-PREM-20260724-3757',
    'LIC-PREM-20260724-5395', 'LIC-PREM-20260724-7717',
    'LIC-PREM-20260724-8502', 'LIC-PREM-20260724-9115',
    'LIC-PREM-20260724-9761'
]);

function removeDeletedTestLicenses(list) {
    return list.filter(license => !REMOVED_TEST_LICENSE_REFS.has(license?.refCode));
}

// El ID del documento no siempre coincide con la referencia que se muestra al
// productor (por ejemplo, los registros creados por Checkout). Conservarlo en
// memoria evita que una actualización termine apuntando a una ruta inexistente.
function licenseFromFirestore(docSnap) {
    return { ...docSnap.data(), firestoreId: docSnap.id };
}

// `firestoreId` es metadato de la interfaz: no debe volver a escribirse dentro
// del documento ni exportarse como si fuera parte del contrato.
function licenseForFirestore(license) {
    const { firestoreId, ...storedLicense } = license || {};
    return storedLicense;
}

function licenseReference(license) {
    return String(license?.refCode || license?.reference || license?.contractReference || '').trim();
}

function preferLicenseRecord(current, candidate) {
    const currentArchived = current?.historyStatus === 'archived' || Boolean(current?.archivedAt);
    const candidateArchived = candidate?.historyStatus === 'archived' || Boolean(candidate?.archivedAt);
    if (currentArchived !== candidateArchived) return candidateArchived ? candidate : current;

    const currentUpdated = String(current?.updatedAt || current?.issuedAt || '');
    const candidateUpdated = String(candidate?.updatedAt || candidate?.issuedAt || '');
    if (candidateUpdated > currentUpdated) return candidate;
    return current?.firestoreId ? current : candidate;
}

// Helper wrapper to write items safely to localStorage
function safeSetItem(key, value) {
    try {
        localStorage.setItem(key, value);
        // Si es una clave de base de datos, gatillar auto-respaldos
        if ([`${window.currentUser}_producer_config`, `${window.currentUser}_license_history`, `${window.currentUser}_contacts`, `${window.currentUser}_beats`].includes(key)) {
            // Respaldar en Google Drive en segundo plano si hay sesión
            autoBackupGoogleDrive();
            // Guardar en el archivo físico de la Mac en segundo plano si estamos en localhost o somos productor admin
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const isProducer = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com', 'beatscgmonarco@gmail.com', 'mistermicua@gmail.com'].some(email => 
                auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === email
            );
            if (isLocal || isProducer) {
                saveToLocalServer();
            }
        }
    } catch (e) {
        console.warn('No se pudo guardar en localStorage (safeSetItem):', e);
    }
}
window.safeSetItem = safeSetItem;

// Obtener cabeceras con token de autenticación para peticiones al servidor local
export async function getLocalHeaders() {
    let token = window.localAuthToken;
    if (!token) {
        token = localStorage.getItem('local_auth_token');
    }
    if (!token) {
        try {
            // Siempre usar el origen actual. Así el mismo token funciona en
            // localhost y cuando el teléfono entra por la IP de la Mac.
            const localServerUrl = '/api/local-token';
            const res = await fetch(localServerUrl);
            if (res.ok) {
                const data = await res.json();
                token = data.token;
                if (token) {
                    window.localAuthToken = token;
                    localStorage.setItem('local_auth_token', token);
                }
            }
        } catch (e) {
            console.warn("No se pudo obtener el token local automáticamente:", e);
        }
    }
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
}
window.getLocalHeaders = getLocalHeaders;

// Guardar copia de seguridad en el archivo físico del servidor local (Mac)
export async function saveToLocalServer() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isProducer = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com', 'beatscgmonarco@gmail.com', 'mistermicua@gmail.com'].some(email => 
        auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === email
    );
    if (!isLocal && !isProducer) return;
    try {
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const backupData = {};
        const configVal = localStorage.getItem(`${window.currentUser}_producer_config`);
        const historyVal = localStorage.getItem(`${window.currentUser}_license_history`);
        const contactsVal = localStorage.getItem(`${window.currentUser}_contacts`);
        const beatsVal = localStorage.getItem(`${window.currentUser}_beats`);

        backupData[`${window.currentUser}_producer_config`] = configVal;
        backupData[`${window.currentUser}_license_history`] = historyVal;
        backupData[`${window.currentUser}_contacts`] = contactsVal;
        backupData[`${window.currentUser}_beats`] = beatsVal;

        // Also write legacy keys for backward-compatibility with other scripts
        backupData[`${legacyUser}_producer_config`] = configVal;
        backupData[`${legacyUser}_license_history`] = historyVal;
        backupData[`${legacyUser}_contacts`] = contactsVal;
        backupData[`${legacyUser}_beats`] = beatsVal;

        const localApiUrl = `/api/save-local?user=${encodeURIComponent(legacyUser)}`;
            
        const headers = await getLocalHeaders();
        const res = await fetch(localApiUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(backupData)
        });
        if (res.ok) {
            console.log(`💾 Archivo local ${legacyUser}_backup_sincronizado.json actualizado automáticamente.`);
        } else {
            console.warn('Error al guardar archivo local:', await res.text());
        }
    } catch (e) {
        console.warn('No se pudo guardar el archivo local en el servidor:', e);
    }
}
window.saveToLocalServer = saveToLocalServer;

// Cargar copia de seguridad desde el archivo físico del servidor local (Mac)
window._localServerLoaded = false;
export async function loadFromLocalServer() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isProducer = ['admin@sossamusic.com', 'masterjuego25@gmail.com', 'sossabeatz1@gmail.com', 'beatscgmonarco@gmail.com', 'mistermicua@gmail.com'].some(email => 
        auth.currentUser && auth.currentUser.email && auth.currentUser.email.toLowerCase() === email
    );
    if (!isLocal && !isProducer) return;
    try {
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const localApiUrl = `/api/load-local?user=${encodeURIComponent(legacyUser)}`;
            
        const headers = await getLocalHeaders();
        const res = await fetch(localApiUrl, { headers: headers });
        if (res.ok) {
            const backupData = await res.json();

            // Contar licencias y contactos
            let localCount = 0, diskCount = 0;
            let localContacts = 0, diskContacts = 0;
            try { localCount = JSON.parse(localStorage.getItem(`${window.currentUser}_license_history`) || '[]').length; } catch(e) {}
            
            const diskHistoryStr = backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]';
            try { diskCount = JSON.parse(diskHistoryStr).length; } catch(e) {}
            
            try { localContacts = JSON.parse(localStorage.getItem(`${window.currentUser}_contacts`) || '[]').length; } catch(e) {}
            
            const diskContactsStr = backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`] || '[]';
            try { diskContacts = JSON.parse(diskContactsStr).length; } catch(e) {}

            const localWeight = (localCount * 1000) + localContacts;
            const diskWeight = (diskCount * 1000) + diskContacts;

            // Siempre cargar del disco si tiene IGUAL O MÁS datos combinados que localStorage
            const shouldLoad = diskWeight >= localWeight;

            if (shouldLoad) {
                const setOrRemove = (key, val) => {
                    if (val === null || val === undefined || val === 'null') {
                        localStorage.removeItem(key);
                    } else {
                        localStorage.setItem(key, val);
                    }
                };
                setOrRemove(`${window.currentUser}_producer_config`, backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]);
                setOrRemove(`${window.currentUser}_license_history`, backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]);
                setOrRemove(`${window.currentUser}_contacts`, backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]);
                setOrRemove(`${window.currentUser}_beats`, backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]);

                window._localServerLoaded = true;
                console.log(`🔄 Archivo local cargado: peso ${diskWeight} (localStorage tenía ${localWeight})`);

                if (diskWeight !== localWeight) {
                    showToast(`🔄 Datos sincronizados desde archivo local (${diskCount} licencias, ${diskContacts} contactos)`, false);
                    await new Promise(resolve => setTimeout(resolve, 800));
                    window.location.reload();
                }
            } else {
                // localStorage tiene más datos → guardar al disco para mantener sincronía
                console.log(`💾 localStorage tiene más datos (${localWeight}) que disco (${diskWeight}). Actualizando disco...`);
                await saveToLocalServer();
                window._localServerLoaded = true;
            }
        }
    } catch (e) {
        console.warn('No se pudo cargar el archivo local desde el servidor:', e);
    }
}
window.loadFromLocalServer = loadFromLocalServer;

// Subir copia de seguridad completa a Google Drive (Nube)
export async function backupToGoogleDrive() {
    const btn = document.getElementById('btn-gdrive-backup');
    if (!btn) return;
    const originalText = btn.innerHTML;
    try {
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Subiendo...';
        btn.disabled = true;
        safeCreateIcons();

        const token = await getGdriveToken();
        const folderName = `${window.producerConfig.aka || 'Productor'} Licencias`;
        const backupFilename = `${window.currentUser}_backup_sincronizado.json`;
        const rootId = await getOrCreateDriveFolder(token, folderName);
        
        // Agrupar datos de localStorage
        const backupData = {};
        backupData[`${window.currentUser}_producer_config`] = localStorage.getItem(`${window.currentUser}_producer_config`);
        backupData[`${window.currentUser}_license_history`] = localStorage.getItem(`${window.currentUser}_license_history`);
        backupData[`${window.currentUser}_contacts`] = localStorage.getItem(`${window.currentUser}_contacts`);
        backupData[`${window.currentUser}_beats`] = localStorage.getItem(`${window.currentUser}_beats`);
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

        // Buscar si ya existe el archivo sincronizado
        const q = `name='${backupFilename}' and '${rootId}' in parents and trashed=false`;
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        if (existingFile) {
            // Actualizar contenido (PATCH)
            const uploadRes = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: blob
                }
            );
            if (!uploadRes.ok) throw new Error('Error al actualizar en Drive');
        } else {
            // Crear archivo (POST multipart)
            const metadata = { name: backupFilename, parents: [rootId] };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', blob, backupFilename);

            const uploadRes = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: form }
            );
            if (!uploadRes.ok) throw new Error('Error al crear copia en Drive');
        }

        showToast('☁️ Copia de seguridad guardada en Drive con éxito');
    } catch (err) {
        console.error('Error de sincronización:', err);
        showToast('Error al respaldar en Drive: ' + err.message, true);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        safeCreateIcons();
    }
}
window.backupToGoogleDrive = backupToGoogleDrive;

// Descargar copia de seguridad completa desde Google Drive (Nube)
export async function restoreFromGoogleDrive() {
    const btn = document.getElementById('btn-gdrive-restore');
    if (!btn) return;
    const originalText = btn.innerHTML;
    try {
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin" style="width:14px;height:14px;margin-right:4px;"></i> Descargando...';
        btn.disabled = true;
        safeCreateIcons();

        const token = await getGdriveToken();
        const folderName = `${window.producerConfig.aka || 'Productor'} Licencias`;
        const backupFilename = `${window.currentUser}_backup_sincronizado.json`;
        const rootId = await getOrCreateDriveFolder(token, folderName);
        
        // Buscar el archivo
        const q = `name='${backupFilename}' and '${rootId}' in parents and trashed=false`;
        const searchRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        const searchData = await searchRes.json();
        const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

        if (!existingFile) {
            throw new Error('No se encontró copia sincronizada en Drive. Créala primero en tu Mac.');
        }

        // Descargar (media layout)
        const downloadRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
            { headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (!downloadRes.ok) throw new Error('Error al descargar archivo');

        const backupData = await downloadRes.json();
        let legacyUser = 'sossa';
        if (auth.currentUser && auth.currentUser.email) {
            const email = auth.currentUser.email.toLowerCase();
            if (email === 'beatscgmonarco@gmail.com') {
                legacyUser = 'cgmonarco';
            } else if (email === 'mistermicua@gmail.com') {
                legacyUser = 'mrmicua';
            }
        }

        const configKey2 = `${window.currentUser}_producer_config`;
        const historyKey2 = `${window.currentUser}_license_history`;
        const contactsKey2 = `${window.currentUser}_contacts`;
        const beatsKey2 = `${window.currentUser}_beats`;
        if (backupData[configKey2] !== undefined || backupData[`${legacyUser}_producer_config`] !== undefined) {
            const pc2 = backupData[configKey2] || backupData[`${legacyUser}_producer_config`];
            const lh2 = backupData[historyKey2] || backupData[`${legacyUser}_license_history`];
            const ct2 = backupData[contactsKey2] || backupData[`${legacyUser}_contacts`];
            const bt2 = backupData[beatsKey2] || backupData[`${legacyUser}_beats`];
            if (pc2) safeSetItem(configKey2, pc2);
            if (lh2) safeSetItem(historyKey2, lh2);
            if (ct2) safeSetItem(contactsKey2, ct2);
            if (bt2) safeSetItem(beatsKey2, bt2);
            
            showToast('✅ ¡Datos descargados e importados! Recargando...', false);
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            throw new Error('El archivo descargado no es una copia de seguridad válida.');
        }
    } catch (err) {
        console.error('Error de descarga:', err);
        showToast('Error al restaurar desde Drive: ' + err.message, true);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
        safeCreateIcons();
    }
}
window.restoreFromGoogleDrive = restoreFromGoogleDrive;

// Auto-sincronizar de forma silenciosa en segundo plano si hay una sesión activa de Google
export async function autoSyncGoogleDrive() {
    const cachedToken = sessionStorage.getItem('gdrive_access_token');
    const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
    
    // Si hay un token válido de Google Drive que dure al menos 2 minutos más
    if (cachedToken && Date.now() < expiry - 120000) {
        console.log('☁️ Auto-sincronizando silenciosamente con Google Drive...');
        try {
            const folderNameSync = `${window.producerConfig.aka || 'Productor'} Licencias`;
            const backupFilenameSync = `${window.currentUser}_backup_sincronizado.json`;
            const rootId = await getOrCreateDriveFolder(cachedToken, folderNameSync);
            const q = `name='${backupFilenameSync}' and '${rootId}' in parents and trashed=false`;
            const searchRes = await fetch(
                `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
                { headers: { 'Authorization': `Bearer ${cachedToken}` } }
            );
            
            if (!searchRes.ok) return;
            const searchData = await searchRes.json();
            const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

            if (existingFile) {
                const downloadRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files/${existingFile.id}?alt=media`,
                    { headers: { 'Authorization': `Bearer ${cachedToken}` } }
                );
                if (downloadRes.ok) {
                    const backupData = await downloadRes.json();
                    let legacyUser = 'sossa';
                    if (auth.currentUser && auth.currentUser.email) {
                        const email = auth.currentUser.email.toLowerCase();
                        if (email === 'beatscgmonarco@gmail.com') {
                            legacyUser = 'cgmonarco';
                        } else if (email === 'mistermicua@gmail.com') {
                            legacyUser = 'mrmicua';
                        }
                    }

                    // ── PRIORIDAD: archivo local > Google Drive ─────────────────
                    // Contar licencias y contactos en cada fuente
                    let localCount = 0, driveCount = 0;
                    let localContacts = 0, driveContacts = 0;
                    try { localCount = JSON.parse(localStorage.getItem(`${window.currentUser}_license_history`) || '[]').length; } catch(e) {}
                    try { driveCount = JSON.parse(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`] || '[]').length; } catch(e) {}
                    try { localContacts = JSON.parse(localStorage.getItem(`${window.currentUser}_contacts`) || '[]').length; } catch(e) {}
                    try { driveContacts = JSON.parse(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`] || '[]').length; } catch(e) {}

                    const localWeight = (localCount * 1000) + localContacts;
                    const driveWeight = (driveCount * 1000) + driveContacts;

                    // Si el archivo local tiene MÁS datos combinados que Drive → actualizar Drive con los datos locales
                    if (localWeight > driveWeight) {
                        console.log(`☁️ Local (${localWeight}) > Drive (${driveWeight}): actualizando Google Drive con datos locales...`);
                        autoBackupGoogleDrive();
                        return;
                    } else if (localWeight === driveWeight) {
                        const norm = (v) => (v === null || v === undefined || v === 'null') ? '' : v;
                        if (norm(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]) !== norm(localStorage.getItem(`${window.currentUser}_license_history`)) ||
                            norm(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]) !== norm(localStorage.getItem(`${window.currentUser}_contacts`))) {
                             // Si hay igual peso pero diferentes datos, subimos los locales para asegurar que lo último editado quede guardado
                             console.log(`☁️ Pesos iguales pero datos diferentes. Forzando backup a Drive...`);
                             autoBackupGoogleDrive();
                        }
                        return;
                    }

                    // Solo si Drive tiene MAYOR PESO que local → restaurar desde Drive
                    console.log(`☁️ Drive (${driveWeight}) > Local (${localWeight}): restaurando desde Google Drive...`);
                    const norm = (v) => (v === null || v === undefined || v === 'null') ? '' : v;

                    let changed = false;
                    if (norm(backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]) !== norm(localStorage.getItem(`${window.currentUser}_producer_config`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]) !== norm(localStorage.getItem(`${window.currentUser}_license_history`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]) !== norm(localStorage.getItem(`${window.currentUser}_contacts`))) changed = true;
                    if (norm(backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]) !== norm(localStorage.getItem(`${window.currentUser}_beats`))) changed = true;
                    
                    if (changed) {
                        const setOrRemove = (key, val) => {
                            if (val === null || val === undefined || val === 'null') {
                                localStorage.removeItem(key);
                            } else {
                                safeSetItem(key, val);
                            }
                        };
                        
                        setOrRemove(`${window.currentUser}_producer_config`, backupData[`${window.currentUser}_producer_config`] || backupData[`${legacyUser}_producer_config`]);
                        setOrRemove(`${window.currentUser}_license_history`, backupData[`${window.currentUser}_license_history`] || backupData[`${legacyUser}_license_history`]);
                        setOrRemove(`${window.currentUser}_contacts`, backupData[`${window.currentUser}_contacts`] || backupData[`${legacyUser}_contacts`]);
                        setOrRemove(`${window.currentUser}_beats`, backupData[`${window.currentUser}_beats`] || backupData[`${legacyUser}_beats`]);
                        
                        showToast(`🔄 Datos actualizados desde Google Drive (${driveCount} licencias)`, false);
                        setTimeout(() => {
                            window.location.reload();
                        }, 1200);
                    }
                }
            } else {
                // No existe el archivo en Drive → subirlo ahora con los datos locales
                console.log('☁️ No existe backup en Drive. Creando backup inicial...');
                autoBackupGoogleDrive();
            }
        } catch (e) {
            console.warn('Auto-sync silencioso falló:', e);
        }
    }
}
window.autoSyncGoogleDrive = autoSyncGoogleDrive;

// Auto-respaldar de forma silenciosa en segundo plano en Google Drive si hay sesión activa (Debounced)
export async function autoBackupGoogleDrive() {
    if (autoBackupTimeout) clearTimeout(autoBackupTimeout);
    
    autoBackupTimeout = setTimeout(async () => {
        const cachedToken = sessionStorage.getItem('gdrive_access_token');
        const expiry = parseInt(sessionStorage.getItem('gdrive_token_expiry') || '0', 10);
        
        // Si hay un token válido de Google Drive que dure al menos 2 minutos más
        if (cachedToken && Date.now() < expiry - 120000) {
            console.log('☁️ Auto-guardando copia de seguridad en Google Drive (debounced)...');
            try {
                const folderNameAuto = `${window.producerConfig.aka || 'Productor'} Licencias`;
                const backupFilenameAuto = `${window.currentUser}_backup_sincronizado.json`;
                const rootId = await getOrCreateDriveFolder(cachedToken, folderNameAuto);
                
                // Agrupar datos de localStorage
                const backupData = {};
                backupData[`${window.currentUser}_producer_config`] = localStorage.getItem(`${window.currentUser}_producer_config`);
                backupData[`${window.currentUser}_license_history`] = localStorage.getItem(`${window.currentUser}_license_history`);
                backupData[`${window.currentUser}_contacts`] = localStorage.getItem(`${window.currentUser}_contacts`);
                backupData[`${window.currentUser}_beats`] = localStorage.getItem(`${window.currentUser}_beats`);
                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });

                // Buscar si ya existe el archivo sincronizado
                const q = `name='${backupFilenameAuto}' and '${rootId}' in parents and trashed=false`;
                const searchRes = await fetch(
                    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`,
                    { headers: { 'Authorization': `Bearer ${cachedToken}` } }
                );
                
                if (!searchRes.ok) return;
                const searchData = await searchRes.json();
                const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

                if (existingFile) {
                    // Actualizar contenido (PATCH)
                    await fetch(
                        `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`,
                        {
                            method: 'PATCH',
                            headers: { 'Authorization': `Bearer ${cachedToken}`, 'Content-Type': 'application/json' },
                            body: blob
                        }
                    );
                } else {
                    // Crear archivo (POST multipart)
                    const metadata = { name: backupFilenameAuto, parents: [rootId] };
                    const form = new FormData();
                    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
                    form.append('file', blob, backupFilenameAuto);

                    await fetch(
                        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                        { method: 'POST', headers: { 'Authorization': `Bearer ${cachedToken}` }, body: form }
                    );
                }
                console.log('☁️ Auto-respaldo en Google Drive completado con éxito (debounced).');
            } catch (err) {
                console.warn('Auto-respaldo silencioso en Drive falló:', err);
            }
        }
    }, 2000);
}
window.autoBackupGoogleDrive = autoBackupGoogleDrive;

// Cargar historial de Firestore (con fallback a localStorage) e inyectar siempre las licencias semilla para Sossa Admin
export async function loadHistory() {
    let savedList = [];
    let firestoreLoaded = false;
    let firestoreError = null;
    const statusEl = document.getElementById('history-load-status');
    if (statusEl) {
        statusEl.hidden = false;
        statusEl.dataset.state = 'loading';
        statusEl.textContent = 'Cargando tus licencias…';
    }
    if (window.currentUser) {
        try {
            const colRef = collection(db, "users", window.currentUser, "licencias");
            // No ordenar en Firestore: documentos históricos sin `date`
            // también deben aparecer. La lista completa se ordena abajo con
            // los campos disponibles de cada licencia.
            const q = query(colRef, limit(300));
            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((docSnap) => {
                savedList.push(licenseFromFirestore(docSnap));
            });
            firestoreLoaded = true;
        } catch (err) {
            firestoreError = err;
            console.error("Error al cargar historial de Firestore:", err);
        }
    }

    // Cargar de localStorage para fusionar
    let localList = [];
    const saved = localStorage.getItem(`${window.currentUser}_license_history`);
    if (saved) {
        try {
            localList = JSON.parse(saved);
            if (!Array.isArray(localList)) localList = [];
        } catch (e) {
            localList = [];
        }
    }

    // Fusionar listas por la referencia canónica. Si existe una copia antigua
    // activa y otra archivada, gana siempre la archivada para que una sesión
    // anterior no reactive una baja auditable.
    savedList = removeDeletedTestLicenses(savedList);
    const localBeforeCleanup = localList.length;
    localList = removeDeletedTestLicenses(localList);
    const removedStaleLocalTests = localBeforeCleanup !== localList.length;
    if (removedStaleLocalTests) {
        safeSetItem(`${window.currentUser}_license_history`, JSON.stringify(localList));
    }

    const mergedByReference = new Map();
    savedList.forEach((license) => {
        const reference = licenseReference(license);
        if (!reference) return;
        const current = mergedByReference.get(reference);
        mergedByReference.set(reference, current ? preferLicenseRecord(current, license) : license);
    });
    let needsSaveToFirestore = false;
    
    localList.forEach(localLic => {
        const reference = licenseReference(localLic);
        if (reference) {
            const existing = mergedByReference.get(reference);
            if (!existing) {
                mergedByReference.set(reference, localLic);
                needsSaveToFirestore = true;
            } else {
                mergedByReference.set(reference, preferLicenseRecord(existing, localLic));
            }
        }
    });

    let mergedList = [...mergedByReference.values()];

    // Ordenar por fecha descendente
    mergedList.sort((a, b) => {
        const dateA = a.date || "";
        const dateB = b.date || "";
        return dateB.localeCompare(dateA);
    });

    window.licenseHistory = mergedList;

    // Manejo de licencias semilla (solo para sossa admin)
    let changed = false;
    if (window.currentUserIsAdmin) {
        SEED_LICENSES.forEach(seed => {
            if (!window.licenseHistory.some(l => l.refCode === seed.refCode)) {
                window.licenseHistory.push(seed);
                changed = true;
            }
        });
    } else {
        // Limpiar si se inyectaron por error en otra cuenta previamente
        const originalLength = window.licenseHistory.length;
        const seedCodes = SEED_LICENSES.map(s => s.refCode);
        window.licenseHistory = window.licenseHistory.filter(l => !seedCodes.includes(l.refCode));
        if (window.licenseHistory.length !== originalLength) changed = true;
    }
    
    if (changed || needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_license_history`, JSON.stringify(window.licenseHistory));
        if (firestoreLoaded) {
            console.log("Subiendo licencias locales combinadas a Firestore...");
            for (const lic of window.licenseHistory) {
                if (!lic.refCode) continue;
                try {
                    const licDocRef = doc(db, "users", window.currentUser, "licencias", lic.firestoreId || lic.refCode);
                    await setDoc(licDocRef, licenseForFirestore(lic));
                } catch (err) {
                    console.error("Error al guardar licencia en Firestore:", err);
                }
            }
        }
    }

    // El renderizador vive en el módulo visual del historial y puede cargarse
    // de forma diferida. Esperarlo evita que la carga termine con contador 0
    // durante el primer frame aunque los datos ya estén en memoria.
    await updateHistoryTable();
    if (statusEl) {
        if (firestoreError && window.licenseHistory.length === 0) {
            statusEl.hidden = false;
            statusEl.dataset.state = 'error';
            statusEl.textContent = 'No se pudo consultar el historial en la nube. Revisa tu sesión y pulsa Recargar.';
        } else {
            statusEl.hidden = true;
            statusEl.dataset.state = 'ready';
            statusEl.textContent = '';
        }
    }
}
window.loadHistory = loadHistory;

// Guardar historial en Firestore y localStorage
export async function saveHistory() {
    safeSetItem(`${window.currentUser}_license_history`, JSON.stringify(window.licenseHistory));
    
    // Si el historial no está vacío, intentar convertir el referido de este usuario
    if (window.licenseHistory.length > 0) {
        triggerReferralConversion();
    }
    
    if (!window.currentUserIsPro) {
        await updateHistoryTable();
        return;
    }
    
    // Guardar cada documento en Firestore de forma asíncrona
    for (const lic of window.licenseHistory) {
        if (!lic.refCode) continue;
        try {
            const licDocRef = doc(db, "users", window.currentUser, "licencias", lic.firestoreId || lic.refCode);
            await setDoc(licDocRef, licenseForFirestore(lic));
        } catch (err) {
            console.error("Error al guardar licencia en Firestore:", err);
        }
    }
    await updateHistoryTable();
}
window.saveHistory = saveHistory;
