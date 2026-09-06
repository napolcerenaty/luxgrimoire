import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExternalVolumeCandidate } from '../series-discovery.types';
import { normalizeForMatch } from '../series-discovery.utils';

const USER_AGENT = 'LuxGrimoire/1.0 (+https://luxgrimoire.com)';
const MAX_RESULTS = 20;

interface GoogleBooksSeriesInfo {
  volumeSeries?: { seriesId: string; orderNumber?: number }[];
}

interface GoogleBooksVolumeInfo {
  title?: string;
  authors?: string[];
  categories?: string[];
  description?: string;
  publishedDate?: string;
  infoLink?: string;
  seriesInfo?: GoogleBooksSeriesInfo;
  /** BCP-47-ish language tag, usually a bare ISO 639-1 code ("en") but sometimes regioned
   * ("en-US"). Present on most volumes; `langRestrict` on the query is unreliable and still
   * returns foreign-language editions, so this is filtered again client-side. */
  language?: string;
}

/** `langRestrict` filters by Google's *interface* language guess, not the book's actual
 * language, so a query for an English series still comes back with German/Spanish/French
 * editions of the same books — which then look like brand-new volumes. Drop any volume whose
 * `language` is populated and doesn't match the target (bare-code compare, so "en-US" counts
 * as "en"). A volume with no `language` at all is kept — the field is near-ubiquitous but not
 * guaranteed, same best-effort stance as the Open Library client. */
function languageMatches(volumeLanguage: string | undefined, targetLanguage: string | undefined): boolean {
  if (!targetLanguage || !volumeLanguage) return true;
  return volumeLanguage.split('-')[0].toLowerCase() === targetLanguage.toLowerCase();
}

/** Google Books search is full-text relevance, not a series query: `<seriesName> inauthor:"X"`
 * pulls in every book X has written, and `seriesInfo` is sparse/absent for most novels. Mirror
 * the Open Library client's `openLibraryConfirmsSeries` policy — keep a volume only when
 * something POSITIVELY ties it to THIS series:
 *   1. it carries a `seriesInfo` seriesId equal to the one we've already locked onto for this
 *      series (either cached on BookSeries from a prior run, or adopted earlier in this same
 *      response from a title-confirmed volume), or
 *   2. the series name appears in the volume title (normalized, substring either direction).
 * A volume with neither is dropped rather than kept on an "unsure -> don't drop" assumption —
 * the same recall-for-precision trade the Open Library fix documents (found in practice
 * 2026-08-31: a prolific author's unrelated other series flooding the queue). */
function googleBooksConfirmsSeries(
  info: GoogleBooksVolumeInfo,
  seriesName: string,
  lockedSeriesId: string | null,
): boolean {
  if (lockedSeriesId && info.seriesInfo?.volumeSeries?.some((v) => v.seriesId === lockedSeriesId)) {
    return true;
  }
  const target = normalizeForMatch(seriesName);
  const title = normalizeForMatch(info.title ?? '');
  if (!target || !title) return false;
  return title === target || title.includes(target) || target.includes(title);
}

interface GoogleBooksVolume {
  id: string;
  volumeInfo?: GoogleBooksVolumeInfo;
}

export interface GoogleBooksSearchResult {
  candidates: ExternalVolumeCandidate[];
  /** The Google Books seriesId this search resolved to, if any — caller persists it on
   * BookSeries so future searches can match on seriesInfo directly instead of guessing. */
  seriesId: string | null;
  /** True on HTTP 429 — the unauthenticated quota is low enough in practice that even a single
   * manual "Check now" run can exhaust it partway through (observed 2026-08-25). The caller
   * uses this to stop calling Google Books for the rest of that run instead of guaranteed-
   * failing on every remaining series — retrying won't help until the quota resets. */
  rateLimited?: boolean;
}

@Injectable()
export class GoogleBooksClient {
  private readonly logger = new Logger(GoogleBooksClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Free tier works without an API key (lower quota); GOOGLE_BOOKS_API_KEY raises it if set.
   *
   * Results are filtered client-side before being returned as candidates:
   *  - language: `langRestrict` on the query is unreliable, so volumes whose `language` field
   *    contradicts `language` are dropped here too (see `languageMatches`).
   *  - series membership: full-text relevance search returns the author's whole catalogue, so a
   *    volume is kept only if it positively confirms this series — matching seriesId or the
   *    series name in the title (see `googleBooksConfirmsSeries`). Sparse `seriesInfo` on novels
   *    means this costs some recall; the review queue is the safety net for the rest.
   *
   * `language`, when given, is a two-letter ISO-639-1 code, passed through as `langRestrict`
   * AND enforced on the response. */
  async search(seriesName: string, authorNames: string[], cachedSeriesId: string | null, language?: string): Promise<GoogleBooksSearchResult> {
    const author = authorNames[0];
    const q = author ? `${seriesName} inauthor:"${author}"` : seriesName;
    const params = new URLSearchParams({ q, maxResults: String(MAX_RESULTS) });
    if (language) params.set('langRestrict', language);
    const apiKey = this.config.get<string>('GOOGLE_BOOKS_API_KEY');
    if (apiKey) params.set('key', apiKey);

    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status === 429) {
        this.logger.warn(
          apiKey
            ? 'Google Books rate-limited (429) despite a configured API key.'
            : 'Google Books rate-limited (429) — set GOOGLE_BOOKS_API_KEY (free, no billing needed) to raise the unauthenticated quota.',
        );
        return { candidates: [], seriesId: cachedSeriesId, rateLimited: true };
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { items?: GoogleBooksVolume[] };
      let seriesId = cachedSeriesId;
      const candidates: ExternalVolumeCandidate[] = [];

      for (const item of data.items ?? []) {
        const info = item.volumeInfo;
        if (!info?.title) continue;
        if (!languageMatches(info.language, language)) continue;
        if (!googleBooksConfirmsSeries(info, seriesName, seriesId)) continue;

        const volumeSeries = info.seriesInfo?.volumeSeries?.[0];
        // Adopt a seriesId only from a volume that already passed the series-confirmation gate
        // above — so we never lock onto (and cache) an id lifted from an unrelated book. Once
        // locked, later volumes sharing that id pass via rule 1 even without the series name in
        // their title (recovers e.g. later entries whose titles don't repeat the series name).
        if (!seriesId && volumeSeries?.seriesId) seriesId = volumeSeries.seriesId;

        candidates.push({
          title: info.title,
          volumeNumber: volumeSeries?.orderNumber,
          authorNames: info.authors ?? [],
          genres: info.categories ?? [],
          source: 'google_books',
          sourceId: item.id,
          sourceUrl: info.infoLink,
          description: info.description,
          publishedDate: info.publishedDate,
        });
      }

      return { candidates, seriesId };
    } catch (err) {
      this.logger.warn(`Google Books search failed for "${seriesName}": ${err}`);
      return { candidates: [], seriesId: cachedSeriesId };
    }
  }
}
