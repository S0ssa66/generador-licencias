"""Emite puntualmente una factura de una venta elegida desde BeatSS.

No procesa la cola general. Exige un token Firebase vigente, confirmación del
dueño persistida en el trabajo SRI y ambiente de producción esperado. Reutiliza
el firmador, reserva secuencial e idempotencia existentes.
"""

import base64
import json
import os
import re
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

from sri_contingency import inspect_target_sri_job, process_firestore_jobs


PROJECT_ID = os.environ.get('FIREBASE_PROJECT_ID', 'licencias-musicales')
FIREBASE_CERT_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com'
_FIREBASE_CERTS = {}
_FIREBASE_CERTS_EXPIRES_AT = 0
ALLOWED_ORIGINS = {
    'https://beatss.app',
    'https://www.beatss.app',
    'https://generador-licencias.vercel.app',
}
PROJECT_PREVIEW_ORIGIN = re.compile(
    r'^https://generador-licencias-[a-z0-9-]+-masterjuego25-5300s-projects\.vercel\.app$',
    re.IGNORECASE,
)
LOCAL_ORIGIN = re.compile(r'^http://(?:localhost|127\.0\.0\.1):\d+$')


def is_trusted_origin(origin):
    value = str(origin or '').strip()
    return value in ALLOWED_ORIGINS or bool(PROJECT_PREVIEW_ORIGIN.match(value)) or bool(LOCAL_ORIGIN.match(value))


RECONCILIATION_STATES = {'PENDIENTE_AUTORIZACION', 'PENDING_AUTORIZACION', 'CONTINGENCIA', 'EN_COLA_EMISION'}
RECONCILABLE_RESERVATIONS = {'SIGNED_READY', 'SENDING', 'RECEIVED', 'AUTHORIZED'}


class FirebaseKeyFetchError(Exception):
    """Error temporal al descargar las claves públicas de Firebase."""


def _b64url_decode(value):
    value = str(value or '')
    return base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))


