#!/usr/bin/env python3
import os
import sys
import json
import wave
import io
import base64
import subprocess
import shutil

# Asegurar que importamos del directorio raíz
DIRECTORY = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(DIRECTORY)

import server

def generate_test_wav_base64(seconds=0.5):
    # Genera un archivo WAV de 8000Hz, 8 bits mono de silencio (128)
    out = io.BytesIO()
    with wave.open(out, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(8000)
        wav.writeframes(b'\x80' * int(8000 * seconds))
    return "data:audio/wav;base64," + base64.b64encode(out.getvalue()).decode('utf-8')

def generate_test_wav_file(path, seconds=5.0):
    # Escribe un archivo WAV local para simular el beat de origen
    with wave.open(path, 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(1)
        wav.setframerate(8000)
        # 1 segundo de tono de 440Hz alternado con silencio
        data = bytearray()
        for i in range(int(8000 * seconds)):
            import math
            # Tono senoidal simple
            val = int(128 + 127 * math.sin(2 * math.pi * 440 * i / 8000))
            data.append(val)
        wav.writeframes(data)

def run_integration_test():
    print("[*] Iniciando prueba de integracion del mezclador de marcas de agua...")
    
    test_user = "test_producer"
    test_beat_id = "test_beat_001"
    
    # Rutas físicas
    backup_file = os.path.join(DIRECTORY, f'{test_user}_backup_sincronizado.json')
    test_beat_wav_path = os.path.join(DIRECTORY, "scratch", "test_clean_beat.wav")
    
    # 1. Generar audios de prueba
    generate_test_wav_file(test_beat_wav_path, seconds=6.0)
    tag_b64 = generate_test_wav_base64(seconds=1.0)
    
    # 2. Crear backup ficticio con beat y config
    test_db = {
        f"{test_user}_producer_config": json.dumps({
            "name": "Productor de Pruebas",
            "aka": "TestProducer",
            "audioTagBase64": tag_b64,
            "audioTagName": "test_tag.wav"
        }),
        f"{test_user}_beats": json.dumps([
            {
                "id": test_beat_id,
                "name": "Test Beat",
                "mp3": test_beat_wav_path # Apuntar al archivo local
            }
        ])
    }
    
    with open(backup_file, 'w', encoding='utf-8') as f:
        json.dump(test_db, f, indent=2)
        
    print("[+] Archivos de prueba y base de datos simulada creados.")
    
    # 3. Invocar la función de procesamiento
    try:
        success, result_path = server.process_watermark_audio(test_beat_id, test_user)
        
        if not success:
            print(f"[-] ERROR: La mezcla de audio fallo: {result_path}")
            sys.exit(1)
            
        print(f"[+] MEZCLA EXITOSA. Archivo mezclado en: {result_path}")
        
        # 4. Validar propiedades del archivo mezclado
        if not os.path.exists(result_path):
            print("[-] ERROR: El archivo de salida mezclado no existe fisicamente.")
            sys.exit(1)
            
        size = os.path.getsize(result_path)
        print(f"[+] Archivo mezclado pesa: {size} bytes")
        if size == 0:
            print("[-] ERROR: El archivo mezclado esta vacio.")
            sys.exit(1)
            
        # 5. Ejecutar de nuevo para verificar cacheo
        success_cache, result_path_cache = server.process_watermark_audio(test_beat_id, test_user)
        if not success_cache or result_path_cache != result_path:
            print("[-] ERROR: La lógica de cacheo no retorno el archivo identico.")
            sys.exit(1)
            
        print("[+] CACHEO EXITOSO: Se retorno la misma pista sin volver a compilar.")
        print("[+] TODOS LOS TESTS PASARON EXITOSAMENTE.")
        
    finally:
        # Limpieza
        print("[*] Limpiando archivos temporales de test...")
        if os.path.exists(backup_file):
            os.remove(backup_file)
        if os.path.exists(test_beat_wav_path):
            os.remove(test_beat_wav_path)
        
        # Eliminar archivo mezclado en la cache de audio
        # Buscar en cache
        cache_dir = os.path.join(DIRECTORY, "temp_audio_cache")
        if os.path.exists(cache_dir):
            for f in os.listdir(cache_dir):
                if f.startswith(test_beat_id):
                    try: os.remove(os.path.join(cache_dir, f))
                    except Exception: pass

if __name__ == "__main__":
    run_integration_test()
