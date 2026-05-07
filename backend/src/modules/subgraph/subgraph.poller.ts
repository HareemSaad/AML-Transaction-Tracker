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
      const cursor = await this.prisma.subgraphCursor.upsert({
        where: { id: CURSOR_ID },
        create: { id: CURSOR_ID, lastTimestamp: 0n },
        update: {},
      });
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

      await this.prisma.alert.upsert({
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
      });
    }
  }
}
