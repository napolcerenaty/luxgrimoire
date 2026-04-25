import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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
import { FavoritesModule } from './modules/favorites/favorites.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SponsoredModule } from './modules/sponsored/sponsored.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { SocialModule } from './modules/social/social.module';
import { AnnouncementsModule } from './modules/announcements/announcements.module';
import { SkipPolicyModule } from './modules/skip-policy/skip-policy.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AiModule } from './modules/ai/ai.module';
import { PurchaseGroupsModule } from './modules/purchase-groups/purchase-groups.module';
import { BookBoxCollectionsModule } from './modules/book-box-collections/book-box-collections.module';
import { SubscriptionSeriesModule } from './modules/subscription-series/subscription-series.module';
import { BugReportsModule } from './modules/bug-reports/bug-reports.module';
import { FeatureRequestsModule } from './modules/feature-requests/feature-requests.module';
import { SalesModule } from './modules/sales/sales.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
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
    FavoritesModule,
    NotificationsModule,
    ProfileModule,
    SponsoredModule,
    ReviewsModule,
    SocialModule,
    AnnouncementsModule,
    SkipPolicyModule,
    CurrencyModule,
    AiModule,
    PurchaseGroupsModule,
    BookBoxCollectionsModule,
    SubscriptionSeriesModule,
    BugReportsModule,
    FeatureRequestsModule,
    SalesModule,
  ],
})
export class AppModule {}