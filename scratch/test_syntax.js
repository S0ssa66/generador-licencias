globalThis.window = {
    currentLang: 'es',
    currentUser: 'test_uid',
    currentUserIsAdmin: true,
    currentUserIsPro: true,
    showToast: () => {},
    loadScript: () => Promise.resolve(),
    sanitizeHtml: (x) => x,
    licenseHistory: [],
    contactsList: [],
    localBeats: [],
    producerConfig: {}
};
globalThis.document = {
    getElementById: () => ({ addEventListener: () => {}, value: '', style: {} }),
    querySelectorAll: () => []
};

async function test() {
    const modules = [
        '../dashboard/history.js',
        '../dashboard/contacts.js',
        '../dashboard/csv_importer.js',
        '../dashboard/charts.js',
        '../dashboard/accounting.js',
        '../dashboard/sales.js'
    ];
    for (const m of modules) {
        try {
            console.log(`Loading ${m}...`);
            await import(m);
            console.log(`Successfully loaded ${m}`);
        } catch (e) {
            console.error(`Error loading ${m}:`, e);
        }
    }
}
test();
