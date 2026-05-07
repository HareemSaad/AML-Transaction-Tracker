#!/usr/bin/env bash
SCRIPT_NAME="down"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

if [[ -f "$REPO_ROOT/.backend.pid" ]] && kill -0 "$(cat "$REPO_ROOT/.backend.pid")" 2>/dev/null; then
  log "stopping backend pid=$(cat "$REPO_ROOT/.backend.pid")"
  kill "$(cat "$REPO_ROOT/.backend.pid")" || true
  rm -f "$REPO_ROOT/.backend.pid"
fi

log "stopping graph stack"
( cd "$REPO_ROOT/infra" && docker compose down ) || true

if [[ -f "$REPO_ROOT/.anvil.pid" ]] && kill -0 "$(cat "$REPO_ROOT/.anvil.pid")" 2>/dev/null; then
  log "stopping anvil pid=$(cat "$REPO_ROOT/.anvil.pid")"
  kill "$(cat "$REPO_ROOT/.anvil.pid")" || true
  rm -f "$REPO_ROOT/.anvil.pid"
fi

log "stack down"
