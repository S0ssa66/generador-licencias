// Orchestrator for BEATSS Dashboard Module
// Defines shared utilities and imports all submodules.

/**
 * Escapes special HTML characters to prevent XSS attacks when
 * inserting user input into innerHTML.
 * @param {*} str - Value to escape
 * @returns {string} - Escaped HTML string
 */
function sanitizeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}
window.sanitizeHtml = sanitizeHtml;

/**
 * Dynamically loads an external script and returns a Promise.
 * @param {string} src - Script URL
 * @returns {Promise<void>}
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}
window.loadScript = loadScript;

// Import all submodules (this registers their functions on window)
import './dashboard/history.js';
import './dashboard/contacts.js';
import './dashboard/csv_importer.js';
import './dashboard/charts.js';
import './dashboard/accounting.js';
import './dashboard/sales.js';
import './dashboard/copilot.js';
