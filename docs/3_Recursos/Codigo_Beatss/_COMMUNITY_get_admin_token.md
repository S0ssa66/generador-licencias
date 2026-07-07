---
type: community
members: 25
---

# get_admin_token

**Members:** 25 nodes

## Members
- [[.do_GET()]] - code - handlers_get.py
- [[Analytics de ventas — módulo extraído de server.py]] - rationale - analytics.py
- [[Carga y expone la configuración pública del administrador (sossa) para      el p]] - rationale - admin_config.py
- [[Configuración de admin y hashes de licencias — módulo extraído de server.py]] - rationale - admin_config.py
- [[Convierte un enlace de compartir de Google Drive a un enlace directo de descarga]] - rationale - audio_utils.py
- [[Guarda el hash criptográfico en la licencia correspondiente en Firestore.]] - rationale - admin_config.py
- [[HandlerGetMixin]] - code - handlers_get.py
- [[Mixin do_GET — módulo extraído de server.py]] - rationale - handlers_get.py
- [[Obtiene la configuración del productor, verifica si tiene marca de agua,     des]] - rationale - audio_utils.py
- [[Obtiene un documento específico en Firestore usando REST API.]] - rationale - firestore_ops.py
- [[Obtiene un token de acceso OAuth2 del sistema (gcloud o ADC) con privilegios de]] - rationale - server_utils.py
- [[Procesamiento de audio con marca de agua — módulo extraído de server.py]] - rationale - audio_utils.py
- [[admin_config.py]] - code - admin_config.py
- [[analytics.py]] - code - analytics.py
- [[audio_utils.py]] - code - audio_utils.py
- [[check_is_public_preview()]] - code - handlers_get.py
- [[fetch_firestore_document()]] - code - firestore_ops.py
- [[get_admin_config()]] - code - admin_config.py
- [[get_admin_token()]] - code - server_utils.py
- [[get_gdrive_direct_link()]] - code - audio_utils.py
- [[get_sales_analytics()]] - code - analytics.py
- [[handlers_get.py]] - code - handlers_get.py
- [[process_watermark_audio()]] - code - audio_utils.py
- [[save_license_hash_in_firestore()]] - code - admin_config.py
- [[server_utils.py]] - code - server_utils.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/get_admin_token
SORT file.name ASC
```

## Connections to other communities
- 23 edges to [[_COMMUNITY_handlers_post.py]]
- 2 edges to [[_COMMUNITY_firestore_ops.py]]
- 2 edges to [[_COMMUNITY_server.py]]
- 2 edges to [[_COMMUNITY_sri_contingency.py]]
- 1 edge to [[_COMMUNITY_NumberedCanvasSRI]]
- 1 edge to [[_COMMUNITY_CustomHandler]]

## Top bridge nodes
- [[get_admin_token()]] - degree 20, connects to 2 communities
- [[handlers_get.py]] - degree 15, connects to 2 communities
- [[fetch_firestore_document()]] - degree 8, connects to 2 communities
- [[HandlerGetMixin]] - degree 4, connects to 2 communities
- [[admin_config.py]] - degree 9, connects to 1 community