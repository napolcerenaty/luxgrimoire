import { Injectable, Logger, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { paginatedQuery } from '../../common/prisma.utils';
import { GoogleBooksClient } from './clients/google-books.client';
import { OpenLibraryClient } from './clients/open-library.client';
import { WikidataClient } from './clients/wikidata.client';
import type { ExternalVolumeCandidate } from './series-discovery.types';
import { normalizeForMatch } from './series-discovery.utils';

const DEFAULT_DAILY_BATCH = 20;

/** ISO 639-1 -> Wikidata "language of work or name" (P407) QID. Only languages independently
 * verified against Wikidata are listed — an unlisted language simply skips the P407 filter
 * (Wikidata results come back unfiltered by language) rather than risk a wrong QID silently
 * emptying that source for a whole language. */
const LANGUAGE_TO_WIKIDATA_QID: Record<string, string> = {
  en: 'Q1860',
  pl: 'Q809',
  fr: 'Q150',
};

/** ISO 639-1 -> ISO 639-2/B, for Open Library's `language` doc field. Same "only what's
 * verified" policy as above — English is unambiguous, so it's the only default entry. */
const LANGUAGE_TO_OPEN_LIBRARY_CODE: Record<string, string> = {
  en: 'eng',
};

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bundle/omnibus listings (box sets, "Trilogy" repackagings, multi-author marketing bundles
 * like "BookTok Bestsellers Boxed Set", etc.) show up in these free APIs as their own "book" —
 * they're not a new volume, just existing ones (sometimes not even from this series) repackaged.
 * Unconditional whole-word match on the admin-managed keyword list: an earlier version only
 * excluded when the title minus the keyword reduced to exactly the series name, to avoid
 * excluding a real book that merely mentions a keyword in its own subtitle — but that missed
 * real junk like "BookTok Bestsellers Boxed Set", which doesn't reduce to any specific series
 * name at all since it's a generic multi-author bundle that only matched a series via a loose
 * search-relevance hit (found in practice, 2026-08-25). A title genuinely needing one of these
 * words for other reasons is the rarer case — remove the keyword from the admin list if that
 * happens.
 *
 * `excludedKeywords` is the admin-managed list (SeriesDiscoveryExcludedKeyword) rather than a
 * hardcoded set — which bundle words a source actually uses in practice is discovered
 * empirically, so it needs to be editable without a deploy. An empty list disables this filter
 * entirely rather than matching everything. */
function isBundleListing(candidateTitle: string, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) return false;
  const pattern = new RegExp(`\\b(${excludedKeywords.map(escapeRegExp).join('|')})\\b`, 'i');
  return pattern.test(candidateTitle);
}

/** True unless the candidate clearly has a DIFFERENT author than every book we already have in
 * this series — a generic/ambiguous series name (a common word or phrase) can pull in a flood
 * of same-titled-ish but unrelated books from these full-text searches, none of which are
 * actually written by the series' author (found in practice, 2026-08-25). Deliberately permissive
 * when either side is unknown: `knownAuthors` is empty for a brand-new series with no books yet,
 * and `candidateAuthors` is always empty from Wikidata (fetchParts never populates it) — treating
 * "we can't tell" as a match avoids silently dropping every Wikidata result.
 *
 * Compares whole-word token sets rather than raw substrings — author names are often short
 * (surnames especially), so a titlesLikelyMatch-style `includes()` check would false-positive
 * on e.g. known author "Susanna Collins" matching candidate "Ann" (raw substring "ann" sits
 * inside "susANNa"). Token sets sidestep that: a match requires one side's whole names to all
 * appear as whole words on the other side (handles "Firstname Lastname" vs "Lastname,
 * Firstname" reordering and a bare surname matching a full name), not a fragment of one word
 * sitting inside a different word. */
function authorsLikelyMatch(candidateAuthors: string[], knownAuthors: string[]): boolean {
  if (candidateAuthors.length === 0 || knownAuthors.length === 0) return true;
  const knownTokenSets = knownAuthors
    .map((n) => normalizeForMatch(n).split(' ').filter(Boolean))
    .filter((tokens) => tokens.length > 0)
    .map((tokens) => new Set(tokens));

  return candidateAuthors.some((a) => {
    const candidateTokens = normalizeForMatch(a).split(' ').filter(Boolean);
    if (candidateTokens.length === 0) return false;
    return knownTokenSets.some(
      (knownTokens) =>
        candidateTokens.every((t) => knownTokens.has(t)) ||
        [...knownTokens].every((t) => candidateTokens.includes(t)),
    );
  });
}

interface SeriesForCheck {
  id: string;
  name: string;
  googleBooksSeriesId: string | null;
  openLibraryId: string | null;
  wikidataId: string | null;
}

@Injectable()
export class SeriesDiscoveryService {
  private readonly logger = new Logger(SeriesDiscoveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly googleBooks: GoogleBooksClient,
    private readonly openLibrary: OpenLibraryClient,
    private readonly wikidata: WikidataClient,
    private readonly config: ConfigService,
  ) {}

