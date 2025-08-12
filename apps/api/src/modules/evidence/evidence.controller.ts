import { Controller, Get, Query } from '@nestjs/common';
import crypto from 'crypto';

@Controller('evidence')
export class EvidenceController {
  @Get('pack')
  async pack(@Query('type') type: string, @Query('period') period: string, @Query('site') site: string) {
    const manifest = { type, period, site, generatedAt: new Date().toISOString() };
    const digest = crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    return { manifest, digest };
  }
}

