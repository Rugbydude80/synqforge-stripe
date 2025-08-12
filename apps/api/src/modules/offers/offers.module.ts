import { Module } from '@nestjs/common';
import { OffersController } from './offers.controller.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [OffersController],
  providers: [PrismaService],
})
export class OffersModule {}

