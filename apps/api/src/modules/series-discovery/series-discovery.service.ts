import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginatedQuery } from '../../common/prisma.utils';
import { GoogleBooksClient } from './clients/google-books.client';
import { OpenLibraryClient } from './clients/open-library.client';
import { WikidataClient } from './clients/wikidata.client';
import type { ExternalVolumeCandidate } from './series-discovery.types';

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

/** Normalizes a title for loose duplicate-detection only (never stored) — same idea as
 * BookSeriesService's normalizeSeriesName (including stripping every standalone "the"/"a"/"an",
 * not just a leading one — see that function's docblock for why), but for comparing
 * external-API titles against titles/series names we already have, where punctuation/subtitle
 * differences are common. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\b(the|an?)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Bundle/omnibus listings (box sets, "Trilogy" repackagings, etc.) show up in these free APIs
 * as their own "book" with the series name plus a bundle word for a title — they're not a new
 * volume, just existing ones repackaged, and would otherwise look like one. Matches only when
 * the title minus the bundle word normalizes to EXACTLY the series name (e.g. "Arc of a Scythe
 * Trilogy", "The Arc of a Scythe Boxed Set") — deliberately exact equality, not the same loose
 * substring check as titlesLikelyMatch: a real book titled e.g. "Test Saga: The Bundle
 * Conspiracy" also contains "bundle" and would otherwise get wrongly excluded, since its title
 * happens to start with the series name too (found via a real false-positive while testing this).
 *
 * `excludedKeywords` is the admin-managed list (SeriesDiscoveryExcludedKeyword) rather than a
 * hardcoded set — which bundle words a source actually uses in practice is discovered
 * empirically, so it needs to be editable without a deploy. An empty list disables this filter
 * entirely rather than matching everything. */
function isBundleListing(candidateTitle: string, seriesName: string, excludedKeywords: string[]): boolean {
  if (excludedKeywords.length === 0) return false;
  const pattern = new RegExp(`\\b(${excludedKeywords.map(escapeRegExp).join('|')})\\b`, 'gi');
  const withoutBundleWord = candidateTitle.replace(pattern, ' ');
  if (withoutBundleWord === candidateTitle) return false; // no bundle word present at all
  const normalizedRemainder = normalizeTitle(withoutBundleWord);
  return normalizedRemainder !== '' && normalizedRemainder === normalizeTitle(seriesName);
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
    private readonly notifications: NotificationsService,
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

  /** Shared by the daily cron (bounded, oldest-checked-first batch) and the manual admin
   * trigger (no limit — whole non-completed catalog). A completed series is excluded entirely
   * (`isCompleted = false` in the where clause) — zero API calls for it until an admin
   * unmarks it. */
  async runCheck(options: { limit?: number } = {}): Promise<{ seriesChecked: number; suggestionsCreated: number; googleBooksRateLimited: boolean }> {
    const series = await this.prisma.bookSeries.findMany({
      where: { isCompleted: false },
      orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }],
      take: options.limit,
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

    if (suggestionsCreated > 0) {
      await this.notifyAdmins(suggestionsCreated);
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

    const created = await this.createNewSuggestions(series.id, series.name, candidates, excludedKeywords);

    await this.prisma.bookSeries.update({
      where: { id: series.id },
      data: { lastCheckedAt: new Date(), googleBooksSeriesId, wikidataId },
    });

    return { created, googleBooksRateLimited };
  }

  private async createNewSuggestions(seriesId: string, seriesName: string, candidates: ExternalVolumeCandidate[], excludedKeywords: string[]): Promise<number> {
    if (candidates.length === 0) return 0;

    const existing = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId },
      select: { volumeNumbers: true, book: { select: { title: true } } },
    });
    const existingVolumeNumbers = new Set(existing.flatMap((e) => e.volumeNumbers));
    const existingTitles = existing.map((e) => e.book.title);

    let created = 0;
    for (const candidate of candidates) {
      if (isBundleListing(candidate.title, seriesName, excludedKeywords)) continue;
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

  private async notifyAdmins(count: number): Promise<void> {
    const admins = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'MODERATOR'] } },
      select: { id: true },
    });
    const title = 'New series volumes found';
    const body = `${count} new possible volume${count === 1 ? '' : 's'} awaiting review`;
    for (const admin of admins) {
      await this.notifications.createNotification(admin.id, 'series_volume_suggestions', title, body).catch(() => {});
    }
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

  updateSuggestionStatus(id: string, status: string, adminNote?: string) {
    return this.prisma.seriesVolumeSuggestion.update({
      where: { id },
      data: { status, ...(adminNote !== undefined && { adminNote }) },
    });
  }

  removeSuggestion(id: string) {
    return this.prisma.seriesVolumeSuggestion.delete({ where: { id } });
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
