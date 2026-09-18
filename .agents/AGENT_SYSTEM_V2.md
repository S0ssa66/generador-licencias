# Sistema de agentes BEATSS v2

## Arquitectura activa

El registro canónico está en `agent-registry-v2.json`. El motor Python resuelve
los nombres históricos hacia diez agentes v2, carga su contrato y limita sus
herramientas antes de ejecutar cualquier acción. OpenCode aporta inferencia con
`deepseek/deepseek-v4-flash`; no recibe herramientas ni acceso directo al disco.

Flujo:

1. El Enrutador decide `DIRECT` o `DELEGATE`.
2. El Director elige hasta tres agentes canónicos.
3. `agent_registry.py` resuelve aliases, perfil, herramientas, escritura y
   límite de iteraciones.
4. El gateway local entrega únicamente observaciones saneadas.
5. El agente devuelve una conclusión con evidencia y límites.
6. El Director consolida sin transformar propuestas en hechos.

## Agentes canónicos

| Agente | Función objetivo | Escritura local | Aliases históricos |
| --- | --- | --- | --- |
| `product_experience` | UI/UX nueva, móvil, accesibilidad, SEO y rendimiento visual | Con aprobación | designer, mobile_developer, seo_optimizer, document_expert |
| `platform_engineering` | Auth, Firestore, APIs, datos, refactor y configuración | Con aprobación | integrator, data_engineer, refactor_expert, devops_admin |
| `commerce_reliability` | Pagos, webhooks, licencias, entregas e idempotencia | Denegada | automation_expert, stripe_ops |
| `quality_security` | QA, seguridad, regresiones y puertas de release | Denegada | qa_tester, security_ops |
| `rights_and_deals` | Contratos, derechos, Content ID y negociación | Denegada | legal_advisor, rights_manager, licensing_negotiator |
| `tax_invoicing` | SRI, XML, XAdES-BES y RIDE | Denegada | sri_tax_advisor |
| `growth_catalog` | Catálogo, BeatStars, marca, copy, métricas y conversión | Con aprobación | growth_hacker, branding_specialist, marketing_copywriter, beatstars_sync_expert, business_analyst |
| `knowledge_steward` | Fuente de verdad, manifiestos saneados de Obsidian, handoffs y contexto eficiente | Denegada | token_optimizer |
| `audio_delivery` | Web Audio, stems, media, reproducción y descargas | Con aprobación | audio_dsp_expert |
| `customer_operations` | Soporte, FAQs, recibos, historial y plantillas | Con aprobación; nunca envíos | support_helper |

## Skills propias

- `beatss-evidence-gates`: separa código, ejecución local, estado externo y E2E.
- `beatss-interface-lab`: exige estructura visual nueva, móvil y accesibilidad.
- `beatss-sensitive-actions`: filtra pagos, despliegues, datos, emails y secretos.
- `beatss-knowledge-hygiene`: limita Obsidian a manifiestos saneados de solo lectura.

Estas skills reemplazan como guía activa los prompts visuales y roles genéricos
anteriores. Los archivos históricos bajo `.agents/agents/` se conservan sin
conectarlos al motor.

## Verificación

Ejecutar:

```bash
PYTHONPYCACHEPREFIX=/private/tmp/beatss-pycache python3 -m unittest -v tests.test_agent_registry_v2 tests.test_memory_and_agent_security
PYTHONPYCACHEPREFIX=/private/tmp/beatss-pycache python3 scripts/audit-agent-system.py
npm run security:check
npm run build
```

Un pase estructural demuestra contratos, aliases, perfiles y bloqueos; no
garantiza que toda respuesta probabilística sea perfecta. Para cambios de alto
riesgo se exige además una prueba del flujo real en el entorno autorizado.
