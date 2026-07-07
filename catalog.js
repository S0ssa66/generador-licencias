import { 
    auth,
    db,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    deleteDoc,
    addDoc,
    collectionGroup,
    query,
    where,
    orderBy,
    limit,
    startAfter,
    storage,
    ref,
    uploadBytesResumable,
    getDownloadURL
} from "./firebase.js";

const sanitizeHtml = window.sanitizeHtml || function(str) {
    return str == null ? '' : String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
};

// Initialize global states on window
window.localBeats = window.localBeats || [];
window.globalBeats = window.globalBeats || [];
window.filteredGlobalBeats = window.filteredGlobalBeats || [];
window.globalProducersConfig = window.globalProducersConfig || {};
window.lastGlobalBeatDoc = window.lastGlobalBeatDoc || null;
window.isGlobalCatalogMode = window.stateManager.getState('isGlobalCatalogMode');

// Variables para el control de subidas de archivos
let activeUploadTarget = null;
let activeUploadButton = null;

// ============================================================
// BASE DE DATOS LOCAL DE BEATS
// ============================================================

export async function initBeatsDB() {
    // Eventos de la UI
    if (!window._beatsDBEventsConfigured) {
        document.getElementById('btn-beats-modal')?.addEventListener('click', openBeatsModal);
        document.getElementById('close-beats-modal')?.addEventListener('click', closeBeatsModal);
        document.getElementById('btn-add-beat')?.addEventListener('click', openBeatForm);
        document.getElementById('btn-cancel-beat')?.addEventListener('click', closeBeatForm);
        document.getElementById('btn-save-beat')?.addEventListener('click', saveBeat);
        document.getElementById('search-beats')?.addEventListener('input', renderBeatsList);
        
        // Eventos del Catálogo de la pestaña principal
        document.getElementById('tab-btn-add-beat')?.addEventListener('click', () => openTabBeatForm());
        document.getElementById('tab-btn-close-form')?.addEventListener('click', closeTabBeatForm);
        document.getElementById('tab-btn-cancel-beat')?.addEventListener('click', closeTabBeatForm);
        document.getElementById('tab-btn-save-beat')?.addEventListener('click', saveTabBeat);
        document.getElementById('tab-search-beats')?.addEventListener('input', renderBeatsGrid);
        document.getElementById('tab-filter-genre')?.addEventListener('change', renderBeatsGrid);
        document.getElementById('tab-filter-key')?.addEventListener('change', renderBeatsGrid);
        
        initFileUploads();
        window._beatsDBEventsConfigured = true;
    }

    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUser) {
        try {
            const colRef = collection(db, "users", window.currentUser, "beats");
            const querySnapshot = await getDocs(colRef);
            for (const docSnap of querySnapshot.docs) {
                const beatData = docSnap.data();
                beatData.id = docSnap.id;
                try {
                    const privateDocRef = doc(db, "users", window.currentUser, "beats", docSnap.id, "private", "files");
                    const privateSnap = await getDoc(privateDocRef);
                    if (privateSnap.exists()) {
                        const privateData = privateSnap.data();
                        beatData.wav = privateData.wav || "";
                        beatData.stems = privateData.stems || "";
                    }
                } catch (privateErr) {
                    console.warn(`No se pudieron cargar enlaces privados para el beat ${docSnap.id}:`, privateErr.message);
                }
                savedList.push(beatData);
            }
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar beats de Firestore:", err);
        }
    }

    // Cargar de localStorage para fusionar
    let localList = [];
    try {
        const stored = localStorage.getItem(`${window.currentUser}_beats`);
        if (stored) {
            localList = JSON.parse(stored);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    // Fusionar listas usando id como clave única
    let mergedList = [...savedList];
    let needsSaveToFirestore = false;

    localList.forEach(localBeat => {
        if (localBeat && localBeat.id) {
            const exists = mergedList.some(b => b.id === localBeat.id);
            if (!exists) {
                mergedList.push(localBeat);
                needsSaveToFirestore = true;
            }
        }
    });

    window.localBeats = mergedList;

    if (needsSaveToFirestore) {
        if (typeof window.safeSetItem === 'function') {
            window.safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
        }
        if (firestoreLoaded) {
            console.log("Subiendo beats locales combinados a Firestore...");
            let count = 0;
            for (const beat of window.localBeats) {
                if (!beat.id) continue;
                if (!window.currentUserIsPro && count >= 10) {
                    break;
                }
                try {
                    await saveBeatToFirestore(beat);
                    count++;
                } catch (err) {
                    console.error("Error al guardar beat en Firestore:", err);
                }
            }
        }
    }
}

export function openBeatsModal() {
    document.getElementById('modal-beats').style.display = 'flex';
    document.getElementById('search-beats').value = '';
    closeBeatForm();
    renderBeatsList();
}

export function closeBeatsModal() {
    document.getElementById('modal-beats').style.display = 'none';
}

export function openBeatForm(editId = null) {
    document.getElementById('beat-form-container').style.display = 'block';
    
    if (editId) {
        const beat = window.localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('beat-form-title').innerText = 'Editar Beat';
            document.getElementById('edit-beat-id').value = beat.id;
            document.getElementById('db-beat-name').value = beat.name;
            document.getElementById('db-beat-mp3').value = beat.mp3 || '';
            document.getElementById('db-beat-wav').value = beat.wav || '';
            document.getElementById('db-beat-stems').value = beat.stems || '';
            document.getElementById('db-beat-artwork').value = beat.artwork || '';
            document.getElementById('db-beat-bpm').value = beat.bpm || '';
            document.getElementById('db-beat-key').value = beat.key || '';
            document.getElementById('db-beat-genre').value = beat.genre || '';
            document.getElementById('db-beat-tags').value = beat.tags || '';
        }
    } else {
        document.getElementById('beat-form-title').innerText = 'Agregar Nuevo Beat';
        document.getElementById('edit-beat-id').value = '';
        document.getElementById('db-beat-name').value = '';
        document.getElementById('db-beat-mp3').value = '';
        document.getElementById('db-beat-wav').value = '';
        document.getElementById('db-beat-stems').value = '';
        document.getElementById('db-beat-artwork').value = '';
        document.getElementById('db-beat-bpm').value = '';
        document.getElementById('db-beat-key').value = '';
        document.getElementById('db-beat-genre').value = '';
        document.getElementById('db-beat-tags').value = '';
    }
    updateClearButtonsVisibility();
}

export function closeBeatForm() {
    document.getElementById('beat-form-container').style.display = 'none';
}

export async function saveBeatToFirestore(beat) {
    const beatId = beat.id;
    const publicData = { ...beat };
    const wav = publicData.wav || "";
    const stems = publicData.stems || "";
    
    publicData.wav = "";
    publicData.stems = "";
    
    const beatDocRef = doc(db, "users", window.currentUser, "beats", beatId);
    await setDoc(beatDocRef, publicData);
    
    const privateDocRef = doc(db, "users", window.currentUser, "beats", beatId, "private", "files");
    await setDoc(privateDocRef, { wav, stems });
}

