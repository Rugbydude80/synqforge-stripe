import { Module } from '@nestjs/common';
import { AuditInterceptor } from './audit.interceptor.js';
import { PrismaService } from '../../prisma.service.js';

@Module({ providers: [AuditInterceptor, PrismaService], exports: [AuditInterceptor] })
export class AuditModule {}

