import { Body, Controller, Post } from '@nestjs/common';
import { MessagingService } from './messaging.service.js';

@Controller('webhooks/twilio')
export class MessagingController {
  constructor(private svc: MessagingService) {}

  @Post('sms-status')
  async status(@Body() body: any) {
    return { ok: true };
  }

  @Post('inbound')
  async inbound(@Body() body: any) {
    return { ok: true };
  }
}

