import { Module } from "@nestjs/common";
import { SubgraphModule } from "../subgraph/subgraph.module";
import { ComplianceService } from "./compliance.service";

@Module({
  imports: [SubgraphModule],
  providers: [ComplianceService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
