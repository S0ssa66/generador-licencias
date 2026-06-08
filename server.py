#!/usr/bin/env python3
import http.server
import json
import os
import sys
from urllib.parse import urlparse, parse_qs

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        # Si existe la carpeta 'dist' (compilada con Vite), servimos desde ahí para evitar errores de módulos nativos (bare imports)
        dist_dir = os.path.join(DIRECTORY, 'dist')
        serve_dir = dist_dir if os.path.exists(dist_dir) else DIRECTORY
        super().__init__(*args, directory=serve_dir, **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/load-local':
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            # Solo permitir sossa y cgmonarco por seguridad
            if user not in ['sossa', 'cgmonarco']: user = 'sossa'
            filepath = os.path.join(DIRECTORY, f'{user}_backup_sincronizado.json')
            if os.path.exists(filepath):
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
                self.end_headers()
                with open(filepath, 'rb') as f:
                    self.wfile.write(f.read())
            else:
                self.send_response(404)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"error": "No local backup found"}')
        else:
            # Servir archivo estático normal
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/save-local':
            qs = parse_qs(parsed.query)
            user = qs.get('user', ['sossa'])[0]
            if user not in ['sossa', 'cgmonarco']: user = 'sossa'
            
            content_length = int(self.headers['Content-Length'])
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
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Backup local guardado correctamente"}')
                print(f"💾 Archivo de respaldo físico actualizado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar respaldo local: {str(e)}")
        elif self.path == '/api/save-pdf':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode('utf-8'))
                filename = payload.get('filename')
                pdf_data_uri = payload.get('pdfData')
                
                if not filename or not pdf_data_uri:
                    raise ValueError("Faltan parámetros 'filename' o 'pdfData'")
                
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
                
                filepath = os.path.join(target_dir, filename)
                with open(filepath, 'wb') as f:
                    f.write(pdf_bytes)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "PDF guardado en Documentos/Licencias"}')
                print(f"📄 PDF de licencia guardado en: {filepath}")
            except Exception as e:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                err_response = {"error": str(e)}
                self.wfile.write(json.dumps(err_response).encode('utf-8'))
                print(f"❌ Error al guardar PDF local: {str(e)}")
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    # Silenciar logs repetitivos si se desea, o mantenerlos para debug simple
    def log_message(self, format, *args):
        # Solo imprimimos mensajes que no sean peticiones de recursos normales para no saturar
        message = format % args
        if "GET /api/" in message or "POST /api/" in message:
            sys.stderr.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), message))
        elif "GET /" not in message: # Imprimir cualquier error u otro tipo de petición
            super().log_message(format, *args)

if __name__ == '__main__':
    # Permitir configurar puerto por argumento si fuera necesario
    port = PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
            
    print(f"[*] Iniciando servidor personalizado de Sossa Licencias...")
    print(f"[*] Directorio raíz: {DIRECTORY}")
    print(f"[*] Escuchando en http://localhost:{port}")
    
    server_address = ('', port)
    httpd = http.server.HTTPServer(server_address, CustomHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[*] Servidor detenido por el usuario.")
        sys.exit(0)
