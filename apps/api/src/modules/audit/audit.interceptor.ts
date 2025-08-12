import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../../prisma.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const actorId = req.user?.userId;
    return next.handle().pipe(
      tap(async (result) => {
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
          await this.prisma.auditEvent.create({
            data: {
              actorType: actorId ? 'user' : 'system',
              actorId,
              eventType: `${req.method} ${req.path}`,
              entity: 'http_request',
              entityId: 'n/a',
              details: { body: req.body ? 'omitted' : undefined },
            },
          });
        }
      }),
    );
  }
}

