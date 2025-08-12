import { Injectable, NestMiddleware } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;

  async use(req: any, res: any, next: () => void) {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : undefined;
    if (!token) return next();
    try {
      const jwksUrl = process.env.SUPABASE_JWKS_URL!;
      const audience = process.env.JWT_AUDIENCE || 'authenticated';
      const issuer = process.env.JWT_ISSUER || 'supabase';
      this.jwks = this.jwks || createRemoteJWKSet(new URL(jwksUrl));
      const { payload } = await jwtVerify(token, this.jwks, {
        audience,
        issuer,
      });
      req.user = {
        userId: payload.sub,
        siteIds: payload['site_ids'] || [],
      };
    } catch (e) {
      // ignore; unauthenticated
    }
    next();
  }
}

