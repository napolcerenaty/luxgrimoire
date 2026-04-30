-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MODERATOR', 'USER', 'COMPANY_MANAGER');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('unsigned', 'signed', 'digitally_signed', 'signed_bookplate');

-- CreateEnum
CREATE TYPE "SponsoredSlotType" AS ENUM ('HOMEPAGE_FEATURED', 'COMPANY_PAGE_BANNER', 'NEWSLETTER_SLOT');

-- CreateEnum
CREATE TYPE "FeeCategory" AS ENUM ('VAT', 'CUSTOMS', 'SHIPPING', 'PROCESSING', 'FORWARDING', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "preferredCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "displayName" TEXT,
    "avatarUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "managedCompanyId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "timeFormat" TEXT NOT NULL DEFAULT '24h',
    "defaultTaxRate" DECIMAL(5,2),
    "shippingCountry" VARCHAR(2),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "seriesName" TEXT,
    "volumeNumber" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "genres" TEXT[],

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "authors" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facebook" TEXT,
    "instagram" TEXT,
    "nationality" TEXT,
    "tiktok" TEXT,
    "twitter" TEXT,
    "website" TEXT,

    CONSTRAINT "authors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_authors" (
    "bookId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "book_authors_pkey" PRIMARY KEY ("bookId","authorId")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facebook" TEXT,
    "instagram" TEXT,
    "specialty" TEXT,
    "tiktok" TEXT,
    "twitter" TEXT,
    "website" TEXT,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_contributions" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'cover',
    "artistName" TEXT,

    CONSTRAINT "artist_contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_editions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "publisher" TEXT,
    "photoCredit" TEXT,
    "additionalImages" TEXT[],
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "basePrice" DECIMAL(10,2),
    "bookBoxCompanyCustomName" TEXT,
    "bookBoxCompanyId" TEXT,
    "collectionId" TEXT,
    "currency" TEXT,
    "earlyAccessDate" TEXT,
    "editionName" TEXT,
    "features" TEXT[],
    "firstAccessDate" TEXT,
    "generalSaleDate" TEXT,
    "language" TEXT,
    "subscriptionId" TEXT,
    "subscriptionMonthId" TEXT,
    "submittedByUserId" TEXT,
    "verifiedAt" TIMESTAMP(3),

    CONSTRAINT "book_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_box_companies" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoUrl" TEXT,
    "website" TEXT,
    "country" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bluesky" TEXT,
    "defaultCurrency" TEXT,
    "facebook" TEXT,
    "instagram" TEXT,
    "iossImplemented" BOOLEAN NOT NULL DEFAULT false,
    "threads" TEXT,
    "tiktok" TEXT,
    "x" TEXT,
    "brandColors" TEXT[],

    CONSTRAINT "book_box_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_box_collections" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "slug" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "book_box_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "genre" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isDiscontinued" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "bookishMerch" BOOLEAN NOT NULL DEFAULT false,
    "genres" TEXT[],
    "isCombo" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT,
    "parentSubscriptionId" TEXT,
    "renewalDay" INTEGER,
    "renewalDayUserSet" BOOLEAN NOT NULL DEFAULT false,
    "shippingCountries" TEXT[],
    "shipsInternationally" BOOLEAN NOT NULL DEFAULT false,
    "startingMonth" INTEGER,
    "type" TEXT,
    "language" TEXT,
    "price" TEXT,
    "contentType" TEXT NOT NULL DEFAULT 'MIX',
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "paymentOnStartup" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_combo_components" (
    "comboId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,

    CONSTRAINT "subscription_combo_components_pkey" PRIMARY KEY ("comboId","componentId")
);

-- CreateTable
CREATE TABLE "subscription_skip_policies" (
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NONE',
    "maxSkips" INTEGER,
    "maxConsecutive" INTEGER,
    "windowMonths" INTEGER,
    "notes" TEXT,
    "skipHow" TEXT,
    "skipDeadlineDaysBefore" INTEGER NOT NULL DEFAULT 0,
    "skipDeadlineType" TEXT NOT NULL DEFAULT 'DAYS_BEFORE',
    "skipDeadlineDayOfMonth" INTEGER,

    CONSTRAINT "subscription_skip_policies_pkey" PRIMARY KEY ("subscriptionId")
);

-- CreateTable
CREATE TABLE "subscription_series" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "coverImage" TEXT,
    "startMonth" INTEGER NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endMonth" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "skipMode" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "canCancelDuring" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skip_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userEntryId" TEXT NOT NULL,
    "subscriptionMonthId" TEXT NOT NULL,
    "skippedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "windowKey" TEXT,
    "undoneAt" TIMESTAMP(3),
    "seriesId" TEXT,

    CONSTRAINT "user_skip_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_skip_states" (
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "windowKey" TEXT,
    "skipsInWindow" INTEGER NOT NULL DEFAULT 0,
    "consecutiveSkips" INTEGER NOT NULL DEFAULT 0,
    "totalSkips" INTEGER NOT NULL DEFAULT 0,
    "lastSkipAt" TIMESTAMP(3),

    CONSTRAINT "user_subscription_skip_states_pkey" PRIMARY KEY ("userId","subscriptionId")
);

-- CreateTable
CREATE TABLE "subscription_prepay_options" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "label" TEXT,

    CONSTRAINT "subscription_prepay_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_months" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "theme" TEXT,
    "coverImage" TEXT,
    "spoilerImage" TEXT,
    "isSpoiler" BOOLEAN NOT NULL DEFAULT false,
    "announcedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "actualShipping" DECIMAL(10,2),
    "bookId" TEXT,
    "boxPrice" DECIMAL(10,2),
    "editionId" TEXT,
    "seriesId" TEXT,
    "signatureType" "SignatureType",
    "cardArtistId" TEXT,

    CONSTRAINT "subscription_months_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_month_books" (
    "id" TEXT NOT NULL,
    "monthId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "editionId" TEXT,
    "isMainBook" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "signatureType" "SignatureType",

    CONSTRAINT "subscription_month_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "basePrice" DECIMAL(10,2),
    "currency" TEXT,
    "extraImagesJson" JSONB,
    "imageUrl" TEXT,
    "saleTimezone" TEXT,
    "availableForPurchase" BOOLEAN NOT NULL DEFAULT false,
    "isBundle" BOOLEAN NOT NULL DEFAULT false,
    "expectedShipping" TEXT,
    "photoCredit" TEXT,
    "earlyAccessDate" TIMESTAMP(3),
    "firstAccessDate" TIMESTAMP(3),
    "generalSaleDate" TIMESTAMP(3),

    CONSTRAINT "sale_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_announcement_editions" (
    "id" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sale_announcement_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_announcement_edition_variants" (
    "id" TEXT NOT NULL,
    "saleAnnouncementEditionId" TEXT NOT NULL,
    "signatureType" "SignatureType" NOT NULL,
    "price" DECIMAL(10,2),
    "currency" VARCHAR(3),

    CONSTRAINT "sale_announcement_edition_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_announcement_regions" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCodes" JSONB NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "generalSaleDate" TIMESTAMP(3),
    "firstAccessDate" TIMESTAMP(3),
    "earlyAccessDate" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "saleTimezone" TEXT,
    "basePrice" DECIMAL(10,2),
    "currency" VARCHAR(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_announcement_regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sale_interests" (
    "userId" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "tier" VARCHAR(2) NOT NULL DEFAULT 'GS',
    "regionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sale_interests_pkey" PRIMARY KEY ("userId","announcementId")
);

-- CreateTable
CREATE TABLE "user_book_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "editionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "acquiredAt" TIMESTAMP(3),
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "condition" TEXT,
    "isWishlist" BOOLEAN NOT NULL DEFAULT false,
    "ownershipStatus" TEXT NOT NULL DEFAULT 'OWNED',
    "readingStatus" TEXT NOT NULL DEFAULT 'UNREAD',
    "saleCurrency" TEXT,
    "saleDate" TEXT,
    "saleNotes" TEXT,
    "salePrice" DECIMAL(10,2),
    "saleVenue" TEXT,
    "purchaseGroupId" TEXT,
    "subscriptionEntryId" TEXT,
    "signatureType" "SignatureType",
    "trackingNumber" TEXT,

    CONSTRAINT "user_book_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownership_status_history" (
    "id" TEXT NOT NULL,
    "userBookEntryId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ownership_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "startDate" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancellationDate" TEXT,
    "companyId" TEXT,
    "firstSkipDate" TIMESTAMP(3),
    "renewalDay" INTEGER,
    "shippingCost" DECIMAL(10,2),
    "startingMonth" INTEGER,
    "taxesAndFees" DECIMAL(10,2),
    "nextRenewalDate" TIMESTAMP(3),
    "prepaidMonths" INTEGER NOT NULL DEFAULT 1,
    "costCurrency" TEXT,
    "basePrice" DECIMAL(10,2),
    "cancellationReason" TEXT,
    "shippingCountry" VARCHAR(2),
    "trackingNumber" TEXT,

    CONSTRAINT "user_subscription_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sub_billing_periods" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "monthId" TEXT,
    "baseAmount" DECIMAL(10,2),
    "coveredFromMonth" INTEGER NOT NULL DEFAULT 0,
    "coveredFromYear" INTEGER NOT NULL DEFAULT 0,
    "monthsCovered" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "prepayOptionId" TEXT,
    "purchaseTransactionId" TEXT,
    "shipping" DECIMAL(10,2),
    "taxesAndFees" DECIMAL(10,2),
    "coveredToMonth" INTEGER,
    "coveredToYear" INTEGER,
    "paidCurrency" TEXT,
    "billedAt" TIMESTAMP(3),

    CONSTRAINT "user_sub_billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_cost_changes" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "effectiveFromMonth" INTEGER NOT NULL,
    "effectiveFromYear" INTEGER NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shippingCost" DECIMAL(10,2),
    "taxesAndFees" DECIMAL(10,2),

    CONSTRAINT "user_subscription_cost_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_renewals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "renewalDate" DATE NOT NULL,
    "source" VARCHAR(20) NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_subscription_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "description" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_edition_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "user_edition_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sub_entry_tags" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "tag" TEXT NOT NULL,

    CONSTRAINT "user_sub_entry_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_slots" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" "SponsoredSlotType" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "priceEur" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsored_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "exchange_rate_cache" (
    "id" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,

    CONSTRAINT "exchange_rate_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rate_history" (
    "id" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "date" DATE NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rate_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "username" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "entityTitle" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bug_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "pageUrl" TEXT,
    "category" VARCHAR(50) NOT NULL DEFAULT 'general',
    "status" VARCHAR(20) NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bug_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_requests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_votes" (
    "id" TEXT NOT NULL,
    "featureRequestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_fee_templates" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FeeCategory" NOT NULL DEFAULT 'OTHER',
    "defaultAmount" DECIMAL(10,2),
    "defaultCurrency" TEXT NOT NULL DEFAULT 'PLN',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_fee_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_subscription_entry_fee_templates" (
    "subscriptionEntryId" TEXT NOT NULL,
    "feeTemplateId" TEXT NOT NULL,
    "customAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "customCurrency" TEXT,

    CONSTRAINT "user_subscription_entry_fee_templates_pkey" PRIMARY KEY ("subscriptionEntryId","feeTemplateId")
);

-- CreateTable
CREATE TABLE "user_purchase_fees" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "feeTemplateId" TEXT,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "category" "FeeCategory" NOT NULL DEFAULT 'OTHER',
    "billingPeriodId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseGroupId" TEXT,

    CONSTRAINT "user_purchase_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_purchase_discounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "billingPeriodId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseGroupId" TEXT,

    CONSTRAINT "user_purchase_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_purchase_refunds" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "billingPeriodId" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "purchaseGroupId" TEXT,

    CONSTRAINT "user_purchase_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_purchase_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saleAnnouncementId" TEXT,
    "subscriptionEntryId" TEXT,
    "title" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "shippingAmount" DECIMAL(10,2),
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "fromSubscription" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_purchase_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_waitlist_entries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "subscription_waitlist_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "user_id" VARCHAR(36),
    "entity_type" VARCHAR(32),
    "entity_id" VARCHAR(36),
    "entity_name" VARCHAR(256),
    "value" VARCHAR(128),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sale_groups" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "platform" TEXT NOT NULL,
    "soldAt" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "priceDistribution" TEXT NOT NULL DEFAULT 'EQUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_sale_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sale_entries" (
    "id" TEXT NOT NULL,
    "saleGroupId" TEXT NOT NULL,
    "userBookEntryId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "user_sale_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" VARCHAR(30) NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "referenceUrl" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_announcement_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "url" TEXT NOT NULL,
    "notes" TEXT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sale_announcement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceType" VARCHAR(20) NOT NULL DEFAULT 'BLOG',
    "targetType" VARCHAR(30) NOT NULL DEFAULT 'MONTH_THEME',
    "companyId" TEXT,
    "subscriptionId" TEXT,
    "checkFrequency" VARCHAR(10) NOT NULL DEFAULT 'WEEKLY',
    "checkHour" INTEGER NOT NULL DEFAULT 8,
    "checkDayOfWeek" INTEGER,
    "checkDayOfMonth" INTEGER,
    "monthThemeKeywords" TEXT,
    "saleKeywords" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pending_month_imports" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "importSourceId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "theme" TEXT,
    "coverImageUrl" TEXT,
    "bookTitle" TEXT,
    "bookAuthor" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "allImages" TEXT[],
    "status" VARCHAR(10) NOT NULL DEFAULT 'PENDING',
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_month_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_shippingCountry_idx" ON "users"("shippingCountry");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_provider_providerId_key" ON "accounts"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "books_slug_key" ON "books"("slug");

-- CreateIndex
CREATE INDEX "books_language_idx" ON "books"("language");

-- CreateIndex
CREATE INDEX "books_seriesName_idx" ON "books"("seriesName");

-- CreateIndex
CREATE INDEX "books_status_idx" ON "books"("status");

-- CreateIndex
CREATE UNIQUE INDEX "authors_slug_key" ON "authors"("slug");

-- CreateIndex
CREATE INDEX "authors_nationality_idx" ON "authors"("nationality");

-- CreateIndex
CREATE INDEX "authors_name_idx" ON "authors"("name");

-- CreateIndex
CREATE UNIQUE INDEX "artists_slug_key" ON "artists"("slug");

-- CreateIndex
CREATE INDEX "artists_specialty_idx" ON "artists"("specialty");

-- CreateIndex
CREATE INDEX "artists_name_idx" ON "artists"("name");

-- CreateIndex
CREATE INDEX "artist_contributions_artistId_idx" ON "artist_contributions"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "artist_contributions_editionId_artistId_role_key" ON "artist_contributions"("editionId", "artistId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "book_editions_slug_key" ON "book_editions"("slug");

-- CreateIndex
CREATE INDEX "book_editions_bookId_idx" ON "book_editions"("bookId");

-- CreateIndex
CREATE INDEX "book_editions_bookBoxCompanyId_idx" ON "book_editions"("bookBoxCompanyId");

-- CreateIndex
CREATE INDEX "book_editions_subscriptionId_idx" ON "book_editions"("subscriptionId");

-- CreateIndex
CREATE INDEX "book_editions_subscriptionMonthId_idx" ON "book_editions"("subscriptionMonthId");

-- CreateIndex
CREATE INDEX "book_editions_language_idx" ON "book_editions"("language");

-- CreateIndex
CREATE INDEX "book_editions_generalSaleDate_idx" ON "book_editions"("generalSaleDate");

-- CreateIndex
CREATE INDEX "book_editions_createdAt_idx" ON "book_editions"("createdAt");

-- CreateIndex
CREATE INDEX "book_editions_updatedAt_idx" ON "book_editions"("updatedAt");

-- CreateIndex
CREATE INDEX "book_editions_verifiedAt_idx" ON "book_editions"("verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "book_box_companies_slug_key" ON "book_box_companies"("slug");

-- CreateIndex
CREATE INDEX "book_box_companies_country_idx" ON "book_box_companies"("country");

-- CreateIndex
CREATE UNIQUE INDEX "book_box_collections_slug_key" ON "book_box_collections"("slug");

-- CreateIndex
CREATE INDEX "book_box_collections_companyId_idx" ON "book_box_collections"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_slug_key" ON "subscriptions"("slug");

-- CreateIndex
CREATE INDEX "subscriptions_companyId_idx" ON "subscriptions"("companyId");

-- CreateIndex
CREATE INDEX "subscriptions_isDiscontinued_idx" ON "subscriptions"("isDiscontinued");

-- CreateIndex
CREATE INDEX "subscriptions_type_idx" ON "subscriptions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_series_slug_key" ON "subscription_series"("slug");

-- CreateIndex
CREATE INDEX "subscription_series_subscriptionId_idx" ON "subscription_series"("subscriptionId");

-- CreateIndex
CREATE INDEX "user_skip_records_userEntryId_idx" ON "user_skip_records"("userEntryId");

-- CreateIndex
CREATE INDEX "user_skip_records_userId_idx" ON "user_skip_records"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_skip_records_userEntryId_subscriptionMonthId_key" ON "user_skip_records"("userEntryId", "subscriptionMonthId");

-- CreateIndex
CREATE INDEX "subscription_months_subscriptionId_idx" ON "subscription_months"("subscriptionId");

-- CreateIndex
CREATE INDEX "subscription_months_year_month_idx" ON "subscription_months"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_months_subscriptionId_year_month_key" ON "subscription_months"("subscriptionId", "year", "month");

-- CreateIndex
CREATE INDEX "subscription_month_books_bookId_idx" ON "subscription_month_books"("bookId");

-- CreateIndex
CREATE INDEX "subscription_month_books_editionId_idx" ON "subscription_month_books"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_month_books_monthId_bookId_key" ON "subscription_month_books"("monthId", "bookId");

-- CreateIndex
CREATE INDEX "sale_announcements_companyId_idx" ON "sale_announcements"("companyId");

-- CreateIndex
CREATE INDEX "sale_announcements_generalSaleDate_idx" ON "sale_announcements"("generalSaleDate");

-- CreateIndex
CREATE INDEX "sale_announcements_createdAt_idx" ON "sale_announcements"("createdAt");

-- CreateIndex
CREATE INDEX "sale_announcement_editions_editionId_idx" ON "sale_announcement_editions"("editionId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_announcement_editions_saleId_editionId_key" ON "sale_announcement_editions"("saleId", "editionId");

-- CreateIndex
CREATE UNIQUE INDEX "sale_announcement_edition_variants_saleAnnouncementEditionI_key" ON "sale_announcement_edition_variants"("saleAnnouncementEditionId", "signatureType");

-- CreateIndex
CREATE INDEX "sale_announcement_regions_saleId_idx" ON "sale_announcement_regions"("saleId");

-- CreateIndex
CREATE INDEX "user_book_entries_userId_idx" ON "user_book_entries"("userId");

-- CreateIndex
CREATE INDEX "user_book_entries_userId_ownershipStatus_idx" ON "user_book_entries"("userId", "ownershipStatus");

-- CreateIndex
CREATE INDEX "user_book_entries_userId_readingStatus_idx" ON "user_book_entries"("userId", "readingStatus");

-- CreateIndex
CREATE INDEX "user_book_entries_userId_ownershipStatus_readingStatus_idx" ON "user_book_entries"("userId", "ownershipStatus", "readingStatus");

-- CreateIndex
CREATE INDEX "user_book_entries_purchaseGroupId_idx" ON "user_book_entries"("purchaseGroupId");

-- CreateIndex
CREATE INDEX "user_book_entries_editionId_idx" ON "user_book_entries"("editionId");

-- CreateIndex
CREATE INDEX "user_book_entries_bookId_idx" ON "user_book_entries"("bookId");

-- CreateIndex
CREATE INDEX "user_book_entries_userId_createdAt_idx" ON "user_book_entries"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_book_entries_userId_bookId_editionId_key" ON "user_book_entries"("userId", "bookId", "editionId");

-- CreateIndex
CREATE INDEX "ownership_status_history_userBookEntryId_changedAt_idx" ON "ownership_status_history"("userBookEntryId", "changedAt");

-- CreateIndex
CREATE INDEX "user_subscription_entries_userId_idx" ON "user_subscription_entries"("userId");

-- CreateIndex
CREATE INDEX "user_subscription_entries_userId_active_idx" ON "user_subscription_entries"("userId", "active");

-- CreateIndex
CREATE INDEX "user_subscription_entries_subscriptionId_shippingCountry_idx" ON "user_subscription_entries"("subscriptionId", "shippingCountry");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscription_entries_userId_subscriptionId_key" ON "user_subscription_entries"("userId", "subscriptionId");

-- CreateIndex
CREATE INDEX "user_sub_billing_periods_entryId_idx" ON "user_sub_billing_periods"("entryId");

-- CreateIndex
CREATE INDEX "user_sub_billing_periods_monthId_idx" ON "user_sub_billing_periods"("monthId");

-- CreateIndex
CREATE INDEX "user_subscription_renewals_userId_renewalDate_idx" ON "user_subscription_renewals"("userId", "renewalDate");

-- CreateIndex
CREATE UNIQUE INDEX "user_subscription_renewals_entryId_renewalDate_key" ON "user_subscription_renewals"("entryId", "renewalDate");

-- CreateIndex
CREATE INDEX "purchase_transactions_userId_idx" ON "purchase_transactions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_edition_tags_userId_editionId_tag_key" ON "user_edition_tags"("userId", "editionId", "tag");

-- CreateIndex
CREATE UNIQUE INDEX "user_sub_entry_tags_userId_entryId_tag_key" ON "user_sub_entry_tags"("userId", "entryId", "tag");

-- CreateIndex
CREATE INDEX "user_notifications_userId_idx" ON "user_notifications"("userId");

-- CreateIndex
CREATE INDEX "user_notifications_userId_createdAt_idx" ON "user_notifications"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "sponsored_slots_companyId_idx" ON "sponsored_slots"("companyId");

-- CreateIndex
CREATE INDEX "sponsored_slots_isActive_idx" ON "sponsored_slots"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_cache_fromCurrency_toCurrency_key" ON "exchange_rate_cache"("fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "exchange_rate_history_fromCurrency_toCurrency_date_idx" ON "exchange_rate_history"("fromCurrency", "toCurrency", "date");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rate_history_fromCurrency_toCurrency_date_key" ON "exchange_rate_history"("fromCurrency", "toCurrency", "date");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_idx" ON "audit_logs"("entityType");

-- CreateIndex
CREATE INDEX "audit_logs_entityId_idx" ON "audit_logs"("entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_userId_createdAt_idx" ON "audit_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_createdAt_idx" ON "audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "bug_reports_status_idx" ON "bug_reports"("status");

-- CreateIndex
CREATE INDEX "bug_reports_createdAt_idx" ON "bug_reports"("createdAt");

-- CreateIndex
CREATE INDEX "feature_requests_status_idx" ON "feature_requests"("status");

-- CreateIndex
CREATE INDEX "feature_requests_createdAt_idx" ON "feature_requests"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "feature_votes_featureRequestId_userId_key" ON "feature_votes"("featureRequestId", "userId");

-- CreateIndex
CREATE INDEX "user_fee_templates_userId_idx" ON "user_fee_templates"("userId");

-- CreateIndex
CREATE INDEX "user_fee_templates_userId_isActive_idx" ON "user_fee_templates"("userId", "isActive");

-- CreateIndex
CREATE INDEX "user_subscription_entry_fee_templates_subscriptionEntryId_idx" ON "user_subscription_entry_fee_templates"("subscriptionEntryId");

-- CreateIndex
CREATE INDEX "user_purchase_fees_userId_idx" ON "user_purchase_fees"("userId");

-- CreateIndex
CREATE INDEX "user_purchase_fees_userId_date_idx" ON "user_purchase_fees"("userId", "date");

-- CreateIndex
CREATE INDEX "user_purchase_fees_billingPeriodId_idx" ON "user_purchase_fees"("billingPeriodId");

-- CreateIndex
CREATE INDEX "user_purchase_fees_purchaseGroupId_idx" ON "user_purchase_fees"("purchaseGroupId");

-- CreateIndex
CREATE INDEX "user_purchase_discounts_userId_idx" ON "user_purchase_discounts"("userId");

-- CreateIndex
CREATE INDEX "user_purchase_discounts_userId_date_idx" ON "user_purchase_discounts"("userId", "date");

-- CreateIndex
CREATE INDEX "user_purchase_discounts_billingPeriodId_idx" ON "user_purchase_discounts"("billingPeriodId");

-- CreateIndex
CREATE INDEX "user_purchase_discounts_purchaseGroupId_idx" ON "user_purchase_discounts"("purchaseGroupId");

-- CreateIndex
CREATE INDEX "user_purchase_refunds_userId_idx" ON "user_purchase_refunds"("userId");

-- CreateIndex
CREATE INDEX "user_purchase_refunds_userId_date_idx" ON "user_purchase_refunds"("userId", "date");

-- CreateIndex
CREATE INDEX "user_purchase_refunds_billingPeriodId_idx" ON "user_purchase_refunds"("billingPeriodId");

-- CreateIndex
CREATE INDEX "user_purchase_refunds_purchaseGroupId_idx" ON "user_purchase_refunds"("purchaseGroupId");

-- CreateIndex
CREATE INDEX "user_purchase_groups_userId_idx" ON "user_purchase_groups"("userId");

-- CreateIndex
CREATE INDEX "user_purchase_groups_userId_purchasedAt_idx" ON "user_purchase_groups"("userId", "purchasedAt");

-- CreateIndex
CREATE INDEX "user_purchase_groups_saleAnnouncementId_idx" ON "user_purchase_groups"("saleAnnouncementId");

-- CreateIndex
CREATE INDEX "user_purchase_groups_subscriptionEntryId_idx" ON "user_purchase_groups"("subscriptionEntryId");

-- CreateIndex
CREATE INDEX "subscription_waitlist_entries_userId_idx" ON "subscription_waitlist_entries"("userId");

-- CreateIndex
CREATE INDEX "subscription_waitlist_entries_subscriptionId_idx" ON "subscription_waitlist_entries"("subscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_waitlist_entries_userId_subscriptionId_key" ON "subscription_waitlist_entries"("userId", "subscriptionId");

-- CreateIndex
CREATE INDEX "analytics_events_event_type_created_at_idx" ON "analytics_events"("event_type", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_entity_type_entity_id_created_at_idx" ON "analytics_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_user_id_created_at_idx" ON "analytics_events"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "analytics_events_created_at_idx" ON "analytics_events"("created_at");

-- CreateIndex
CREATE INDEX "user_sale_groups_userId_idx" ON "user_sale_groups"("userId");

-- CreateIndex
CREATE INDEX "user_sale_groups_userId_soldAt_idx" ON "user_sale_groups"("userId", "soldAt");

-- CreateIndex
CREATE INDEX "user_sale_entries_userBookEntryId_idx" ON "user_sale_entries"("userBookEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "user_sale_entries_saleGroupId_userBookEntryId_key" ON "user_sale_entries"("saleGroupId", "userBookEntryId");

-- CreateIndex
CREATE INDEX "data_requests_status_idx" ON "data_requests"("status");

-- CreateIndex
CREATE INDEX "sale_announcement_requests_status_idx" ON "sale_announcement_requests"("status");

-- CreateIndex
CREATE INDEX "import_sources_enabled_checkFrequency_idx" ON "import_sources"("enabled", "checkFrequency");

-- CreateIndex
CREATE INDEX "import_sources_subscriptionId_idx" ON "import_sources"("subscriptionId");

-- CreateIndex
CREATE INDEX "pending_month_imports_status_idx" ON "pending_month_imports"("status");

-- CreateIndex
CREATE INDEX "pending_month_imports_subscriptionId_year_month_idx" ON "pending_month_imports"("subscriptionId", "year", "month");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_managedCompanyId_fkey" FOREIGN KEY ("managedCompanyId") REFERENCES "book_box_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "authors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_authors" ADD CONSTRAINT "book_authors_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_contributions" ADD CONSTRAINT "artist_contributions_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_contributions" ADD CONSTRAINT "artist_contributions_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_bookBoxCompanyId_fkey" FOREIGN KEY ("bookBoxCompanyId") REFERENCES "book_box_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "book_box_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_editions" ADD CONSTRAINT "book_editions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_box_collections" ADD CONSTRAINT "book_box_collections_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_parentSubscriptionId_fkey" FOREIGN KEY ("parentSubscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "subscription_combo_components" ADD CONSTRAINT "subscription_combo_components_comboId_fkey" FOREIGN KEY ("comboId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_combo_components" ADD CONSTRAINT "subscription_combo_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_skip_policies" ADD CONSTRAINT "subscription_skip_policies_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_series" ADD CONSTRAINT "subscription_series_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skip_records" ADD CONSTRAINT "user_skip_records_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "subscription_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skip_records" ADD CONSTRAINT "user_skip_records_subscriptionMonthId_fkey" FOREIGN KEY ("subscriptionMonthId") REFERENCES "subscription_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skip_records" ADD CONSTRAINT "user_skip_records_userEntryId_fkey" FOREIGN KEY ("userEntryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_skip_records" ADD CONSTRAINT "user_skip_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_prepay_options" ADD CONSTRAINT "subscription_prepay_options_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_months" ADD CONSTRAINT "subscription_months_cardArtistId_fkey" FOREIGN KEY ("cardArtistId") REFERENCES "artists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_months" ADD CONSTRAINT "subscription_months_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "subscription_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_months" ADD CONSTRAINT "subscription_months_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_month_books" ADD CONSTRAINT "subscription_month_books_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_month_books" ADD CONSTRAINT "subscription_month_books_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_month_books" ADD CONSTRAINT "subscription_month_books_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "subscription_months"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcements" ADD CONSTRAINT "sale_announcements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcement_editions" ADD CONSTRAINT "sale_announcement_editions_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcement_editions" ADD CONSTRAINT "sale_announcement_editions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcement_edition_variants" ADD CONSTRAINT "sale_announcement_edition_variants_saleAnnouncementEdition_fkey" FOREIGN KEY ("saleAnnouncementEditionId") REFERENCES "sale_announcement_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcement_regions" ADD CONSTRAINT "sale_announcement_regions_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sale_interests" ADD CONSTRAINT "user_sale_interests_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "sale_announcements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sale_interests" ADD CONSTRAINT "user_sale_interests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_purchaseGroupId_fkey" FOREIGN KEY ("purchaseGroupId") REFERENCES "user_purchase_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_subscriptionEntryId_fkey" FOREIGN KEY ("subscriptionEntryId") REFERENCES "user_subscription_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_book_entries" ADD CONSTRAINT "user_book_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_status_history" ADD CONSTRAINT "ownership_status_history_userBookEntryId_fkey" FOREIGN KEY ("userBookEntryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_entries" ADD CONSTRAINT "user_subscription_entries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_entries" ADD CONSTRAINT "user_subscription_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sub_billing_periods" ADD CONSTRAINT "user_sub_billing_periods_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sub_billing_periods" ADD CONSTRAINT "user_sub_billing_periods_monthId_fkey" FOREIGN KEY ("monthId") REFERENCES "subscription_months"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_cost_changes" ADD CONSTRAINT "user_subscription_cost_changes_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_renewals" ADD CONSTRAINT "user_subscription_renewals_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_renewals" ADD CONSTRAINT "user_subscription_renewals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_transactions" ADD CONSTRAINT "purchase_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_edition_tags" ADD CONSTRAINT "user_edition_tags_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "book_editions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_edition_tags" ADD CONSTRAINT "user_edition_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sub_entry_tags" ADD CONSTRAINT "user_sub_entry_tags_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sub_entry_tags" ADD CONSTRAINT "user_sub_entry_tags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notifications" ADD CONSTRAINT "user_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_slots" ADD CONSTRAINT "sponsored_slots_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bug_reports" ADD CONSTRAINT "bug_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_requests" ADD CONSTRAINT "feature_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_featureRequestId_fkey" FOREIGN KEY ("featureRequestId") REFERENCES "feature_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_votes" ADD CONSTRAINT "feature_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_fee_templates" ADD CONSTRAINT "user_fee_templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_entry_fee_templates" ADD CONSTRAINT "user_subscription_entry_fee_templates_feeTemplateId_fkey" FOREIGN KEY ("feeTemplateId") REFERENCES "user_fee_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_subscription_entry_fee_templates" ADD CONSTRAINT "user_subscription_entry_fee_templates_subscriptionEntryId_fkey" FOREIGN KEY ("subscriptionEntryId") REFERENCES "user_subscription_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_fees" ADD CONSTRAINT "user_purchase_fees_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "user_sub_billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_fees" ADD CONSTRAINT "user_purchase_fees_feeTemplateId_fkey" FOREIGN KEY ("feeTemplateId") REFERENCES "user_fee_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_fees" ADD CONSTRAINT "user_purchase_fees_purchaseGroupId_fkey" FOREIGN KEY ("purchaseGroupId") REFERENCES "user_purchase_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_fees" ADD CONSTRAINT "user_purchase_fees_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_discounts" ADD CONSTRAINT "user_purchase_discounts_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "user_sub_billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_discounts" ADD CONSTRAINT "user_purchase_discounts_purchaseGroupId_fkey" FOREIGN KEY ("purchaseGroupId") REFERENCES "user_purchase_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_discounts" ADD CONSTRAINT "user_purchase_discounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_refunds" ADD CONSTRAINT "user_purchase_refunds_billingPeriodId_fkey" FOREIGN KEY ("billingPeriodId") REFERENCES "user_sub_billing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_refunds" ADD CONSTRAINT "user_purchase_refunds_purchaseGroupId_fkey" FOREIGN KEY ("purchaseGroupId") REFERENCES "user_purchase_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_refunds" ADD CONSTRAINT "user_purchase_refunds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_groups" ADD CONSTRAINT "user_purchase_groups_saleAnnouncementId_fkey" FOREIGN KEY ("saleAnnouncementId") REFERENCES "sale_announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_groups" ADD CONSTRAINT "user_purchase_groups_subscriptionEntryId_fkey" FOREIGN KEY ("subscriptionEntryId") REFERENCES "user_subscription_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_purchase_groups" ADD CONSTRAINT "user_purchase_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_waitlist_entries" ADD CONSTRAINT "subscription_waitlist_entries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_waitlist_entries" ADD CONSTRAINT "subscription_waitlist_entries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sale_groups" ADD CONSTRAINT "user_sale_groups_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sale_entries" ADD CONSTRAINT "user_sale_entries_saleGroupId_fkey" FOREIGN KEY ("saleGroupId") REFERENCES "user_sale_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sale_entries" ADD CONSTRAINT "user_sale_entries_userBookEntryId_fkey" FOREIGN KEY ("userBookEntryId") REFERENCES "user_book_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_requests" ADD CONSTRAINT "data_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_announcement_requests" ADD CONSTRAINT "sale_announcement_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "book_box_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_month_imports" ADD CONSTRAINT "pending_month_imports_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_month_imports" ADD CONSTRAINT "pending_month_imports_importSourceId_fkey" FOREIGN KEY ("importSourceId") REFERENCES "import_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

