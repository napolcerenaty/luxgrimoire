import { Logger, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { SentryModule, SentryGlobalFilter } from '@sentry/nestjs/setup';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import KeyvRedis from '@keyv/redis';
import Keyv from 'keyv';
import { LoggerModule } from 'nestjs-pino';
import { ThrottlerSkipTestGuard } from './common/guards/throttler-skip-test.guard';
import { PrismaModule } from './prisma/prisma.module';
import { MailModule } from './modules/mail/mail.module';
import { AuthModule } from './modules/auth/auth.module';
import { AuditModule } from './modules/audit/audit.module';
import { AdminModule } from './modules/admin/admin.module';
import { BooksModule } from './modules/books/books.module';
import { AuthorsModule } from './modules/authors/authors.module';
import { ArtistsModule } from './modules/artists/artists.module';
import { EditionsModule } from './modules/editions/editions.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { CollectionModule } from './modules/collection/collection.module';
import { SearchModule } from './modules/search/search.module';
import { UploadModule } from './modules/upload/upload.module';
import { SpendingModule } from './modules/spending/spending.module';
import { FeesModule } from './modules/fees/fees.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { SaleInterestsModule } from './modules/sale-interests/sale-interests.module';
import { SkipPolicyModule } from './modules/skip-policy/skip-policy.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { PurchaseGroupsModule } from './modules/purchase-groups/purchase-groups.module';
import { BookBoxCollectionsModule } from './modules/book-box-collections/book-box-collections.module';
import { SubscriptionSeriesModule } from './modules/subscription-series/subscription-series.module';
import { BugReportsModule } from './modules/bug-reports/bug-reports.module';
import { FeatureRequestsModule } from './modules/feature-requests/feature-requests.module';
import { DataRequestsModule } from './modules/data-requests/data-requests.module';
import { SaleAnnouncementRequestsModule } from './modules/sale-announcement-requests/sale-announcement-requests.module';
import { SalesModule } from './modules/sales/sales.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { BackupModule } from './modules/backup/backup.module';
import { TypesenseModule } from './modules/typesense/typesense.module';
import { CrowdStatsModule } from './modules/crowd-stats/crowd-stats.module';
import { FeatureCategoriesModule } from './modules/feature-categories/feature-categories.module';
import { StatsModule } from './modules/stats/stats.module';
import { ReadingImportModule } from './modules/reading-import/reading-import.module';
import { MediaAssetsModule } from './modules/media-assets/media-assets.module';
import { BookSeriesModule } from './modules/book-series/book-series.module';
import { HomepageFeaturesModule } from './modules/homepage-features/homepage-features.module';
import { BlogAdminModule } from './modules/blog-admin/blog-admin.module';
import { SitemapModule } from './modules/sitemap/sitemap.module';

@Module({
  imports: [
    ...(process.env.SENTRY_DSN ? [SentryModule.forRoot()] : []),
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
          : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        serializers: {
          req(req) {
            return {
              method: req.method,
              url: req.url,
              id: req.id,
            };
          },
          res(res) {
            return {
              statusCode: res.statusCode,
            };
          },
        },
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const redisMaxMemory = config.get<string>('REDIS_MAX_MEMORY') ?? '128mb';
        if (redisUrl) {
          try {
            const keyvRedis = new KeyvRedis(redisUrl);
            const store = new Keyv({ store: keyvRedis });
            // Verify connection with timeout
            await Promise.race([
              store.get('__ping__'),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Redis connection timeout')), 4000),
              ),
            ]);
            // Set memory limit and LRU eviction policy so Redis never grows unbounded
            try {
              const client = keyvRedis.client;
              await client.configSet({ maxmemory: redisMaxMemory, 'maxmemory-policy': 'allkeys-lru' });
            } catch {
              // CONFIG SET may be disabled on some managed Redis instances — non-fatal
            }
            return { stores: [store], ttl: 300_000 };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const cacheLogger = new Logger('CacheModule');
            cacheLogger.warn(`Redis unavailable (${msg}), using in-memory cache`);
          }
        }
        return { stores: [new Keyv()], ttl: 300_000 };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        const storage = redisUrl ? new ThrottlerStorageRedisService(redisUrl) : undefined;
        return [{ name: 'default', ttl: 60_000, limit: 120, ...(storage ? { storage } : {}) }];
      },
    }),
    PrismaModule,
    AuditModule,
    MailModule,
    AuthModule,
    AdminModule,
    TypesenseModule,
    BooksModule,
    AuthorsModule,
    ArtistsModule,
    EditionsModule,
    CompaniesModule,
    SubscriptionsModule,
    CollectionModule,
    SearchModule,
    UploadModule,
    MediaAssetsModule,
    SpendingModule,
    FeesModule,
    NotificationsModule,
    ProfileModule,
    AnnouncementsModule,
    SaleInterestsModule,
    SkipPolicyModule,
    CurrencyModule,
    AiModule,
    AnalyticsModule,
    PurchaseGroupsModule,
    BookBoxCollectionsModule,
    SubscriptionSeriesModule,
    BugReportsModule,
    FeatureRequestsModule,
    DataRequestsModule,
    SaleAnnouncementRequestsModule,
    SalesModule,
    TrackingModule,
    BackupModule,
    CrowdStatsModule,
    FeatureCategoriesModule,
    HomepageFeaturesModule,
    StatsModule,
    ReadingImportModule,
    BookSeriesModule,
    BlogAdminModule,
    SitemapModule,
  ],
  providers: [
    ...(process.env.SENTRY_DSN ? [{ provide: APP_FILTER, useClass: SentryGlobalFilter }] : []),
    { provide: APP_GUARD, useClass: ThrottlerSkipTestGuard },
  ],
})
export class AppModule {}