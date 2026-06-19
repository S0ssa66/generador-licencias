#!/usr/bin/env python3
import http.server
import json
import os
import sys
import threading
import urllib
import urllib.request
import urllib.error
import urllib.parse
from urllib.parse import urlparse, parse_qs
import subprocess
import tempfile
import hashlib
import base64
import datetime
import re
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.pdfgen import canvas
import sri_invoicing
import sri_ride

from server_utils import get_admin_token, resolve_backup_file
from pdf_generator import generate_pdf_from_contract
from sri_service import emitir_factura_sri_background, actualizar_secuencial_sri, actualizar_estado_factura_db
from payment_verifier import verify_paypal_order, update_user_plan_in_firestore, confirm_payment_in_firestore
from organize_obsidian import organize_files, generate_dashboard
PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Crear carpeta de caché para audios mezclados si no existe
CACHE_DIR = os.path.join(DIRECTORY, 'temp_audio_cache')
os.makedirs(CACHE_DIR, exist_ok=True)

# Asegurar rutas comunes de Homebrew en el PATH para localización de ffmpeg
common_paths = ["/opt/homebrew/bin", "/usr/local/bin"]
for path in common_paths:
    if path not in os.environ.get("PATH", ""):
        os.environ["PATH"] = path + os.pathsep + os.environ.get("PATH", "")

# Asegurar que se puede importar el coordinador de agentes
sys.path.append(DIRECTORY)
import agente_coordinador

def update_firestore_task(task_id, id_token, estado, progreso=None, resultado=None):
    """Actualiza una tarea en Firestore usando la API REST con el token de autenticación del usuario."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    
    # Construir máscara de campos a actualizar
    params = ["updateMask.fieldPaths=estado"]
    fields = {
        "estado": {"stringValue": estado}
    }
    
    if progreso is not None:
        params.append("updateMask.fieldPaths=progreso")
        fields["progreso"] = {"stringValue": progreso}
        
    if resultado is not None:
        params.append("updateMask.fieldPaths=resultado")
        fields["resultado"] = {"stringValue": resultado}
        
    url_params = "&".join(params)
    full_url = f"{url}?{url_params}"
    
    payload = {
        "fields": fields
    }
    
    headers = {
        "Authorization": f"Bearer {id_token}",
        "Content-Type": "application/json"
    }
    
    req = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Error al actualizar Firestore REST: {e}")
        return None

def get_firestore_task(task_id, id_token):
    """Obtiene una tarea de Firestore usando la API REST."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/tasks/{task_id}"
    headers = {
        "Authorization": f"Bearer {id_token}"
    }
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            fields = res_data.get("fields", {})
            return {
                "tipo": fields.get("tipo", {}).get("stringValue", ""),
                "consulta": fields.get("consulta", {}).get("stringValue", ""),
                "userId": fields.get("userId", {}).get("stringValue", "")
            }
    except Exception as e:
        print(f"[-] Error al obtener tarea de Firestore REST: {e}")
        return None

def process_async_task(task_id, id_token):
    """Worker asíncrono que procesa la tarea utilizando el pipeline de agentes en segundo plano."""
    print(f"[*] [Worker] Iniciando procesamiento de tarea {task_id}...")
    try:
        # 1. Obtener la tarea de Firestore
        task = get_firestore_task(task_id, id_token)
        if not task:
            print(f"[-] [Worker] No se pudo cargar la tarea {task_id} de Firestore.")
            update_firestore_task(task_id, id_token, "failed", progreso="Error al leer la tarea desde la base de datos.")
            return
            
        consulta = task.get("consulta", "")
        if not consulta:
            print(f"[-] [Worker] Consulta vacía en tarea {task_id}.")
            update_firestore_task(task_id, id_token, "failed", progreso="La consulta de la tarea está vacía.")
            return
            
        # 2. Poner la tarea en procesamiento
        update_firestore_task(task_id, id_token, "processing", progreso="Iniciando motor de agentes...")
        
        # 3. Callback para actualizar progreso en Firestore
        def progress_cb(msg):
            print(f"[*] [Worker Task {task_id}] {msg}")
            update_firestore_task(task_id, id_token, "processing", progreso=msg)
            
        # 4. Ejecutar el pipeline de agentes
        resultado = agente_coordinador.run_agent_pipeline(consulta, progress_cb)
        
        # 5. Marcar como completada
        print(f"[+] [Worker] Tarea {task_id} completada exitosamente.")
        update_firestore_task(task_id, id_token, "completed", progreso="Tarea finalizada con éxito.", resultado=resultado)
        
    except Exception as e:
        print(f"[-] [Worker] Error fatal al procesar tarea {task_id}: {str(e)}")
        update_firestore_task(task_id, id_token, "failed", progreso="Error interno al procesar la tarea.", resultado=str(e))

import subprocess
import time



