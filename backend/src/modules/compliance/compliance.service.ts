import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

// Pakistan AML rule points from PDF risk-scoring matrix.
export const RULE_POINTS: Record<number, number> = {
  1: 20,   // CTR threshold
  2: 15,   // Structuring / smurfing
  5: 8,    // Velocity spike
  7: 10,   // Third-party payer
  8: 8,    // Layering
  9: 25,   // PEP
  12: 10,  // New account
};

export type RiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export function bandForScore(score: number): RiskBand {
  if (score >= 90) return "CRITICAL";
  if (score >= 60) return "HIGH";
  if (score >= 30) return "MEDIUM";
  return "LOW";
}

@Injectable()
export class ComplianceService {
  private readonly log = new Logger(ComplianceService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Detectors land here. Each is a pure function over recent SubgraphTransfers
  // plus DB state (KnownCounterparty, prior alerts). Wired in once contracts
  // exist and the subgraph emits real Transfer rows.
  // - structuring(walletId)         — Rule 2
  // - velocity(walletId)            — Rule 5
  // - thirdParty(walletId, txs)     — Rule 7
  // - layering(sourceAddress, txs)  — Rule 8

  async riskScore(walletId: string) {
    const alerts = await this.prisma.alert.findMany({
      where: { walletId: walletId.toLowerCase(), status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    });
    const score = alerts.reduce((acc, a) => acc + a.score, 0);
    return { walletId, score, band: bandForScore(score), alerts };
  }
}
