#!/bin/zsh

set -u

PROJECT_ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd)"
REPORTS_ROOT="$PROJECT_ROOT/.knowledge_steward_reports"
LOCK_DIR="$REPORTS_ROOT/monitor.lock"
NODE_BIN="${NODE_BIN:-/opt/homebrew/bin/node}"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

mkdir -p "$REPORTS_ROOT"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  PID_FILE="$LOCK_DIR/pid"
  if [[ -r "$PID_FILE" ]]; then
    RUNNING_PID="$(<"$PID_FILE")"
    if [[ "$RUNNING_PID" == <-> ]] && kill -0 "$RUNNING_PID" 2>/dev/null; then
      exit 0
    fi
    rm -f "$PID_FILE"
  fi
  if ! rmdir "$LOCK_DIR" 2>/dev/null || ! mkdir "$LOCK_DIR" 2>/dev/null; then
    exit 0
  fi
fi
print -r -- "$$" > "$LOCK_DIR/pid"

cleanup() {
  rm -f "$LOCK_DIR/pid"
  rmdir "$LOCK_DIR" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT"
"$NODE_BIN" scripts/knowledge-steward-monitor.mjs
