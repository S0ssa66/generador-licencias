#!/usr/bin/env python3
import json
import os
import csv
import re
import time
from datetime import datetime

# Definición de rutas
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(DIRECTORY, 'csv_beatstars_completo.csv')
# BACKUP_PATH is now dynamic

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6,
    "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12
}

def parse_beatstars_date(date_str):
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d")
    
    # Buscar mes, día y año (ej: "April 11, 2026")
    match = re.search(r"([A-Za-z]+)\s+(\d+),\s+(\d{4})", date_str)
    if match:
        month_name = match.group(1).lower()
        day = int(match.group(2))
        year = int(match.group(3))
        month_num = MONTHS.get(month_name, 1)
        return f"{year:04d}-{month_num:02d}-{day:02d}"
    return datetime.now().strftime("%Y-%m-%d")

def clean_beat_name(name):
    if not name:
        return "Beat"
    # Eliminar " (COLLABORATOR)"
    name = re.sub(r"\s*\(collaborator\)\s*", "", name, flags=re.IGNORECASE)
    # Eliminar prefijo "Type Beat " si lo tuviera
    name = re.sub(r"^type beat\s+", "", name, flags=re.IGNORECASE)
    return name.strip()

def make_beat_id(name):
    normalized = re.sub(r"[^a-zA-Z0-9\s]", "", name).strip().lower()
    normalized = re.sub(r"\s+", "_", normalized)
    return f"beat_{normalized}"

