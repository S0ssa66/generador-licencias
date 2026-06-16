import re

filepath = "/Users/sossa/IA/generador-licencias/dashboard.js"
with open(filepath, "r", encoding="utf-8") as f:
    code = f.read()
lines = code.split("\n")

def find_function_containing_index(code, index):
    fn_matches = list(re.finditer(r"\b(async\s+)?function\s+([a-zA-Z0-9_]+)\b", code))
    for i in range(len(fn_matches)):
        start = fn_matches[i].start()
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

variables = ["salesChartInstance", "adminSelectedUserId", "_salesFirstLoad", "_knownPaymentIds"]

for v in variables:
    print(f"\nUsage of '{v}':")
    matches = list(re.finditer(rf"\b{v}\b", code))
    for m in matches:
        pos = m.start()
        fn_name = find_function_containing_index(code, pos)
        line_no = code[:pos].count("\n") + 1
        line_content = lines[line_no - 1].strip()
        print(f"  Line {line_no} in function '{fn_name}': {line_content}")
