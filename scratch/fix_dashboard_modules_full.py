import re
import os
import shutil

# Paths
base_dir = '/Users/sossa/IA/generador-licencias'
orig_dashboard = os.path.join(base_dir, 'dashboard.js')
submodules_dir = os.path.join(base_dir, 'dashboard')

# Restore submodules from .bak files if they exist to start fresh
for filename in os.listdir(submodules_dir):
    if filename.endswith('.bak'):
        src = os.path.join(submodules_dir, filename)
        dst = os.path.join(submodules_dir, filename[:-4])
        shutil.copyfile(src, dst)
        print(f"Restored {dst} from {src}")

# Read original dashboard.js
with open(orig_dashboard, 'r', encoding='utf-8') as f:
    orig_lines = f.readlines()

def get_lines(start_idx, end_idx):
    # 1-based line numbers (inclusive)
    return "".join(orig_lines[start_idx-1:end_idx])

# Extract missing functions from dashboard.js
loadPendingPaymentsAdmin = get_lines(2069, 2173)
viewReceiptLarge = get_lines(2176, 2183)
approvePaymentAdmin = get_lines(2185, 2243)
rejectPaymentAdmin = get_lines(2245, 2263)  # Corrected to 2263
deactivateVipCodeAdmin = get_lines(2312, 2323)
generateVipCodeAdmin = get_lines(2326, 2349)

openSaleDetailsModal = get_lines(3031, 3154)
approveBeatSale = get_lines(3158, 3269)
rejectBeatSale = get_lines(3271, 3284)
acceptExclusiveOffer = get_lines(3286, 3378)  # Corrected to 3378

showChartTooltip = get_lines(1820, 1842)
hideChartTooltip = get_lines(1844, 1847)
updateDashboardView = get_lines(1609, 1691)

# Helper to clean global references
def replace_globals(code):
    code = re.sub(r'(?<!\.)\blicenseHistory\b', 'window.licenseHistory', code)
    code = re.sub(r'(?<!\.)\bcontactsList\b', 'window.contactsList', code)
    code = re.sub(r'(?<!\.)\blocalBeats\b', 'window.localBeats', code)
    code = re.sub(r'(?<!\.)\bproducerConfig\b', 'window.producerConfig', code)
    return code

def make_local_function(code, name):
    # Replace window.XYZ = async function(...) { with async function XYZ(...) {
    code = re.sub(r'window\.' + name + r'\s*=\s*async\s+function\s*\(', f'async function {name}(', code)
    # Replace window.XYZ = function(...) { with function XYZ(...) {
    code = re.sub(r'window\.' + name + r'\s*=\s*function\s*\(', f'function {name}(', code)
    return code

# Clean and make local the extracted functions
loadPendingPaymentsAdmin_clean = replace_globals(loadPendingPaymentsAdmin)
viewReceiptLarge_clean = make_local_function(replace_globals(viewReceiptLarge), 'viewReceiptLarge')
approvePaymentAdmin_clean = make_local_function(replace_globals(approvePaymentAdmin), 'approvePaymentAdmin')
rejectPaymentAdmin_clean = make_local_function(replace_globals(rejectPaymentAdmin), 'rejectPaymentAdmin')
deactivateVipCodeAdmin_clean = make_local_function(replace_globals(deactivateVipCodeAdmin), 'deactivateVipCodeAdmin')
generateVipCodeAdmin_clean = make_local_function(replace_globals(generateVipCodeAdmin), 'generateVipCodeAdmin')

openSaleDetailsModal_clean = make_local_function(replace_globals(openSaleDetailsModal), 'openSaleDetailsModal')
approveBeatSale_clean = make_local_function(replace_globals(approveBeatSale), 'approveBeatSale')
rejectBeatSale_clean = make_local_function(replace_globals(rejectBeatSale), 'rejectBeatSale')
acceptExclusiveOffer_clean = make_local_function(replace_globals(acceptExclusiveOffer), 'acceptExclusiveOffer')

showChartTooltip_clean = make_local_function(replace_globals(showChartTooltip), 'showChartTooltip')
hideChartTooltip_clean = make_local_function(replace_globals(hideChartTooltip), 'hideChartTooltip')
updateDashboardView_clean = replace_globals(updateDashboardView)



# -------------------------------------------------------------
# 1. HISTORY.JS
# -------------------------------------------------------------
history_path = os.path.join(submodules_dir, 'history.js')
with open(history_path, 'r', encoding='utf-8') as f:
    history_content = f.read()

# Make clearAllHistory async
history_content = history_content.replace(
    'function clearAllHistory() {',
    'async function clearAllHistory() {'
)

# Apply global replacements
history_content = replace_globals(history_content)

