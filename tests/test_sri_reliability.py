"""Regresiones locales del flujo fiscal: no contactan Firestore ni SRI."""

import json
import os
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

import sri_contingency
import sri_service


def _write_pdf_fixture(path):
    with open(path, 'wb') as handle:
        handle.write(b'%PDF-1.7\nfixture')


class SriReliabilityTests(unittest.TestCase):
    def test_authorized_state_clears_stale_error_in_firestore_and_local_history(self):
        class Reply:
            def __init__(self, payload=None):
                self.payload = payload or {}
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self):
                return json.dumps(self.payload).encode('utf-8')

        requests = []
        replies = iter([
            Reply(),  # payment PATCH
            Reply(),  # sriJobs DONE PATCH
            Reply({'fields': {'buyerEmail': {'stringValue': ''}}}),  # email lookup; no email is sent
            Reply(),  # license PATCH
        ])
        history = [{'id': 'payment1', 'sriEstado': 'ERROR_XML', 'sriErrorMensaje': 'XML antiguo inválido'}]
        with tempfile.TemporaryDirectory() as temp_dir:
            backup_path = os.path.join(temp_dir, 'backup.json')
            with open(backup_path, 'w', encoding='utf-8') as handle:
                json.dump({'owner1_license_history': json.dumps(history)}, handle)

            def open_firestore(request):
                requests.append(request)
                return next(replies)

            with patch('sri_service.urllib.request.urlopen', side_effect=open_firestore), \
                 patch('sri_service.resolve_backup_file', return_value=(backup_path, 'owner1')):
                updated = sri_service.actualizar_estado_factura_db(
                    'payment1', 'owner1', 'AUTORIZADO', token='test-token', ref_code='payment1'
                )

            self.assertTrue(updated)
            payment_payload = json.loads(requests[0].data.decode('utf-8'))
            self.assertEqual(payment_payload['fields']['sriErrorMensaje']['stringValue'], '')
            with open(backup_path, encoding='utf-8') as handle:
                saved = json.load(handle)
            saved_history = json.loads(saved['owner1_license_history'])
            self.assertEqual(saved_history[0]['sriEstado'], 'AUTORIZADO')
            self.assertEqual(saved_history[0]['sriErrorMensaje'], '')

    def test_environment_loader_prefers_masked_private_sri_profile(self):
        class Reply:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self):
                return json.dumps(self.payload).encode('utf-8')

        requests = []
        replies = iter([
            Reply({'fields': {'sriAmbiente': {'stringValue': '1'}, 'name': {'stringValue': 'Producer'}}}),
            Reply({'fields': {
                'sriAmbiente': {'stringValue': '2'},
                'sriP12Base64': {'stringValue': 'must-not-be-read'},
            }}),
        ])
        def open_firestore(request, timeout):
            requests.append(request.full_url)
            return next(replies)

        with patch('sri_contingency.urllib.request.urlopen', side_effect=open_firestore):
            config = sri_contingency._load_public_producer_config('owner1', 'test-token')

        self.assertEqual(config['sriAmbiente'], '2')
        self.assertEqual(config['name'], 'Producer')
        self.assertNotIn('sriP12Base64', config)
        self.assertIn('private_config/sri?', requests[1])
        self.assertIn('mask.fieldPaths=sriAmbiente', requests[1])

    def test_authorized_ride_uses_writable_temporary_file_in_serverless(self):
        with tempfile.TemporaryDirectory() as temp_dir, \
             patch.dict(os.environ, {'SRI_SERVERLESS_EXECUTION': '1', 'TMPDIR': temp_dir}), \
             patch('sri_service.tempfile.tempdir', temp_dir), \
             patch('sri_service.sri_ride.generar_ride_pdf', side_effect=lambda path, *_: _write_pdf_fixture(path)) as generate:
            ride_bytes, local_path = sri_service._generate_authorized_ride_pdf(
                '<factura/>', {}, '000000042', 'access-key'
            )

            self.assertEqual(ride_bytes, b'%PDF-1.7\nfixture')
            self.assertIsNone(local_path)
            generated_path = generate.call_args.args[0]
            self.assertTrue(generated_path.startswith(temp_dir))
            self.assertFalse(os.path.exists(generated_path))

    def test_authorized_ride_keeps_local_copy_outside_serverless(self):
        with tempfile.TemporaryDirectory() as home_dir, \
             patch.dict(os.environ, {}, clear=False), \
             patch.dict(os.environ, {'HOME': home_dir}), \
             patch('sri_service.sri_ride.generar_ride_pdf', side_effect=lambda path, *_: _write_pdf_fixture(path)):
            os.environ.pop('SRI_SERVERLESS_EXECUTION', None)
            ride_bytes, local_path = sri_service._generate_authorized_ride_pdf(
                '<factura/>', {}, '000000042', 'access-key'
            )

            self.assertEqual(ride_bytes, b'%PDF-1.7\nfixture')
            self.assertTrue(local_path.startswith(os.path.join(home_dir, 'Documents', 'Licencias')))
            self.assertTrue(os.path.isfile(local_path))

    def test_authorized_serverless_ride_uploads_bytes_without_dangling_local_path(self):
        uploads = []
        with tempfile.TemporaryDirectory() as temp_dir, \
             patch.dict(os.environ, {'SRI_SERVERLESS_EXECUTION': '1', 'TMPDIR': temp_dir}), \
             patch('sri_service.tempfile.tempdir', temp_dir), \
             patch('sri_service.sri_ride.generar_ride_pdf', side_effect=lambda path, *_: _write_pdf_fixture(path)), \
             patch('sri_service.upload_sri_artifact', side_effect=lambda *args: uploads.append(args) or f'sri/{args[0]}/{args[1]}/{args[2]}'), \
             patch('sri_service.actualizar_estado_factura_db', return_value=True) as persist:
            result = sri_service._persist_authorized_sri(
                'payment1', 'owner1', 'BS3-REF', 42, 'access-key',
                {'comprobante': '<factura/>', 'numeroAutorizacion': 'access-key'}, 'token'
            )

        self.assertEqual(result, 'AUTORIZADO')
        ride_upload = next(item for item in uploads if item[4] == 'application/pdf')
        self.assertEqual(ride_upload[3], b'%PDF-1.7\nfixture')
        self.assertIsNone(persist.call_args.kwargs['ride_path'])
        self.assertEqual(persist.call_args.kwargs['ride_storage_path'], 'sri/owner1/payment1/Factura_000000042.pdf')

    def test_persistent_worker_ignores_jobs_not_selected_by_owner(self):
        self.assertFalse(sri_contingency._is_owner_manually_requested({}))
        self.assertFalse(sri_contingency._is_owner_manually_requested({'manualIssueRequested': {'booleanValue': False}}))
        self.assertTrue(sri_contingency._is_owner_manually_requested({'manualIssueRequested': {'booleanValue': True}}))
        payment = {'status': {'stringValue': 'approved'}, 'producerId': {'stringValue': 'owner1'},
                   'providerLivemode': {'booleanValue': True}, 'reference': {'stringValue': 'cs_live_123'}}
        job = {'paymentId': {'stringValue': 'order1'}, 'producerId': {'stringValue': 'owner1'},
               'manualIssueRequested': {'booleanValue': True}}
        self.assertTrue(sri_contingency._manual_issue_matches(payment, job, 'order1', 'owner1'))
        self.assertFalse(sri_contingency._manual_issue_matches(payment, {**job, 'manualIssueRequested': {'booleanValue': False}}, 'order1', 'owner1'))
        self.assertFalse(sri_contingency._manual_issue_matches(payment, job, 'order1', 'other'))
        sandbox = {**payment, 'providerLivemode': {'booleanValue': False}}
        self.assertFalse(sri_contingency._manual_issue_matches(sandbox, job, 'order1', 'owner1'))

    def test_targeted_inspection_reads_only_one_approved_live_payment(self):
        class Reply:
            def __init__(self, payload):
                self.payload = payload
            def __enter__(self):
                return self
            def __exit__(self, *_):
                return False
            def read(self):
                return json.dumps(self.payload).encode('utf-8')

        payment = {'fields': {
            'status': {'stringValue': 'approved'}, 'producerId': {'stringValue': 'owner1'},
            'reference': {'stringValue': 'cs_live_123'}, 'providerLivemode': {'booleanValue': True},
            'sriEstado': {'stringValue': 'NO_EMITIDA'},
        }}
        job = {'name': 'projects/test/databases/(default)/documents/sriJobs/order1', 'fields': {
            'paymentId': {'stringValue': 'order1'}, 'producerId': {'stringValue': 'owner1'},
            'status': {'stringValue': 'PENDING'}, 'manualIssueRequested': {'booleanValue': True},
            'manualIssueRequestedBy': {'stringValue': 'owner1'},
        }}
        reservation = {'fields': {
            'status': {'stringValue': 'RECEIVED'}, 'producerId': {'stringValue': 'owner1'},
            'accessKey': {'stringValue': '123'}, 'sequence': {'integerValue': '42'},
        }}
        with patch('sri_contingency.urllib.request.urlopen', side_effect=[Reply(payment), Reply(job), Reply(reservation)]) as requests, \
             patch('sri_contingency._load_public_producer_config', return_value={'sriAmbiente': '1'}), \
             patch.dict(os.environ, {'SRI_WORKER_ALLOWED_AMBIENTES': '1'}):
            summary = sri_contingency.inspect_target_sri_job('order1', token='test-token', expected_owner_uid='owner1')
        self.assertEqual(summary['ambiente'], '1')
        self.assertEqual(summary['jobStatus'], 'PENDING')
        self.assertEqual(requests.call_count, 3)
        self.assertEqual(summary['reservation']['status'], 'RECEIVED')
        self.assertTrue(summary['reservation']['hasAccessKey'])
        self.assertNotIn('buyerName', summary)

    def test_targeted_inspection_rejects_sandbox_before_emission(self):
        class Reply:
            def __init__(self, payload): self.payload = payload
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(self.payload).encode('utf-8')
        payment = {'fields': {'status': {'stringValue': 'approved'}, 'producerId': {'stringValue': 'owner1'},
                              'providerLivemode': {'booleanValue': False}}}
        job = {'fields': {'paymentId': {'stringValue': 'order1'}, 'producerId': {'stringValue': 'owner1'},
                          'status': {'stringValue': 'PENDING'}, 'manualIssueRequested': {'booleanValue': True},
                          'manualIssueRequestedBy': {'stringValue': 'owner1'}}}
        with patch('sri_contingency.urllib.request.urlopen', side_effect=[Reply(payment), Reply(job)]), \
             patch('sri_contingency._load_public_producer_config') as config:
            with self.assertRaisesRegex(RuntimeError, 'sandbox'):
                sri_contingency.inspect_target_sri_job('order1', token='test-token')
            config.assert_not_called()

    def test_targeted_worker_never_lists_every_job(self):
        with patch('sri_contingency.get_admin_token', return_value='test-token'), \
             patch('sri_contingency.inspect_target_sri_job', return_value={'job': {'fields': {'status': {'stringValue': 'DONE'}}}}), \
             patch('sri_contingency._list_firestore_jobs') as list_all:
            with self.assertRaisesRegex(RuntimeError, 'no se procesó'):
                sri_contingency.process_firestore_jobs(payment_id_filter='order1')
            list_all.assert_not_called()

    def test_selected_manual_job_finishes_only_that_invoice_without_worker_heartbeat(self):
        class Reply:
            def __init__(self, payload): self.payload = payload
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(self.payload).encode('utf-8')

        job = {'name': 'projects/test/databases/(default)/documents/sriJobs/order_selected',
               'updateTime': '2026-09-23T00:00:00Z',
               'fields': {
                   'paymentId': {'stringValue': 'order_selected'},
                   'reference': {'stringValue': 'BS3-REF-SELECTED'},
                   'producerId': {'stringValue': 'owner1'},
                   'status': {'stringValue': 'PENDING'},
                   'attempts': {'integerValue': '0'},
                   'manualIssueRequested': {'booleanValue': True},
                   'manualIssueRequestedBy': {'stringValue': 'owner1'},
               }}
        payment = {'fields': {'sriEstado': {'stringValue': 'AUTORIZADO'}}}
        with patch('sri_contingency.get_admin_token', return_value='test-token'), \
             patch('sri_contingency.inspect_target_sri_job', return_value={'job': job}) as inspect, \
             patch('sri_contingency._load_public_producer_config', return_value={'sriAmbiente': '2'}), \
             patch('sri_contingency._patch_firestore_fields', side_effect=[{'updateTime': 'claimed'}, {'updateTime': 'done'}]) as patch_job, \
             patch('sri_contingency._report_worker_health') as heartbeat, \
             patch('sri_service._payment_already_authorized', return_value='NO_EMITIDA'), \
             patch('sri_service.emitir_factura_sri_background') as emit, \
             patch('sri_contingency._mark_payment_sri_state'), \
             patch('sri_contingency.urllib.request.urlopen', return_value=Reply(payment)) as firestore_read:
            result = sri_contingency.process_firestore_jobs(
                payment_id_filter='order_selected', expected_owner_uid='owner1'
            )

        self.assertEqual(result, 'DONE')
        inspect.assert_called_once_with('order_selected', 'test-token', 'owner1')
        # La referencia contractual puede diferir del ID de Firestore: la
        # emisión debe consultar/reservar usando siempre el paymentId canónico.
        emit.assert_called_once_with('order_selected', 'owner1', reconciliation_only=False)
        heartbeat.assert_not_called()
        self.assertEqual(patch_job.call_count, 2)
        self.assertEqual(firestore_read.call_count, 1)
        first_write = patch_job.call_args_list[0].args[1]
        final_write = patch_job.call_args_list[1].args[1]
        self.assertEqual(first_write['status']['stringValue'], 'PROCESSING')
        self.assertEqual(final_write['status']['stringValue'], 'DONE')

    def test_reconciliation_only_rejects_missing_or_unsent_reservation_before_emission(self):
        for reservation in (None, {'fields': {
            'status': {'stringValue': 'RESERVED'}, 'producerId': {'stringValue': 'owner1'},
            'accessKey': {'stringValue': '123'}, 'sequence': {'integerValue': '42'},
        }}):
            with patch('sri_service.get_admin_token', return_value='test-token'), \
                 patch('sri_service._payment_already_authorized', return_value='PENDIENTE_AUTORIZACION'), \
                 patch('sri_service._read_sri_reservation', return_value=reservation), \
                 patch('sri_service._reconcile_sri_reservation') as reconcile:
                with self.assertRaisesRegex(sri_service.SriReconciliationRequired, 'no se generó ni reenvió'):
                    sri_service.emitir_factura_sri_background('order1', 'owner1', reconciliation_only=True)
            reconcile.assert_not_called()

    def test_direct_manual_live_is_allowed_only_for_authenticated_selected_owner(self):
        with patch.dict(os.environ, {'SRI_WORKER_ALLOWED_AMBIENTES': '1'}):
            with self.assertRaisesRegex(RuntimeError, 'no está autorizado'):
                sri_contingency._assert_worker_ambiente('2')
            self.assertEqual(sri_contingency._assert_worker_ambiente('2', allow_manual_live=True), '2')

    def test_targeted_inspection_requires_the_authenticated_owner_confirmation(self):
        class Reply:
            def __init__(self, payload): self.payload = payload
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(self.payload).encode('utf-8')
        payment = {'fields': {'status': {'stringValue': 'approved'}, 'producerId': {'stringValue': 'owner1'},
                              'reference': {'stringValue': 'cs_live_123'}, 'providerLivemode': {'booleanValue': True}}}
        job = {'fields': {'paymentId': {'stringValue': 'order1'}, 'producerId': {'stringValue': 'owner1'},
                          'status': {'stringValue': 'PENDING'}, 'manualIssueRequested': {'booleanValue': True},
                          'manualIssueRequestedBy': {'stringValue': 'owner2'}}}
        with patch('sri_contingency.urllib.request.urlopen', side_effect=[Reply(payment), Reply(job)]):
            with self.assertRaisesRegex(RuntimeError, 'no pertenece al usuario'):
                sri_contingency.inspect_target_sri_job('order1', token='test-token', expected_owner_uid='owner1')

    def test_manual_owner_can_reconcile_processing_only_after_lease_expires(self):
        class Reply:
            def __init__(self, payload): self.payload = payload
            def __enter__(self): return self
            def __exit__(self, *_): return False
            def read(self): return json.dumps(self.payload).encode('utf-8')

        payment = {'fields': {'status': {'stringValue': 'approved'}, 'producerId': {'stringValue': 'owner1'},
                              'reference': {'stringValue': 'cs_live_123'}, 'providerLivemode': {'booleanValue': True}}}
        expired_job = {'fields': {
            'paymentId': {'stringValue': 'order1'}, 'producerId': {'stringValue': 'owner1'},
            'status': {'stringValue': 'PROCESSING'}, 'manualIssueRequested': {'booleanValue': True},
            'manualIssueRequestedBy': {'stringValue': 'owner1'},
            'leaseExpiresAt': {'stringValue': '2026-09-23T11:00:00Z'},
        }}
        reservation = {'fields': {
            'status': {'stringValue': 'RECEIVED'}, 'producerId': {'stringValue': 'owner1'},
            'accessKey': {'stringValue': '123'}, 'sequence': {'integerValue': '42'},
        }}
        with patch('sri_contingency.urllib.request.urlopen', side_effect=[Reply(payment), Reply(expired_job), Reply(reservation)]), \
             patch('sri_contingency._iso_now', return_value='2026-09-23T12:00:00Z'), \
             patch('sri_contingency._load_public_producer_config', return_value={'sriAmbiente': '2'}):
            summary = sri_contingency.inspect_target_sri_job('order1', token='test-token', expected_owner_uid='owner1')
        self.assertEqual(summary['jobStatus'], 'PROCESSING')

        active_job = {'fields': {**expired_job['fields'], 'leaseExpiresAt': {'stringValue': '2026-09-23T13:00:00Z'}}}
        with patch('sri_contingency.urllib.request.urlopen', side_effect=[Reply(payment), Reply(active_job)]), \
             patch('sri_contingency._iso_now', return_value='2026-09-23T12:00:00Z'), \
             patch('sri_contingency._load_public_producer_config') as load_config:
            with self.assertRaisesRegex(RuntimeError, 'no está pendiente'):
                sri_contingency.inspect_target_sri_job('order1', token='test-token', expected_owner_uid='owner1')
            load_config.assert_not_called()

    def test_worker_defaults_to_test_environment_only(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('SRI_WORKER_ALLOWED_AMBIENTES', None)
            self.assertEqual(sri_contingency._allowed_sri_ambientes(), {'1'})
            self.assertEqual(sri_contingency._assert_worker_ambiente('1'), '1')
            with self.assertRaisesRegex(RuntimeError, 'no está autorizado'):
                sri_contingency._assert_worker_ambiente('2')

    def test_worker_rejects_invalid_environment_policy(self):
        with patch.dict(os.environ, {'SRI_WORKER_ALLOWED_AMBIENTES': '1,live'}):
            with self.assertRaisesRegex(RuntimeError, 'solo 1 o 2'):
                sri_contingency._allowed_sri_ambientes()

    def test_worker_heartbeat_reports_explicitly_allowed_environments(self):
        with patch.dict(os.environ, {'SRI_WORKER_ALLOWED_AMBIENTES': '1,2'}), \
             patch.object(sri_contingency, '_patch_firestore_fields') as report:
            sri_contingency._report_worker_health('test-token', 0)
        fields = report.call_args.args[1]
        self.assertEqual(fields['allowedAmbientes']['arrayValue']['values'], [
            {'stringValue': '1'}, {'stringValue': '2'}
        ])

    def test_invalid_numeric_buyer_does_not_become_passport(self):
        with self.assertRaisesRegex(ValueError, 'Identificación fiscal'):
            sri_service.normalizar_identificacion_comprador('1234567890', 'Cliente Real')
        with self.assertRaisesRegex(ValueError, 'Identificación fiscal'):
            sri_service.normalizar_identificacion_comprador('', 'Cliente Real')
        self.assertEqual(sri_service.normalizar_identificacion_comprador('', 'CONSUMIDOR FINAL'), ('07', '9999999999999', 'CONSUMIDOR FINAL'))

    def test_manual_invoice_details_override_payment_buyer_and_require_all_fiscal_fields(self):
        buyer = {'buyerName': 'Viejo', 'buyerDni': '', 'buyerAddress': 'Ciudad anterior', 'buyerEmail': 'old@example.com'}
        payment_fields = {'sriInvoiceDetails': {'mapValue': {'fields': {
            'mode': {'stringValue': 'identified'},
            'buyerName': {'stringValue': 'Cliente Confirmado'},
            'buyerId': {'stringValue': '1710034065'},
            'buyerAddress': {'stringValue': 'Dirección confirmada'},
            'buyerEmail': {'stringValue': 'cliente@example.com'},
        }}}}
        result = sri_service._apply_manual_sri_invoice_details(buyer, payment_fields)
        self.assertEqual(result['buyerName'], 'Cliente Confirmado')
        self.assertEqual(result['buyerDni'], '1710034065')
        self.assertEqual(result['buyerAddress'], 'Dirección confirmada')
        self.assertTrue(result['_manualFiscalDetailsConfirmed'])
        self.assertEqual(sri_service._apply_manual_sri_invoice_details(buyer, {}), buyer)

        incomplete = {'sriInvoiceDetails': {'mapValue': {'fields': {
            'mode': {'stringValue': 'identified'},
            'buyerName': {'stringValue': 'Cliente Confirmado'},
            'buyerId': {'stringValue': '1710034065'},
        }}}}
        with self.assertRaisesRegex(ValueError, 'Faltan nombre, identificación o dirección'):
            sri_service._apply_manual_sri_invoice_details(buyer, incomplete)

    def test_consumer_final_requires_explicit_confirmation_and_total_at_most_fifty(self):
        fields = {'finalPrice': {'doubleValue': 30}, 'sriInvoiceDetails': {'mapValue': {'fields': {
            'mode': {'stringValue': 'consumer_final'},
            'consumerFinalConfirmed': {'booleanValue': True},
            'buyerEmail': {'stringValue': 'comprador@example.com'},
        }}}}
        result = sri_service._apply_manual_sri_invoice_details({}, fields)
        self.assertEqual(result['buyerName'], 'CONSUMIDOR FINAL')
        self.assertEqual(result['buyerDni'], '9999999999999')
        self.assertTrue(result['_manualFiscalDetailsConfirmed'])

        value_fields = {'value': {'doubleValue': 25}, 'sriInvoiceDetails': fields['sriInvoiceDetails']}
        res_value = sri_service._apply_manual_sri_invoice_details({}, value_fields)
        self.assertEqual(res_value['buyerName'], 'CONSUMIDOR FINAL')

        amount_fields = {'amount': {'doubleValue': 45}, 'sriInvoiceDetails': fields['sriInvoiceDetails']}
        res_amount = sri_service._apply_manual_sri_invoice_details({}, amount_fields)
        self.assertEqual(res_amount['buyerName'], 'CONSUMIDOR FINAL')

        over_limit = {'finalPrice': {'doubleValue': 50.01}, 'sriInvoiceDetails': fields['sriInvoiceDetails']}
        with self.assertRaisesRegex(ValueError, 'hasta USD 50'):
            sri_service._apply_manual_sri_invoice_details({}, over_limit)

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
