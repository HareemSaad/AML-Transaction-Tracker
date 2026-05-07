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

# nest start --watch spawns a child node process for dist/main that holds the
# listen socket. Killing the wrapper pid does not always reach that child, so
# sweep anything still listening on the backend port.
backend_port_pids=$(lsof -nP -iTCP:"${BACKEND_PORT:-3000}" -sTCP:LISTEN -t 2>/dev/null || true)
if [[ -n "$backend_port_pids" ]]; then
  log "killing orphan backend listeners on :${BACKEND_PORT:-3000} ($backend_port_pids)"
  kill $backend_port_pids 2>/dev/null || true
fi

log "stopping graph stack"
( cd "$REPO_ROOT/infra" && docker compose down ) || true

if [[ -f "$REPO_ROOT/.anvil.pid" ]] && kill -0 "$(cat "$REPO_ROOT/.anvil.pid")" 2>/dev/null; then
  log "stopping anvil pid=$(cat "$REPO_ROOT/.anvil.pid")"
  kill "$(cat "$REPO_ROOT/.anvil.pid")" || true
  rm -f "$REPO_ROOT/.anvil.pid"
fi

log "wiping postgres data (graph_node + aml_backend)"
rm -rf "$REPO_ROOT/infra/data/postgres"

log "wiping ipfs data (pinned subgraph wasm)"
rm -rf "$REPO_ROOT/infra/data/ipfs"

log "removing stale deployment addresses"
rm -f "$REPO_ROOT/contracts/deployments/local.json"

log "stack down — all data sources cleared"
