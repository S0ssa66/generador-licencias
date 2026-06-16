import re

filepath = "/Users/sossa/IA/generador-licencias/dashboard.js"

with open(filepath, "r", encoding="utf-8") as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")

# Find all imports
imports = []
for idx, line in enumerate(lines):
    if line.strip().startswith("import "):
        imports.append((idx + 1, line.strip()))

print("\n--- Imports ---")
for idx, imp in imports:
    print(f"Line {idx}: {imp}")

# Find all let/const/var at global level (rough check)
globals_list = []
for idx, line in enumerate(lines):
    if idx < 100: # check first 100 lines for global declarations
        if line.startswith(("let ", "const ", "var ")) and "=" in line:
            globals_list.append((idx + 1, line.strip()))

print("\n--- Globals ---")
for idx, g in globals_list:
    print(f"Line {idx}: {g}")

# Find function declarations and their line numbers
functions = []
for idx, line in enumerate(lines):
    if line.strip().startswith(("function ", "async function ")):
        functions.append((idx + 1, line.strip()))

print("\n--- Functions ---")
for idx, fn in functions:
    print(f"Line {idx}: {fn}")
