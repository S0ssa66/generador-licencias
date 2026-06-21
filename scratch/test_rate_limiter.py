import urllib.request
import urllib.error
import json
import sys

def test_webhook_rate_limit():
    url = "http://localhost:8000/api/payments/deuna/webhook"
    # Usar una IP aleatoria ficticia de prueba para no bloquear la IP local real en otras pruebas
    ip = "99.88.77.66" 
    
    print(f"[*] Enviando solicitudes consecutivas desde la IP {ip} para probar el rate limit...")
    
    num_requests = 15
    for i in range(num_requests):
        # Generar un request con un X-Forwarded-For personalizado
        req = urllib.request.Request(
            url, 
            data=json.dumps({"test": "data"}).encode("utf-8"), 
            headers={"Content-Type": "application/json", "X-Forwarded-For": ip}
        )
        try:
            with urllib.request.urlopen(req) as response:
                code = response.getcode()
                print(f"Solicitud {i+1}: Respuesta exitosa {code}")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"Solicitud {i+1}: Recibió error esperado 429 (Too Many Requests)")
                if i >= 10:
                    print(f"[✅] Éxito: Se ha activado el Rate Limiter correctamente en la solicitud {i+1}!")
                    return
                else:
                    print(f"[-] Error: Se bloqueó prematuramente en la solicitud {i+1}!")
                    sys.exit(1)
            elif e.code == 400:
                print(f"Solicitud {i+1}: Recibió 400 (esperado por cuerpo de petición de prueba)")
            else:
                print(f"[-] Error: Recibió un código de error inesperado: {e.code}")
                sys.exit(1)
        except Exception as ex:
            print(f"[-] Error de conexión: {ex}")
            sys.exit(1)
            
    print("[-] Error: Se completaron todas las solicitudes sin recibir HTTP 429.")
    sys.exit(1)

if __name__ == "__main__":
    test_webhook_rate_limit()
