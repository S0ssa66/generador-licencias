import unittest

import sri_invoicing
from sri_service import validar_cedula_ruc_ecuador, validar_configuracion_emisor_sri


class SriInvoicingTests(unittest.TestCase):
    def test_payment_methods_used_by_beatss_map_to_sri_codes(self):
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('PayPal'), '20')
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('PayPhone'), '20')
        self.assertEqual(sri_invoicing.normalizar_forma_pago_sri('Deuna'), '20')

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


if __name__ == '__main__':
    unittest.main()