def _firebase_public_keys(force_refresh=False):
    global _FIREBASE_CERTS, _FIREBASE_CERTS_EXPIRES_AT
    now = time.time()
    if not force_refresh and _FIREBASE_CERTS and now < _FIREBASE_CERTS_EXPIRES_AT:
        return _FIREBASE_CERTS
    request = urllib.request.Request(FIREBASE_CERT_URL, headers={'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=8) as response:
            certs = json.loads(response.read().decode('utf-8'))
            cache_control = response.headers.get('Cache-Control', '')
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise FirebaseKeyFetchError('No se pudieron consultar temporalmente las claves de Firebase.') from exc
    if not isinstance(certs, dict) or not certs:
        raise ValueError('No se pudieron verificar las claves de sesión.')
    max_age = re.search(r'max-age=(\d+)', cache_control)
    ttl = max(60, min(int(max_age.group(1)) if max_age else 3600, 86400))
    _FIREBASE_CERTS = certs
    _FIREBASE_CERTS_EXPIRES_AT = now + ttl
    return certs


def verify_firebase_id_token(token, now=None):
    """Verifica localmente firma y claims del ID token de Firebase Auth."""
    parts = str(token or '').split('.')
    if len(parts) != 3 or any(len(part) > 16_384 for part in parts):
        raise ValueError('Sesión inválida.')
    try:
        header = json.loads(_b64url_decode(parts[0]))
        claims = json.loads(_b64url_decode(parts[1]))
        if not isinstance(header, dict) or not isinstance(claims, dict):
            raise ValueError('Formato de sesión inválido.')
        if header.get('alg') != 'RS256' or not header.get('kid'):
            raise ValueError('Algoritmo de sesión inválido.')
        certs = _firebase_public_keys()
        pem = certs.get(header['kid'])
        if not pem:
            # Firebase puede rotar claves antes de que una instancia serverless
            # descarte su caché. Refresca una vez ante un kid desconocido; no
            # relaja firma, emisor, audiencia ni expiración del token.
            pem = _firebase_public_keys(force_refresh=True).get(header['kid'])
        if not pem:
            raise ValueError('Clave de sesión desconocida.')
        try:
            cert = x509.load_pem_x509_certificate(pem.encode('ascii'))
            public_key = cert.public_key()
        except Exception:
            public_key = serialization.load_pem_public_key(pem.encode('ascii'))
        public_key.verify(
            _b64url_decode(parts[2]),
            f'{parts[0]}.{parts[1]}'.encode('ascii'),
            padding.PKCS1v15(),
            hashes.SHA256(),
        )
    except FirebaseKeyFetchError:
        raise
    except Exception as exc:
        raise ValueError('No se pudo verificar la sesión de Firebase.') from exc

    timestamp = int(now if now is not None else time.time())
    uid = str(claims.get('sub') or '')
    required_times = ('exp', 'iat', 'auth_time')
    if (not uid or len(uid) > 128 or claims.get('aud') != PROJECT_ID or
            claims.get('iss') != f'https://securetoken.google.com/{PROJECT_ID}' or
            any(not isinstance(claims.get(key), int) for key in required_times) or
            claims['exp'] <= timestamp or claims['iat'] > timestamp + 60 or claims['iat'] < timestamp - 3600 or
            claims['auth_time'] > timestamp + 60 or
            int(claims.get('nbf', 0)) > timestamp + 60):
        raise ValueError('La sesión de Firebase expiró o no pertenece a BEATSS.')
    return {'uid': uid, 'claims': claims}


def _json_response(handler, status, payload, extra_headers=None):
    encoded = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Cache-Control', 'private, no-store')
    handler.send_header('X-Content-Type-Options', 'nosniff')
    handler.send_header('Content-Length', str(len(encoded)))
    for name, value in (extra_headers or {}).items():
        handler.send_header(name, value)
    handler.end_headers()
    handler.wfile.write(encoded)


class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        origin = self.headers.get('Origin', '')
        if not is_trusted_origin(origin):
            return _json_response(self, 403, {'error': 'Origen no permitido.'})
        self.send_response(204)
        if origin:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def do_GET(self):
        return _json_response(
            self,
            405,
            {'error': 'Método no permitido.'},
            {'Allow': 'POST, OPTIONS'},
        )

    def do_POST(self):
        origin = self.headers.get('Origin', '')
        if origin and not is_trusted_origin(origin):
            return _json_response(self, 403, {'error': 'Origen no permitido.'})
        identity = None
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length < 1 or length > 8192:
                return _json_response(self, 413, {'error': 'Solicitud inválida.'})
            authorization = self.headers.get('Authorization', '')
            if not authorization.startswith('Bearer '):
                return _json_response(self, 401, {'error': 'Inicia sesión nuevamente.'})
            if not self.headers.get('Content-Type', '').lower().startswith('application/json'):
                return _json_response(self, 415, {'error': 'Formato de solicitud no admitido.'})
            try:
                identity = verify_firebase_id_token(authorization[7:].strip())
            except FirebaseKeyFetchError:
                return _json_response(self, 503, {
                    'error': 'Firebase no está disponible para validar la sesión. Esta solicitud no se procesó; actualiza el estado de esta misma venta antes de continuar.'
                })
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            payment_id = str(payload.get('paymentId') or '').strip()
            action = str(payload.get('action') or 'issue').strip().lower()
            if not re.fullmatch(r'[A-Za-z0-9_-]{3,160}', payment_id):
                return _json_response(self, 400, {'error': 'ID de pago inválido.'})
            if action not in {'issue', 'reconcile'}:
                return _json_response(self, 400, {'error': 'Acción fiscal inválida.'})
            if payload.get('confirmManualIssue') is not True or payload.get('expectedEnvironment') != '2':
                return _json_response(self, 400, {'error': 'Confirma la emisión de esta venta en ambiente de producción.'})

            summary = inspect_target_sri_job(payment_id, expected_owner_uid=identity['uid'])
            if summary['ambiente'] != '2':
                return _json_response(self, 409, {'error': 'El ambiente SRI de la cuenta no coincide con Producción.'})
            fiscal_state = str(summary.get('fiscalState') or '').upper()
            reservation = summary.get('reservation') or {}
            if action == 'reconcile':
                if fiscal_state not in RECONCILIATION_STATES:
                    return _json_response(self, 409, {'error': 'Esta venta no está marcada para conciliación fiscal.'})
                if (not reservation.get('exists') or
                        reservation.get('producerId') != identity['uid'] or
                        reservation.get('status') not in RECONCILABLE_RESERVATIONS or
                        not reservation.get('hasAccessKey') or not reservation.get('hasSequence')):
                    return _json_response(self, 409, {
                        'error': 'No existe una clave fiscal enviada y verificable para consultar. No se generó ni reenvió una factura; requiere revisión manual.'
                    })
            elif fiscal_state in RECONCILIATION_STATES:
                return _json_response(self, 409, {'error': 'Esta venta ya está pendiente de autorización; consulta su clave existente en vez de emitir otra.'})
            os.environ['SRI_SERVERLESS_EXECUTION'] = '1'
            # Una invocación corta confirma recepción y consulta una sola vez.
            # Las consultas posteriores usan la reserva existente y jamás
            # repiten el envío SOAP de Recepción.
            os.environ['SRI_AUTH_WAIT_SECONDS'] = '1'
            os.environ['SRI_AUTH_POLL_DELAY_SECONDS'] = '1'
            os.environ['SRI_AUTH_POLL_ATTEMPTS'] = '1'
            job_status = process_firestore_jobs(
                payment_id_filter=payment_id,
                expected_owner_uid=identity['uid'],
                reconciliation_only=action == 'reconcile',
            )
            final = inspect_target_sri_job(payment_id, expected_owner_uid=identity['uid'], allow_nonpending=True)
            is_authorized = final['fiscalState'] == 'AUTORIZADO'
            response_status = 200 if is_authorized else 202
            message = ('Factura autorizada por el SRI.' if is_authorized else
                       ('El SRI aún no confirma autorización para esta clave. No se envió otra factura; consulta esta misma venta más tarde.'
                        if action == 'reconcile' else
                        'Envío procesado; el SRI aún no confirma autorización. Puedes consultar esta misma venta más tarde; no se crea otra factura.'))
            return _json_response(self, response_status, {
                'status': job_status,
                'jobStatus': final['jobStatus'],
                'fiscalState': final['fiscalState'],
                'message': message,
            })
        except ValueError as exc:
            return _json_response(self, 401 if identity is None else 409, {'error': str(exc)})
        except Exception as exc:
            # Nunca devolver/registrar payload, certificado, contraseña ni token.
            err_msg = str(exc)
            safe_msg = re.sub(r'(Bearer\s+[A-Za-z0-9._-]+|password["\']?\s*[:=]\s*["\']?[^"\'\s]+)', '[REDACTED]', err_msg, flags=re.I)
            print(f'[SRI one-shot] No se completó la emisión: {type(exc).__name__}: {safe_msg}')
            return _json_response(self, 409, {
                'error': f'No se pudo confirmar la factura. {safe_msg[:180]}'
            })

    def log_message(self, _format, *_args):
        # Evita que el access log incluya query strings o datos de sesión.
        return
