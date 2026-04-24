import type { ApiFeeTemplate, ApiPurchaseFee, FeeCategory } from '@luxgrimoire/shared-types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error?.message ?? `API error ${res.status}`);
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const qs = activeOnly ? '?activeOnly=true' : '';
  const res = await fetch(`${API_URL}/fees/templates${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createFeeTemplate(data: CreateFeeTemplateData): Promise<ApiFeeTemplate> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/templates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function updateFeeTemplate(id: string, data: UpdateFeeTemplateData): Promise<ApiFeeTemplate> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/templates/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deleteFeeTemplate(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/templates/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_URL}/fees${qs}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseFee(data: CreatePurchaseFeeData): Promise<ApiPurchaseFee> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseFee(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/${id}`, {
    method: 'DELETE',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const res = await fetch(`${API_URL}/fees/discounts${params.toString() ? '?' + params.toString() : ''}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseDiscount(data: CreatePurchaseDiscountData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseDiscount> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/discounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseDiscount(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/discounts/${id}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Subscription Waitlist
// ─────────────────────────────────────────────

export async function getMyWaitlist(): Promise<import('@luxgrimoire/shared-types').ApiWaitlistEntry[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/waitlist/me`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getMyWaitlistStatus(slug: string): Promise<{ id: string; joinedAt: string; leftAt: string | null } | null> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist/me`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function joinWaitlist(slug: string, joinedAt?: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(joinedAt ? { joinedAt } : {}),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function updateWaitlistDate(slug: string, joinedAt: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ joinedAt }),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function getMySubscriptionEntry(slug: string): Promise<{
  shippingCost: string | null;
  taxesAndFees: string | null;
  basePrice: string | null;
  costCurrency: string | null;
  active: boolean;
  prepaidMonths: number;
  renewalDay: number | null;
  nextRenewalDate: string | null;
  cancellationDate: string | null;
  cancellationReason: string | null;
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  if (!token) return null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry`, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) return null;
  return res.json();
}

export async function leaveWaitlist(slug: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/waitlist`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function cancelMySubscriptionEntry(
  slug: string,
  data: { cancellationDate?: string; cancellationReason?: string },
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry/cancel`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.json().then(d => d.message)) || `API error ${res.status}`);
}

export async function updateMyEntryCosts(
  slug: string,
  data: {
    basePrice?: string;
    shippingCost?: string;
    taxesAndFees?: string;
    costCurrency?: string;
    linkedFeeTemplates?: Array<{ templateId: string; customAmount?: number | null; customCurrency?: string | null }>;
  },
): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/subscriptions/${slug}/my-entry/costs`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const params = new URLSearchParams();
  if (opts?.billingPeriodId) params.set('billingPeriodId', opts.billingPeriodId);
  if (opts?.userBookEntryId) params.set('userBookEntryId', opts.userBookEntryId);
  if (opts?.purchaseGroupId) params.set('purchaseGroupId', opts.purchaseGroupId);
  const res = await fetch(`${API_URL}/fees/refunds${params.toString() ? '?' + params.toString() : ''}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function createPurchaseRefund(data: CreatePurchaseRefundData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseRefund> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/refunds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseRefund(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/fees/refunds/${id}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
  editionIds: string[];
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
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/collection/bundles`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function getPurchaseGroup(id: string): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
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
}

export async function getCountryFeeHints(slug: string, country: string): Promise<CountryFeeHint[]> {
  const token = localStorage.getItem('luxgrimoire_token')
  if (!token) return []
  const res = await fetch(`${API_URL}/subscriptions/${slug}/country-fees?country=${country}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return []
  return res.json()
}

export async function createPurchaseGroup(data: CreatePurchaseGroupData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/collection/bundles`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function updatePurchaseGroup(id: string, data: UpdatePurchaseGroupData): Promise<import('@luxgrimoire/shared-types').ApiPurchaseGroup> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function deletePurchaseGroup(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/collection/bundles/${id}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

// ─────────────────────────────────────────────
// Sale Announcements (Admin + Public)
// ─────────────────────────────────────────────

export interface SaleAnnouncementFormData {
  title: string;
  companyId?: string;
  description?: string;
  generalSaleDate?: string;
  firstAccessDate?: string;
  earlyAccessDate?: string;
  saleTimezone?: string;
  basePrice?: number;
  currency?: string;
  imageUrl?: string;
  isPublished?: boolean;
  isBundle?: boolean;
  availableForPurchase?: boolean;
  editionIds?: string[];
}

export async function adminGetSaleAnnouncements(): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement[]> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/announcements/admin`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminCreateSaleAnnouncement(data: SaleAnnouncementFormData): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/announcements/admin`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminUpdateSaleAnnouncement(id: string, data: SaleAnnouncementFormData): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/announcements/admin/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}

export async function adminDeleteSaleAnnouncement(id: string): Promise<void> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('luxgrimoire_token') : null;
  const res = await fetch(`${API_URL}/announcements/admin/${id}`, {
    method: 'DELETE',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
}

export async function getSaleAnnouncement(id: string): Promise<import('@luxgrimoire/shared-types').ApiSaleAnnouncement> {
  const res = await fetch(`${API_URL}/announcements/${id}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error((await res.text()) || `API error ${res.status}`);
  return res.json();
}