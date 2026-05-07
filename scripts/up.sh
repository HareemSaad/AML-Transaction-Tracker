#!/usr/bin/env bash
# Bring up the full local AML stack: anvil → graph-node → subgraph → backend.
# Smart contracts are deployed by scripts/deploy-contracts.sh (added in a later phase);
# until they exist, the subgraph deploy step is skipped automatically.
SCRIPT_NAME="up"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

log "==> 1/5 anvil mainnet fork"
BACKGROUND=1 bash "$HERE/start-anvil.sh"

log "==> 2/5 deploy contracts"
if [[ -x "$HERE/deploy-contracts.sh" ]]; then
  bash "$HERE/deploy-contracts.sh"
else
  warn "scripts/deploy-contracts.sh not present yet — contracts phase will be added later"
fi

log "==> 3/5 graph stack (postgres + ipfs + graph-node)"
bash "$HERE/start-graph-stack.sh"

log "==> 4/5 deploy subgraph"
bash "$HERE/deploy-subgraph.sh"

log "==> 5/5 backend"
BACKGROUND=1 bash "$HERE/start-backend.sh"

log "stack up:"
log "  anvil    http://localhost:${ANVIL_PORT:-8545}"
log "  graph    http://localhost:${GRAPH_NODE_HTTP_PORT:-8000}/subgraphs/name/${SUBGRAPH_NAME:-bank/aml}"
log "  backend  http://localhost:${BACKEND_PORT:-3000}/health"
log "tail -f $REPO_ROOT/.anvil.log $REPO_ROOT/.backend.log"
