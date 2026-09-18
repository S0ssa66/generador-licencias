---
name: beatss-sensitive-actions
description: Controla operaciones sensibles de BEATSS relacionadas con pagos, despliegues, Firestore, correos, datos personales, impuestos y secretos. Usar antes de ejecutar o proponer cualquier acción que pueda producir cargos, mensajes o cambios externos.
---

# BEATSS Sensitive Actions

## Clasificación

- `read_only`: inspección sin cambios externos.
- `local_reversible`: cambio local preservando el trabajo existente.
- `sandbox_external`: efecto externo con datos sintéticos y proveedor en pruebas.
- `production_external`: cobro, reembolso, correo, despliegue o escritura real.

## Reglas

1. Confirma alcance, entorno y objetivo antes de una acción externa.
2. Usa sandbox y datos sintéticos para pagos y entregas de prueba.
3. Requiere autorización explícita para producción, cobros, reembolsos,
   despliegues, correos o cambios de datos remotos.
4. Nunca muestres valores de `.env`, tokens, claves, certificados o credenciales.
5. Protege webhooks con firma, idempotencia y registro seguro de eventos.
6. Para pagos verifica por separado checkout, pago, webhook, licencia y entrega.
7. Para datos fiscales o personales limita la salida al mínimo necesario.
8. Si falta autorización, entrega diagnóstico y plan, no ejecutes el efecto.

## Escrituras locales

- Conserva cambios heredados y revisa colisiones antes de editar.
- Usa rutas explícitas dentro del proyecto.
- No borres agentes o documentación histórica sin permiso.
- Las escrituras de un agente requieren política `approval_required`; los
  dominios de alto riesgo usan `deny` y solo pueden proponer cambios.

## Evidencia de cierre

Registra entorno usado, datos sintéticos, acción autorizada, resultado,
idempotencia, efectos observados y cualquier paso no comprobado.
