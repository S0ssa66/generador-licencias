"""Regresiones locales del flujo fiscal: no contactan Firestore ni SRI."""

import json
import unittest
import urllib.error
from unittest.mock import patch

import sri_contingency
import sri_service


class SriReliabilityTests(unittest.TestCase):
    def test_invalid_numeric_buyer_does_not_become_passport(self):
        with self.assertRaisesRegex(ValueError, 'Identificación fiscal'):
            sri_service.normalizar_identificacion_comprador('1234567890', 'Cliente Real')
        with self.assertRaisesRegex(ValueError, 'Identificación fiscal'):
            sri_service.normalizar_identificacion_comprador('', 'Cliente Real')
        self.assertEqual(sri_service.normalizar_identificacion_comprador('', 'CONSUMIDOR FINAL'), ('07', '9999999999999', 'CONSUMIDOR FINAL'))

    def test_reservation_read_only_treats_404_as_absence(self):
        with patch('sri_service.urllib.request.urlopen', side_effect=urllib.error.HTTPError('test', 404, 'missing', {}, None)):
            self.assertIsNone(sri_service._read_sri_reservation('order1', 'token'))
        with patch('sri_service.urllib.request.urlopen', side_effect=urllib.error.HTTPError('test', 403, 'denied', {}, None)):
            with self.assertRaisesRegex(RuntimeError, 'reserva fiscal'):
                sri_service._read_sri_reservation('order1', 'token')

    def test_prepared_reservation_cannot_allocate_another_sequence(self):
        reservation = {'fields': {
            'producerId': {'stringValue': 'owner1'}, 'series': {'stringValue': '001001'},
            'status': {'stringValue': 'SENDING'}, 'sequence': {'integerValue': '42'},
        }}
        with patch('sri_service._read_sri_reservation', return_value=reservation), patch('sri_service.urllib.request.urlopen') as network:
            with self.assertRaises(sri_service.SriReconciliationRequired):
                sri_service.reservar_secuencial_sri('owner1', 'order1', {}, {}, token='token')
            network.assert_not_called()

    def test_reconciliation_does_not_resend_to_reception(self):
        fields = {'accessKey': {'stringValue': 'test-access-key'}, 'sequence': {'integerValue': '42'}}
        aut = {'estado': 'AUTORIZADO', 'comprobante': '<factura/>', 'numeroAutorizacion': 'test-access-key'}
        with patch('sri_service.sri_invoicing.consultar_sri_autorizacion', return_value='<soap/>') as query, \
             patch('sri_service.sri_invoicing.parsear_respuesta_autorizacion', return_value={'autorizaciones': [aut]}), \
             patch('sri_service._update_sri_reservation') as update, \
             patch('sri_service._persist_authorized_sri', return_value='AUTORIZADO') as persist:
            result = sri_service._reconcile_sri_reservation('order1', 'owner1', {'sriAmbiente': '1'}, fields, 'token')
            self.assertEqual(result, 'AUTORIZADO')
            query.assert_called_once()
            update.assert_called_once_with('order1', 'token', status='AUTHORIZED')
            persist.assert_called_once()

    def test_remote_worker_paginates_all_jobs(self):
        class Reply:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self):
                return json.dumps(self.payload).encode('utf-8')

        with patch('sri_contingency.urllib.request.urlopen', side_effect=[
            Reply({'documents': [{'name': 'job1'}], 'nextPageToken': 'next'}),
            Reply({'documents': [{'name': 'job2'}]})
        ]) as requests:
            self.assertEqual([item['name'] for item in sri_contingency._list_firestore_jobs('https://example.test/jobs', 'token')], ['job1', 'job2'])
            self.assertIn('pageToken=next', requests.call_args_list[1].args[0].full_url)


if __name__ == '__main__':
    unittest.main()
