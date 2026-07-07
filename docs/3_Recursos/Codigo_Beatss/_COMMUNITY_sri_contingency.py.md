---
type: community
members: 18
---

# sri_contingency.py

**Members:** 18 nodes

## Members
- [[Elimina una factura de la cola (se llama tras una autorización exitosa).]] - rationale - sri_contingency.py
- [[Guarda una factura fallida en la cola de contingencia.]] - rationale - sri_contingency.py
- [[Incrementa los intentos de envío y registra el último error.]] - rationale - sri_contingency.py
- [[Inicia un hilo en segundo plano que procesa la cola de contingencia periódicamen]] - rationale - sri_contingency.py
- [[Inicializa la base de datos SQLite para la cola de contingencia del SRI.]] - rationale - sri_contingency.py
- [[Procesa todos los comprobantes en la cola local de contingencia.     Intenta aut]] - rationale - sri_contingency.py
- [[Retorna todos los comprobantes pendientes de procesar.]] - rationale - sri_contingency.py
- [[get_pending()]] - code - sri_contingency.py
- [[init_db()]] - code - sri_contingency.py
- [[mark_attempt()]] - code - sri_contingency.py
- [[process_queue()]] - code - sri_contingency.py
- [[remove_from_queue()]] - code - sri_contingency.py
- [[save_to_queue()]] - code - sri_contingency.py
- [[sri_contingency.py]] - code - sri_contingency.py
- [[start_contingency_worker()]] - code - sri_contingency.py
- [[test_contingency.py]] - code - scratch/test_contingency.py
- [[test_sqlite_flow()]] - code - scratch/test_contingency.py
- [[test_thread_safety()]] - code - scratch/test_contingency.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/sri_contingencypy
SORT file.name ASC
```

## Connections to other communities
- 2 edges to [[_COMMUNITY_get_admin_token]]
- 1 edge to [[_COMMUNITY_server.py]]

## Top bridge nodes
- [[sri_contingency.py]] - degree 10, connects to 2 communities
- [[process_queue()]] - degree 7, connects to 1 community