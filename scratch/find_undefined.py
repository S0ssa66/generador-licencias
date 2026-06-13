import ast

# Read main.js
with open("main.js", "r") as f:
    code = f.read()

# Parse AST
tree = ast.parse(code)

# Define standard globals to ignore
STANDARD_GLOBALS = {
    "document", "window", "console", "localStorage", "sessionStorage", "setTimeout", "setInterval",
    "clearTimeout", "clearInterval", "parseInt", "parseFloat", "isNaN", "isFinite", "encodeURIComponent",
    "decodeURIComponent", "fetch", "alert", "confirm", "prompt", "JSON", "Date", "Math", "Array", "Object",
    "String", "Number", "Boolean", "RegExp", "Error", "Promise", "FormData", "Blob", "File", "FileReader",
    "Headers", "Request", "Response", "URL", "URLSearchParams", "Image", "Audio", "XMLHttpRequest",
    "getDoc", "doc", "setDoc", "collection", "getDocs", "query", "where", "orderBy", "limit", "startAfter",
    "collectionGroup", "deleteDoc", "addDoc", "updateDoc", "onSnapshot", "ref", "uploadBytesResumable",
    "getDownloadURL", "db", "auth", "storage", "googleProvider", "signOut", "linkWithPopup", "unlink"
}

# Find all defined functions, variables, and imported names
defined_names = set()

for node in ast.walk(tree):
    # Functions
    if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
        defined_names.add(node.name)
    # Imports
    elif isinstance(node, ast.ImportFrom):
        for alias in node.names:
            defined_names.add(alias.name)
    elif isinstance(node, ast.Import):
        for name in node.names:
            defined_names.add(name.name)
    # Variable assignments in the module scope
    elif isinstance(node, ast.Assign):
        for target in node.targets:
            if isinstance(target, ast.Name):
                defined_names.add(target.id)

# Find all bare Name calls (not prefixed by object.method)
called_names = set()
for node in ast.walk(tree):
    if isinstance(node, ast.Call):
        if isinstance(node.func, ast.Name):
            called_names.add(node.func.id)

# Print names called but not defined or in standard globals
undefined = called_names - defined_names - STANDARD_GLOBALS
print("--- UNDEFINED BARE-NAME CALLS IN main.js ---")
for name in sorted(undefined):
    print(name)
