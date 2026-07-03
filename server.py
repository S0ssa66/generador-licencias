#!/usr/bin/env python3
"""
server.py — Servidor HTTP principal de BEATSS (thin orchestrator)

Arquitectura modular:
  firestore_ops.py   → operaciones REST sobre Firestore
  admin_config.py    → configuración de admin y hashes de licencias
  analytics.py       → analytics de ventas
  audio_utils.py     → procesamiento de audio con marca de agua
  handlers_get.py    → Mixin con do_GET (HandlerGetMixin)
  handlers_post.py   → Mixin con do_POST (HandlerPostMixin)
"""

import http.server
import os
import sys
import threading

from organize_obsidian import organize_files, generate_dashboard
from handlers_get import HandlerGetMixin
from handlers_post import HandlerPostMixin

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


class CustomHandler(HandlerGetMixin, HandlerPostMixin, http.server.SimpleHTTPRequestHandler):
    """Handler HTTP principal — hereda do_GET y do_POST de los mixins."""

    def __init__(self, *args, **kwargs):
        # Si existe la carpeta 'dist' (compilada con Vite), servimos desde ahí
        dist_dir = os.path.join(DIRECTORY, 'dist')
        serve_dir = dist_dir if os.path.exists(dist_dir) else DIRECTORY
        super().__init__(*args, directory=serve_dir, **kwargs)

    def check_local_auth(self):
        """Verifica que la petición incluya un token de autorización local válido."""
        local_token = os.environ.get('LOCAL_AUTH_TOKEN')
        if not local_token:
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
            'https://generador-licencias.vercel.app',
            'https://beatss.app',
            'https://www.beatss.app'
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
        from urllib.parse import urlparse
        parsed = urlparse(path)
        if parsed.path.startswith('/temp_audio_cache/'):
            filename = os.path.basename(parsed.path)
            return os.path.join(DIRECTORY, 'temp_audio_cache', filename)
        return super().translate_path(path)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors_headers()
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def log_message(self, format, *args):
        message = format % args
        if "GET /api/" in message or "POST /api/" in message:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), message))
        elif "GET /" not in message:
            super().log_message(format, *args)


def run_obsidian_organizer_background():
    """Bucle en segundo plano para escanear y organizar la bóveda de Obsidian periódicamente."""
    import time
    print("[*] [Obsidian Auto-Organizer] Iniciando escaneo periódico en segundo plano...")
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
                f.write(f'\nLOCAL_AUTH_TOKEN="{generated_token}"\n')
            os.environ['LOCAL_AUTH_TOKEN'] = generated_token
            print(f"[+] LOCAL_AUTH_TOKEN autogenerado y configurado en .env.")
        except Exception as e:
            print(f"[-] Error al guardar LOCAL_AUTH_TOKEN autogenerado en .env: {e}", file=sys.stderr)

    # Validación de seguridad de variables críticas
    provider = os.environ.get('LLM_PROVIDER', 'auto').lower().strip()
    if provider == 'gemini' and not os.environ.get('GEMINI_API_KEY'):
        print("[-] ERROR CRÍTICO: La variable de entorno GEMINI_API_KEY no está configurada y se requiere para el proveedor 'gemini'.", file=sys.stderr)
        print("[-] Deteniendo el inicio del servidor por seguridad.", file=sys.stderr)
        sys.exit(1)
    elif provider == 'auto' and not os.environ.get('GEMINI_API_KEY'):
        print("[!] Advertencia: GEMINI_API_KEY no está configurada. El enrutador de IA intentará usar Ollama o LM Studio de forma local.")

    # Permitir configurar puerto por argumento
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

    # Lanzar el worker de contingencia del SRI en segundo plano
    try:
        import sri_contingency
        sri_contingency.start_contingency_worker()
    except Exception as e:
        print(f"[-] Error al iniciar el contingency worker del SRI: {e}", file=sys.stderr)

    server_address = ('0.0.0.0', port)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Servidor detenido por el usuario.")
        sys.exit(0)
