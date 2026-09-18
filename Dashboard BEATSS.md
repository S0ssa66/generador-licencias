# 🎛️ Dashboard operativo — BEATSS

> Índice canónico de documentación del checkout activo.
> Código fuente: `/Users/sossa/Documents/Codex/BeatSS`.
> Bóveda Obsidian: `/Users/sossa/Documents/Codex/BeatSS-Obsidian`.

Este dashboard navega documentación curada. Las exportaciones de Graphify son
derivadas y no deben tratarse como código fuente ni como notas operativas.

## 🧭 Inicio y estado

- [[CODEX_HANDOFF|Handoff de Codex]]
- [[task|Bitácora de tareas]]
- [[backlog_mejoras|Backlog de mejoras]]
- [[walkthrough|Walkthrough de cambios]]
- [[docs/3_Recursos/Graphify/GRAPHIFY_SUMMARY|Resumen operativo de Graphify]]
- [[docs/3_Recursos/Obsidian/OBSIDIAN_OPERATIONS|Operación de Obsidian]]
- [[docs/3_Recursos/Obsidian/OBSIDIAN_AUDIT|Auditoría de Obsidian]]

## 💳 Pagos, SRI y viabilidad financiera

- [[docs/2_Areas/10_Pagos/guia_configuracion_deuna_negocios|Guía de configuración Deuna! Negocios]]
- [[docs/2_Areas/10_Pagos/guia_facturacion_sri|Guía de facturación SRI]]
- [[docs/2_Areas/10_Pagos/opciones_pago_con_ruc_ecuador|Opciones de pago con RUC]]
- [[docs/2_Areas/10_Pagos/viabilidad_stripe_ecuador_llc|Viabilidad de Stripe y LLC]]
- [[docs/30_SRI/README|Documentación SRI curada]]

## 🤝 Soporte y educación

- [[docs/3_Recursos/20_Soporte/propuesta_ayuda_soporte|Propuesta de ayuda y soporte]]
- [[docs/20_Soporte/README|Recursos de soporte]]

## 📜 Contratos y licenciamiento

- [[docs/2_Areas/30_Contratos/analisis_contratos_pdf|Análisis de contratos PDF]]
- [[docs/2_Areas/30_Contratos/Analisis_Codigo_BEATSS|Análisis de código BEATSS]]
- [[docs/2_Areas/30_Contratos/Solicitud_Permiso_Sol_De_Miami|Solicitud de permiso Sol de Miami]]

## 🤖 Agentes y Project OS

El sistema actual tiene 24 agentes especialistas, un Director de Proyecto y un
Enrutador.

- [[docs/3_Recursos/40_Subagentes/agents_analysis|Análisis de agentes]]
- [[docs/3_Recursos/40_Subagentes/arquitectura_agent_os|Arquitectura BEATSS Project OS]]
- [[docs/3_Recursos/40_Subagentes/arquitectura_state_manager|Arquitectura State Manager]]
- [[docs/3_Recursos/40_Subagentes/obsidian_integracion_agentes|Integración de agentes con Obsidian]]
- [[docs/3_Recursos/40_Subagentes/reporte_optimizacion_tokens|Reporte de optimización de tokens]]

## 🔒 Seguridad

- [[docs/2_Areas/50_Seguridad/firebase_security_audit|Auditoría de seguridad Firebase]]
- [[docs/2_Areas/50_Seguridad/reporte_auditoria_seguridad|Reporte de auditoría de seguridad]]
- [[docs/2_Areas/50_Seguridad/reporte_seguridad|Reporte de seguridad]]
- [[docs/2_Areas/50_Seguridad/security-hardening-2026-07-25|Hardening de seguridad 2026-07-25]]

## 🔁 Flujo documental

1. El código y las decisiones verificadas viven en el checkout activo.
2. La documentación curada se mantiene en `docs/` y en las carpetas operativas
   de la bóveda.
3. Graphify se ejecuta manualmente y escribe únicamente salidas derivadas.
4. Los duplicados se inventarían y archivan antes de cualquier eliminación.

Para revisar la bóveda sin modificarla:

```bash
python3 scripts/obsidian_maintenance.py \
  --vault /Users/sossa/Documents/Codex/BeatSS-Obsidian \
  --report work/obsidian_audit_report.md
```
