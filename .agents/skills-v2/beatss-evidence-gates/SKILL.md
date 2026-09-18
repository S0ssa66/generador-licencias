---
name: beatss-evidence-gates
description: Verifica cambios, integraciones, pagos, entregas, autenticación y despliegues de BEATSS antes de afirmar que funcionan. Usar al diagnosticar, validar, publicar o reportar resultados que requieren evidencia local, de ejecución o externa.
---

# BEATSS Evidence Gates

## Objetivo

Separar implementación de verificación. Una compilación correcta no demuestra
un despliegue, y una sesión de checkout no demuestra pago, licencia ni entrega.

## Flujo obligatorio

1. Define el resultado observable que pidió el usuario.
2. Clasifica la evidencia disponible:
   - `static`: código, configuración o contrato presente.
   - `local_runtime`: prueba o flujo ejecutado localmente.
   - `external_runtime`: proveedor o producción consultados directamente.
   - `end_to_end`: cadena completa y efectos finales comprobados.
3. Ejecuta la comprobación mínima proporcional al riesgo.
4. Reporta cada resultado como `verified`, `partial`, `blocked` o `not_tested`.
5. Nombra los límites sin convertir inferencias en hechos.

## Puertas por tipo de cambio

- UI: compilación, prueba de interacción, anchos móvil/escritorio y captura.
- Autenticación: éxito, error, cierre y persistencia de sesión.
- Pagos: modo sandbox, firma de webhook, idempotencia, pago, licencia y entrega.
- Datos: lectura/escritura autorizada, aislamiento por usuario y recuperación.
- Despliegue: build local, despliegue confirmado, URL consultada y versión visible.
- Agentes: contrato válido, permisos, rutas, salida estructurada y prueba adversarial.

## Prohibiciones

- No afirmar “publicado” basándose solo en código local o build.
- No llamar “operativo al 100%” a una muestra parcial.
- No confundir creación de checkout con cumplimiento del pedido.
- No ocultar pruebas omitidas, fallos o dependencias externas.

## Salida esperada

Incluye resultado, evidencia, alcance comprobado, límites y siguiente acción
segura. Mantén fuera de la salida secretos, datos personales y razonamiento
privado.
