import { Module } from '@nestjs/common';
import { RotaController } from './rota.controller.js';
import { PrismaService } from '../../prisma.service.js';

@Module({
  controllers: [RotaController],
  providers: [PrismaService],
})
export class RotaModule {}

