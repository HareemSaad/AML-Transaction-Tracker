import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GraphQLClient, gql } from "graphql-request";

export interface SubgraphFlag {
  id: string;
  ruleId: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  amount: string | null;
  txHash: string;
  blockNumber: string;
  timestamp: string;       // unix-seconds (string)
  evidence: string;        // JSON
  wallet: { id: string };
}

const FLAGS_SINCE = gql`
  query FlagsSince($since: BigInt!, $limit: Int!) {
    complianceFlags(
      where: { timestamp_gt: $since }
      orderBy: timestamp
      orderDirection: asc
      first: $limit
    ) {
      id
      ruleId
      severity
      amount
      txHash
      blockNumber
      timestamp
      evidence
      wallet { id }
    }
  }
`;

@Injectable()
export class SubgraphClient {
  private readonly log = new Logger(SubgraphClient.name);
  private readonly client: GraphQLClient;

  constructor(config: ConfigService) {
    const url = config.get<string>("SUBGRAPH_URL")
      ?? "http://localhost:8000/subgraphs/name/bank/aml";
    this.log.log(`subgraph endpoint: ${url}`);
    this.client = new GraphQLClient(url);
  }

  async flagsSince(timestamp: bigint, limit = 200): Promise<SubgraphFlag[]> {
    const data = await this.client.request<{ complianceFlags: SubgraphFlag[] }>(
      FLAGS_SINCE,
      { since: timestamp.toString(), limit },
    );
    return data.complianceFlags;
  }

  async maxFlagTimestamp(): Promise<bigint | null> {
    const q = gql`
      { complianceFlags(first: 1, orderBy: timestamp, orderDirection: desc) { timestamp } }
    `;
    const data = await this.client.request<{ complianceFlags: { timestamp: string }[] }>(q);
    if (data.complianceFlags.length === 0) return null;
    return BigInt(data.complianceFlags[0].timestamp);
  }
}