export async function saveBeat() {
    const id = document.getElementById('edit-beat-id').value;
    const name = document.getElementById('db-beat-name').value.trim();
    const mp3 = document.getElementById('db-beat-mp3').value.trim();
    const wav = document.getElementById('db-beat-wav').value.trim();
    const stems = document.getElementById('db-beat-stems').value.trim();
    const artwork = document.getElementById('db-beat-artwork').value.trim();
    const bpm = document.getElementById('db-beat-bpm').value ? parseInt(document.getElementById('db-beat-bpm').value, 10) : null;
    const key = document.getElementById('db-beat-key').value.trim();
    const genre = document.getElementById('db-beat-genre').value.trim();
    const tags = document.getElementById('db-beat-tags').value.trim();

    if (!name) {
        if (typeof window.showToast === 'function') window.showToast('El nombre del beat es obligatorio', true);
        return;
    }

    const isNew = !id;
    if (isNew && !window.currentUserIsPro && window.localBeats.length >= 10) {
        if (typeof window.openPaymentModal === 'function') {
            window.openPaymentModal(`Límite alcanzado: El Plan Inicial solo permite subir hasta 10 beats. Mejora al Plan Pro hoy para subir beats ilimitados.`);
        }
        return;
    }

    const beatId = id || 'beat_' + Date.now();
    const beatData = {
        id: beatId,
        name,
        mp3,
        wav,
        stems,
        artwork,
        bpm,
        key,
        genre,
        tags,
        updatedAt: Date.now()
    };

    if (id) {
        const index = window.localBeats.findIndex(b => b.id === id);
        if (index !== -1) window.localBeats[index] = beatData;
    } else {
        window.localBeats.push(beatData);
    }

    try {
        if (typeof window.safeSetItem === 'function') {
            window.safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
        }
        
        await saveBeatToFirestore(beatData);
        
        if (typeof window.showToast === 'function') window.showToast(id ? 'Beat actualizado' : 'Nuevo beat guardado');
        closeBeatForm();
        renderBeatsList();
        if (document.getElementById('tab-beats-grid')) {
            renderBeatsGrid();
            updateGenreAndKeyFilters();
        }
    } catch (e) {
        console.error('Error saving beat:', e);
        if (typeof window.showToast === 'function') window.showToast('Error al guardar el beat en la base de datos', true);
    }
}

export async function deleteBeat(id) {
    if (confirm('¿Estás seguro de que deseas eliminar este beat?')) {
        window.localBeats = window.localBeats.filter(b => String(b.id) !== String(id));
        try {
            if (typeof window.safeSetItem === 'function') {
                window.safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
            }
            
            const beatDocRef = doc(db, "users", window.currentUser, "beats", id);
            await deleteDoc(beatDocRef);
            
            try {
                const privateDocRef = doc(db, "users", window.currentUser, "beats", id, "private", "files");
                await deleteDoc(privateDocRef);
            } catch (e) {
                console.warn("No se pudo eliminar el archivo privado del beat:", e.message);
            }
            
            renderBeatsList();
            if (document.getElementById('tab-beats-grid')) {
                renderBeatsGrid();
                updateGenreAndKeyFilters();
            }
            if (typeof window.showToast === 'function') window.showToast('Beat eliminado correctamente');
        } catch (e) {
            console.error('Error deleting beat:', e);
            if (typeof window.showToast === 'function') window.showToast('Error al eliminar el beat de la base de datos', true);
        }
    }
}

export function selectBeat(id) {
    const beat = window.localBeats.find(b => String(b.id) === String(id));
    if (!beat) return;

    document.getElementById('beat-name').value = beat.name;
    document.getElementById('audio-link-mp3').value = beat.mp3 || '';
    document.getElementById('audio-link-wav').value = beat.wav || '';
    document.getElementById('audio-link-stems').value = beat.stems || '';

    if (document.getElementById('beat-bpm')) {
        document.getElementById('beat-bpm').value = beat.bpm || '';
    }
    if (document.getElementById('beat-key')) {
        document.getElementById('beat-key').value = beat.key || '';
    }

    closeBeatsModal();
    if (typeof window.generatePreview === 'function') {
        window.generatePreview();
    }
    if (typeof window.showToast === 'function') window.showToast(`Beat "${beat.name}" cargado en el contrato.`);
}

export function renderBeatsList() {
    const listContainer = document.getElementById('beats-list');
    const searchQuery = document.getElementById('search-beats').value.toLowerCase().trim();
    
    let filtered = window.localBeats;
    if (searchQuery) {
        filtered = window.localBeats.filter(b => b.name.toLowerCase().includes(searchQuery));
    }

    filtered.sort((a, b) => a.name.localeCompare(b.name));

    if (filtered.length === 0) {
        listContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #8a91a6; font-size: 13px; background: #1a1d24; border-radius: 8px;">No se encontraron beats. Clic en 'Nuevo Beat' para agregar.</div>`;
        return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(beat => {
        const item = document.createElement('div');
        item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #1a1d24; border: 1px solid #2a2e39; border-radius: 8px; transition: all 0.2s;';
        
        let linksCount = 0;
        if (beat.mp3) linksCount++;
        if (beat.wav) linksCount++;
        if (beat.stems) linksCount++;

        const linksBadge = linksCount > 0 
            ? `<span style="font-size: 10px; background: #2a2e39; color: #a0aec0; padding: 2px 6px; border-radius: 4px; margin-left: 8px;"><i data-lucide="link" style="width:10px;height:10px;display:inline-block;margin-right:3px;"></i>${linksCount}</span>` 
            : '';

        const finalArtworkUrl = typeof window.getBeatArtwork === 'function' ? window.getBeatArtwork(beat) : '';
        const artworkImg = finalArtworkUrl
            ? `<img src="${finalArtworkUrl}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">`
            : `<i data-lucide="music" style="width: 18px; height: 18px; color: #a0aec0;"></i>`;

        let detailsText = '';
        if (beat.bpm) detailsText += `${beat.bpm} BPM`;
        if (beat.key) {
            if (detailsText) detailsText += ' • ';
            detailsText += beat.key;
        }
        if (beat.genre) {
            if (detailsText) detailsText += ' • ';
            detailsText += beat.genre;
        }
        const detailsHtml = detailsText 
            ? `<div style="font-size: 11px; color: #8a91a6; margin-top: 2px;">${detailsText}</div>`
            : '';

        item.innerHTML = `
            <div style="flex: 1; cursor: pointer; display: flex; align-items: center;" onclick="window.selectBeat('${beat.id}')">
                <div style="width: 44px; height: 44px; border-radius: 6px; background: #2a2e39; display: flex; align-items: center; justify-content: center; margin-right: 12px; flex-shrink: 0; overflow: hidden;">
                    ${artworkImg}
                </div>
                <div>
                    <div style="font-weight: 500; font-size: 14px; color: #fff; display: flex; align-items: center;">${sanitizeHtml(beat.name)} ${linksBadge}</div>
                    ${detailsHtml}
                </div>
            </div>
            <div style="display: flex; gap: 5px; margin-left: 10px;">
                <button class="btn btn-secondary" title="Seleccionar para el contrato" onclick="window.selectBeat('${beat.id}')" style="padding: 6px 12px; background: var(--bs-blue-60); border-color: var(--bs-blue-60); color: #fff; font-size: 12px; height: 32px;">Usar</button>
                <button class="btn btn-secondary" title="Editar" onclick="window.openBeatForm('${beat.id}')" style="padding: 6px 10px; height: 32px;"><i data-lucide="edit-2" style="width: 14px; height: 14px;"></i></button>
                <button class="btn btn-secondary" title="Eliminar" onclick="window.deleteBeat('${beat.id}')" style="padding: 6px 10px; height: 32px; color: var(--bs-red-50);"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
            </div>
        `;
        listContainer.appendChild(item);
    });

    if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
}

async function uploadToCentralDrive(file, config, onProgress) {
    const idToken = await auth.currentUser.getIdToken();
    const sessionRes = await fetch('/api/gdrive-upload-session', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
            fileName: file.name,
            subFolder: 'Beats',
            contentType: file.type,
            producerAka: config.aka || config.name
        })
    });
    
    if (!sessionRes.ok) {
        let errMsg = 'No se pudo iniciar la sesión de subida en Google Drive Central.';
        try {
            const sessionErr = await sessionRes.json();
            errMsg = sessionErr.error || errMsg;
        } catch (e) {
            try {
                errMsg = await sessionRes.text();
            } catch (textErr) {}
        }
        throw new Error(`HTTP ${sessionRes.status}: ${errMsg}`);
    }
    
    const sessionData = await sessionRes.json();
    const uploadUrl = sessionData.uploadUrl;
    
    const resJson = await uploadFileToResumableSessionWithProgress(file, uploadUrl, onProgress);
    return `${window.location.origin}/api/proxy-audio?id=${resJson.id}`;
}

