import { Injectable, Logger } from '@nestjs/common';
import type { ExternalVolumeCandidate } from '../series-discovery.types';

const USER_AGENT = 'LuxGrimoire/1.0 (+https://luxgrimoire.com; series-discovery)';

interface WikidataSearchEntity {
  id: string;
  description?: string;
}

interface SparqlValue {
  value: string;
}

interface SparqlBinding {
  part: SparqlValue;
  partLabel?: SparqlValue;
  ordinal?: SparqlValue;
  pubDate?: SparqlValue;
}

@Injectable()
export class WikidataClient {
  private readonly logger = new Logger(WikidataClient.name);

  /** Wikidata's public endpoints (both the wbsearchentities API and the WDQS SPARQL endpoint)
   * are known to be flaky under load — a 502/503/504 is usually transient and often clears on
   * an immediate retry (observed a real 502 on the SPARQL endpoint, 2026-08-25). Anything else
   * (4xx, network error, genuine timeout) is not retried — retrying a client-side timeout would
   * just wait twice as long for the same likely outcome. */
  private async fetchWithRetry(url: string, headers: Record<string, string>, timeoutMs: number): Promise<Response> {
    const attempt = () => fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    const first = await attempt();
    if (first.ok || ![502, 503, 504].includes(first.status)) return first;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return attempt();
  }

  /** Resolves a series name to a Wikidata QID once — caller caches the result on BookSeries so
   * this search (fuzzy, best-effort) never has to run again for the same series. */
  async resolveSeriesId(seriesName: string): Promise<string | null> {
    const params = new URLSearchParams({
      action: 'wbsearchentities',
      search: seriesName,
      language: 'en',
      type: 'item',
      format: 'json',
      limit: '5',
    });

    try {
      const response = await this.fetchWithRetry(`https://www.wikidata.org/w/api.php?${params}`, { 'User-Agent': USER_AGENT }, 15_000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { search?: WikidataSearchEntity[] };
      const results = data.search ?? [];
      // Prefer a result whose description mentions "series" (book/comic/manga series etc.) —
      // otherwise fall back to the top hit. Both are best-effort; a bad match just yields no
      // useful P527 parts on the next call, not a wrong Book row (nothing auto-creates).
      const match = results.find((r) => /series/i.test(r.description ?? '')) ?? results[0];
      return match?.id ?? null;
    } catch (err) {
      this.logger.warn(`Wikidata entity search failed for "${seriesName}": ${err}`);
      return null;
    }
  }

  /** P527 (has part) on the series item, with P1545 (series ordinal) qualifier on each part's
   * P179 (part of the series) statement where available.
   *
   * `languageQid`, when given, requires each part to have that Wikidata language item (Q1860
   * for English, etc.) as its P407 "language of work or name" — filters out foreign-language
   * editions, which would otherwise look like a "new volume" of a book already in the catalogue. */
  async fetchParts(wikidataId: string, languageQid?: string): Promise<ExternalVolumeCandidate[]> {
    const languageFilter = languageQid ? `wd:${wikidataId} wdt:P527 ?part . ?part wdt:P407 wd:${languageQid} .` : `wd:${wikidataId} wdt:P527 ?part .`;
    const sparql = `
      SELECT ?part ?partLabel ?ordinal ?pubDate WHERE {
        ${languageFilter}
        OPTIONAL {
          ?part p:P179 ?stmt .
          ?stmt ps:P179 wd:${wikidataId} .
          ?stmt pq:P1545 ?ordinal .
        }
        OPTIONAL { ?part wdt:P577 ?pubDate . }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }
    `.trim();

    try {
      const response = await this.fetchWithRetry(
        `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`,
        { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        20_000,
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = (await response.json()) as { results?: { bindings?: SparqlBinding[] } };
      const bindings = data.results?.bindings ?? [];

      return bindings
        .filter((b) => b.part?.value && b.partLabel?.value)
        .map((b) => ({
          title: b.partLabel!.value,
          volumeNumber: b.ordinal ? Number(b.ordinal.value) : undefined,
          authorNames: [],
          genres: [],
          source: 'wikidata' as const,
          sourceId: b.part.value.split('/').pop() ?? b.part.value,
          sourceUrl: b.part.value,
          publishedDate: b.pubDate?.value?.slice(0, 10),
        }));
    } catch (err) {
      this.logger.warn(`Wikidata SPARQL fetch failed for ${wikidataId}: ${err}`);
      return [];
    }
  }
}
