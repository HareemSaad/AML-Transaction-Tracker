import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { AlertsService } from "./alerts.service";
import { ComplianceService } from "../compliance/compliance.service";

@Controller()
export class AlertsController {
  constructor(
    private readonly alerts: AlertsService,
    private readonly compliance: ComplianceService,
  ) {}

  @Get("alerts")
  list(@Query("status") status?: string) {
    return this.alerts.list(status);
  }

  @Post("alerts/:id/acknowledge")
  acknowledge(@Param("id") id: string) {
    return this.alerts.acknowledge(id);
  }

  @Post("alerts/:id/file-str")
  fileStr(@Param("id") id: string) {
    return this.alerts.fileStr(id);
  }

  @Get("wallets/:id/risk-score")
  score(@Param("id") id: string) {
    return this.compliance.riskScore(id);
  }
}
