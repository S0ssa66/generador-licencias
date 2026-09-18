import { db, doc, collection, getDocs, setDoc, deleteDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = typeof window !== 'undefined' ? window.currentLang : 'es';
const showToast = (...args) => typeof window !== 'undefined' ? window.showToast?.(...args) : null;
// Este módulo se carga de forma diferida. No debe depender de que otro bundle
// haya creado window.sanitizeHtml antes de dibujar los contactos.
export const sanitizeHtml = (value) => {
    if (typeof window !== 'undefined' && typeof window.sanitizeHtml === 'function') {
        return window.sanitizeHtml(value);
    }

    return value == null ? '' : String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
};
const safeSetItem = (...args) => typeof window !== 'undefined' ? window.safeSetItem?.(...args) : null;
const safeCreateIcons = (...args) => typeof window !== 'undefined' ? window.safeCreateIcons?.(...args) : null;
const initTooltips = (...args) => typeof window !== 'undefined' ? window.initTooltips?.(...args) : null;

export function safeContactDocId(email) {
    return String(email || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9@_-]/g, '_')
        .slice(0, 100);
}

export function cleanContactText(value, max = 100) {
    return String(value ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, max);
}

async function loadContacts() {
    let savedList = [];
    let firestoreLoaded = false;
    if (window.currentUserIsPro) {
        try {
            const colRef = collection(db, "users", window.currentUser, "contacts");
            const querySnapshot = await getDocs(colRef);
            querySnapshot.forEach((docSnap) => {
                savedList.push(docSnap.data());
            });
            firestoreLoaded = true;
        } catch (err) {
            console.error("Error al cargar contactos de Firestore:", err);
        }
    }

    let localList = [];
    try {
        const saved = localStorage.getItem(`${window.currentUser}_contacts`);
        if (saved) {
            localList = JSON.parse(saved);
            if (!Array.isArray(localList)) localList = [];
        }
    } catch (e) {
        localList = [];
    }

    let mergedList = [...savedList];
    let needsSaveToFirestore = false;

    localList.forEach(localCont => {
        if (localCont && localCont.email) {
            const exists = mergedList.some(c => c.email && c.email.toLowerCase() === localCont.email.toLowerCase());
            if (!exists) {
                mergedList.push(localCont);
                needsSaveToFirestore = true;
            }
        }
    });

    window.contactsList = mergedList;

    if (needsSaveToFirestore) {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(window.contactsList));
        if (firestoreLoaded && window.currentUserIsPro) {
            console.log("Subiendo contactos locales combinados a Firestore...");
            for (const cont of window.contactsList) {
                if (!cont.email) continue;
                try {
                    const docId = safeContactDocId(cont.email);
                    const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                    await setDoc(contDocRef, cont);
                } catch (err) {
                    console.error("Error al guardar contacto en Firestore:", err);
                }
            }
        }
    }
}

async function autoSaveContact() {
    const rawName = document.getElementById('buyer-name')?.value || '';
    const rawEmail = document.getElementById('buyer-email')?.value || '';
    const rawId = document.getElementById('buyer-id')?.value || '';
    const rawPhone = document.getElementById('buyer-phone')?.value || '';
    const rawCity = document.getElementById('buyer-city')?.value || '';
    const rawCountry = document.getElementById('buyer-country')?.value || '';

    const name = cleanContactText(rawName, 100);
    const email = cleanContactText(rawEmail, 100).toLowerCase();
    const id = cleanContactText(rawId, 50);
    const phone = cleanContactText(rawPhone, 30);
    const city = cleanContactText(rawCity, 50);
    const country = cleanContactText(rawCountry, 50);

    // Solo guardar si se provee nombre y correo electrónico válido
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;

    const contactData = {
        name,
        email,
        updatedAt: Date.now()
    };
    if (id) contactData.id = id;
    if (phone) contactData.phone = phone;
    if (city) contactData.city = city;
    if (country) contactData.country = country;

    const index = window.contactsList.findIndex(c => c.email && c.email.toLowerCase() === email);

    if (index !== -1) {
        window.contactsList[index] = { ...window.contactsList[index], ...contactData };
    } else {
        window.contactsList.push(contactData);
    }

    try {
        safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(window.contactsList));
    } catch (e) {
        console.error('Error al guardar contactos localmente:', e);
    }

    if (!window.currentUserIsPro) return;

    // Guardar en Firestore: coleccion users/{uid}/contacts con email sanitizado como documentID
    const contactId = safeContactDocId(email);
    try {
        const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
        await setDoc(docRef, contactData);
    } catch (err) {
        console.error("Error al guardar contacto en Firestore:", err);
    }
}

async function openContactsModal() {
    await loadContacts();
    const modal = document.getElementById('contacts-modal');
    const searchInput = document.getElementById('search-contacts');

    window.contactsModalTrigger = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    modal.style.display = 'grid';
    modal.setAttribute('aria-hidden', 'false');
    searchInput.value = '';
    renderContactsTable();

    requestAnimationFrame(() => searchInput.focus({ preventScroll: true }));
}

function closeContactsModal() {
    const modal = document.getElementById('contacts-modal');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');

    if (window.contactsModalTrigger && document.contains(window.contactsModalTrigger)) {
        window.contactsModalTrigger.focus({ preventScroll: true });
    }
}

