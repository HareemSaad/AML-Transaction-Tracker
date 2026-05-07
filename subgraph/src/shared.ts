import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Wallet, RegistryConfig } from "../generated/schema";

// Singleton id used for the RegistryConfig — both handlers write/read the same key.
export const REGISTRY_SINGLETON: Bytes = Bytes.fromUTF8("registry");

export function getOrCreateWallet(id: Bytes): Wallet {
  let w = Wallet.load(id);
  if (w == null) {
    w = new Wallet(id);
    w.kycTier = 0;
    w.isPEP = false;
    w.isBlocked = false;
    w.isCustodial = false;
    w.openedAt = BigInt.zero();
    w.outgoingCount = BigInt.zero();
    w.outgoingVolume = BigInt.zero();
    w.incomingCount = BigInt.zero();
    w.incomingVolume = BigInt.zero();
    w.save();
  }
  return w as Wallet;
}

export function loadCtrThreshold(): BigInt {
  const cfg = RegistryConfig.load(REGISTRY_SINGLETON);
  if (cfg == null) return BigInt.zero();
  return cfg.ctrThreshold;
}

export function loadNewAccountWindow(defaultSecs: BigInt): BigInt {
  const cfg = RegistryConfig.load(REGISTRY_SINGLETON);
  if (cfg == null || cfg.newAccountWindow.equals(BigInt.zero())) return defaultSecs;
  return cfg.newAccountWindow;
}
