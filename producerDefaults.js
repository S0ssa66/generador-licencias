export const PRODUCER_DEFAULTS = {
    'beatscgmonarco@gmail.com': {
        name: "CG Monarco",
        aka: "CG Monarco",
        email: "beatscgmonarco@gmail.com",
        phone: "",
        place: "Esmeraldas - Ecuador",
        id: "",
        pro: "BMI",
        ipi: "",
        publisher: "MH Musik",
        address: "Esmeraldas - Ecuador",
        birthdate: "",
        dsClientId: "",
        dsAccountId: "",
        dsEnv: "demo",
        emailjsServiceId: "",
        emailjsTemplateId: "",
        emailjsPublicKey: "",
        gdriveClientId: "",
        storageProvider: "alternative",
        pdfStorageProvider: "firebase"
    },
    'sossa': {
        name: "Sossa",
        aka: "Sossa",
        phone: "",
        place: "Quito, Ecuador",
        id: "",
        pro: "BMI",
        ipi: "",
        publisher: "Songtrust",
        address: "Quito - Ecuador",
        birthdate: "",
        dsClientId: "",
        dsAccountId: "",
        dsEnv: "demo",
        emailjsServiceId: "",
        emailjsTemplateId: "",
        emailjsPublicKey: "",
        gdriveClientId: "",
        storageProvider: "gdrive-central",
        pdfStorageProvider: "firebase"
    },
    'mistermicua@gmail.com': {
        name: "Mister Micua",
        aka: "Mr. Micua",
        email: "mistermicua@gmail.com",
        phone: "",
        place: "Quito, Ecuador",
        id: "",
        pro: "BMI",
        ipi: "",
        publisher: "Mr. Micua Music",
        address: "Quito, Ecuador",
        birthdate: "",
        dsClientId: "",
        dsAccountId: "",
        dsEnv: "demo",
        emailjsServiceId: "",
        emailjsTemplateId: "",
        emailjsPublicKey: "",
        gdriveClientId: "",
        storageProvider: "alternative",
        pdfStorageProvider: "firebase"
    },
    'esme420typebeat@gmail.com': {
        name: "Sauce Beats",
        aka: "Sauce Beats",
        email: "esme420typebeat@gmail.com",
        phone: "",
        place: "Quito, Ecuador",
        id: "",
        pro: "BMI",
        ipi: "",
        publisher: "Sauce Beats Music",
        address: "Quito, Ecuador",
        birthdate: "",
        dsClientId: "",
        dsAccountId: "",
        dsEnv: "demo",
        emailjsServiceId: "",
        emailjsTemplateId: "",
        emailjsPublicKey: "",
        gdriveClientId: "",
        storageProvider: "alternative",
        pdfStorageProvider: "firebase",
        plan: "inicial"
    }
};

export function getProducerDefault(email, displayName) {
    const cleanEmail = (email || "").toLowerCase();
    if (cleanEmail === 'beatscgmonarco@gmail.com') {
        return { ...PRODUCER_DEFAULTS['beatscgmonarco@gmail.com'] };
    } else if (cleanEmail === 'masterjuego25@gmail.com' || cleanEmail === 'sossabeatz1@gmail.com' || cleanEmail === 'sossamusicbusiness@gmail.com') {
        return { ...PRODUCER_DEFAULTS['sossa'], email: cleanEmail };
    } else if (cleanEmail === 'mistermicua@gmail.com') {
        return { ...PRODUCER_DEFAULTS['mistermicua@gmail.com'] };
    } else if (cleanEmail === 'esme420typebeat@gmail.com') {
        return { ...PRODUCER_DEFAULTS['esme420typebeat@gmail.com'] };
    } else {
        // Nuevo productor: el plan inicial coincide con las reglas de Firestore.
        // Las pruebas o mejoras de plan se activan de forma segura desde el
        // administrador o el flujo de pago, nunca desde el navegador.
        const emailName = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
        const initialName = String(displayName || emailName || 'Nuevo Productor').trim().slice(0, 80);
        return {
            name: initialName,
            aka: initialName,
            storeSlug: "",
            email: cleanEmail,
            phone: "",
            place: "Quito, Ecuador",
            id: "",
            pro: "BMI",
            ipi: "",
            publisher: "",
            address: "",
            birthdate: "",
            dsClientId: "",
            dsAccountId: "",
            dsEnv: "demo",
            emailjsServiceId: "",
            emailjsTemplateId: "",
            emailjsPublicKey: "",
            gdriveClientId: "",
            storageProvider: "firebase",
            pdfStorageProvider: "firebase",
            plan: "inicial",
            // Arquitectura C+B con A opt-in, apagada por defecto. Sólo se
            // activa al poner EXTERNAL_PRODUCERS_ENABLED=1 en el servidor.
            paymentMode: "platform_seller",
            externalSalesEnabled: false,
            onboardingCompleted: false
        };
    }
}
