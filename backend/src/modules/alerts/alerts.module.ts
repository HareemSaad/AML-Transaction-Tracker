import { Module } from "@nestjs/common";
import { ComplianceModule } from "../compliance/compliance.module";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";

@Module({
  imports: [ComplianceModule],
  controllers: [AlertsController],
  providers: [AlertsService],
})
export class AlertsModule {}
