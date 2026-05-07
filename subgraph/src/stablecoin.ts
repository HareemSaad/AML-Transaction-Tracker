import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import { Transfer as TransferEvent } from "../generated/BankStablecoin/BankStablecoin";
import {
  Wallet,
  Transfer,
  ComplianceFlag,
  WalletDailyStats,
  KnownCounterparty,
  StructuringWindow,
  SourceFanOut,
} from "../generated/schema";
import { getOrCreateWallet, loadCtrThreshold, loadNewAccountWindow } from "./shared";

// ─── Constants ──────────────────────────────────────────────────────────────
const STRUCTURING_WINDOW_SECS = BigInt.fromI32(86400);          // Rule 2 — 24h
const VELOCITY_BASELINE_DAYS = 7;                                // Rule 5 — baseline window
const VELOCITY_MULTIPLIER = BigInt.fromI32(3);                   // Rule 5 — today > 3× baseline
const VELOCITY_MIN_BASELINE = BigInt.fromI32(5);                 // Rule 5 — only fire if baseline ≥ 5
const COUNTERPARTY_MATURITY_SECS = BigInt.fromI32(2_592_000);    // Rule 7 — 30 days
const LAYERING_BLOCK_WINDOW = BigInt.fromI32(2);                 // Rule 8 — 2-block window
const LAYERING_MIN_RECEIVERS = 3;                                // Rule 8 — fan-out ≥ 3
const NEW_ACCOUNT_WINDOW_DEFAULT = BigInt.fromI32(7_776_000);    // Rule 12 — 90d default
const MAX_RECENT_FANOUT = 16;                                    // Rule 8 — bound array growth

function severityFor(ruleId: i32): string {
  if (ruleId == 1 || ruleId == 9) return "CRITICAL";
  if (ruleId == 2) return "HIGH";
  if (ruleId == 5 || ruleId == 7 || ruleId == 8 || ruleId == 12) return "MEDIUM";
  return "LOW";
}

function emitFlag(
  wallet: Bytes,
  ruleId: i32,
  amount: BigInt,
  evidence: string,
  txHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
  timestamp: BigInt,
): void {
  const id = txHash.concatI32(logIndex.toI32()).concatI32(ruleId);
  if (ComplianceFlag.load(id) != null) return;
  const f = new ComplianceFlag(id);
  f.wallet = wallet;
  f.ruleId = ruleId;
  f.severity = severityFor(ruleId);
  f.amount = amount;
  f.txHash = txHash;
  f.blockNumber = blockNumber;
  f.timestamp = timestamp;
  f.evidence = evidence;
  f.save();
}

function dayBucketId(walletId: Bytes, dayIndex: BigInt): Bytes {
  return walletId.concatI32(dayIndex.toI32());
}

// ─── Rule 2 (Structuring) ──────────────────────────────────────────────────
function checkStructuring(
  wallet: Wallet,
  amount: BigInt,
  ts: BigInt,
  ctr: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
): void {
  if (ctr.equals(BigInt.zero()) || amount.ge(ctr)) return; // structuring = sub-threshold txns

  let win = StructuringWindow.load(wallet.id);
  if (win == null) {
    win = new StructuringWindow(wallet.id);
    win.wallet = wallet.id;
    win.amounts = [];
    win.timestamps = [];
    win.totalAmount = BigInt.zero();
  }

  const cutoff = ts.minus(STRUCTURING_WINDOW_SECS);
  const tsArr = win.timestamps;
  const amArr = win.amounts;
  const newTs: BigInt[] = [];
  const newAm: BigInt[] = [];
  let total = BigInt.zero();
  for (let i = 0; i < tsArr.length; i++) {
    if (tsArr[i].ge(cutoff)) {
      newTs.push(tsArr[i]);
      newAm.push(amArr[i]);
      total = total.plus(amArr[i]);
    }
  }
  newTs.push(ts);
  newAm.push(amount);
  total = total.plus(amount);
  win.timestamps = newTs;
  win.amounts = newAm;
  win.totalAmount = total;
  win.save();

  if (newTs.length >= 3 && total.ge(ctr)) {
    const ev = "{\"window\":\"24h\",\"count\":" + newTs.length.toString()
      + ",\"sum\":\"" + total.toString() + "\",\"ctrThreshold\":\"" + ctr.toString() + "\"}";
    emitFlag(wallet.id, 2, amount, ev, txHash, logIndex, blockNumber, ts);
  }
}

