#!/usr/bin/env python3
"""Inspecciona o procesa un solo trabajo SRI ya solicitado en BEATSS.

Por defecto es lectura. No ejecuta la cola local ni recorre otros pagos.
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sri_contingency import inspect_target_sri_job, process_firestore_jobs  # noqa: E402


def main(argv=None):
    parser = argparse.ArgumentParser(description='Inspección o emisión puntual de un trabajo SRI de BEATSS')
    parser.add_argument('--payment-id', required=True, help='ID interno del pago aprobado')
    parser.add_argument('--issue', action='store_true', help='Procesar este trabajo una sola vez')
    parser.add_argument('--confirm', help='Para emitir: ISSUE:<payment-id>')
    parser.add_argument('--expected-environment', choices=('1', '2'), help='Ambiente SRI esperado: 1 pruebas, 2 producción')
    args = parser.parse_args(argv)

    if args.issue and (args.confirm != f'ISSUE:{args.payment_id}' or not args.expected_environment):
        parser.error('Para emitir debes indicar --expected-environment y --confirm ISSUE:<payment-id>.')
    if not args.issue and (args.confirm or args.expected_environment):
        parser.error('--confirm y --expected-environment sólo se admiten con --issue.')

    try:
        summary = inspect_target_sri_job(args.payment_id)
        print(f"Pago: {summary['paymentId']}")
        print(f"Trabajo: {summary['jobStatus']} | Estado fiscal: {summary['fiscalState']} | Ambiente: {summary['ambiente']}")
        if not args.issue:
            print('Sólo inspección: no se modificó Firestore ni se contactó al SRI.')
            return 0
        if summary['ambiente'] != args.expected_environment:
            raise RuntimeError('El ambiente SRI no coincide con el ambiente confirmado; no se emitió.')
        result = process_firestore_jobs(payment_id_filter=args.payment_id)
        print(f'Finalizó el intento puntual. Estado del trabajo: {result}.')
        print('Sólo AUTORIZADO en el pago y XML/RIDE recuperables acreditan una factura terminada.')
        return 0 if result == 'DONE' else 2
    except Exception as exc:
        print(f'No se procesó de forma completa: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
