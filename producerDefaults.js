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
        storageProvider: "gdrive-central"
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
        gdriveClientId: "216966055009-03rjdnq87uh3h15e3qfglp2pnmos9t5k.apps.googleusercontent.com",
        storageProvider: "gdrive-central"
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
        storageProvider: "gdrive-central"
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
        storageProvider: "gdrive-central",
        plan: "inicial"
    }
};

export function getProducerDefault(email, displayName) {
    const cleanEmail = (email || "").toLowerCase();
    if (cleanEmail === 'beatscgmonarco@gmail.com') {
        return { ...PRODUCER_DEFAULTS['beatscgmonarco@gmail.com'] };
    } else if (cleanEmail === 'masterjuego25@gmail.com' || cleanEmail === 'sossabeatz1@gmail.com') {
        return { ...PRODUCER_DEFAULTS['sossa'], email: cleanEmail };
    } else if (cleanEmail === 'mistermicua@gmail.com') {
        return { ...PRODUCER_DEFAULTS['mistermicua@gmail.com'] };
    } else if (cleanEmail === 'esme420typebeat@gmail.com') {
        return { ...PRODUCER_DEFAULTS['esme420typebeat@gmail.com'] };
    } else {
        // Nuevo productor: el plan inicial coincide con las reglas de Firestore.
        // Las pruebas o mejoras de plan se activan de forma segura desde el
        // administrador o el flujo de pago, nunca desde el navegador.
        return {
            name: displayName || "Nuevo Productor",
            aka: "Productor",
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
            storageProvider: "gdrive-central",
            plan: "inicial"
        };
    }
}
