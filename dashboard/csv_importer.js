import { db, doc, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadContacts = (...args) => window.loadContacts(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
const saveAllContacts = (...args) => window.saveAllContacts(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const loadConsolidatedAccounting = (...args) => window.loadConsolidatedAccounting(...args);
const saveHistory = (...args) => window.saveHistory(...args);

async function saveAllBeats() {
    safeSetItem(`${window.currentUser}_beats`, JSON.stringify(window.localBeats));
    if (window.currentUserIsPro) {
        for (const beat of window.localBeats) {
            if (!beat.id) continue;
            try {
                const beatDocRef = doc(db, "users", window.currentUser, "beats", beat.id);
                await setDoc(beatDocRef, beat);
            } catch (err) {
                console.error("Error al guardar beat:", err);
            }
        }
    }
}

function handleBeatStarsCsvImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('⏳ Procesando archivo CSV...');
    const reader = new FileReader();
    reader.onload = async function(evt) {
        try {
            const text = evt.target.result;
            const rows = parseCSV(text);
            if (rows.length === 0) {
                showToast('El archivo CSV está vacío o no es válido.', true);
                return;
            }

            // Mapeos rápidos para evitar duplicados
            const existingRefs = new Set(window.licenseHistory.map(h => h.refCode));
            const existingEmails = new Set(window.contactsList.map(c => (c.email || '').toLowerCase()));
            const existingBeats = new Set(window.localBeats.map(b => (b.name || '').toLowerCase()));

            let newContactsCount = 0;
            let newBeatsCount = 0;
            let newLicensesCount = 0;

            let lastInvoice = "";
            let lastDate = "";
            let lastCustomerName = "";
            let lastCustomerEmail = "";

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                
                const invoice = row["Invoice Number"] || lastInvoice;
                const dateRaw = row["Date"] || lastDate;
                const customerName = row["Customer Name"] || lastCustomerName;
                const customerEmail = row["Customer Email"] || lastCustomerEmail;

                lastInvoice = invoice;
                lastDate = dateRaw;
                lastCustomerName = customerName;
                lastCustomerEmail = customerEmail;

                if (!invoice) continue;

                const itemName = row["Item Name"] || "";
                if (!itemName) continue;

                const cleanedBeat = cleanBeatName(itemName);
                const salePrice = parseFloat(row["Sale Price"]) || 0.0;

                // 1. Agregar Contacto
                const emailLower = (customerEmail || '').trim().toLowerCase();
                if (emailLower && !existingEmails.has(emailLower)) {
                    const newContact = {
                        name: customerName || "Comprador Beatstars",
                        email: customerEmail,
                        phone: "",
                        city: "",
                        country: "",
                        id: "",
                        updatedAt: Date.now()
                    };
                    window.contactsList.push(newContact);
                    existingEmails.add(emailLower);
                    newContactsCount++;
                }

                // 2. Agregar Beat
                const beatLower = cleanedBeat.toLowerCase();
                if (beatLower && !existingBeats.has(beatLower)) {
                    const newBeat = {
                        id: makeBeatId(cleanedBeat),
                        name: cleanedBeat,
                        mp3: "",
                        wav: "",
                        stems: "",
                        updatedAt: Date.now()
                    };
                    window.localBeats.push(newBeat);
                    existingBeats.add(beatLower);
                    newBeatsCount++;
                }

                // 3. Agregar Licencia
                let refCode = invoice;
                if (existingRefs.has(refCode)) {
                    refCode = `${invoice}-${cleanedBeat.toUpperCase().replace(/\s+/g, '_')}`;
                }

                if (!existingRefs.has(refCode)) {
                    const formattedDate = parseBeatStarsDate(dateRaw);
                    
                    let licType = "basic";
                    let formats = "MP3";
                    let streams = "100,000";
                    let physical = "3,000";
                    let videos = "1";

                    if (salePrice <= 35) {
                        licType = "basic";
                        formats = "MP3";
                        streams = "100,000";
                        physical = "3,000";
                        videos = "1";
                    } else if (salePrice <= 65) {
                        licType = "premium";
                        formats = "MP3 y WAV";
                        streams = "500,000";
                        physical = "10,000";
                        videos = "2";
                    } else {
                        licType = "premium_plus";
                        formats = "MP3, WAV y STEMS";
                        streams = "Ilimitado";
                        physical = "Ilimitado";
                        videos = "Ilimitado";
                    }

                    const currentAka = window.producerConfig.aka || "Productor";

                    const newLicense = {
                        refCode: refCode,
                        date: formattedDate,
                        beatName: cleanedBeat,
                        buyerName: customerName || "Comprador Beatstars",
                        type: licType,
                        value: salePrice > 0 ? salePrice : 30.0,
                        paymentMethod: "PayPal (Beatstars)",
                        formData: {
                            buyerId: "",
                            buyerEmail: customerEmail,
                            buyerPhone: "",
                            buyerCity: "",
                            buyerCountry: "",
                            celebrationPlace: window.producerConfig.place || "Quito, Ecuador",
                            formats: formats,
                            streams: streams,
                            physical: physical,
                            videos: videos,
                            videoDuration: licType !== "premium_plus" ? "cinco (5) minutos" : "Sin límite",
                            years: licType !== "premium_plus" ? "diez (10) años" : "Perpetuo",
                            terminationFee: `200% ($${2 * (salePrice > 0 ? Math.floor(salePrice) : 30)}.00 USD)`,
                            writerShare: 50,
                            producerShare: 50,
                            credits: `"Producido por ${currentAka}" o "Prod. por ${currentAka}"`,
                            contentId: true
                        }
                    };
                    window.licenseHistory.unshift(newLicense);
                    existingRefs.add(refCode);
                    newLicensesCount++;
                }
            }

            window.licenseHistory.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

            if (newContactsCount > 0) await saveAllContacts();
            if (newBeatsCount > 0) await saveAllBeats();
            if (newLicensesCount > 0) {
                await saveHistory();
                updateHistoryTable();
            }

            showToast(`🚀 Importación completa:\n- ${newLicensesCount} licencias\n- ${newBeatsCount} beats\n- ${newContactsCount} contactos.`);
            
            if (window.currentUserIsAdmin) {
                await loadConsolidatedAccounting();
            }

            e.target.value = '';

        } catch (err) {
            console.error('Error al procesar el archivo CSV:', err);
            showToast('Error al parsear el archivo CSV. Verifica su formato.', true);
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const result = [];
    let headers = [];
    
    let parsedHeader = false;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line === "Transactions") continue;
        
        const row = [];
        let insideQuote = false;
        let currentCell = '';
        for (let c = 0; c < line.length; c++) {
            const char = line[c];
            if (char === '"') {
                insideQuote = !insideQuote;
            } else if (char === ',' && !insideQuote) {
                row.push(currentCell.trim());
                currentCell = '';
            } else {
                currentCell += char;
            }
        }
        row.push(currentCell.trim());
        
        if (!parsedHeader) {
            headers = row.map(h => h.replace(/^"|"$/g, '').trim());
            parsedHeader = true;
        } else {
            const obj = {};
            headers.forEach((header, index) => {
                let val = row[index] || '';
                val = val.replace(/^"|"$/g, '').trim();
                obj[header] = val;
            });
            result.push(obj);
        }
    }
    return result;
}

function cleanBeatName(name) {
    if (!name) return "Beat";
    name = name.replace(/\s*\(collaborator\)\s*/gi, "");
    name = name.replace(/^type beat\s+/gi, "");
    return name.trim();
}

function makeBeatId(name) {
    const normalized = name.replace(/[^a-zA-Z0-9\s]/g, "").trim().toLowerCase();
    return "beat_" + normalized.replace(/\s+/g, "_");
}

function parseBeatStarsDate(dateStr) {
    if (!dateStr) return new Date().toISOString().split('T')[0];
    const monthsMap = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
        "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12,
        "jan": 1, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sept": 9, "oct": 10, "nov": 11, "dec": 12
    };
    const match = dateStr.match(/([A-Za-z]+)\s+(\d+),\s+(\d{4})/);
    if (match) {
        const monthName = match[1].toLowerCase();
        const day = parseInt(match[2], 10);
        const year = parseInt(match[3], 10);
        const monthNum = monthsMap[monthName] || 1;
        return `${year}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    return new Date().toISOString().split('T')[0];
}


// Bindings to global scope for backward compatibility
window.saveAllBeats = saveAllBeats;
window.handleBeatStarsCsvImport = handleBeatStarsCsvImport;
window.parseCSV = parseCSV;
window.cleanBeatName = cleanBeatName;
window.makeBeatId = makeBeatId;
window.parseBeatStarsDate = parseBeatStarsDate;
