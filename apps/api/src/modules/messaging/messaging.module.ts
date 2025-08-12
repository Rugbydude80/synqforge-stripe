import { Module } from '@nestjs/common';
import { MessagingController } from './messaging.controller.js';
import { PrismaService } from '../../prisma.service.js';
import { MessagingService } from './messaging.service.js';

@Module({
  controllers: [MessagingController],
  providers: [PrismaService, MessagingService],
  exports: [MessagingService],
})
export class MessagingModule {}