async function uploadToPersonalDrive(file, config, onProgress) {
    let token;
    if (typeof window.getGdriveToken === 'function') {
        token = await window.getGdriveToken();
    } else {
        throw new Error("Google Drive Token Helper personal no disponible.");
    }
    
    const folderName = `${config.aka || config.name || 'BEATSS'} Licencias`;
    if (typeof window.getOrCreateDriveFolder !== 'function') {
        throw new Error("Google Drive Folder Helper no disponible.");
    }
    const rootId = await window.getOrCreateDriveFolder(token, folderName);
    const beatsFolderId = await window.getOrCreateDriveFolder(token, 'Beats', rootId);

    return await uploadFileToDriveWithProgress(file, token, beatsFolderId, onProgress);
}

export function initFileUploads() {
    const fileUploader = document.getElementById('shared-file-uploader');
    if (!fileUploader) return;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-upload-file');
        if (!btn) return;

        e.preventDefault();
        
        activeUploadTarget = btn.getAttribute('data-target');
        activeUploadButton = btn;
        
        const accept = btn.getAttribute('data-accept') || '*/*';
        fileUploader.setAttribute('accept', accept);
        fileUploader.value = '';
        fileUploader.click();
    });

    fileUploader.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !activeUploadTarget || !activeUploadButton) return;

        const originalBtnHTML = activeUploadButton.innerHTML;
        
        activeUploadButton.disabled = true;
        activeUploadButton.style.opacity = '0.7';
        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando...`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const config = window.producerConfig || {};
            let storageProvider = config.storageProvider || 'gdrive-central';
            
            // Si eligió Drive personal pero no configuró las credenciales, usar el central
            if (storageProvider === 'gdrive' && !config.gdriveClientId) {
                storageProvider = 'gdrive-central';
            }

            if (storageProvider === 'alternative') {
                throw new Error("Preferencia de almacenamiento establecida a servidores alternativos.");
            }

            // Si el proveedor preferido es Firebase Storage (firebase),
            // subimos de forma nativa a Firebase Storage para evitar exponer tokens al cliente.
            if (storageProvider === 'firebase') {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Firebase...`;
                if (window.lucide) window.lucide.createIcons();
                
                const storagePath = `beats/${window.currentUser || 'anonymous'}/${Date.now()}_${file.name}`;
                const storageRef = ref(storage, storagePath);
                const uploadTask = uploadBytesResumable(storageRef, file);
                
                const downloadURL = await new Promise((resolve, reject) => {
                    uploadTask.on('state_changed', 
                        (snapshot) => {
                            const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${progress}%`;
                            if (window.lucide) window.lucide.createIcons();
                        }, 
                        (error) => reject(error), 
                        async () => {
                            try {
                                const url = await getDownloadURL(uploadTask.snapshot.ref);
                                resolve(url);
                            } catch (e) {
                                reject(e);
                            }
                        }
                    );
                });

                const targetInput = document.getElementById(activeUploadTarget);
                if (targetInput) {
                    targetInput.value = downloadURL;
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    
                    if (typeof window.generatePreview === 'function') {
                        window.generatePreview();
                    }
                }
                
                if (typeof window.showToast === 'function') window.showToast("¡Archivo guardado en Firebase Storage con éxito!");
                
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: #48bb78;"></i> ¡Subido!`;
                if (window.lucide) window.lucide.createIcons();
                
                const btnRef = activeUploadButton;
                setTimeout(() => {
                    if (btnRef.innerHTML.includes('check')) {
                        btnRef.innerHTML = originalBtnHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }
                }, 3000);
                return;
            }
            
            let downloadURL;
            let uploadSuccess = false;
            let detailedError = "";

            if (storageProvider === 'gdrive-central') {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Central...`;
                if (window.lucide) window.lucide.createIcons();

                try {
                    downloadURL = await uploadToCentralDrive(file, config, (progress) => {
                        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${progress}%`;
                        if (window.lucide) window.lucide.createIcons();
                    });
                    uploadSuccess = true;
                } catch (driveErr) {
                    detailedError = driveErr.message;
                    console.warn("Fallo al subir a Google Drive Central, intentando fallback a servidores alternativos...", driveErr);
                }
            } else {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Drive...`;
                if (window.lucide) window.lucide.createIcons();

                try {
                    downloadURL = await uploadToPersonalDrive(file, config, (progress) => {
                        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${progress}%`;
                        if (window.lucide) window.lucide.createIcons();
                    });
                    uploadSuccess = true;
                } catch (driveErr) {
                    detailedError = driveErr.message;
                    console.warn("Fallo al subir a Google Drive Personal, intentando fallback a Google Drive Central...", driveErr);
                    try {
                        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Central (Fallback)...`;
                        if (window.lucide) window.lucide.createIcons();
                        
                        downloadURL = await uploadToCentralDrive(file, config, (progress) => {
                            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo a Central... ${progress}%`;
                            if (window.lucide) window.lucide.createIcons();
                        });
                        uploadSuccess = true;
                    } catch (centralErr) {
                        detailedError += " | Fallback: " + centralErr.message;
                        console.error("Fallo también en la subida a Google Drive Central (Fallback):", centralErr);
                    }
                }
            }

            if (!uploadSuccess) {
                throw new Error("No se pudo subir a Google Drive: " + detailedError);
            }

            const targetInput = document.getElementById(activeUploadTarget);
            if (targetInput) {
                targetInput.value = downloadURL;
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (typeof window.generatePreview === 'function') {
                    window.generatePreview();
                }
            }
            
            if (typeof window.showToast === 'function') window.showToast("¡Archivo guardado en Google Drive con éxito!");
            
            activeUploadButton.disabled = false;
            activeUploadButton.style.opacity = '1';
            activeUploadButton.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: #48bb78;"></i> ¡Subido!`;
            if (window.lucide) window.lucide.createIcons();
            
            const btnRef = activeUploadButton;
            setTimeout(() => {
                if (btnRef.innerHTML.includes('check')) {
                    btnRef.innerHTML = originalBtnHTML;
                    if (window.lucide) window.lucide.createIcons();
                }
            }, 3000);

        } catch (finalErr) {
            console.error("Fallo general de subida a Drive:", finalErr);
            if (typeof window.showToast === 'function') {
                window.showToast("Drive Error: " + finalErr.message, true);
                setTimeout(() => {
                    window.showToast("Usando servidores alternativos de respaldo...", false);
                }, 4000);
            }
            
            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo...`;
            if (window.lucide) window.lucide.createIcons();

            try {
                const downloadURL = await uploadAudioToAlternativeCloud(file);
                
                const targetInput = document.getElementById(activeUploadTarget);
                if (targetInput) {
                    targetInput.value = downloadURL;
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof window.generatePreview === 'function') {
                        window.generatePreview();
                    }
                }
                
                if (typeof window.showToast === 'function') window.showToast("¡Archivo guardado en servidor alternativo!");
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = `<i data-lucide="check" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px; color: #48bb78;"></i> ¡Subido!`;
                if (window.lucide) window.lucide.createIcons();
                
                const btnRef = activeUploadButton;
                setTimeout(() => {
                    if (btnRef.innerHTML.includes('check')) {
                        btnRef.innerHTML = originalBtnHTML;
                        if (window.lucide) window.lucide.createIcons();
                    }
                }, 3000);
            } catch (altErr) {
                console.error("Error al subir a servidores alternativos:", altErr);
                if (typeof window.showToast === 'function') window.showToast("Error al subir el archivo.", true);
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = originalBtnHTML;
                if (window.lucide) window.lucide.createIcons();
            }
        }
    });
}

