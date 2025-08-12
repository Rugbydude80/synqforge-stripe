import { Injectable } from '@nestjs/common';

@Injectable()
export class MessagingService {
  async sendPush(userId: string, title: string, body: string) {
    // stub for FCM
    return { ok: true };
  }
  async sendSms(to: string, body: string) {
    // stub for Twilio
    return { ok: true };
  }
}

