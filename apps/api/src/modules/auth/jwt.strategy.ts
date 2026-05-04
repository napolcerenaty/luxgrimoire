import { Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../../prisma/prisma.service';

interface UserMeta { role: string; managedCompanyId: string | null }

const USER_META_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32) {
      throw new Error(
        'JWT_SECRET environment variable is required and must be at least 32 characters long',
      );
    }
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: any) => {
          // Cookie extraction (primary - production browser clients)
          const cookieName = process.env.JWT_COOKIE_NAME ?? 'jwt';
          const cookies = req?.cookies;
          if (cookies?.[cookieName]) return cookies[cookieName];
          return null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(), // Bearer fallback (Swagger/CLI/mobile)
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: { sub: string; email: string; role: string; username: string; managedCompanyId?: string | null; jti?: string }) {
    if (!payload.sub) throw new UnauthorizedException();

    if (payload.jti) {
      // 1. Verify session is still valid (always DB — session can be revoked)
      const session = await this.prisma.session.findFirst({
        where: { id: payload.jti, userId: payload.sub, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!session) throw new UnauthorizedException('Session expired or revoked');

      // 2. Resolve role from cache (fast path) or DB (fallback, then populate cache)
      const cacheKey = `user-meta:${payload.sub}`;
      let meta = await this.cacheManager.get<UserMeta>(cacheKey);
      if (!meta) {
        const user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: { role: true, managedCompanyId: true },
        });
        if (!user) throw new UnauthorizedException();
        meta = { role: user.role, managedCompanyId: user.managedCompanyId ?? null };
        await this.cacheManager.set(cacheKey, meta, USER_META_TTL_MS);
      }

      return { id: payload.sub, email: payload.email, role: meta.role, username: payload.username, managedCompanyId: meta.managedCompanyId, jti: payload.jti };
    }

    return { id: payload.sub, email: payload.email, role: payload.role, username: payload.username, managedCompanyId: payload.managedCompanyId ?? null, jti: payload.jti ?? null };
  }
}
