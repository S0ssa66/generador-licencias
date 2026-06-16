import re

filepath = "/Users/sossa/IA/generador-licencias/dashboard.js"

with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()

# Find all global variables declared at the top (lines before any function)
lines = code.split("\n")
globals_declared = []
for idx, line in enumerate(lines):
    # Stop looking for globals once we reach the first function
    if "function " in line:
        break
    # Match let/var/const declarations at root level
    m = re.match(r"^(let|var|const)\s+([a-zA-Z0-9_]+)\s*=", line.strip())
    if m:
        globals_declared.append(m.group(2))

print("Global variables declared:")
print(globals_declared)

# For each global variable, find where it is used (which functions)
def find_function_containing_index(code, index):
    # Find all function starts and their positions
    fn_matches = list(re.finditer(r"\b(async\s+)?function\s+([a-zA-Z0-9_]+)\b", code))
    for i in range(len(fn_matches)):
        start = fn_matches[i].start()
        # Find brace matching end of function
        brace_start = code.find("{", start)
        if brace_start == -1:
            continue
        brace_count = 1
        pos = brace_start + 1
        while brace_count > 0 and pos < len(code):
            if code[pos] == "{":
                brace_count += 1
            elif code[pos] == "}":
                brace_count -= 1
            pos += 1
        
        if start <= index < pos:
            return fn_matches[i].group(2)
    return "global"

for g in globals_declared:
    # Skip window-aliased functions
    if g in ["getActiveLicenseType", "checkPlanLimitExceeded", "saveHistory", "loadHistory", 
             "downloadPDF", "selectLicenseType", "compileContract", "sendEmailDelivery", 
             "safeSetItem", "safeGetItem", "safeCreateIcons", "initTooltips"]:
        continue
    print(f"\nUsage of '{g}':")
    matches = list(re.finditer(rf"\b{g}\b", code))
    for m in matches:
        pos = m.start()
        fn_name = find_function_containing_index(code, pos)
        # print context line
        line_no = code[:pos].count("\n") + 1
        line_content = lines[line_no - 1].strip()
        print(f"  Line {line_no} in function '{fn_name}': {line_content}")
