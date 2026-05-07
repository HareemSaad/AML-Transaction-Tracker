import { Module } from "@nestjs/common";
import { SubgraphClient } from "./subgraph.client";
import { SubgraphPoller } from "./subgraph.poller";

@Module({
  providers: [SubgraphClient, SubgraphPoller],
  exports: [SubgraphClient],
})
export class SubgraphModule {}
