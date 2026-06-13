import fs from 'fs';
import path from 'path';

// Mock essential DOM globals safely
globalThis.window = globalThis;
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};

const mockObject = (name, val) => {
    Object.defineProperty(globalThis, name, {
        value: val,
        writable: true,
        configurable: true
    });
};

const createMockElement = () => {
    const el = {
        style: {},
        classList: {
            toggle: () => {},
            contains: () => false,
            add: () => {},
            remove: () => {},
        },
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: () => {},
        removeChild: () => {},
        insertBefore: () => {},
        setAttribute: () => {},
        removeAttribute: () => {},
        getAttribute: () => '',
        hasAttribute: () => false,
        dispatchEvent: () => true,
        focus: () => {},
        click: () => {},
        remove: () => {},
        querySelector: () => createMockElement(),
        querySelectorAll: () => [],
        innerHTML: '',
        textContent: '',
        value: '',
        dataset: {},
    };
    return el;
};

mockObject('document', {
    readyState: 'complete',
    addEventListener: () => {},
    querySelector: () => createMockElement(),
    querySelectorAll: () => [],
    getElementById: () => createMockElement(),
    createElement: () => createMockElement(),
    head: createMockElement(),
    body: createMockElement(),
});

mockObject('navigator', {
    userAgent: 'node',
    serviceWorker: {
        getRegistrations: async () => [],
    },
});

mockObject('localStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
});

mockObject('sessionStorage', {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
});

mockObject('location', {
    href: 'http://localhost/',
    search: '',
    pathname: '/',
    hash: '',
});

mockObject('history', {
    replaceState: () => {},
    pushState: () => {},
});

mockObject('lucide', {
    createIcons: () => {},
});

mockObject('paypal', {});
mockObject('payphone', {});
mockObject('emailjs', {});
mockObject('Audio', class {});
mockObject('Image', class {});
mockObject('alert', () => {});
mockObject('confirm', () => true);

// Mock browser-specific classes and observers
mockObject('MutationObserver', class {
    constructor() {}
    observe() {}
    disconnect() {}
    takeRecords() { return []; }
});
mockObject('ResizeObserver', class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
});
mockObject('IntersectionObserver', class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
});
mockObject('customElements', {
    define: () => {},
    get: () => {},
    whenDefined: () => Promise.resolve(),
});
mockObject('HTMLElement', class {});
mockObject('Event', class {
    constructor(type) { this.type = type; }
});
mockObject('CustomEvent', class {
    constructor(type, init) { this.type = type; this.detail = init?.detail; }
});
mockObject('requestAnimationFrame', (cb) => setTimeout(cb, 0));
mockObject('cancelAnimationFrame', (id) => clearTimeout(id));

console.log("Mocked globals successfully. Importing bundle...");

try {
    const assetsDir = path.join(import.meta.dirname, '../dist/assets');
    const files = fs.readdirSync(assetsDir);
    const jsFile = files.find(f => f.endsWith('.js'));
    if (!jsFile) {
        throw new Error("No compiled JS file found in dist/assets!");
    }
    const bundlePath = path.join(assetsDir, jsFile);
    console.log(`Importing bundle from: ${bundlePath}`);
    await import(bundlePath);
    console.log("Bundle loaded successfully without throwing errors!");
} catch (err) {
    console.error("CRITICAL RUNTIME ERROR IN BUNDLE:");
    console.error(err);
    process.exit(1);
}
