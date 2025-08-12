import { PrismaClient, ContractType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sites = await prisma.$transaction([
    prisma.site.create({ data: { name: 'Central' } }),
    prisma.site.create({ data: { name: 'East' } }),
    prisma.site.create({ data: { name: 'West' } }),
  ]);
  const siteId = sites[0].id;
  const staff = Array.from({ length: 30 }).map((_, i) => ({
    siteId,
    fullName: `Staff ${i + 1}`,
    ageYears: 16 + (i % 25),
    contractType: [ContractType.irregular, ContractType.part_year, ContractType.fixed, ContractType.full_time][i % 4],
    skills: i % 2 === 0 ? ['bar'] : ['kitchen'],
    hourlyRate: new prisma.Prisma.Decimal(12 + (i % 5)),
    troncEligible: i % 3 === 0,
    whatsappOptIn: i % 2 === 0,
  }));
  await prisma.staff.createMany({ data: staff });

  const now = new Date();
  const shifts = await prisma.shift.createMany({
    data: Array.from({ length: 14 }).map((_, i) => ({
      siteId,
      role: i % 2 === 0 ? 'Server' : 'Chef',
      startsAt: new Date(now.getTime() + i * 3600_000 * 12),
      endsAt: new Date(now.getTime() + i * 3600_000 * 12 + 4 * 3600_000),
      status: 'published',
      source: 'rota',
    })),
  });

  await prisma.policy.createMany({
    data: [
      { siteId, type: 'tips', version: 1, documentUrl: 'https://example.com/tips.pdf', params: {}, publishedAt: new Date() },
      { siteId, type: 'selection', version: 1, documentUrl: 'https://example.com/selection.pdf', params: {}, publishedAt: new Date() },
    ],
  });

  await prisma.ruleSet.create({ data: { siteId, version: 1, rules: { weeklyCapHours: 48 }, publishedAt: new Date() } });

  const pot = await prisma.tipPot.create({
    data: { siteId, day: new Date(), serviceCharge: new prisma.Prisma.Decimal(100), cashTips: new prisma.Prisma.Decimal(50) },
  });
  const anyStaff = await prisma.staff.findFirstOrThrow({ where: { siteId } });
  await prisma.tipAllocation.create({
    data: { potId: pot.id, staffId: anyStaff.id, amount: new prisma.Prisma.Decimal(10), rationale: 'seed' },
  });
}

main().finally(async () => prisma.$disconnect());

