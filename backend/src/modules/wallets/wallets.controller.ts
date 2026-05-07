import { Body, Controller, Get, Param, Post } from "@nestjs/common";
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
}
