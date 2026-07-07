---
source_file: "sri_service.py"
type: "code"
community: "handlers_post.py"
location: "L284"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/handlers_postpy
---

# emitir_factura_sri_background()

## Connections
- [[.do_POST()]] - `indirect_call` [INFERRED]
- [[Función que corre en un hilo secundario para procesar la facturación electrónica]] - `rationale_for` [EXTRACTED]
- [[actualizar_estado_factura_db()]] - `calls` [EXTRACTED]
- [[actualizar_secuencial_sri()]] - `calls` [EXTRACTED]
- [[confirm_payment_in_firestore()]] - `indirect_call` [INFERRED]
- [[get_admin_token()]] - `calls` [EXTRACTED]
- [[handlers_post.py]] - `imports` [EXTRACTED]
- [[payment_verifier.py]] - `imports` [EXTRACTED]
- [[resolve_backup_file()]] - `calls` [EXTRACTED]
- [[sri_service.py]] - `contains` [EXTRACTED]
- [[validar_cedula_ruc_ecuador()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/handlers_postpy