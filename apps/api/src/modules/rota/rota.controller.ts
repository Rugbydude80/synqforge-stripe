import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';

@Controller()
export class RotaController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('sites/:id/shifts')
  async getShifts(
    @Param('id') siteId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.prisma.shift.findMany({
      where: {
        siteId,
        startsAt: from ? { gte: new Date(from) } : undefined,
        endsAt: to ? { lte: new Date(to) } : undefined,
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  @Post('sites/:id/shifts')
  async upsertShift(
    @Param('id') siteId: string,
    @Body() body: any,
  ) {
    if (body.id) {
      return this.prisma.shift.update({
        where: { id: body.id },
        data: { ...body, siteId },
      });
    }
    return this.prisma.shift.create({ data: { ...body, siteId } });
  }

  @Post('shifts/:id/sickness')
  async markSickness(@Param('id') id: string) {
    // placeholder for event emission
    return { ok: true, shiftId: id, event: 'SICKNESS_RAISED' };
  }
}

