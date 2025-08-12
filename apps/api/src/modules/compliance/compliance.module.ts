import { Module } from '@nestjs/common';
import { TipsController } from './tips.controller.js';
import { HolidayController } from './holiday.controller.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [TipsController, HolidayController],
  providers: [PrismaService],
})
export class ComplianceModule {}

