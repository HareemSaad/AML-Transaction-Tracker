import { Module } from "@nestjs/common";
import { PepService } from "./pep.service";
import { PepController } from "./pep.controller";

@Module({
  controllers: [PepController],
  providers: [PepService],
  exports: [PepService],
})
export class PepModule {}
