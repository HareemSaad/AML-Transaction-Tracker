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

# Kill the nest --watch watcher and all child node processes from this repo.
pkill -f "nest start" 2>/dev/null || true
pgrep -f "regulated/backend" | xargs kill -9 2>/dev/null || true

# Sweep anything still listening on the backend port.
backend_port_pids=$(lsof -nP -iTCP:"${BACKEND_PORT:-3000}" -sTCP:LISTEN -t 2>/dev/null || true)
if [[ -n "$backend_port_pids" ]]; then
  log "killing orphan backend listeners on :${BACKEND_PORT:-3000} ($backend_port_pids)"
  kill -9 $backend_port_pids 2>/dev/null || true
fi

sleep 1

log "stopping graph stack"
( cd "$REPO_ROOT/infra" && docker compose down ) || true

if [[ -f "$REPO_ROOT/.anvil.pid" ]] && kill -0 "$(cat "$REPO_ROOT/.anvil.pid")" 2>/dev/null; then
  log "stopping anvil pid=$(cat "$REPO_ROOT/.anvil.pid")"
  kill "$(cat "$REPO_ROOT/.anvil.pid")" || true
  rm -f "$REPO_ROOT/.anvil.pid"
fi

# By default, preserve postgres and ipfs so graph-node resumes from its last
# indexed block on the next up.sh — avoids a 30-min resync of empty fork blocks.
# Pass FULL_TEARDOWN=1 to wipe everything for a genuine clean-slate reset.
if [[ "${FULL_TEARDOWN:-0}" == "1" ]]; then
  log "FULL_TEARDOWN=1 — wiping postgres (graph_node + aml_backend) and ipfs"
  rm -rf "$REPO_ROOT/infra/data/postgres"
  rm -rf "$REPO_ROOT/infra/data/ipfs"
  log "stack down — all data sources cleared"
else
  log "stack down — chain state and graph-node index preserved (run with FULL_TEARDOWN=1 to wipe)"
fi
