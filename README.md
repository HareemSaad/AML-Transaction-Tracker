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

```bash
pnpm install              # repo root — installs subgraph + backend + frontend workspaces
./scripts/up.sh
pnpm frontend             # compliance dashboard at http://localhost:5173
```

Then seed the demo wallets (creates 6 custodial wallets with varied profiles and funds them):

```bash
./scripts/seed-wallets.sh
```

---

## Scripts

### Overview

| Script | What it does |
|---|---|
| `up.sh` | Start the full stack in order (anvil → contracts → graph → subgraph → backend) |
| `down.sh` | Stop all services; preserves chain state and graph-node index by default |
| `start-anvil.sh` | Fork mainnet via anvil, save/restore state from `.anvil-state.json` |
| `deploy-contracts.sh` | `forge deploy` → write `deployments/local.json`, copy ABIs, patch `.env`. Idempotent — skips if registry already has bytecode |
| `start-graph-stack.sh` | `docker compose up` for postgres + ipfs + graph-node |
| `deploy-subgraph.sh` | Render `subgraph.yaml` from `local.json`, codegen, build, deploy to local graph-node |
| `start-backend.sh` | `prisma migrate deploy` + NestJS dev server on `:3000` |
| `seed-wallets.sh` | Create 6 demo custodial wallets (varied KYC tiers, one PEP) and fund each via onramp |
| `aml-demo.sh` | End-to-end AML scenario script — fires rules 1, 2, 5 and demonstrates blacklisting |

### Common workflows

**Normal restart** — chain and graph-node index are preserved, resumes instantly:
```bash
./scripts/down.sh && ./scripts/up.sh
```

**Full clean slate** — wipes postgres (graph-node + backend DB), ipfs, and anvil state:
```bash
FULL_TEARDOWN=1 ./scripts/down.sh
rm -f .anvil-state.json
./scripts/up.sh
./scripts/seed-wallets.sh   # re-seed wallets after a full wipe
```

**Redeploy contracts only** (e.g. after a Solidity change):
```bash
FORCE_DEPLOY=1 ./scripts/deploy-contracts.sh
./scripts/deploy-subgraph.sh   # subgraph must be redeployed if ABI changed
```

**Redeploy subgraph only** (e.g. after editing `subgraph/src/`):
```bash
./scripts/deploy-subgraph.sh
```

**Seed demo wallets** (run once after `up.sh`, or after a full wipe):
```bash
./scripts/seed-wallets.sh
# Creates: Alice (CORPORATE), Bob (ENHANCED), Carol (CORPORATE),
#          Danish (ENHANCED), Eva (BASIC/CN), Faisal (ENHANCED/PEP)
# Funds:   10M / 5M / 8M / 2M / 500K / 3M bPKR respectively
```

**Run the full AML demo** (fires rules 1, 2, 5 and blacklist flow):
```bash
./scripts/aml-demo.sh
```

**Grant PEP approval** so Faisal can send transfers (required once per session after seed):
```bash
source .env
cast send $REGISTRY_ADDRESS \
  "grantPepApproval(address,uint256)" \
  <FAISAL_ADDRESS> 5 \
  --private-key $DEPLOYER_PK --rpc-url $RPC_URL
```
Faisal's address is shown in the Transfer Portal wallet list, or via `curl -s localhost:3000/wallets | jq '.[] | select(.isPEP) | .id'`.

**Trigger AML rules manually via Transfer Portal** — see rule-by-rule cheat sheet below.

### Keeping graph-node sync fast after a full wipe

Anvil is configured with `ANVIL_BLOCK_TIME=0` (the default), which means it only mines a block when a transaction is submitted. Block numbers stay tight regardless of how much real time passes between operations — deploy at midnight, seed wallets the next morning, and the two sets of transactions are still in consecutive blocks.

