#!/usr/bin/env python3
"""
Script para asignar el Custom Claim 'admin: true' a la cuenta de Sossa en Firebase.
Ejecutar UNA SOLA VEZ después de descargar serviceAccount.json.

Uso:
    .venv/bin/python set_admin_claim.py
"""

import sys
import os

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# Verificar que serviceAccount.json existe
sa_path = os.path.join(DIRECTORY, 'serviceAccount.json')
if not os.path.exists(sa_path):
    print("No se encontro serviceAccount.json")
    print("   1. Ve a Firebase Console -> Configuracion del proyecto -> Cuentas de servicio")
    print("   2. Clic en 'Generar nueva clave privada'")
    print(f"   3. Guarda el archivo como: {sa_path}")
    sys.exit(1)

try:
    import firebase_admin
    from firebase_admin import credentials, auth
except ImportError:
    print("firebase-admin no esta instalado. Instalando...")
    import subprocess
    subprocess.run([sys.executable, '-m', 'pip', 'install', 'firebase-admin'], check=True)
    import firebase_admin
    from firebase_admin import credentials, auth

# Inicializar Firebase Admin SDK
cred = credentials.Certificate(sa_path)
firebase_admin.initialize_app(cred)

# Email del admin de Sossa
ADMIN_EMAIL = 'masterjuego25@gmail.com'

try:
    user = auth.get_user_by_email(ADMIN_EMAIL)
    print(f"Usuario encontrado: {user.uid} ({user.email})")
    
    current_claims = user.custom_claims or {}
    print(f"Claims actuales: {current_claims}")
    
    if current_claims.get('admin') == True:
        print("El claim 'admin: true' ya esta asignado. No hay nada que hacer.")
    else:
        auth.set_custom_user_claims(user.uid, {'admin': True})
        print(f"Claim 'admin: true' asignado exitosamente al UID: {user.uid}")
        print()
        print("IMPORTANTE: El claim se aplica en el proximo ID Token.")
        print("Debes CERRAR SESION y VOLVER A INICIAR SESION en la app para que tome efecto.")

except auth.UserNotFoundError:
    print(f"No se encontro ningun usuario con el email: {ADMIN_EMAIL}")
except Exception as e:
    print(f"Error al asignar el claim: {e}")
    raise
