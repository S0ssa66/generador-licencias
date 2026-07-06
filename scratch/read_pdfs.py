import os
import pypdf

PDF_DIR = "/Users/sossa/Desktop/Licencias_SossaMusic_Analisis"
files = [
    "1_Licencia_Basica_SossaMusic.pdf",
    "2_Licencia_Premium_SossaMusic.pdf",
    "3_Licencia_Premium_Plus_SossaMusic.pdf",
    "4_Licencia_Ilimitada_SossaMusic.pdf",
    "5_Licencia_Exclusiva_SossaMusic.pdf"
]

print("=== START OF LICENSE AUDIT SCRIPT ===")

for filename in files:
    filepath = os.path.join(PDF_DIR, filename)
    if not os.path.exists(filepath):
        print(f"Error: {filename} does not exist!")
        continue
    
    print(f"\n--- AUDITING FILE: {filename} ---")
    reader = pypdf.PdfReader(filepath)
    full_text = ""
    for idx, page in enumerate(reader.pages):
        full_text += f"\n[PAGE {idx+1}]\n" + page.extract_text()
        
    # Check 1: Contracting Entity
    print("Check 1: Contracting Entity")
    parties_lines = [line for line in full_text.split("\n") if "El Licenciante" in line or "Licenciante (Productor)" in line]
    for line in parties_lines:
        print(f"  Parties: {line.strip()}")
        
    # Check 2: Jurisdiction & Applicable Law
    print("Check 2: Jurisdiction & Law")
    law_lines = [line for line in full_text.split("\n") if "se rige" in line or "tribunales" in line or "jurisdicción" in line]
    for line in law_lines:
        if "Cláusula 11" in line or "leyes de" in line or "jurisdicción de" in line:
            print(f"  Law/Jurisdiction: {line.strip()}")
            
    # Check 3: Place & Payment Method
    print("Check 3: Celebration Place & Payment")
    place_lines = [line for line in full_text.split("\n") if "Lugar de Celebración:" in line or "Método de Pago:" in line]
    for line in place_lines:
        print(f"  Place/Payment: {line.strip()}")
        
    # Check 4: Clause 9 Termination
    print("Check 4: Clause 9 (Termination/Irrevocability)")
    c9_lines = []
    lines = full_text.split("\n")
    for i, line in enumerate(lines):
        if "Cláusula 9" in line or "Clause 9" in line:
            c9_lines.extend(lines[i:i+6])
    for line in c9_lines:
        print(f"  C9: {line.strip()}")
        
    # Check 5: Validity Term
    print("Check 5: Validity / Clause 3")
    c3_lines = []
    for i, line in enumerate(lines):
        if "Cláusula 3" in line or "Clause 3" in line:
            c3_lines.extend(lines[i:i+4])
    for line in c3_lines:
        print(f"  C3: {line.strip()}")
        
    # Check 6: Synchronization / Clause 5
    print("Check 6: Synchronization / Clause 5")
    c5_lines = []
    for i, line in enumerate(lines):
        if "Cláusula 5" in line or "Clause 5" in line or "Sincronización Comercial:" in line:
            c5_lines.extend(lines[i:i+4])
    for line in c5_lines:
        print(f"  C5: {line.strip()}")