If `ANVIL_BLOCK_TIME` is set to a non-zero value (e.g. `2`), anvil mines an empty block every 2 seconds. An overnight gap between deploy and seed-wallets would produce ~40,000 empty blocks that graph-node must scan on every full resync — this is what causes the 30-minute wait.

With the default `down.sh` (no `FULL_TEARDOWN`), graph-node resumes from its last committed block regardless of block-time, so normal restarts are always instant.

### Rule trigger cheat sheet

All seeded wallets are < 90 days old so **Rule 12 fires on every transfer** automatically.

| Rule | Trigger | How |
|---|---|---|
| **1** CTR (CRITICAL) | Single transfer ≥ 2,500,000 bPKR | Transfer Portal: Alice → Bob, amount `3000000` |
| **2** Structuring (HIGH) | 3+ transfers < 2.5M each, sum ≥ 2.5M within 24h | Transfer Portal: Bob → Carol, `900000` × 3 |
| **9** PEP (CRITICAL) | Any outgoing from PEP wallet | Grant approval (see above), then Faisal → Alice, any amount |
| **5** Velocity | Today's tx count > 3× 7-day baseline (baseline ≥ 5/day) | Script: 6 tx/day for 7 days then 25 in one day (requires `evm_increaseTime`) |
| **7** Third-party | First send to non-custodial address after wallet is 30d old | `cast rpc evm_increaseTime 2678400` then Transfer Portal: send to any non-seeded address |
| **8** Layering | Non-custodial address fans out to ≥ 3 custodial wallets in 2 blocks | Script: fund an anvil account with bPKR, then `cast send` to 3 wallets in rapid succession |

Wait ~10 seconds after each set of transactions for the subgraph poller to ingest them, then refresh the dashboard.

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

```bash
./scripts/down.sh                        # stop services, keep chain + graph index
FULL_TEARDOWN=1 ./scripts/down.sh        # also wipe postgres and ipfs
FULL_TEARDOWN=1 ./scripts/down.sh && rm -f .anvil-state.json   # full reset including chain
```

## Compliance Dashboard (frontend)

A React + Vite + Tailwind UI served at `http://localhost:5173`.

```
pnpm frontend        # start dev server (proxies /api → :3000, /subgraph → :8000)
```

### Master Dashboard (`/master`) — compliance officer view

- Live stats bar: Total Flags / Open / Critical / STR Filed (auto-refreshes every 15 s)
- Filter bar: Status · Severity · Rule
- Alerts table: Wallet · Customer · Rule · Amount · Severity · Status · Score · Time · Actions
- Per-row Actions menu: Acknowledge / File STR
- **Wallet Drawer** (click any wallet address):
  - Full customer profile (KYC tier, nationality, DOB, occupation, source of funds)
  - Risk score bar (LOW → CRITICAL)
  - **Blacklist / Unblock** with inline confirmation (calls `POST /wallets/:id/block`)
  - Alerts tab — all alerts for that wallet
  - Transaction History tab — outgoing/incoming transfers from subgraph

### User Dashboard (`/user`) — customer self-service

- Search by wallet address
- Customer profile card + compliance status bar
- Transaction History and Compliance Alerts tabs (read-only)

### Transfer Portal (`/transfer`) — demo transfer interface

- Grid of all seeded custodial wallets (name, address, KYC tier, PEP badge)
- Blocked wallets are greyed out and non-clickable
- Click any wallet to open its transfer interface:
  - Wallet profile header
  - Recipient picker — dropdown of other active wallets plus free-text address field
  - Amount input in bPKR (converted to base units automatically)
  - Recent transaction history from the subgraph
- PEP wallets (e.g. Faisal) require an on-chain approval before the backend will sign — see `grantPepApproval` in the Scripts section

## Layout

```
contracts/    # Foundry — 3 contracts + Deploy.s.sol + 17 tests
subgraph/     # graph-node indexer + 7-rule detection
backend/      # NestJS — wallet creation, transfer signing, flag ingestion
frontend/     # React + Vite + Tailwind compliance dashboard
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
