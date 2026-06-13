import fs from 'fs';

const code = fs.readFileSync('main.js', 'utf8');

// Find all defined function names: function name(...) or async function name(...)
const definedFunctions = new Set();
const funcRegex = /(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(/g;
let match;
while ((match = funcRegex.exec(code)) !== null) {
    definedFunctions.add(match[1]);
}

// Find all imports
const importNamesRegex = /import\s+\{\s*([^}]+)\s*\}\s*from/g;
while ((match = importNamesRegex.exec(code)) !== null) {
    const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/).pop());
    names.forEach(name => {
        if (name) definedFunctions.add(name);
    });
}

// Find all called bare function names
// A bare function call matches a word followed by '(' but not preceded by '.' or 'function'
const callRegex = /(?<!\.\s*)(?<!\bfunction\s+)(?<!\bclass\s+)\b([a-zA-Z0-9_]+)\s*\(/g;
const calledFunctions = new Set();
while ((match = callRegex.exec(code)) !== null) {
    calledFunctions.add(match[1]);
}

// Standard JS and DOM globals to ignore
const standardGlobals = new Set([
    'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'fetch',
    'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'require',
    'import', 'Object', 'Array', 'String', 'Number', 'Boolean', 'RegExp', 'Error', 'Promise', 'Date', 'Math',
    'JSON', 'FormData', 'Blob', 'File', 'URL', 'URLSearchParams', 'Headers', 'Request', 'Response', 'Image',
    'Audio', 'XMLHttpRequest', 'safeSetItem', 'safeCreateIcons', 'norm', 'closeSettingsModal', 'generatePreview',
    'updatePlanUI', 'closePayphoneOverlay', 'autoDeliverBeatSale', 'initAuthAndApp'
]);

console.log("--- UNDEFINED BARE-NAME FUNCTION CALLS ---");
for (const name of calledFunctions) {
    if (!definedFunctions.has(name) && !standardGlobals.has(name)) {
        console.log(name);
    }
}
