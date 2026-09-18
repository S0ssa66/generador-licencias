import { 
    auth,
    db,
    collection,
    getDocs,
    getDoc,
    doc,
    setDoc,
    deleteField,
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
let activeUploadInProgress = false;
const beatsChangingSaleStatus = new Set();

// Un beat dado de baja conserva sus archivos y su historial. `published` es
// la fuente de verdad que también usa la tienda pública y Stripe para no
// ofrecerlo a nuevos compradores.
export function isBeatRetired(beat = {}) {
    return beat?.published === false || beat?.isPublished === false;
}

function activeCatalogBeats() {
    return (Array.isArray(window.localBeats) ? window.localBeats : [])
        .filter(beat => !isBeatRetired(beat));
}

function saveLocalBeatCatalog() {
    if (typeof window.safeSetItem !== 'function') return;
    try {
        window.safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
    } catch (error) {
        // Firestore sigue siendo la fuente de verdad; un caché local lleno no
        // debe convertir una baja o restauración ya confirmada en un error.
        console.warn('No se pudo actualizar la copia local del catálogo:', error.message);
    }
}

function refreshBeatCatalogViews() {
    renderBeatsList();
    if (document.getElementById('tab-beats-grid')) {
        renderBeatsGrid();
        updateGenreAndKeyFilters();
    }
}

function preserveSaleStatus(existingBeat, beatData) {
    if (!existingBeat) return { ...beatData, published: true };

    if (isBeatRetired(existingBeat)) {
        return {
            ...beatData,
            published: false,
            retiredAt: existingBeat.retiredAt || null,
            retiredReason: existingBeat.retiredReason || 'manual'
        };
    }

    return { ...beatData, published: existingBeat.published !== false };
}

function uploadTargetLabel(targetId = '') {
    if (targetId.includes('preview')) return 'preview público';
    if (targetId.includes('mp3')) return 'MP3';
    if (targetId.includes('wav')) return 'WAV';
    if (targetId.includes('stems')) return 'Stems';
    if (targetId.includes('artwork')) return 'Portada';
    return 'Archivo';
}

function setUploadStatus(targetId, status, message) {
    const statusEl = document.querySelector(`[data-upload-status-for="${targetId}"]`);
    if (!statusEl) return;

    statusEl.hidden = false;
    statusEl.className = `beat-upload-status is-${status}`;
    statusEl.textContent = message;
}

function clearUploadStatus(targetId) {
    const statusEl = document.querySelector(`[data-upload-status-for="${targetId}"]`);
    if (!statusEl) return;
    statusEl.hidden = true;
    statusEl.textContent = '';
    statusEl.className = 'beat-upload-status';
}

function resolveBeatStorageProvider(config = {}) {
    const selectedProvider = config.storageProvider;
    if (selectedProvider === 'firebase' || selectedProvider === 'alternative' || selectedProvider === 'gdrive-central') {
        return selectedProvider;
    }

    // La antigua opción personal no vuelve a exponer tokens en el navegador;
    // se canaliza por el Drive central protegido del servidor.
    if (selectedProvider === 'gdrive') return 'gdrive-central';

    return 'firebase';
}

async function uploadToFirebaseAudioStorage(file, onProgress) {
    if (!auth.currentUser || !window.currentUser) {
        throw new Error('La sesión no está disponible. Inicia sesión nuevamente antes de subir el archivo.');
    }
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `beats/${window.currentUser}/${Date.now()}_${safeName}`;
    const uploadTask = uploadBytesResumable(ref(storage, storagePath), file, {
        contentType: file.type || (/\.wav$/i.test(file.name) ? 'audio/wav' : 'application/octet-stream'),
        cacheControl: 'private, max-age=0'
    });
    return await new Promise((resolve, reject) => {
        uploadTask.on('state_changed', snapshot => {
            if (onProgress && snapshot.totalBytes) onProgress(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
        }, reject, async () => {
            try { resolve(await getDownloadURL(uploadTask.snapshot.ref)); } catch (error) { reject(error); }
        });
    });
}

// ============================================================
// BASE DE DATOS LOCAL DE BEATS
// ============================================================

export async function initBeatsDB() {
    // Eventos de la UI
    if (!window._beatsDBEventsConfigured) {
        // El selector del Studio usa un proxy de carga diferida desde el HTML.
        // Evitamos registrar una segunda apertura cuando el módulo termina de cargar.
        if (!document.getElementById('btn-beats-modal')?.hasAttribute('onclick')) {
            document.getElementById('btn-beats-modal')?.addEventListener('click', openBeatsModal);
        }
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
            savedList = await Promise.all(querySnapshot.docs.map(async (docSnap) => {
                    const beatData = docSnap.data();
                    beatData.id = docSnap.id;
                    // En instalaciones antiguas el preview vivía en `mp3`.
                    // Conservamos ese valor como compatibilidad antes de
                    // cargar el MP3 privado que se entrega tras la compra.
                    const legacyMediaUrl = beatData.mp3 || '';
                    const legacyPreview = beatData.preview || legacyMediaUrl;
                    beatData.preview = legacyPreview;
                    try {
                    const privateDocRef = doc(db, "users", window.currentUser, "beats", docSnap.id, "private", "files");
                    const privateSnap = await getDoc(privateDocRef);
                    if (privateSnap.exists()) {
                    const privateData = privateSnap.data();
                    beatData.preview = privateData.preview || legacyPreview;
                    beatData.mp3 = privateData.mp3 || legacyMediaUrl;
                    beatData.wav = privateData.wav || "";
                    beatData.stems = privateData.stems || "";
                    }
                } catch (privateErr) {
                    console.warn(`No se pudieron cargar enlaces privados para el beat ${docSnap.id}:`, privateErr.message);
                }
                return beatData;
            }));
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar beats de Firestore:", err);
        }
    }

    // El respaldo local sólo permite seguir viendo el catálogo si Firestore no
    // está disponible. Una carga exitosa de Firestore siempre prevalece: de lo
    // contrario, un navegador con una copia vieja podría recrear beats que ya
    // se eliminaron en otro dispositivo.
    let localList = [];
    const localBeatsKey = `${window.currentUser}_beats`;
    try {
        const stored = localStorage.getItem(localBeatsKey);
        if (stored) {
            localList = JSON.parse(stored);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    window.localBeats = firestoreLoaded ? savedList : localList;

    // Actualizamos el caché sin activar respaldos heredados. No se vuelve a
    // escribir desde localStorage hacia Firestore de forma automática.
    if (firestoreLoaded) {
        try {
            localStorage.setItem(localBeatsKey, JSON.stringify(savedList));
        } catch (cacheError) {
            console.warn('No se pudo actualizar la copia local del catálogo:', cacheError.message);
        }
    }

    // La lista global se crea vacía al iniciar la aplicación. Guardamos una
    // señal independiente para saber si ya consultamos las fuentes reales
    // (Firestore y el respaldo local), en vez de confundir `[]` con una carga
    // completada.
    window._beatsDBLoaded = true;
    window._beatsDBLoadedFor = window.currentUser || null;
}

export async function openBeatsModal() {
    const modal = document.getElementById('modal-beats');
    const search = document.getElementById('search-beats');
    const list = document.getElementById('beats-list');

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    search.value = '';
    closeBeatForm();

    // Desde el Studio el catálogo se carga de forma diferida. `localBeats`
    // existe desde el arranque como array vacío, así que comprobamos la carga
    // real y el usuario que la originó antes de abrir el selector.
    if (!window._beatsDBLoaded || window._beatsDBLoadedFor !== (window.currentUser || null)) {
        list.innerHTML = `
            <div class="ledger-beats-loading" role="status">
                <span aria-hidden="true"></span>
                Cargando tus beats…
            </div>`;

        if (!window._beatsDBLoadingPromise) {
            window._beatsDBLoadingPromise = initBeatsDB().finally(() => {
                window._beatsDBLoadingPromise = null;
            });
        }
        await window._beatsDBLoadingPromise;
    }

    renderBeatsList();
    requestAnimationFrame(() => search.focus());
}

export function closeBeatsModal() {
    const modal = document.getElementById('modal-beats');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
}

export function openBeatForm(editId = null) {
    document.getElementById('beat-form-container').style.display = 'block';
    
    if (editId) {
        const beat = window.localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('beat-form-title').innerText = 'Editar Beat';
            document.getElementById('edit-beat-id').value = beat.id;
            document.getElementById('db-beat-name').value = beat.name;
            document.getElementById('db-beat-preview').value = beat.preview || '';
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
        document.getElementById('db-beat-preview').value = '';
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
    const mp3 = publicData.mp3 || "";
    const wav = publicData.wav || "";
    const stems = publicData.stems || "";
    
    delete publicData.mp3;
    delete publicData.wav;
    delete publicData.stems;
    
    const beatDocRef = doc(db, "users", window.currentUser, "beats", beatId);
    await setDoc(beatDocRef, {
        ...publicData,
        // Los documentos históricos pueden contener un MP3 público. Al
        // guardar el beat se retira: el delivery se conserva abajo, privado,
        // y sólo `preview` puede llegar al escaparate.
        mp3: deleteField(),
        wav: deleteField(),
        stems: deleteField()
    }, { merge: true });
    
    const privateDocRef = doc(db, "users", window.currentUser, "beats", beatId, "private", "files");
    await setDoc(privateDocRef, { mp3, wav, stems }, { merge: true });
}

export async function saveBeat() {
    const id = document.getElementById('edit-beat-id').value;
    const name = document.getElementById('db-beat-name').value.trim();
    const mp3 = document.getElementById('db-beat-mp3').value.trim();
    const preview = document.getElementById('db-beat-preview').value.trim();
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
    const existingBeat = id
        ? window.localBeats.find(beat => String(beat.id) === String(id))
        : null;
    const beatData = preserveSaleStatus(existingBeat, {
        id: beatId,
        name,
        preview,
        mp3,
        wav,
        stems,
        artwork,
        bpm,
        key,
        genre,
        tags,
        updatedAt: Date.now()
    });

    if (id) {
        const index = window.localBeats.findIndex(b => b.id === id);
        if (index !== -1) window.localBeats[index] = beatData;
    } else {
        window.localBeats.push(beatData);
    }

    try {
        saveLocalBeatCatalog();
        
        await saveBeatToFirestore(beatData);
        
        if (typeof window.showToast === 'function') {
            window.showToast(
                mp3 ? (id ? 'Beat actualizado' : 'Nuevo beat guardado') : 'Beat guardado, pero falta el archivo MP3',
                !mp3
            );
        }
        closeBeatForm();
        refreshBeatCatalogViews();
    } catch (e) {
        console.error('Error saving beat:', e);
        if (typeof window.showToast === 'function') window.showToast('Error al guardar el beat en la base de datos', true);
    }
}

export async function retireBeat(id) {
    const beatId = String(id || '').trim();
    if (!beatId || !window.currentUser || beatsChangingSaleStatus.has(beatId)) return;

    const beat = Array.isArray(window.localBeats)
        ? window.localBeats.find(candidate => String(candidate.id) === beatId)
        : null;
    if (!beat || isBeatRetired(beat)) return;
    if (!confirm(`¿Dar de baja "${beat.name || 'este beat'}"? Dejará de aparecer en la tienda y en el catálogo activo, pero sus archivos se conservarán para que puedas restaurarlo.`)) return;

    beatsChangingSaleStatus.add(beatId);
    const availabilityControls = Array.from(document.querySelectorAll('[data-beat-availability-id]'))
        .filter(button => button.dataset.beatAvailabilityId === beatId);
    availabilityControls.forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    });

    try {
        const changedAt = Date.now();
        await setDoc(doc(db, 'users', window.currentUser, 'beats', beatId), {
            published: false,
            retiredAt: changedAt,
            retiredReason: 'manual',
            updatedAt: changedAt
        }, { merge: true });

        window.localBeats = window.localBeats.map(candidate => (
            String(candidate.id) === beatId
                ? { ...candidate, published: false, retiredAt: changedAt, retiredReason: 'manual', updatedAt: changedAt }
                : candidate
        ));
        saveLocalBeatCatalog();

        refreshBeatCatalogViews();
        if (typeof window.showToast === 'function') window.showToast('Beat dado de baja. Puedes restaurarlo desde la sección Dados de baja.');
    } catch (e) {
        console.error('Error retiring beat:', e);
        if (typeof window.showToast === 'function') window.showToast('No se pudo dar de baja el beat. Sigue activo en tu catálogo.', true);
    } finally {
        beatsChangingSaleStatus.delete(beatId);
        availabilityControls.forEach(button => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });
    }
}

// Conserva la API previa para enlaces, botones o automatizaciones que aún
// invoquen deleteBeat. Desde ahora es una baja reversible, nunca borra archivos.
export async function deleteBeat(id) {
    return retireBeat(id);
}

export async function restoreBeat(id) {
    const beatId = String(id || '').trim();
    if (!beatId || !window.currentUser || beatsChangingSaleStatus.has(beatId)) return;

    const beat = Array.isArray(window.localBeats)
        ? window.localBeats.find(candidate => String(candidate.id) === beatId)
        : null;
    if (!beat || !isBeatRetired(beat)) return;

    beatsChangingSaleStatus.add(beatId);
    const availabilityControls = Array.from(document.querySelectorAll('[data-beat-availability-id]'))
        .filter(button => button.dataset.beatAvailabilityId === beatId);
    availabilityControls.forEach(button => {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
    });

    try {
        const changedAt = Date.now();
        await setDoc(doc(db, 'users', window.currentUser, 'beats', beatId), {
            published: true,
            isPublished: deleteField(),
            retiredAt: deleteField(),
            retiredReason: deleteField(),
            restoredAt: changedAt,
            updatedAt: changedAt
        }, { merge: true });

        window.localBeats = window.localBeats.map(candidate => {
            if (String(candidate.id) !== beatId) return candidate;
            const restoredBeat = { ...candidate, published: true, restoredAt: changedAt, updatedAt: changedAt };
            delete restoredBeat.isPublished;
            delete restoredBeat.retiredAt;
            delete restoredBeat.retiredReason;
            return restoredBeat;
        });
        saveLocalBeatCatalog();

        refreshBeatCatalogViews();
        if (typeof window.showToast === 'function') window.showToast('Beat restaurado. Vuelve a estar disponible en tu catálogo y tienda.');
    } catch (e) {
        console.error('Error restoring beat:', e);
        if (typeof window.showToast === 'function') window.showToast('No se pudo restaurar el beat. Sigue dado de baja.', true);
    } finally {
        beatsChangingSaleStatus.delete(beatId);
        availabilityControls.forEach(button => {
            button.disabled = false;
            button.removeAttribute('aria-busy');
        });
    }
}

export function selectBeat(id) {
    const beat = window.localBeats.find(b => String(b.id) === String(id));
    if (!beat || isBeatRetired(beat)) {
        if (typeof window.showToast === 'function') window.showToast('Ese beat está dado de baja. Restáuralo antes de usarlo en una licencia.', true);
        return;
    }

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
    
    let filtered = activeCatalogBeats();
    if (searchQuery) {
        filtered = filtered.filter((beat) => (beat.name || '').toLowerCase().includes(searchQuery));
    }

    filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    if (filtered.length === 0) {
        const isSearching = Boolean(searchQuery);
        listContainer.innerHTML = `
            <div class="ledger-beats-empty">
                <span aria-hidden="true"><i data-lucide="music-2"></i></span>
                <strong>${isSearching ? 'No hay coincidencias' : 'Todavía no hay beats disponibles'}</strong>
                <p>${isSearching ? 'Prueba con otro nombre o borra la búsqueda.' : 'Crea un beat para usarlo inmediatamente en este contrato.'}</p>
                ${isSearching ? '' : '<button type="button" class="ledger-beats-empty-action">Crear un beat</button>'}
            </div>`;
        listContainer.querySelector('.ledger-beats-empty-action')?.addEventListener('click', openBeatForm);
        if (typeof window.safeCreateIcons === 'function') window.safeCreateIcons();
        return;
    }

    listContainer.innerHTML = '';
    filtered.forEach(beat => {
        const item = document.createElement('article');
        item.className = 'ledger-beat-picker-row';
        
        let linksCount = 0;
        if (beat.mp3) linksCount++;
        if (beat.wav) linksCount++;
        if (beat.stems) linksCount++;

        const linksBadge = linksCount > 0
            ? `<span class="ledger-beat-files"><i data-lucide="paperclip" aria-hidden="true"></i>${linksCount} archivo${linksCount === 1 ? '' : 's'}</span>`
            : '';

        const finalArtworkUrl = typeof window.getBeatArtwork === 'function' ? window.getBeatArtwork(beat) : '';
        const artworkImg = finalArtworkUrl
            ? `<img src="${sanitizeHtml(finalArtworkUrl)}" alt="Portada de ${sanitizeHtml(beat.name || 'beat')}">`
            : `<i data-lucide="music-2" aria-hidden="true"></i>`;

        const details = [
            beat.bpm ? `${sanitizeHtml(beat.bpm)} BPM` : '',
            beat.key ? sanitizeHtml(beat.key) : '',
            beat.genre ? sanitizeHtml(beat.genre) : ''
        ].filter(Boolean);
        const detailsHtml = details.length ? `<span class="ledger-beat-meta">${details.join('<span aria-hidden="true">·</span>')}</span>` : '<span class="ledger-beat-meta">Sin datos musicales adicionales</span>';
        const beatName = sanitizeHtml(beat.name || 'Beat sin título');

        item.innerHTML = `
            <button type="button" class="ledger-beat-picker-main" aria-label="Usar ${beatName} para el contrato">
                <span class="ledger-beat-artwork">${artworkImg}</span>
                <span class="ledger-beat-copy">
                    <span class="ledger-beat-name">${beatName} ${linksBadge}</span>
                    ${detailsHtml}
                </span>
            </button>
            <div class="ledger-beat-picker-actions">
                <button type="button" class="ledger-beat-use">Usar <i data-lucide="arrow-up-right" aria-hidden="true"></i></button>
                <button type="button" class="ledger-beat-icon-action" aria-label="Editar ${beatName}" title="Editar"><i data-lucide="pencil" aria-hidden="true"></i></button>
                <button type="button" class="ledger-beat-icon-action is-danger" data-beat-availability-id="${sanitizeHtml(beat.id)}" aria-label="Dar de baja ${beatName}" title="Dar de baja"><i data-lucide="archive" aria-hidden="true"></i></button>
            </div>
        `;

        const useBeat = () => selectBeat(beat.id);
        item.querySelector('.ledger-beat-picker-main').addEventListener('click', useBeat);
        item.querySelector('.ledger-beat-use').addEventListener('click', useBeat);
        item.querySelectorAll('.ledger-beat-icon-action')[0].addEventListener('click', () => openBeatForm(beat.id));
        item.querySelectorAll('.ledger-beat-icon-action')[1].addEventListener('click', () => retireBeat(beat.id));
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
            contentType: file.type,
            fileSize: file.size
        })
    });
    
    if (!sessionRes.ok) {
        let errMsg = 'No se pudo iniciar la sesión de subida en Google Drive Central.';
        try {
            const sessionErr = await sessionRes.json();
            errMsg = sessionErr.error ? (sessionErr.error + (sessionErr.details ? `: ${sessionErr.details}` : "")) : errMsg;
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

        if (activeUploadInProgress) {
            if (typeof window.showToast === 'function') {
                window.showToast('Espera a que termine la subida actual antes de elegir otro archivo.', true);
            }
            return;
        }
        
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

        const targetId = activeUploadTarget;
        const targetLabel = uploadTargetLabel(targetId);
        const isMp3Target = targetId.includes('mp3') || targetId.includes('preview');
        const isWavTarget = targetId.includes('wav');
        const looksLikeMp3 = file.type === 'audio/mpeg' || /\.mp3$/i.test(file.name);
        const looksLikeWav = /^audio\/(wav|x-wav|wave|vnd\.wave)$/i.test(file.type) || /\.wav$/i.test(file.name);
        if (isMp3Target && !looksLikeMp3) {
            setUploadStatus(targetId, 'error', 'Selecciona un archivo MP3 válido para la previsualización.');
            if (typeof window.showToast === 'function') window.showToast('El archivo seleccionado no es un MP3.', true);
            fileUploader.value = '';
            return;
        }
        if (isWavTarget && !looksLikeWav) {
            setUploadStatus(targetId, 'error', 'Selecciona un archivo WAV válido para este campo.');
            if (typeof window.showToast === 'function') window.showToast('El archivo seleccionado no es un WAV.', true);
            fileUploader.value = '';
            return;
        }

        if (file.size === 0) {
            setUploadStatus(targetId, 'error', 'El archivo está vacío. Elige otro archivo e inténtalo de nuevo.');
            if (typeof window.showToast === 'function') window.showToast('El archivo está vacío.', true);
            fileUploader.value = '';
            return;
        }

        activeUploadInProgress = true;
        setUploadStatus(targetId, 'loading', `Subiendo ${targetLabel}… no cierres este formulario.`);

        const originalBtnHTML = activeUploadButton.innerHTML;
        
        activeUploadButton.disabled = true;
        activeUploadButton.style.opacity = '0.7';
        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando...`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const config = window.producerConfig || {};
            const storageProvider = resolveBeatStorageProvider(config);

            // Si el proveedor preferido es Firebase Storage (firebase),
            // subimos de forma nativa a Firebase Storage para evitar exponer tokens al cliente.
            if (storageProvider === 'firebase') {
                activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Conectando Firebase...`;
                const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `beats/${window.currentUser || 'anonymous'}/${Date.now()}_${safeFileName}`;
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
                setUploadStatus(targetId, 'success', `${targetLabel} listo. Ahora pulsa “Guardar Beat” para conservarlo en el catálogo.`);
                
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
                activeUploadInProgress = false;
                return;
            }
            
            let downloadURL;
            let uploadSuccess = false;
            let detailedError = "";

            if (storageProvider === 'alternative') {
                const progress = (percent) => {
                    activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${percent}%`;
                    if (window.lucide) window.lucide.createIcons();
                };
                if (isWavTarget || targetId.includes('stems')) {
                    try {
                        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo a almacenamiento seguro...`;
                        if (window.lucide) window.lucide.createIcons();
                        downloadURL = await uploadToFirebaseAudioStorage(file, progress);
                        uploadSuccess = true;
                    } catch (firebaseErr) {
                        detailedError = `Firebase: ${firebaseErr.message}`;
                    }
                }
                if (!uploadSuccess) {
                    try {
                        downloadURL = await uploadAudioToAlternativeCloud(file);
                        uploadSuccess = true;
                    } catch (alternativeErr) {
                        detailedError += `${detailedError ? ' | ' : ''}Alternativo: ${alternativeErr.message}`;
                    }
                }
                if (!uploadSuccess) {
                    try {
                        downloadURL = await uploadToFirebaseAudioStorage(file, progress);
                        uploadSuccess = true;
                    } catch (firebaseErr) {
                        detailedError += `${detailedError ? ' | ' : ''}Firebase: ${firebaseErr.message}`;
                    }
                }
            } else if (storageProvider === 'gdrive-central') {
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
                    console.warn('Google Drive Central no estuvo disponible; se usará Firebase como respaldo seguro.', driveErr);
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

            // El Drive central usa Firebase como respaldo seguro. Los servidores
            // alternativos se reservan para productores que los eligieron.
            if (!uploadSuccess && storageProvider !== 'alternative') {
                try {
                    activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Usando respaldo seguro...`;
                    if (window.lucide) window.lucide.createIcons();
                    downloadURL = await uploadToFirebaseAudioStorage(file, (progress) => {
                        activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Respaldo... ${progress}%`;
                        if (window.lucide) window.lucide.createIcons();
                    });
                    uploadSuccess = true;
                } catch (firebaseErr) {
                    detailedError += `${detailedError ? ' | ' : ''}Firebase: ${firebaseErr.message}`;
                }
            }

            if (!uploadSuccess) {
                throw new Error("No se pudo subir el archivo: " + detailedError);
            }

            const targetInput = document.getElementById(activeUploadTarget);
            if (targetInput) {
                targetInput.value = downloadURL;
                targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                
                if (typeof window.generatePreview === 'function') {
                    window.generatePreview();
                }
            }
            
            const providerLabel = downloadURL?.includes('firebasestorage.googleapis.com')
                ? 'el respaldo seguro de Firebase'
                : storageProvider === 'alternative' || downloadURL?.includes('pixeldrain') ||
                downloadURL?.includes('tmpfiles') || downloadURL?.includes('gofile') ||
                downloadURL?.includes('file.io')
                ? 'un servidor alternativo'
                : 'Google Drive';
            if (typeof window.showToast === 'function') window.showToast(`¡Archivo guardado en ${providerLabel} con éxito!`);
            setUploadStatus(targetId, 'success', `${targetLabel} listo. Ahora pulsa “Guardar Beat” para conservarlo en el catálogo.`);
            
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
            activeUploadInProgress = false;

        } catch (finalErr) {
            console.error("Fallo general de subida de archivo:", finalErr);
            const readableError = finalErr?.message || 'Error desconocido de almacenamiento';
            if (typeof window.showToast === 'function') {
                window.showToast(`No se pudo subir ${targetLabel}: ${readableError}`, true);
            }
            
            activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo...`;
            if (window.lucide) window.lucide.createIcons();

            try {
                const downloadURL = await uploadToFirebaseAudioStorage(file, (percent) => {
                    activeUploadButton.innerHTML = `<i data-lucide="loader-2" class="animate-spin" style="width: 14px; height: 14px; display: inline-block; margin-right: 4px;"></i> Subiendo... ${percent}%`;
                    if (window.lucide) window.lucide.createIcons();
                });
                
                const targetInput = document.getElementById(activeUploadTarget);
                if (targetInput) {
                    targetInput.value = downloadURL;
                    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
                    if (typeof window.generatePreview === 'function') {
                        window.generatePreview();
                    }
                }
                
                if (typeof window.showToast === 'function') window.showToast("¡Archivo guardado en servidor alternativo!");
                setUploadStatus(targetId, 'success', `${targetLabel} listo. Ahora pulsa “Guardar Beat” para conservarlo en el catálogo.`);
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
                activeUploadInProgress = false;
            } catch (altErr) {
                console.error("Error al subir a servidores alternativos:", altErr);
                const fallbackError = altErr?.message || readableError;
                if (typeof window.showToast === 'function') window.showToast(`Error al subir ${targetLabel}: ${fallbackError}`, true);
                setUploadStatus(targetId, 'error', `No se pudo subir el ${targetLabel}: ${fallbackError}`);
                activeUploadButton.disabled = false;
                activeUploadButton.style.opacity = '1';
                activeUploadButton.innerHTML = originalBtnHTML;
                if (window.lucide) window.lucide.createIcons();
                activeUploadInProgress = false;
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
        'tab-db-beat-preview', 'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-preview', 'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
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
        'tab-db-beat-preview', 'tab-db-beat-mp3', 'tab-db-beat-wav', 'tab-db-beat-stems', 'tab-db-beat-artwork',
        'db-beat-preview', 'db-beat-mp3', 'db-beat-wav', 'db-beat-stems', 'db-beat-artwork',
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

    // GoFile entrega una página HTML de descarga, no una URL de audio estable.
    // Guardarla como si fuera MP3 hace que la preescucha y la entrega fallen
    // después de que el beat ya fue publicado. No se usa como respaldo.

    throw new Error('No se pudo subir el audio a un proveedor con enlace directo reproducible. Intenta de nuevo en unos segundos.');
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

    activeCatalogBeats().forEach(b => {
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

const SOSSA_CATALOG_EMAILS = new Set([
    'admin@sossamusic.com',
    'masterjuego25@gmail.com',
    'sossabeatz1@gmail.com',
    'sossamusicbusiness@gmail.com'
]);

function isUsableArtwork(value) {
    const artwork = String(value || '').trim().replace(/^["']|["']$/g, '');
    return Boolean(
        artwork &&
        !/^(null|undefined|none)$/i.test(artwork) &&
        !artwork.toLowerCase().includes('placeholder')
    );
}

export function resolveWorkspaceBeatArtwork(beat) {
    if (isUsableArtwork(beat?.artwork)) return String(beat.artwork).trim();

    const config = window.producerConfig || {};
    const configuredArtwork = config.defaultBeatArtworkUrl || config.defaultBeatArtwork;
    if (isUsableArtwork(configuredArtwork)) return String(configuredArtwork).trim();

    const producerEmail = String(config.email || window.currentUserEmail || '').trim().toLowerCase();
    const producerAlias = String(config.aka || config.name || '').trim().toLowerCase();
    const isSossaCatalog = producerAlias.includes('sossa') || SOSSA_CATALOG_EMAILS.has(producerEmail);
    if (isSossaCatalog) return '/beat-thumbnail-sossa.jpg';

    if (isUsableArtwork(config.logoBase64 || config.logo)) {
        return String(config.logoBase64 || config.logo).trim();
    }

    return '/logo.png';
}

export function renderRetiredBeats(beats = []) {
    const section = document.getElementById('tab-retired-beats-section');
    const grid = document.getElementById('tab-retired-beats-grid');
    const count = document.getElementById('tab-retired-beats-count');
    if (!section || !grid || !count) return;

    const retiredBeats = Array.isArray(beats) ? [...beats] : [];
    retiredBeats.sort((a, b) => (b.retiredAt || b.updatedAt || 0) - (a.retiredAt || a.updatedAt || 0));
    count.textContent = retiredBeats.length;
    section.hidden = retiredBeats.length === 0;
    grid.innerHTML = '';

    retiredBeats.forEach(beat => {
        const card = document.createElement('article');
        card.className = 'tab-retired-beat-card';

        const safeBeatId = String(beat.id || '').replace(/[^A-Za-z0-9_-]/g, '');
        const safeBeatName = sanitizeHtml(beat.name || 'Beat sin nombre');
        const artwork = sanitizeHtml(resolveWorkspaceBeatArtwork(beat));
        const retiredDate = Number.isFinite(Number(beat.retiredAt))
            ? new Intl.DateTimeFormat('es-EC', { dateStyle: 'medium' }).format(new Date(Number(beat.retiredAt)))
            : 'Fecha no registrada';

        card.innerHTML = `
            <img src="${artwork}" alt="Portada de ${safeBeatName}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/logo.png'">
            <div class="tab-retired-beat-copy">
                <span class="tab-retired-beat-status"><i data-lucide="archive" aria-hidden="true"></i>DADO DE BAJA</span>
                <h3>${safeBeatName}</h3>
                <p>${beat.bpm ? `${sanitizeHtml(beat.bpm)} BPM · ` : ''}${retiredDate}</p>
                <small>No aparece en la tienda ni puede usarse en nuevas licencias.</small>
            </div>
            <div class="tab-retired-beat-actions">
                <button type="button" class="btn tab-retired-beat-restore" data-beat-availability-id="${safeBeatId}" onclick="window.restoreBeat('${safeBeatId}')"><i data-lucide="rotate-ccw" aria-hidden="true"></i><span>Restaurar</span></button>
                <button type="button" class="btn tab-retired-beat-edit" onclick="window.openTabBeatForm('${safeBeatId}')" title="Editar ${safeBeatName}" aria-label="Editar ${safeBeatName}"><i data-lucide="edit-2" aria-hidden="true"></i></button>
            </div>
        `;
        grid.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function renderBeatsGrid() {
    const gridContainer = document.getElementById('tab-beats-grid');
    const emptyState = document.getElementById('tab-beats-empty');
    if (!gridContainer) return;

    const searchQuery = document.getElementById('tab-search-beats')?.value.toLowerCase().trim() || '';
    const genreFilter = document.getElementById('tab-filter-genre')?.value || '';
    const keyFilter = document.getElementById('tab-filter-key')?.value || '';
    const activeBeats = activeCatalogBeats();
    const retiredBeats = (Array.isArray(window.localBeats) ? window.localBeats : [])
        .filter(beat => isBeatRetired(beat));

    let filtered = [...activeBeats];

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
    
    const totalLabel = document.getElementById('tab-stats-total');
    if (totalLabel) totalLabel.textContent = activeBeats.length;

    const mp3Count = activeBeats.filter(b => b.mp3 && b.mp3.trim() !== '').length;
    const wavCount = activeBeats.filter(b => b.wav && b.wav.trim() !== '').length;
    const stemsCount = activeBeats.filter(b => b.stems && b.stems.trim() !== '').length;

    const mp3El = document.getElementById('tab-stats-mp3');
    const wavEl = document.getElementById('tab-stats-wav');
    const stemsEl = document.getElementById('tab-stats-stems');

    if (mp3El) mp3El.textContent = mp3Count;
    if (wavEl) wavEl.textContent = wavCount;
    if (stemsEl) stemsEl.textContent = stemsCount;

    renderRetiredBeats(retiredBeats);

    if (filtered.length === 0) {
        gridContainer.innerHTML = '';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (emptyState) emptyState.style.display = 'none';
    gridContainer.innerHTML = '';

    filtered.forEach(beat => {
        const card = document.createElement('article');
        card.className = 'tab-beat-card';

        const finalArtworkUrl = resolveWorkspaceBeatArtwork(beat);
        const safeBeatName = sanitizeHtml(beat.name || 'Beat sin nombre');
        const artworkHtml = `<img src="${sanitizeHtml(finalArtworkUrl)}" class="tab-beat-artwork" alt="Portada de ${safeBeatName}" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='/logo.png'">`;

        let tagsHtml = '';
        if (beat.tags) {
            tagsHtml = beat.tags.split(',')
                .map(t => `<span class="tab-beat-tag">#${sanitizeHtml(t.trim())}</span>`)
                .join('');
        }

        const hasPreview = Boolean(beat.preview && beat.preview.trim());
        const hasMp3 = Boolean(beat.mp3 && beat.mp3.trim());
        const hasWav = Boolean(beat.wav && beat.wav.trim());
        const hasStems = Boolean(beat.stems && beat.stems.trim());
        const isPlaying = hasMp3 && window.currentPlayingBeatId === beat.id && window.currentPlayingAudio && !window.currentPlayingAudio.paused;
        const playIcon = isPlaying ? 'pause' : 'play';
        const playingClass = isPlaying ? 'playing active' : '';
        const fileStatus = [
            ['PREVIEW', hasPreview],
            ['MP3', hasMp3],
            ['WAV', hasWav],
            ['STEMS', hasStems]
        ].map(([label, available]) => `
            <span class="tab-beat-file-status ${available ? 'is-ready' : 'is-missing'}">
                <i data-lucide="${available ? 'check' : 'minus'}" aria-hidden="true"></i>${label}
            </span>
        `).join('');

        card.innerHTML = `
            <div class="tab-beat-artwork-container">
                ${artworkHtml}
                <span class="tab-beat-cover-label">BEATSS</span>
                <button type="button" class="tab-beat-play-btn ${playingClass}" aria-label="${hasMp3 ? `${isPlaying ? 'Pausar' : 'Reproducir'} ${safeBeatName}` : `Vista previa no disponible para ${safeBeatName}`}" ${hasMp3 ? `onclick="window.togglePlayBeat('${beat.id}', '${beat.mp3}')"` : 'disabled aria-disabled="true" title="Sube un MP3 para activar la previsualización"'}>
                    <i data-lucide="${playIcon}" aria-hidden="true"></i>
                </button>
            </div>
            <div class="tab-beat-info">
                <span class="tab-beat-kicker">INSTRUMENTAL</span>
                <button type="button" class="tab-beat-title" onclick="window.selectBeatForContract('${beat.id}')" aria-label="Usar ${safeBeatName} para el contrato">${safeBeatName}</button>
                <div class="tab-beat-meta">
                    ${beat.bpm ? `<span><strong>${sanitizeHtml(beat.bpm)}</strong> BPM</span>` : '<span>BPM pendiente</span>'}
                    ${beat.key ? `<span>${sanitizeHtml(beat.key)}</span>` : '<span>Tono pendiente</span>'}
                    ${beat.genre ? `<span>${sanitizeHtml(beat.genre)}</span>` : '<span>Género pendiente</span>'}
                </div>
                <div class="tab-beat-tags-container">
                    ${tagsHtml}
                </div>
                <div class="tab-beat-file-row" aria-label="Archivos disponibles">${fileStatus}</div>
            </div>
            <div class="tab-beat-actions">
                <button type="button" class="btn tab-beat-use" onclick="window.selectBeatForContract('${beat.id}')"><i data-lucide="file-signature" aria-hidden="true"></i><span>Usar en licencia</span></button>
                <button type="button" class="btn tab-beat-edit" onclick="window.openTabBeatForm('${beat.id}')" title="Editar ${safeBeatName}" aria-label="Editar ${safeBeatName}"><i data-lucide="edit-2" aria-hidden="true"></i></button>
                <button type="button" class="btn tab-beat-delete" data-beat-availability-id="${sanitizeHtml(beat.id)}" onclick="window.retireBeat('${beat.id}')" title="Dar de baja ${safeBeatName}" aria-label="Dar de baja ${safeBeatName}"><i data-lucide="archive" aria-hidden="true"></i></button>
            </div>
        `;

        gridContainer.appendChild(card);
    });

    if (window.lucide) window.lucide.createIcons();
}

