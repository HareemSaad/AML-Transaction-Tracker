# Subgraph

Indexes ERC20 `Transfer` events + `ComplianceRegistry` state, computes all
7 Pakistan AML rule flags (1, 2, 5, 7, 8, 9, 12), and exposes them as
`ComplianceFlag` entities for the NestJS backend to poll.

## Files

- `schema.graphql` — entities: `Wallet`, `Transfer`, `ComplianceFlag`, `RegistryConfig`, plus aggregates `WalletDailyStats`, `KnownCounterparty`, `StructuringWindow`, `SourceFanOut`
- `subgraph.yaml.tpl` — manifest template; placeholders filled by `scripts/render-manifest.mjs`
- `src/shared.ts` — wallet helper + RegistryConfig singleton lookup
- `src/registry.ts` — handles `ProfileSet`, `Blocked`, `CtrThresholdChanged`
- `src/stablecoin.ts` — handles ERC20 `Transfer`; computes flags for rules 1/2/5/7/8/9/12
- `abis/*.json` — populated by `scripts/deploy-contracts.sh`

## Lifecycle

1. Foundry deploys contracts → writes `contracts/deployments/local.json` and copies ABIs to `subgraph/abis/`.
2. `pnpm render` renders `subgraph.yaml` from the template.
3. `pnpm codegen && pnpm build` generates AssemblyScript bindings.
4. `pnpm create-local && pnpm deploy-local` ships to the local graph-node.

The orchestrator `scripts/up.sh` runs steps 2–4 once contracts exist.
