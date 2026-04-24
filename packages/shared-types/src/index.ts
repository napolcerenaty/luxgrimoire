// Shared API response types used by both apps/api and apps/web

export type Role = 'ADMIN' | 'MODERATOR' | 'COMPANY_MANAGER' | 'USER';

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  preferredCurrency: string;
  timezone: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface ApiBook {
  id: string;
  slug: string;
  title: string;
  altTitle: string | null;
  description: string | null;
  coverImage: string | null;
  language: string;
  seriesName: string | null;
  volumeNumber: number | null;
  genres: string[];
  authors: ApiAuthor[];
  editions?: ApiBookEdition[];
}

export interface ApiAuthor {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
}

export interface ApiArtist {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  specialty: string | null;
  website: string | null;
  instagram: string | null;
  twitter: string | null;
  facebook: string | null;
  tiktok: string | null;
}

export interface ApiBookEdition {
  id: string;
  slug: string;
  bookId: string;
  publisher: string | null;
  publishYear: number | null;
  format: string | null;
  coverImage: string | null;
  additionalImages: string[];
  isSpecial: boolean;
  notes: string | null;
  editionName: string | null;
  bookBoxCompanyCustomName: string | null;
  bookBoxCompany?: { name: string; slug: string } | null;
  collection?: { id: string; name: string; slug: string } | null;
  collectionId?: string | null;
  artists: Array<{ artist: ApiArtist; role: string }>;
  verifiedAt: string | null;
  submittedByUserId: string | null;
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'coverImage' | 'seriesName' | 'volumeNumber'> & {
    authors?: ApiAuthor[];
  };
}

export interface ApiBookBoxCollection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  isActive: boolean;
  companyId: string;
  company?: { id: string; slug: string; name: string; logoUrl: string | null };
  _count?: { editions: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiBookBoxCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  country: string | null;
  defaultCurrency: string | null;
  instagram: string | null;
  threads: string | null;
  tiktok: string | null;
  facebook: string | null;
  x: string | null;
  bluesky: string | null;
  iossImplemented: boolean;
  subscriptions?: ApiSubscription[];
  collections?: ApiBookBoxCollection[];
  sponsoredSlots?: ApiSponsoredSlot[];
}

export interface ApiSubscriptionSkipPolicy {
  type: string;
  maxSkips: number | null;
  maxConsecutive: number | null;
  windowMonths: number | null;
  skipDeadlineDaysBefore: number;
  notes: string | null;
}

export interface ApiSkipStatus {
  policyType: string;
  totalSkips: number;
  skipsInWindow: number;
  consecutiveSkips: number;
  maxSkips: number | null;
  maxConsecutive: number | null;
  canSkip: boolean;
  warnings: string[];
  notes: string | null;
  nextDeadline: string | null;
  isPastDeadline: boolean;
}

export interface ApiSubscription {
  id: string;
  slug: string;
  companyId: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  genre: string | null;
  genres: string[];
  startDate: string | null;
  endDate: string | null;
  isDiscontinued: boolean;
  currency: string;
  price: string | null;
  language: string | null;
  bookishMerch: boolean;
  isCombo: boolean;
  parentSubscriptionId: string | null;
  type: string | null;
  shipsInternationally: boolean;
  renewalDay: number | null;
  renewalDayUserSet: boolean;
  startingMonth: number | null;
  skipPolicy?: ApiSubscriptionSkipPolicy | null;
  company?: ApiBookBoxCompany;
  months?: ApiSubscriptionMonth[];
  components?: { componentId: string; component?: ApiSubscription }[];
}

export interface ApiSubscriptionMonth {
  id: string;
  subscriptionId: string;
  year: number;
  month: number;
  theme: string | null;
  coverImage: string | null;
  isSpoiler: boolean;
  books: ApiSubscriptionMonthBook[];
}

export interface ApiSubscriptionMonthBook {
  bookId: string;
  editionId: string | null;
  isMainBook: boolean;
  book: ApiBook;
  edition: ApiBookEdition | null;
}

