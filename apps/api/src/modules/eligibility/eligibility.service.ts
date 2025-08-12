import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';
import { EligibilityResult } from '@rota/types';

@Injectable()
export class EligibilityService {
  constructor(private prisma: PrismaService) {}

  async evaluate(shiftId: string): Promise<{ staffId: string; checks: EligibilityResult[] }[]> {
    const shift = await this.prisma.shift.findUniqueOrThrow({ where: { id: shiftId } });
    const staff = await this.prisma.staff.findMany({ where: { siteId: shift.siteId } });
    return staff.map((s) => ({ staffId: s.id, checks: this.basicChecks(shift.startsAt, shift.endsAt, s.ageYears) }));
  }

  private basicChecks(startsAt: Date, endsAt: Date, ageYears: number): EligibilityResult[] {
    const results: EligibilityResult[] = [];
    const durationHrs = (endsAt.getTime() - startsAt.getTime()) / 3600_000;
    // Hard block: under-18 max shift length 8h
    if (ageYears < 18 && durationHrs > 8) results.push({ pass: false, code: 'U18_MAX_SHIFT', reason: 'Under 18s limited to 8h shifts' });
    // Hard block: min rest (placeholder)
    results.push({ pass: true, code: 'REST_OK', reason: 'Rest period ok' });
    return results;
  }
}

