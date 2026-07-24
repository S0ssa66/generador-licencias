# Graphify: grafo de conocimiento de BEATSS

La exportación canónica de Graphify está en `graphify-out/` y no se versiona,
porque se puede regenerar desde el código y documentación fuente.

La copia navegable de Obsidian se mantiene en
`docs/3_Recursos/Codigo_Beatss/`. No se debe exportar directamente a
`docs/Codigo_Beatss/`: era una salida antigua que producía miles de duplicados.

## Uso seguro

1. Actualiza el grafo manualmente cuando necesites documentación arquitectónica.
2. Ejecuta `./sync_graphify_to_beatss_obsidian.sh` solo si quieres sincronizar
   la exportación canónica a la copia navegable.
3. Mantén `graphify-out/`, `docs/Codigo_Beatss/`, dependencias y carpetas de
   compilación fuera del corpus para evitar un grafo recursivo y demasiado grande.