export function selectBeatForContract(id) {
    const beat = window.localBeats.find(candidate => String(candidate.id) === String(id));
    if (!beat || isBeatRetired(beat)) {
        selectBeat(id);
        return;
    }
    selectBeat(id);
    document.querySelector('.tab-btn[data-tab="tab-preview"]').click();
}

export function openTabBeatForm(editId = null) {
    const formSection = document.querySelector('#tab-beats .beats-form-section');
    formSection?.classList.add('is-open');
    document.getElementById('tab-beat-form-empty-state').style.display = 'none';
    document.getElementById('tab-beat-form-fields').style.display = 'block';
    clearUploadStatus('tab-db-beat-preview');
    clearUploadStatus('tab-db-beat-mp3');

    if (editId) {
        const beat = window.localBeats.find(b => String(b.id) === String(editId));
        if (beat) {
            document.getElementById('tab-beat-form-title').innerText = 'Editar Beat: ' + beat.name;
            document.getElementById('tab-edit-beat-id').value = beat.id;
            document.getElementById('tab-db-beat-name').value = beat.name || '';
            document.getElementById('tab-db-beat-preview').value = beat.preview || '';
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
        document.getElementById('tab-db-beat-preview').value = '';
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

    if (window.matchMedia?.('(max-width: 760px)').matches) {
        requestAnimationFrame(() => formSection?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
}

export function closeTabBeatForm() {
    document.querySelector('#tab-beats .beats-form-section')?.classList.remove('is-open');
    document.getElementById('tab-beat-form-empty-state').style.display = 'block';
    document.getElementById('tab-beat-form-fields').style.display = 'none';
}

export async function saveTabBeat() {
    const id = document.getElementById('tab-edit-beat-id').value;
    const name = document.getElementById('tab-db-beat-name').value.trim();
    const mp3 = document.getElementById('tab-db-beat-mp3').value.trim();
    const preview = document.getElementById('tab-db-beat-preview').value.trim();
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
    const existingBeat = id
        ? window.localBeats.find(beat => String(beat.id) === String(id))
        : null;
    const beatData = preserveSaleStatus(existingBeat, {
        id: beatId,
        name,
        preview,
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
    });

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
        saveLocalBeatCatalog();
        
        await saveBeatToFirestore(beatData);
        
        if (typeof window.showToast === 'function') {
            window.showToast(
                mp3 ? (id ? 'Beat actualizado' : 'Nuevo beat guardado') : 'Beat guardado, pero falta el archivo MP3',
                !mp3
            );
        }
        closeTabBeatForm();
        refreshBeatCatalogViews();
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

// El catálogo público no debe depender del módulo de checkout para resolver
// una portada. Checkout reemplaza esta función con su versión completa cuando
// se abre una compra, pero explorar beats sólo requiere esta resolución segura.
export function resolvePublicBeatArtwork(beat) {
    if (!beat) return '';
    const config = beat.producerConfig && Object.keys(beat.producerConfig).length > 0
        ? beat.producerConfig
        : (window.storeProducerConfig || {});
    const configuredArtwork = config.defaultBeatArtworkUrl || config.defaultBeatArtwork;
    if (typeof configuredArtwork === 'string' && configuredArtwork.trim()) {
        return configuredArtwork.trim();
    }

    const artwork = String(beat.artwork || '').trim().replace(/^["']|["']$/g, '');
    if (artwork && !/^(null|undefined|none)$/i.test(artwork) && !artwork.toLowerCase().includes('placeholder')) {
        return artwork;
    }

    const logo = window.getProducerAvatar?.(config) || config.logoBase64 || '';
    if (typeof logo === 'string' && logo.trim()) return logo.trim();

    const accent = document.documentElement.style.getPropertyValue('--accent').trim() || '#00ccff';
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#11121a"/><path d="M42 65V35l26-4v30" fill="none" stroke="${accent}" stroke-width="4" stroke-linecap="round"/><circle cx="35" cy="65" r="7" fill="${accent}"/><circle cx="61" cy="61" r="7" fill="${accent}"/></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(fallback)}`;
}

if (typeof window.getBeatArtwork !== 'function') {
    window.getBeatArtwork = resolvePublicBeatArtwork;
}

export async function initGlobalCatalog() {
    console.log("🌍 Cargando Catálogo Global de BEATSS (Paginado)...");
    window.stateManager.setState('isGlobalCatalogMode', true);
    window.stateManager.setState('isPublicStoreMode', false);

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
        // El catálogo global es público y el endpoint limita explícitamente
        // su frescura a 60 segundos. Dejar que el navegador respete esa
        // política evita reconstruir la misma grilla al volver a la ruta,
        // sin conservar la configuración de pago individual del checkout.
        const response = await fetch('/api/public-catalog');
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !Array.isArray(payload.beats)) {
            throw new Error(payload.error || 'No se pudo cargar el catálogo.');
        }

        const producerConfigs = payload.producers && typeof payload.producers === 'object'
            ? payload.producers
            : {};
        // Compatibilidad con respuestas previas durante la propagación de un
        // despliegue: si todavía llega la configuración embebida, se acepta,
        // pero el formato canónico la transmite una vez por productor.
        window.globalBeats = payload.beats.map((beat) => ({
            ...beat,
            producerConfig: producerConfigs[beat.producerUid] || beat.producerConfig || {}
        }));
        window.filteredGlobalBeats = [...window.globalBeats];
        window.lastGlobalBeatDoc = null;
        window.globalProducersConfig = Object.fromEntries(
            window.globalBeats
                .filter((beat) => beat?.producerUid && beat?.producerConfig)
                .map((beat) => [beat.producerUid, beat.producerConfig])
        );

        populateGlobalFilters(window.globalBeats);
        renderGlobalBeats(window.filteredGlobalBeats);
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

function getStructuredDataImage(beat) {
    const artwork = resolvePublicBeatArtwork(beat);
    return /^https:\/\//i.test(artwork) ? artwork : '';
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
            "track": beats.map((beat, index) => {
                const image = getStructuredDataImage(beat);
                return {
                    "@type": "MusicRecording",
                    "position": index + 1,
                    "name": beat.name,
                    "genre": beat.genre || "Instrumental",
                    ...(image ? { "image": image } : {}),
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
                };
            })
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

        const artwork = resolvePublicBeatArtwork(beat);
        
        const isElite = config.plan === 'elite';
        const eliteBadge = isElite ? `<span style="background: rgba(168, 85, 247, 0.12); border: 1px solid #a855f7; color: #d8b4fe; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 700; text-transform: uppercase; font-family: monospace; margin-left: 6px; box-shadow: 0 0 8px rgba(168, 85, 247, 0.25);">[ ELITE ]</span>` : '';
        
        const buyText = window.currentLang === 'es' ? 'Adquirir' : 'Acquire';
        const basicLabel = window.currentLang === 'es' ? 'Básico' : 'Basic';
        const negotiableText = window.currentLang === 'es' ? 'Negociable' : 'Negotiable';
        const safeBeatId = String(beat.id || '').replace(/[^A-Za-z0-9_-]/g, '');

        return `
            <div class="store-beat-card glass-card" style="padding: 18px; display: flex; flex-direction: column; height: 100%;">
                <button type="button" class="store-beat-cover" style="position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; cursor: pointer; display: flex; align-items: center; justify-content: center; background: #151722; border: 0; padding: 0; width: 100%;" onclick="window.playGlobalBeat('${safeBeatId}')" aria-label="Reproducir vista previa de ${sanitizeHtml(beat.name) || 'beat'}">
                    <img src='${artwork}' alt="Portada de ${sanitizeHtml(beat.name) || 'beat'}" width="640" height="640" style="width: 100%; height: 100%; object-fit: cover; object-position: top; transition: transform 0.5s ease;">
                    <span class="store-play-overlay" aria-hidden="true">
                        <span id="btn-play-global-${safeBeatId}" class="store-play-btn" aria-hidden="true" style="width: 48px; height: 48px; border-radius: 50%; background: rgba(255, 255, 255, 0.9); border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #000; transition: transform 0.2s ease; transform: scale(0.9);">
                            <i data-lucide="play" style="width: 20px; height: 20px; fill: #000; stroke: #000;"></i>
                        </span>
                    </span>
                </button>
                <div style="padding: 16px 4px 4px 4px; display: flex; flex-direction: column; flex: 1; gap: 12px; position: relative; z-index: 5;">
                    <h3 style="font-size: 18px; font-weight: 700; color: #fff; margin: 0; line-height: 1.3; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-overflow: ellipsis; min-height: 2.5em;" title="${sanitizeHtml(beat.name) || 'Beat'}">${sanitizeHtml(beat.name) || 'Beat'}</h3>
                    <div style="color: #8a91a6; font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px;">
                        <i data-lucide="user" style="width: 14px; height: 14px; color: #8b5cf6;"></i> 
                        <button type="button" style="color: #e2e8f0; cursor: pointer; text-decoration: underline; border: 0; padding: 0; background: transparent; font: inherit;" onclick="window.showAppView('store', { producer: decodeURIComponent('${encodeURIComponent(config.storeSlug || config.aka || config.name || '')}') })">${sanitizeHtml(producerName)}</button> ${eliteBadge}
                    </div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                        <span class="minimal-tag">${sanitizeHtml(beat.bpm) || '--'} BPM</span>
                        <span class="minimal-tag">KEY: ${sanitizeHtml(beat.key) || '--'}</span>
                        <span class="minimal-tag">${sanitizeHtml(beat.genre) || 'Variado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 14px; border-top: 1px solid rgba(255, 255, 255, 0.05);">
                        <div style="display: flex; flex-direction: column;">
                            <span style="font-size: 11px; color: #8a91a6; font-weight: 600; text-transform: capitalize;">${basicLabel}</span>
                            <span style="font-weight: 700; color: #fff; font-size: 17px;">${priceValue}</span>
                        </div>
                        <button type="button" class="w-28 py-2 bg-white text-black hover:bg-white/90 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5" onclick="window.openGlobalBeatCheckoutModal('${safeBeatId}')">
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

window.openGlobalBeatCheckoutModal = async function(beatId) {
    const beat = window.globalBeats.find(b => b.id === beatId);
    if (!beat) return;

    const producerAlias = beat.producerConfig?.storeSlug || beat.producerConfig?.aka || beat.producerConfig?.name || beat.producerAka || beat.producerName;
    if (!producerAlias) {
        window.showToast?.('No encontramos la tienda de este productor.', true);
        return;
    }

    try {
        // La vista global sólo lleva marca y previsualización. Al iniciar una
        // compra se solicita el catálogo individual, que contiene las cuentas
        // y métodos del productor seleccionado, nunca de todo el marketplace.
        const response = await fetch(`/api/public-store?producer=${encodeURIComponent(producerAlias)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.producerId || !Array.isArray(payload.beats)) {
            throw new Error(payload.error || 'No se pudo preparar la compra.');
        }
        const selectedBeat = payload.beats.find((item) => item.id === beatId);
        if (!selectedBeat) throw new Error('Este beat ya no está disponible.');

        window.storeBeats = payload.beats;
        window.storeProducerUid = payload.producerId;
        window.storeProducerConfig = payload.producer || {};
        window.storePaymentCapabilities = payload.paymentCapabilities || {
            stripe: false, paypal: false, payphone: false, deuna: false, transfer: false
        };
    } catch (error) {
        console.error('No se pudo cargar el checkout global:', error);
        window.showToast?.(error.message || 'No se pudo preparar la compra.', true);
        return;
    }

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
window.retireBeat = retireBeat;
window.restoreBeat = restoreBeat;
window.selectBeat = selectBeat;
window.renderBeatsList = renderBeatsList;
window.initFileUploads = initFileUploads;
window.initClearInputHandlers = initClearInputHandlers;
window.updateClearButtonsVisibility = updateClearButtonsVisibility;
window.uploadFileToDriveWithProgress = uploadFileToDriveWithProgress;
window.uploadAudioToAlternativeCloud = uploadAudioToAlternativeCloud;
window.updateGenreAndKeyFilters = updateGenreAndKeyFilters;
window.renderBeatsGrid = renderBeatsGrid;
window.renderRetiredBeats = renderRetiredBeats;
window.selectBeatForContract = selectBeatForContract;
window.openTabBeatForm = openTabBeatForm;
window.closeTabBeatForm = closeTabBeatForm;
window.saveTabBeat = saveTabBeat;
window.initGlobalCatalog = initGlobalCatalog;
window.renderGlobalBeats = renderGlobalBeats;
window.setupGlobalCatalogFilters = setupGlobalEvents;
window.playGlobalBeat = playGlobalBeat;
window.openGlobalBeatCheckoutModal = openGlobalBeatCheckoutModal;
