import { Injectable } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class AuthService {
  async sendMagicLink(email: string) {
    // Placeholder: call Supabase auth API to send magic link
    // In dev, we just return ok
    return { ok: true, email };
  }
}

