"""Pruebas locales del endpoint SRI puntual; no contactan servicios externos."""

import base64
from io import BytesIO
import importlib.util
import json
from email.message import Message
import os
from pathlib import Path
import urllib.error
import unittest
from unittest.mock import MagicMock, patch

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa


MODULE_PATH = Path(__file__).resolve().parents[1] / 'api' / 'sri-issue.py'
SPEC = importlib.util.spec_from_file_location('sri_issue_api', MODULE_PATH)
sri_issue_api = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sri_issue_api)


def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _token(private_key, claims, kid='test-key'):
    header = _b64url(json.dumps({'alg': 'RS256', 'kid': kid}, separators=(',', ':')).encode())
    payload = _b64url(json.dumps(claims, separators=(',', ':')).encode())
    signing_input = f'{header}.{payload}'.encode('ascii')
    signature = private_key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
    return f'{header}.{payload}.{_b64url(signature)}'


class SriIssueApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        cls.pem = cls.private_key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ).decode('ascii')

    def setUp(self):
        sri_issue_api._FIREBASE_CERTS = {'test-key': self.pem}
        sri_issue_api._FIREBASE_CERTS_EXPIRES_AT = 4_000_000_000
        self.old_serverless = os.environ.get('SRI_SERVERLESS_EXECUTION')
        self.old_wait = os.environ.get('SRI_AUTH_WAIT_SECONDS')
        self.old_delay = os.environ.get('SRI_AUTH_POLL_DELAY_SECONDS')
        self.old_attempts = os.environ.get('SRI_AUTH_POLL_ATTEMPTS')

    def tearDown(self):
        for name, value in (
            ('SRI_SERVERLESS_EXECUTION', self.old_serverless),
            ('SRI_AUTH_WAIT_SECONDS', self.old_wait),
            ('SRI_AUTH_POLL_DELAY_SECONDS', self.old_delay),
            ('SRI_AUTH_POLL_ATTEMPTS', self.old_attempts),
        ):
            if value is None:
                os.environ.pop(name, None)
            else:
                os.environ[name] = value

    def test_get_returns_method_not_allowed_and_allowed_methods(self):
        class Request:
            def __init__(self):
                self.wfile = BytesIO()
                self.response_status = None
                self.response_headers = {}

            def send_response(self, status):
                self.response_status = status

            def send_header(self, name, value):
                self.response_headers[name] = value

            def end_headers(self):
                pass

        request = Request()
        sri_issue_api.handler.do_GET(request)

        self.assertEqual(request.response_status, 405)
        self.assertEqual(request.response_headers['Allow'], 'POST, OPTIONS')
        self.assertEqual(json.loads(request.wfile.getvalue())['error'], 'Método no permitido.')

    @staticmethod
    def _post(body, *, token='firebase-token', origin='https://beatss.app'):
        class Request:
            def __init__(self):
                self.headers = Message()
                self.headers['Content-Length'] = str(len(body))
                self.headers['Content-Type'] = 'application/json'
                self.headers['Authorization'] = f'Bearer {token}'
                self.headers['Origin'] = origin
                self.rfile = BytesIO(body)
                self.wfile = BytesIO()
                self.response_status = None
                self.response_headers = {}

            def send_response(self, status):
                self.response_status = status

            def send_header(self, name, value):
                self.response_headers[name] = value

            def end_headers(self):
                pass

        request = Request()
        sri_issue_api.handler.do_POST(request)
        return request.response_status, json.loads(request.wfile.getvalue())

    def test_valid_firebase_session_returns_only_uid_and_claims(self):
        claims = {
            'sub': 'owner123', 'aud': sri_issue_api.PROJECT_ID,
            'iss': f'https://securetoken.google.com/{sri_issue_api.PROJECT_ID}',
            'exp': 2000, 'iat': 1000, 'auth_time': 900,
        }
        verified = sri_issue_api.verify_firebase_id_token(_token(self.private_key, claims), now=1500)
        self.assertEqual(verified['uid'], 'owner123')

    def test_unknown_firebase_kid_refreshes_cached_certificates_once(self):
        claims = {
            'sub': 'owner123', 'aud': sri_issue_api.PROJECT_ID,
            'iss': f'https://securetoken.google.com/{sri_issue_api.PROJECT_ID}',
            'exp': 2000, 'iat': 1000, 'auth_time': 900,
        }
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps({'rotated-key': self.pem}).encode('utf-8')
        response.headers.get.return_value = 'public, max-age=3600'
        with patch.object(sri_issue_api.urllib.request, 'urlopen', return_value=response) as fetch:
            verified = sri_issue_api.verify_firebase_id_token(
                _token(self.private_key, claims, kid='rotated-key'), now=1500
            )

        self.assertEqual(verified['uid'], 'owner123')
        fetch.assert_called_once()

    def test_firebase_certificate_network_error_is_classified_as_temporary(self):
        sri_issue_api._FIREBASE_CERTS = {}
        sri_issue_api._FIREBASE_CERTS_EXPIRES_AT = 0
        with patch.object(sri_issue_api.urllib.request, 'urlopen', side_effect=urllib.error.URLError('offline')):
            with self.assertRaises(sri_issue_api.FirebaseKeyFetchError):
                sri_issue_api._firebase_public_keys()

    def test_expired_or_wrong_project_session_is_rejected(self):
        base = {
            'sub': 'owner123', 'aud': sri_issue_api.PROJECT_ID,
            'iss': f'https://securetoken.google.com/{sri_issue_api.PROJECT_ID}',
            'exp': 1200, 'iat': 1000, 'auth_time': 900,
        }
        with self.assertRaisesRegex(ValueError, 'expiró'):
            sri_issue_api.verify_firebase_id_token(_token(self.private_key, base), now=1500)
        wrong_project = {**base, 'exp': 2000, 'aud': 'another-project'}
        with self.assertRaisesRegex(ValueError, 'expiró'):
            sri_issue_api.verify_firebase_id_token(_token(self.private_key, wrong_project), now=1500)

    def test_signature_tampering_is_rejected(self):
        claims = {
            'sub': 'owner123', 'aud': sri_issue_api.PROJECT_ID,
            'iss': f'https://securetoken.google.com/{sri_issue_api.PROJECT_ID}',
            'exp': 2000, 'iat': 1000, 'auth_time': 900,
        }
        token = _token(self.private_key, claims)
        parts = token.split('.')
        parts[1] = _b64url(json.dumps({**claims, 'sub': 'attacker'}).encode())
        with self.assertRaisesRegex(ValueError, 'verificar la sesión'):
            sri_issue_api.verify_firebase_id_token('.'.join(parts), now=1500)

    def test_http_issue_processes_only_the_authenticated_selected_live_sale(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', side_effect=[
                 {'ambiente': '2'}, {'fiscalState': 'AUTORIZADO', 'jobStatus': 'DONE'}
             ]) as inspect, \
             patch.object(sri_issue_api, 'process_firestore_jobs', return_value='DONE') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 200)
        self.assertEqual(payload['fiscalState'], 'AUTORIZADO')
        process.assert_called_once_with(
            payment_id_filter='paid_order_123', expected_owner_uid='owner123', reconciliation_only=False
        )
        self.assertEqual(inspect.call_count, 2)
        self.assertEqual(inspect.call_args.kwargs['expected_owner_uid'], 'owner123')

    def test_http_reconciliation_consults_only_a_verified_existing_reservation(self):
        body = json.dumps({
            'paymentId': 'paid_order_123', 'action': 'reconcile',
            'confirmManualIssue': True, 'expectedEnvironment': '2',
        }).encode()
        summary = {
            'ambiente': '2', 'fiscalState': 'PENDIENTE_AUTORIZACION', 'jobStatus': 'CONTINGENCY',
            'reservation': {
                'exists': True, 'status': 'RECEIVED', 'producerId': 'owner123',
                'hasAccessKey': True, 'hasSequence': True,
            },
        }
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', side_effect=[summary, {
                 'fiscalState': 'PENDIENTE_AUTORIZACION', 'jobStatus': 'CONTINGENCY'
             }]), \
             patch.object(sri_issue_api, 'process_firestore_jobs', return_value='CONTINGENCY') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 202)
        self.assertIn('No se envió otra factura', payload['message'])
        process.assert_called_once_with(
            payment_id_filter='paid_order_123', expected_owner_uid='owner123', reconciliation_only=True
        )

    def test_http_reconciliation_without_existing_sent_reservation_never_processes(self):
        body = json.dumps({
            'paymentId': 'paid_order_123', 'action': 'reconcile',
            'confirmManualIssue': True, 'expectedEnvironment': '2',
        }).encode()
        summary = {
            'ambiente': '2', 'fiscalState': 'PENDIENTE_AUTORIZACION', 'jobStatus': 'CONTINGENCY',
            'reservation': {'exists': False},
        }
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', return_value=summary), \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 409)
        self.assertIn('No se generó ni reenvió', payload['error'])
        process.assert_not_called()

    def test_http_issue_rejects_a_payment_already_waiting_for_sri_authorization(self):
        body = json.dumps({
            'paymentId': 'paid_order_123', 'action': 'issue',
            'confirmManualIssue': True, 'expectedEnvironment': '2',
        }).encode()
        summary = {'ambiente': '2', 'fiscalState': 'CONTINGENCIA', 'reservation': {'exists': True}}
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', return_value=summary), \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 409)
        self.assertIn('consulta su clave existente', payload['error'])
        process.assert_not_called()

    def test_http_endpoint_rejects_missing_manual_confirmation_before_firestore(self):
        body = json.dumps({'paymentId': 'paid_order_123', 'expectedEnvironment': '2'}).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job') as inspect, \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 400)
        self.assertIn('Confirma', payload['error'])
        inspect.assert_not_called()
        process.assert_not_called()

    def test_http_endpoint_rejects_a_nonproduction_environment_before_processing(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '1',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job') as inspect, \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 400)
        self.assertIn('producción', payload['error'].lower())
        inspect.assert_not_called()
        process.assert_not_called()

    def test_http_endpoint_rejects_missing_or_invalid_firebase_session(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', side_effect=ValueError('Sesión inválida.')), \
             patch.object(sri_issue_api, 'inspect_target_sri_job') as inspect, \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 401)
        self.assertIn('Sesión inválida', payload['error'])
        inspect.assert_not_called()
        process.assert_not_called()

    def test_http_endpoint_reports_temporary_firebase_key_fetch_failure_without_processing(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', side_effect=sri_issue_api.FirebaseKeyFetchError(
                 'No se pudieron consultar temporalmente las claves de Firebase.'
             )), \
             patch.object(sri_issue_api, 'inspect_target_sri_job') as inspect, \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 503)
        self.assertIn('no se procesó', payload['error'])
        inspect.assert_not_called()
        process.assert_not_called()

    def test_http_endpoint_classifies_post_authentication_validation_errors_as_conflict(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', side_effect=ValueError(
                 'El trabajo fiscal ya no está pendiente.'
             )), \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 409)
        self.assertIn('trabajo fiscal', payload['error'])
        process.assert_not_called()

    def test_http_endpoint_does_not_process_if_owner_has_not_selected_the_sale(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', side_effect=RuntimeError(
                 'El dueño todavía no confirmó esta venta desde BeatSS.'
             )), \
             patch.object(sri_issue_api, 'process_firestore_jobs') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 409)
        self.assertIn('no se pudo confirmar', payload['error'].lower())
        process.assert_not_called()

    def test_http_endpoint_keeps_pending_authorization_on_same_fiscal_job(self):
        body = json.dumps({
            'paymentId': 'paid_order_123',
            'confirmManualIssue': True,
            'expectedEnvironment': '2',
        }).encode()
        with patch.object(sri_issue_api, 'verify_firebase_id_token', return_value={'uid': 'owner123'}), \
             patch.object(sri_issue_api, 'inspect_target_sri_job', side_effect=[
                 {'ambiente': '2'}, {'fiscalState': 'PENDIENTE_AUTORIZACION', 'jobStatus': 'CONTINGENCY'}
             ]), \
             patch.object(sri_issue_api, 'process_firestore_jobs', return_value='CONTINGENCY') as process:
            status, payload = self._post(body)

        self.assertEqual(status, 202)
        self.assertIn('misma venta', payload['message'])
        process.assert_called_once_with(
            payment_id_filter='paid_order_123', expected_owner_uid='owner123', reconciliation_only=False
        )


if __name__ == '__main__':
    unittest.main()
