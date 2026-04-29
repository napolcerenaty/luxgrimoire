import { Test, TestingModule } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { createHash, randomBytes } from 'crypto';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(t: string) {
  return createHash('sha256').update(t).digest('hex');
}

/** Unique email per test run to avoid cross-test conflicts */
let _seq = 0;
function email(prefix = 'user') {
  return `${prefix}_${Date.now()}_${++_seq}@e2e.test`;
}
function username(prefix = 'user') {
  return `${prefix}_${Date.now()}_${_seq}`;
}

// ─── App bootstrap ────────────────────────────────────────────────────────────

let app: NestFastifyApplication;
let prisma: PrismaService;
let httpServer: ReturnType<typeof app.getHttpServer>;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api');

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = moduleFixture.get(PrismaService);
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
});

/** Clean slate for each test — removes only auth-related rows */
async function cleanup() {
  await prisma.passwordResetToken.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  beforeEach(cleanup);

  it('201 — returns accessToken and user info on success', async () => {
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email(), username: username(), password: 'Password1!' })
      .expect(201);

    expect(res.body).toMatchObject({
      accessToken: expect.any(String),
      userId: expect.any(String),
      role: 'USER',
    });
    expect(res.body.accessToken.split('.').length).toBe(3); // valid JWT
  });

  it('409 — duplicate email', async () => {
    const e = email();
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: e, username: username('first'), password: 'Password1!' });

    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: e, username: username('second'), password: 'Password1!' })
      .expect(409);

    expect(res.body.message).toMatch(/email/i);
  });

  it('409 — duplicate username', async () => {
    const u = username();
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email('first'), username: u, password: 'Password1!' });

    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email('second'), username: u, password: 'Password1!' })
      .expect(409);

    expect(res.body.message).toMatch(/username/i);
  });

  it('400 — missing required fields', async () => {
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email() })
      .expect(400);
  });
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  let testEmail: string;
  const testPassword = 'Password1!';

  beforeEach(async () => {
    await cleanup();
    testEmail = email('login');
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: testEmail, username: username('login'), password: testPassword });
  });

  it('201 — returns accessToken on valid credentials', async () => {
    const res = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: testEmail, password: testPassword })
      .expect(201);

    expect(res.body.accessToken).toBeDefined();
  });

  it('401 — wrong password', async () => {
    await request(httpServer)
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'wrong-password' })
      .expect(401);
  });

  it('401 — email not registered', async () => {
    await request(httpServer)
      .post('/api/auth/login')
      .send({ email: 'nobody@e2e.test', password: testPassword })
      .expect(401);
  });
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  let token: string;
  let testEmail: string;
  let testUsername: string;

  beforeEach(async () => {
    await cleanup();
    testEmail = email('me');
    testUsername = username('me');
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: testEmail, username: testUsername, password: 'Password1!' });
    token = res.body.accessToken;
  });

  it('200 — returns user profile with valid token', async () => {
    const res = await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ email: testEmail, username: testUsername, role: 'USER' });
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('401 — no token', async () => {
    await request(httpServer).get('/api/auth/me').expect(401);
  });

  it('401 — invalid/garbage token', async () => {
    await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer garbage.token.here')
      .expect(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  let token: string;

  beforeEach(async () => {
    await cleanup();
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email('logout'), username: username('logout'), password: 'Password1!' });
    token = res.body.accessToken;
  });

  it('204 — invalidates session (subsequent /me returns 401)', async () => {
    await request(httpServer)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    // Token's jti (session) has been deleted — /me should now fail
    await request(httpServer)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });
});

// ─── POST /api/auth/change-password ──────────────────────────────────────────

describe('POST /api/auth/change-password', () => {
  let token: string;
  let testEmail: string;
  const oldPassword = 'OldPass1!';
  const newPassword = 'NewPass2@';

  beforeEach(async () => {
    await cleanup();
    testEmail = email('chpw');
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: testEmail, username: username('chpw'), password: oldPassword });
    token = res.body.accessToken;
  });

  it('201 — changes password; old password login fails, new succeeds', async () => {
    const res = await request(httpServer)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: oldPassword, newPassword })
      .expect(201);

    expect(res.body.message).toMatch(/changed/i);

    // Old password should now fail
    await request(httpServer)
      .post('/api/auth/login')
      .send({ email: testEmail, password: oldPassword })
      .expect(401);

    // New password should succeed
    const loginRes = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: testEmail, password: newPassword })
      .expect(201);
    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('401 — wrong current password', async () => {
    await request(httpServer)
      .post('/api/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-pass', newPassword })
      .expect(401);
  });
});

