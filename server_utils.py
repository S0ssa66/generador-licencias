import os
import subprocess
import base64
import json
import time
import urllib.parse
import urllib.request


_SERVICE_ACCOUNT_TOKEN = None
_SERVICE_ACCOUNT_TOKEN_EXPIRES_AT = 0

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

def _base64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b'=').decode('ascii')


def _get_service_account_token():
    """Obtiene un token OAuth2 usando las variables de Firebase del servidor.

    En producción no se puede asumir que ``gcloud`` esté instalado. El token
    se mantiene únicamente en memoria del proceso y nunca se registra.
    """
    global _SERVICE_ACCOUNT_TOKEN, _SERVICE_ACCOUNT_TOKEN_EXPIRES_AT

    now = int(time.time())
    if _SERVICE_ACCOUNT_TOKEN and _SERVICE_ACCOUNT_TOKEN_EXPIRES_AT > now + 60:
        return _SERVICE_ACCOUNT_TOKEN

    client_email = (
        os.environ.get('FIREBASE_CLIENT_EMAIL')
        or os.environ.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')
    )
    private_key = (
        os.environ.get('FIREBASE_PRIVATE_KEY')
        or os.environ.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')
    )
    if not client_email or not private_key:
        return None

    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        private_key = private_key.replace('\\n', '\n')
        key = serialization.load_pem_private_key(private_key.encode('utf-8'), password=None)
        header = {'alg': 'RS256', 'typ': 'JWT'}
        claims = {
            'iss': client_email,
            'scope': 'https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/devstorage.read_write https://www.googleapis.com/auth/cloud-platform',
            'aud': 'https://oauth2.googleapis.com/token',
            'iat': now,
            'exp': now + 3600,
        }
        encoded_header = _base64url(json.dumps(header, separators=(',', ':')).encode('utf-8'))
        encoded_claims = _base64url(json.dumps(claims, separators=(',', ':')).encode('utf-8'))
        unsigned = f'{encoded_header}.{encoded_claims}'.encode('ascii')
        signature = key.sign(unsigned, padding.PKCS1v15(), hashes.SHA256())
        assertion = f'{encoded_header}.{encoded_claims}.{_base64url(signature)}'

        request = urllib.request.Request(
            'https://oauth2.googleapis.com/token',
            data=urllib.parse.urlencode({
                'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion': assertion,
            }).encode('ascii'),
            headers={'Content-Type': 'application/x-www-form-urlencoded'},
            method='POST',
        )
        with urllib.request.urlopen(request, timeout=15) as response:
            payload = json.loads(response.read().decode('utf-8'))
        token = payload.get('access_token')
        if not token:
            return None
        expires_in = int(payload.get('expires_in', 3600))
        _SERVICE_ACCOUNT_TOKEN = token
        _SERVICE_ACCOUNT_TOKEN_EXPIRES_AT = now + max(60, expires_in)
        return token
    except Exception as exc:
        # No incluir la respuesta OAuth ni las credenciales en los logs.
        print(f'[-] No se pudo obtener token de cuenta de servicio: {type(exc).__name__}')
        return None


def get_admin_token():
    """Obtiene un token OAuth2 para Firestore desde cuenta de servicio o gcloud."""
    service_token = _get_service_account_token()
    if service_token:
        return service_token

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
