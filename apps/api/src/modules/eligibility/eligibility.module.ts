import { Module } from '@nestjs/common';
import { EligibilityService } from './eligibility.service.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  providers: [EligibilityService, PrismaService],
  exports: [EligibilityService],
})
export class EligibilityModule {}

