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
        plan: "elite",
        expirationPro: "2036-12-31T23:59:59.000Z"
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
        // Nuevo productor (7-Day Pro Trial)
        const now = new Date();
        const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
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
            plan: "pro",
            expirationPro: sevenDaysLater.toISOString(),
            trialStartedAt: now.toISOString()
        };
    }
}
