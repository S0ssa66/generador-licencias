#!/bin/bash
PORT=8000
DIR="/Users/sossa/IA/generador-licencias"

echo "=========================================="
echo "Iniciando el Generador de Licencias sossa"
echo "=========================================="

# Comprobar si python3 está disponible
if ! command -v python3 &> /dev/null
then
    echo "[!] Python3 no está instalado. Abriendo index.html directamente en el navegador..."
    open "$DIR/index.html"
    exit
fi

# Comprobar si el puerto ya está en uso
if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null ; then
    echo "[*] El puerto $PORT ya está en uso. Abriendo el navegador..."
    open "http://localhost:$PORT"
else
    echo "[*] Iniciando servidor web en http://localhost:$PORT ..."
    # Iniciar servidor web de Python en segundo plano
    python3 "$DIR/server.py" $PORT &
    PID=$!
    
    # Esperar un momento a que el servidor levante antes de abrir
    sleep 1
    open "http://localhost:$PORT"
    
    echo "[*] Servidor iniciado con PID $PID."
    echo "[*] Presiona Ctrl+C en esta terminal para detener el servidor."
    
    # Manejar Ctrl+C para matar el proceso del servidor
    trap "kill $PID" EXIT
    wait $PID
fi