// ─── POST /api/auth/forgot-password ──────────────────────────────────────────

describe('POST /api/auth/forgot-password', () => {
  beforeEach(cleanup);

  it('201 — always returns generic message (email enumeration prevention)', async () => {
    const res = await request(httpServer)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@e2e.test' })
      .expect(201);

    expect(res.body.message).toMatch(/if that email exists/i);
  });

  it('201 — same message for existing email', async () => {
    const e = email('forgot');
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: e, username: username('forgot'), password: 'Password1!' });

    const res = await request(httpServer)
      .post('/api/auth/forgot-password')
      .send({ email: e })
      .expect(201);

    expect(res.body.message).toMatch(/if that email exists/i);
  });

  it('creates a tokenHash (not plaintext) in DB after forgot-password', async () => {
    const e = email('fgtok');
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: e, username: username('fgtok'), password: 'Password1!' });

    await request(httpServer)
      .post('/api/auth/forgot-password')
      .send({ email: e });

    const user = await prisma.user.findFirst({ where: { email: e } });
    const record = await prisma.passwordResetToken.findFirst({
      where: { userId: user!.id },
    });

    expect(record).not.toBeNull();
    expect(record!.tokenHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    // There must be no `token` field — tokenHash only
    expect((record as any).token).toBeUndefined();
  });
});

// ─── POST /api/auth/reset-password ───────────────────────────────────────────

describe('POST /api/auth/reset-password', () => {
  let userId: string;

  beforeEach(async () => {
    await cleanup();
    const res = await request(httpServer)
      .post('/api/auth/register')
      .send({ email: email('reset'), username: username('reset'), password: 'OldPass1!' });
    userId = res.body.userId;
  });

  /** Insert a token directly bypassing the email flow */
  async function insertToken(opts: { expired?: boolean; alreadyUsed?: boolean } = {}) {
    const plainToken = randomBytes(32).toString('hex');
    const tokenHash = hashToken(plainToken);
    const expiresAt = opts.expired
      ? new Date(Date.now() - 1000) // already expired
      : new Date(Date.now() + 3_600_000); // 1h from now
    const usedAt = opts.alreadyUsed ? new Date() : null;
    await prisma.passwordResetToken.create({
      data: { userId, tokenHash, expiresAt, ...(usedAt ? { usedAt } : {}) },
    });
    return plainToken;
  }

  it('201 — resets password; old password fails, new succeeds', async () => {
    const user = await prisma.user.findFirst({ where: { id: userId } });
    const plainToken = await insertToken();

    const res = await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, password: 'BrandNew3!' })
      .expect(201);

    expect(res.body.message).toMatch(/password updated/i);

    // Login with NEW password works
    const loginRes = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: user!.email, password: 'BrandNew3!' })
      .expect(201);
    expect(loginRes.body.accessToken).toBeDefined();
  });

  it('400 — expired token', async () => {
    const plainToken = await insertToken({ expired: true });

    await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, password: 'BrandNew3!' })
      .expect(400);
  });

  it('400 — already-used token (replay prevention)', async () => {
    const plainToken = await insertToken({ alreadyUsed: true });

    await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, password: 'BrandNew3!' })
      .expect(400);
  });

  it('400 — completely invalid token', async () => {
    await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: 'notavalidtoken', password: 'BrandNew3!' })
      .expect(400);
  });

  it('token is deleted after successful reset (cannot reuse)', async () => {
    const plainToken = await insertToken();

    await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, password: 'NewPass1!' })
      .expect(201);

    // Second use must fail
    await request(httpServer)
      .post('/api/auth/reset-password')
      .send({ token: plainToken, password: 'AnotherPass2!' })
      .expect(400);
  });
});
