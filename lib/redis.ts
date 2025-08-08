import { Redis } from '@upstash/redis';

/**
 * Redis client configured for Upstash.  This client is used for
 * caching AI generation responses and for rate limiting.  Be sure to
 * set the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
 * environment variables in your Vercel/Supabase project.  These
 * variables must point at your Upstash Redis instance.  See
 * https://upstash.com/docs for details.
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});