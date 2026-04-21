// Shared API response types used by both apps/api and apps/web

export type Role = 'ADMIN' | 'MODERATOR' | 'USER';

export interface ApiUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  preferredCurrency: string;
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
  artists: Array<{ artist: ApiArtist; role: string }>;
}

export interface ApiBookBoxCompany {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  website: string | null;
  country: string | null;
  subscriptions?: ApiSubscription[];
  sponsoredSlots?: ApiSponsoredSlot[];
}

export interface ApiSubscription {
  id: string;
  slug: string;
  companyId: string;
  name: string;
  description: string | null;
  coverImage: string | null;
  genre: string | null;
  startDate: string | null;
  endDate: string | null;
  isDiscontinued: boolean;
  currency: string;
  company?: ApiBookBoxCompany;
  months?: ApiSubscriptionMonth[];
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

export interface ApiSaleAnnouncement {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  sourceUrl: string | null;
  images: string[];
  isPublished: boolean;
  editions: Array<{
    book: ApiBook;
    edition: ApiBookEdition | null;
    price: number | null;
    currency: string;
  }>;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
