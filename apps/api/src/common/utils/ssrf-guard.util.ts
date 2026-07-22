import { BadRequestException } from '@nestjs/common';

/**
 * Rejects a URL that isn't a plain public https:// address — blocks loopback/private/
 * link-local ranges so server-side fetches (AI vision URLs, RSS/blog polling, etc.)
 * can't be pointed at internal infrastructure. Mirrors the inline checks already in
 * ai.service.ts (kept separate there — this is for new call sites only).
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (url.protocol !== 'https:') {
    throw new BadRequestException('URL must use https://');
  }
  const host = url.hostname.toLowerCase();
  const blocked =
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
  if (blocked) {
    throw new BadRequestException('URL points to a disallowed host');
  }
  return url;
}
