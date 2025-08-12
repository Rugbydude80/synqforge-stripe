import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';

@Controller('tips')
export class TipsController {
  constructor(private prisma: PrismaService) {}

  @Post('import')
  async import(@Body() body: { siteId: string; day: string; serviceCharge: string; cashTips: string }) {
    const pot = await this.prisma.tipPot.create({
      data: {
        siteId: body.siteId,
        day: new Date(body.day),
        serviceCharge: new this.prisma.Prisma.Decimal(body.serviceCharge),
        cashTips: new this.prisma.Prisma.Decimal(body.cashTips),
      },
    });
    return { id: pot.id };
  }

  @Post('allocate')
  async allocate(@Body() body: { potId: string; allocations: { staffId: string; amount: string; rationale: string }[] }) {
    await this.prisma.$transaction(
      body.allocations.map((a) =>
        this.prisma.tipAllocation.create({
          data: {
            potId: body.potId,
            staffId: a.staffId,
            amount: new this.prisma.Prisma.Decimal(a.amount),
            rationale: a.rationale,
          },
        }),
      ),
    );
    return { ok: true };
  }

  @Get('statements/:staffId')
  async statement(@Param('staffId') staffId: string, @Query('period') period?: string) {
    return { url: 'https://example.com/statement.csv', expiresAt: new Date(Date.now() + 15 * 60 * 1000) };
  }
}

