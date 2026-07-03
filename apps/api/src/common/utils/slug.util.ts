import slugify from 'slugify';
import { randomBytes } from 'crypto';

// Billing/plan terms that add no meaningful information to a slug
const NOISE_PATTERN = /\b(monthly|quarterly|annual(?:ly)?|yearly|bi-?monthly|base\s+payment|bases\s+payment|payment\s+plan|payment|plan|subscription)\b/gi;

export function generateSlug(name: string): string {
  const base = slugify(name, { lower: true, strict: true, trim: true });
  const suffix = randomBytes(4).toString('hex'); // 8 chars
  return `${base}-${suffix}`;
}

/**
 * Builds a clean slug base for a subscription from company name + sub name:
 * 1. If the sub name starts with the company name, strip that prefix (avoids duplication).
 * 2. Strip common billing/plan noise words (monthly, payment, plan, etc.).
 * 3. If nothing meaningful remains, fall back to company name alone.
 */
export function generateSubscriptionSlug(companyName: string, subName: string): string {
  const companyNorm = companyName.trim().toLowerCase();
  const subNorm = subName.trim().toLowerCase();

  // Remove company name prefix from sub name to avoid "locked-library-locked-library-..."
  let cleaned = subNorm.startsWith(companyNorm)
    ? subName.slice(companyName.trim().length).trim()
    : subName.trim();

  // Strip billing noise
  cleaned = cleaned.replace(NOISE_PATTERN, ' ').replace(/\s+/g, ' ').trim();

  // If nothing meaningful remains, use company name alone
  const base = cleaned.length >= 2 ? cleaned : companyName.trim();
  return generateSlug(base);
}

export function generateSlugFromParts(...parts: (string | null | undefined)[]): string {
  const filtered = parts.filter(Boolean).join(' ');
  return generateSlug(filtered);
}
