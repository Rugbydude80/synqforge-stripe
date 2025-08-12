import { Module, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { JwtMiddleware } from './jwt.middleware.js';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(JwtMiddleware).forRoutes('*');
  }
}

