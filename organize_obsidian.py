#!/usr/bin/env python3
import os
import shutil
import re
import time

VAULT_DIR = "/Users/sossa/IA"
PROJECT_DIR = os.path.join(VAULT_DIR, "generador-licencias")
DOCS_DIR = os.path.join(PROJECT_DIR, "docs")
DASHBOARD_PATH = os.path.join(PROJECT_DIR, "Dashboard BEATSS.md")

CATEGORIES = {
    "10_Pagos": ["stripe", "ebay", "pago", "order", "receipt", "invoice", "financiera", "fee", "payphone", "deuna", "kushki", "pagoplux", "transferencia", "sri", "ruc", "cedula", "factura", "xml", "p12", "firma", "billing", "taxes", "impuestos", "rimpe"],
    "20_Soporte": ["ayuda", "soporte", "faq", "guide", "educacion", "client", "customer", "ticket", "claim", "contentid", "disputa", "reclamacion"],
    "30_Contratos": ["contrato", "licencia", "permiso", "autorizacion", "signature", "firma", "release", "terms", "condiciones", "privacidad", "acuerdo", "split", "sheet", "master"],
    "40_Subagentes": ["agent", "subagent", "coordinador", "expert", "prompt", "system", "orchestrator", "coordination", "multiagent", "ai"],
    "50_Seguridad": ["security", "audit", "rules", "vulnerabilidad", "firewall", "auth", "password", "key", "token", "secret", "cors", "encryption", "ssl", "credentials"],
    "90_Otros": []
}

def clean_name(name):
    # Convert file name to human readable name
    name = re.sub(r'[\-_]', ' ', name)
    return name.title()

def get_file_metadata(filepath):
    """Calcula el tamaño del archivo formateado y la fecha de última modificación."""
    try:
        stat = os.stat(filepath)
        size_kb = stat.st_size / 1024
        if size_kb < 1024:
            size_str = f"{size_kb:.1f} KB"
        else:
            size_str = f"{size_kb/1024:.1f} MB"
        mtime = time.strftime('%Y-%m-%d %H:%M', time.localtime(stat.st_mtime))
        return f"{size_str}, modificado: {mtime}"
    except Exception:
        return ""

def get_markdown_summary(filepath):
    """Extrae el resumen del bloque frontmatter YAML o el primer párrafo de contenido de un archivo MD/TXT."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Intentar extraer desde frontmatter YAML
        match = re.match(r'^---\s*\n(.*?)\n---\s*\n', content, re.DOTALL)
        if match:
            frontmatter = match.group(1)
            desc_match = re.search(r'^(?:description|summary|desc):\s*(.*)$', frontmatter, re.MULTILINE | re.IGNORECASE)
            if desc_match:
                return desc_match.group(1).strip().strip('"\'')
        
        # Fallback: buscar el primer párrafo que no sea un encabezado, línea de frontmatter, o lista
        lines = content.split('\n')
        for line in lines:
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('---') or line.startswith('*') or line.startswith('-'):
                continue
            # Limpiar posibles sintaxis de links de markdown/Obsidian
            cleaned = re.sub(r'\[\[(.*?)\]\]', r'\1', line)  # Obsidian links [[Link|Texto]] o [[Link]]
            cleaned = re.sub(r'\[(.*?)\]\(.*?\)', r'\1', cleaned)  # Markdown links [Texto](url)
            cleaned = re.sub(r'[\*_`~]', '', cleaned)  # Eliminar formato negrita, itálica, etc.
            
            # Devolver truncado a 140 caracteres
            return cleaned[:140] + '...' if len(cleaned) > 140 else cleaned
    except Exception:
        pass
    return ""

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
                    if cat == "90_Otros":
                        continue
                    if any(kw in filename_lower for kw in keywords):
                        dest_dir = os.path.join(DOCS_DIR, cat)
                        os.makedirs(dest_dir, exist_ok=True)
                        dest_path = os.path.join(dest_dir, entry)
                        shutil.move(entry_path, dest_path)
                        print(f"[+] Moved: {entry} -> docs/{cat}/")
                        moved = True
                        break
                if not moved:
                    # Move to fallback 90_Otros
                    dest_dir = os.path.join(DOCS_DIR, "90_Otros")
                    os.makedirs(dest_dir, exist_ok=True)
                    shutil.move(entry_path, os.path.join(dest_dir, entry))
                    print(f"[+] Moved fallback: {entry} -> docs/90_Otros/")

def generate_dashboard():
    print("Generating Dashboard BEATSS.md...")
    header = """# 🎛️ Panel de Control - BEATSS

Bienvenido a la Bóveda de Documentación de **BEATSS**. Este panel sirve como el punto central de navegación para todos los análisis, reportes de viabilidad, auditorías de seguridad, y estados operativos de la plataforma.

---

## 🗂️ Categorías de Documentación
"""

    sections = []
    cats = ["10_Pagos", "20_Soporte", "30_Contratos", "40_Subagentes", "50_Seguridad", "90_Otros"]
    cat_titles = {
        "10_Pagos": "💳 10. Pagos, SRI y Viabilidad Financiera\nDocumentos de pasarelas de pago (PayPhone, Deuna!, Stripe), facturación electrónica del SRI y contabilidad local.",
        "20_Soporte": "🤝 20. Soporte y Educación al Cliente\nGuías de soporte, preguntas frecuentes y asistencia sobre reclamos de Content ID.",
        "30_Contratos": "📜 30. Contratos y Licenciamiento\nLicencias de beats, acuerdos de splits de regalías, contratos de distribución y políticas.",
        "40_Subagentes": "🤖 40. Organización de Subagentes\nEstructuras de prompts, flujos de orquestación y funcionamiento técnico de la red de subagentes.",
        "50_Seguridad": "🔒 50. Seguridad de Datos\nAuditorías de Firebase, configuraciones de CORS, manejo de tokens y llaves de cifrado.",
        "90_Otros": "📂 90. Otros Documentos\nDocumentos y archivos varios clasificados automáticamente sin palabras clave específicas."
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
            filepath = os.path.join(cat_dir, f)
            
            meta = get_file_metadata(filepath)
            summary = ""
            if ext in ['.md', '.txt']:
                summary = get_markdown_summary(filepath)
                
            display_meta = f" *({ext[1:].upper()} - {meta})*" if meta else f" *({ext[1:].upper()})*"
            links.append(f"*   **[[{link_path}|{friendly_name}]]**{display_meta}")
            if summary:
                links.append(f"    *{summary}*")
        
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