# Prepend correct imports and aliases (removed loadLicenseIntoEditor alias)
history_imports_aliases = """import { LICENSE_CONFIGS } from '../config.js';
import { TRANSLATIONS } from '../i18n.js';
import { db, doc, updateDoc, deleteDoc, collection, getDocs } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadScript = (...args) => window.loadScript(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const autoSaveContact = (...args) => window.autoSaveContact(...args);
const getActiveLicenseType = (...args) => window.getActiveLicenseType(...args);
const checkPlanLimitExceeded = (...args) => window.checkPlanLimitExceeded(...args);
const saveHistory = (...args) => window.saveHistory(...args);
const loadHistory = (...args) => window.loadHistory(...args);
const downloadPDF = (...args) => window.downloadPDF(...args);
const generatePreview = (...args) => window.generatePreview(...args);
const updateDashboardView = (...args) => window.updateDashboardView(...args);

let salesChartInstance = null;
"""

# Strip out old imports and aliases (up to 'let salesChartInstance = null;')
history_content_body = history_content.split('let salesChartInstance = null;')[1]
history_content = history_imports_aliases + history_content_body

with open(history_path, 'w', encoding='utf-8') as f:
    f.write(history_content)
print("Rewritten history.js")


# -------------------------------------------------------------
# 2. CONTACTS.JS
# -------------------------------------------------------------
contacts_path = os.path.join(submodules_dir, 'contacts.js')
with open(contacts_path, 'r', encoding='utf-8') as f:
    contacts_content = f.read()

contacts_content = contacts_content.replace('function loadContacts() {', 'async function loadContacts() {')
contacts_content = contacts_content.replace('function autoSaveContact() {', 'async function autoSaveContact() {')
contacts_content = contacts_content.replace('function deleteContact(email) {', 'async function deleteContact(email) {')
contacts_content = contacts_content.replace('function saveAllContacts() {', 'async function saveAllContacts() {')

contacts_content = replace_globals(contacts_content)

contacts_imports_aliases = """import { db, doc, collection, getDocs, setDoc, deleteDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
"""

# Strip out old imports and aliases (up to 'function loadContacts() {')
contacts_content_body = contacts_content.split('async function loadContacts() {')[1]
contacts_content = contacts_imports_aliases + '\nasync function loadContacts() {' + contacts_content_body

with open(contacts_path, 'w', encoding='utf-8') as f:
    f.write(contacts_content)
print("Rewritten contacts.js")


# -------------------------------------------------------------
# 3. CSV_IMPORTER.JS
# -------------------------------------------------------------
csv_path = os.path.join(submodules_dir, 'csv_importer.js')
with open(csv_path, 'r', encoding='utf-8') as f:
    csv_content = f.read()

csv_content = csv_content.replace('function saveAllBeats() {', 'async function saveAllBeats() {')
csv_content = replace_globals(csv_content)

csv_imports_aliases = """import { db, doc, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const loadContacts = (...args) => window.loadContacts(...args);
const safeSetItem = (...args) => window.safeSetItem(...args);
const saveAllContacts = (...args) => window.saveAllContacts(...args);
const updateHistoryTable = (...args) => window.updateHistoryTable(...args);
const loadConsolidatedAccounting = (...args) => window.loadConsolidatedAccounting(...args);
const saveHistory = (...args) => window.saveHistory(...args);
"""

csv_content_body = csv_content.split('async function saveAllBeats() {')[1]
csv_content = csv_imports_aliases + '\nasync function saveAllBeats() {' + csv_content_body

with open(csv_path, 'w', encoding='utf-8') as f:
    f.write(csv_content)
print("Rewritten csv_importer.js")


# -------------------------------------------------------------
# 4. CHARTS.JS
# -------------------------------------------------------------
charts_path = os.path.join(submodules_dir, 'charts.js')
with open(charts_path, 'r', encoding='utf-8') as f:
    charts_content = f.read()

charts_content = replace_globals(charts_content)

charts_imports_aliases = """// Locals / Globals
const currentLang = window.currentLang;
const loadScript = (...args) => window.loadScript(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);
const initTooltips = (...args) => window.initTooltips(...args);
"""

# Strip out old aliases (Keep track of charts locally is already in body, we do NOT want duplicate declarations)
# Let's see: in charts.js, the body starts with 'let monthlySalesChartInstance = null;'
charts_content_body = charts_content.split('let monthlySalesChartInstance = null;')[1]
charts_content = charts_imports_aliases + '\nlet monthlySalesChartInstance = null;' + charts_content_body

# Append new functions to the bottom (just before Bindings)
bindings_comment = '// Bindings to global scope for backward compatibility'
parts = charts_content.split(bindings_comment)

new_functions_code = f"""
{updateDashboardView_clean}

{showChartTooltip_clean}

{hideChartTooltip_clean}

"""

new_bindings = """window.updateDashboardView = updateDashboardView;
window.showChartTooltip = showChartTooltip;
window.hideChartTooltip = hideChartTooltip;
"""

