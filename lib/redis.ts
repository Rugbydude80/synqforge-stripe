type Primitive = string | number | boolean;

export type RedisClient = {
  command: (cmd: string, ...args: Primitive[]) => Promise<any>;
  get: (key: string) => Promise<string | null>;
  set: (
    key: string,
    value: Primitive,
    options?: { ex?: number; px?: number }
  ) => Promise<'OK' | null>;
  del: (key: string) => Promise<number>;
};

function ensureEnv(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN in environment.'
    );
  }
  return { url, token };
}

export function getRedisClient(): RedisClient {
  const { url, token } = ensureEnv();

  async function call(command: string, ...args: Primitive[]) {
    const path = [command, ...args.map((a) => encodeURIComponent(String(a)))].join(
      '/'
    );
    const response = await fetch(`${url}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Upstash Redis error: ${response.status} ${text}`);
    }

    const data = await response.json().catch(() => null as any);
    return data?.result ?? null;
  }

  return {
    command: call,
    async get(key: string) {
      return call('GET', key);
    },
    async set(
      key: string,
      value: Primitive,
      options?: { ex?: number; px?: number }
    ) {
      if (options?.ex) return call('SET', key, value, 'EX', options.ex);
      if (options?.px) return call('SET', key, value, 'PX', options.px);
      return call('SET', key, value);
    },
    async del(key: string) {
      return call('DEL', key);
    }
  };
}


