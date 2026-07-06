import fs from 'fs';
import path from 'path';

// Mock browser globals
global.window = {
    lucide: { createIcons: () => {} },
    location: { href: 'http://localhost:5173/?catalogo=1' },
    storeBeats: [
        { id: 'beat-1', name: 'Test Beat', genre: 'Trap', key: 'Am', price: 29.99 }
    ],
    storeProducerConfig: { aka: 'Test Producer' },
    paypal: null
};

// Create a robust mock document
const mockElements = {};
global.document = {
    getElementById: (id) => {
        if (!mockElements[id]) {
            mockElements[id] = {
                addEventListener: () => {},
                value: '',
                style: {},
                textContent: '',
                classList: { 
                    add: () => {}, 
                    remove: () => {},
                    contains: () => false
                },
                innerHTML: '',
                querySelector: () => null,
                querySelectorAll: () => []
            };
        }
        return mockElements[id];
    },
    querySelectorAll: () => [],
    querySelector: () => null,
    documentElement: { style: { getPropertyValue: () => '' } },
    createElement: () => ({ style: {}, setAttribute: () => {} }),
    head: { appendChild: () => {} }
};
global.localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
};

Object.defineProperty(global, 'navigator', {
    value: {
        serviceWorker: {
            getRegistrations: () => Promise.resolve([])
        }
    },
    writable: true,
    configurable: true
});

console.log("⏳ Mocks configured. Attempting to load checkout.js...");

try {
    const checkout = await import('../checkout.js');
    console.log("✅ checkout.js loaded successfully!");
    
    console.log("⏳ Calling openBeatCheckoutModal(null)...");
    checkout.openBeatCheckoutModal(null);
    console.log("✅ openBeatCheckoutModal(null) completed without crashing!");

    console.log("⏳ Calling openBeatCheckoutModal('beat-1')...");
    checkout.openBeatCheckoutModal('beat-1');
    console.log("✅ openBeatCheckoutModal('beat-1') completed without crashing!");
    
} catch (e) {
    console.error("❌ Error during test execution:", e);
}