function renderContactsTable() {
    const searchQuery = document.getElementById('search-contacts').value.toLowerCase().trim();
    let contacts = [...(window.contactsList || [])];

    // Ordenar por fecha de actualización descendente (últimos modificados primero)
    contacts.sort((a, b) => b.updatedAt - a.updatedAt);

    // Filtrar si hay búsqueda
    if (searchQuery) {
        contacts = contacts.filter(c => 
            c.name.toLowerCase().includes(searchQuery) ||
            c.email.toLowerCase().includes(searchQuery) ||
            (c.id && c.id.includes(searchQuery))
        );
    }

    // Actualizar cantidad en la etiqueta
    document.getElementById('contacts-count-label').textContent = `${contacts.length} contacto(s) guardado(s)`;

    const tbody = document.getElementById('contacts-table-body');
    tbody.innerHTML = '';

    if (contacts.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="ledger-contacts-empty">
                    <span aria-hidden="true"><i data-lucide="users-round"></i></span>
                    <strong>No encontramos contactos</strong>
                    <small>Cuando guardes una venta, el comprador aparecerá aquí.</small>
                </td>
            </tr>
        `;
        safeCreateIcons();
        return;
    }

    contacts.forEach(contact => {
        const tr = document.createElement('tr');
        tr.className = 'ledger-contact-row';
        
        // Al hacer clic en la fila se selecciona el contacto (excepto si hace clic en eliminar)
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.delete-contact-btn')) return;
            selectContact(contact);
        });

        tr.innerHTML = `
            <td class="ledger-contact-identity" data-label="Contacto">
                <strong>${sanitizeHtml(contact.name)}</strong>
                <small>Cédula/DNI: ${sanitizeHtml(contact.id || 'No registrado')}</small>
            </td>
            <td class="ledger-contact-channel" data-label="Canal">
                <span>${sanitizeHtml(contact.email)}</span>
                <small>${sanitizeHtml(contact.phone || 'Sin teléfono')}</small>
            </td>
            <td class="ledger-contact-actions" data-label="Acciones">
                <button type="button" class="contact-action-btn select-contact-btn" aria-label="Usar los datos de ${sanitizeHtml(contact.name)}" title="Usar contacto">
                    <i data-lucide="check" aria-hidden="true"></i><span>Usar</span>
                </button>
                <button type="button" class="contact-action-btn delete-contact-btn" data-email="${sanitizeHtml(contact.email)}" aria-label="Eliminar a ${sanitizeHtml(contact.name)}" title="Eliminar contacto">
                    <i data-lucide="trash-2" aria-hidden="true"></i><span class="sr-only">Eliminar</span>
                </button>
            </td>
        `;
        
        tr.querySelector('.select-contact-btn').addEventListener('click', (event) => {
            event.stopPropagation();
            selectContact(contact);
        });

        tr.querySelector('.delete-contact-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteContact(contact.email);
        });

        tbody.appendChild(tr);
    });

    safeCreateIcons();
    initTooltips();
}

function selectContact(contact) {
    document.getElementById('buyer-name').value = contact.name || '';
    document.getElementById('buyer-email').value = contact.email || '';
    document.getElementById('buyer-id').value = contact.id || '';
    document.getElementById('buyer-phone').value = contact.phone || '';
    document.getElementById('buyer-city').value = contact.city || '';
    document.getElementById('buyer-country').value = contact.country || 'Ecuador';
    
    // Regenerar la previsualización
    generatePreview();
    
    // Cerrar modal
    closeContactsModal();
    showToast(`Contacto "${contact.name}" cargado con éxito`);
}

async function deleteContact(email) {
    if (confirm(`¿Estás seguro de que deseas eliminar este contacto (${email})?`)) {
        window.contactsList = window.contactsList.filter(c => c.email.toLowerCase() !== email.toLowerCase());

        try {
            safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(window.contactsList));
            renderContactsTable();
            showToast('Contacto eliminado');
        } catch (e) {
            console.error(e);
        }

        // Delete from Firestore
        const contactId = safeContactDocId(email);
        try {
            const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
            await deleteDoc(docRef);
        } catch (err) {
            console.error("Error al eliminar contacto de Firestore:", err);
        }
    }
}

async function saveAllContacts() {
    safeSetItem(`${window.currentUser}_contacts`, JSON.stringify(window.contactsList));
    if (window.currentUserIsPro) {
        for (const cont of window.contactsList) {
            if (!cont.email) continue;
            try {
                const docId = safeContactDocId(cont.email);
                const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                await setDoc(contDocRef, cont);
            } catch (err) {
                console.error("Error al guardar contacto:", err);
            }
        }
    }
}


// Bindings to global scope for backward compatibility
if (typeof window !== 'undefined') {
    window.loadContacts = loadContacts;
    window.autoSaveContact = autoSaveContact;
    window.openContactsModal = openContactsModal;
    window.closeContactsModal = closeContactsModal;
    window.renderContactsTable = renderContactsTable;
    window.selectContact = selectContact;
    window.deleteContact = deleteContact;
    window.saveAllContacts = saveAllContacts;
    window.safeContactDocId = safeContactDocId;
    window.cleanContactText = cleanContactText;
}

if (typeof document !== 'undefined') {
    document.addEventListener('keydown', (event) => {
        const modal = document.getElementById('contacts-modal');
        if (event.key === 'Escape' && modal?.getAttribute('aria-hidden') === 'false') {
            closeContactsModal();
        }
    });

    document.getElementById('contacts-modal')?.addEventListener('click', (event) => {
        if (event.target === event.currentTarget) {
            closeContactsModal();
        }
    });
}
