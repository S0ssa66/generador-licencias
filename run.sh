#!/bin/bash
PORT=8000
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -z "${PYTHON_BIN:-}" ] && [ -x "$DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$DIR/.venv/bin/python"
else
    PYTHON_BIN="${PYTHON_BIN:-python3}"
fi

echo "=========================================="
echo "Iniciando el Generador de Licencias sossa"
echo "=========================================="

# La cola SRI puede llamar a los Web Services externos y emitir comprobantes.
# Por seguridad, el servidor local no la activa al abrir la web. Habilítala de
# forma explícita solo después de revisar la configuración fiscal:
# ENABLE_SRI_CONTINGENCY_WORKER=true ./run.sh
export ENABLE_SRI_CONTINGENCY_WORKER="${ENABLE_SRI_CONTINGENCY_WORKER:-false}"

# Comprobar si python3 está disponible
if ! command -v "$PYTHON_BIN" &> /dev/null
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
    "$PYTHON_BIN" "$DIR/server.py" "$PORT" &
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
