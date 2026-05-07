import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  ProfileSet,
  Blocked,
  CtrThresholdChanged,
} from "../generated/ComplianceRegistry/ComplianceRegistry";
import { RegistryConfig } from "../generated/schema";
import { REGISTRY_SINGLETON, getOrCreateWallet } from "./shared";

export function handleProfileSet(event: ProfileSet): void {
  const w = getOrCreateWallet(event.params.wallet);
  w.kycTier = event.params.kycTier;
  w.isPEP = event.params.isPEP;
  w.piiHash = event.params.piiHash as Bytes;
  if (w.openedAt.equals(BigInt.zero())) {
    w.openedAt = BigInt.fromU64(event.params.openedAt);
  }
  w.isCustodial = true;
  w.save();
}

export function handleBlocked(event: Blocked): void {
  const w = getOrCreateWallet(event.params.wallet);
  w.isBlocked = event.params.isBlocked;
  w.save();
}

export function handleCtrThresholdChanged(event: CtrThresholdChanged): void {
  let cfg = RegistryConfig.load(REGISTRY_SINGLETON);
  if (cfg == null) {
    cfg = new RegistryConfig(REGISTRY_SINGLETON);
    cfg.newAccountWindow = BigInt.zero();
  }
  cfg.ctrThreshold = event.params.newThreshold;
  cfg.updatedAt = event.block.timestamp;
  cfg.save();
}
