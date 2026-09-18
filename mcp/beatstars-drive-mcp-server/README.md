# MCP de migración BeatStars → Drive → catálogo BEATSS

Este MCP local incorpora una exportación **propia** de BeatStars al Drive central
de BEATSS y crea los beats correspondientes dentro del catálogo privado del
productor.

No inicia sesión en BeatStars, no automatiza su navegador ni modifica, mueve o
elimina archivos de BeatStars. La fuente debe ser una carpeta descargada por el
productor.

## Qué migra

- Metadatos de beats desde CSV o JSON: `name`/`title`, `bpm`, `key`, `genre`,
  `tags` y `description`.
- MP3, WAV, archivos comprimidos de stems (`.zip`, `.rar`, `.tar`, `.gz`) y
  portada (`.jpg`, `.jpeg`, `.png`, `.webp`).
- MP3 y portada quedan disponibles en el catálogo; WAV y stems permanecen en
  el documento privado de archivos del beat.

No importa transacciones, clientes ni contratos anteriores: esos datos pueden
tener información personal y se deben revisar e importar por separado con el
flujo de historial de BEATSS.

## Seguridad del flujo

1. `beatss_inventory_export` sólo lee archivos dentro de
   `BEATSS_EXPORT_ROOT` y calcula SHA-256 para señalar duplicados.
2. `beatss_create_migration_plan` no escribe nada; entrega un plan y un código
   único de confirmación.
3. La ejecución exige ese código y una clave temporal de 20 minutos creada en
   **BEATSS → Configuración → Integraciones → Migrar biblioteca de BeatStars**.
4. La clave no es el Client ID, Client Secret ni token de Google. Nunca se
   guarda en el catálogo y se elimina de la interfaz al cerrar Configuración.
5. El servidor sólo usa el Drive central ya autorizado para
   `sossamusic@gmail.com`; Firebase y Google Cloud no se migran ni se cambian.

## Configuración local

Instala las dependencias una vez:

```bash
cd /Users/sossa/Documents/Codex/BeatSS/mcp/beatstars-drive-mcp-server
npm install
```

Registra el servidor MCP local con una configuración equivalente a esta. Usa
una carpeta dedicada que contenga solamente la exportación de BeatStars:

```json
{
  "mcpServers": {
    "beatss-beatstars-drive": {
      "command": "node",
      "args": [
        "/Users/sossa/Documents/Codex/BeatSS/mcp/beatstars-drive-mcp-server/src/index.js"
      ],
      "env": {
        "BEATSS_EXPORT_ROOT": "/ruta/a/Mi exportación BeatStars"
      }
    }
  }
}
```

No añadas `BEATSS_MIGRATION_KEY` todavía. Sólo pégala localmente justo antes de
la última herramienta, después de revisar el plan. Al vencer, se debe crear una
nueva desde BEATSS.

## Orden de uso

1. Descarga tu audio, stems, portadas y un CSV/JSON desde tu cuenta de
   BeatStars. La carga de tracks de BeatStars usa los formatos de audio,
   portada y stems que refleja su propia guía.
2. Ejecuta `beatss_migration_get_setup`.
3. Ejecuta `beatss_inventory_export` indicando `source_dir` y, si existe,
   `metadata_file`.
4. Revisa los archivos sin asignar y los duplicados, y crea un plan con
   `beatss_create_migration_plan`. Para beats que ya existen, el modo seguro
   predeterminado es `skip`; usa `existing_policy: "update_assets"` únicamente
   si necesitas reemplazar por enlaces de Drive los archivos seleccionados.
5. Prueba primero con una carpeta de 1–3 beats.
6. Genera la clave temporal desde Configuración de BEATSS, colócala sólo en la
   variable local `BEATSS_MIGRATION_KEY` y ejecuta
   `beatss_execute_migration_plan` usando el `plan_id` y el
   `confirmation_code` exactos.

Un beat existente se omite antes de subir archivos salvo que el plan se cree
explícitamente con `existing_policy: "update_assets"`. Ese modo conserva el
título, precios, licencias, metadata y archivos no incluidos: sólo agrega los
enlaces de Drive para los assets que se acaban de subir. Si una subida se
interrumpe después de llegar a Drive pero antes de registrar catálogo, el
resultado lo marcará como error para que se revise; el MCP no borra archivos
como parte de la recuperación.

## Validación local

```bash
npm test
```

La suite cubre normalización de nombres, CSV, límites de rutas, detección de
duplicados y el protocolo MCP sobre stdio. No llama a Drive, Firebase,
BeatStars ni producción.
