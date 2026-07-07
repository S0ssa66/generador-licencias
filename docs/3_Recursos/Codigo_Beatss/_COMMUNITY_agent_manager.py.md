---
type: community
members: 58
---

# agent_manager.py

**Members:** 58 nodes

## Members
- [[Busca un patrón de texto en todos los archivos del proyecto de forma rápida y se]] - rationale - agent_manager.py
- [[Carga el historial de conversación guardado.]] - rationale - memory_manager.py
- [[Carga las memorias a largo plazo de todos los subagentes.]] - rationale - memory_manager.py
- [[Convierte el historial de turnos en una cadena de texto plana, optimizando el co]] - rationale - agent_manager.py
- [[Ejecuta el loop ReAct (Reasoning + Acting) para que el subagente use herramienta]] - rationale - agent_manager.py
- [[Ejecuta todo el pipeline de enrutamiento, delegación, ejecución ReAct y síntesis]] - rationale - agent_manager.py
- [[Extrae y parsea un objeto JSON de una respuesta de texto.]] - rationale - llm_utils.py
- [[Función de retrocompatibilidad. Usa `call_llm` para interactuar con el LLM selec]] - rationale - llm_utils.py
- [[GET_COLOR_FOR_ROL()]] - code - agent_manager.py
- [[Guarda el historial de conversación, limitándolo a las últimas 30 interacciones.]] - rationale - memory_manager.py
- [[Guarda o actualiza la memoria de un subagente específico.]] - rationale - memory_manager.py
- [[Obtiene la memoria guardada de un subagente.]] - rationale - memory_manager.py
- [[Resuelve y valida que la ruta se encuentre dentro de la bóveda de Obsidian (Use]] - rationale - agent_manager.py
- [[Retorna una respuesta estática de ayuda basada en coincidencia de palabras clave]] - rationale - llm_utils.py
- [[Si el historial supera los 8 turnos, genera una memoria sintetizada de los turno]] - rationale - memory_manager.py
- [[agent_manager.py]] - code - agent_manager.py
- [[agente_coordinador.py]] - code - agente_coordinador.py
- [[ask_agents.py]] - code - scratch/ask_agents.py
- [[ask_security_layers.py]] - code - scratch/ask_security_layers.py
- [[ask_token_optimizer.py]] - code - scratch/ask_token_optimizer.py
- [[call_gemini()]] - code - llm_utils.py
- [[check_subagent_role_exists()]] - code - prompt_manager.py
- [[clean_and_parse_json()]] - code - llm_utils.py
- [[execute_subagent_react_loop()]] - code - agent_manager.py
- [[extract_prompts.py]] - code - scratch/extract_prompts.py
- [[format_conversation_for_llm()]] - code - agent_manager.py
- [[get_main_agent_prompt()]] - code - prompt_manager.py
- [[get_router_prompt()]] - code - prompt_manager.py
- [[get_safe_path()]] - code - agent_manager.py
- [[get_static_keyword_response()]] - code - llm_utils.py
- [[get_subagent_base_prompt()]] - code - prompt_manager.py
- [[get_subagent_memory()]] - code - memory_manager.py
- [[get_subagent_prompt()]] - code - prompt_manager.py
- [[get_synthesis_prompt()]] - code - prompt_manager.py
- [[llm_utils.py]] - code - llm_utils.py
- [[load_session_memory()]] - code - memory_manager.py
- [[load_subagent_memories()]] - code - memory_manager.py
- [[main()]] - code - agente_coordinador.py
- [[main()_2]] - code - scratch/ask_agents.py
- [[main()_3]] - code - scratch/extract_prompts.py
- [[memory_manager.py]] - code - memory_manager.py
- [[mock_ollama_generate()]] - code - scratch/test_keyword_fallback.py
- [[progress_callback()]] - code - scratch/ask_security_layers.py
- [[prompt_manager.py]] - code - prompt_manager.py
- [[run()_1]] - code - scratch/ask_token_optimizer.py
- [[run_agent_pipeline()]] - code - agent_manager.py
- [[run_tool_list_dir()]] - code - agent_manager.py
- [[run_tool_read_file()]] - code - agent_manager.py
- [[run_tool_read_file_lines()]] - code - agent_manager.py
- [[run_tool_search_grep()]] - code - agent_manager.py
- [[run_tool_write_file()]] - code - agent_manager.py
- [[save_session_memory()]] - code - memory_manager.py
- [[save_subagent_memory()]] - code - memory_manager.py
- [[summarize_history_if_needed()]] - code - memory_manager.py
- [[test_fallback()]] - code - scratch/test_fallback.py
- [[test_fallback.py]] - code - scratch/test_fallback.py
- [[test_keyword_fallback()]] - code - scratch/test_keyword_fallback.py
- [[test_keyword_fallback.py]] - code - scratch/test_keyword_fallback.py

## Live Query (requires Dataview plugin)

```dataview
TABLE source_file, type FROM #community/agent_managerpy
SORT file.name ASC
```

## Connections to other communities
- 9 edges to [[_COMMUNITY_call_llm]]
- 3 edges to [[_COMMUNITY_handlers_post.py]]

## Top bridge nodes
- [[llm_utils.py]] - degree 16, connects to 2 communities
- [[call_gemini()]] - degree 10, connects to 2 communities
- [[agente_coordinador.py]] - degree 9, connects to 1 community
- [[get_static_keyword_response()]] - degree 3, connects to 1 community