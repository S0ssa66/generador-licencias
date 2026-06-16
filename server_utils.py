import os
import subprocess

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def get_admin_token():
    """Obtiene un token de acceso OAuth2 del sistema (gcloud o ADC) con privilegios de administrador en Firestore."""
    try:
        res = subprocess.run(["gcloud", "auth", "print-access-token"], capture_output=True, text=True, check=True)
        token = res.stdout.strip()
        if token:
            return token
    except Exception:
        pass
        
    try:
        res = subprocess.run(["gcloud", "auth", "application-default", "print-access-token"], capture_output=True, text=True, check=True)
        token = res.stdout.strip()
        if token:
            return token
    except Exception:
        pass
        
    return None

def resolve_backup_file(user_id):
    """
    Resuelve el ID de usuario (UID de Firebase o nombre legacy) a la ruta del archivo de backup
    y al nombre de usuario legacy ('sossa' o 'cgmonarco').
    """
    if user_id in ['SlO4pM3oAjZQQB2OoHU1sOTJie03', 'cgmonarco', 'beatscgmonarco@gmail.com']:
        username = 'cgmonarco'
    elif user_id in ['JkjI2lPkkZfzRXCajal9l1L10NN2', 'mrmicua', 'mistermicua@gmail.com']:
        username = 'mrmicua'
    else:
        username = 'sossa'
    
    backup_path = os.path.join(DIRECTORY, f'{username}_backup_sincronizado.json')
    return backup_path, username
