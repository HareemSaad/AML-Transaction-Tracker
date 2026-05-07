import { Body, Controller, Get, Param, Post, ParseBoolPipe, Query } from "@nestjs/common";
import { WalletsService } from "./wallets.service";
import { CreateWalletDto, TransferDto } from "./dto";

@Controller("wallets")
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  create(@Body() dto: CreateWalletDto) {
    return this.wallets.create(dto);
  }

  @Get()
  list() {
    return this.wallets.findAll();
  }

  @Get(":id")
  one(@Param("id") id: string) {
    return this.wallets.findOne(id);
  }

  @Post(":id/transfer")
  transfer(@Param("id") id: string, @Body() dto: TransferDto) {
    return this.wallets.transfer(id, dto);
  }

  /** POST /wallets/:id/block?blocked=true|false  — compliance officer action */
  @Post(":id/block")
  block(
    @Param("id") id: string,
    @Query("blocked", new ParseBoolPipe({ optional: true })) blocked = true,
  ) {
    return this.wallets.setBlocked(id, blocked);
  }
}
