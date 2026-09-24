import unittest
import datetime
from zoneinfo import ZoneInfoNotFoundError
from unittest.mock import patch

import sri_invoicing
from sri_service import validar_cedula_ruc_ecuador, validar_configuracion_emisor_sri


class SriInvoicingTests(unittest.TestCase):
    def test_timezone_falls_back_to_ecuador_continental_when_tzdb_is_missing(self):
        with patch('sri_invoicing.ZoneInfo', side_effect=ZoneInfoNotFoundError):
            timezone = sri_invoicing._load_ecuador_timezone()

        self.assertEqual(
            datetime.datetime(2026, 9, 24, 2, 30, tzinfo=timezone).utcoffset(),
            datetime.timedelta(hours=-5)
        )

    def test_xml_access_key_and_xades_timestamp_use_ecuador_date_from_utc(self):
        utc_instant = datetime.datetime(2026, 9, 24, 2, 30, tzinfo=datetime.timezone.utc)
        with patch.object(sri_invoicing, 'ecuador_now', return_value=utc_instant):
            emission_time = sri_invoicing.ecuador_now()
            key = sri_invoicing.generar_clave_acceso(
                emission_time, '01', '0803743111001', '2', '001001', '000000001', '12345678'
            )
            xml = sri_invoicing.generar_xml_factura(
                emisor={
                    'ruc': '0803743111001', 'razonSocial': 'BEATSS TEST',
                    'dirMatriz': 'Quito - Ecuador', 'ambiente': '2',
                    'estab': '001', 'ptoEmi': '001', 'sriIvaTarifa': '15'
                },
                comprador={
                    'tipoIdentificacionComprador': '07',
                    'razonSocialComprador': 'CONSUMIDOR FINAL',
                    'identificacionComprador': '9999999999999'
                },
                items=[{'codigoPrincipal': 'BEAT', 'descripcion': 'Licencia', 'cantidad': 1, 'precioUnitario': 30}],
                secuencial='000000001', clave_acceso=key, fecha_emision=emission_time
            )
            signing_time = sri_invoicing.formato_timestamp_firma_ecuador()

        self.assertEqual(key[:8], '23092026')
        self.assertIn('<fechaEmision>23/09/2026</fechaEmision>', xml)
        self.assertEqual(signing_time, '2026-09-23T21:30:00-05:00')

    def test_payment_methods_used_by_beatss_map_to_sri_codes(self):
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('PayPal'), '20')
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('PayPhone'), '20')
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('Deuna'), '20')

    def test_rimpe_popular_invoice_keeps_paid_total_and_declares_regime(self):
        import xml.etree.ElementTree as ET

        emitter = {
            'ruc': '0803743111001',
            'razonSocial': 'BEATSS TEST',
            'dirMatriz': 'DIRECCION DE PRUEBA',
            'ambiente': '2',
            'estab': '001',
            'ptoEmi': '001',
            'sriRimpe': 'rimpe_popular',
        }
        emission_date = datetime.datetime(2026, 9, 24, 12, 0, tzinfo=sri_invoicing.ECUADOR_TIMEZONE)
        access_key = sri_invoicing.generar_clave_acceso(
            emission_date, '01', emitter['ruc'], '2', '001001', '000000001', '12345678'
        )

        xml = sri_invoicing.generar_xml_factura(
            emisor=emitter,
            comprador={
                'tipoIdentificacionComprador': '07',
                'razonSocialComprador': 'CONSUMIDOR FINAL',
                'identificacionComprador': '9999999999999',
                'formaPago': 'Transferencia',
            },
            items=[{
                'codigoPrincipal': 'BEAT',
                'descripcion': 'Licencia musical',
                'cantidad': 1,
                'precioUnitario': 30,
                'descuento': 0,
            }],
            secuencial='000000001',
            clave_acceso=access_key,
            fecha_emision=emission_date,
        )
        invoice = ET.fromstring(xml)

        self.assertEqual(
            invoice.findtext('infoTributaria/contribuyenteRimpe'),
            'CONTRIBUYENTE NEGOCIO POPULAR - RÉGIMEN RIMPE',
        )
        self.assertEqual(invoice.findtext('infoFactura/totalSinImpuestos'), '30.00')
        self.assertEqual(invoice.findtext('infoFactura/totalConImpuestos/totalImpuesto/codigoPorcentaje'), '0')
        self.assertEqual(invoice.findtext('infoFactura/totalConImpuestos/totalImpuesto/valor'), '0.00')
        self.assertEqual(invoice.findtext('infoFactura/importeTotal'), '30.00')
        self.assertEqual(invoice.findtext('infoFactura/pagos/pago/total'), '30.00')

    def test_access_key_has_49_digits_and_is_repeatable(self):
        args = ('01082026', '01', '0803743111001', '1', '001001', '000000001', '12345678')
        first = sri_invoicing.generar_clave_acceso(*args)
        second = sri_invoicing.generar_clave_acceso(*args)
        self.assertEqual(first, second)
        self.assertRegex(first, r'^\d{49}$')

    def test_emitter_config_and_invoice_xml(self):
        config = {
            'sriRuc': '0803743111001',
            'sriRazonSocial': 'BEATSS TEST',
            'sriDirMatriz': 'Quito - Ecuador',
            'sriEstab': '001',
            'sriPtoEmi': '001',
            'sriAmbiente': '1',
            'sriRimpe': 'no_rimpe',
            'sriContabilidad': 'NO',
            'sriIvaTarifa': '15',
        }
        self.assertTrue(validar_cedula_ruc_ecuador(config['sriRuc']))
        self.assertEqual(validar_configuracion_emisor_sri(config), [])

        access_key = sri_invoicing.generar_clave_acceso(
            '01082026', '01', config['sriRuc'], '1', '001001', '000000001', '12345678'
        )
        xml = sri_invoicing.generar_xml_factura(
            emisor={
                **config,
                'ruc': config['sriRuc'],
                'razonSocial': config['sriRazonSocial'],
                'ambiente': '1',
                'estab': '001',
                'ptoEmi': '001',
            },
            comprador={
                'tipoIdentificacionComprador': '07',
                'razonSocialComprador': 'CONSUMIDOR FINAL',
                'identificacionComprador': '9999999999999',
                'formaPago': 'PayPal',
            },
            items=[{
                'codigoPrincipal': 'BEAT',
                'descripcion': 'Licencia de prueba',
                'cantidad': 1,
                'precioUnitario': 30,
                'descuento': 0,
            }],
            secuencial='000000001',
            clave_acceso=access_key,
        )
        sri_invoicing.validar_xml_factura_basico(xml)
        self.assertIn('<formaPago>20</formaPago>', xml)

    def test_emitter_accepts_matrix_address_from_current_ruc(self):
        config = {
            'sriRuc': '0803743111001',
            'sriRazonSocial': 'BEATSS TEST',
            'sriDirMatriz': 'DIRECCION REGISTRADA EN RUC',
            'sriEstab': '001',
            'sriPtoEmi': '001',
            'sriAmbiente': '2',
            'sriRimpe': 'no_rimpe',
            'sriContabilidad': 'NO',
            'sriIvaTarifa': '15',
        }

        errors = validar_configuracion_emisor_sri(config)

        self.assertFalse(any('dirección de matriz' in error for error in errors))

    def test_emitter_requires_matrix_address_without_echoing_other_fields(self):
        config = {
            'sriRuc': '0803743111001',
            'sriRazonSocial': 'BEATSS TEST',
            'sriDirMatriz': '',
            'sriEstab': '001',
            'sriPtoEmi': '001',
            'sriAmbiente': '2',
            'sriRimpe': 'no_rimpe',
            'sriContabilidad': 'NO',
            'sriIvaTarifa': '15',
        }
        errors = validar_configuracion_emisor_sri(config)
        self.assertTrue(any('dirección de matriz no configurada' in error for error in errors))

    def test_ride_pdf_dynamic_vat_breakdown(self):
        import tempfile
        import os
        import sri_ride

        emission_time = sri_invoicing.ecuador_now()
        key = sri_invoicing.generar_clave_acceso(
            emission_time, '01', '0803743111001', '2', '001001', '000000001', '12345678'
        )
        xml = sri_invoicing.generar_xml_factura(
            emisor={
                'ruc': '0803743111001', 'razonSocial': 'BEATSS TEST',
                'dirMatriz': 'Quito - Ecuador', 'ambiente': '2',
                'estab': '001', 'ptoEmi': '001', 'sriIvaTarifa': '15'
            },
            comprador={
                'tipoIdentificacionComprador': '05',
                'razonSocialComprador': 'CLIENTE TEST',
                'identificacionComprador': '1710034065'
            },
            items=[{'codigoPrincipal': 'BEAT', 'descripcion': 'Licencia Premium', 'cantidad': 1, 'precioUnitario': 30}],
            secuencial='000000001', clave_acceso=key, fecha_emision=emission_time
        )
        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as f:
            pdf_path = f.name
        try:
            sri_ride.generar_ride_pdf(pdf_path, xml, {'numeroAutorizacion': key, 'fechaAutorizacion': '2026-09-24 18:00:00'})
            self.assertTrue(os.path.exists(pdf_path))
            self.assertGreater(os.path.getsize(pdf_path), 1000)
        finally:
            if os.path.exists(pdf_path):
                os.remove(pdf_path)


if __name__ == '__main__':
    unittest.main()
