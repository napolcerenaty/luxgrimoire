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
      const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(15_000),
      });
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
   * P179 (part of the series) statement where available. */
  async fetchParts(wikidataId: string): Promise<ExternalVolumeCandidate[]> {
    const sparql = `
      SELECT ?part ?partLabel ?ordinal ?pubDate WHERE {
        wd:${wikidataId} wdt:P527 ?part .
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
      const response = await fetch(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
        signal: AbortSignal.timeout(20_000),
      });
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
