import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/utils/supabase/middleware';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Configure a sliding window rate limiter for AI endpoints.
// Each IP is allowed up to 20 requests per minute across the /api/ai/* paths.
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});
const aiLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '1 m')
});

export async function middleware(request: NextRequest) {
  // Rate limit AI endpoints
  if (request.nextUrl.pathname.startsWith('/api/ai/')) {
    // Use client IP for rate limiting; fall back to anonymous
    const ip = request.ip ?? request.headers.get('x-forwarded-for') ?? 'anonymous';
    const { success } = await aiLimiter.limit(ip as string);
    if (!success) {
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
  if (isProtected) {
    // Allow Demo Mode unauthenticated viewing of analytics/backlog/epics/sprint pages
    // so users can explore without auth.
    const publicWhenDemo = ['/analytics', '/backlog', '/epics', '/sprint', '/sprints'];
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
