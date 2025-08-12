import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { publish } from '../../ably.js';
import { PrismaService } from '../../prisma.service.js';

@Controller()
export class OffersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('shifts/:id/offers/batch')
  async batchOffers(@Param('id') shiftId: string, @Body() body: { size: number }) {
    // naive: pick first N staff from site
    const shift = await this.prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const staff = await this.prisma.staff.findMany({ where: { siteId: shift.siteId }, take: body.size ?? 10 });
    const now = new Date();
    const offers = await this.prisma.$transaction(
      staff.map((s) =>
        this.prisma.offer.create({
          data: {
            shiftId,
            recipientId: s.id,
            sentAt: now,
            status: 'sent',
          },
        }),
      ),
    );
    const payload = { shiftId, offerIds: offers.map((o) => o.id), rulesetVersion: 1 };
    await publish(`site:${shift.siteId}:offers`, 'offers.batch', payload);
    return payload;
  }

  @Post('offers/:id/accept')
  async accept(@Param('id') offerId: string, @Req() req: any) {
    const offer = await this.prisma.offer.findUniqueOrThrow({ where: { id: offerId } });
    const userId = req.user?.userId || offer.recipientId; // fallback in dev
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.$executeRawUnsafe(
        "UPDATE \"Shift\" SET \"assignedStaffId\" = $1, \"status\" = 'filled' WHERE id = $2 AND \"assignedStaffId\" IS NULL",
        userId,
        offer.shiftId,
      );
      if (updated === 1) {
        await tx.offer.update({ where: { id: offerId }, data: { status: 'accepted', acceptedAt: new Date() } });
        await tx.offer.updateMany({ where: { shiftId: offer.shiftId, NOT: { id: offerId } }, data: { status: 'closed' } });
        return { winner: true };
      }
      await tx.offer.update({ where: { id: offerId }, data: { status: 'closed' } });
      return { winner: false };
    });
    const out = { shiftId: offer.shiftId, winnerStaffId: userId, ...result } as any;
    await publish(`site:${offer.shiftId}:offers`, 'offers.accepted', out);
    return out;
  }

  @Post('offers/:id/close')
  async close(@Param('id') offerId: string) {
    await this.prisma.offer.update({ where: { id: offerId }, data: { status: 'closed' } });
    return { ok: true };
  }
}

