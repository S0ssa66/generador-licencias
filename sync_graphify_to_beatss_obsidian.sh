#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE="${PROJECT_ROOT}/graphify-out/obsidian"
DEST="${BEATSS_GRAPHIFY_DEST:-${PROJECT_ROOT}/docs/3_Recursos/Codigo_Beatss}"

if [[ ! -d "$SOURCE" ]]; then
  echo "No existe la salida de Graphify: $SOURCE" >&2
  exit 1
fi

mkdir -p "$DEST"

# This is deliberately manual. Automatic exports on every commit created
# recursive, duplicate notes and slowed down normal BEATSS releases.
rsync -a --update \
  --exclude ".obsidian/" \
  "$SOURCE/" "$DEST/"

echo "Graphify sincronizado con BeatSS:"
echo "  Origen:  $SOURCE"
echo "  Destino: $DEST"
