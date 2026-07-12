import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { CACHE_MANAGER, Cache } from '@nestjs/cache-manager';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
} from './auth.dto';
import { MailService } from '../mail/mail.service';
import { randomBytes, createHash } from 'crypto';

/** Version string for T&C / Privacy Policy consent records — update when docs change */
const CONSENT_VERSION = '2026-05-05';

/** Constant-time hash for password reset tokens — prevents timing attacks on DB lookup */
function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function hashVerifyToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

interface OAuthProfile {
  provider: string;
  providerId: string;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  private readonly COOLDOWN_MS = 5 * 60 * 1000;

  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: { equals: normalizedEmail, mode: 'insensitive' } }, { username: dto.username }] },
    });
    if (existing) {
      throw new ConflictException(
        existing.email.toLowerCase() === normalizedEmail
          ? 'Email already in use'
          : 'Username already taken',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const now = new Date();
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: normalizedEmail,
        passwordHash,
        termsAcceptedAt: now,
        termsVersion: CONSENT_VERSION,
        privacyAcceptedAt: now,
        privacyVersion: CONSENT_VERSION,
      },
    });

    const token = randomBytes(32).toString('hex');
    const tokenHash = hashVerifyToken(token);
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24 hours

    await this.prisma.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    try {
      await this.mail.sendVerificationEmail(user.email, token);
    } catch {
      // Mail failures are non-fatal — user can request a resend
    }

    return { message: 'Registration successful. Please check your email to verify your account.' };
  }

  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.toLowerCase().trim();
    // Case-insensitive lookup: existing users may have registered before email normalization was enforced
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
      select: {
        id: true, email: true, role: true, username: true,
        passwordHash: true, managedCompanyId: true, emailVerified: true,
      },
    });
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.emailVerified) {
      throw new ForbiddenException('Please verify your email address before logging in.');
    }

    return this.signToken(user.id, user.email, user.role, user.username, user.managedCompanyId);
  }

  async verifyEmail(token: string) {
    const tokenHash = hashVerifyToken(token);
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.expiresAt < new Date() || record.usedAt) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    const user = await this.prisma.user.update({
      where: { id: record.userId },
      data: { emailVerified: true },
      select: { id: true, email: true, role: true, username: true, managedCompanyId: true },
    });
    await this.prisma.emailVerificationToken.delete({ where: { id: record.id } });

    // Send welcome email (non-fatal)
    this.mail.sendWelcomeEmail(user.email, user.username).catch(() => {});

    return this.signToken(user.id, user.email, user.role, user.username, user.managedCompanyId);
  }

  async resendVerification(email: string) {
    const TARGET_RESPONSE_MS = 500;
    const startedAt = Date.now();

    const normalizedEmail = email.toLowerCase().trim();
    const cacheKey = `auth:rv:${normalizedEmail}`;
    const rateLimited = !!(await this.cache.get(cacheKey));

    // Case-insensitive: existing users may have uppercase emails from before normalization was enforced
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if (user && !user.emailVerified && !rateLimited) {
      await this.cache.set(cacheKey, 1, this.COOLDOWN_MS);

      const token = randomBytes(32).toString('hex');
      const tokenHash = hashVerifyToken(token);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24);

      await this.prisma.emailVerificationToken.deleteMany({ where: { userId: user.id } });
      await this.prisma.emailVerificationToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      try {
        await this.mail.sendVerificationEmail(user.email, token);
      } catch {
        // Non-fatal
      }
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed < TARGET_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, TARGET_RESPONSE_MS - elapsed));
    }

    return { message: 'If that email exists and is unverified, a new verification link was sent.' };
  }

  async logout(userId: string, jti: string) {
    await this.prisma.session.deleteMany({ where: { id: jti, userId } });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    // Constant-time response: always target ~500 ms regardless of whether the email exists
    const TARGET_RESPONSE_MS = 500;
    const startedAt = Date.now();

    const normalizedEmail = dto.email.toLowerCase().trim();

    // Per-email rate limit: 1 request per 5 minutes (Redis-backed so survives restarts/scaling)
    const cacheKey = `auth:fp:${normalizedEmail}`;
    const rateLimited = !!(await this.cache.get(cacheKey));

    // Case-insensitive: existing users may have uppercase emails from before normalization was enforced
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });

    if (user && !rateLimited) {
      await this.cache.set(cacheKey, 1, this.COOLDOWN_MS);

      const token = randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

      await this.prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt },
      });

      try {
        await this.mail.sendPasswordResetEmail(user.email, token);
      } catch {
        // Non-fatal — don't reveal send failure to client
      }
    }

    // Equalize response time to prevent timing-based email enumeration
    const elapsed = Date.now() - startedAt;
    if (elapsed < TARGET_RESPONSE_MS) {
      await new Promise((r) => setTimeout(r, TARGET_RESPONSE_MS - elapsed));
    }

    return { message: 'If that email exists, a reset link was sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashResetToken(dto.token);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });

    if (!record || record.expiresAt < new Date() || record.usedAt) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    // Mark token as used before updating password to prevent double-use
    await this.prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
    await this.prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });
    await this.prisma.passwordResetToken.delete({ where: { id: record.id } });

    return { message: 'Password updated successfully' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) throw new NotFoundException('User not found');

    const valid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Current password is incorrect');

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    return { message: 'Password changed successfully' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        displayName: true,
        role: true,
        managedCompanyId: true,
        preferredCurrency: true,
        timezone: true,
        timeFormat: true,
        defaultTaxRate: true,
        avatarUrl: true,
        bio: true,
        statsSettings: true,
        shippingCountry: true,
        createdAt: true,
        termsAcceptedAt: true,
        onboardingCompletedAt: true,
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...user, needsConsent: !user.termsAcceptedAt };
  }

  async setOnboarding(userId: string, completed: boolean) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompletedAt: completed ? new Date() : null },
      select: { id: true, onboardingCompletedAt: true },
    });
  }

  async saveConsent(userId: string) {
    const now = new Date();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        termsAcceptedAt: now,
        termsVersion: CONSENT_VERSION,
        privacyAcceptedAt: now,
        privacyVersion: CONSENT_VERSION,
      },
    });
  }

  async oauthCallback(profile: OAuthProfile) {
    const existingAccount = await this.prisma.account.findUnique({
      where: { provider_providerId: { provider: profile.provider, providerId: profile.providerId } },
      include: { user: true },
    });

    if (existingAccount) {
      await this.prisma.account.update({
        where: { id: existingAccount.id },
        data: { accessToken: profile.accessToken, refreshToken: profile.refreshToken },
      });
      const u = existingAccount.user;
      return this.signToken(u.id, u.email, u.role, u.username, u.managedCompanyId);
    }

    if (profile.email) {
      const userByEmail = await this.prisma.user.findUnique({ where: { email: profile.email } });
      if (userByEmail) {
        await this.prisma.account.create({
          data: {
            userId: userByEmail.id,
            provider: profile.provider,
            providerId: profile.providerId,
            accessToken: profile.accessToken,
            refreshToken: profile.refreshToken,
          },
        });
        return this.signToken(userByEmail.id, userByEmail.email, userByEmail.role, userByEmail.username, userByEmail.managedCompanyId);
      }
    }

    const baseUsername = this.generateUsername(profile.displayName ?? profile.email ?? profile.provider);
    const username = await this.uniqueUsername(baseUsername);

    const newUser = await this.prisma.user.create({
      data: {
        username,
        email: profile.email ?? `${profile.provider}_${profile.providerId}@noemail.luxgrimoire.com`,
        emailVerified: !!profile.email,
        displayName: profile.displayName ?? null,
        avatarUrl: profile.avatarUrl ?? null,
        accounts: {
          create: {
            provider: profile.provider,
            providerId: profile.providerId,
            accessToken: profile.accessToken,
            refreshToken: profile.refreshToken,
          },
        },
      },
    });

    // Send welcome email to new OAuth users (non-fatal)
    if (profile.email) {
      this.mail.sendWelcomeEmail(newUser.email, newUser.username).catch(() => {});
    }

    return this.signToken(newUser.id, newUser.email, newUser.role, newUser.username, null);
  }

  private generateUsername(source: string): string {
    return source
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20)
      || 'user';
  }

  private async uniqueUsername(base: string): Promise<string> {
    let candidate = base;
    let attempt = 0;
    while (true) {
      const exists = await this.prisma.user.findUnique({ where: { username: candidate } });
      if (!exists) return candidate;
      attempt++;
      const suffix = String(attempt);
      candidate = base.slice(0, 20 - suffix.length) + suffix;
    }
  }

  private async signToken(id: string, email: string, role: string, username: string, managedCompanyId?: string | null) {
    const expiresInMs = this.parseExpiresIn(process.env.JWT_EXPIRES_IN ?? '7d');
    const session = await this.prisma.session.create({
      data: {
        userId: id,
        token: randomBytes(32).toString('hex'), // opaque token for reference
        expiresAt: new Date(Date.now() + expiresInMs),
      },
    });

    const payload = { sub: id, email, role, username, managedCompanyId: managedCompanyId ?? null, jti: session.id };
    const token = this.jwt.sign(payload);
    return { accessToken: token, userId: id, role, username, managedCompanyId: managedCompanyId ?? null };
  }

  private parseExpiresIn(val: string): number {
    const match = val.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 24 * 60 * 60 * 1000;
    const n = parseInt(match[1], 10);
    const unit = match[2];
    const ms: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
    return n * (ms[unit] ?? 1000);
  }
}