  /** ISO 639-1, e.g. "en". Global for now, not per-series: every book in the catalogue is
   * currently 'en' (Book.language defaults to it and the admin book form never sets it
   * otherwise), so there's no real per-series signal to detect yet — this is the honest,
   * simplest thing that matches today's actual data. Revisit if that ever changes. */
  private getTargetLanguage(): string {
    return this.config.get<string>('SERIES_DISCOVERY_LANGUAGE') || 'en';
  }

  /** Env SERIES_DISCOVERY_DAILY_BATCH, default 20 — the single source of truth for both the
   * cron and the manual "Check now" trigger, so they always agree on batch size. */
  private getDailyBatchSize(): number {
    const configured = Number(this.config.get<string>('SERIES_DISCOVERY_DAILY_BATCH'));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_DAILY_BATCH;
  }

  /** Shared by the daily cron and the manual admin "Check now" trigger — both process the same
   * bounded, oldest-checked-first batch (`limit` defaults to the configured daily batch size
   * when not given explicitly), so a manual click behaves exactly like the cron: it advances
   * through the catalog 20 (by default) series at a time rather than re-checking the same ones
   * or running the whole catalog at once. Each processed series' `lastCheckedAt` gets bumped to
   * now, so the *next* click naturally picks up the next batch. A completed series is excluded
   * entirely (`isCompleted = false` in the where clause) — zero API calls for it until an admin
   * unmarks it. */
  async runCheck(options: { limit?: number } = {}): Promise<{ seriesChecked: number; suggestionsCreated: number; googleBooksRateLimited: boolean }> {
    const limit = options.limit ?? this.getDailyBatchSize();
    const series = await this.prisma.bookSeries.findMany({
      where: { isCompleted: false },
      orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }],
      take: limit,
      select: { id: true, name: true, googleBooksSeriesId: true, openLibraryId: true, wikidataId: true },
    });
    // Fetched once per run, not per-series/per-candidate — this list rarely changes and isn't
    // worth a query per item.
    const excludedKeywords = (await this.prisma.seriesDiscoveryExcludedKeyword.findMany({ select: { keyword: true } })).map((k) => k.keyword);
    // Mutable, shared across the loop below: once Google Books returns 429, every remaining
    // series in this run skips it entirely instead of guaranteed-failing on each one — the
    // unauthenticated quota doesn't reset mid-run, so retrying wastes a request and 300ms for
    // no benefit. Open Library and Wikidata are unaffected and keep running normally.
    let googleBooksRateLimited = false;

    let suggestionsCreated = 0;
    for (const s of series) {
      try {
        const result = await this.checkSeries(s, excludedKeywords, googleBooksRateLimited);
        suggestionsCreated += result.created;
        googleBooksRateLimited ||= result.googleBooksRateLimited;
      } catch (err) {
        this.logger.error(`series-discovery failed for "${s.name}" (${s.id}): ${err}`);
      }
      // Be polite to free, rate-limited APIs — small gap between series.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    return { seriesChecked: series.length, suggestionsCreated, googleBooksRateLimited };
  }

  private async checkSeries(
    series: SeriesForCheck,
    excludedKeywords: string[],
    skipGoogleBooks: boolean,
  ): Promise<{ created: number; googleBooksRateLimited: boolean }> {
    const authorNames = await this.getAuthorNames(series.id);
    const language = this.getTargetLanguage();

    let wikidataId = series.wikidataId;
    if (!wikidataId) {
      wikidataId = await this.wikidata.resolveSeriesId(series.name);
    }

    const [googleResult, openLibraryCandidates, wikidataCandidates] = await Promise.allSettled([
      skipGoogleBooks
        ? Promise.resolve({ candidates: [] as ExternalVolumeCandidate[], seriesId: series.googleBooksSeriesId })
        : this.googleBooks.search(series.name, authorNames, series.googleBooksSeriesId, language),
      this.openLibrary.search(series.name, authorNames, LANGUAGE_TO_OPEN_LIBRARY_CODE[language]),
      wikidataId ? this.wikidata.fetchParts(wikidataId, LANGUAGE_TO_WIKIDATA_QID[language]) : Promise.resolve([] as ExternalVolumeCandidate[]),
    ]);

    const candidates: ExternalVolumeCandidate[] = [];
    let googleBooksSeriesId = series.googleBooksSeriesId;
    let googleBooksRateLimited = false;
    if (googleResult.status === 'fulfilled') {
      candidates.push(...googleResult.value.candidates);
      googleBooksSeriesId = googleResult.value.seriesId;
      googleBooksRateLimited = 'rateLimited' in googleResult.value && googleResult.value.rateLimited === true;
    } else {
      this.logger.warn(`Google Books check errored for "${series.name}": ${googleResult.reason}`);
    }
    if (openLibraryCandidates.status === 'fulfilled') candidates.push(...openLibraryCandidates.value);
    if (wikidataCandidates.status === 'fulfilled') candidates.push(...wikidataCandidates.value);

    const created = await this.createNewSuggestions(series.id, candidates, excludedKeywords, authorNames);

    await this.prisma.bookSeries.update({
      where: { id: series.id },
      data: { lastCheckedAt: new Date(), googleBooksSeriesId, wikidataId },
    });

    return { created, googleBooksRateLimited };
  }

  private async createNewSuggestions(
    seriesId: string,
    candidates: ExternalVolumeCandidate[],
    excludedKeywords: string[],
    knownAuthorNames: string[],
  ): Promise<number> {
    if (candidates.length === 0) return 0;

    const existing = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId },
      select: { volumeNumbers: true, book: { select: { title: true } } },
    });
    const existingVolumeNumbers = new Set(existing.flatMap((e) => e.volumeNumbers));
    const existingTitles = existing.map((e) => e.book.title);

    let created = 0;
    for (const candidate of candidates) {
      if (isBundleListing(candidate.title, excludedKeywords)) continue;
      if (!authorsLikelyMatch(candidate.authorNames, knownAuthorNames)) continue;
      // volumeNumber is the stronger signal (titles vary across translations/editions), so
      // check it first when available; fall back to loose title matching otherwise.
      if (candidate.volumeNumber !== undefined && existingVolumeNumbers.has(candidate.volumeNumber)) continue;
      if (existingTitles.some((t) => titlesLikelyMatch(t, candidate.title))) continue;

      const alreadySuggested = await this.prisma.seriesVolumeSuggestion.findUnique({
        where: { seriesId_source_sourceId: { seriesId, source: candidate.source, sourceId: candidate.sourceId } },
        select: { id: true },
      });
      if (alreadySuggested) continue;

      await this.prisma.seriesVolumeSuggestion.create({
        data: {
          seriesId,
          title: candidate.title,
          authorNames: candidate.authorNames,
          volumeNumber: candidate.volumeNumber,
          genres: candidate.genres,
          source: candidate.source,
          sourceId: candidate.sourceId,
          sourceUrl: candidate.sourceUrl,
          description: candidate.description,
          publishedDate: candidate.publishedDate,
        },
      });
      created++;
    }
    return created;
  }

  private async getAuthorNames(seriesId: string): Promise<string[]> {
    const entries = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId },
      select: { book: { select: { authors: { select: { author: { select: { name: true } } } } } } },
    });
    const names = new Set<string>();
    for (const entry of entries) for (const a of entry.book.authors) names.add(a.author.name);
    return Array.from(names);
  }

  // ─── Admin CRUD for the suggestions queue ──────────────────────────────────

  findSuggestions(page = 1, pageSize = 30, status?: string) {
    const where = status ? { status } : {};
    return paginatedQuery(
      page, pageSize,
      (skip, take) => this.prisma.seriesVolumeSuggestion.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take,
        include: { series: { select: { id: true, slug: true, name: true } } },
      }),
      () => this.prisma.seriesVolumeSuggestion.count({ where }),
    );
  }

  // Both mutate by id only, no other guard — a row can legitimately vanish between the admin's
  // list loading and their click (cascade-deleted with its parent series, or removed from another
  // tab/session), which Prisma reports as P2025 "record not found". Surfacing that as a clean 404
  // instead of the raw Prisma error lets the frontend show a real message instead of a silent
  // failure — see series-suggestions/page.tsx's onError handlers.
  async updateSuggestionStatus(id: string, status: string, adminNote?: string) {
    try {
      return await this.prisma.seriesVolumeSuggestion.update({
        where: { id },
        data: { status, ...(adminNote !== undefined && { adminNote }) },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('This suggestion no longer exists — it may have already been removed.');
      }
      throw err;
    }
  }

  async removeSuggestion(id: string) {
    try {
      return await this.prisma.seriesVolumeSuggestion.delete({ where: { id } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
        throw new NotFoundException('This suggestion no longer exists — it may have already been removed.');
      }
      throw err;
    }
  }

  // ─── Admin-managed bundle/omnibus keyword list ─────────────────────────────

  listExcludedKeywords() {
    return this.prisma.seriesDiscoveryExcludedKeyword.findMany({ orderBy: { keyword: 'asc' } });
  }

  async addExcludedKeyword(keyword: string) {
    const normalized = keyword.trim().toLowerCase();
    try {
      return await this.prisma.seriesDiscoveryExcludedKeyword.create({ data: { keyword: normalized } });
    } catch {
      throw new ConflictException(`"${normalized}" is already in the excluded-keyword list`);
    }
  }

  removeExcludedKeyword(id: string) {
    return this.prisma.seriesDiscoveryExcludedKeyword.delete({ where: { id } });
  }
}
