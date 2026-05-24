// Shared API response types used by both apps/api and apps/web

export type Role = 'ADMIN' | 'MODERATOR' | 'COMPANY_MANAGER' | 'USER';

export const OWNERSHIP_STATUSES = [
  'PREORDER',
  'SHIPPING',
  'OWNED',
  'BORROWED',
  'LENDED',
  'SOLD',
  'GIFTED_AWAY',
] as const;
export type OwnershipStatus = typeof OWNERSHIP_STATUSES[number];

export const READING_STATUSES = ['UNREAD', 'READ', 'DNF'] as const;
export type ReadingStatus = typeof READING_STATUSES[number];

export const READING_STATUS_LABELS: Record<ReadingStatus, string> = {
  UNREAD: 'Unread',
  READ: 'Read',
  DNF: 'DNF',
};

export const OWNERSHIP_STATUS_LABELS: Record<OwnershipStatus, string> = {
  PREORDER: 'Pre-order',
  SHIPPING: 'Shipping',
  OWNED: 'Owned',
  BORROWED: 'Borrowed',
  LENDED: 'Lended out',
  SOLD: 'Sold',
  GIFTED_AWAY: 'Gifted away',
};

export const OWNERSHIP_GROUPS: { label: string; statuses: OwnershipStatus[] }[] = [
  { label: 'In transit', statuses: ['PREORDER', 'SHIPPING'] },
  { label: 'In possession', statuses: ['OWNED', 'BORROWED'] },
  { label: 'Gone', statuses: ['LENDED', 'SOLD', 'GIFTED_AWAY'] },
];

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  preferredCurrency: string;
  timezone: string;
  timeFormat: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

export interface ApiBook {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  language: string;
  seriesName: string | null;
  volumeNumber: number | null;
  genres: string[];
  authors: ApiAuthor[];
  editions?: ApiBookEdition[];
  appearsInOmnibus?: Array<{
    id: string;
    volumeNumber: number | null;
    customTitle: string | null;
    edition: {
      id: string;
      slug: string;
      isOmnibus: boolean;
      additionalImages: string[];
      book: { id: string; slug: string; title: string };
      bookBoxCompany: { name: string; slug: string; brandColors?: string[] | null } | null;
    };
  }>;
}

export interface ApiAuthor {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  photoUrl: string | null;
  nationality: string | null;
  website: string | null;
  instagram: string | null;
  twitter: string | null;
  facebook: string | null;
  tiktok: string | null;
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
  additionalImages: string[];
  isSpecial: boolean;
  isOmnibus?: boolean;
  notes: string | null;
  bookBoxCompanyCustomName: string | null;
  bookBoxCompanyId?: string | null;
  bookBoxCompany?: { name: string; slug: string; brandColors?: string[] | null } | null;
  collection?: { id: string; name: string; slug: string } | null;
  collectionId?: string | null;
  artists?: Array<{ artist: ApiArtist; role: string }>;
  communityPhotoCover?: string | null;
  verifiedAt: string | null;
  submittedByUserId: string | null;
  // Edition commerce / access fields
  basePrice?: string | null;
  currency?: string | null;
  language?: string | null;
  features?: string[];
  firstAccessDate?: string | null;
  earlyAccessDate?: string | null;
  generalSaleDate?: string | null;
  book?: Pick<ApiBook, 'id' | 'slug' | 'title' | 'seriesName' | 'volumeNumber'> & {
    authors?: ApiAuthor[];
  };
  previousEdition?: {
    id: string;
    slug: string;
    additionalImages: string[];
    generalSaleDate?: string | null;
    bookBoxCompany?: { name: string; slug: string; brandColors?: string[] | null } | null;
    collection?: { id: string; name: string; slug: string } | null;
  } | null;
  nextEdition?: {
    id: string;
    slug: string;
    additionalImages: string[];
    generalSaleDate?: string | null;
    bookBoxCompany?: { name: string; slug: string; brandColors?: string[] | null } | null;
    collection?: { id: string; name: string; slug: string } | null;
  } | null;
}

