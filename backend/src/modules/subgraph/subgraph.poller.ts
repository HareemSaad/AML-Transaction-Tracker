import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { SubgraphClient, SubgraphFlag } from "./subgraph.client";
import { RULE_POINTS } from "../compliance/compliance.service";

const CURSOR_ID = "default";

@Injectable()
export class SubgraphPoller {
  private readonly log = new Logger(SubgraphPoller.name);
  private running = false;

  constructor(
    private readonly subgraph: SubgraphClient,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_5_SECONDS)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      let cursor = await this.prisma.subgraphCursor.upsert({
        where: { id: CURSOR_ID },
        create: { id: CURSOR_ID, lastTimestamp: 0n },
        update: {},
      });

      // Detect chain reset: if the subgraph's max-flag timestamp is below our
      // cursor, anvil was restarted with a fresh fork and the cursor is stale.
      // Rewind to 0 so the new run's flags get ingested.
      if (cursor.lastTimestamp > 0n) {
        const maxTs = await this.subgraph.maxFlagTimestamp();
        if (maxTs !== null && maxTs < cursor.lastTimestamp) {
          this.log.warn(
            `chain reset detected (subgraph max ts=${maxTs} < cursor ${cursor.lastTimestamp}); rewinding cursor`,
          );
          cursor = await this.prisma.subgraphCursor.update({
            where: { id: CURSOR_ID },
            data: { lastTimestamp: 0n },
          });
        }
      }

      const flags = await this.subgraph.flagsSince(cursor.lastTimestamp);
      if (flags.length === 0) return;
      this.log.debug(`ingesting ${flags.length} new flags since ts=${cursor.lastTimestamp}`);
      await this.ingest(flags);
      const last = flags[flags.length - 1];
      await this.prisma.subgraphCursor.update({
        where: { id: CURSOR_ID },
        data: { lastTimestamp: BigInt(last.timestamp) },
      });
    } catch (err) {
      this.log.warn(`subgraph poll failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private async ingest(flags: SubgraphFlag[]) {
    for (const f of flags) {
      const walletId = f.wallet.id.toLowerCase();
      // Only persist alerts for wallets the bank actually custodies.
      const exists = await this.prisma.wallet.findUnique({ where: { id: walletId }, select: { id: true } });
      if (!exists) continue;

      let evidence: unknown;
      try { evidence = JSON.parse(f.evidence); } catch { evidence = { raw: f.evidence }; }

      const result = await this.prisma.alert.upsert({
        where: { id: f.id },
        create: {
          id: f.id,
          walletId,
          ruleId: f.ruleId,
          severity: f.severity,
          score: RULE_POINTS[f.ruleId] ?? 0,
          amount: f.amount ?? null,
          txHash: f.txHash,
          blockNumber: f.blockNumber,
          timestamp: new Date(Number(f.timestamp) * 1000),
          evidence: evidence as object,
        },
        update: {},
        select: { createdAt: true, timestamp: true },
      });
      const isNew = result.createdAt.getTime() >= Date.now() - 5_000;
      if (isNew) {
        const amt = f.amount ? ` amount=${f.amount}` : "";
        this.log.warn(
          `🚨 RULE_${f.ruleId} [${f.severity}] wallet=${walletId}${amt} score=${RULE_POINTS[f.ruleId] ?? 0} tx=${f.txHash}`,
        );
      }
    }
  }
}