export function initClearInputHandlers() {
    document.querySelectorAll('.btn-clear-input').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            if (input) {
                input.value = '';
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
            }
            btn.style.display = 'none';
        });
    });

    const targets = [
        'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
        'audio-link-mp3', 'audio-link-wav', 'audio-link-stems'
    ];
    targets.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            const btn = document.querySelector(`.btn-clear-input[data-target="${id}"]`);
            if (btn) {
                const checkVisibility = () => {
                    if (input.value.trim() !== '') {
                        btn.style.display = 'flex';
                    } else {
                        btn.style.display = 'none';
                    }
                };
                input.addEventListener('input', checkVisibility);
                input.addEventListener('change', checkVisibility);
            }
        }
    });
    
    updateClearButtonsVisibility();
}

export function updateClearButtonsVisibility() {
    const targets = [
        'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
        'audio-link-mp3', 'audio-link-wav', 'audio-link-stems'
    ];
    targets.forEach(id => {
        const input = document.getElementById(id);
        const btn = document.querySelector(`.btn-clear-input[data-target="${id}"]`);
        if (input && btn) {
            if (input.value.trim() !== '') {
                btn.style.display = 'flex';
            } else {
                btn.style.display = 'none';
            }
        }
    });
}

export async function uploadFileToResumableSessionWithProgress(file, uploadUrl, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                if (onProgress) onProgress(percent);
            }
        });

        xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        const resJson = JSON.parse(xhr.responseText);
                        resolve(resJson);
                    } catch (err) {
                        reject(new Error("Error parseando respuesta de Google Drive: " + err.message));
                    }
                } else {
                    reject(new Error(`Error de subida a Google Drive (HTTP ${xhr.status}): ${xhr.responseText}`));
                }
            }
        };

        xhr.send(file);
    });
}
window.uploadFileToResumableSessionWithProgress = uploadFileToResumableSessionWithProgress;