export interface ApiBookBoxCollection {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  companyId: string;
  company?: { id: string; slug: string; name: string; logoUrl: string | null; brandColors?: string[] | null };
  _count?: { editions: number };
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiCompanyEdition {
  id: string;
  slug: string;
  additionalImages: string[];
  communityPhotoCover?: string | null;
  collectionId: string | null;
  subscriptionId: string | null;
  collection: { id: string; name: string; slug: string } | null;
  book: {
    id: string;
    slug: string;
    title: string;
    seriesName: string | null;
    volumeNumber: number | null;
    authors: { author: { id: string; name: string; slug: string } }[];
  };
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
  hasOfficialImagePermission: boolean;
  brandColors: string[];
  subscriptions?: ApiSubscription[];
  collections?: ApiBookBoxCollection[];
  editions?: ApiCompanyEdition[];
  _count?: { collections: number; editions: number };
}

export interface ApiSubscriptionSkipPolicy {
  type: string;
  maxSkips: number | null;
  maxConsecutive: number | null;
  windowMonths: number | null;
  skipDeadlineDaysBefore: number;
  skipDeadlineType: string;
  skipDeadlineDayOfMonth: number | null;
  notes: string | null;
  skipHow: string | null;
  allowUnskip: boolean;
  unskipDeadlineType: string;
  unskipDeadlineDaysBefore: number;
  unskipDeadlineDayOfMonth: number | null;
  unskipNotes: string | null;
  unskipHow: string | null;
  /** "ALL" | "MONTHLY_ONLY" | "PREPAID_ONLY" */
  eligibleBillingTypes: string;
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
  skipHow: string | null;
  nextDeadline: string | null;
  isPastDeadline: boolean;
  skippedMonths: { year: number; month: number }[];
  firstDeliverableMonth: { year: number; month: number } | null;
  allowUnskip: boolean;
  unskipHow: string | null;
  unskipNotes: string | null;
  nextUnskipDeadline: string | null;
  isUnskipPastDeadline: boolean;
}

export interface ApiSubscription {
  id: string;
  slug: string;
  companyId: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  logoUrl: string | null;
  genre: string | null;
  genres: string[];
  startDate: string | null;
  endDate: string | null;
  isDiscontinued: boolean;
  isUpcoming: boolean;
  upcomingNote: string | null;
  waitlistLink: string | null;
  isHidden: boolean;
  isContentStream: boolean;
  isBundleSubscription: boolean;
  currency: string;
  price: string | null;
  originalBasePrice: string | null;
  language: string | null;
  bookishMerch: boolean;
  isCombo: boolean;
  parentSubscriptionId: string | null;
  intervalMonths: number;
  contentType: string;
  shipsInternationally: boolean;
  renewalDay: number | null;
  renewalDayUserSet: boolean;
  startingMonth: number | null;
  renewalMonthOffset: number;
  paymentOnStartup: boolean;
  signupIncludesCurrentMonth: boolean;
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
  cardArtist: { id: string; name: string; slug: string; instagram: string | null } | null;
  books: ApiSubscriptionMonthBook[];
}

export interface ApiSubscriptionMonthBook {
  bookId: string;
  editionId: string | null;
  isMainBook: boolean;
  book: ApiBook;
  edition: ApiBookEdition | null;
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

export interface ApiSearchBook {
  id: string;
  slug: string;
  title: string;
  seriesName: string | null;
  volumeNumber: number | null;
  authors: { author: { id: string; name: string; slug: string } }[];
  editions: {
    bookBoxCompany: { slug: string; name: string; logoUrl: string | null } | null;
  }[];
}

export interface ApiSearchAuthor {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  nationality: string | null;
  _count: { books: number };
}

export interface ApiSearchArtist {
  id: string;
  name: string;
  slug: string;
  photoUrl: string | null;
  specialty: string | null;
}

export interface ApiSearchSubscription {
  id: string;
  slug: string;
  name: string;
  coverImage: string | null;
  type: string | null;
  isDiscontinued: boolean;
  company: { slug: string; name: string; logoUrl: string | null } | null;
}

export interface ApiSearchCompany {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  country: string | null;
}

export interface ApiSearchEdition {
  id: string;
  slug: string;
  additionalImages: string[];
  communityPhotoCover: string | null;
  publisher: string | null;
  generalSaleDate: string | null;
  bookBoxCompany: { name: string; slug: string; logoUrl: string | null } | null;
  book: {
    id: string;
    slug: string;
    title: string;
    seriesName: string | null;
    volumeNumber: number | null;
    authors: Array<{ author: { name: string } }>;
  };
}

export interface ApiSearchSale {
  id: string;
  title: string;
  imageUrl: string | null;
  generalSaleDate: string | null;
  isBundle: boolean;
  availableForPurchase: boolean;
  company: { name: string; slug: string; logoUrl: string | null } | null;
}

export interface ApiSearchResult {
  books: ApiSearchBook[];
  editions: ApiSearchEdition[];
  authors: ApiSearchAuthor[];
  artists: ApiSearchArtist[];
  subscriptions: ApiSearchSubscription[];
  companies: ApiSearchCompany[];
  sales: ApiSearchSale[];
  query: string;
  filter: string;
}


export interface ApiUserSubBillingPeriod {
  id: string;
  entryId: string;
  billedAt: string | null;           // ISO date string
  baseAmount: number | null;
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
  reason: string | null;
  notes: string | null;
  createdAt: string;
}


export interface ApiPurchaseGroup {
  id: string;
  userId: string;
  saleAnnouncementId: string | null;
  subscriptionEntryId?: string | null;
  title: string | null;
  totalAmount: number;
  currency: string;
  shippingAmount: number | null;
  purchasedAt: string;
  fromSubscription: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  bookEntries?: { id: string; bookId: string; editionId: string | null }[];
  saleAnnouncement?: { id: string; title: string } | null;
  bookCount?: number;
  perBookCost?: number;
  fees?: { id: string; name: string; amount: number; currency: string; category: string }[];
  discounts?: { id: string; name: string; amount: number; currency: string }[];
  refunds?: { id: string; amount: number; currency: string; date: string; reason: string | null }[];
}

export interface ApiSaleEntry {
  id: string;
  saleGroupId: string;
  userBookEntryId: string;
  allocatedAmount: number;
  purchaseCostInSaleCurrency: number | null;
  userBookEntry?: {
    id: string;
    ownershipStatus: string;
    edition?: {
      id: string;
      additionalImages?: string[];
      book: { id: string; title: string; slug: string };
      bookBoxCompany?: { id: string; name: string } | null;
    } | null;
  } | null;
}

export interface ApiSaleGroup {
  id: string;
  userId: string;
  title: string | null;
  totalAmount: number;
  currency: string;
  platform: string;
  soldAt: string;
  notes: string | null;
  priceDistribution: string;
  createdAt: string;
  updatedAt: string;
  entries: ApiSaleEntry[];
  totalPurchaseCost: number | null;
  profitLoss: number | null;
}

export interface ApiSaleAnnouncement {
  id: string;
  slug: string;
  title: string;
  companyId: string | null;
  generalSaleDate: string | null;
  firstAccessDate: string | null;
  earlyAccessDate: string | null;
  endsAt: string | null;
  saleTimezone: string | null;
  basePrice: number | null;
  subscriberBasePrice: number | null;
  currency: string | null;
  extraImagesJson: string[] | null;
  imageUrl: string | null;

