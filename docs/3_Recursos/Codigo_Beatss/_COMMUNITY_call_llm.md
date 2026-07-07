---
type: community
members: 26
---

# call_llm

**Members:** 26 nodes

## Members
- [[.__init__()_2]] - code - llm_utils.py
- [[.__init__()_3]] - code - llm_utils.py
- [[.__init__()_4]] - code - llm_utils.py
- [[.__init__()_5]] - code - llm_utils.py
- [[.__new__()]] - code - llm_utils.py
- [[._check_lm_studio_connectivity()]] - code - llm_utils.py
- [[._check_ollama_connectivity()]] - code - llm_utils.py
- [[._detect_model()]] - code - llm_utils.py
- [[._initialize_provider()]] - code - llm_utils.py
- [[.generate_content()]] - code - llm_utils.py
- [[.generate_content()_1]] - code - llm_utils.py
- [[.generate_content()_2]] - code - llm_utils.py
- [[.generate_content()_3]] - code - llm_utils.py
- [[.get_provider()]] - code - llm_utils.py
- [[ABC]] - code
- [[Detecta el modelo a usar en Ollama, priorizando OLLAMA_MODEL y luego deepseek-co]] - rationale - llm_utils.py
- [[Función principal para interactuar con el LLM seleccionado.     Delega la llamad]] - rationale - llm_utils.py
- [[GeminiProvider]] - code - llm_utils.py
- [[Genera contenido usando el LLM.]] - rationale - llm_utils.py
- [[Gestiona la selección e instanciación del proveedor de LLM.]] - rationale - llm_utils.py
- [[Interfaz abstracta para proveedores de LLM.]] - rationale - llm_utils.py
- [[LLMManager]] - code - llm_utils.py
- [[LLMProvider]] - code - llm_utils.py
- [[LMStudioProvider]] - code - llm_utils.py
- [[OllamaProvider]] - code - llm_utils.py
- [[call_llm()]] - code - llm_utils.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/call_llm
SORT file.name ASC
```

## Connections to other communities
- 9 edges to [[_COMMUNITY_agent_manager.py]]
- 8 edges to [[_COMMUNITY_handlers_post.py]]
- 3 edges to [[_COMMUNITY_server.py]]

## Top bridge nodes
- [[OllamaProvider]] - degree 10, connects to 3 communities
- [[GeminiProvider]] - degree 9, connects to 3 communities
- [[LMStudioProvider]] - degree 8, connects to 3 communities
- [[call_llm()]] - degree 10, connects to 2 communities
- [[LLMProvider]] - degree 9, connects to 1 community