import { Redis } from '@upstash/redis';

/**
 * Thin wrapper that provides a Redis-like interface. If Upstash env vars are
 * missing, falls back to a minimal in-memory store so Demo Mode never crashes.
 */
type RedisLike = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any, opts?: { ex?: number }) => Promise<'OK' | null>;
  setex: (key: string, ttlSeconds: number, value: any) => Promise<'OK' | null>;
};

function createRedis(): RedisLike {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const client = new Redis({ url, token });
    return {
      get: (k) => client.get(k),
      set: (k, v, opts) => client.set(k, v, opts as any),
      setex: (k, ttl, v) => client.set(k, v, { ex: ttl } as any)
    } as RedisLike;
  }
  const store = new Map<string, { value: any; expiresAt?: number }>();
  return {
    async get(key: string) {
      const rec = store.get(key);
      if (!rec) return null as any;
      if (rec.expiresAt && Date.now() > rec.expiresAt) {
        store.delete(key);
        return null as any;
      }
      return rec.value;
    },
    async set(key: string, value: any, opts?: { ex?: number }) {
      const expiresAt = opts?.ex ? Date.now() + opts.ex * 1000 : undefined;
      store.set(key, { value, expiresAt });
      return 'OK';
    },
    async setex(key: string, ttlSeconds: number, value: any) {
      store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      return 'OK';
    }
  } as RedisLike;
}

export const redis: RedisLike = createRedis();