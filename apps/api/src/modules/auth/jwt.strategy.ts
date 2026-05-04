import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
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

    // If token has a session ID (jti), verify session and re-read role/managedCompanyId from DB
    // so role changes take effect without requiring a re-login
    if (payload.jti) {
      const session = await this.prisma.session.findFirst({
        where: { id: payload.jti, userId: payload.sub, expiresAt: { gt: new Date() } },
        select: { id: true },
      });
      if (!session) throw new UnauthorizedException('Session expired or revoked');

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { role: true, managedCompanyId: true },
      });
      if (!user) throw new UnauthorizedException();

      return { id: payload.sub, email: payload.email, role: user.role, username: payload.username, managedCompanyId: user.managedCompanyId ?? null, jti: payload.jti };
    }

    return { id: payload.sub, email: payload.email, role: payload.role, username: payload.username, managedCompanyId: payload.managedCompanyId ?? null, jti: payload.jti ?? null };
  }
}
