---
type: community
members: 30
---

# handlers_post.py

**Members:** 30 nodes

## Members
- [[.do_POST()]] - code - handlers_post.py
- [[Actualiza el plan del usuario a 'pro' o 'elite' en Firestore y      localmente e]] - rationale - payment_verifier.py
- [[Actualiza el secuencial del SRI para el productor en Firestore y en el respaldo]] - rationale - sri_service.py
- [[Actualiza una compra en Firestore al estado 'completed' usando el token de admin]] - rationale - payment_verifier.py
- [[Función que corre en un hilo secundario para procesar la facturación electrónica]] - rationale - sri_service.py
- [[Guarda el hash criptográfico en la licencia correspondiente en el respaldo físic]] - rationale - admin_config.py
- [[Guarda los metadatos de la factura electrónica en el pago correspondiente en Fir]] - rationale - sri_service.py
- [[Mixin do_POST — módulo extraído de server.py]] - rationale - handlers_post.py
- [[Registra automáticamente el canal de YouTube en la colección de whitelist de Fir]] - rationale - payment_verifier.py
- [[Resuelve el ID de usuario (UID de Firebase o nombre legacy) a la ruta del archiv]] - rationale - server_utils.py
- [[Valida si un número de identificación cumple con el formato y algoritmos del SRI]] - rationale - sri_service.py
- [[Verifica si una IP ha excedido el límite de solicitudes permitido.     Retorna T]] - rationale - handlers_post.py
- [[Verifica un pedido de PayPal conectándose a la API.     Prueba primero el entorn]] - rationale - payment_verifier.py
- [[Verifica una suscripción de PayPal conectándose a la API.     Prueba primero el]] - rationale - payment_verifier.py
- [[actualizar_estado_factura_db()]] - code - sri_service.py
- [[actualizar_secuencial_sri()]] - code - sri_service.py
- [[check_ip_rate_limit()]] - code - handlers_post.py
- [[confirm_payment_in_firestore()]] - code - payment_verifier.py
- [[emitir_factura_sri_background()]] - code - sri_service.py
- [[get_or_create_drive_folder()]] - code - handlers_post.py
- [[handlers_post.py]] - code - handlers_post.py
- [[payment_verifier.py]] - code - payment_verifier.py
- [[register_youtube_whitelist_in_firestore()]] - code - payment_verifier.py
- [[resolve_backup_file()]] - code - server_utils.py
- [[save_license_hash_in_local_backup()]] - code - admin_config.py
- [[sri_service.py]] - code - sri_service.py
- [[update_user_plan_in_firestore()]] - code - payment_verifier.py
- [[validar_cedula_ruc_ecuador()]] - code - sri_service.py
- [[verify_paypal_order()]] - code - payment_verifier.py
- [[verify_paypal_subscription()]] - code - payment_verifier.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/handlers_postpy
SORT file.name ASC
```

## Connections to other communities
- 23 edges to [[_COMMUNITY_get_admin_token]]
- 8 edges to [[_COMMUNITY_server.py]]
- 8 edges to [[_COMMUNITY_call_llm]]
- 7 edges to [[_COMMUNITY_firestore_ops.py]]
- 3 edges to [[_COMMUNITY_agent_manager.py]]
- 3 edges to [[_COMMUNITY_generate_pdf_from_contract]]
- 2 edges to [[_COMMUNITY_send_invoice_email]]
- 2 edges to [[_COMMUNITY_sri_invoicing.py]]
- 2 edges to [[_COMMUNITY_NumberedCanvasSRI]]

## Top bridge nodes
- [[handlers_post.py]] - degree 42, connects to 8 communities
- [[.do_POST()]] - degree 24, connects to 5 communities
- [[sri_service.py]] - degree 12, connects to 4 communities
- [[actualizar_estado_factura_db()]] - degree 7, connects to 2 communities
- [[resolve_backup_file()]] - degree 12, connects to 1 community