export interface ApiSponsoredSlot {
  id: string;
  companyId: string;
  type: 'HOMEPAGE_FEATURED' | 'COMPANY_PAGE_BANNER' | 'NEWSLETTER_SLOT';
  startsAt: string;
  endsAt: string;
  priceEur: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company: ApiBookBoxCompany;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiAdminUser {
  id: string;
  username: string;
  email: string;
  role: string;
  managedCompanyId: string | null;
  managedCompany?: { name: string; slug: string } | null;
  createdAt: string;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}

export interface ApiUserSubBillingPeriod {
  id: string;
  entryId: string;
  billedAt: string | null;           // ISO date string
  baseAmount: number | null;
  taxesAndFees: number | null;
  shipping: number | null;
  paidCurrency: string | null;       // currency the payment was made in
  monthsCovered: number;
  coveredFromMonth: number;
  coveredFromYear: number;
  coveredToMonth: number | null;
  coveredToYear: number | null;
  prepayOptionId: string | null;
  notes: string | null;
}

export interface ApiExchangeRate {
  from: string;
  to: string;
  date: string;   // YYYY-MM-DD
  rate: number;
}

export interface ApiAuditLog {
  id: string;
  userId: string | null;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  entityTitle: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface ApiAdminStats {
  totalBooks: number;
  totalEditions: number;
  totalAuthors: number;
  totalArtists: number;
  totalCompanies: number;
  totalSubscriptions: number;
  totalUsers: number;
  totalAuditLogs: number;
  actionsLast7Days: number;
}

// ─────────────────────────────────────────────
// FEES & TAXES
// ─────────────────────────────────────────────

export type FeeCategory = 'VAT' | 'CUSTOMS' | 'PROCESSING' | 'FORWARDING' | 'OTHER';

export interface ApiFeeTemplate {
  id: string;
  userId: string;
  name: string;
  category: FeeCategory;
  defaultAmount: number | null;
  defaultCurrency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiPurchaseFee {
  id: string;
  userId: string;
  feeTemplateId: string | null;
  feeTemplate?: { id: string; name: string } | null;
  name: string;
  amount: number;
  currency: string;
  date: string;
  category: FeeCategory;
  billingPeriodId: string | null;
  userBookEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ApiPurchaseDiscount {
  id: string;
  userId: string;
  name: string;
  amount: number;
  currency: string;
  date: string;
  billingPeriodId: string | null;
  userBookEntryId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ApiPurchaseRefund {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  date: string;
  billingPeriodId: string | null;
  userBookEntryId: string | null;
  reason: string | null;
  notes: string | null;
  createdAt: string;
}


export interface ApiPurchaseGroup {
  id: string;
  userId: string;
  saleAnnouncementId: string | null;
  title: string | null;
  totalAmount: number;
  currency: string;
  shippingAmount: number | null;
  purchasedAt: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bookEntries?: { id: string; bookId: string; editionId: string | null }[];
  saleAnnouncement?: { id: string; title: string } | null;
  bookCount?: number;
  perBookCost?: number;
}

export interface ApiSaleAnnouncement {
  id: string;
  slug: string;
  title: string;
  companyId: string | null;
  description: string | null;
  generalSaleDate: string | null;
  firstAccessDate: string | null;
  earlyAccessDate: string | null;
  endsAt: string | null;
  saleTimezone: string | null;
  basePrice: number | null;
  currency: string | null;
  imageUrl: string | null;
  extraImagesJson: string | null;
  isPublished: boolean;
  isBundle: boolean;
  availableForPurchase: boolean;
  createdAt: string;
  updatedAt: string;
  editions?: Array<{
    edition: (ApiBookEdition & { book: ApiBook }) | null;
    editionId: string;
    sortOrder: number;
    price: number | null;
    currency: string;
  }>;
}

export interface ApiWaitlistEntry {
  id: string;
  userId: string;
  subscriptionId: string;
  joinedAt: string;
  leftAt: string | null;
  daysOnList: number;
  isActive: boolean;
  subscription: {
    id: string;
    slug: string;
    name: string;
    coverImage: string | null;
    isDiscontinued: boolean;
    company: { id: string; name: string; slug: string; logoUrl: string | null } | null;
  };
}

export interface ApiSubscriptionSeries {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  startMonth: number;
  startYear: number;
  endMonth: number;
  endYear: number;
  /** 'INDIVIDUAL' | 'SERIES_ONLY' */
  skipMode: string;
  canCancelDuring: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  subscription: { id: string; slug: string; name: string };
  months?: Array<{
    id: string;
    year: number;
    month: number;
    theme: string | null;
    coverImage: string | null;
  }>;
  _count?: { months: number };
}