  isBundle: boolean;
  expectedShipping: string | null;
  photoCredit: string | null;
  availableForPurchase: boolean;
  sourceUrl: string | null;
  createdAt: string;
  updatedAt: string;
  company?: { name: string; slug?: string | null; brandColors?: string[] } | null;
  editions?: Array<{
    id: string;
    edition: (ApiBookEdition & { book: ApiBook }) | null;
    editionId: string;
    sortOrder: number;
    price: number | null;
    currency: string;
    variants: Array<{
      id: string;
      signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped';
      price: number | null;
      currency: string | null;
    }>;
  }>;
  regions?: Array<{
    id: string;
    name: string;
    countryCodes: string; // JSON string array
    isDefault: boolean;
    generalSaleDate: string | null;
    firstAccessDate: string | null;
    earlyAccessDate: string | null;
    endsAt: string | null;
    saleTimezone: string | null;
    basePrice: number | null;
    subscriberBasePrice: number | null;
    currency: string | null;
  }>;
}

export interface ApiFeatureRequest {
  id: string;
  title: string;
  description: string;
  status: string;
  adminNote: string | null;
  userId: string | null;
  user?: { id: string; username: string; email?: string } | null;
  voteCount: number;
  userHasVoted: boolean;
  createdAt: string;
  updatedAt: string;
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

export interface ApiFeatureCategory {
  id: string;
  slug: string;
  label: string;
  group: string;
  isActive: boolean;
  sortOrder: number;
  includePatterns: string[];
  excludePatterns: string[];
  createdAt: string;
  updatedAt: string;
}