import os

filepath = "/Users/sossa/IA/generador-licencias/dashboard.js"
output_dir = "/Users/sossa/IA/generador-licencias/dashboard"
os.makedirs(output_dir, exist_ok=True)

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Brace matching parser to extract function body
def extract_function(code, func_name):
    # Match function definition
    # Handle optional async keyword
    patterns = [
        rf"\bfunction\s+{func_name}\b",
        rf"\basync\s+function\s+{func_name}\b"
    ]
    
    match = None
    for pattern in patterns:
        m = re.search(pattern, code)
        if m:
            match = m
            break
            
    if not match:
        return None
        
    start_pos = match.start()
    
    # Find the opening brace of the function body
    brace_start = code.find("{", start_pos)
    if brace_start == -1:
        return None
        
    # Count braces to find matching closing brace
    brace_count = 1
    pos = brace_start + 1
    while brace_count > 0 and pos < len(code):
        char = code[pos]
        if char == "{":
            brace_count += 1
        elif char == "}":
            brace_count -= 1
        pos += 1
        
    return code[start_pos:pos]

import re

# Define the groupings
modules = {
    "history": {
        "funcs": [
            "saveCurrentLicenseToHistory",
            "updateHistoryTable",
            "setupHistoryRowEvents",
            "loadLicenseIntoEditor",
            "clearAllHistory",
            "filterHistory",
            "exportHistoryToCSV",
            "exportHistoryToJSON"
        ],
        "header": """import { LICENSE_CONFIGS } from '../config.js';
import { TRANSLATIONS } from '../i18n.js';
import { db, doc, updateDoc, deleteDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadScript = (...args) => window.loadScript(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
"""
    },
    "contacts": {
        "funcs": [
            "loadContacts",
            "autoSaveContact",
            "openContactsModal",
            "closeContactsModal",
            "renderContactsTable",
            "selectContact",
            "deleteContact",
            "saveAllContacts"
        ],
        "header": """import { db, doc, collection, getDocs, setDoc, deleteDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
"""
    },
    "csv_importer": {
        "funcs": [
            "saveAllBeats",
            "handleBeatStarsCsvImport",
            "parseCSV",
            "cleanBeatName",
            "makeBeatId",
            "parseBeatStarsDate"
        ],
        "header": """import { db, doc, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadContacts = (...args) => window.loadContacts(...args);
"""
    },
    "charts": {
        "funcs": [
            "renderMonthlySalesChart",
            "renderLicenseTypesChart",
            "renderTopBeatsChart",
            "renderTopBuyersTable"
        ],
        "header": """// Locals / Globals
const currentLang = window.currentLang;
let salesChartInstance = null;
const loadScript = (...args) => window.loadScript(...args);

// Keep track of charts locally or bind them
let monthlySalesChartInstance = null;
let licenseTypesChartInstance = null;
let topBeatsChartInstance = null;
"""
    },
    "accounting": {
        "funcs": [
            "loadConsolidatedAccounting",
            "openAdminPlanModal",
            "setupAdminPlanModalEvents",
            "loadReferralData",
            "loadVipCodesAdmin",
            "triggerReferralConversion"
        ],
        "header": """import { db, collection, getDocs, doc, updateDoc, getDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
"""
    },
    "sales": {
        "funcs": [
            "initSalesRealtimeListener",
            "updateSalesBadge",
            "requestNotificationPermission",
            "loadSalesDataFallback",
            "loadSalesData",
            "renderSalesTable",
            "renderSalesStats"
        ],
        "header": """import { db, collection, query, where, onSnapshot, getDocs } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
"""
    }
}

# Run extraction
for mod_name, mod_info in modules.items():
    print(f"\n--- Extracting module {mod_name} ---")
    mod_code = mod_info["header"] + "\n"
    
    # Export and window bindings list
    exports_bindings = []
    
    for fn in mod_info["funcs"]:
        fn_code = extract_function(code, fn)
        if fn_code:
            mod_code += fn_code + "\n\n"
            # Add window binding to maintain backward compatibility
            exports_bindings.append(f"window.{fn} = {fn};")
            print(f"✓ Extracted {fn}")
        else:
            print(f"❌ Failed to extract {fn}")
            
    # Add window bindings at the end of the file
    mod_code += "\n// Bindings to global scope for backward compatibility\n"
    mod_code += "\n".join(exports_bindings) + "\n"
    
    # Write to file
    out_path = os.path.join(output_dir, f"{mod_name}.js")
    with open(out_path, "w", encoding="utf-8") as out_f:
        out_f.write(mod_code)
    print(f"Written to {out_path}")
