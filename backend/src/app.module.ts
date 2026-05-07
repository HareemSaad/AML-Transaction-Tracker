import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { PrismaModule } from "./modules/prisma/prisma.module";
import { SubgraphModule } from "./modules/subgraph/subgraph.module";
import { WalletsModule } from "./modules/wallets/wallets.module";
import { PepModule } from "./modules/pep/pep.module";
import { ComplianceModule } from "./modules/compliance/compliance.module";
import { AlertsModule } from "./modules/alerts/alerts.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [".env", "../.env"] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    SubgraphModule,
    WalletsModule,
    PepModule,
    ComplianceModule,
    AlertsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
