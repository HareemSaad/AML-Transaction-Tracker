#!/usr/bin/env bash
SCRIPT_NAME="graph-stack"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd docker
require_cmd curl

COMPOSE_FILE="$REPO_ROOT/infra/docker-compose.yml"

log "starting postgres + ipfs + graph-node"
( cd "$REPO_ROOT/infra" && docker compose -f "$COMPOSE_FILE" up -d postgres ipfs graph-node )

# graph-node JSON-RPC admin lives on :8020 — the index node `subgraphs` endpoint
# returns a 200 with body once it's ready to accept `graph create`.
wait_for_http "http://127.0.0.1:${GRAPH_NODE_INDEX_PORT:-8030}/graphql" "graph-node index node" 90

log "graph stack ready: query :${GRAPH_NODE_HTTP_PORT:-8000}, admin :${GRAPH_NODE_ADMIN_PORT:-8020}, index :${GRAPH_NODE_INDEX_PORT:-8030}"
