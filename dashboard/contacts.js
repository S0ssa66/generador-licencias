import { db, doc, collection, getDocs, setDoc, deleteDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);

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
                    const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
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
    const name = document.getElementById('buyer-name').value.trim();
    const email = document.getElementById('buyer-email').value.trim();
    const id = document.getElementById('buyer-id').value.trim();
    const phone = document.getElementById('buyer-phone').value.trim();
    const city = document.getElementById('buyer-city').value.trim();
    const country = document.getElementById('buyer-country').value.trim();

    // Solo guardar si se provee nombre y correo electrónico
    if (!name || !email) return;

    const contactData = {
        name,
        email,
        id,
        phone,
        city,
        country,
        updatedAt: Date.now()
    };

    const index = window.contactsList.findIndex(c => c.email.toLowerCase() === email.toLowerCase());

    if (index !== -1) {
        window.contactsList[index] = { ...contactsList[index], ...contactData };
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
    const contactId = email.toLowerCase().replace(/[/.]/g, '_');
    try {
        const docRef = doc(db, "users", window.currentUser, "contacts", contactId);
        await setDoc(docRef, contactData);
    } catch (err) {
        console.error("Error al guardar contacto en Firestore:", err);
    }
}

function openContactsModal() {
    document.getElementById('contacts-modal').style.display = 'flex';
    document.getElementById('search-contacts').value = '';
    renderContactsTable();
}

function closeContactsModal() {
    document.getElementById('contacts-modal').style.display = 'none';
}

function renderContactsTable() {
    const searchQuery = document.getElementById('search-contacts').value.toLowerCase().trim();
    let contacts = [...contactsList];

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
                <td colspan="3" style="padding: 20px; text-align: center; color: #718096;">
                    No se encontraron contactos.
                </td>
            </tr>
        `;
        return;
    }

    contacts.forEach(contact => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #2a2e39';
        tr.style.cursor = 'pointer';
        
        // Al hacer clic en la fila se selecciona el contacto (excepto si hace clic en eliminar)
        tr.addEventListener('click', (e) => {
            if (e.target.closest('.delete-contact-btn')) return;
            selectContact(contact);
        });

        tr.innerHTML = `
            <td style="padding: 10px 10px;">
                <div style="font-weight: bold; color: #fff;">${sanitizeHtml(contact.name)}</div>
                <div style="font-size: 11px; color: #718096;">Cédula/DNI: ${sanitizeHtml(contact.id || 'N/A')}</div>
            </td>
            <td style="padding: 10px 10px;">
                <div style="color: #cbd5e0;">${sanitizeHtml(contact.email)}</div>
                <div style="font-size: 11px; color: #718096;">Telf: ${sanitizeHtml(contact.phone || 'N/A')}</div>
            </td>
            <td style="padding: 10px 10px; text-align: right; white-space: nowrap;">
                <button class="btn btn-secondary contact-action-btn select-contact-btn" title="Seleccionar" style="padding: 4px 8px; font-size: 12px; margin-right: 4px; background-color: #2d3748; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="check" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="btn btn-danger-outline contact-action-btn delete-contact-btn" data-email="${sanitizeHtml(contact.email)}" title="Eliminar" style="padding: 4px 8px; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; height: 28px;">
                    <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                </button>
            </td>
        `;
        
        tr.querySelector('.select-contact-btn').addEventListener('click', () => {
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
        const contactId = email.toLowerCase().replace(/[/.]/g, '_');
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
                const docId = cont.email.toLowerCase().replace(/[/.]/g, "_");
                const contDocRef = doc(db, "users", window.currentUser, "contacts", docId);
                await setDoc(contDocRef, cont);
            } catch (err) {
                console.error("Error al guardar contacto:", err);
            }
        }
    }
}


// Bindings to global scope for backward compatibility
window.loadContacts = loadContacts;
window.autoSaveContact = autoSaveContact;
window.openContactsModal = openContactsModal;
window.closeContactsModal = closeContactsModal;
window.renderContactsTable = renderContactsTable;
window.selectContact = selectContact;
window.deleteContact = deleteContact;
window.saveAllContacts = saveAllContacts;