// ─── Rule 5 (Velocity) ─────────────────────────────────────────────────────
function checkVelocity(
  wallet: Wallet,
  ts: BigInt,
  amount: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
): void {
  const dayIndex = ts.div(BigInt.fromI32(86400));

  let today = WalletDailyStats.load(dayBucketId(wallet.id, dayIndex));
  if (today == null) {
    today = new WalletDailyStats(dayBucketId(wallet.id, dayIndex));
    today.wallet = wallet.id;
    today.dayIndex = dayIndex;
    today.outgoingCount = BigInt.zero();
    today.outgoingVolume = BigInt.zero();
  }
  today.outgoingCount = today.outgoingCount.plus(BigInt.fromI32(1));
  today.outgoingVolume = today.outgoingVolume.plus(amount);
  today.save();

  let total = BigInt.zero();
  let observed = 0;
  for (let i = 1; i <= VELOCITY_BASELINE_DAYS; i++) {
    const idx = dayIndex.minus(BigInt.fromI32(i));
    const b = WalletDailyStats.load(dayBucketId(wallet.id, idx));
    if (b != null) {
      total = total.plus(b.outgoingCount);
      observed += 1;
    }
  }
  if (observed == 0) return;
  const baseline = total.div(BigInt.fromI32(observed));
  if (baseline.lt(VELOCITY_MIN_BASELINE)) return;

  if (today.outgoingCount.gt(baseline.times(VELOCITY_MULTIPLIER))) {
    const ev = "{\"todayCount\":\"" + today.outgoingCount.toString()
      + "\",\"baseline\":\"" + baseline.toString() + "\",\"multiplier\":3}";
    emitFlag(wallet.id, 5, amount, ev, txHash, logIndex, blockNumber, ts);
  }
}

// ─── Rule 7 (Third-party) ──────────────────────────────────────────────────
function checkThirdParty(
  wallet: Wallet,
  to: Wallet,
  amount: BigInt,
  ts: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
): void {
  if (to.isCustodial) return;

  const cpId = wallet.id.concat(to.id);
  let cp = KnownCounterparty.load(cpId);
  const isFirstTime = cp == null;
  if (cp == null) {
    cp = new KnownCounterparty(cpId);
    cp.wallet = wallet.id;
    cp.counterparty = to.id;
    cp.firstSeenAt = ts;
    cp.txCount = BigInt.zero();
    cp.totalAmount = BigInt.zero();
  }
  cp.txCount = cp.txCount.plus(BigInt.fromI32(1));
  cp.totalAmount = cp.totalAmount.plus(amount);
  cp.save();

  if (
    isFirstTime
    && wallet.openedAt.gt(BigInt.zero())
    && ts.minus(wallet.openedAt).ge(COUNTERPARTY_MATURITY_SECS)
  ) {
    const ev = "{\"counterparty\":\"" + to.id.toHexString()
      + "\",\"firstSeenAt\":\"" + ts.toString() + "\"}";
    emitFlag(wallet.id, 7, amount, ev, txHash, logIndex, blockNumber, ts);
  }
}

