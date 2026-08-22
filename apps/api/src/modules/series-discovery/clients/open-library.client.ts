import { Injectable, Logger } from '@nestjs/common';
import type { ExternalVolumeCandidate } from '../series-discovery.types';

const USER_AGENT = 'LuxGrimoire/1.0 (+https://luxgrimoire.com)';
const LIMIT = 20;

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  subject?: string[];
}

@Injectable()
export class OpenLibraryClient {
  private readonly logger = new Logger(OpenLibraryClient.name);

  /** No API key, no documented hard limit — free-text search only, no reliable volume-number
   * field, so candidates from here rely on the caller's title-based dedup rather than
   * volumeNumber matching. */
  async search(seriesName: string, authorNames: string[]): Promise<ExternalVolumeCandidate[]> {
    const author = authorNames[0];
    const params = new URLSearchParams({
      q: author ? `${seriesName} ${author}` : seriesName,
      fields: 'key,title,author_name,first_publish_year,subject',
      limit: String(LIMIT),
    });

    try {
      const response = await fetch(`https://openlibrary.org/search.json?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { docs?: OpenLibraryDoc[] };
      return (data.docs ?? [])
        .filter((doc): doc is OpenLibraryDoc & { title: string } => Boolean(doc.title))
        .map((doc) => ({
          title: doc.title,
          authorNames: doc.author_name ?? [],
          genres: (doc.subject ?? []).slice(0, 5),
          source: 'open_library' as const,
          sourceId: doc.key,
          sourceUrl: `https://openlibrary.org${doc.key}`,
          publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
        }));
    } catch (err) {
      this.logger.warn(`Open Library search failed for "${seriesName}": ${err}`);
      return [];
    }
  }
}
