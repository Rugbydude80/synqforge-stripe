import { Body, Controller, Get, Post } from '@nestjs/common';
import { PrismaService } from '../../prisma.service.js';

@Controller()
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('rules')
  async getRules() {
    return this.prisma.ruleSet.findMany({ orderBy: { publishedAt: 'desc' }, take: 1 });
  }

  @Post('rules')
  async saveRules(@Body() body: { siteId: string; version: number; rules: any; publishedAt?: string }) {
    return this.prisma.ruleSet.create({ data: { ...body, publishedAt: body.publishedAt ? new Date(body.publishedAt) : new Date() } as any });
  }

  @Get('policies')
  async getPolicies() {
    return this.prisma.policy.findMany({});
  }

  @Post('policies')
  async savePolicy(@Body() body: any) {
    return this.prisma.policy.create({ data: { ...body, publishedAt: new Date(body.publishedAt || Date.now()) } });
  }
}

