import type { ApiFeeTemplate, ApiPurchaseFee, FeeCategory } from '@luxgrimoire/shared-types';
import { API_BASE as API_URL } from './authFetch';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    const msg = error?.message ?? `API error ${res.status}`;
    throw new Error(msg);
  }

  return res.json();
}

// ─────────────────────────────────────────────
// Fee Templates
// ─────────────────────────────────────────────

export interface CreateFeeTemplateData {
  name: string;
  category?: FeeCategory;
  defaultAmount?: number;
  defaultCurrency?: string;
}

export interface UpdateFeeTemplateData {
  name?: string;
  category?: FeeCategory;
  defaultAmount?: number | null;
  defaultCurrency?: string;
  isActive?: boolean;
}

export async function getFeeTemplates(activeOnly?: boolean): Promise<ApiFeeTemplate[]> {
  const qs = activeOnly ? '?activeOnly=true' : '';
  const res = await fetch(`${API_URL}/fees/templates${qs}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createFeeTemplate(data: CreateFeeTemplateData): Promise<ApiFeeTemplate> {
  const res = await fetch(`${API_URL}/fees/templates`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function updateFeeTemplate(id: string, data: UpdateFeeTemplateData): Promise<ApiFeeTemplate> {
  const res = await fetch(`${API_URL}/fees/templates/${id}`, {
    credentials: 'include',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deleteFeeTemplate(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/fees/templates/${id}`, {
    credentials: 'include',
    method: 'DELETE',
    headers: {
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Purchase Fees
// ─────────────────────────────────────────────

export interface GetPurchaseFeesOpts {
  billingPeriodId?: string;
  userBookEntryId?: string;
  purchaseGroupId?: string;
}

export interface CreatePurchaseFeeData {
  feeTemplateId?: string;
  name: string;
  amount: number;
  currency: string;
  date: string;
  category?: FeeCategory;
  billingPeriodId?: string;
  userBookEntryId?: string;
  purchaseGroupId?: string;
  notes?: string;
}

export async function getPurchaseFees(opts?: GetPurchaseFeesOpts): Promise<ApiPurchaseFee[]> {
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_URL}/fees${qs}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseFee(data: CreatePurchaseFeeData): Promise<ApiPurchaseFee> {
  const res = await fetch(`${API_URL}/fees`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseFee(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/fees/${id}`, {
    credentials: 'include',
    method: 'DELETE',
    headers: {
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ── Purchase Discounts ────────────────────────────────────────────────────────

export interface CreatePurchaseDiscountData {
  name: string;
  amount: number;
  currency: string;
  date: string;
  billingPeriodId?: string;
  userBookEntryId?: string;
  purchaseGroupId?: string;
  notes?: string;
}

export async function getDiscounts(opts?: { billingPeriodId?: string; userBookEntryId?: string; purchaseGroupId?: string }): Promise<import('@luxgrimoire/shared-types').ApiPurchaseDiscount[]> {
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const res = await fetch(`${API_URL}/fees/discounts${params.toString() ? '?' + params.toString() : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseDiscount(data: CreatePurchaseDiscountData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseDiscount> {
  const res = await fetch(`${API_URL}/fees/discounts`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseDiscount(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/fees/discounts/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────

export async function getSubscriptions(params?: {
  status?: 'active' | 'discontinued' | 'upcoming';
  pageSize?: number;
  companySlug?: string;
}): Promise<{ data: import('@luxgrimoire/shared-types').ApiSubscription[]; total: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params?.companySlug) qs.set('companySlug', params.companySlug);
  const res = await fetch(`${API_URL}/subscriptions?${qs}`, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
// Subscription Waitlist
// ─────────────────────────────────────────────

export async function getMyWaitlist(): Promise<import('@luxgrimoire/shared-types').ApiWaitlistEntry[]> {
  const res = await fetch(`${API_URL}/subscriptions/waitlist/me`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getMyWaitlistStatus(slug: string): Promise<{ id: string; joinedAt: string; leftAt: string | null } | null> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist/me`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function joinWaitlist(slug: string, joinedAt?: string): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(joinedAt ? { joinedAt } : {}),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function updateWaitlistDate(slug: string, joinedAt: string): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    credentials: 'include',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ joinedAt }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function getMySubscriptionEntry(slug: string): Promise<{
  shippingCost: string | null;
  basePrice: string | null;
  costCurrency: string | null;
  active: boolean;
  isForwarding: boolean;
  prepaidMonths: number;
  renewalDay: number | null;
  nextRenewalDate: string | null;
  nextRenewalAmount: string | null;
  nextRenewalCurrency: string | null;
  nextRenewalPriceChanged: boolean;
  nextRenewalNewPrice: string | null;
  cancellationDate: string | null;
  cancellationReason: string | null;
  scheduledPrepayOptionId: string | null;
  membershipHistory: Array<{ id: string; startDate: string | null; endDate: string | null; cancellationReason: string | null }>;
  feeTemplates: Array<{
    customAmount: string | null;
    customCurrency: string | null;
    feeTemplate: {
      id: string;
      name: string;
      defaultAmount: string | null;
      defaultCurrency: string;
      isActive: boolean;
    };
  }>;
} | null> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry`, {
    credentials: 'include',
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function leaveWaitlist(slug: string): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function cancelMySubscriptionEntry(
  slug: string,
  data: { cancellationDate?: string; cancellationReason?: string },
): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry/cancel`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().then(d => d.message)) || `API error ${res.status}`);
}

export async function removeMySubscriptionEntry(
  slug: string,
  opts: { removeBooks: boolean; removeSpending: boolean; historyId?: string; removeAllPeriods?: boolean; removeCurrentOnly?: boolean },
): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry`, {
    credentials: 'include',
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.message ?? 'Failed to remove subscription')
  }
}

export async function updateMyEntryCosts(
  slug: string,
  data: {
    basePrice?: string;
    shippingCost?: string;
    costCurrency?: string;
    isForwarding?: boolean;
    linkedFeeTemplates?: Array<{ templateId: string; customAmount?: number | null; customCurrency?: string | null }>;
  },
): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry/costs`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().then(d => d.message)) || `API error ${res.status}`);
}


// ── Purchase Refunds ──────────────────────────────────────────────────────────

export interface CreatePurchaseRefundData {
  amount: number;
  currency: string;
  date: string;
  billingPeriodId?: string;
  userBookEntryId?: string;
  purchaseGroupId?: string;
  reason?: string;
  notes?: string;
}

export async function getRefunds(opts?: { billingPeriodId?: string; userBookEntryId?: string; purchaseGroupId?: string }): Promise<import('@luxgrimoire/shared-types').ApiPurchaseRefund[]> {
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const res = await fetch(`${API_URL}/fees/refunds${params.toString() ? '?' + params.toString() : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseRefund(data: CreatePurchaseRefundData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseRefund> {
  const res = await fetch(`${API_URL}/fees/refunds`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseRefund(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/fees/refunds/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Purchase Groups (Bundles)
// ─────────────────────────────────────────────

export interface CreatePurchaseGroupData {
  saleAnnouncementId?: string;
  title?: string;
  totalAmount: number;
  currency: string;
  shippingAmount?: number;
  purchasedAt: string;
  notes?: string;
  orderNumber?: string;
  ownershipStatus?: string;
  isSecondHand?: boolean;
  sourcePlatform?: string;
  editionIds: string[];
  editionSignatureTypes?: Record<string, string>;
  editionSaleAnnouncementEditionIds?: Record<string, string>;
}

export interface UpdatePurchaseGroupData {
  title?: string;
  totalAmount?: number;
  currency?: string;
  shippingAmount?: number;
  purchasedAt?: string;
  notes?: string;
}

export async function getPurchaseGroups(): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup[]> {
  const res = await fetch(`${API_URL}/collection/bundles`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getPurchaseGroup(id: string): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────
// Country Fee Hints
// ─────────────────────────────────────────────

export interface CountryFeeHint {
  category: string
  count: number
  totalSubscribers: number
  avgAmount: number | null
  currency: string | null
  avgShipping: number | null
  shippingCurrency: string | null
  shippingCount: number
}

export async function getCountryFeeHints(slug: string, country: string): Promise<CountryFeeHint[]> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/country-fees?country=${country}`, {
    credentials: 'include',
  })
  if (!res.ok) return []
  return res.json()
}

export async function createPurchaseGroup(data: CreatePurchaseGroupData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const res = await fetch(`${API_URL}/collection/bundles`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function updatePurchaseGroup(id: string, data: UpdatePurchaseGroupData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    credentials: 'include',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseGroup(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Sale Groups (selling books)
// ─────────────────────────────────────────────

export interface CreateSaleGroupData {
  title?: string;
  totalAmount: number;
  currency: string;
  platform?: string;
  soldAt: string;
  notes?: string;
  priceDistribution: 'EQUAL' | 'CUSTOM';
  entryIds: string[];
  customAmounts?: Record<string, number>;
}

export interface UpdateSaleGroupData {
  title?: string;
  totalAmount?: number;
  currency?: string;
  platform?: string;
  soldAt?: string;
  notes?: string;
  customAmounts?: Record<string, number>;
}

export async function getSaleGroups(): Promise<import('@luxgrimoire/shared-types').ApiSaleGroup[]> {
  const res = await fetch(`${API_URL}/sales`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  const json = await res.json();
  // API now returns paginated { data, total, page, pageSize } — extract data array
  return Array.isArray(json) ? json : (json.data ?? json);
}

export interface PaginatedSaleGroups {
  data: import('@luxgrimoire/shared-types').ApiSaleGroup[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export async function getSaleGroupsPaginated(page = 1, pageSize = 20, search?: string): Promise<PaginatedSaleGroups> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
  if (search) params.set('search', search)
  const res = await fetch(`${API_URL}/sales?${params}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createSaleGroup(data: CreateSaleGroupData): Promise<import('@luxgrimoire/shared-types').ApiSaleGroup> {
  const res = await fetch(`${API_URL}/sales`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function updateSaleGroup(id: string, data: UpdateSaleGroupData): Promise<import('@luxgrimoire/shared-types').ApiSaleGroup> {
  const res = await fetch(`${API_URL}/sales/${id}`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deleteSaleGroup(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/sales/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Sale Announcements (Admin + Public)
// ─────────────────────────────────────────────

export interface SaleAnnouncementFormData {
  title: string;
  companyId?: string;
  generalSaleDate?: string | null;
  firstAccessDate?: string | null;
  earlyAccessDate?: string | null;
  endsAt?: string | null;
  saleTimezone?: string;
  basePrice?: number;
  currency?: string;
  subscriberBasePrice?: number | null;
  imageUrl?: string;
  extraImages?: string[];

  saleType?: import('@luxgrimoire/shared-types').SaleType;
  isSoldOut?: boolean;
  notes?: string | null;

  isBundle?: boolean;
  expectedShipping?: string;
  photoCredit?: string;
  sourceUrl?: string;
  editionIds?: string[];
}

export async function adminGetSaleAnnouncements(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  companyId?: string;
  saleType?: import('@luxgrimoire/shared-types').SaleType;
}): Promise<{ data: import('@luxgrimoire/shared-types').ApiSaleAnnouncement[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params?.search) qs.set('search', params.search);
  if (params?.companyId) qs.set('companyId', params.companyId);
  if (params?.saleType) qs.set('saleType', params.saleType);
  const res = await fetch(`${API_URL}/announcements/admin?${qs}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminCreateSaleAnnouncement(data: SaleAnnouncementFormData): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin`, {
    credentials: 'include',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminUpdateSaleAnnouncement(id: string, data: SaleAnnouncementFormData): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}`, {
    credentials: 'include',
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDuplicateSaleAnnouncement(id: string): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/duplicate`, {
    credentials: 'include',
    method: 'POST',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDeleteSaleAnnouncement(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function adminAddAnnouncementEdition(id: string, editionId: string): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ editionId }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminSetAnnouncementEditionReprint(id: string, editionId: string, isReprint: boolean): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/${editionId}/reprint`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isReprint }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminSetAnnouncementEditionStandalone(id: string, editionId: string, isStandalone: boolean): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/${editionId}/standalone`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isStandalone }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminSetAllAnnouncementEditionsReprint(id: string, isReprint: boolean): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/reprint-all`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isReprint }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminRemoveAnnouncementEdition(id: string, editionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/${editionId}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function adminSetAnnouncementVariant(
  id: string, editionId: string,
  signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped',
  price?: number | null, currency?: string | null,
): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/${editionId}/variants`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ signatureType, price, currency }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminRemoveAnnouncementVariant(
  id: string, editionId: string,
  signatureType: 'unsigned' | 'signed' | 'autopen' | 'digitally_signed' | 'signed_bookplate' | 'stamped',
): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${id}/editions/${editionId}/variants/${signatureType}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function adminUpsertAnnouncementRegion(saleId: string, data: {
  id?: string;
  name: string;
  countryCodes?: string;
  isDefault?: boolean;
  generalSaleDate?: string | null;
  firstAccessDate?: string | null;
  earlyAccessDate?: string | null;
  endsAt?: string | null;
  isSoldOut?: boolean;
  saleTimezone?: string | null;
  basePrice?: number | null;
  currency?: string | null;
  subscriberBasePrice?: number | null;
}): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/regions`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDeleteAnnouncementRegion(saleId: string, regionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/regions/${regionId}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function adminCreateAnnouncementItem(saleId: string, data: { name?: string }): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncementItem> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/items`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminUpdateAnnouncementItem(saleId: string, itemId: string, data: { name?: string; sortOrder?: number }): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncementItem> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/items/${itemId}`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDeleteAnnouncementItem(saleId: string, itemId: string): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/items/${itemId}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function adminAssignEditionToItem(saleId: string, editionId: string, itemId: string | null): Promise<void> {
  const res = await fetch(`${API_URL}/announcements/admin/${saleId}/editions/${editionId}/item`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itemId }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function getSaleAnnouncement(id: string): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/${id}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}
// ─── Feature Requests ─────────────────────────────────────────────────────────
export async function submitFeatureRequest(data: { title: string; description: string }): Promise<import('@luxgrimoire/shared-types').ApiFeatureRequest> {
  const res = await fetch(`${API_URL}/feature-requests`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getFeatureRequests(params?: { page?: number; pageSize?: number; status?: string }): Promise<{ data: import('@luxgrimoire/shared-types').ApiFeatureRequest[]; total: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  if (params?.status) qs.set('status', params.status);
  const res = await fetch(`${API_URL}/feature-requests?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getMyFeatureRequests(): Promise<import('@luxgrimoire/shared-types').ApiFeatureRequest[]> {
  const res = await fetch(`${API_URL}/feature-requests/my`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function voteFeatureRequest(id: string): Promise<{ voted: boolean }> {
  const res = await fetch(`${API_URL}/feature-requests/${id}/vote`, {
    credentials: 'include',
    method: 'POST',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminGetFeatureRequests(params?: { page?: number; status?: string }): Promise<{ data: import('@luxgrimoire/shared-types').ApiFeatureRequest[]; total: number; totalPages: number }> {
  const qs = new URLSearchParams();
  if (params?.page) qs.set('page', String(params.page));
  if (params?.status) qs.set('status', params.status);
  const res = await fetch(`${API_URL}/feature-requests/admin?${qs}`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminReviewFeatureRequest(id: string, data: { status: 'accepted' | 'rejected' | 'implemented'; adminNote?: string }): Promise<import('@luxgrimoire/shared-types').ApiFeatureRequest> {
  const res = await fetch(`${API_URL}/feature-requests/${id}/review`, {
    credentials: 'include',
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDeleteFeatureRequest(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/feature-requests/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function listSubscriptionPriceChanges(slug: string): Promise<Array<{
  id: string; effectiveMonth: number; effectiveYear: number; newBasePrice: string; currency: string; notes: string | null; createdAt: string;
}>> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/price-changes`, { credentials: 'include' });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createSubscriptionPriceChange(slug: string, data: {
  effectiveMonth: number; effectiveYear: number; newBasePrice: number; currency: string; notes?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/price-changes`, {
    credentials: 'include',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deleteSubscriptionPriceChange(slug: string, id: string): Promise<void> {
  const res = await fetch(`${API_URL}/subscriptions/${slug}/price-changes/${id}`, {
    credentials: 'include',
    method: 'DELETE',
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}
