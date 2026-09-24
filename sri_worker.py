#!/usr/bin/env python3
"""Punto de entrada exclusivo para el worker fiscal persistente de BEATSS."""

from sri_contingency import run_worker_forever


if __name__ == '__main__':
    run_worker_forever()
