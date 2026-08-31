import { Injectable, Logger } from '@nestjs/common';
import type { ExternalVolumeCandidate } from '../series-discovery.types';
import { normalizeForMatch } from '../series-discovery.utils';

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
 *  - Internal "key:value" facets (e.g. "Series:once_upon_a_broken_heart", their own series
 *    metadata; "Nyt:young-adult-hardcover=2021-10-17", NYT bestseller-list membership) are
 *    dropped too — a real genre subject is a plain phrase and never contains a colon, so this is
 *    a safe blanket filter rather than an allowlist of every internal prefix OL happens to use.
 * Returns null when nothing genre-like is left (signals "drop this one"). */
function cleanGenreLabel(raw: string): string | null {
  if (raw.includes('--')) return null;
  if (raw.includes(':')) return null;
  let s = raw.includes('/') ? raw.slice(raw.lastIndexOf('/') + 1) : raw;
  s = s.trim().replace(/\.+$/, '').trim();
  if (!s) return null;
  return s.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

/** Open Library tags some docs with an internal "Series:<slug>" subject entry drawn from its own
 * series metadata (e.g. "Series:once_upon_a_broken_heart"). search.json has no real series
 * filter — it's free-text relevance search — so a prolific author's book from a totally
 * different series of theirs routinely surfaces as a top match for "<seriesName> <author>" and
 * sails past our own author/title matching alone (found in practice, 2026-08-31: Stephanie
 * Garber's "Once Upon a Broken Heart" suggested as a new "Caraval" volume).
 *
 * Requires OL's tag to positively confirm the series, rather than merely not contradict it — a
 * doc with no "Series:" tag at all is dropped too, not kept on an "unsure -> don't drop"
 * assumption. That's deliberately stricter than authorsLikelyMatch's policy in the service: over
 * 40 suggestions already sitting in prod, manually dismissed as junk, were exactly this shape —
 * author matched, but no series tag (or a contradicting one) — so in practice for this source
 * "unsure" has meant "wrong series" far more often than "sparse metadata, still a real match".
 * Costs recall (a real match with no OL series tag is dropped too) in favor of not littering the
 * queue with junk an admin has to notice and dismiss by hand. */
function openLibraryConfirmsSeries(subjects: string[] | undefined, seriesName: string): boolean {
  const tag = (subjects ?? []).find((s) => s.toLowerCase().startsWith('series:'));
  if (!tag) return false;
  const taggedSeries = normalizeForMatch(tag.slice('series:'.length).replace(/[-_]/g, ' '));
  const target = normalizeForMatch(seriesName);
  if (!taggedSeries || !target) return false;
  return taggedSeries === target || taggedSeries.includes(target) || target.includes(taggedSeries);
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
        .filter((doc) => openLibraryConfirmsSeries(doc.subject, seriesName))
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
