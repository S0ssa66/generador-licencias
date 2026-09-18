# Resumen operativo de Graphify — BEATSS

## Cómo usar este resumen

Este archivo es la entrada rápida para tareas de arquitectura. Usa búsquedas
dirigidas en el código o en Graphify para detalles; no cargues `graph.json` ni
`GRAPH_REPORT.md` completos salvo una auditoría específica.

## Estado del grafo

- La última exportación preservada está en `graphify-out/`.
- Su reporte corresponde al commit histórico `92fc36d2`; debe tratarse como
  orientación, no como una representación garantizada del código actual.
- Graphify se ejecuta manualmente. Los hooks de Git no lo reconstruyen.
- La bóveda operativa de Obsidian está en
  `/Users/sossa/Documents/Codex/BeatSS-Obsidian`.
- Las copias derivadas de Graphify deben vivir en `graphify-out/obsidian-copy/`
  o en `99_Derivado/Graphify/` dentro de la bóveda.

## Arquitectura útil

| Área | Archivos de referencia | Responsabilidad |
| --- | --- | --- |
| Interfaz y flujo de licencia | `index.html`, `main.js`, `editor.js` | Formulario, contrato, historial y entrega. |
| PDF y contrato | `pdf_generator.py`, `server.py`, `handlers_post.py` | Generación, datos contractuales y endpoints locales. |
| Entrega por correo | `main.js`, `server.py`, Firebase Storage, EmailJS | Generar PDF, almacenar URL segura y notificar al comprador. |
| Usuarios y planes | `auth.js`, `producerDefaults.js`, `firestore.rules` | Registro, proveedor de acceso, planes y permisos. |
| Pagos | `checkout.js`, `api/`, `paymentPasarelas.js` | PayPal, PayPhone, Deuna y confirmaciones. |
| Catálogo y archivos | `catalog.js`, `storageBackup.js`, `api/proxy-audio.js` | Beats, audio, enlaces y respaldos. |

## Flujos críticos que requieren cambios acotados

1. Una compra debe conservar un `contractSnapshot`, fecha efectiva y referencia
   antes de regenerar o reenviar un PDF.
2. La entrega requiere: PDF correcto → almacenamiento disponible → enlace seguro
   → correo. No marcarla como completada si falla una etapa.
3. El acceso de productores debe registrar proveedor (`google` o contraseña),
   perfil y plan sin exponer configuración privada.
4. Los cambios de pagos, Firebase, SRI o producción se revisan por módulo y
   requieren autorización explícita antes de desplegar.

## Exclusiones obligatorias de Graphify

No indexar `.git/`, `node_modules/`, `dist/`, `.vercel/`, `.venv/`, cachés,
backups, `graphify-out/`, `docs/Codigo_Beatss/` ni
`docs/3_Recursos/Codigo_Beatss/`. Esas rutas son dependencias, resultados
regenerables o exportaciones de Graphify y crean ruido o ciclos.

## Rutina recomendada

1. Consultar este resumen.
2. Investigar el módulo concreto con `rg` o una consulta Graphify puntual.
3. Implementar y verificar el cambio.
4. Regenerar Graphify solo si hubo una modificación arquitectónica importante.
5. Si se necesita una copia derivada para Obsidian, sincronizar con
   `./sync_graphify_to_beatss_obsidian.sh` usando un destino explícito y permitido.
