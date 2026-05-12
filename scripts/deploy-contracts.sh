#!/usr/bin/env bash
SCRIPT_NAME="deploy-contracts"
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
source "$HERE/_lib.sh"
load_env

require_cmd forge
require_cmd jq

: "${RPC_URL:=http://localhost:${ANVIL_PORT:-8545}}"
: "${DEPLOYER_PK:?set DEPLOYER_PK in .env}"

cd "$REPO_ROOT/contracts"

# Idempotency: if REGISTRY_ADDRESS is set in .env AND has bytecode at $RPC_URL,
# skip redeploy. Override with FORCE_DEPLOY=1.
if [[ "${FORCE_DEPLOY:-0}" != "1" && -n "${REGISTRY_ADDRESS:-}" ]]; then
  CODE=$(cast code "$REGISTRY_ADDRESS" --rpc-url "$RPC_URL" 2>/dev/null || echo "0x")
  if [[ "$CODE" != "0x" && -n "$CODE" ]]; then
    log "REGISTRY_ADDRESS=$REGISTRY_ADDRESS already has bytecode — skipping deploy (set FORCE_DEPLOY=1 to override)"
    # Regenerate local.json from .env so deploy-subgraph and aml-demo always
    # find the file even after down.sh has wiped graph/postgres state.
    DEPLOY_FILE="$REPO_ROOT/contracts/deployments/local.json"
    if [[ ! -f "$DEPLOY_FILE" ]]; then
      log "regenerating $DEPLOY_FILE from .env addresses"
      mkdir -p "$(dirname "$DEPLOY_FILE")"
      printf '{\n  "network": "local",\n  "chainId": 31337,\n  "deployBlock": %s,\n  "registry": "%s",\n  "stablecoin": "%s",\n  "onramp": "%s"\n}\n' \
        "${DEPLOY_BLOCK:-0}" \
        "${REGISTRY_ADDRESS}" \
        "${STABLECOIN_ADDRESS:-}" \
        "${ONRAMP_ADDRESS:-}" > "$DEPLOY_FILE"
    fi
    # Re-emit CtrThresholdChanged so a fresh subgraph indexer always catches it.
    # graph-node silently skips historical constructor-era events on new postgres state;
    # broadcasting a live tx guarantees the RegistryConfig entity is populated.
    CTR=$(cast call "$REGISTRY_ADDRESS" "ctrThreshold()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null | awk '{print $1}' || true)
    if [[ -n "$CTR" && "$CTR" != "0" ]]; then
      log "re-emitting CtrThresholdChanged (ctrThreshold=$CTR) for subgraph indexer"
      cast send "$REGISTRY_ADDRESS" "setCtrThreshold(uint256)" "$CTR" \
        --private-key "$DEPLOYER_PK" --rpc-url "$RPC_URL" >/dev/null
    fi
    exit 0
  fi
fi

log "forge build"
forge build --silent

log "forge script Deploy.s.sol → $RPC_URL"
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_PK" \
  --broadcast \
  --skip-simulation \
  -vv

DEPLOY_FILE="$REPO_ROOT/contracts/deployments/local.json"
if [[ ! -f "$DEPLOY_FILE" ]]; then die "expected $DEPLOY_FILE to exist after forge script"; fi

log "deployment summary:"
jq . "$DEPLOY_FILE"

# Copy ABIs the subgraph indexer needs.
ABI_DIR="$REPO_ROOT/subgraph/abis"
mkdir -p "$ABI_DIR"
for c in BankStablecoin ComplianceRegistry; do
  jq '.abi' "$REPO_ROOT/contracts/out/${c}.sol/${c}.json" > "$ABI_DIR/${c}.json"
done
# Stale ABIs from prior phases of this project.
rm -f "$ABI_DIR/CustodialWallet.json" "$ABI_DIR/CustodialWalletFactory.json"
log "wrote ABIs to $ABI_DIR"

# Patch root .env so the subgraph render and backend pick up addresses without manual edits.
ENV_FILE="$REPO_ROOT/.env"
patch_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # macOS sed in-place: -i ''
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
    rm -f "$ENV_FILE.bak"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}
patch_env REGISTRY_ADDRESS   "$(jq -r .registry    "$DEPLOY_FILE")"
patch_env STABLECOIN_ADDRESS "$(jq -r .stablecoin  "$DEPLOY_FILE")"
patch_env ONRAMP_ADDRESS     "$(jq -r .onramp      "$DEPLOY_FILE")"
patch_env DEPLOY_BLOCK       "$(jq -r .deployBlock "$DEPLOY_FILE")"
patch_env FACTORY_ADDRESS    ""
log "updated $ENV_FILE with deployed addresses + DEPLOY_BLOCK"
