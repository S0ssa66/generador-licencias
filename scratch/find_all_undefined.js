import fs from 'fs';
import path from 'path';

const files = [
    'main.js',
    'auth.js',
    'player.js',
    'catalog.js',
    'checkout.js',
    'editor.js',
    'dashboard.js'
];

const standardGlobals = new Set([
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'fetch',
    'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'require',
    'import', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Promise', 'Date', 'Math',
    'JSON', 'FormData', 'Blob', 'File', 'URL', 'URLSearchParams', 'Headers', 'Request', 'Response', 'Image',
    'Audio', 'XMLHttpRequest', 'safeSetItem', 'safeCreateIcons', 'norm', 'closeSettingsModal', 'generatePreview',
    'updatePlanUI', 'closePayphoneOverlay', 'autoDeliverBeatSale', 'initAuthAndApp', 'console', 'document', 'window',
    'localStorage', 'sessionStorage', 'location', 'history', 'navigator', 'screen', 'Image', 'Audio', 'FileReader',
    'lucide', 'paypal', 'payphone', 'emailjs', 'showToast', 'bootstrap', 'Swal', 'jQuery', '$', 'firebase',
    'recaptcha', 'grecaptcha', 'Map', 'Set', 'Headers', 'Request', 'Response', 'customElements', 'HTMLElement',
    'requestAnimationFrame', 'cancelAnimationFrame', 'Event', 'CustomEvent', 'PointerEvent', 'MouseEvent',
    'KeyboardEvent', 'FocusEvent', 'ClipboardEvent', 'MutationObserver', 'ResizeObserver', 'IntersectionObserver'
]);

const jsKeywords = new Set([
    'if', 'for', 'while', 'switch', 'catch', 'function', 'class', 'const', 'let', 'var', 'return', 'throw',
    'async', 'await', 'import', 'export', 'default', 'new', 'delete', 'typeof', 'instanceof', 'void', 'with'
]);

for (const file of files) {
    if (!fs.existsSync(file)) {
        console.log(`File ${file} does not exist.`);
        continue;
    }
    const code = fs.readFileSync(file, 'utf8');

    // Find all defined function names: function name(...) or async function name(...)
    const definedNames = new Set();
    const funcRegex = /(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/g;
    let match;
    while ((match = funcRegex.exec(code)) !== null) {
        definedNames.add(match[1]);
    }

    // Find all arrow function declarations: const name = (...) => or let name = async (...) =>
    const arrowFuncRegex = /(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g;
    while ((match = arrowFuncRegex.exec(code)) !== null) {
        definedNames.add(match[1]);
    }

    // Find all imports
    const importNamesRegex = /import\s+(?:\{\s*([^}]+)\s*\}|([a-zA-Z0-9_]+))\s*from/g;
    while ((match = importNamesRegex.exec(code)) !== null) {
        if (match[1]) {
            const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop());
            names.forEach(name => { if (name) definedNames.add(name); });
        }
        if (match[2]) {
            definedNames.add(match[2].trim());
        }
    }

    // Find all called bare function names
    const callRegex = /(?<!\.\s*)(?<!\bfunction\s+)(?<!\bclass\s+)\b([a-zA-Z0-9_]+)\s*\(/g;
    const calledFunctions = new Set();
    while ((match = callRegex.exec(code)) !== null) {
        calledFunctions.add(match[1]);
    }

    console.log(`\n--- UNDEFINED BARE-NAME FUNCTION CALLS IN ${file} ---`);
    let found = false;
    for (const name of calledFunctions) {
        if (!definedNames.has(name) && !standardGlobals.has(name) && !jsKeywords.has(name)) {
            console.log(`  - ${name}`);
            found = true;
        }
    }
    if (!found) {
        console.log("  (None)");
    }
}
