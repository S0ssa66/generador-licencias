#!/usr/bin/env python3
import os
import shutil
import re

VAULT_DIR = "/Users/sossa/IA"
PROJECT_DIR = os.path.join(VAULT_DIR, "generador-licencias")
DOCS_DIR = os.path.join(PROJECT_DIR, "docs")
DASHBOARD_PATH = os.path.join(PROJECT_DIR, "Dashboard BEATSS.md")

CATEGORIES = {
    "10_Pagos": ["stripe", "ebay", "pago", "order", "receipt", "invoice", "financiera", "fee"],
    "20_Soporte": ["ayuda", "soporte", "faq", "guide", "educacion"],
    "30_Contratos": ["contrato", "licencia", "permiso", "autorizacion", "signature", "firma", "release"],
    "40_Subagentes": ["agent", "subagent", "coordinador", "expert"],
    "50_Seguridad": ["security", "audit", "rules", "vulnerabilidad", "firewall", "auth"]
}

def clean_name(name):
    # Convert file name to human readable name
    name = re.sub(r'[\-_]', ' ', name)
    return name.title()

def organize_files():
    print("Organizing files in the Obsidian vault root...")
    if not os.path.exists(VAULT_DIR):
        print(f"Vault directory {VAULT_DIR} does not exist!")
        return
        
    # Scan files in the vault root
    for entry in os.listdir(VAULT_DIR):
        entry_path = os.path.join(VAULT_DIR, entry)
        if os.path.isfile(entry_path) and not entry.startswith('.'):
            filename_lower = entry.lower()
            ext = os.path.splitext(entry)[1].lower()
            
            # We only move PDFs, Markdown, and TXT documentation
            if ext in ['.pdf', '.md', '.txt']:
                moved = False
                for cat, keywords in CATEGORIES.items():
                    if any(kw in filename_lower for kw in keywords):
                        dest_dir = os.path.join(DOCS_DIR, cat)
                        os.makedirs(dest_dir, exist_ok=True)
                        dest_path = os.path.join(dest_dir, entry)
                        shutil.move(entry_path, dest_path)
                        print(f"[+] Moved: {entry} -> docs/{cat}/")
                        moved = True
                        break
                if not moved:
                    # Default: if it's a PDF/MD and doesn't match any specific category keyword,
                    # we can default it to 30_Contratos for general PDFs, or keep it in the root.
                    if ext == '.pdf' and ('contrato' in filename_lower or 'permiso' in filename_lower or 'beatss' in filename_lower):
                        dest_dir = os.path.join(DOCS_DIR, "30_Contratos")
                        os.makedirs(dest_dir, exist_ok=True)
                        shutil.move(entry_path, os.path.join(dest_dir, entry))
                        print(f"[+] Moved default: {entry} -> docs/30_Contratos/")

def generate_dashboard():
    print("Generating Dashboard BEATSS.md...")
    header = """# 🎛️ Panel de Control - BEATSS

Bienvenido a la Bóveda de Documentación de **BEATSS**. Este panel sirve como el punto central de navegación para todos los análisis, reportes de viabilidad, auditorías de seguridad, y estados operativos de la plataforma.

---

## 🗂️ Categorías de Documentación
"""

    sections = []
    cats = ["10_Pagos", "20_Soporte", "30_Contratos", "40_Subagentes", "50_Seguridad"]
    cat_titles = {
        "10_Pagos": "💳 10. Pagos y Viabilidad Financiera\nDocumentos relacionados con la integración de pasarelas de pago y la viabilidad del cobro internacional desde Ecuador.",
        "20_Soporte": "🤝 20. Soporte y Educación al Cliente\nGuías y recursos estructurados para optimizar la experiencia de soporte de BEATSS.",
        "30_Contratos": "📜 30. Contratos y Licenciamiento\nAnálisis de la legalidad de los contratos generados y su formato de impresión.",
        "40_Subagentes": "🤖 40. Organización de Subagentes\nEl funcionamiento, roles y estructura de integración con Obsidian de los 21 subagentes de la plataforma.",
        "50_Seguridad": "🔒 50. Seguridad de Datos\nAnálisis de vulnerabilidades y seguridad del backend."
    }

    for cat in cats:
        section_text = f"### {cat_titles[cat]}\n"
        cat_dir = os.path.join(DOCS_DIR, cat)
        os.makedirs(cat_dir, exist_ok=True)
        
        files = sorted(os.listdir(cat_dir))
        links = []
        for f in files:
            if f.startswith('.'):
                continue
            name_no_ext, ext = os.path.splitext(f)
            friendly_name = clean_name(name_no_ext)
            link_path = f"generador-licencias/docs/{cat}/{name_no_ext}"
            links.append(f"*   **[[{link_path}|{friendly_name} ({ext[1:].upper()})]]**")
        
        if links:
            section_text += "\n".join(links) + "\n"
        else:
            section_text += "*Sin documentos en esta categoría.*\n"
        sections.append(section_text)

    middle = "\n".join(sections)
    
    footer = """
---

## ⚙️ Progreso y Bitácoras de Desarrollo

*   **[[generador-licencias/backlog_mejoras|Backlog de Mejoras]]**: Lista de prioridades pendientes y completadas para la evolución técnica y de negocio de BEATSS.
*   **[[generador-licencias/task|Bitácora de Tareas (task.md)]]**: Registro detallado de tareas operativas realizadas durante la sesión de desarrollo actual.
*   **[[generador-licencias/walkthrough|Walkthrough de Cambios (walkthrough.md)]]**: Resumen del proceso de modularización de `main.js`, corrección de bugs de UI y optimización de checkout.

---

## 💡 Consejo Premium de Obsidian
Para mantener esta bóveda visualmente limpia y enfocarte solo en la documentación, te recomendamos excluir las carpetas de código y dependencias. En Obsidian, ve a:
1. **Configuración** (icono de engranaje) ➔ **Archivos y enlaces (Files and Links)**.
2. Busca la opción **Archivos excluidos (Excluded files)**.
3. Añade las siguientes rutas para ocultar el ruido del código:
   - `generador-licencias/node_modules/`
   - `generador-licencias/dist/`
   - `generador-licencias/.venv/`
   - `generador-licencias/.git/`
   - `generador-licencias/.vercel/`
"""

    full_content = header + "\n" + middle + "\n" + footer
    with open(DASHBOARD_PATH, "w", encoding="utf-8") as f:
        f.write(full_content)
    print("Dashboard BEATSS.md updated successfully!")

if __name__ == "__main__":
    organize_files()
    generate_dashboard()