export async function uploadFileToDriveWithProgress(file, token, folderId, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name');
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);

        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: file.name,
            parents: [folderId]
        };

        const reader = new FileReader();
        reader.onload = function(e) {
            const fileData = e.target.result;
            const contentType = file.type || 'application/octet-stream';
            
            const metadataPart = 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n';
            const mediaPart = 'Content-Type: ' + contentType + '\r\n\r\n';

            const ui8Metadata = new TextEncoder().encode(delimiter + metadataPart + delimiter + mediaPart);
            const ui8Close = new TextEncoder().encode(close_delim);
            
            const combined = new Uint8Array(ui8Metadata.length + fileData.byteLength + ui8Close.length);
            combined.set(ui8Metadata, 0);
            combined.set(new Uint8Array(fileData), ui8Metadata.length);
            combined.set(ui8Close, ui8Metadata.length + fileData.byteLength);

            xhr.setRequestHeader('Content-Type', 'multipart/related; boundary=' + boundary);

            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    if (onProgress) onProgress(percent);
                }
            });

            xhr.onreadystatechange = async () => {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const resJson = JSON.parse(xhr.responseText);
                            const fileId = resJson.id;
                            
                            try {
                                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
                                    method: 'POST',
                                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'anyone', role: 'reader' })
                                });
                            } catch (permErr) {
                                console.warn("No se pudieron cambiar los permisos del archivo en Google Drive (posible restricción de la cuenta):", permErr);
                            }

                            const shareLink = `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
                            resolve(shareLink);
                        } catch (err) {
                            reject(new Error("Error al hacer el archivo público o parsear la respuesta: " + err.message));
                        }
                    } else {
                        reject(new Error(`Error de subida a Google Drive (HTTP ${xhr.status}): ${xhr.responseText}`));
                    }
                }
            };

            xhr.send(combined);
        };
        
        reader.onerror = function(err) {
            reject(err);
        };

        reader.readAsArrayBuffer(file);
    });
}

export async function uploadAudioToAlternativeCloud(file) {
    // 1. Intentar con PixelDrain (Directo y con CORS)
    try {
        console.log('Subiendo audio a PixelDrain...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://pixeldrain.com/api/file', {
            method: 'POST',
            body: formData,
            credentials: 'omit'
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido audio a PixelDrain con éxito ID:', data.id);
                return `https://pixeldrain.com/api/file/${data.id}`;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a PixelDrain:', e);
    }

    // 2. Intentar con tmpfiles.org (Directo y con CORS)
    try {
        console.log('Subiendo audio a tmpfiles.org...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.status === 'success') {
                const viewerUrl = data.data.url;
                const downloadUrl = viewerUrl.replace('https://tmpfiles.org/', 'https://tmpfiles.org/dl/');
                console.log('Subido audio a tmpfiles.org con éxito:', downloadUrl);
                return downloadUrl;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a tmpfiles.org:', e);
    }

    // 3. Intentar con GoFile (Página de descarga)
    try {
        console.log('Subiendo audio a GoFile...');
        const serverResponse = await fetch('https://api.gofile.io/getServer');
        let server = 'store1';
        if (serverResponse.ok) {
            const serverData = await serverResponse.json();
            if (serverData.status === 'ok' && serverData.data && serverData.data.server) {
                server = serverData.data.server;
            }
        }
        
        const formData = new FormData();
        formData.append('file', file, file.name);
        
        const uploadResponse = await fetch(`https://${server}.gofile.io/uploadFile`, {
            method: 'POST',
            body: formData
        });
        
        if (uploadResponse.ok) {
            const uploadData = await uploadResponse.json();
            if (uploadData.status === 'ok' && uploadData.data && uploadData.data.downloadPage) {
                console.log('Subido audio a GoFile con éxito:', uploadData.data.downloadPage);
                return uploadData.data.downloadPage;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a GoFile:', e);
    }

    // 4. Intentar con file.io (Un solo uso)
    try {
        console.log('Subiendo audio a file.io...');
        const formData = new FormData();
        formData.append('file', file, file.name);

        const response = await fetch('https://file.io/', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.success) {
                console.log('Subido audio a file.io con éxito:', data.link);
                return data.link;
            }
        }
    } catch (e) {
        console.error('Error al subir audio a file.io:', e);
    }

    throw new Error('No se pudo subir el archivo de audio a ningún servidor de almacenamiento alternativo.');
}

// ============================================================
// FILTROS Y RENDERIZADO DEL CATÁLOGO (UI EVENTS)
// ============================================================

export function updateGenreAndKeyFilters() {
    const genreSelect = document.getElementById('tab-filter-genre');
    const keySelect = document.getElementById('tab-filter-key');
    if (!genreSelect || !keySelect) return;

    const currentGenre = genreSelect.value;
    const currentKey = keySelect.value;

    const genres = new Set();
    const keys = new Set();

    window.localBeats.forEach(b => {
        if (b.genre) genres.add(b.genre.trim());
        if (b.key) keys.add(b.key.trim());
    });

    genreSelect.innerHTML = '<option value="">Todos los géneros</option>';
    Array.from(genres).sort().forEach(g => {
        genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
    });
    genreSelect.value = currentGenre;

    keySelect.innerHTML = '<option value="">Todas las escalas</option>';
    Array.from(keys).sort().forEach(k => {
        keySelect.innerHTML += `<option value="${k}">${k}</option>`;
    });
    keySelect.value = currentKey;
}

export function renderBeatsGrid() {
    const gridContainer = document.getElementById('tab-beats-grid');
    const emptyState = document.getElementById('tab-beats-empty');
    if (!gridContainer) return;

    const searchQuery = document.getElementById('tab-search-beats').value.toLowerCase().trim();
    const genreFilter = document.getElementById('tab-filter-genre').value;
    const keyFilter = document.getElementById('tab-filter-key').value;

    let filtered = [...window.localBeats];

    if (searchQuery) {
        filtered = filtered.filter(b => 
            (b.name || '').toLowerCase().includes(searchQuery) || 
            (b.tags || '').toLowerCase().includes(searchQuery)
        );
    }
    if (genreFilter) {
        filtered = filtered.filter(b => b.genre === genreFilter);
    }
    if (keyFilter) {
        filtered = filtered.filter(b => b.key === keyFilter);
    }

    filtered.sort((a, b) => b.updatedAt - a.updatedAt);

    const countLabel = document.getElementById('tab-stats-count');
    if (countLabel) countLabel.textContent = filtered.length;
    
    document.getElementById('tab-stats-total').textContent = window.localBeats.length;

    const mp3Count = window.localBeats.filter(b => b.mp3 && b.mp3.trim() !== '').length;
    const wavCount = window.localBeats.filter(b => b.wav && b.wav.trim() !== '').length;
    const stemsCount = window.localBeats.filter(b => b.stems && b.stems.trim() !== '').length;

    const mp3El = document.getElementById('tab-stats-mp3');
    const wavEl = document.getElementById('tab-stats-wav');
    const stemsEl = document.getElementById('tab-stats-stems');

    if (mp3El) mp3El.textContent = mp3Count;
    if (wavEl) wavEl.textContent = wavCount;
    if (stemsEl) stemsEl.textContent = stemsCount;

    if (filtered.length === 0) {
        gridContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    gridContainer.innerHTML = '';

    filtered.forEach(beat => {
        const card = document.createElement('div');
        card.className = 'tab-beat-card';

        const finalArtworkUrl = typeof window.getBeatArtwork === 'function' ? window.getBeatArtwork(beat) : '';
        const artworkHtml = finalArtworkUrl
            ? `<img src="${finalArtworkUrl}" class="tab-beat-artwork" alt="${sanitizeHtml(beat.name)}">`
            : `<div class="tab-beat-artwork-placeholder"><i data-lucide="music" style="width: 24px; height: 24px;"></i></div>`;

        let tagsHtml = '';
        if (beat.tags) {
            tagsHtml = beat.tags.split(',')
                .map(t => `<span class="tab-beat-tag">#${sanitizeHtml(t.trim())}</span>`)
                .join('');
        }

        const isPlaying = window.currentPlayingBeatId === beat.id && window.currentPlayingAudio && !window.currentPlayingAudio.paused;
        const playIcon = isPlaying ? 'pause' : 'play';
        const playingClass = isPlaying ? 'playing active' : '';

        card.innerHTML = `
            <div class="tab-beat-artwork-container">
                ${artworkHtml}
                <button class="tab-beat-play-btn ${playingClass}" onclick="window.togglePlayBeat('${beat.id}', '${beat.mp3 || ''}')">
                    <i data-lucide="${playIcon}"></i>
                </button>
            </div>
            <div class="tab-beat-info">
                <div class="tab-beat-title" onclick="selectBeatForContract('${beat.id}')">${sanitizeHtml(beat.name)}</div>
                <div class="tab-beat-meta">
                    ${beat.bpm ? `<span>${beat.bpm} BPM</span>` : ''}
                    ${beat.key ? `<span>• ${beat.key}</span>` : ''}
                    ${beat.genre ? `<span>• ${beat.genre}</span>` : ''}
                </div>
                <div class="tab-beat-tags-container">
                    ${tagsHtml}
                </div>
            </div>
            <div class="tab-beat-actions">
                <button class="btn btn-secondary" onclick="window.selectBeatForContract('${beat.id}')" style="flex: 1; font-size: 11px; padding: 6px; height: 28px; background: var(--bs-blue-60); border-color: var(--bs-blue-60); color: #fff; border-radius: 6px; border: none; cursor: pointer; font-weight: 600;">Usar</button>
                <button class="btn btn-secondary" onclick="window.openTabBeatForm('${beat.id}')" style="padding: 6px; height: 28px; border-radius: 6px; width: 28px; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Editar"><i data-lucide="edit-2" style="width: 12px; height: 12px;"></i></button>
                <button class="btn btn-secondary" onclick="window.deleteBeat('${beat.id}')" style="padding: 6px; height: 28px; border-radius: 6px; width: 28px; display: flex; align-items: center; justify-content: center; color: var(--bs-red-50); cursor: pointer;" title="Eliminar"><i data-lucide="trash-2" style="width: 12px; height: 12px;"></i></button>
            </div>
        `;

        gridContainer.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function selectBeatForContract(id) {
    selectBeat(id);
    document.querySelector('.tab-btn[data-tab="tab-preview"]').click();
}

export function openTabBeatForm(editId = null) {
    document.getElementById('tab-beat-form-empty-state').style.display = 'none';
    document.getElementById('tab-beat-form-fields').style.display = 'block';

    if (editId) {
        const beat = window.localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('tab-beat-form-title').innerText = 'Editar Beat: ' + beat.name;
            document.getElementById('tab-edit-beat-id').value = beat.id;
            document.getElementById('tab-db-beat-name').value = beat.name || '';
            document.getElementById('tab-db-beat-mp3').value = beat.mp3 || '';
            document.getElementById('tab-db-beat-wav').value = beat.wav || '';
            document.getElementById('tab-db-beat-stems').value = beat.stems || '';
            document.getElementById('tab-db-beat-artwork').value = beat.artwork || '';
            document.getElementById('tab-db-beat-bpm').value = beat.bpm || '';
            document.getElementById('tab-db-beat-key').value = beat.key || '';
            document.getElementById('tab-db-beat-genre').value = beat.genre || '';
            document.getElementById('tab-db-beat-moods').value = beat.moods || '';
            document.getElementById('tab-db-beat-tags').value = beat.tags || '';
            document.getElementById('tab-db-beat-description').value = beat.description || '';
            document.getElementById('tab-db-beat-free-download').checked = !!beat.freeDownload;
        }
    } else {
        document.getElementById('tab-beat-form-title').innerText = 'Agregar Nuevo Beat';
        document.getElementById('tab-edit-beat-id').value = '';
        document.getElementById('tab-db-beat-name').value = '';
        document.getElementById('tab-db-beat-mp3').value = '';
        document.getElementById('tab-db-beat-wav').value = '';
        document.getElementById('tab-db-beat-stems').value = '';
        document.getElementById('tab-db-beat-artwork').value = '';
        document.getElementById('tab-db-beat-bpm').value = '';
        document.getElementById('tab-db-beat-key').value = '';
        document.getElementById('tab-db-beat-genre').value = '';
        document.getElementById('tab-db-beat-moods').value = '';
        document.getElementById('tab-db-beat-tags').value = '';
        document.getElementById('tab-db-beat-description').value = '';
        document.getElementById('tab-db-beat-free-download').checked = false;
    }
    
    if (window.lucide) window.lucide.createIcons();
    updateClearButtonsVisibility();
}

export function closeTabBeatForm() {
    document.getElementById('tab-beat-form-empty-state').style.display = 'block';
    document.getElementById('tab-beat-form-fields').style.display = 'none';
}

export async function saveTabBeat() {
    const id = document.getElementById('tab-edit-beat-id').value;
    const name = document.getElementById('tab-db-beat-name').value.trim();
    const mp3 = document.getElementById('tab-db-beat-mp3').value.trim();
    const wav = document.getElementById('tab-db-beat-wav').value.trim();
    const stems = document.getElementById('tab-db-beat-stems').value.trim();
    const artwork = document.getElementById('tab-db-beat-artwork').value.trim();
    const bpm = document.getElementById('tab-db-beat-bpm').value ? parseInt(document.getElementById('tab-db-beat-bpm').value, 10) : null;
    const key = document.getElementById('tab-db-beat-key').value.trim();
    const genre = document.getElementById('tab-db-beat-genre').value.trim();
    const moods = document.getElementById('tab-db-beat-moods').value.trim();
    const tags = document.getElementById('tab-db-beat-tags').value.trim();
    const description = document.getElementById('tab-db-beat-description').value.trim();
    const freeDownload = document.getElementById('tab-db-beat-free-download').checked;

    if (!name) {
        if (typeof window.showToast === 'function') window.showToast('El nombre del beat es obligatorio', true);
        return;
    }

    const beatId = id || 'beat_' + Date.now();
    const beatData = {
        id: beatId,
        name,
        mp3,
        wav,
        stems,
        artwork,
        bpm,
        key,
        genre,
        moods,
        tags,
        description,
        freeDownload,
        updatedAt: Date.now()
    };

    const isNew = !id;
    if (!window.currentUserIsPro && isNew && window.localBeats.length >= 10) {
        if (typeof window.openPaymentModal === 'function') {
            window.openPaymentModal("Límite alcanzado: Has alcanzado el límite de 10 beats del Plan Inicial. ¡Actualízate a PRO hoy para subir beats ilimitados!");
        }
        return;
    }

    if (id) {
        const index = window.localBeats.findIndex(b => b.id === id);
        if (index !== -1) window.localBeats[index] = beatData;
    } else {
        window.localBeats.push(beatData);
    }

    try {
        if (typeof window.safeSetItem === 'function') {
            window.safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
        }
        
        await saveBeatToFirestore(beatData);
        
        if (typeof window.showToast === 'function') window.showToast(id ? 'Beat actualizado' : 'Nuevo beat guardado');
        closeTabBeatForm();
        renderBeatsGrid();
        renderBeatsList();
        updateGenreAndKeyFilters();
    } catch (e) {
        console.error('Error saving beat from tab:', e);
        if (typeof window.showToast === 'function') window.showToast('Error al guardar el beat en la base de datos', true);
    }
}

// =======================================================
// GLOBAL CATALOG IMPLEMENTATION (MARKETPLACE)
// =======================================================
window.stateManager.setState('isGlobalCatalogMode', false);
window.globalProducersConfig = {};
window.globalBeats = [];
window.filteredGlobalBeats = [];
window.lastGlobalBeatDoc = null;
const PAGE_SIZE = 12;

export async function initGlobalCatalog() {
    console.log("🌍 Cargando Catálogo Global de BEATSS (Paginado)...");
    window.stateManager.setState('isGlobalCatalogMode', true);
    window.stateManager.setState('isPublicStoreMode', false);

    // Asegurar que los eventos del checkout (carrito, botones, etc.) estén configurados
    if (typeof window.setupStoreCheckout === 'function') {
        window.setupStoreCheckout();
    }

    // Ocultar otras pantallas
    document.getElementById('login-modal').style.display = 'none';
    const landing = document.getElementById('landing-page');
    if (landing) landing.style.display = 'none';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('public-store-view').style.display = 'none';
    
    // Ocultar reproductor si estaba
    const player = document.getElementById('store-audio-player');
    if (player) player.style.display = 'none';

    // Mostrar vista del catálogo
    const catalogView = document.getElementById('global-catalog-view');
    catalogView.style.display = 'block';

    const grid = document.getElementById('global-beats-grid');
    
    // Ocultar Cargar Más por defecto
    const loadMoreContainer = document.getElementById('global-load-more-container');
    if (loadMoreContainer) loadMoreContainer.style.display = 'none';

    // Inyectar skeleton loaders
    renderSkeletons(grid, PAGE_SIZE);

    try {
        // 1. Obtener todos los perfiles de productores
        if (!window.globalProducersConfig || Object.keys(window.globalProducersConfig).length === 0) {
            const configsSnap = await getDocs(collectionGroup(db, 'config'));
            window.globalProducersConfig = {};
            configsSnap.forEach(doc => {
                const docPath = doc.ref.path;
                const uid = docPath.split('/')[1];
                window.globalProducersConfig[uid] = doc.data();
            });
        }

        // Resetear paginación
        window.globalBeats = [];
        window.lastGlobalBeatDoc = null;

        await window.fetchGlobalBeatsPage(false);
        setupGlobalEvents();

    } catch (error) {
        console.error("Error al inicializar el Catálogo Global:", error);
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: #ef4444;">
                <i data-lucide="alert-triangle" style="width: 48px; height: 48px;"></i>
                <p style="margin-top: 15px; font-weight: 600;">Ocurrió un error al cargar el catálogo.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }
}

export function renderSkeletons(container, count = 12) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += `
            <div class="skeleton-card">
                <div class="skeleton-thumbnail"></div>
                <div class="skeleton-text skeleton-title"></div>
                <div class="skeleton-text skeleton-subtitle"></div>
                <div class="skeleton-row">
                    <div class="skeleton-text" style="width: 60px;"></div>
                    <div class="skeleton-button"></div>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.fetchGlobalBeatsPage = async function(isLoadMore = false) {
    const grid = document.getElementById('global-beats-grid');
    const loadMoreContainer = document.getElementById('global-load-more-container');
    
    if (isLoadMore) {
        // Append 12 skeletons at the bottom
        const tempDiv = document.createElement('div');
        tempDiv.id = 'global-skeletons-temp';
        tempDiv.style.display = 'contents';
        renderSkeletons(tempDiv, PAGE_SIZE);
        grid.appendChild(tempDiv);
    }

    try {
        const q = window.lastGlobalBeatDoc 
            ? query(collectionGroup(db, 'beats'), startAfter(window.lastGlobalBeatDoc), limit(PAGE_SIZE))
            : query(collectionGroup(db, 'beats'), limit(PAGE_SIZE));
            
        const beatsSnap = await getDocs(q);
        
        // Remover los skeletons temporales
        const tempSkeletons = document.getElementById('global-skeletons-temp');
        if (tempSkeletons) tempSkeletons.remove();
        
        if (beatsSnap.empty) {
            if (!isLoadMore) {
                grid.innerHTML = '';
                document.getElementById('global-empty-state').style.display = 'block';
            }
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
            return;
        }

        beatsSnap.forEach(doc => {
            const data = doc.data();
            const docPath = doc.ref.path;
            const uid = docPath.split('/')[1];
            
            // Filtrar solo beats con MP3, listos para preescucha
            if (data.mp3) {
                // Evitar duplicados
                if (!window.globalBeats.some(b => b.id === doc.id)) {
                    window.globalBeats.push({
                        id: doc.id,
                        producerUid: uid,
                        producerConfig: window.globalProducersConfig[uid] || {},
                        ...data
                    });
                }
            }
        });

        window.lastGlobalBeatDoc = beatsSnap.docs[beatsSnap.docs.length - 1];

        // Ordenamiento por defecto: más recientes
        window.globalBeats.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        window.filteredGlobalBeats = [...window.globalBeats];

        populateGlobalFilters(window.globalBeats);
        
        // Volver a aplicar filtros activos al renderizar
        const searchInput = document.getElementById('global-search-input');
        const genreSelect = document.getElementById('global-genre-select');
        const priceSelect = document.getElementById('global-price-select');
        const bpmSelect = document.getElementById('global-bpm-select');
        const sortSelect = document.getElementById('global-sort-select');
        
        if (searchInput && (searchInput.value || (genreSelect && genreSelect.value) || (priceSelect && priceSelect.value) || (bpmSelect && bpmSelect.value))) {
            const queryVal = searchInput.value.toLowerCase().trim();
            const genre = genreSelect ? genreSelect.value : '';
            const priceLevel = priceSelect ? priceSelect.value : '';
            const bpmLevel = bpmSelect ? bpmSelect.value : '';
            const sort = sortSelect ? sortSelect.value : 'newest';

            window.filteredGlobalBeats = window.globalBeats.filter(beat => {
                const prodAka = (beat.producerConfig?.aka || '').toLowerCase();
                const beatName = (beat.name || '').toLowerCase();
                const beatGenre = (beat.genre || '').toLowerCase();
                const matchesSearch = !queryVal || beatName.includes(queryVal) || prodAka.includes(queryVal) || beatGenre.includes(queryVal);
                const matchesGenre = !genre || beat.genre === genre;
                
                let matchesBpm = true;
                if (bpmLevel && beat.bpm) {
                    const bpmVal = parseInt(beat.bpm);
                    if (bpmLevel === '0-90' && bpmVal >= 90) matchesBpm = false;
                    else if (bpmLevel === '90-130' && (bpmVal < 90 || bpmVal > 130)) matchesBpm = false;
                    else if (bpmLevel === '130-999' && bpmVal <= 130) matchesBpm = false;
                } else if (bpmLevel && !beat.bpm) {
                    matchesBpm = false;
                }

                let matchesPrice = true;
                if (priceLevel && beat.price_basic) {
                    const p = beat.price_basic;
                    if (priceLevel === '0-20' && p > 20) matchesPrice = false;
                    else if (priceLevel === '20-50' && (p <= 20 || p > 50)) matchesPrice = false;
                    else if (priceLevel === '50-100' && (p <= 50 || p > 100)) matchesPrice = false;
                    else if (priceLevel === '100+' && p <= 100) matchesPrice = false;
                } else if (priceLevel && !beat.price_basic) {
                    matchesPrice = false;
                }
                return matchesSearch && matchesGenre && matchesBpm && matchesPrice;
            });

            if (sort === 'price_asc') {
                window.filteredGlobalBeats.sort((a,b) => (a.price_basic || 9999) - (b.price_basic || 9999));
            } else if (sort === 'price_desc') {
                window.filteredGlobalBeats.sort((a,b) => (b.price_basic || 0) - (a.price_basic || 0));
            } else {
                window.filteredGlobalBeats.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
            }
        }
        
        renderGlobalBeats(window.filteredGlobalBeats);

        // Si la página tiene menos de 12 elementos, ocultar "Cargar más"
        if (beatsSnap.docs.length < PAGE_SIZE) {
            if (loadMoreContainer) loadMoreContainer.style.display = 'none';
        } else {
            if (loadMoreContainer) loadMoreContainer.style.display = 'block';
        }

    } catch (error) {
        console.error("Error al paginar beats:", error);
        const tempSkeletons = document.getElementById('global-skeletons-temp');
        if (tempSkeletons) tempSkeletons.remove();
    }
};

export function populateGlobalFilters(beats) {
    const genres = new Set();
    beats.forEach(b => {
        if (b.genre && b.genre.trim() !== '') {
            genres.add(b.genre.trim());
        }
    });
    const genreSelect = document.getElementById('global-genre-select');
    if (genreSelect) {
        const currentValue = genreSelect.value;
        genreSelect.innerHTML = '<option value="">Cualquier Género</option>';
        Array.from(genres).sort().forEach(g => {
            genreSelect.innerHTML += `<option value="${g}">${g}</option>`;
        });
        genreSelect.value = currentValue; // Mantener selección
    }
}

export function renderGlobalBeats(beats) {
    const grid = document.getElementById('global-beats-grid');
    const emptyState = document.getElementById('global-empty-state');
    
    // Inyectar metadatos estructurados JSON-LD (SEO)
    try {
        let schemaEl = document.getElementById('seo-jsonld-global-beats');
        if (schemaEl) {
            schemaEl.remove();
        }
        
        const schemaData = {
            "@context": "https://schema.org",
            "@type": "MusicPlaylist",
            "name": "Marketplace Global de Beats y Licencias Instrumentales - BEATSS",
            "numTracks": beats.length,
            "track": beats.map((beat, index) => ({
                "@type": "MusicRecording",
                "position": index + 1,
                "name": beat.name,
                "genre": beat.genre || "Instrumental",
                "image": window.getBeatArtwork(beat),
                "offers": {
                    "@type": "Offer",
                    "price": beat.basicPrice || 30.00,
                    "priceCurrency": "USD",
                    "availability": "https://schema.org/InStock",
                    "seller": {
                        "@type": "Person",
                        "name": beat.producerConfig?.aka || beat.producerConfig?.name || "Productor"
                    }
                }
            }))
        };

        schemaEl = document.createElement('script');
        schemaEl.id = 'seo-jsonld-global-beats';
        schemaEl.type = 'application/ld+json';
        schemaEl.text = JSON.stringify(schemaData);
        document.head.appendChild(schemaEl);
    } catch (e) {
        console.error("Error al inyectar JSON-LD global:", e);
    }

    if (beats.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    grid.innerHTML = beats.map(beat => {
        const config = beat.producerConfig || {};
        const producerName = config.aka || config.name || 'Productor';
        
        const akaLower = producerName.toLowerCase();
        let pColor = '#00ccff';
        if (config.brandColor) {
            pColor = config.brandColor;
        } else if (akaLower.includes('monarco')) {
            pColor = '#ff4d4d';
        } else if (akaLower.includes('sossa')) {
            pColor = '#b28eff';
        }

        const hexToRgb = (hex) => {
            const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : { r: 0, g: 204, b: 255 };
        };
        const rgb = hexToRgb(pColor);
        const pColorGlow = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`;
        const pColorGlowHover = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.35)`;

        const artwork = window.getBeatArtwork(beat);
        
        const isElite = config.plan === 'elite';
        const eliteBadge = isElite ? `<span style="background: rgba(168, 85, 247, 0.12); border: 1px solid #a855f7; color: #d8b4fe; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; font-family: monospace; margin-left: 6px; box-shadow: 0 0 8px rgba(168, 85, 247, 0.25);">[ ELITE ]</span>` : '';
        
        const buyText = window.currentLang === 'es' ? 'Adquirir' : 'Acquire';
        const basicLabel = window.currentLang === 'es' ? 'Básico' : 'Basic';
        const negotiableText = window.currentLang === 'es' ? 'Negociable' : 'Negotiable';
        const priceValue = beat.price_basic ? `$${beat.price_basic.toFixed(2)}` : negotiableText;

        return `
            <div class="store-beat-card glass-card" style="padding: 18px; display: flex; flex-direction: column; height: 100%;">
                <div class="store-beat-cover" style="position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #151722;" onclick="window.playGlobalBeat('${beat.id}')">
                    <img src='${artwork}' style="width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform 0.5s ease;">
                    <div class="store-play-overlay">
                        <button id="btn-play-global-${beat.id}" class="store-play-btn" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.9); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; transition: all 0.2s ease; transform: scale(0.9);">
                            <i data-lucide="play" style="width: 20px; height: 20px; fill: #000; stroke: #000;"></i>
                        </button>
                    </div>
                </div>
                <div style="padding: 16px 4px 4px 4px; display: flex; flex-direction: column; flex: 1; gap: 12px; position: relative; z-index: 5;">
                    <h3 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; min-height: 2.5em;" title="${sanitizeHtml(beat.name) || 'Beat'}">${sanitizeHtml(beat.name) || 'Beat'}</h3>
                    <div style="color: #8a91a6; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="user" style="width: 14px; height: 14px; color: #8b5cf6;"></i> 
                        <span style="color: #e2e8f0; cursor: pointer; text-decoration: underline;" onclick="window.showAppView('store', { producer: decodeURIComponent('${encodeURIComponent(config.aka || config.name || '')}') })">${sanitizeHtml(producerName)}</span> ${eliteBadge}
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                        <span class="minimal-tag">${beat.bpm || '--'} BPM</span>
                        <span class="minimal-tag">KEY: ${beat.key || '--'}</span>
                        <span class="minimal-tag">${beat.genre || 'Variado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 11px; color: #8a91a6; font-weight: 600; text-transform: capitalize;">${basicLabel}</span>
                            <span style="font-weight: 700; color: #fff; font-size: 17px;">${priceValue}</span>
                        </div>
                        <button class="w-28 py-2 bg-white text-black hover:bg-white/90 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5" onclick="window.openGlobalBeatCheckoutModal('${beat.id}')">
                            <i data-lucide="shopping-cart" style="width: 14px; height: 14px; stroke-width: 2.5;"></i>
                            ${buyText.toUpperCase()}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
    if (typeof window.apply3DTiltEffect === 'function') window.apply3DTiltEffect();
}

export function setupGlobalEvents() {
    const searchInput = document.getElementById('global-search-input');
    const genreSelect = document.getElementById('global-genre-select');
    const priceSelect = document.getElementById('global-price-select');
    const bpmSelect = document.getElementById('global-bpm-select');
    const sortSelect = document.getElementById('global-sort-select');
    const clearBtn = document.getElementById('global-btn-clear-filters');
    const loadMoreBtn = document.getElementById('btn-load-more-global');
    
    const applyFilters = () => {
        const query = searchInput.value.toLowerCase().trim();
        const genre = genreSelect.value;
        const priceLevel = priceSelect.value;
        const bpmLevel = bpmSelect.value;
        const sort = sortSelect.value;

        window.filteredGlobalBeats = window.globalBeats.filter(beat => {
            const prodAka = (beat.producerConfig?.aka || '').toLowerCase();
            const beatName = (beat.name || '').toLowerCase();
            const beatGenre = (beat.genre || '').toLowerCase();
            const matchesSearch = !query || beatName.includes(query) || prodAka.includes(query) || beatGenre.includes(query);

            const matchesGenre = !genre || beat.genre === genre;

            let matchesBpm = true;
            if (bpmLevel && beat.bpm) {
                const bpmVal = parseInt(beat.bpm);
                if (bpmLevel === '0-90' && bpmVal >= 90) matchesBpm = false;
                else if (bpmLevel === '90-130' && (bpmVal < 90 || bpmVal > 130)) matchesBpm = false;
                else if (bpmLevel === '130-999' && bpmVal <= 130) matchesBpm = false;
            } else if (bpmLevel && !beat.bpm) {
                matchesBpm = false;
            }

            let matchesPrice = true;
            if (priceLevel && beat.price_basic) {
                const p = beat.price_basic;
                if (priceLevel === '0-20' && p > 20) matchesPrice = false;
                else if (priceLevel === '20-50' && (p <= 20 || p > 50)) matchesPrice = false;
                else if (priceLevel === '50-100' && (p <= 50 || p > 100)) matchesPrice = false;
                else if (priceLevel === '100+' && p <= 100) matchesPrice = false;
            } else if (priceLevel && !beat.price_basic) {
                matchesPrice = false;
            }

            return matchesSearch && matchesGenre && matchesBpm && matchesPrice;
        });

        if (sort === 'price_asc') {
            window.filteredGlobalBeats.sort((a,b) => (a.price_basic || 9999) - (b.price_basic || 9999));
        } else if (sort === 'price_desc') {
            window.filteredGlobalBeats.sort((a,b) => (b.price_basic || 0) - (a.price_basic || 0));
        } else {
            window.filteredGlobalBeats.sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }

        renderGlobalBeats(window.filteredGlobalBeats);
    };

    if(searchInput && !searchInput.dataset.listenerAdded) {
        searchInput.dataset.listenerAdded = 'true';
        searchInput.addEventListener('input', applyFilters);
    }
    if(genreSelect && !genreSelect.dataset.listenerAdded) {
        genreSelect.dataset.listenerAdded = 'true';
        genreSelect.addEventListener('change', applyFilters);
    }
    if(priceSelect && !priceSelect.dataset.listenerAdded) {
        priceSelect.dataset.listenerAdded = 'true';
        priceSelect.addEventListener('change', applyFilters);
    }
    if(bpmSelect && !bpmSelect.dataset.listenerAdded) {
        bpmSelect.dataset.listenerAdded = 'true';
        bpmSelect.addEventListener('change', applyFilters);
    }
    if(sortSelect && !sortSelect.dataset.listenerAdded) {
        sortSelect.dataset.listenerAdded = 'true';
        sortSelect.addEventListener('change', applyFilters);
    }

    if (clearBtn && !clearBtn.dataset.listenerAdded) {
        clearBtn.dataset.listenerAdded = 'true';
        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            genreSelect.value = '';
            priceSelect.value = '';
            bpmSelect.value = '';
            sortSelect.value = 'newest';
            applyFilters();
        });
    }
}

