/**
 * E2E tests for series-continuation notifications (real Postgres) — covers what the
 * mocked-Prisma unit tests (SeriesContinuationService/.Cron specs) structurally can't:
 * real null-equality on variantLabel, real `notIn` ownership-status exclusion, the real
 * admin-role guard on the trigger endpoint, and the real active/upcoming archival guard.
 * Requires a real database connection (postgresql://localhost:5432/luxgrimoire_test).
 * Run with: pnpm --filter api test:e2e -- --testPathPattern=series-continuation.e2e-spec
 */
import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest');
import * as bcrypt from 'bcryptjs';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SeriesContinuationCron } from '../src/modules/series-continuation/series-continuation.cron';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _seq = 0;
function uid() {
  return `sercont_${Date.now()}_${++_seq}`;
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
let cron: SeriesContinuationCron;

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
  // Not exported by SeriesContinuationModule, but Nest's default (non-strict) `get()`
  // resolves any provider in the compiled graph, same as grabbing PrismaService above.
  cron = moduleFixture.get(SeriesContinuationCron);
});

afterAll(async () => {
  await app.close();
});

// ─── Cleanup ─────────────────────────────────────────────────────────────────

async function cleanup() {
  await prisma.pendingSeriesContinuationNotification.deleteMany({});
  await prisma.userNotification.deleteMany({});
  await prisma.userBookEntry.deleteMany({});
  await prisma.saleAnnouncementEdition.deleteMany({});
  await prisma.saleAnnouncement.deleteMany({});
  await prisma.bookEdition.deleteMany({});
  await prisma.book.deleteMany({});
  await prisma.bookSeries.deleteMany({});
  await prisma.bookBoxCompany.deleteMany({});
  await prisma.emailVerificationToken.deleteMany({});
  await prisma.session.deleteMany({});
  await prisma.user.deleteMany({});
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function loginAndExtractToken(loginEmail: string, password: string): Promise<{ token: string; userId: string }> {
  const res = await request(httpServer)
    .post('/api/auth/login')
    .send({ email: loginEmail, password })
    .expect(201);
  const cookieName = process.env.JWT_COOKIE_NAME ?? 'jwt';
  const setCookie = res.headers['set-cookie'];
  const cookieStr = Array.isArray(setCookie) ? setCookie[0] : (setCookie ?? '');
  const match = cookieStr.split(';')[0].match(new RegExp(`^${cookieName}=(.+)$`));
  const token = match?.[1] ?? '';
  const { userId } = res.body as { userId: string };
  return { token, userId };
}

async function registerAndGetToken(): Promise<{ token: string; userId: string }> {
  const e = email();
  await request(httpServer)
    .post('/api/auth/register')
    .send({
      email: e, username: username(), password: 'Password1!', termsAccepted: true,
      // RegisterDto requires these since the legal-consent-versioning feature.
      termsVersion: '2026-08-05T00:00:00.000Z', privacyVersion: '2026-08-04T00:00:00.000Z',
    })
    .expect(201);
  await prisma.user.updateMany({ where: { email: e }, data: { emailVerified: true } });
  return loginAndExtractToken(e, 'Password1!');
}

/** No registration flow needed — role is read fresh from DB at login and on each
 *  request, so a directly-created ADMIN user logs in and is treated as admin immediately. */
async function createAdminAndLogin(): Promise<{ token: string; userId: string }> {
  const e = email();
  const passwordHash = await bcrypt.hash('Password1!', 12);
  await prisma.user.create({
    data: { email: e, username: username(), passwordHash, role: 'ADMIN', emailVerified: true },
  });
  return loginAndExtractToken(e, 'Password1!');
}

// ─── Fixture seed helper ─────────────────────────────────────────────────────

async function seedFixture(opts: {
  userId: string;
  variantLabel1?: string | null;
  variantLabel2?: string | null;
  ownershipStatus?: string;
  isWishlist?: boolean;
  saleType?: 'OPEN_PREORDER' | 'SALE' | 'LIMITED_PREORDER' | 'OVERSTOCK';
  saleEndsAt?: Date | null;
}) {
  const company = await prisma.bookBoxCompany.create({ data: { name: `Co ${uid()}`, slug: uid() } });
  const series = await prisma.bookSeries.create({ data: { name: `Series ${uid()}`, slug: uid() } });
  const book1 = await prisma.book.create({ data: { title: `Book1 ${uid()}`, slug: uid(), seriesId: series.id } });
  const book2 = await prisma.book.create({ data: { title: `Book2 ${uid()}`, slug: uid(), seriesId: series.id } });
  const edition1 = await prisma.bookEdition.create({
    data: { bookId: book1.id, slug: uid(), bookBoxCompanyId: company.id, variantLabel: opts.variantLabel1 ?? null },
  });
  const edition2 = await prisma.bookEdition.create({
    data: { bookId: book2.id, slug: uid(), bookBoxCompanyId: company.id, variantLabel: opts.variantLabel2 ?? null },
  });
  const entry = await prisma.userBookEntry.create({
    data: {
      userId: opts.userId,
      bookId: book1.id,
      editionId: edition1.id,
      ownershipStatus: opts.ownershipStatus ?? 'OWNED',
      readingStatus: 'UNREAD',
      isWishlist: opts.isWishlist ?? false,
    },
  });
  // OPEN_PREORDER with endsAt: null (the default) is "active indefinitely" per
  // AnnouncementsService.buildActiveSaleCondition — no tier/endsAt seeding needed
  // for the happy-path/active cases.
  const sale = await prisma.saleAnnouncement.create({
    data: {
      title: `Sale ${uid()}`,
      companyId: company.id,
      saleType: opts.saleType ?? 'OPEN_PREORDER',
      endsAt: opts.saleEndsAt ?? null,
    },
  });
  return {
    companyId: company.id,
    seriesId: series.id,
    book1Id: book1.id,
    book2Id: book2.id,
    edition1Id: edition1.id,
    edition2Id: edition2.id,
    saleId: sale.id,
    entryId: entry.id,
  };
}

function addEdition(token: string, saleId: string, editionId: string) {
  return request(httpServer)
    .post(`/api/announcements/admin/${saleId}/editions`)
    .set('Authorization', `Bearer ${token}`)
    .send({ editionId });
}

async function findPending(userId: string, saleAnnouncementId: string) {
  return prisma.pendingSeriesContinuationNotification.findUnique({
    where: { userId_saleAnnouncementId: { userId, saleAnnouncementId } },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** notifySeriesContinuation() is fire-and-forget (`void ...`) from the HTTP handler's
 *  point of view — the response returns before its real DB round-trips settle. Poll for
 *  a positive assertion instead of asserting immediately after the request resolves. */
async function waitUntil<T>(fn: () => Promise<T>, predicate: (v: T) => boolean, timeoutMs = 3000, intervalMs = 50): Promise<T> {
  const start = Date.now();
  let value = await fn();
  while (!predicate(value) && Date.now() - start < timeoutMs) {
    await sleep(intervalMs);
    value = await fn();
  }
  return value;
}

/** Fixed grace period for a "should NOT happen" assertion — long enough for the same
 *  fire-and-forget chain to have settled either way before we declare it absent. */
const NEGATIVE_GRACE_MS = 500;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Series continuation notifications', () => {
  beforeEach(cleanup);

  it('full pipeline: linking a continuation edition enqueues a pending row, the cron sends it', async () => {
    const { userId } = await registerAndGetToken();
    const { token: adminToken } = await createAdminAndLogin();
    const fixture = await seedFixture({ userId });

    await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);

    const pending = await waitUntil(() => findPending(userId, fixture.saleId), (v) => v !== null);
    expect(pending).not.toBeNull();
    expect(pending!.editionIds).toEqual([fixture.edition2Id]);
    expect(pending!.scheduledFor.getTime()).toBeGreaterThan(Date.now() + 4 * 60_000);

    // Control time via data instead of waiting on the real 5-min debounce window.
    await prisma.pendingSeriesContinuationNotification.update({
      where: { id: pending!.id },
      data: { scheduledFor: new Date(Date.now() - 1000) },
    });
    await cron.processPendingNotifications();

    const notification = await prisma.userNotification.findFirst({ where: { userId, type: 'series_continuation' } });
    const book2 = await prisma.book.findUnique({ where: { id: fixture.book2Id } });
    expect(notification).not.toBeNull();
    expect(notification!.body).toContain(book2!.title);

    expect(await prisma.pendingSeriesContinuationNotification.findUnique({ where: { id: pending!.id } })).toBeNull();
  });

  it('does not match when the new edition has a variant but the owned one does not', async () => {
    const { userId } = await registerAndGetToken();
    const { token: adminToken } = await createAdminAndLogin();
    const fixture = await seedFixture({ userId, variantLabel1: null, variantLabel2: 'Black Edition' });

    await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);

    await sleep(NEGATIVE_GRACE_MS);
    expect(await findPending(userId, fixture.saleId)).toBeNull();
  });

  it('matches when both editions share the exact same variant label', async () => {
    const { userId } = await registerAndGetToken();
    const { token: adminToken } = await createAdminAndLogin();
    const fixture = await seedFixture({ userId, variantLabel1: 'White Edition', variantLabel2: 'White Edition' });

    await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);

    const pending = await waitUntil(() => findPending(userId, fixture.saleId), (v) => v !== null);
    expect(pending).not.toBeNull();
  });

  describe.each<[string, boolean]>([
    ['SOLD', false],
    ['GIFTED_AWAY', false],
    ['BORROWED', false],
    ['LENDED', true],
  ])('ownershipStatus = %s', (status, shouldMatch) => {
    it(shouldMatch ? 'still matches (still theirs)' : 'is excluded', async () => {
      const { userId } = await registerAndGetToken();
      const { token: adminToken } = await createAdminAndLogin();
      const fixture = await seedFixture({ userId, ownershipStatus: status });

      await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);

      if (shouldMatch) {
        const pending = await waitUntil(() => findPending(userId, fixture.saleId), (v) => v !== null);
        expect(pending).not.toBeNull();
      } else {
        await sleep(NEGATIVE_GRACE_MS);
        expect(await findPending(userId, fixture.saleId)).toBeNull();
      }
    });
  });

  it('debounces: two editions added back-to-back merge into one pending row', async () => {
    const { userId } = await registerAndGetToken();
    const { token: adminToken } = await createAdminAndLogin();
    const fixture = await seedFixture({ userId });
    const book3 = await prisma.book.create({ data: { title: `Book3 ${uid()}`, slug: uid(), seriesId: fixture.seriesId } });
    const edition3 = await prisma.bookEdition.create({
      data: { bookId: book3.id, slug: uid(), bookBoxCompanyId: fixture.companyId },
    });

    await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);
    await addEdition(adminToken, fixture.saleId, edition3.id).expect(201);

    const rows = await waitUntil(
      () => prisma.pendingSeriesContinuationNotification.findMany({ where: { userId, saleAnnouncementId: fixture.saleId } }),
      (v) => v.length > 0 && v[0].editionIds.length >= 2,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].editionIds.slice().sort()).toEqual([fixture.edition2Id, edition3.id].sort());
  });

  it('does not enqueue for a past/archival sale announcement', async () => {
    const { userId } = await registerAndGetToken();
    const { token: adminToken } = await createAdminAndLogin();
    const fixture = await seedFixture({
      userId,
      saleType: 'SALE',
      saleEndsAt: new Date(Date.now() - 24 * 60 * 60_000),
    });

    await addEdition(adminToken, fixture.saleId, fixture.edition2Id).expect(201);

    await sleep(NEGATIVE_GRACE_MS);
    expect(await findPending(userId, fixture.saleId)).toBeNull();
  });

  it('403 — a non-admin cannot link an edition to a sale', async () => {
    const { token } = await registerAndGetToken();
    const { userId: ownerUserId } = await registerAndGetToken();
    const fixture = await seedFixture({ userId: ownerUserId });

    await request(httpServer)
      .post(`/api/announcements/admin/${fixture.saleId}/editions`)
      .set('Authorization', `Bearer ${token}`)
      .send({ editionId: fixture.edition2Id })
      .expect(403);
  });
});
