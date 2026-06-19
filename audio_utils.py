"""Procesamiento de audio con marca de agua — módulo extraído de server.py"""
import json
import os
import base64
import hashlib
import tempfile
import subprocess
from urllib.parse import urlparse, parse_qs
from server_utils import get_admin_token
from firestore_ops import fetch_firestore_document

DIRECTORY = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(DIRECTORY, 'temp_audio_cache')


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
