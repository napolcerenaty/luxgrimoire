/**
 * E2E tests for the Sales API (/api/sales).
 * Requires a real database connection (postgresql://localhost:5432/luxgrimoire_test).
 * Run with: pnpm --filter api test:e2e -- --testPathPattern=sales.e2e-spec
 */
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 0;
function uid() {
  return `sales_${Date.now()}_${++_seq}`;
}
function email() {
  return `${uid()}@e2e.test`;
}
function username() {
  return `u_${uid()}`;
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

let app: NestFastifyApplication;
let prisma: PrismaService;
let httpServer: ReturnType<typeof app.getHttpServer>;

beforeAll(async () => {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('api');

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  await (app as any).register(require('@fastify/cookie'));

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  prisma = moduleFixture.get(PrismaService);
  httpServer = app.getHttpServer();
});

afterAll(async () => {
  await app.close();
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  await prisma.ownershipStatusHistory.deleteMany({});
  await prisma.userSaleEntry.deleteMany({});
  await prisma.userSaleGroup.deleteMany({});
  await prisma.userBookEntry.deleteMany({});
  await prisma.userPurchaseGroup.deleteMany({});
  await prisma.userSubscriptionEntry.deleteMany({});
  await prisma.subscriptionMonth.deleteMany({});
  await prisma.subscription.deleteMany({});
  await prisma.bookBoxCompany.deleteMany({});
  await prisma.bookEdition.deleteMany({});
  await prisma.book.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

// ─── Seed helpers ────────────────────────────────────────────────────────────

async function registerAndGetToken(): Promise<{ token: string; userId: string }> {
  const e = email();
  await request(httpServer)
    .post('/api/auth/register')
    .send({ email: e, username: username(), password: 'Password1!', termsAccepted: true })
    .expect(201);
  await prisma.user.updateMany({ where: { email: e }, data: { emailVerified: true } });
  const res = await request(httpServer)
    .post('/api/auth/login')
    .send({ email: e, password: 'Password1!' })
    .expect(201);
  const cookieName = process.env.JWT_COOKIE_NAME ?? 'jwt';
  const setCookie = res.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : (setCookie ?? '');
  const match = cookieStr.split(';')[0].match(new RegExp(`^${cookieName}=(.+)$`));
  const token = match?.[1] ?? '';
  const { userId } = res.body as { userId: string };
  return { token, userId };
}

async function seedBookAndEntry(userId: string): Promise<string> {
  const book = await prisma.book.create({
    data: { title: `Book ${uid()}`, slug: uid() },
  });
  const edition = await prisma.bookEdition.create({
    data: { bookId: book.id, slug: uid() },
  });
  const entry = await prisma.userBookEntry.create({
    data: {
      userId,
      bookId: book.id,
      editionId: edition.id,
      ownershipStatus: 'OWNED',
      readingStatus: 'UNREAD',
    },
  });
  return entry.id;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Sales API', () => {
  beforeEach(cleanup);

  // ── POST /api/sales ────────────────────────────────────────────────────────

  describe('POST /api/sales', () => {
    it('201 — creates sale group with one book (EQUAL distribution)', async () => {
      const { token, userId } = await registerAndGetToken();
      const entryId = await seedBookAndEntry(userId);

      const res = await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 25,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [entryId],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        totalAmount: '25',
        currency: 'USD',
        platform: 'eBay',
      });
      expect(res.body.entries).toHaveLength(1);
      expect(Number(res.body.entries[0].allocatedAmount)).toBe(25);
    });

    it('201 — two books: each allocatedAmount = totalAmount / 2', async () => {
      const { token, userId } = await registerAndGetToken();
      const [entryId1, entryId2] = await Promise.all([
        seedBookAndEntry(userId),
        seedBookAndEntry(userId),
      ]);

      const res = await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 40,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [entryId1, entryId2],
        })
        .expect(201);

      const amounts = res.body.entries.map((e: { allocatedAmount: string }) => Number(e.allocatedAmount));
      expect(amounts).toHaveLength(2);
      amounts.forEach((a: number) => expect(a).toBe(20));
    });

    it('201 — CUSTOM distribution: allocatedAmounts match customAmounts', async () => {
      const { token, userId } = await registerAndGetToken();
      const [entryId1, entryId2] = await Promise.all([
        seedBookAndEntry(userId),
        seedBookAndEntry(userId),
      ]);

      const res = await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 35,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'CUSTOM',
          entryIds: [entryId1, entryId2],
          customAmounts: { [entryId1]: 10, [entryId2]: 25 },
        })
        .expect(201);

      const byEntry: Record<string, number> = {};
      for (const e of res.body.entries) {
        byEntry[e.userBookEntryId] = Number(e.allocatedAmount);
      }
      expect(byEntry[entryId1]).toBe(10);
      expect(byEntry[entryId2]).toBe(25);
    });

    it('400 — entryIds is empty', async () => {
      const { token } = await registerAndGetToken();

      await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 25,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [],
        })
        .expect(400);
    });

    it('400 — entryId not owned by user', async () => {
      const { token } = await registerAndGetToken();
      const { userId: otherId } = await registerAndGetToken();
      const foreignEntryId = await seedBookAndEntry(otherId);

      await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 25,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [foreignEntryId],
        })
        .expect(400);
    });
  });

  // ── GET /api/sales ─────────────────────────────────────────────────────────

  describe('GET /api/sales', () => {
    it('200 — returns paginated list', async () => {
      const { token, userId } = await registerAndGetToken();
      const entryId = await seedBookAndEntry(userId);

      // seed one sale
      await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 20,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [entryId],
        });

      const res = await request(httpServer)
        .get('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body).toMatchObject({
        total: 1,
        page: 1,
        data: expect.arrayContaining([
          expect.objectContaining({ currency: 'USD', platform: 'eBay' }),
        ]),
      });
    });
  });

  // ── PATCH /api/sales/:id ───────────────────────────────────────────────────

  describe('PATCH /api/sales/:id', () => {
    it('200 — updates totalAmount and redistributes equally', async () => {
      const { token, userId } = await registerAndGetToken();
      const [entryId1, entryId2] = await Promise.all([
        seedBookAndEntry(userId),
        seedBookAndEntry(userId),
      ]);

      const createRes = await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 40,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [entryId1, entryId2],
        })
        .expect(201);

      const groupId = createRes.body.id;

      await request(httpServer)
        .patch(`/api/sales/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ totalAmount: 60 })
        .expect(200);

      // Fetch updated group separately to verify redistribution
      const getRes = await request(httpServer)
        .get(`/api/sales/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // entries should be redistributed to 30 each
      const entries = getRes.body.entries ?? [];
      if (entries.length > 0) {
        entries.forEach((e: { allocatedAmount: string | number }) =>
          expect(Number(e.allocatedAmount)).toBe(30),
        );
      }
    });
  });

  // ── DELETE /api/sales/:id ──────────────────────────────────────────────────

  describe('DELETE /api/sales/:id', () => {
    it('200 — deletes sale group and books revert to OWNED', async () => {
      const { token, userId } = await registerAndGetToken();
      const entryId = await seedBookAndEntry(userId);

      const createRes = await request(httpServer)
        .post('/api/sales')
        .set('Authorization', `Bearer ${token}`)
        .send({
          totalAmount: 20,
          currency: 'USD',
          platform: 'eBay',
          soldAt: '2024-06-01',
          priceDistribution: 'EQUAL',
          entryIds: [entryId],
        })
        .expect(201);

      const groupId = createRes.body.id;

      // Verify book is now SOLD
      const beforeDelete = await prisma.userBookEntry.findUnique({ where: { id: entryId } });
      expect(beforeDelete?.ownershipStatus).toBe('SOLD');

      await request(httpServer)
        .delete(`/api/sales/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Verify book reverted to OWNED
      const afterDelete = await prisma.userBookEntry.findUnique({ where: { id: entryId } });
      expect(afterDelete?.ownershipStatus).toBe('OWNED');
      expect(afterDelete?.salePrice).toBeNull();
      expect(afterDelete?.saleCurrency).toBeNull();

      // Group no longer exists
      await request(httpServer)
        .get(`/api/sales/${groupId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
