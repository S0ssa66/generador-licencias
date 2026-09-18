# Graphify: grafo de conocimiento de BEATSS

La exportación canónica de Graphify está en `graphify-out/` y no se versiona,
porque se puede regenerar desde el código y documentación fuente.

La documentación operativa de Obsidian se mantiene en la bóveda
`/Users/sossa/Documents/Codex/BeatSS-Obsidian`. La salida navegable de Graphify
es derivada y debe quedar en `graphify-out/obsidian-copy/` o en una ruta
explícita dentro de `99_Derivado/Graphify/`.

No se debe exportar a `docs/Codigo_Beatss/` ni a
`docs/3_Recursos/Codigo_Beatss/`: esas rutas históricas ya contienen miles de
duplicados y no son fuente de verdad.

## Uso seguro

1. Actualiza el grafo manualmente cuando necesites documentación arquitectónica.
2. Ejecuta `./sync_graphify_to_beatss_obsidian.sh` solo para generar una copia
   derivada en una ruta permitida.
3. Mantén `graphify-out/`, las carpetas `Codigo_Beatss`, dependencias y
   compilación fuera del corpus para evitar un grafo recursivo.