charts_content = parts[0] + new_functions_code + bindings_comment + '\n' + new_bindings + parts[1]

with open(charts_path, 'w', encoding='utf-8') as f:
    f.write(charts_content)
print("Rewritten charts.js")


# -------------------------------------------------------------
# 5. ACCOUNTING.JS
# -------------------------------------------------------------
accounting_path = os.path.join(submodules_dir, 'accounting.js')
with open(accounting_path, 'r', encoding='utf-8') as f:
    accounting_content = f.read()

accounting_content = accounting_content.replace('function loadConsolidatedAccounting() {', 'async function loadConsolidatedAccounting() {')
accounting_content = accounting_content.replace('function loadReferralData() {', 'async function loadReferralData() {')
accounting_content = accounting_content.replace('function loadVipCodesAdmin() {', 'async function loadVipCodesAdmin() {')
accounting_content = accounting_content.replace('function triggerReferralConversion() {', 'async function triggerReferralConversion() {')

accounting_content = replace_globals(accounting_content)

accounting_imports_aliases = """import { db, collection, getDocs, doc, updateDoc, getDoc, collectionGroup, query, where, auth, setDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const safeCreateIcons = (...args) => window.safeCreateIcons(...args);

let adminSelectedUserId = '';
"""

accounting_content_body = accounting_content.split('async function loadConsolidatedAccounting() {')[1]
accounting_content = accounting_imports_aliases + '\nasync function loadConsolidatedAccounting() {' + accounting_content_body

# Append missing admin functions to the bottom (just before Bindings)
bindings_comment = '// Bindings to global scope for backward compatibility'
parts = accounting_content.split(bindings_comment)

new_functions_code = f"""
{loadPendingPaymentsAdmin_clean}

{viewReceiptLarge_clean}

{approvePaymentAdmin_clean}

{rejectPaymentAdmin_clean}

{deactivateVipCodeAdmin_clean}

{generateVipCodeAdmin_clean}

"""

new_bindings = """window.loadPendingPaymentsAdmin = loadPendingPaymentsAdmin;
window.approvePaymentAdmin = approvePaymentAdmin;
window.rejectPaymentAdmin = rejectPaymentAdmin;
window.deactivateVipCodeAdmin = deactivateVipCodeAdmin;
window.generateVipCodeAdmin = generateVipCodeAdmin;
"""

accounting_content = parts[0] + new_functions_code + bindings_comment + '\n' + new_bindings + parts[1]

with open(accounting_path, 'w', encoding='utf-8') as f:
    f.write(accounting_content)
print("Rewritten accounting.js")


# -------------------------------------------------------------
# 6. SALES.JS
# -------------------------------------------------------------
sales_path = os.path.join(submodules_dir, 'sales.js')
with open(sales_path, 'r', encoding='utf-8') as f:
    sales_content = f.read()

sales_content = replace_globals(sales_content)
sales_content = sales_content.replace('function requestNotificationPermission() {', 'async function requestNotificationPermission() {')
sales_content = sales_content.replace('function loadSalesDataFallback() {', 'async function loadSalesDataFallback() {')


sales_imports_aliases = """import { db, collection, query, where, onSnapshot, getDocs, doc, getDoc, updateDoc } from "../firebase.js";

// Locals / Globals
const currentLang = window.currentLang;
const showToast = (...args) => window.showToast(...args);
const sanitizeHtml = (...args) => window.sanitizeHtml(...args);
const getActiveLicenseType = (...args) => window.getActiveLicenseType(...args);
const compileContract = (...args) => window.compileContract(...args);
const sendEmailDelivery = (...args) => window.sendEmailDelivery(...args);
const selectLicenseType = (...args) => window.selectLicenseType(...args);

let _salesFirstLoad = true;
let _knownPaymentIds = new Set();
"""

sales_content_body = sales_content.split('function initSalesRealtimeListener() {')[1]
sales_content = sales_imports_aliases + '\nfunction initSalesRealtimeListener() {' + sales_content_body

# Append new functions to the bottom (just before Bindings)
bindings_comment = '// Bindings to global scope for backward compatibility'
parts = sales_content.split(bindings_comment)

new_functions_code = f"""
{openSaleDetailsModal_clean}

{approveBeatSale_clean}

{rejectBeatSale_clean}

{acceptExclusiveOffer_clean}

"""

new_bindings = """window.openSaleDetailsModal = openSaleDetailsModal;
window.approveBeatSale = approveBeatSale;
window.rejectBeatSale = rejectBeatSale;
window.acceptExclusiveOffer = acceptExclusiveOffer;
"""

sales_content = parts[0] + new_functions_code + bindings_comment + '\n' + new_bindings + parts[1]

with open(sales_path, 'w', encoding='utf-8') as f:
    f.write(sales_content)
print("Rewritten sales.js")
