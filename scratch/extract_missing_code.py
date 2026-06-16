import re

# Read original dashboard.js
with open('/Users/sossa/IA/generador-licencias/dashboard.js', 'r', encoding='utf-8') as f:
    orig_lines = f.readlines()

def get_lines(start_idx, end_idx):
    # start_idx and end_idx are 1-based line numbers (inclusive)
    return "".join(orig_lines[start_idx-1:end_idx])

# Extract functions
loadPendingPaymentsAdmin = get_lines(2069, 2173)
viewReceiptLarge = get_lines(2176, 2183)
approvePaymentAdmin = get_lines(2185, 2243)
rejectPaymentAdmin = get_lines(2245, 2260)
deactivateVipCodeAdmin = get_lines(2312, 2323)
generateVipCodeAdmin = get_lines(2326, 2349)

openSaleDetailsModal = get_lines(3031, 3154)
approveBeatSale = get_lines(3158, 3269)
rejectBeatSale = get_lines(3271, 3284)
acceptExclusiveOffer = get_lines(3286, 3377)

showChartTooltip = get_lines(1820, 1841)
hideChartTooltip = get_lines(1844, 1847)
updateDashboardView = get_lines(1609, 1691)

# Write a utility to replace variable names in a block of code
def replace_globals(code):
    # We want to replace:
    # - licenseHistory -> window.licenseHistory (but NOT window.licenseHistory or other properties)
    # We use regex lookbehinds and lookaheads to only match standalone variable names
    code = re.sub(r'(?<!\.)\blicenseHistory\b', 'window.licenseHistory', code)
    code = re.sub(r'(?<!\.)\bcontactsList\b', 'window.contactsList', code)
    code = re.sub(r'(?<!\.)\blocalBeats\b', 'window.localBeats', code)
    code = re.sub(r'(?<!\.)\bproducerConfig\b', 'window.producerConfig', code)
    return code

print("Extracted all functions successfully.")