window.playGlobalBeat = function(beatId) {
    window.storeBeats = window.globalBeats;
    
    const beat = window.globalBeats.find(b => b.id === beatId);
    if(beat) {
        window.storeProducerUid = beat.producerUid;
        window.storeProducerConfig = beat.producerConfig || {};

        const akaLower = (beat.producerConfig?.aka || '').toLowerCase();
        let pColor = '#00ccff';
        if (akaLower.includes('monarco')) pColor = '#ff4d4d';
        else if (akaLower.includes('sossa')) pColor = '#b28eff';
        document.documentElement.style.setProperty('--accent', pColor);
    }

    if(window.toggleStorePlay) {
        window.toggleStorePlay(beatId);
    }
};

window.openGlobalBeatCheckoutModal = function(beatId) {
    const beat = window.globalBeats.find(b => b.id === beatId);
    if (!beat) return;

    window.storeBeats = window.globalBeats;
    window.storeProducerUid = beat.producerUid;
    window.storeProducerConfig = beat.producerConfig;

    const akaLower = (beat.producerConfig?.aka || '').toLowerCase();
    if (akaLower.includes('monarco')) {
        document.documentElement.style.setProperty('--accent', '#ff4d4d');
        document.documentElement.style.setProperty('--accent-rgb', '255, 77, 77');
    } else if (akaLower.includes('sossa')) {
        document.documentElement.style.setProperty('--accent', '#b28eff');
        document.documentElement.style.setProperty('--accent-rgb', '178, 142, 255');
    } else {
        document.documentElement.style.setProperty('--accent', '#00ccff');
        document.documentElement.style.setProperty('--accent-rgb', '0, 204, 255');
    }

    if(window.openBeatCheckoutModal) {
        window.openBeatCheckoutModal(beatId);
    }
};

