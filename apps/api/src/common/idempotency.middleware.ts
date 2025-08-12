import { Injectable, NestMiddleware } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyMiddleware implements NestMiddleware {
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  async use(req: any, res: any, next: () => void) {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const key = req.headers['idempotency-key'];
      if (typeof key === 'string' && key.length > 0) {
        const stored = await this.redis.get(`idem:${key}`);
        if (stored) {
          res.setHeader('X-Idempotent-Replay', '1');
          res.status(200).send(JSON.parse(stored));
          return;
        }
        const originalJson = res.json.bind(res);
        res.json = (body: any) => {
          this.redis.setex(`idem:${key}`, 3600, JSON.stringify(body)).catch(() => {});
          return originalJson(body);
        };
      }
    }
    next();
  }
}

