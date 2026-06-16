import re
import os

def extract_functions(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Simple regex to find function declarations
    # Matches: function name(...), async function name(...)
    # and: window.name = function(...) or window.name = async function(...)
    funcs = set()
    for match in re.finditer(r'(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(', content):
        funcs.add(match.group(1))
    for match in re.finditer(r'window\.([a-zA-Z0-9_]+)\s*=\s*(?:async\s+)?function', content):
        funcs.add(match.group(1))
    # Also matches arrows: const name = (...) => or window.name = (...) =>
    for match in re.finditer(r'(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>', content):
        funcs.add(match.group(1))
    return funcs

original_file = '/Users/sossa/IA/generador-licencias/dashboard.js'
dashboard_dir = '/Users/sossa/IA/generador-licencias/dashboard'

orig_funcs = extract_functions(original_file)

sub_funcs = {}
all_sub_funcs = set()
for filename in os.listdir(dashboard_dir):
    if filename.endswith('.js'):
        path = os.path.join(dashboard_dir, filename)
        f_set = extract_functions(path)
        sub_funcs[filename] = f_set
        all_sub_funcs.update(f_set)

print("Functions in original dashboard.js but NOT in any submodule:")
missing = sorted(list(orig_funcs - all_sub_funcs))
for f in missing:
    # Ignore built-ins or local wrappers that are not actual implementations
    if f in ['sanitizeHtml', 'loadScript', 'getActiveLicenseType', 'checkPlanLimitExceeded', 'saveHistory', 'loadHistory', 'downloadPDF', 'selectLicenseType', 'compileContract', 'sendEmailDelivery', 'safeSetItem', 'safeGetItem', 'safeCreateIcons', 'initTooltips', 'autoSaveContact', 'loadContacts', 'openContactsModal', 'closeContactsModal', 'renderContactsTable', 'selectContact', 'deleteContact', 'loadConsolidatedAccounting', 'loadReferralData', 'deactivateVipCodeAdmin', 'generateVipCodeAdmin', 'loadVipCodesAdmin', 'triggerReferralConversion', 'saveAllContacts', 'saveAllBeats', 'handleBeatStarsCsvImport', 'requestNotificationPermission', 'loadSalesDataFallback', 'loadSalesData', 'renderSalesTable', 'renderSalesStats', 'approveBeatSale', 'rejectBeatSale', 'acceptExclusiveOffer', 'updateDashboardView', 'renderMonthlySalesChart', 'showChartTooltip', 'hideChartTooltip', 'renderLicenseTypesChart', 'renderTopBeatsChart', 'renderTopBuyersTable', 'loadPendingPaymentsAdmin', 'approvePaymentAdmin', 'rejectPaymentAdmin', 'viewReceiptLarge']:
        continue
    print(f" - {f}")

print("\nAll missing functions (even if they might be wrappers):")
for f in sorted(list(orig_funcs - all_sub_funcs)):
    print(f" - {f}")