def run_import():
    print("[*] Iniciando importación de transacciones de Beatstars...")
    
    print("\n¿A qué cuenta deseas importar los datos?")
    print("1) Sossa")
    print("2) CG Monarco")
    opcion = input("Elige una opción (1 o 2): ")
    user_prefix = 'cgmonarco' if opcion == '2' else 'sossa'
    
    BACKUP_PATH = os.path.join(DIRECTORY, f'{user_prefix}_backup_sincronizado.json')
    
    # 1. Cargar archivo de base de datos actual
    if not os.path.exists(BACKUP_PATH):
        print(f"[!] No se encontró {user_prefix}_backup_sincronizado.json. Creando uno vacío...")
        backup_data = {
            f"{user_prefix}_producer_config": "{}",
            f"{user_prefix}_license_history": "[]",
            f"{user_prefix}_contacts": "[]",
            f"{user_prefix}_beats": "[]"
        }
    else:
        try:
            with open(BACKUP_PATH, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
        except Exception as e:
            print(f"[!] Error al leer el backup: {e}")
            return

    history_key = f"{user_prefix}_license_history"
    contacts_key = f"{user_prefix}_contacts"
    beats_key = f"{user_prefix}_beats"

    # Decodificar sub-estructuras
    try:
        contacts = json.loads(backup_data.get(contacts_key) or "[]")
    except Exception:
        contacts = []

    try:
        beats = json.loads(backup_data.get(beats_key) or "[]")
    except Exception:
        beats = []

    try:
        history = json.loads(backup_data.get(history_key) or "[]")
    except Exception:
        history = []

    # Mapeo de búsqueda rápida para evitar duplicados
    existing_contacts_emails = {c['email'].lower(): c for c in contacts if 'email' in c}
    existing_beats_names = {b['name'].lower(): b for b in beats if 'name' in b}
    existing_history_refs = {h['refCode']: h for h in history if 'refCode' in h}

    new_contacts_count = 0
    new_beats_count = 0
    new_licenses_count = 0

    # 2. Leer e importar CSV
    if not os.path.exists(CSV_PATH):
        print(f"[❌] Error: No se encontró el archivo CSV en la ruta: {CSV_PATH}")
        return

    # Usaremos carry-forward para soportar facturas multi-item
    last_invoice = ""
    last_date = ""
    last_customer_name = ""
    last_customer_email = ""

    with open(CSV_PATH, 'r', encoding='utf-8') as csv_file:
        # Saltar posibles cabeceras previas (Beatstars incluye a veces la palabra "Transactions" en la línea 1)
        lines = csv_file.readlines()
        cleaned_lines = []
        for line in lines:
            if line.strip() == "Transactions" or not line.strip():
                continue
            cleaned_lines.append(line)
        
        reader = csv.DictReader(cleaned_lines)
        
        for row in reader:
            # Limpiar espacios en los nombres de columnas y valores
            cleaned_row = {k.strip(): v.strip() for k, v in row.items() if k is not None and v is not None}
            
            # Carry-forward si está vacío
            invoice = cleaned_row.get("Invoice Number") or last_invoice
            date_raw = cleaned_row.get("Date") or last_date
            customer_name = cleaned_row.get("Customer Name") or last_customer_name
            customer_email = cleaned_row.get("Customer Email") or last_customer_email
            
            # Actualizar memoria carry-forward
            last_invoice = invoice
            last_date = date_raw
            last_customer_name = customer_name
            last_customer_email = customer_email

            if not invoice:
                continue # Fila no procesable

            item_name = cleaned_row.get("Item Name", "")
            if not item_name:
                continue

            cleaned_beat = clean_beat_name(item_name)
            sale_price_raw = cleaned_row.get("Sale Price", "0")
            try:
                sale_price = float(sale_price_raw)
            except ValueError:
                sale_price = 0.0

            # --- A. Importar Contacto ---
            email_lower = customer_email.lower() if customer_email else ""
            if email_lower and email_lower not in existing_contacts_emails:
                new_contact = {
                    "name": customer_name or "Comprador Beatstars",
                    "email": customer_email,
                    "phone": "",
                    "city": "",
                    "country": "",
                    "id": "",
                    "updatedAt": int(time.time() * 1000)
                }
                contacts.append(new_contact)
                existing_contacts_emails[email_lower] = new_contact
                new_contacts_count += 1

            # --- B. Importar Beat ---
            beat_lower = cleaned_beat.lower()
            if beat_lower and beat_lower not in existing_beats_names:
                new_beat = {
                    "id": make_beat_id(cleaned_beat),
                    "name": cleaned_beat,
                    "mp3": "",
                    "wav": "",
                    "stems": "",
                    "updatedAt": int(time.time() * 1000)
                }
                beats.append(new_beat)
                existing_beats_names[beat_lower] = new_beat
                new_beats_count += 1

            # --- C. Importar Licencia al Historial ---
            # Para facturas multi-item, diferenciamos el código de referencia agregando el nombre del beat si es necesario
            ref_code = invoice
            if ref_code in existing_history_refs:
                # Si ya existe exactamente con esta factura, podría ser otro item de la misma factura
                # Creamos una sub-referencia agregando el nombre del beat para evitar duplicados
                ref_code = f"{invoice}-{cleaned_beat.upper().replace(' ', '_')}"

            if ref_code not in existing_history_refs:
                formatted_date = parse_beatstars_date(date_raw)
                
                # Clasificar tipo de licencia por precio
                if sale_price <= 35:
                    lic_type = "basic"
                    formats = "MP3"
                    streams = "100,000"
                    physical = "3,000"
                    videos = "1"
                elif sale_price <= 65:
                    lic_type = "premium"
                    formats = "MP3 y WAV"
                    streams = "500,000"
                    physical = "10,000"
                    videos = "2"
                else:
                    lic_type = "premium_plus"
                    formats = "MP3, WAV y STEMS"
                    streams = "Ilimitado"
                    physical = "Ilimitado"
                    videos = "Ilimitado"

                new_license = {
                    "refCode": ref_code,
                    "date": formatted_date,
                    "beatName": cleaned_beat,
                    "buyerName": customer_name or "Comprador Beatstars",
                    "type": lic_type,
                    "value": int(sale_price) if sale_price > 0 else 30,
                    "paymentMethod": "PayPal (Beatstars)",
                    "formData": {
                        "buyerId": "",
                        "buyerEmail": customer_email,
                        "buyerPhone": "",
                        "buyerCity": "",
                        "buyerCountry": "",
                        "celebrationPlace": "Quito, Ecuador",
                        "formats": formats,
                        "streams": streams,
                        "physical": physical,
                        "videos": videos,
                        "videoDuration": "cinco (5) minutos" if lic_type != "premium_plus" else "Sin límite",
                        "years": "diez (10) años" if lic_type != "premium_plus" else "Perpetuo",
                        "terminationFee": f"200% (${2 * int(sale_price if sale_price > 0 else 30)}.00 USD)",
                        "writerShare": 50,
                        "producerShare": 50,
                        "credits": f'"Producido por Sossa" o "Prod. por Sossa"' if user_prefix == 'sossa' else f'"Producido por CG Monarco" o "Prod. por CG Monarco"',
                        "contentId": True
                    }
                }
                history.append(new_license)
                existing_history_refs[ref_code] = new_license
                new_licenses_count += 1

    # Ordenar historial por fecha de forma descendente
    history.sort(key=lambda x: x.get('date', ''), reverse=True)

    # 5. Guardar backup actualizado
    backup_data[history_key] = json.dumps(history, ensure_ascii=False)
    backup_data[contacts_key] = json.dumps(contacts, ensure_ascii=False)
    backup_data[beats_key] = json.dumps(beats, ensure_ascii=False)
    
    with open(BACKUP_PATH, 'w', encoding='utf-8') as f:
        json.dump(backup_data, f, indent=2, ensure_ascii=False)
        
    print(f"\n[*] Guardado exitosamente en {user_prefix}_backup_sincronizado.json.")
    print(f"    - Contactos nuevos añadidos: {new_contacts_count} (Total en base: {len(contacts)})")
    print(f"    - Beats nuevos añadidos: {new_beats_count} (Total en base: {len(beats)})")
    print(f"    - Licencias históricas añadidas: {new_licenses_count} (Total en base: {len(history)})")
    print(f"[*] El archivo '{BACKUP_PATH}' ha sido actualizado.")
    print("[*] NOTA: Simplemente recarga 'http://localhost:8000' en tu navegador para cargar los nuevos datos y subirlos a Google Drive.")

if __name__ == '__main__':
    run_import()
