import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { IdempotencyMiddleware } from './common/idempotency.middleware.js';
import { AuditInterceptor } from './modules/audit/audit.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(new IdempotencyMiddleware().use as any);
  app.useGlobalInterceptors(new AuditInterceptor((app as any).get?.('PrismaService')));

  const config = new DocumentBuilder()
    .setTitle('Compliance Rota API')
    .setDescription('Compliance-first rota API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(4000);
}

bootstrap();

