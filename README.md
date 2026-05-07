# Regulated — Pakistan AML Transaction Tracker

A bank-operated stablecoin stack that targets the Pakistan AML/CFT regime
(FATF | FMU | PVARA 2022 | PMLA 2010 | ATA 1997 | SBP). Custodial wallets are
EOAs created and signed by the bank's backend; the on-chain registry is the
audit trail; the subgraph computes AML rule flags; the NestJS backend ingests
those flags into a compliance dashboard.

## Architecture

```
                    ┌──────────────────┐    registerCustodial,
   bank operator    │   NestJS backend │ ─── checkOutgoing,        ┌────────────────────┐
        ▲           │                  │     consumePepApproval ─→ │ ComplianceRegistry │
        │ POST /…   │  • generates     │                           │  (on-chain audit)  │
        ▼           │    custodial EOAs│                           └────────────────────┘
   ┌──────────┐     │  • signs ERC20   │ ─── token.transfer ─────→ ┌────────────────────┐
   │ customer │ ──→ │    transfers     │                           │   BankStablecoin   │
   └──────────┘     │  • ingests flags │                           │       (bPKR)       │
                    └────────┬─────────┘                           └─────────┬──────────┘
                             │                                               │ Transfer events
                             │ ComplianceFlag GraphQL poll              ┌────┴───────┐
                             └────────────────────────────────────────→ │  subgraph  │
                                                                        │ rule engine│
                                                                        └────────────┘
```

## Components

- **Anvil** mainnet fork (chainId 31337, persistent state)
- **Foundry** smart contracts: `BankStablecoin`, `ComplianceRegistry`, `OnRampOffRamp`
- **graph-node** stack via Docker (postgres + ipfs + graph-node)
- **Subgraph** that computes all 7 AML rule flags from `Transfer` events + registry state
- **NestJS backend** (Prisma + ethers) that:
  - generates a fresh custodial EOA per customer, encrypts its key, registers it on-chain
  - signs token transfers from the EOA after a `checkOutgoing` advisory pre-check
  - polls `ComplianceFlag` entities from the subgraph every 5s and persists them as `Alert` rows

## AML rules in scope

| Rule | Description | Pts | Detected by |
|---|---|---|---|
| 1  | Amount ≥ PKR 2.5M (CTR) | 20 | Subgraph (`amount ≥ ctrThreshold`) |
| 2  | Structuring / smurfing in 24h | 15 | Subgraph (`StructuringWindow` entity) |
| 5  | Velocity spike vs 7-day baseline | 8 | Subgraph (`WalletDailyStats`) |
| 7  | First-time non-custodial recipient (after 30d maturity) | 10 | Subgraph (`KnownCounterparty`) |
| 8  | Layering — ≥3 custodial receivers from same source in 2 blocks | 8 | Subgraph (`SourceFanOut`) |
| 9  | PEP outgoing | 25 | Subgraph (uses on-chain `isPEP`) |
| 12 | Sender within 90-day new-account window | 10 | Subgraph (uses on-chain `openedAt`) |

The on-chain `ComplianceRegistry.checkOutgoing` view function is an **advisory
pre-check** the backend runs before signing — it returns a `(ok, reason,
isLarge, isPep, isNewAccount)` tuple. Hard enforcement is the backend refusing
to sign; the subgraph emits the flags regardless.

## Prerequisites

```
brew install foundry node pnpm docker jq poppler
docker --version          # Docker Desktop or Colima running
foundryup
```

## Configure

```
cp .env.example .env
# edit .env: MAINNET_RPC_URL=<your Alchemy/Infura/QuickNode URL>
# optional: WALLET_KEY_ENCRYPTION_KEY=<long random string>
```

## Bring up the stack

```
pnpm install              # at repo root, installs subgraph + backend workspaces
./scripts/up.sh
```

`up.sh` runs:
1. `start-anvil.sh` → forks mainnet at `:8545` (persistent `.anvil-state.json`)
2. `deploy-contracts.sh` → forge deploy + write `contracts/deployments/local.json`, copy ABIs, patch root `.env` (idempotent — skips if `REGISTRY_ADDRESS` already has bytecode; `FORCE_DEPLOY=1` to override)
3. `start-graph-stack.sh` → docker compose up postgres + ipfs + graph-node
4. `deploy-subgraph.sh` → render manifest + codegen + deploy
5. `start-backend.sh` → prisma migrate + NestJS dev server on `:3000`

## Endpoints

- Anvil RPC:        `http://localhost:8545`
- graph-node query: `http://localhost:8000/subgraphs/name/bank/aml`
- graph-node admin: `http://localhost:8020`
- graph-node index: `http://localhost:8030/graphql`
- Backend health:   `http://localhost:3000/health`

### Backend API

| Method & path                 | Effect |
|---|---|
| `POST /wallets`               | Generate custodial EOA, register on-chain, store encrypted key |
| `GET /wallets`                | List custodial wallets (no key material) |
| `GET /wallets/:id`            | One wallet |
| `POST /wallets/:id/transfer`  | `checkOutgoing` → consume PEP approval if needed → sign ERC20 transfer |
| `GET /wallets/:id/risk-score` | Sum of open-alert points → LOW/MEDIUM/HIGH/CRITICAL band |
| `GET /alerts`                 | List ingested compliance flags |
| `POST /alerts/:id/acknowledge`| Mark `ACKNOWLEDGED` |
| `POST /alerts/:id/file-str`   | Mark `STR_FILED` (FMU STR draft TODO) |

## Tear down

```
./scripts/down.sh
```

To wipe state:
```
./scripts/down.sh && rm -rf infra/data .anvil-state.json
```

## Layout

```
contracts/    # Foundry — 3 contracts + Deploy.s.sol + 17 tests
subgraph/     # graph-node indexer + 7-rule detection
backend/      # NestJS — wallet creation, transfer signing, flag ingestion
infra/        # docker-compose for postgres/ipfs/graph-node
scripts/      # startup orchestration
```

## Smoke test (after `up.sh`)

```bash
source .env

# 1. Create custodial wallet (backend generates EOA + registers on-chain)
WALLET=$(curl -s -X POST localhost:3000/wallets -H 'content-type: application/json' -d '{
  "customerId":"cust-001","fullName":"Test User","passportNo":"AB1234567",
  "dob":"1990-01-01","nationality":"PK","address":"Karachi","kycTier":"ENHANCED"
}' | jq -r .id)
echo "wallet: $WALLET"

# 2. Onramp 5M bPKR via the bank operator
cast send $ONRAMP_ADDRESS "mintFor(address,uint256,bytes32)" $WALLET 5000000000000 \
  $(cast --to-bytes32 0x4649415431) --private-key $DEPLOYER_PK --rpc-url $RPC_URL

# 3. Transfer 500K → backend pre-checks then signs
curl -s -X POST localhost:3000/wallets/$WALLET/transfer \
  -H 'content-type: application/json' \
  -d '{"to":"0xdeadbeef000000000000000000000000deadbeef","amount":"500000000000"}' | jq

# 4. Try 3M (Rule 1 — CTR) → 422 (above tier-2 cap of 10M is fine, but new-account cap is 1M)
curl -s -X POST localhost:3000/wallets/$WALLET/transfer \
  -H 'content-type: application/json' \
  -d '{"to":"0xdeadbeef000000000000000000000000deadbeef","amount":"3000000000000"}' | jq

# 5. Wait ~10s for the subgraph to index, then list alerts
sleep 10 && curl -s localhost:3000/alerts | jq
```
