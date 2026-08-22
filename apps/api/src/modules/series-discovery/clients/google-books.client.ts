import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExternalVolumeCandidate } from '../series-discovery.types';

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
}

@Injectable()
export class GoogleBooksClient {
  private readonly logger = new Logger(GoogleBooksClient.name);

  constructor(private readonly config: ConfigService) {}

  /** Free tier works without an API key (lower quota); GOOGLE_BOOKS_API_KEY raises it if set.
   * Series data (`seriesInfo`) is well populated for comics/periodicals but sparse for novels —
   * callers should treat every result as a loose candidate, not a confirmed series member. */
  async search(seriesName: string, authorNames: string[], cachedSeriesId: string | null): Promise<GoogleBooksSearchResult> {
    const author = authorNames[0];
    const q = author ? `${seriesName} inauthor:"${author}"` : seriesName;
    const params = new URLSearchParams({ q, maxResults: String(MAX_RESULTS) });
    const apiKey = this.config.get<string>('GOOGLE_BOOKS_API_KEY');
    if (apiKey) params.set('key', apiKey);

    try {
      const response = await fetch(`https://www.googleapis.com/books/v1/volumes?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { items?: GoogleBooksVolume[] };
      let seriesId = cachedSeriesId;
      const candidates: ExternalVolumeCandidate[] = [];

      for (const item of data.items ?? []) {
        const info = item.volumeInfo;
        if (!info?.title) continue;

        const volumeSeries = info.seriesInfo?.volumeSeries?.[0];
        // Adopt the first seriesId we see when we don't have one cached yet — best-effort,
        // since most novel results won't carry seriesInfo at all.
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
