import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtStrategy } from './jwt.strategy';

const GOOD_SECRET = 'x'.repeat(40);

describe('JwtStrategy', () => {
  let prisma: DeepMockProxy<PrismaService>;
  let cache: { get: jest.Mock; set: jest.Mock };
  const ORIGINAL_SECRET = process.env.JWT_SECRET;

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    process.env.JWT_SECRET = GOOD_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = ORIGINAL_SECRET;
    jest.clearAllMocks();
  });

  const make = () => new JwtStrategy(prisma, cache as any);

  describe('constructor', () => {
    it('throws when JWT_SECRET is missing or shorter than 32 chars', () => {
      process.env.JWT_SECRET = '';
      expect(() => make()).toThrow(/JWT_SECRET/);
      process.env.JWT_SECRET = 'too-short';
      expect(() => make()).toThrow(/at least 32 characters/);
    });
  });

  describe('validate', () => {
    it('rejects a payload with no subject', async () => {
      await expect(make().validate({} as any)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects when the session (jti) is expired or revoked', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue(null);
      await expect(
        make().validate({ sub: 'u1', email: 'e', role: 'USER', username: 'u', jti: 'sess-1' } as any),
      ).rejects.toThrow(/Session expired or revoked/);
    });

    it('resolves the role from cache without a DB user lookup when the session is valid', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: 'sess-1' });
      cache.get.mockResolvedValue({ role: 'ADMIN', managedCompanyId: null });

      const result = await make().validate({ sub: 'u1', email: 'e@x', role: 'USER', username: 'u', jti: 'sess-1' } as any);

      expect(result).toMatchObject({ id: 'u1', role: 'ADMIN', jti: 'sess-1', managedCompanyId: null });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to the DB and populates the cache on a cache miss', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: 'sess-1' });
      cache.get.mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ role: 'MODERATOR', managedCompanyId: 'co-1' });

      const result = await make().validate({ sub: 'u1', email: 'e', role: 'USER', username: 'u', jti: 'sess-1' } as any);

      expect(result).toMatchObject({ role: 'MODERATOR', managedCompanyId: 'co-1' });
      expect(cache.set).toHaveBeenCalledWith('user-meta:u1', { role: 'MODERATOR', managedCompanyId: 'co-1' }, expect.any(Number));
    });

    it('rejects when the session is valid but the user no longer exists', async () => {
      (prisma.session.findFirst as jest.Mock).mockResolvedValue({ id: 'sess-1' });
      cache.get.mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        make().validate({ sub: 'u1', email: 'e', role: 'USER', username: 'u', jti: 'sess-1' } as any),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('trusts the payload directly for a legacy token with no jti (no session / DB calls)', async () => {
      const result = await make().validate({
        sub: 'u1', email: 'e@x', role: 'ADMIN', username: 'u', managedCompanyId: 'co-9',
      } as any);

      expect(result).toEqual({ id: 'u1', email: 'e@x', role: 'ADMIN', username: 'u', managedCompanyId: 'co-9', jti: null });
      expect(prisma.session.findFirst).not.toHaveBeenCalled();
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
