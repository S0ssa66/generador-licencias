---
source_file: "payment_verifier.py"
type: "code"
community: "handlers_post.py"
location: "L57"
tags:
  - graphify/code
  - graphify/EXTRACTED
  - community/handlers_postpy
---

# confirm_payment_in_firestore()

## Connections
- [[.do_POST()]] - `calls` [EXTRACTED]
- [[Actualiza una compra en Firestore al estado 'completed' usando el token de admin]] - `rationale_for` [EXTRACTED]
- [[emitir_factura_sri_background()]] - `indirect_call` [INFERRED]
- [[get_admin_token()]] - `calls` [EXTRACTED]
- [[handlers_post.py]] - `imports` [EXTRACTED]
- [[payment_verifier.py]] - `contains` [EXTRACTED]
- [[register_youtube_whitelist_in_firestore()]] - `calls` [EXTRACTED]

#graphify/code #graphify/EXTRACTED #community/handlers_postpy