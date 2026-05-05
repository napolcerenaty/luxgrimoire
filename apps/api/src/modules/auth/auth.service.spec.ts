import { ConflictException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cache } from '@nestjs/cache-manager';
import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

jest.mock('bcryptjs', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

describe('AuthService', () => {
  let service: AuthService;
  let prisma: DeepMockProxy<PrismaService>;
  let jwtService: DeepMockProxy<JwtService>;
  let mailService: DeepMockProxy<MailService>;
  let cacheStore: Map<string, unknown>;
  let cacheManager: { get: jest.Mock; set: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    jwtService = mockDeep<JwtService>();
    mailService = mockDeep<MailService>();
    mailService.sendVerificationEmail.mockResolvedValue(undefined);

    // Redis cache mock backed by a local Map so rate-limit state persists within a test
    cacheStore = new Map();
    cacheManager = {
      get: jest.fn().mockImplementation((key: string) => Promise.resolve(cacheStore.get(key) ?? null)),
      set: jest.fn().mockImplementation((key: string, value: unknown) => {
        cacheStore.set(key, value);
        return Promise.resolve();
      }),
    };

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as unknown as JwtService,
      mailService as unknown as MailService,
      cacheManager as unknown as Cache,
    );
  });

  // ─── register ────────────────────────────────────────────────────────────────

  describe('register', () => {
    it('should throw ConflictException if email already exists', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '1', email: 'test@test.com' } as any);
      await expect(
        service.register({ email: 'test@test.com', username: 'new', password: 'pass123', termsAccepted: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if username already taken', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: '1', email: 'other@test.com' } as any);
      await expect(
        service.register({ email: 'new@test.com', username: 'taken', password: 'pass123', termsAccepted: true }),
      ).rejects.toThrow(ConflictException);
    });

    it('should create user and return message on success', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'new@test.com', role: 'USER', username: 'newuser' } as any);
      prisma.emailVerificationToken.create.mockResolvedValue({} as any);

      const result = await service.register({ email: 'new@test.com', username: 'newuser', password: 'Pass1234!', termsAccepted: true });

      expect(result.message).toBeDefined();
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ email: 'new@test.com', username: 'newuser' }) }),
      );
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login({ email: 'x@x.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password invalid', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: 'hash', email: 'x@x.com', role: 'USER', username: 'u', managedCompanyId: null, emailVerified: true } as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ email: 'x@x.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('should return accessToken on valid credentials', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: '1', passwordHash: 'hash', email: 'x@x.com', role: 'USER', username: 'u', managedCompanyId: null, emailVerified: true } as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      prisma.session.create.mockResolvedValue({ id: 'sess1' } as any);
      jwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login({ email: 'x@x.com', password: 'correct' });
      expect(result.accessToken).toBe('jwt-token');
    });
  });

  // ─── forgotPassword ──────────────────────────────────────────────────────────

  describe('forgotPassword', () => {
    it('should always return generic message (no user found)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const result = await service.forgotPassword({ email: 'noone@test.com' });
      expect(result.message).toContain('If that email exists');
    });

    it('should always return generic message (user found)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({} as any);
      const result = await service.forgotPassword({ email: 'user@test.com' });
      expect(result.message).toContain('If that email exists');
    });

    it('should store tokenHash (not plaintext token) in DB', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({} as any);

      await service.forgotPassword({ email: 'user@test.com' });

      const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
      expect(createCall.data).toHaveProperty('tokenHash');
      expect(createCall.data).not.toHaveProperty('token');
      // tokenHash should be a 64-char hex string (sha256)
      expect(createCall.data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should NOT create token if per-email rate limit hit (called twice within 5 min)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({} as any);

      await service.forgotPassword({ email: 'user@test.com' });
      await service.forgotPassword({ email: 'user@test.com' });

      // Token should only be created once, not twice
      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });

    it('should treat emails case-insensitively for rate limiting', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      prisma.passwordResetToken.deleteMany.mockResolvedValue({ count: 0 });
      prisma.passwordResetToken.create.mockResolvedValue({} as any);

      await service.forgotPassword({ email: 'User@Test.COM' });
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' } as any);
      await service.forgotPassword({ email: 'user@test.com' }); // same normalized email

      expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
    });
  });

  // ─── resetPassword ───────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('should throw BadRequestException if token not found in DB', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue(null);
      await expect(service.resetPassword({ token: 'invalid', password: 'NewPass1!' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if token is expired', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1', userId: 'u1', tokenHash: 'hash', usedAt: null,
        expiresAt: new Date(Date.now() - 1000), // expired
      } as any);
      await expect(service.resetPassword({ token: 'anytoken', password: 'NewPass1!' })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if token already used (usedAt set)', async () => {
      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1', userId: 'u1', tokenHash: 'hash', usedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000), // still valid time
      } as any);
      await expect(service.resetPassword({ token: 'anytoken', password: 'NewPass1!' })).rejects.toThrow(BadRequestException);
    });

    it('should update password and delete token on valid token', async () => {
      const plainToken = 'a'.repeat(64);
      const tokenHash = hashToken(plainToken);

      prisma.passwordResetToken.findUnique.mockResolvedValue({
        id: 'r1', userId: 'u1', tokenHash, usedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
      } as any);
      prisma.passwordResetToken.update.mockResolvedValue({} as any);
      prisma.user.update.mockResolvedValue({} as any);
      prisma.passwordResetToken.delete.mockResolvedValue({} as any);

      const result = await service.resetPassword({ token: plainToken, password: 'NewPass1!' });

      expect(result.message).toBe('Password updated successfully');
      // Should mark as used before updating password
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ usedAt: expect.any(Date) }) }),
      );
      expect(prisma.passwordResetToken.delete).toHaveBeenCalledWith({ where: { id: 'r1' } });
    });

    it('should look up token by its SHA-256 hash, not plaintext', async () => {
      const plainToken = 'mysecrettoken12345';
      const expectedHash = hashToken(plainToken);

      prisma.passwordResetToken.findUnique.mockResolvedValue(null); // not found → throws

      await expect(service.resetPassword({ token: plainToken, password: 'x' })).rejects.toThrow();

      expect(prisma.passwordResetToken.findUnique).toHaveBeenCalledWith({
        where: { tokenHash: expectedHash },
      });
    });
  });
});