def get_admin_config():
    """
    Carga y expone la configuración pública del administrador (sossa) para 
    el procesamiento de cobros de suscripción de la plataforma.
    """
    backup_path = os.path.join(DIRECTORY, 'sossa_backup_sincronizado.json')
    if os.path.exists(backup_path):
        try:
            with open(backup_path, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
            # Buscar la configuración del productor
            for key, val in backup_data.items():
                if key.endswith('_producer_config') and val:
                    config_data = json.loads(val) if isinstance(val, str) else val
                    return {
                        "paypalClientId": config_data.get("paypalClientId", "AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-"),
                        "paypalClientSecret": config_data.get("paypalClientSecret", ""),
                        "payphoneClientId": config_data.get("payphoneClientId", ""),
                        "payphoneAppId": config_data.get("payphoneAppId", ""),
                        "deunaPhone": config_data.get("deunaPhone", "+593961201184"),
                        "deunaName": config_data.get("deunaName", "Joao David Dominguez Sosa"),
                        "bankPichinchaAcc": config_data.get("bankPichinchaAcc", "2205256268"),
                        "bankPichinchaName": config_data.get("bankPichinchaName", "Joao Dominguez"),
                        "bankPichinchaDni": config_data.get("bankPichinchaDni", "080374311")
                    }
        except Exception as e:
            print(f"[-] Error al cargar config de administrador: {e}")
    # Valores de contingencia / fallback
    return {
        "paypalClientId": "AaZODyYne1mAl_ujEEAr5tP2hRcm2ii_1QSzAhexfXKMdue-aVQRX_kbPLUgmpm1ZimxFSWpejImUU1-",
        "paypalClientSecret": "",
        "payphoneClientId": "",
        "payphoneAppId": "",
        "deunaPhone": "+593961201184",
        "deunaName": "Joao David Dominguez Sosa",
        "bankPichinchaAcc": "2205256268",
        "bankPichinchaName": "Joao Dominguez",
        "bankPichinchaDni": "080374311"
    }


def save_license_hash_in_firestore(producer_id, ref_code, crypto_hash):
    """Guarda el hash criptográfico en la licencia correspondiente en Firestore."""
    token = get_admin_token()
    if not token:
        print("[-] No se pudo obtener el token de administrador para guardar el hash de la licencia.")
        return False
        
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{producer_id}/licencias/{ref_code}"
    
    req_get = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"}, method="GET")
    try:
        with urllib.request.urlopen(req_get) as response:
            json.loads(response.read().decode("utf-8"))
    except Exception as e:
        print(f"[-] Licencia {ref_code} no encontrada en Firestore al intentar guardar hash: {e}")
        return False
        
    params = ["updateMask.fieldPaths=cryptoHash"]
    full_url = f"{url}?{'&'.join(params)}"
    payload = {
        "fields": {
            "cryptoHash": {"stringValue": crypto_hash}
        }
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    req_patch = urllib.request.Request(full_url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
    try:
        with urllib.request.urlopen(req_patch) as response:
            print(f"[+] Crypto-Hash guardado en Firestore para la licencia: {ref_code}")
            return True
    except Exception as e:
        print(f"[-] Error al guardar hash de licencia en Firestore REST: {e}")
        return False

def save_license_hash_in_local_backup(producer_id, ref_code, crypto_hash):
    """Guarda el hash criptográfico en la licencia correspondiente en el respaldo físico local."""
    filepath, username = resolve_backup_file(producer_id)
    if not os.path.exists(filepath):
        return False
        
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup_data = json.load(f)
            
        history_key = f"{producer_id}_license_history"
        if history_key not in backup_data:
            history_key = f"{username}_license_history"
        history_str = backup_data.get(history_key, '[]')
        licenses = json.loads(history_str)
        
        updated = False
        for lic in licenses:
            if lic.get('refCode') == ref_code:
                lic['cryptoHash'] = crypto_hash
                updated = True
                break
                
        if updated:
            backup_data[history_key] = json.dumps(licenses)
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, indent=2, ensure_ascii=False)
            print(f"[+] Crypto-Hash guardado en el respaldo local para la licencia: {ref_code}")
            return True
    except Exception as e:
        print(f"[-] Error al guardar hash de licencia en respaldo local: {e}")
        
    return False

def get_sales_analytics(user='sossa', period='all'):
    backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
    if not os.path.exists(backup_path):
        return {"error": f"No backup file found for user {user}"}
        
    with open(backup_path, 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
        
    history_str = backup_data.get(f'{user}_license_history', '[]')
    licenses = json.loads(history_str)
    
    now = datetime.datetime.now()
    current_year = now.year
    current_month_prefix = f"{current_year}-{now.month:02d}"
    current_year_prefix = f"{current_year}"
    
    filtered_licenses = []
    for lic in licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
            
        try:
            lic_date = datetime.datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
            
        if period == '30':
            diff_days = (now - lic_date).days
            if diff_days <= 30:
                filtered_licenses.append(lic)
        elif period == 'month':
            if date_str.startswith(current_month_prefix):
                filtered_licenses.append(lic)
        elif period == 'year':
            if date_str.startswith(current_year_prefix):
                filtered_licenses.append(lic)
        else:
            filtered_licenses.append(lic)
            
    total_revenue = 0.0
    beats_sold = set()
    buyers_map = {}
    
    for lic in filtered_licenses:
        val = 0.0
        try:
            val = float(lic.get('value', 0))
        except (ValueError, TypeError):
            pass
        total_revenue += val
        
        beat_name = lic.get('beatName')
        if beat_name:
            beats_sold.add(beat_name)
            
        buyer_name = lic.get('buyerName')
        if buyer_name:
            if buyer_name not in buyers_map:
                form_data = lic.get('formData', {})
                email = form_data.get('buyerEmail', '') if isinstance(form_data, dict) else ''
                buyers_map[buyer_name] = {
                    "count": 0,
                    "total": 0.0,
                    "email": email
                }
            buyers_map[buyer_name]["count"] += 1
            buyers_map[buyer_name]["total"] += val
            
    top_buyer_name = 'N/A'
    top_buyer_val = 0.0
    for name, b_info in buyers_map.items():
        if b_info["total"] > top_buyer_val:
            top_buyer_val = b_info["total"]
            top_buyer_name = name
            
    monthly_sales = []
    month_keys = []
    for i in range(5, -1, -1):
        m_offset = now.month - i
        y_offset = now.year
        while m_offset <= 0:
            m_offset += 12
            y_offset -= 1
        month_keys.append((y_offset, m_offset))
        
    month_names_es = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]
    
    for y, m in month_keys:
        prefix = f"{y}-{m:02d}"
        label = f"{month_names_es[m-1]}"
        monthly_sales.append({
            "prefix": prefix,
            "label": label,
            "revenue": 0.0,
            "count": 0
        })
        
    for lic in filtered_licenses:
        date_str = lic.get('date', '')
        if not date_str:
            continue
        lic_prefix = date_str[:7]
        for m_data in monthly_sales:
            if m_data["prefix"] == lic_prefix:
                val = 0.0
                try:
                    val = float(lic.get('value', 0))
                except (ValueError, TypeError):
                    pass
                m_data["revenue"] += val
                m_data["count"] += 1
                
    license_types_count = {}
    for lic in filtered_licenses:
        l_type = lic.get('type') or lic.get('licenseType') or 'basic'
        l_type_title = l_type.capitalize()
        if l_type.lower() == 'basic':
            l_type_title = 'Básica'
        elif l_type.lower() == 'premium':
            l_type_title = 'Premium'
        elif l_type.lower() in ['unlimited', 'unlimited_flp', 'ilimitada']:
            l_type_title = 'Ilimitada'
        elif l_type.lower() == 'exclusive' or l_type.lower() == 'exclusiva':
            l_type_title = 'Exclusiva'
            
        license_types_count[l_type_title] = license_types_count.get(l_type_title, 0) + 1
        
    total_lic_count = len(filtered_licenses)
    license_types = []
    colors_map = {
        "Básica": "#3b82f6",
        "Premium": "#10b981",
        "Ilimitada": "#f59e0b",
        "Exclusiva": "#a855f7"
    }
    
    for l_type, count in license_types_count.items():
        pct = (count / total_lic_count * 100) if total_lic_count > 0 else 0
        license_types.append({
            "type": l_type,
            "count": count,
            "pct": pct,
            "color": colors_map.get(l_type, "#718096")
        })
        
    beats_count = {}
    for lic in filtered_licenses:
        b_name = lic.get('beatName')
        if b_name:
            beats_count[b_name] = beats_count.get(b_name, 0) + 1
            
    top_beats = sorted(
        [{"name": k, "count": v} for k, v in beats_count.items()],
        key=lambda x: x["count"],
        reverse=True
    )[:5]
    
    top_buyers = sorted(
        [
            {
                "name": k,
                "count": v["count"],
                "total": v["total"],
                "email": v["email"]
            }
            for k, v in buyers_map.items()
        ],
        key=lambda x: x["total"],
        reverse=True
    )[:5]
    
    return {
        "totalRevenue": total_revenue,
        "totalLicenses": len(filtered_licenses),
        "uniqueBeats": len(beats_sold),
        "topBuyerName": top_buyer_name,
        "topBuyerVal": top_buyer_val,
        "monthlySales": monthly_sales,
        "licenseTypes": license_types,
        "topBeats": top_beats,
        "topBuyers": top_buyers
    }

def fetch_firestore_collection(collection_path, token):

    """Obtiene todos los documentos de una colección específica en Firestore usando REST API."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/{collection_path}"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data.get("documents", [])
    except Exception as e:
        return []

def get_gdrive_direct_link(gdrive_url):
    """Convierte un enlace de compartir de Google Drive a un enlace directo de descarga."""
    if not gdrive_url:
        return ""
    # Si es una ruta local o no parece un ID de Drive
    if os.path.exists(gdrive_url) or gdrive_url.startswith("/") or gdrive_url.startswith("."):
        return gdrive_url
        
    file_id = ""
    if "drive.google.com" in gdrive_url:
        if "/file/d/" in gdrive_url:
            parts = gdrive_url.split("/file/d/")
            if len(parts) > 1:
                file_id = parts[1].split("/")[0].split("?")[0]
        elif "id=" in gdrive_url:
            parsed = urlparse(gdrive_url)
            qs = parse_qs(parsed.query)
            file_id = qs.get('id', [""])[0]
    elif len(gdrive_url) > 15 and "/" not in gdrive_url and "." not in gdrive_url:
        file_id = gdrive_url
        
    if file_id:
        return f"https://docs.google.com/uc?export=download&id={file_id}"
    return gdrive_url

def fetch_firestore_document(doc_path, token):
    """Obtiene un documento específico en Firestore usando REST API."""
    url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/{doc_path}"
    headers = {"Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            fields = res_data.get("fields", {})
            parsed_doc = {}
            for key, val in fields.items():
                if "stringValue" in val:
                    parsed_doc[key] = val["stringValue"]
                elif "integerValue" in val:
                    parsed_doc[key] = int(val["integerValue"])
                elif "doubleValue" in val:
                    parsed_doc[key] = float(val["doubleValue"])
                elif "booleanValue" in val:
                    parsed_doc[key] = val["booleanValue"]
            return parsed_doc
    except Exception as e:
        print(f"[-] Error al obtener documento Firestore {doc_path}: {e}")
        return None

def process_watermark_audio(beat_id, user):
    """
    Obtiene la configuración del productor, verifica si tiene marca de agua,
    descarga el MP3, mezcla el tag y guarda el archivo en la caché local.
    """
    backup_file = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
    if not os.path.exists(backup_file):
        return False, "No se encontro el backup del productor"

    try:
        with open(backup_file, 'r', encoding='utf-8') as f:
            db_data = json.load(f)
    except Exception as e:
        return False, f"Error al cargar base de datos: {str(e)}"

    config_key = f"{user}_producer_config"
    producer_config_str = db_data.get(config_key, None)
    if not producer_config_str:
        producer_config = db_data.get("producer_config", {})
    else:
        try:
            producer_config = json.loads(producer_config_str)
        except Exception:
            producer_config = {}

    audio_tag_b64 = producer_config.get("audioTagBase64", "")
    if not audio_tag_b64:
        # Fallback: intentar descargar de Firestore private_config
        uid = None
        for key in db_data.keys():
            if key.endswith('_producer_config'):
                possible_uid = key.replace('_producer_config', '')
                if possible_uid not in ['sossa', 'cgmonarco', 'mrmicua', 'producer']:
                    uid = possible_uid
                    break
        if uid:
            token = get_admin_token()
            if token:
                print(f"[*] Descargando marca de agua desde Firestore private_config para UID {uid}...")
                private_config = fetch_firestore_document(f"users/{uid}/private_config/producer", token)
                if private_config:
                    audio_tag_b64 = private_config.get("audioTagBase64", "")
                    if audio_tag_b64:
                        producer_config["audioTagBase64"] = audio_tag_b64

    if not audio_tag_b64:
        beats_key = f"{user}_beats"
        beats_str = db_data.get(beats_key, "[]")
        try:
            beats = json.loads(beats_str)
        except Exception:
            beats = []
            
        beat = next((b for b in beats if str(b.get("id")) == str(beat_id)), None)
        if beat and beat.get("mp3"):
            return False, f"gdrive_url:{beat.get('mp3')}"
        return False, "Productor no tiene marca de agua configurada ni se encontro el beat"

    beats_key = f"{user}_beats"
    beats_str = db_data.get(beats_key, "[]")
    try:
        beats = json.loads(beats_str)
    except Exception:
        beats = []
        
    beat = next((b for b in beats if str(b.get("id")) == str(beat_id)), None)
    if not beat or not beat.get("mp3"):
        return False, "Beat no encontrado o no tiene archivo MP3 asociado"

    gdrive_mp3_url = beat.get("mp3")
    direct_mp3_link = get_gdrive_direct_link(gdrive_mp3_url)

    tag_hash = hashlib.md5(audio_tag_b64.encode('utf-8')).hexdigest()
    cached_filename = f"{beat_id}_{tag_hash}.mp3"
    cached_filepath = os.path.join(DIRECTORY, 'temp_audio_cache', cached_filename)

    if os.path.exists(cached_filepath) and os.path.getsize(cached_filepath) > 0:
        return True, cached_filepath

    print(f"[*] Mezclando en caliente beat {beat_id} con la marca de agua del productor...")
    
    try:
        if "," in audio_tag_b64:
            b64_data = audio_tag_b64.split(",")[1]
        else:
            b64_data = audio_tag_b64
        
        tag_bytes = base64.b64decode(b64_data)
    except Exception as e:
        return False, f"Error al decodificar tag Base64: {str(e)}"

    temp_tag_fd, temp_tag_path = tempfile.mkstemp(suffix=".mp3")
    temp_spaced_fd, temp_spaced_path = tempfile.mkstemp(suffix=".mp3")
    
    try:
        with os.fdopen(temp_tag_fd, 'wb') as tmp_tag:
            tmp_tag.write(tag_bytes)
            
        os.close(temp_spaced_fd)

        # Paso 1 con FFmpeg: Crear un archivo espaciado con 15 segundos de silencio al final
        cmd_space = [
            "ffmpeg", "-y", "-i", temp_tag_path,
            "-filter_complex", "aevalsrc=0:d=15[silence];[0:a][silence]concat=n=2:v=0:a=1",
            temp_spaced_path
        ]
        
        res_space = subprocess.run(cmd_space, capture_output=True, text=True)
        if res_space.returncode != 0:
            raise RuntimeError(f"FFmpeg fallo al espaciar el tag: {res_space.stderr}")

        # Paso 2 con FFmpeg: Mezclar el tag espaciado en bucle sobre la pista de beat
        cmd_mix = [
            "ffmpeg", "-y", "-i", direct_mp3_link,
            "-filter_complex", f"amovie={temp_spaced_path}:loop=0,asetpts=N/SR/TB[tag];[0:a][tag]amix=inputs=2:duration=first:dropout_transition=2",
            cached_filepath
        ]
        
        res_mix = subprocess.run(cmd_mix, capture_output=True, text=True)
        if res_mix.returncode != 0:
            raise RuntimeError(f"FFmpeg fallo al mezclar los audios: {res_mix.stderr}")

        print(f"[+] Beat {beat_id} mezclado con exito y guardado en cache: {cached_filepath}")
        return True, cached_filepath
        
    except Exception as e:
        print(f"[-] Error durante el procesamiento de marca de agua: {str(e)}")
        if os.path.exists(cached_filepath):
            try: os.remove(cached_filepath)
            except Exception: pass
        return False, f"Fallo al aplicar marca de agua: {str(e)}"
        
    finally:
        try: os.remove(temp_tag_path)
        except Exception: pass
        try: os.remove(temp_spaced_path)
        except Exception: pass

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Si existe la carpeta 'dist' (compilada con Vite), servimos desde ahí para evitar errores de módulos nativos (bare imports)
        dist_dir = os.path.join(DIRECTORY, 'dist')
        serve_dir = dist_dir if os.path.exists(dist_dir) else DIRECTORY
        super().__init__(*args, directory=serve_dir, **kwargs)

    def check_local_auth(self):
        """Verifica que la petición incluya un token de autorización local válido."""
        local_token = os.environ.get('LOCAL_AUTH_TOKEN')
        if not local_token:
            # Si no está configurado, denegamos por seguridad
            return False
            
        auth_header = self.headers.get('Authorization')
        if not auth_header:
            return False
            
        if not auth_header.startswith('Bearer '):
            return False
            
        token = auth_header.split('Bearer ')[1].strip()
        return token == local_token

    def send_cors_headers(self):
        allowed_origins = [
            'http://localhost:8000',
            'http://localhost:5173',
            'http://localhost:3000',
            'http://127.0.0.1:8000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000',
            'https://generador-licencias.vercel.app'
        ]
        origin = self.headers.get('Origin')
        if origin in allowed_origins:
            self.send_header('Access-Control-Allow-Origin', origin)
        else:
            self.send_header('Access-Control-Allow-Origin', 'http://localhost:8000')

    def end_headers(self):
        # Cabeceras de seguridad HTTP globales
        self.send_header('X-Frame-Options', 'DENY')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-XSS-Protection', '1; mode=block')
        self.send_header('Referrer-Policy', 'strict-origin-when-cross-origin')
        self.send_header('Permissions-Policy', 'geolocation=(), camera=(), microphone=(), payment=()')
        csp_header = (
            "default-src 'self' https://*.googleapis.com https://*.firebaseapp.com https://*.google.com; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.googleapis.com https://*.google.com https://cdn.tailwindcss.com https://unpkg.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.payphonetodoesposible.com https://cdn.jsdelivr.net; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: https://*.googleusercontent.com https://chart.googleapis.com https://cdn.payphonetodoesposible.com https://unpkg.com; "
            "media-src 'self' blob: data: https://*.googleusercontent.com; "
            "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://pay.payphonetodoesposible.com https://payphonetodoesposible.com;"
        )
        self.send_header('Content-Security-Policy', csp_header)
        super().end_headers()


    def translate_path(self, path):
        parsed = urlparse(path)
        if parsed.path.startswith('/temp_audio_cache/'):
            filename = os.path.basename(parsed.path)
            return os.path.join(DIRECTORY, 'temp_audio_cache', filename)
        return super().translate_path(path)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/local-token':
            # Check Origin/Referer to ensure it's a local address
            origin = self.headers.get('Origin')
            referer = self.headers.get('Referer')
            
            is_local_origin = False
            local_origins = [
                'http://localhost:8000', 'http://localhost:5173', 'http://localhost:3000',
                'http://127.0.0.1:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'
            ]
            
            # If there is no Origin (same origin request from localhost), allow
            if not origin:
                if referer and any(x in referer for x in ['localhost:', '127.0.0.1:']):
                    is_local_origin = True
                elif not referer:
                    # Direct browser access or same origin without referer
                    is_local_origin = True
            elif origin in local_origins:
                is_local_origin = True
                
            if is_local_origin:
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                token = os.environ.get('LOCAL_AUTH_TOKEN', '')
                self.wfile.write(json.dumps({"token": token}).encode('utf-8'))
            else:
                self.send_response(403)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Forbidden: Token retrieval only allowed from localhost"}')
            return
            
        elif parsed.path == '/api/load-local':
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            # Solo permitir sossa, cgmonarco y mrmicua por seguridad
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "No local backup found"}')
        elif parsed.path == '/api/preview-beat':
            qs = parse_qs(parsed.query)
            beat_id = qs.get('beatId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not beat_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro beatId"}')
                return
                
            # Intentar generar o servir el audio mezclado
            success, result_path_or_err = process_watermark_audio(beat_id, user)
            if success:
                # Redirigir a la URL del archivo en cache local
                filename = os.path.basename(result_path_or_err)
                self.send_response(302)
                self.send_header('Location', f'/temp_audio_cache/{filename}')
                self.send_header('Cache-Control', 'public, max-age=86400')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
            else:
                # Si no se requiere tag o falla la mezcla, redirigir al enlace de origen (Google Drive)
                if "gdrive_url:" in result_path_or_err:
                    direct_link = get_gdrive_direct_link(result_path_or_err.replace("gdrive_url:", ""))
                    self.send_response(302)
                    self.send_header('Location', direct_link)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                else:
                    self.send_response(404)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'{{"error": "{result_path_or_err}"}}'.encode('utf-8'))
        elif parsed.path == '/api/payments/download-ride':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('paymentId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro paymentId"}')
                return
                
            ride_path = None
            xml_autorizado_b64 = None
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                    history_str = db_data.get(f"{user}_license_history", "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        ride_path = payment_entry.get('sriRidePath')
                        if ride_path and not os.path.exists(ride_path):
                            ride_path = None
                        xml_autorizado_b64 = payment_entry.get('sriXmlAutorizadoB64')
            except Exception as e:
                print(f"Error al buscar RIDE localmente: {e}")
                
            if not ride_path and not xml_autorizado_b64:
                token = get_admin_token()
                if token:
                    try:
                        url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                        with urllib.request.urlopen(req) as res:
                            doc = json.loads(res.read().decode('utf-8'))
                            fields = doc.get('fields', {})
                            ride_path = fields.get('sriRidePath', {}).get('stringValue')
                            if ride_path and not os.path.exists(ride_path):
                                ride_path = None
                            xml_autorizado_b64 = fields.get('sriXmlAutorizadoB64', {}).get('stringValue')
                    except Exception as e:
                        print(f"Error al obtener de Firestore en RIDE download: {e}")
                        
            # Auto-recuperación desde el SRI si tenemos clave_acceso pero no tenemos el XML ni el PDF
            if not ride_path and not xml_autorizado_b64 and payment_entry:
                clave_acceso = payment_entry.get('sriClaveAcceso') or payment_entry.get('sriNumeroAutorizacion')
                if clave_acceso and len(clave_acceso) == 49:
                    try:
                        import sri_invoicing
                        ambiente_char = clave_acceso[23]
                        ws_url = sri_invoicing.WS_AUTORIZACION_PROD if ambiente_char == '2' else sri_invoicing.WS_AUTORIZACION_PRUEBAS
                        print(f"[Self-Healing RIDE] Consultado SRI para clave de acceso {clave_acceso}...")
                        soap_res = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_url)
                        parsed = sri_invoicing.parsear_respuesta_autorizacion(soap_res)
                        autorizaciones = parsed.get('autorizaciones', [])
                        if autorizaciones and autorizaciones[0].get('estado') == 'AUTORIZADO':
                            aut = autorizaciones[0]
                            xml_str = aut.get('comprobante')
                            if xml_str:
                                xml_autorizado_b64 = base64.b64encode(xml_str.encode('utf-8')).decode('utf-8')
                                print("[Self-Healing RIDE] XML recuperado del SRI.")
                                
                                # Guardar localmente
                                payment_entry['sriXmlAutorizadoB64'] = xml_autorizado_b64
                                db_data[f"{user}_license_history"] = json.dumps(history, ensure_ascii=False)
                                with open(backup_path, 'w', encoding='utf-8') as f:
                                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                                    
                                # Guardar en Firestore
                                token = get_admin_token()
                                if token:
                                    try:
                                        real_uid = user
                                        if user == 'sossa': real_uid = 'paXbnNbHMMPC31X3hf0oTUx4bbr2'
                                        url_lic = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{real_uid}/licencias/{payment_id}"
                                        payload = {"fields": {"sriXmlAutorizadoB64": {"stringValue": xml_autorizado_b64}}}
                                        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                                        req_lic = urllib.request.Request(f"{url_lic}?updateMask.fieldPaths=sriXmlAutorizadoB64", data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                                        with urllib.request.urlopen(req_lic) as _:
                                            print("[Self-Healing RIDE] XML guardado en Firestore.")
                                    except Exception as fe:
                                        print(f"Error al guardar XML en Firestore: {fe}")
                    except Exception as e:
                        print(f"Error al auto-recuperar XML de SRI: {e}")

            if not ride_path and not xml_autorizado_b64:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No se encontro factura autorizada para este pago"}')
                return
                
            if ride_path and os.path.exists(ride_path):
                try:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'attachment; filename="{os.path.basename(ride_path)}"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(ride_path, 'rb') as f:
                        self.wfile.write(f.read())
                    return
                except Exception as e:
                    print(f"Error al servir archivo RIDE: {e}")
                    
            if xml_autorizado_b64:
                try:
                    xml_str = base64.b64decode(xml_autorizado_b64).decode('utf-8')
                    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                        temp_pdf_path = temp_pdf.name
                    
                    sri_ride.generar_ride_pdf(temp_pdf_path, xml_str)
                    
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/pdf')
                    self.send_header('Content-Disposition', f'attachment; filename="Factura_{payment_id}.pdf"')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    with open(temp_pdf_path, 'rb') as f:
                        self.wfile.write(f.read())
                        
                    try:
                        os.remove(temp_pdf_path)
                    except Exception:
                        pass
                    return
                except Exception as e:
                    self.send_response(500)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(f'{{"error": "Error al generar RIDE PDF: {str(e)}"}}'.encode('utf-8'))
                    return
            
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"error": "Archivo de RIDE no disponible"}')
            
        elif parsed.path == '/api/payments/download-xml':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('paymentId', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro paymentId"}')
                return
                
            xml_autorizado_b64 = None
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        db_data = json.load(f)
                    history_str = db_data.get(f"{user}_license_history", "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        xml_autorizado_b64 = payment_entry.get('sriXmlAutorizadoB64')
            except Exception as e:
                print(f"Error al buscar XML localmente: {e}")
                
            if not xml_autorizado_b64:
                token = get_admin_token()
                if token:
                    try:
                        url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                        with urllib.request.urlopen(req) as res:
                            doc = json.loads(res.read().decode('utf-8'))
                            fields = doc.get('fields', {})
                            xml_autorizado_b64 = fields.get('sriXmlAutorizadoB64', {}).get('stringValue')
                    except Exception as e:
                        print(f"Error al obtener XML de Firestore: {e}")
                        
            # Auto-recuperación desde el SRI si tenemos clave_acceso pero no tenemos el XML
            if not xml_autorizado_b64 and payment_entry:
                clave_acceso = payment_entry.get('sriClaveAcceso') or payment_entry.get('sriNumeroAutorizacion')
                if clave_acceso and len(clave_acceso) == 49:
                    try:
                        import sri_invoicing
                        ambiente_char = clave_acceso[23]
                        ws_url = sri_invoicing.WS_AUTORIZACION_PROD if ambiente_char == '2' else sri_invoicing.WS_AUTORIZACION_PRUEBAS
                        print(f"[Self-Healing XML] Consultado SRI para clave de acceso {clave_acceso}...")
                        soap_res = sri_invoicing.consultar_sri_autorizacion(clave_acceso, ws_url)
                        parsed = sri_invoicing.parsear_respuesta_autorizacion(soap_res)
                        autorizaciones = parsed.get('autorizaciones', [])
                        if autorizaciones and autorizaciones[0].get('estado') == 'AUTORIZADO':
                            aut = autorizaciones[0]
                            xml_str = aut.get('comprobante')
                            if xml_str:
                                xml_autorizado_b64 = base64.b64encode(xml_str.encode('utf-8')).decode('utf-8')
                                print("[Self-Healing XML] XML recuperado del SRI.")
                                
                                # Guardar localmente
                                payment_entry['sriXmlAutorizadoB64'] = xml_autorizado_b64
                                db_data[f"{user}_license_history"] = json.dumps(history, ensure_ascii=False)
                                with open(backup_path, 'w', encoding='utf-8') as f:
                                    json.dump(db_data, f, indent=2, ensure_ascii=False)
                                    
                                # Guardar en Firestore
                                token = get_admin_token()
                                if token:
                                    try:
                                        real_uid = user
                                        if user == 'sossa': real_uid = 'paXbnNbHMMPC31X3hf0oTUx4bbr2'
                                        url_lic = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/users/{real_uid}/licencias/{payment_id}"
                                        payload = {"fields": {"sriXmlAutorizadoB64": {"stringValue": xml_autorizado_b64}}}
                                        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
                                        req_lic = urllib.request.Request(f"{url_lic}?updateMask.fieldPaths=sriXmlAutorizadoB64", data=json.dumps(payload).encode("utf-8"), headers=headers, method="PATCH")
                                        with urllib.request.urlopen(req_lic) as _:
                                            print("[Self-Healing XML] XML guardado en Firestore.")
                                    except Exception as fe:
                                        print(f"Error al guardar XML en Firestore: {fe}")
                    except Exception as e:
                        print(f"Error al auto-recuperar XML de SRI: {e}")

            if not xml_autorizado_b64:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No se encontro XML autorizado para este pago"}')
                return
                
            try:
                xml_str = base64.b64decode(xml_autorizado_b64).decode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'application/xml')
                self.send_header('Content-Disposition', f'attachment; filename="Factura_{payment_id}.xml"')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(xml_str.encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(f'{{"error": "Error al servir XML: {str(e)}"}}'.encode('utf-8'))
        elif parsed.path == '/api/get-order-downloads':
            qs = parse_qs(parsed.query)
            payment_id = qs.get('id', [None])[0]
            accessToken = qs.get('token', [None])[0]
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            if not payment_id:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro id"}')
                return
                
            import hmac
            secret = os.environ.get('DOWNLOAD_SIGNING_KEY', 'dev-signing-key')
            expected_access_token = hmac.new(secret.encode('utf-8'), f"{payment_id}:download".encode('utf-8'), hashlib.sha256).hexdigest()
            
            # En desarrollo local se da acceso si el token coincide
            is_authorized = True
            
            try:
                backup_path = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
                if not os.path.exists(backup_path):
                    raise FileNotFoundError("Respaldo local no encontrado")
                    
                with open(backup_path, 'r', encoding='utf-8') as f:
                    db_data = json.load(f)
                    
                history_str = db_data.get(f"{user}_license_history", "[]")
                history = json.loads(history_str)
                payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                if not payment_entry:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(b'{"error": "Pedido no encontrado"}')
                    return
                    
                beats_str = db_data.get(f"{user}_beats", "[]")
                beats = json.loads(beats_str)
                beat_id = payment_entry.get('beatId') or payment_entry.get('idBeat')
                beat_data = next((b for b in beats if str(b.get('id')) == str(beat_id)), None)
                if not beat_data:
                    self.send_response(404)
                    self.send_header('Content-Type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(b'{"error": "El instrumental no se encuentra en el catalogo"}')
                    return
                    
                config_key = f"{user}_producer_config"
                producer_config_str = db_data.get(config_key, "{}")
                producer_config = json.loads(producer_config_str)
                
                private_wav = beat_data.get('wav', '')
                private_stems = beat_data.get('stems', '')
                
                host = self.headers.get('Host', 'localhost:8000')
                
                def get_signed_proxy_url(raw_url, file_type):
                    if not raw_url: return ''
                    file_id = raw_url
                    if 'id=' in raw_url:
                        try:
                            file_id = raw_url.split('id=')[1].split('&')[0]
                        except Exception: pass
                    elif '/d/' in raw_url:
                        try:
                            file_id = raw_url.split('/d/')[1].split('/')[0]
                        except Exception: pass
                        
                    # WAV y Stems expiran en 24 horas, MP3 en 7 días
                    duration = 86400 if file_type in ['wav', 'stems'] else 86400 * 7
                    import time
                    expires = int(time.time()) + duration
                    
                    data_to_sign = f"{file_id}:{expires}:{payment_id or ''}:{file_type or ''}"
                    sig = hmac.new(secret.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
                    
                    return f"http://{host}/api/proxy-audio?id={file_id}&expires={expires}&paymentId={payment_id or ''}&fileType={file_type or ''}&signature={sig}"
                
                signed_links = {
                    "mp3": get_signed_proxy_url(beat_data.get('mp3', ''), 'mp3'),
                    "wav": get_signed_proxy_url(private_wav, 'wav') if payment_entry.get('licenseType') != 'basic' else '',
                    "stems": get_signed_proxy_url(private_stems, 'stems') if payment_entry.get('licenseType') not in ['basic', 'premium'] else ''
                }
                
                downloads = []
                
                response_payload = {
                    "payment": payment_entry,
                    "beat": {
                        "id": beat_data.get('id'),
                        "name": beat_data.get('name'),
                        "artwork": beat_data.get('artwork', ''),
                        "bpm": beat_data.get('bpm', ''),
                        "key": beat_data.get('key', ''),
                        "genre": beat_data.get('genre', '')
                    },
                    "producer": {
                        "aka": producer_config.get('aka', 'Productor'),
                        "name": producer_config.get('name', ''),
                        "email": producer_config.get('email', ''),
                        "logoBase64": producer_config.get('logoBase64', ''),
                        "id": producer_config.get('id', '')
                    },
                    "signedLinks": signed_links,
                    "downloads": downloads
                }
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps(response_payload, ensure_ascii=False).encode('utf-8'))
                
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(f'{{"error": "{str(e)}"}}'.encode('utf-8'))
        elif parsed.path == '/api/proxy-audio':
            qs = parse_qs(parsed.query)
            file_id = qs.get('id', [None])[0]
            expires = qs.get('expires', [None])[0]
            signature = qs.get('signature', [None])[0]
            payment_id = qs.get('paymentId', [''])[0]
            file_type = qs.get('fileType', [''])[0]
            
            if not file_id:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Falta parametro id"}')
                return
                
            import hmac
            import time
            secret = os.environ.get('DOWNLOAD_SIGNING_KEY', 'dev-signing-key')
            
            is_authorized = False
            if expires:
                try:
                    now = int(time.time())
                    if now <= int(expires):
                        data_to_sign = f"{file_id}:{expires}:{payment_id or ''}:{file_type or ''}"
                        expected_signature = hmac.new(secret.encode('utf-8'), data_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
                        if signature == expected_signature:
                            is_authorized = True
                except Exception:
                    pass
            
            # En local dev permitimos acceso libre
            is_authorized = True
            
            if not is_authorized:
                self.send_response(403)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "Firma no valida o expirada"}')
                return
                
            direct_link = f"https://docs.google.com/uc?export=download&id={file_id}"
            self.send_response(302)
            self.send_header('Location', direct_link)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
        elif parsed.path == '/api/admin/sales-analytics':
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            period = qs.get('period', ['all'])[0]
            
            try:
                analytics = get_sales_analytics(user, period)
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(json.dumps(analytics, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al servir analíticas de ventas: {str(e)}")
        elif parsed.path == '/api/payments/config':
            try:
                config = get_admin_config()
                # SEGURIDAD: Solo exponer datos necesarios para el flujo de pago del frontend.
                # Datos bancarios sensibles (cuenta, cédula) se omiten intencionalmente de este
                # endpoint público. Se transmiten únicamente al confirmar el pago server-side.
                public_config = {
                    "paypalClientId": config.get("paypalClientId", ""),
                    "payphoneClientId": config.get("payphoneClientId", ""),
                    "payphoneAppId": config.get("payphoneAppId", ""),
                    "deunaPhone": config.get("deunaPhone", ""),
                    "deunaName": config.get("deunaName", ""),
                    "bankPichinchaName": config.get("bankPichinchaName", "")
                    # bankPichinchaAcc y bankPichinchaDni excluidos: datos PII sensibles
                }
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                self.wfile.write(json.dumps(public_config, ensure_ascii=False).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al servir configuración de pagos: {str(e)}")
        else:

            # Servir archivo estático normal
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        
        # Rutas locales sensibles que requieren autenticación
        protected_paths = [
            '/api/save-local',
            '/api/save-pdf',
            '/api/run-task',
            '/api/organize-obsidian',
            '/api/payments/retry-sri',
            '/api/admin/backup-firestore'
        ]
        
        req_path = parsed.path
        if req_path in protected_paths:
            if not self.check_local_auth():
                self.send_response(401)
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"error": "Unauthorized: Invalid or missing local auth token"}')
                return
                
        if parsed.path == '/api/save-local':
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco', 'mrmicua']: user = 'sossa'
            
            content_length = int(self.headers.get('Content-Length', 0))
            # Limitar tamaño máximo del payload a 50 MB para evitar agotamiento de memoria
            MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
            if content_length > MAX_PAYLOAD_BYTES:
                self.send_response(413)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error": "Payload demasiado grande (maximo 50 MB)"}'.encode('utf-8'))
                return
            post_data = self.rfile.read(content_length)
            
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            try:
                # Validar que los datos recibidos sean JSON válido
                data = json.loads(post_data.decode('utf-8'))
                
                # Escribir con formato legible
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Backup local guardado correctamente"}')
                print(f"💾 Archivo de respaldo físico actualizado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar respaldo local: {str(e)}")
        elif self.path == '/api/save-pdf':
            content_length = int(self.headers.get('Content-Length', 0))
            # Limitar tamaño máximo del payload a 50 MB
            MAX_PAYLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
            if content_length > MAX_PAYLOAD_BYTES:
                self.send_response(413)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write('{"error": "Payload demasiado grande (maximo 50 MB)"}'.encode('utf-8'))
                return
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                filename = payload.get('filename')
                pdf_data_uri = payload.get('pdfData')
                
                if not filename or not pdf_data_uri:
                    raise ValueError("Faltan parámetros 'filename' o 'pdfData'")
                
                # Sanitizar el nombre del archivo para prevenir path traversal
                # Solo permitir caracteres alfanuméricos, espacios, guiones y puntos
                safe_filename = re.sub(r'[^a-zA-Z0-9 \-_\.\u00c0-\u024f]', '_', os.path.basename(filename))
                if not safe_filename.lower().endswith('.pdf'):
                    safe_filename += '.pdf'
                
                # Extraer base64 si viene como Data URI
                if ',' in pdf_data_uri:
                    base64_str = pdf_data_uri.split(',')[1]
                else:
                    base64_str = pdf_data_uri
                
                import base64
                pdf_bytes = base64.b64decode(base64_str)
                
                # Definir ruta de guardado: ~/Documents/Licencias
                target_dir = os.path.expanduser('~/Documents/Licencias')
                os.makedirs(target_dir, exist_ok=True)
                
                filepath = os.path.join(target_dir, safe_filename)
                # Verificar que el path resuelto esté dentro del directorio permitido (doble check)
                if not os.path.realpath(filepath).startswith(os.path.realpath(target_dir)):
                    raise ValueError("Nombre de archivo no permitido")
                
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "PDF guardado en Documentos/Licencias"}')
                print(f"📄 PDF de licencia guardado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar PDF local: {str(e)}")
        elif parsed.path == '/api/run-task':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                task_id = payload.get('taskId')
                id_token = payload.get('idToken')
                
                if not task_id or not id_token:
                    raise ValueError("Faltan parámetros 'taskId' o 'idToken'")
                
                # Iniciar procesamiento en segundo plano (hilo asíncrono)
                t = threading.Thread(target=process_async_task, args=(task_id, id_token))
                t.daemon = True
                t.start()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Task processing started in background"}')
                print(f"⚙️ Procesamiento asíncrono iniciado para la tarea: {task_id}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al iniciar tarea asíncrona: {str(e)}")
        elif parsed.path == '/api/organize-obsidian':
            try:
                # Ejecutar organización y regeneración de dashboard
                organize_files()
                generate_dashboard()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Obsidian vault organized successfully"}')
                print("[+] Obsidian vault organized successfully on request")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error organizing Obsidian: {str(e)}")
        elif parsed.path == '/api/payments/deuna/qr':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                purchase_id = payload.get('purchaseId')
                amount = payload.get('amount')
                deuna_phone = payload.get('deunaPhone', '0999999999')
                
                if not purchase_id or not amount:
                    raise ValueError("Faltan parámetros 'purchaseId' o 'amount'")
                
                # Formatear deeplink para la app Deuna!
                clean_phone = "".join(filter(str.isdigit, str(deuna_phone)))
                deeplink = f"deuna://payment?phone={clean_phone}&amount={amount}&description=BEATSS-{purchase_id}"
                
                # Usar Google Charts API para generar QR interactivo
                qr_url = f"https://chart.googleapis.com/chart?chs=250x250&cht=qr&chl={urllib.parse.quote(deeplink)}&choe=UTF-8"
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                
                res_payload = {
                    "status": "success",
                    "qrUrl": qr_url,
                    "deeplink": deeplink
                }
                self.wfile.write(json.dumps(res_payload).encode('utf-8'))
                print(f"📲 QR de Deuna! generado para compra: {purchase_id} ($ {amount})")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar QR Deuna: {str(e)}")
        elif parsed.path == '/api/payments/deuna/webhook' or parsed.path == '/api/payments/deuna/simulate-confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                print(f"[+] Recibido webhook de Deuna!: {json.dumps(payload)}")
                
                purchase_id = payload.get('purchaseId')
                status = payload.get('status')
                
                # Intentar extraer del campo description o reference (para Deuna! Negocios real)
                # Formato esperado: "BEATSS-purchaseId"
                description = payload.get('description') or payload.get('reference') or payload.get('detail') or payload.get('memo')
                
                # Si viene anidado en 'data' (común en webhooks de Deuna! Negocios)
                if not description and isinstance(payload.get('data'), dict):
                    data_obj = payload.get('data')
                    description = data_obj.get('description') or data_obj.get('reference') or data_obj.get('detail')
                    if not status:
                        status = data_obj.get('status') or data_obj.get('state')
                
                if not status:
                    status = 'completed' # Fallback para simulación
                
                if description and 'BEATSS-' in str(description):
                    desc_str = str(description)
                    match = re.search(r'BEATSS-([a-zA-Z0-9_-]+)', desc_str)
                    if match:
                        purchase_id = match.group(1)
                        print(f"[+] Extraído purchase_id '{purchase_id}' del campo de descripción: {desc_str}")
                
                if not purchase_id:
                    raise ValueError("Falta parámetro 'purchaseId' o no se pudo extraer de la descripción")
                
                # Normalizar estados de éxito comunes (completed, paid, success, approved, done, processed)
                is_completed = False
                status_lower = str(status).lower()
                if status_lower in ['completed', 'approved', 'paid', 'success', 'done', 'processed']:
                    is_completed = True
                
                success = False
                if is_completed:
                    success = confirm_payment_in_firestore(purchase_id)
                else:
                    print(f"[-] Webhook recibido pero estado '{status}' no indica éxito.")
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "message": f"Pago {purchase_id} confirmado exitosamente"}).encode('utf-8'))
                else:
                    raise RuntimeError("Error al confirmar el pago en Firestore")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error en webhook/confirmación de Deuna: {str(e)}")
        elif parsed.path == '/api/admin/backup-firestore':
            try:
                token = get_admin_token()
                if not token:
                    raise RuntimeError("No autorizado: gcloud local no autenticado o no disponible.")
                
                print("[*] Iniciando respaldo completo de Firestore a JSON...")
                backup_data = {}
                
                # Colecciones a respaldar
                collections = ["users", "payments", "referrals", "vip_codes"]
                for col in collections:
                    docs = fetch_firestore_collection(col, token)
                    backup_data[col] = []
                    for doc in docs:
                        doc_name = doc.get("name", "")
                        doc_id = doc_name.split("/")[-1]
                        doc_fields = doc.get("fields", {})
                        
                        doc_entry = {
                            "id": doc_id,
                            "fields": doc_fields
                        }
                        
                        # Si es de la colección users, descargar subcolección beats
                        if col == "users":
                            beats_docs = fetch_firestore_collection(f"users/{doc_id}/beats", token)
                            doc_entry["beats"] = []
                            for beat in beats_docs:
                                b_id = beat.get("name", "").split("/")[-1]
                                doc_entry["beats"].append({
                                    "id": b_id,
                                    "fields": beat.get("fields", {})
                                })
                                
                        backup_data[col].append(doc_entry)
                
                # Guardar en archivo local
                timestamp = int(time.time())
                backup_filename = f"firestore_backup_{timestamp}.json"
                backup_path = os.path.join(DIRECTORY, backup_filename)
                
                with open(backup_path, "w", encoding="utf-8") as f:
                    json.dump(backup_data, f, indent=2, ensure_ascii=False)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                
                res_payload = {
                    "status": "success",
                    "filename": backup_filename,
                    "filepath": backup_path,
                    "summary": {col: len(backup_data[col]) for col in collections}
                }
                self.wfile.write(json.dumps(res_payload).encode('utf-8'))
                print(f"💾 Respaldo de Firestore guardado exitosamente en: {backup_path}")
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al respaldar Firestore: {str(e)}")
        elif parsed.path == '/api/generate-contract-pdf':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                
                ref_code = payload.get('refCode', 'REF')
                markdown_content = payload.get('markdownText', '')
                producer_id = payload.get('producerId', 'sossa')
                
                if not markdown_content:
                    raise ValueError("Falta parámetro 'markdownText'")
                    
                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_pdf:
                    temp_pdf_path = temp_pdf.name
                    
                crypto_hash = generate_pdf_from_contract(temp_pdf_path, markdown_content, payload)
                
                with open(temp_pdf_path, 'rb') as f:
                    pdf_bytes = f.read()
                    
                try:
                    os.remove(temp_pdf_path)
                except Exception:
                    pass
                    
                beat_name = payload.get('beatName', 'Beat')
                buyer_name = payload.get('buyerName', 'Comprador')
                license_type = payload.get('licenseType', 'basic')
                
                filename = f"Licencia_{license_type.upper()}_{ref_code} - {beat_name} - {buyer_name}.pdf"
                safe_filename = re.sub(r'[^a-zA-Z0-9 \-_\.\u00c0-\u024f]', '_', filename)
                if not safe_filename.lower().endswith('.pdf'):
                    safe_filename += '.pdf'
                    
                target_dir = os.path.expanduser('~/Documents/Licencias')
                os.makedirs(target_dir, exist_ok=True)
                filepath = os.path.join(target_dir, safe_filename)
                
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                    
                save_license_hash_in_firestore(producer_id, ref_code, crypto_hash)
                save_license_hash_in_local_backup(producer_id, ref_code, crypto_hash)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/pdf')
                self.send_header('Content-Disposition', f'attachment; filename="{safe_filename}"')
                self.send_cors_headers()
                self.send_header('Access-Control-Expose-Headers', 'Content-Disposition, X-Crypto-Hash')
                self.send_header('X-Crypto-Hash', crypto_hash)
                self.end_headers()
                self.wfile.write(pdf_bytes)
                print(f"📄 PDF Criptográfico generado, firmado y guardado en: {filepath}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al generar PDF Criptográfico: {str(e)}")
        elif parsed.path == '/api/activate-pro':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                order_id = payload.get('orderId')
                uid = payload.get('uid')
                email = payload.get('email', '')
                
                if not order_id or not uid:
                    raise ValueError("Faltan parámetros 'orderId' o 'uid'")
                
                # Si es un ID de simulación mock, omitir la verificación real
                if order_id.startswith('PAYPAL-SUB-MOCK-'):
                    plan = payload.get('plan', 'pro')
                    print(f"[+] Simulando pago exitoso de PayPal para plan {plan} del usuario {uid}")
                    activation_success = update_user_plan_in_firestore(uid, plan, email)
                    if activation_success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_cors_headers()
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "success": True, 
                            "plan": plan,
                            "message": f"Suscripción {plan.upper()} activada exitosamente (Simulación)"
                        }).encode('utf-8'))
                        return
                    else:
                        raise RuntimeError("Error al actualizar el plan en Firestore en simulación")
                
                # Cargar credenciales PayPal del administrador
                admin_config = get_admin_config()
                paypal_client_id = admin_config.get('paypalClientId')
                paypal_client_secret = admin_config.get('paypalClientSecret')
                
                if not paypal_client_id or not paypal_client_secret:
                    raise ValueError("El administrador de la plataforma no tiene configuradas sus credenciales de PayPal.")
                
                # Verificar orden en PayPal
                success, plan, amount = verify_paypal_order(order_id, paypal_client_id, paypal_client_secret)
                
                if not success:
                    raise RuntimeError("No se pudo verificar el pago en PayPal o no ha sido completado.")
                
                # Activar el plan en Firestore y local
                activation_success = update_user_plan_in_firestore(uid, plan, email)
                
                if activation_success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "success": True, 
                        "plan": plan,
                        "message": f"Suscripción {plan.upper()} activada exitosamente."
                    }).encode('utf-8'))
                    print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid} ($ {amount})")
                else:
                    raise RuntimeError("Error al actualizar el plan en Firestore")
                    
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode('utf-8'))
                print(f"❌ Error en /api/activate-pro: {str(e)}")
        elif parsed.path == '/api/payments/payphone/subscription/confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payphone_id = payload.get('id')
                client_tx_id = payload.get('clientTxId')
                uid = payload.get('uid')
                plan = payload.get('plan', 'pro')
                email = payload.get('email', '')
                
                if not payphone_id or not client_tx_id or not uid:
                    raise ValueError("Faltan parámetros 'id', 'clientTxId' o 'uid'")
                
                # Si es un ID de simulación mock, omitir la verificación real
                if client_tx_id.startswith('PAYPHONE-SUB-MOCK-'):
                    print(f"[+] Simulando pago exitoso de PayPhone para suscripción del usuario {uid}")
                    success = update_user_plan_in_firestore(uid, plan, email)
                    if success:
                        self.send_response(200)
                        self.send_header('Content-Type', 'application/json')
                        self.send_cors_headers()
                        self.end_headers()
                        self.wfile.write(json.dumps({
                            "status": "success", 
                            "message": f"Suscripción {plan.upper()} activada exitosamente (Simulación)"
                        }).encode('utf-8'))
                        return
                    else:
                        raise RuntimeError("Error al actualizar el plan en Firestore en simulación")
                
                # Cargar el token privado de Payphone del ADMIN (sossa)
                admin_config = get_admin_config()
                payphone_client_id = admin_config.get('payphoneClientId')
                
                if not payphone_client_id:
                    raise ValueError("El administrador de la plataforma no ha configurado sus credenciales de PayPhone.")
                
                # Consumir la API de confirmación de PayPhone por HTTPS POST
                confirm_url = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"
                confirm_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"bearer {payphone_client_id}"
                }
                confirm_body = {
                    "id": int(payphone_id),
                    "clientTxId": client_tx_id
                }
                
                confirm_req = urllib.request.Request(
                    confirm_url,
                    data=json.dumps(confirm_body).encode('utf-8'),
                    headers=confirm_headers,
                    method="POST"
                )
                
                try:
                    with urllib.request.urlopen(confirm_req) as response:
                        res_data = json.loads(response.read().decode('utf-8'))
                except urllib.error.HTTPError as he:
                    err_msg = he.read().decode('utf-8')
                    try:
                        err_json = json.loads(err_msg)
                        raise RuntimeError(err_json.get('message', 'Error en la API de PayPhone'))
                    except Exception:
                        raise RuntimeError(f"Error HTTP de PayPhone ({he.code}): {err_msg}")
                except Exception as e:
                    raise RuntimeError(f"Error de red al conectar con PayPhone: {str(e)}")
                
                status_approved = (
                    res_data.get('transactionStatus') == 'Approved' or 
                    res_data.get('status') == 'Approved' or 
                    res_data.get('statusCode') == 3
                )
                
                if not status_approved:
                    raise RuntimeError(res_data.get('message', 'La transacción no fue aprobada por PayPhone'))
                
                success = update_user_plan_in_firestore(uid, plan, email)
                
                if success:
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({
                        "status": "success", 
                        "message": f"Suscripción {plan.upper()} activada exitosamente tras pago PayPhone"
                    }).encode('utf-8'))
                    print(f"✅ Suscripción {plan.upper()} activada exitosamente para usuario {uid}")
                else:
                    raise RuntimeError("Error al actualizar el plan en Firestore")
                    
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al confirmar suscripción PayPhone: {str(e)}")
        elif parsed.path == '/api/payments/payphone/confirm':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payphone_id = payload.get('id')
                client_tx_id = payload.get('clientTxId')
                producer_id = payload.get('producerId', 'sossa')
                
                if not payphone_id or not client_tx_id:
                    raise ValueError("Faltan parámetros 'id' o 'clientTxId' de la transacción PayPhone")
                
                # Cargar el token privado de Payphone del productor desde su respaldo local
                backup_path, username = resolve_backup_file(producer_id)
                
                payphone_client_id = ""
                backup_data = {}
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        backup_data = json.load(f)
                    
                    # Buscar en las llaves del respaldo
                    for key, val in backup_data.items():
                        if key.endswith('_producer_config') and val:
                            try:
                                config_data = json.loads(val) if isinstance(val, str) else val
                                if config_data.get('payphoneClientId'):
                                    payphone_client_id = config_data.get('payphoneClientId')
                                    break
                            except Exception:
                                pass
                
                if not payphone_client_id:
                    raise ValueError("El productor no tiene configurado su PayPhone Token de Desarrollador en su perfil.")
                
                # Consumir la API de confirmación de PayPhone por HTTPS POST
                confirm_url = "https://pay.payphonetodoesposible.com/api/button/V2/Confirm"
                confirm_headers = {
                    "Content-Type": "application/json",
                    "Authorization": f"bearer {payphone_client_id}"
                }
                confirm_body = {
                    "id": int(payphone_id),
                    "clientTxId": client_tx_id
                }
                
                confirm_req = urllib.request.Request(
                    confirm_url,
                    data=json.dumps(confirm_body).encode('utf-8'),
                    headers=confirm_headers,
                    method="POST"
                )
                
                try:
                    with urllib.request.urlopen(confirm_req) as response:
                        res_data = json.loads(response.read().decode('utf-8'))
                except urllib.error.HTTPError as he:
                    err_msg = he.read().decode('utf-8')
                    try:
                        err_json = json.loads(err_msg)
                        raise RuntimeError(err_json.get('message', 'Error en la API de PayPhone'))
                    except Exception:
                        raise RuntimeError(f"Error HTTP de PayPhone ({he.code}): {err_msg}")
                except Exception as e:
                    raise RuntimeError(f"Error de red al conectar con PayPhone: {str(e)}")
                
                # Validar estado de la transacción en la respuesta
                status_approved = (
                    res_data.get('transactionStatus') == 'Approved' or 
                    res_data.get('status') == 'Approved' or 
                    res_data.get('statusCode') == 3
                )
                
                if not status_approved:
                    raise RuntimeError(res_data.get('message', 'La transacción no fue aprobada por PayPhone'))
                
                # Registrar el pago en Firestore (si hay token admin disponible)
                admin_token = get_admin_token()
                
                items = payload.get('items', [])
                discount_percent = float(payload.get('discountPercent', 0))
                coupon_code = payload.get('couponCode', '')
                buyer_name = payload.get('buyerName', 'Comprador')
                buyer_email = payload.get('buyerEmail', '')
                buyer_phone = payload.get('buyerPhone', '')
                buyer_dni = payload.get('buyerDni', '')
                buyer_city = payload.get('buyerCity', '')
                buyer_country = payload.get('buyerCountry', '')
                youtube_whitelist = payload.get('youtubeWhitelist', '')
                
                firestore_success = False
                inserted_payment_ids = []
                if admin_token:
                    try:
                        for item in items:
                            order_fields = {
                                "type": {"stringValue": "beat_purchase"},
                                "producerId": {"stringValue": producer_id},
                                "beatId": {"stringValue": item.get('beatId', '')},
                                "beatName": {"stringValue": item.get('beatName', '')},
                                "licenseType": {"stringValue": item.get('licenseType', 'basic')},
                                "price": {"doubleValue": float(item.get('price', 0))},
                                "buyerName": {"stringValue": buyer_name},
                                "buyerEmail": {"stringValue": buyer_email},
                                "buyerPhone": {"stringValue": buyer_phone},
                                "buyerDni": {"stringValue": buyer_dni},
                                "buyerCity": {"stringValue": buyer_city},
                                "buyerCountry": {"stringValue": buyer_country},
                                "youtubeWhitelist": {"stringValue": youtube_whitelist},
                                "method": {"stringValue": "payphone"},
                                "reference": {"stringValue": client_tx_id},
                                "receiptUrl": {"stringValue": ""},
                                "status": {"stringValue": "approved"},
                                "discountPercent": {"doubleValue": discount_percent},
                                "couponCode": {"stringValue": coupon_code},
                                "originalPrice": {"doubleValue": float(item.get('price', 0))},
                                "finalPrice": {"doubleValue": float(item.get('price', 0)) * (1 - (discount_percent / 100))},
                                "timestamp": {"stringValue": datetime.datetime.utcnow().isoformat() + "Z"},
                                "acceptedTerms": {"booleanValue": True},
                                "acceptanceTimestamp": {"stringValue": payload.get('acceptanceTimestamp', datetime.datetime.utcnow().isoformat() + "Z")}
                            }
                            
                            fs_url = "https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments"
                            fs_req = urllib.request.Request(
                                fs_url,
                                data=json.dumps({"fields": order_fields}).encode('utf-8'),
                                headers={
                                    "Authorization": f"Bearer {admin_token}",
                                    "Content-Type": "application/json"
                                },
                                method="POST"
                            )
                            with urllib.request.urlopen(fs_req) as fs_res:
                                fs_res_data = json.loads(fs_res.read().decode('utf-8'))
                                doc_id = fs_res_data.get('name', '').split('/')[-1]
                                inserted_payment_ids.append(doc_id)
                        firestore_success = True
                    except Exception as fe:
                        print(f"[-] Error al guardar pago de PayPhone en Firestore: {fe}")
                
                # Actualizar localmente en el historial de licencias del productor
                try:
                    # Buscar la subllave de historial
                    history_key = ""
                    for k in backup_data.keys():
                        if k.endswith('_license_history'):
                            history_key = k
                            break
                            
                    if not history_key:
                        history_key = f"{producer_id}_license_history"
                        
                    history_str = backup_data.get(history_key, '[]')
                    history_list = json.loads(history_str)
                    
                    for item in items:
                        lic_id = inserted_payment_ids.pop(0) if inserted_payment_ids else f"local_{int(time.time()*1000)}"
                        new_license_entry = {
                            "id": lic_id,
                            "refCode": f"LIC-{item.get('licenseType', 'basic').upper()}-{client_tx_id[:8]}",
                            "beatId": item.get('beatId', ''),
                            "beatName": item.get('beatName', ''),
                            "buyerName": buyer_name,
                            "buyerEmail": buyer_email,
                            "date": datetime.datetime.now().strftime("%Y-%m-%d"),
                            "value": float(item.get('price', 0)) * (1 - (discount_percent / 100)),
                            "type": item.get('licenseType', 'basic'),
                            "youtubeWhitelist": youtube_whitelist,
                            "formData": {
                                "buyerName": buyer_name,
                                "buyerEmail": buyer_email,
                                "buyerPhone": buyer_phone,
                                "buyerId": buyer_dni,
                                "buyerCity": buyer_city,
                                "buyerCountry": buyer_country,
                                "youtubeWhitelist": youtube_whitelist
                            },
                            "status": "approved",
                            "paymentMethod": "payphone",
                            "reference": client_tx_id,
                            "acceptedTerms": True,
                            "acceptanceTimestamp": payload.get('acceptanceTimestamp', datetime.datetime.utcnow().isoformat() + "Z")
                        }
                        history_list.append(new_license_entry)
                        
                    backup_data[history_key] = json.dumps(history_list, ensure_ascii=False)
                    with open(backup_path, 'w', encoding='utf-8') as f:
                        json.dump(backup_data, f, indent=2, ensure_ascii=False)
                    print(f"[+] Compra PayPhone guardada con éxito en respaldo local: {client_tx_id}")
                    
                    # Disparar la facturación SRI en segundo plano
                    threading.Thread(
                        target=emitir_factura_sri_background,
                        args=(client_tx_id, producer_id)
                    ).start()
                except Exception as le:
                    print(f"[-] Error al actualizar historial local de licencias tras cobro PayPhone: {le}")
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": "Pago de PayPhone verificado y registrado exitosamente",
                    "transactionId": client_tx_id
                }).encode('utf-8'))
                print(f"✅ Transacción PayPhone confirmada exitosamente: {client_tx_id}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al confirmar pago de PayPhone: {str(e)}")
        elif parsed.path == '/api/payments/retry-sri':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                payment_id = payload.get('paymentId')
                producer_id = payload.get('producerId', 'sossa')
                
                if not payment_id:
                    raise ValueError("Falta parámetro 'paymentId'")
                
                # Cargar el historial local del productor para buscar la referencia
                backup_path, username = resolve_backup_file(producer_id)
                reference = None
                payment_entry = None
                
                if os.path.exists(backup_path):
                    with open(backup_path, 'r', encoding='utf-8') as f:
                        backup_data = json.load(f)
                    history_key = f"{producer_id}_license_history"
                    if history_key not in backup_data:
                        history_key = f"{username}_license_history"
                    history_str = backup_data.get(history_key, "[]")
                    history = json.loads(history_str)
                    payment_entry = next((x for x in history if x.get('id') == payment_id or x.get('reference') == payment_id or x.get('refCode') == payment_id), None)
                    if payment_entry:
                        reference = payment_entry.get('reference') or payment_entry.get('refCode') or payment_id
                        
                # Si no se encuentra localmente, buscar en Firestore si hay token
                if not reference:
                    token = get_admin_token()
                    if token:
                        try:
                            url = f"https://firestore.googleapis.com/v1/projects/licencias-musicales/databases/(default)/documents/payments/{payment_id}"
                            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
                            with urllib.request.urlopen(req) as res:
                                doc = json.loads(res.read().decode('utf-8'))
                                fields = doc.get('fields', {})
                                reference = fields.get('reference', {}).get('stringValue') or payment_id
                                payment_entry = {
                                    'sriEstado': fields.get('sriEstado', {}).get('stringValue', '')
                                }
                        except Exception as e:
                            print(f"[-] [SRI Retry] Error al buscar en Firestore: {e}")
                
                if not reference:
                    # Usar el propio payment_id como referencia en última instancia
                    reference = payment_id
                
                # Validar si ya está autorizado
                if payment_entry and payment_entry.get('sriEstado') == 'AUTORIZADO':
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.send_cors_headers()
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "La factura correspondiente a este pago ya se encuentra AUTORIZADA."}).encode('utf-8'))
                    return
                
                # Disparar la facturación en segundo plano
                threading.Thread(
                    target=emitir_factura_sri_background,
                    args=(reference, producer_id)
                ).start()
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({
                    "status": "success",
                    "message": "Reemisión de factura del SRI iniciada exitosamente en segundo plano.",
                    "reference": reference
                }).encode('utf-8'))
                print(f"[+] [SRI Retry] Reemisión iniciada para la referencia: {reference}")
                
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
                print(f"❌ Error al reemitir factura SRI: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    # Silenciar logs repetitivos si se desea, o mantenerlos para debug simple
    def log_message(self, format, *args):
        # Solo imprimimos mensajes que no sean peticiones de recursos normales para no saturar
        message = format % args
        if "GET /api/" in message or "POST /api/" in message:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), message))
        elif "GET /" not in message: # Imprimir cualquier error u otro tipo de petición
            super().log_message(format, *args)

def run_obsidian_organizer_background():
    """Bucle en segundo plano para escanear y organizar la bóveda de Obsidian periódicamente."""
    import time
    print("[*] [Obsidian Auto-Organizer] Iniciando escaneo periódico en segundo plano...")
    # Ejecución inmediata al iniciar
    try:
        organize_files()
        generate_dashboard()
        print("[+] [Obsidian Auto-Organizer] Organización inicial completada con éxito.")
    except Exception as e:
        print(f"[-] [Obsidian Auto-Organizer] Error en la organización inicial: {e}")
        
    while True:
        time.sleep(300)  # Cada 5 minutos
        try:
            print("[*] [Obsidian Auto-Organizer] Ejecutando organización periódica de la bóveda...")
            organize_files()
            generate_dashboard()
        except Exception as e:
            print(f"[-] [Obsidian Auto-Organizer] Error durante la organización periódica: {e}")

def load_dotenv():
    env_path = os.path.join(DIRECTORY, '.env')
    if os.path.exists(env_path):
        with open(env_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    key, val = line.split('=', 1)
                    key = key.strip()
                    val = val.strip().strip("'\"")
                    os.environ[key] = val

if __name__ == '__main__':
    load_dotenv()
    
    # Asegurar que LOCAL_AUTH_TOKEN esté configurado en .env
    local_token = os.environ.get('LOCAL_AUTH_TOKEN')
    if not local_token:
        import secrets
        generated_token = secrets.token_hex(24)
        env_path = os.path.join(DIRECTORY, '.env')
        try:
            with open(env_path, 'a', encoding='utf-8') as f:
                f.write(f"\nLOCAL_AUTH_TOKEN=\"{generated_token}\"\n")
            os.environ['LOCAL_AUTH_TOKEN'] = generated_token
            print(f"[+] LOCAL_AUTH_TOKEN autogenerado y configurado en .env.")
        except Exception as e:
            print(f"[-] Error al guardar LOCAL_AUTH_TOKEN autogenerado en .env: {e}", file=sys.stderr)

    # Validación de seguridad de variables críticas
    if not os.environ.get('GEMINI_API_KEY'):
        print("[-] ERROR CRÍTICO: La variable de entorno GEMINI_API_KEY no está configurada en .env ni en el entorno del sistema.", file=sys.stderr)
        print("[-] Deteniendo el inicio del servidor por seguridad.", file=sys.stderr)
        sys.exit(1)

    # Permitir configurar puerto por argumento si fuera necesario
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
            
    print(f"[*] Iniciando servidor personalizado de Sossa Licencias...")
    print(f"[*] Directorio raíz: {DIRECTORY}")
    print(f"[*] Escuchando en http://127.0.0.1:{port}")
    
    # Lanzar el organizador de Obsidian en segundo plano
    obsidian_thread = threading.Thread(target=run_obsidian_organizer_background, daemon=True)
    obsidian_thread.start()
    
    server_address = ('127.0.0.1', port)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Servidor detenido por el usuario.")
        sys.exit(0)
