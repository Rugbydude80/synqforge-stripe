import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('magic-link')
  async magicLink(@Body() body: { email: string }) {
    return this.authService.sendMagicLink(body.email);
  }

  @ApiBearerAuth()
  @Get('/me')
  async me(@Req() req: any) {
    return req.user || {};
  }
}

