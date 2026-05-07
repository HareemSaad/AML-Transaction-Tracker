#!/usr/bin/env node
// Render subgraph.yaml from subgraph.yaml.tpl using deployment values.
// Inputs (in priority order):
//   1. ../contracts/deployments/local.json (written by Deploy.s.sol)
//   2. environment variables: REGISTRY_ADDRESS, STABLECOIN_ADDRESS, DEPLOY_BLOCK, SUBGRAPH_NETWORK
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const subgraphDir = path.resolve(__dirname, "..");
const repoRoot = path.resolve(subgraphDir, "..");
const tplPath = path.join(subgraphDir, "subgraph.yaml.tpl");
const outPath = path.join(subgraphDir, "subgraph.yaml");
const deploymentsPath = path.join(repoRoot, "contracts", "deployments", "local.json");

const ZERO = "0x0000000000000000000000000000000000000000";

let deployments = {};
if (fs.existsSync(deploymentsPath)) {
  deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
  console.log(`[render] using ${deploymentsPath}`);
} else {
  console.warn(`[render] ${deploymentsPath} missing — using env / placeholders`);
}

const ctx = {
  SUBGRAPH_NETWORK: process.env.SUBGRAPH_NETWORK || "mainnet",
  REGISTRY_ADDRESS: deployments.registry || process.env.REGISTRY_ADDRESS || ZERO,
  STABLECOIN_ADDRESS: deployments.stablecoin || process.env.STABLECOIN_ADDRESS || ZERO,
  DEPLOY_BLOCK: String(deployments.deployBlock ?? process.env.DEPLOY_BLOCK ?? 0),
};

const tpl = fs.readFileSync(tplPath, "utf8");
const out = tpl.replace(/\$\{(\w+)\}/g, (_, k) => {
  if (!(k in ctx)) throw new Error(`render-manifest: unknown placeholder \${${k}}`);
  return ctx[k];
});
fs.writeFileSync(outPath, out);
console.log(`[render] wrote ${outPath}`);
console.log(`[render] context:`, ctx);

if (Object.values(ctx).some(v => v === ZERO || v === "0")) {
  console.warn(`[render] WARNING: some addresses/blocks are zero — graph deploy will fail until contracts exist.`);
}
