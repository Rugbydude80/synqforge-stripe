import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Configure a sliding window rate limiter for AI and ingest endpoints.
// Falls back to an in-memory token bucket if Upstash is not configured.
let aiLimiter: Ratelimit | null = null;
let ingestLimiter: Ratelimit | null = null;
let memoryBuckets: Record<string, { tokens: number; resetAt: number }> = {};

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

function initLimiters() {
  const r = getRedis();
  if (r) {
    aiLimiter = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(30, '1 m') });
    ingestLimiter = new Ratelimit({ redis: r, limiter: Ratelimit.slidingWindow(30, '1 m') });
  }
}
initLimiters();

async function limitWithFallback(key: string, limit: number): Promise<boolean> {
  if (aiLimiter) {
    const { success } = await aiLimiter.limit(key);
    return success;
  }
  // In-memory 60s bucket
  const now = Date.now();
  const rec = memoryBuckets[key] || { tokens: limit, resetAt: now + 60_000 };
  if (now > rec.resetAt) {
    rec.tokens = limit - 1;
    rec.resetAt = now + 60_000;
    memoryBuckets[key] = rec;
    return true;
  }
  if (rec.tokens > 0) {
    rec.tokens -= 1;
    memoryBuckets[key] = rec;
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  // Security headers on all responses
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self' https://openrouter.ai https://api.openai.com https://*.supabase.co https://*.ably.io https://*.upstash.io",
    "font-src 'self' data:",
    "frame-ancestors 'none'"
  ].join('; ');

  // Rate limit AI endpoints
  if (request.nextUrl.pathname.startsWith('/api/ai/')) {
    // Use client IP for rate limiting; fall back to anonymous
    const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
    const ok = await limitWithFallback(`ai:${ip}`, 30);
    if (!ok) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }
  // Rate limit ingest endpoints
  if (request.nextUrl.pathname.startsWith('/api/ingest/')) {
    const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
    const ok = await limitWithFallback(`ingest:${ip}`, 30);
    if (!ok) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

  // Protect pages by requiring auth (allow public assets and auth routes)
  const protectedPaths = [
    '/app',
    '/analytics',
    '/backlog',
    '/epics',
    '/retrospectives',
    '/sprint',
    '/sprints',
    '/account',
    '/ai'
  ];
  const isProtected = protectedPaths.some((p) => request.nextUrl.pathname.startsWith(p));

  const response = await updateSession(request);
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'interest-cohort=()');
  response.headers.set('Content-Security-Policy', csp);
  if (isProtected) {
    // Allow Demo Mode unauthenticated viewing of analytics/backlog/epics/sprint pages
    // so users can explore without auth.
    const publicWhenDemo = ['/analytics', '/backlog', '/epics', '/sprint', '/sprints', '/retrospectives'];
    const matchesPublicWhenDemo = publicWhenDemo.some((p) => request.nextUrl.pathname.startsWith(p));
    const hasSession = request.cookies.get('sb-access-token') || request.cookies.get('sb:token');
    if (!hasSession && !matchesPublicWhenDemo) {
      const url = request.nextUrl.clone();
      url.pathname = '/signin';
      return NextResponse.redirect(url);
    }
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images - .svg, .png, .jpg, .jpeg, .gif, .webp
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'
  ]
};
