import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { paginatedQuery } from '../../common/prisma.utils';
import { GoogleBooksClient } from './clients/google-books.client';
import { OpenLibraryClient } from './clients/open-library.client';
import { WikidataClient } from './clients/wikidata.client';
import type { ExternalVolumeCandidate } from './series-discovery.types';

/** Normalizes a title for loose duplicate-detection only (never stored) — same idea as
 * BookSeriesService's normalizeSeriesName, but for comparing external-API titles against
 * titles we already have, where punctuation/subtitle differences are common. */
function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function titlesLikelyMatch(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
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
  ) {}

  /** Shared by the daily cron (bounded, oldest-checked-first batch) and the manual admin
   * trigger (no limit — whole non-completed catalog). A completed series is excluded entirely
   * (`isCompleted = false` in the where clause) — zero API calls for it until an admin
   * unmarks it. */
  async runCheck(options: { limit?: number } = {}): Promise<{ seriesChecked: number; suggestionsCreated: number }> {
    const series = await this.prisma.bookSeries.findMany({
      where: { isCompleted: false },
      orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }],
      take: options.limit,
      select: { id: true, name: true, googleBooksSeriesId: true, openLibraryId: true, wikidataId: true },
    });

    let suggestionsCreated = 0;
    for (const s of series) {
      try {
        suggestionsCreated += await this.checkSeries(s);
      } catch (err) {
        this.logger.error(`series-discovery failed for "${s.name}" (${s.id}): ${err}`);
      }
      // Be polite to free, rate-limited APIs — small gap between series.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    if (suggestionsCreated > 0) {
      await this.notifyAdmins(suggestionsCreated);
    }

    return { seriesChecked: series.length, suggestionsCreated };
  }

  private async checkSeries(series: SeriesForCheck): Promise<number> {
    const authorNames = await this.getAuthorNames(series.id);

    let wikidataId = series.wikidataId;
    if (!wikidataId) {
      wikidataId = await this.wikidata.resolveSeriesId(series.name);
    }

    const [googleResult, openLibraryCandidates, wikidataCandidates] = await Promise.allSettled([
      this.googleBooks.search(series.name, authorNames, series.googleBooksSeriesId),
      this.openLibrary.search(series.name, authorNames),
      wikidataId ? this.wikidata.fetchParts(wikidataId) : Promise.resolve([] as ExternalVolumeCandidate[]),
    ]);

    const candidates: ExternalVolumeCandidate[] = [];
    let googleBooksSeriesId = series.googleBooksSeriesId;
    if (googleResult.status === 'fulfilled') {
      candidates.push(...googleResult.value.candidates);
      googleBooksSeriesId = googleResult.value.seriesId;
    } else {
      this.logger.warn(`Google Books check errored for "${series.name}": ${googleResult.reason}`);
    }
    if (openLibraryCandidates.status === 'fulfilled') candidates.push(...openLibraryCandidates.value);
    if (wikidataCandidates.status === 'fulfilled') candidates.push(...wikidataCandidates.value);

    const created = await this.createNewSuggestions(series.id, candidates);

    await this.prisma.bookSeries.update({
      where: { id: series.id },
      data: { lastCheckedAt: new Date(), googleBooksSeriesId, wikidataId },
    });

    return created;
  }

  private async createNewSuggestions(seriesId: string, candidates: ExternalVolumeCandidate[]): Promise<number> {
    if (candidates.length === 0) return 0;

    const existing = await this.prisma.bookSeriesEntry.findMany({
      where: { seriesId },
      select: { volumeNumbers: true, book: { select: { title: true } } },
    });
    const existingVolumeNumbers = new Set(existing.flatMap((e) => e.volumeNumbers));
    const existingTitles = existing.map((e) => e.book.title);

    let created = 0;
    for (const candidate of candidates) {
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
}
