import { Logger, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { ScheduleModule } from '@nestjs/schedule';
import { redisStore } from 'cache-manager-redis-yet';
import { APP_GUARD } from '@nestjs/core';
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
import { SponsoredModule } from './modules/sponsored/sponsored.module';
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
import { ImportSourcesModule } from './modules/import-sources/import-sources.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { BackupModule } from './modules/backup/backup.module';

@Module({
  imports: [
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
        },
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL');
        if (redisUrl) {
          try {
            const store = await Promise.race([
              redisStore({ url: redisUrl, socket: { connectTimeout: 3000 } }),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Redis connection timeout')), 4000),
              ),
            ]);
            return { stores: [store], ttl: 300_000 };
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            const cacheLogger = new Logger('CacheModule');
            cacheLogger.warn(`Redis unavailable (${msg}), using in-memory cache`);
          }
        }
        return { ttl: 300_000 };
      },
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      { name: 'default', ttl: 60_000, limit: 120 },  // 120 req/min globally
    ]),
    PrismaModule,
    AuditModule,
    MailModule,
    AuthModule,
    AdminModule,
    BooksModule,
    AuthorsModule,
    ArtistsModule,
    EditionsModule,
    CompaniesModule,
    SubscriptionsModule,
    CollectionModule,
    SearchModule,
    UploadModule,
    SpendingModule,
    FeesModule,
    NotificationsModule,
    ProfileModule,
    SponsoredModule,
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
    ImportSourcesModule,
    TrackingModule,
    BackupModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerSkipTestGuard },
  ],
})
export class AppModule {}