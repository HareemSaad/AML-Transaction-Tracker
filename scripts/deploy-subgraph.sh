#!/usr/bin/env bash
SCRIPT_NAME="deploy-subgraph"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd pnpm

DEPLOY_FILE="$REPO_ROOT/contracts/deployments/local.json"
if [[ ! -f "$DEPLOY_FILE" ]]; then
  warn "$DEPLOY_FILE missing — contracts haven't been deployed yet."
  warn "skipping subgraph deploy. Run scripts/deploy-contracts.sh first."
  exit 0
fi

cd "$REPO_ROOT/subgraph"

if [[ ! -d node_modules ]]; then
  log "installing subgraph deps"
  pnpm install --silent
fi

log "rendering subgraph.yaml from local.json"
node scripts/render-manifest.mjs

log "graph codegen + build"
pnpm codegen
pnpm build

log "(re)creating subgraph on local node"
pnpm create-local || warn "create-local returned non-zero (probably already exists, ok)"

log "deploying subgraph"
pnpm deploy-local

log "subgraph deployed: http://localhost:${GRAPH_NODE_HTTP_PORT:-8000}/subgraphs/name/${SUBGRAPH_NAME:-bank/aml}"
