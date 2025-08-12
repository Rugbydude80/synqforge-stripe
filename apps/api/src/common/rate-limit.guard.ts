import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const key = `rl:${ip}`;
    const ttl = 60;
    const max = 60;
    const tx = this.redis.multi();
    tx.incr(key);
    tx.expire(key, ttl);
    const [count] = (await tx.exec()) ?? [];
    const value = Array.isArray(count) ? (count[1] as number) : 0;
    return value <= max;
  }
}

