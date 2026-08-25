import { Injectable, Logger } from '@nestjs/common';
import type { ExternalVolumeCandidate } from '../series-discovery.types';

const USER_AGENT = 'LuxGrimoire/1.0 (+https://luxgrimoire.com)';
const LIMIT = 20;

/** Open Library's `subject` field is raw library-catalog data (LCSH headings, BISAC codes),
 * not curated genre tags — e.g. real values seen in practice: "Death--Fiction.",
 * "Murder--Fiction.", "Science fiction.", "YOUNG ADULT FICTION / Science Fiction", "Science
 * fiction". This cleans that up into something fit to prefill a genre picker with:
 *  - LCSH headings containing "--" (topic--form subdivisions, e.g. "Death--Fiction") are
 *    dropped entirely — the topic half ("Death") isn't a genre, and keeping just the form half
 *    ("Fiction") would be true of nearly every book and add no signal.
 *  - BISAC-style "Broad Category / Specific Genre" paths keep only the last (most specific) part.
 *  - Trailing periods are stripped and casing is normalized to Title Case, so near-duplicates
 *    like "Science fiction." / "Science fiction" / ".../Science Fiction" collapse into one tag
 *    instead of showing up as three near-identical chips.
 * Returns null when nothing genre-like is left (signals "drop this one"). */
function cleanGenreLabel(raw: string): string | null {
  if (raw.includes('--')) return null;
  let s = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  s = s.trim().replace(/\.+$/, '').trim();
  if (!s) return null;
  return s.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

interface OpenLibraryDoc {
  key: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  subject?: string[];
  /** ISO 639-2/B codes, e.g. "eng" — present on some docs, absent on many (sparse data). */
  language?: string[];
}

@Injectable()
export class OpenLibraryClient {
  private readonly logger = new Logger(OpenLibraryClient.name);

  /** No API key, no documented hard limit — free-text search only, no reliable volume-number
   * field, so candidates from here rely on the caller's title-based dedup rather than
   * volumeNumber matching.
   *
   * `languageCode639_2`, when given, filters out docs whose `language` field is populated and
   * doesn't include it — search.json has no server-side language filter (requested but not
   * shipped as of writing), so this is client-side and best-effort. A doc with no `language`
   * field at all is kept rather than dropped, since the field is sparse, not because it's
   * confirmed to match. */
  async search(seriesName: string, authorNames: string[], languageCode639_2?: string): Promise<ExternalVolumeCandidate[]> {
    const author = authorNames[0];
    const params = new URLSearchParams({
      q: author ? `${seriesName} ${author}` : seriesName,
      fields: 'key,title,author_name,first_publish_year,subject,language',
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
        .filter((doc) => !languageCode639_2 || !doc.language?.length || doc.language.includes(languageCode639_2))
        .map((doc) => ({
          title: doc.title,
          authorNames: doc.author_name ?? [],
          genres: Array.from(new Set((doc.subject ?? []).map(cleanGenreLabel).filter((g): g is string => g !== null))).slice(0, 5),
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
