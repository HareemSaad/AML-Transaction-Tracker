import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  list(status?: string) {
    return this.prisma.alert.findMany({
      where: status ? { status: status as any } : undefined,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async acknowledge(id: string) {
    const a = await this.prisma.alert.findUnique({ where: { id } });
    if (!a) throw new NotFoundException(`alert ${id} not found`);
    return this.prisma.alert.update({ where: { id }, data: { status: "ACKNOWLEDGED" } });
  }

  async fileStr(id: string) {
    const a = await this.prisma.alert.findUnique({ where: { id }, include: { wallet: true } });
    if (!a) throw new NotFoundException(`alert ${id} not found`);
    // TODO: build FMU STR payload (PMLA 2010 S.7(3)) and emit to outbound queue.
    return this.prisma.alert.update({ where: { id }, data: { status: "STR_FILED" } });
  }
}