// ─── Rule 8 (Layering — fan-out from non-custodial source) ─────────────────
function checkLayering(
  from: Wallet,
  to: Wallet,
  amount: BigInt,
  ts: BigInt,
  txHash: Bytes,
  logIndex: BigInt,
  blockNumber: BigInt,
): void {
  if (from.isCustodial || !to.isCustodial) return;

  let fan = SourceFanOut.load(from.id);
  if (fan == null) {
    fan = new SourceFanOut(from.id);
    fan.source = from.id;
    fan.recentReceivers = [];
    fan.recentAmounts = [];
    fan.recentBlocks = [];
  }

  const cutoff = blockNumber.minus(LAYERING_BLOCK_WINDOW);
  const recv = fan.recentReceivers;
  const am = fan.recentAmounts;
  const bk = fan.recentBlocks;

  const newRecv: Bytes[] = [];
  const newAm: BigInt[] = [];
  const newBk: BigInt[] = [];
  for (let i = 0; i < bk.length; i++) {
    if (bk[i].ge(cutoff)) {
      newRecv.push(recv[i]);
      newAm.push(am[i]);
      newBk.push(bk[i]);
    }
  }
  newRecv.push(to.id);
  newAm.push(amount);
  newBk.push(blockNumber);

  while (newRecv.length > MAX_RECENT_FANOUT) {
    newRecv.shift();
    newAm.shift();
    newBk.shift();
  }
  fan.recentReceivers = newRecv;
  fan.recentAmounts = newAm;
  fan.recentBlocks = newBk;
  fan.save();

  // Count distinct receivers in window.
  const seen: string[] = [];
  for (let i = 0; i < newRecv.length; i++) {
    const k = newRecv[i].toHexString();
    let dup = false;
    for (let j = 0; j < seen.length; j++) {
      if (seen[j] == k) { dup = true; break; }
    }
    if (!dup) seen.push(k);
  }
  if (seen.length >= LAYERING_MIN_RECEIVERS) {
    const ev = "{\"source\":\"" + from.id.toHexString()
      + "\",\"distinctReceivers\":" + seen.length.toString()
      + ",\"windowBlocks\":" + LAYERING_BLOCK_WINDOW.toString() + "}";
    emitFlag(to.id, 8, amount, ev, txHash, logIndex, blockNumber, ts);
  }
}

// ─── Main Transfer handler ──────────────────────────────────────────────────
export function handleTransfer(event: TransferEvent): void {
  const fromW = getOrCreateWallet(event.params.from);
  const toW = getOrCreateWallet(event.params.to);
  const amount = event.params.value;
  const ts = event.block.timestamp;
  const blockNumber = event.block.number;
  const txHash = event.transaction.hash;
  const logIndex = event.logIndex;

  const ctr = loadCtrThreshold();
  const newAcctWindow = loadNewAccountWindow(NEW_ACCOUNT_WINDOW_DEFAULT);

  const isLarge = !ctr.equals(BigInt.zero()) && amount.ge(ctr);
  const isPep = fromW.isCustodial && fromW.isPEP;
  const isNewAccount =
    fromW.isCustodial
    && fromW.openedAt.gt(BigInt.zero())
    && ts.minus(fromW.openedAt).lt(newAcctWindow);

  // Persist Transfer.
  const id = txHash.concatI32(logIndex.toI32());
  const t = new Transfer(id);
  t.from = fromW.id;
  t.to = toW.id;
  t.amount = amount;
  t.blockNumber = blockNumber;
  t.timestamp = ts;
  t.txHash = txHash;
  t.logIndex = logIndex;
  t.fromIsCustodial = fromW.isCustodial;
  t.toIsCustodial = toW.isCustodial;
  t.isLargeTransaction = isLarge;
  t.isPEPTransaction = isPep;
  t.isNewAccountTransaction = isNewAccount;
  t.save();

  fromW.outgoingCount = fromW.outgoingCount.plus(BigInt.fromI32(1));
  fromW.outgoingVolume = fromW.outgoingVolume.plus(amount);
  fromW.save();
  toW.incomingCount = toW.incomingCount.plus(BigInt.fromI32(1));
  toW.incomingVolume = toW.incomingVolume.plus(amount);
  toW.save();

  if (fromW.isCustodial) {
    if (isLarge) {
      const ev = "{\"amount\":\"" + amount.toString()
        + "\",\"ctrThreshold\":\"" + ctr.toString() + "\"}";
      emitFlag(fromW.id, 1, amount, ev, txHash, logIndex, blockNumber, ts);
    }
    if (isPep) {
      const ev = "{\"amount\":\"" + amount.toString() + "\"}";
      emitFlag(fromW.id, 9, amount, ev, txHash, logIndex, blockNumber, ts);
    }
    if (isNewAccount) {
      const age = ts.minus(fromW.openedAt);
      const ev = "{\"walletAgeSecs\":\"" + age.toString()
        + "\",\"windowSecs\":\"" + newAcctWindow.toString() + "\"}";
      emitFlag(fromW.id, 12, amount, ev, txHash, logIndex, blockNumber, ts);
    }
    checkStructuring(fromW, amount, ts, ctr, txHash, logIndex, blockNumber);
    checkVelocity(fromW, ts, amount, txHash, logIndex, blockNumber);
    checkThirdParty(fromW, toW, amount, ts, txHash, logIndex, blockNumber);
  }
  checkLayering(fromW, toW, amount, ts, txHash, logIndex, blockNumber);
}
