export type ExternalVolumeSource = 'google_books' | 'open_library' | 'wikidata';

/** Normalized shape every external client returns, regardless of the source API's own schema. */
export interface ExternalVolumeCandidate {
  title: string;
  volumeNumber?: number;
  authorNames: string[];
  genres: string[];
  source: ExternalVolumeSource;
  /** The source API's own id for this volume — used with `source` + our seriesId for dedup. */
  sourceId: string;
  sourceUrl?: string;
  description?: string;
  publishedDate?: string;
}
