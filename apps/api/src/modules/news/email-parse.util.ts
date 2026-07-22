/**
 * Heuristics for the newsletter-email ingestion pipeline (spec section 2.2/2.2.1).
 * These run BEFORE the AI classification step so a "please confirm your
 * subscription" email never gets treated as a news item.
 */

const CONFIRMATION_PATTERNS = [
  /confirm\s+(your\s+)?(email\s+)?subscription/i,
  /verify\s+(your\s+)?email/i,
  /please\s+confirm/i,
  /click\s+(here\s+)?to\s+confirm/i,
  /activate\s+your\s+subscription/i,
  /double[\s-]?opt[\s-]?in/i,
];

export function looksLikeConfirmationEmail(subject: string, html: string): boolean {
  const haystack = `${subject}\n${html}`;
  return CONFIRMATION_PATTERNS.some((re) => re.test(haystack));
}

const ACTION_LINK_TEXT_RE = /confirm|verify|activate|yes,?\s*subscribe/i;

/** Finds the first `<a href="...">...</a>` whose href or visible text suggests a confirm/verify action. */
export function extractActionLink(html: string): string | null {
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(html)) !== null) {
    const [, href, innerHtml] = match;
    const text = innerHtml.replace(/<[^>]+>/g, ' ');
    if (ACTION_LINK_TEXT_RE.test(href) || ACTION_LINK_TEXT_RE.test(text)) {
      return href;
    }
  }
  return null;
}

// Common ESP open-tracking pixel domains, as a fallback when the pixel isn't
// identifiable purely by dimensions (many ESPs omit width/height attributes).
const TRACKING_DOMAIN_RE = /(list-manage\.com|mcusercontent\.com|klaviyomail\.com|klclick\.com|sendgrid\.net|mandrillapp\.com|ctrk\.email)/i;

/** Finds likely open-tracking pixel URLs (1x1 images, or known ESP tracking domains) to GET (spec 2.2 — "simulate open"). */
export function extractTrackingPixelUrls(html: string): string[] {
  const imgRe = /<img\b[^>]*>/gi;
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = imgRe.exec(html)) !== null) {
    const tag = match[0];
    const srcMatch = /src=["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const src = srcMatch[1];

    const isTinyPixel = /width=["']1["']/.test(tag) && /height=["']1["']/.test(tag);
    if (isTinyPixel || TRACKING_DOMAIN_RE.test(src)) {
      urls.add(src);
    }
  }
  return Array.from(urls);
}