// Bind functions to window for index.html inline access and compatibility
window.initBeatsDB = initBeatsDB;
window.openBeatsModal = openBeatsModal;
window.closeBeatsModal = closeBeatsModal;
window.openBeatForm = openBeatForm;
window.closeBeatForm = closeBeatForm;
window.saveBeatToFirestore = saveBeatToFirestore;
window.saveBeat = saveBeat;
window.deleteBeat = deleteBeat;
window.selectBeat = selectBeat;
window.renderBeatsList = renderBeatsList;
window.initFileUploads = initFileUploads;
window.initClearInputHandlers = initClearInputHandlers;
window.updateClearButtonsVisibility = updateClearButtonsVisibility;
window.uploadFileToDriveWithProgress = uploadFileToDriveWithProgress;
window.uploadAudioToAlternativeCloud = uploadAudioToAlternativeCloud;
window.updateGenreAndKeyFilters = updateGenreAndKeyFilters;
window.renderBeatsGrid = renderBeatsGrid;
window.selectBeatForContract = selectBeatForContract;
window.openTabBeatForm = openTabBeatForm;
window.closeTabBeatForm = closeTabBeatForm;
window.saveTabBeat = saveTabBeat;
window.initGlobalCatalog = initGlobalCatalog;
window.renderGlobalBeats = renderGlobalBeats;
window.setupGlobalCatalogFilters = setupGlobalEvents;
window.playGlobalBeat = playGlobalBeat;
window.openGlobalBeatCheckoutModal = openGlobalBeatCheckoutModal;

