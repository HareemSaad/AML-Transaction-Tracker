import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class PepService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.pEPRecord.findMany({ orderBy: { addedAt: "desc" }, take: 200 });
  }

  // Naive case-insensitive contains-match — replace with proper fuzzy match
  // (Levenshtein, double-metaphone) when integrating real PEP/sanctions feeds.
  async match(fullName: string) {
    return this.prisma.pEPRecord.findMany({
      where: { fullName: { contains: fullName, mode: "insensitive" } },
      take: 10,
    });
  }
}
