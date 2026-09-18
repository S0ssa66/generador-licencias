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
        '../dashboard_modules/history.js',
        '../dashboard_modules/contacts.js',
        '../dashboard_modules/csv_importer.js',
        '../dashboard_modules/charts.js',
        '../dashboard_modules/accounting.js',
        '../dashboard_modules/sales.js'
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
