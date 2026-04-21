import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
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
import { FavoritesModule } from './modules/favorites/favorites.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ProfileModule } from './modules/profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
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
    FavoritesModule,
    NotificationsModule,
    ProfileModule,
  ],
})
export class AppModule {}
