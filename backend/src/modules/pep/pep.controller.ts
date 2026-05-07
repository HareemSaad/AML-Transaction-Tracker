import { Controller, Get, Query } from "@nestjs/common";
import { PepService } from "./pep.service";

@Controller("pep")
export class PepController {
  constructor(private readonly pep: PepService) {}

  @Get()
  list() {
    return this.pep.list();
  }

  @Get("match")
  match(@Query("name") name: string) {
    return this.pep.match(name);
  }
}
