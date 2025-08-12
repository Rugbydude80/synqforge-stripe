import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from './prisma.service.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RotaModule } from './modules/rota/rota.module.js';
import { OffersModule } from './modules/offers/offers.module.js';
import { EligibilityModule } from './modules/eligibility/eligibility.module.js';
import { MessagingModule } from './modules/messaging/messaging.module.js';
import { ComplianceModule } from './modules/compliance/compliance.module.js';
import { EvidenceModule } from './modules/evidence/evidence.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { AuditModule } from './modules/audit/audit.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    RotaModule,
    OffersModule,
    EligibilityModule,
    MessagingModule,
    ComplianceModule,
    EvidenceModule,
    AdminModule,
    AuditModule,
  ],
  providers: [PrismaService],
})
export class AppModule {}

