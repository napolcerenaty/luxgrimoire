import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SeriesDiscoveryService } from './series-discovery.service';
import { GoogleBooksClient } from './clients/google-books.client';
import { OpenLibraryClient } from './clients/open-library.client';
import { WikidataClient } from './clients/wikidata.client';

const SERIES_ID = 'series-1';

function makeSeries(overrides: Record<string, unknown> = {}) {
  return {
    id: SERIES_ID,
    name: 'Test Saga',
    googleBooksSeriesId: null,
    openLibraryId: null,
    wikidataId: null,
    ...overrides,
  };
}

describe('SeriesDiscoveryService', () => {
  let service: SeriesDiscoveryService;
  let prisma: DeepMockProxy<PrismaService>;
  let googleBooks: { search: jest.Mock };
  let openLibrary: { search: jest.Mock };
  let wikidata: { resolveSeriesId: jest.Mock; fetchParts: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    googleBooks = { search: jest.fn().mockResolvedValue({ candidates: [], seriesId: null }) };
    openLibrary = { search: jest.fn().mockResolvedValue([]) };
    wikidata = { resolveSeriesId: jest.fn().mockResolvedValue(null), fetchParts: jest.fn().mockResolvedValue([]) };
    config = { get: jest.fn().mockReturnValue(undefined) };

    (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.seriesVolumeSuggestion.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.seriesVolumeSuggestion.create as jest.Mock).mockResolvedValue({ id: 'suggestion-1' });
    (prisma.bookSeries.update as jest.Mock).mockResolvedValue({});
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.seriesDiscoveryExcludedKeyword.findMany as jest.Mock).mockResolvedValue(
      ['boxed set', 'box set', 'omnibus', 'bundle', 'trilogy', 'duology', 'quartet', 'complete series', 'complete collection', 'complete trilogy']
        .map((keyword) => ({ keyword })),
    );

    service = new SeriesDiscoveryService(
      prisma,
      googleBooks as unknown as GoogleBooksClient,
      openLibrary as unknown as OpenLibraryClient,
      wikidata as unknown as WikidataClient,
      config as unknown as ConfigService,
    );
  });

  describe('runCheck', () => {
    it('only queries non-completed series, oldest-checked-first, limited to the given batch', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck({ limit: 20 });

      expect(prisma.bookSeries.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isCompleted: false },
          orderBy: [{ lastCheckedAt: { sort: 'asc', nulls: 'first' } }],
          take: 20,
        }),
      );
    });

    it('defaults the batch to the configured daily size when no limit is given — same default the cron uses, so "Check now" behaves identically to the cron', async () => {
      config.get.mockImplementation((key: string) => (key === 'SERIES_DISCOVERY_DAILY_BATCH' ? '20' : undefined));
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck();

      expect(prisma.bookSeries.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('uses a configured non-default daily batch size when no limit is given explicitly', async () => {
      config.get.mockImplementation((key: string) => (key === 'SERIES_DISCOVERY_DAILY_BATCH' ? '50' : undefined));
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck();

      expect(prisma.bookSeries.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 50 }));
    });

    it('falls back to the default batch size of 20 for an invalid configured value', async () => {
      config.get.mockImplementation((key: string) => (key === 'SERIES_DISCOVERY_DAILY_BATCH' ? 'not-a-number' : undefined));
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck();

      expect(prisma.bookSeries.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('an explicit limit still overrides the configured default (manual admin override path)', async () => {
      config.get.mockImplementation((key: string) => (key === 'SERIES_DISCOVERY_DAILY_BATCH' ? '50' : undefined));
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck({ limit: 5 });

      expect(prisma.bookSeries.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    });

    it('does nothing further when there are no due series', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.runCheck();

      expect(result).toEqual({ seriesChecked: 0, suggestionsCreated: 0, googleBooksRateLimited: false });
    });

    it('creates a suggestion for a new candidate and updates lastCheckedAt', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      googleBooks.search.mockResolvedValue({
        candidates: [{
          title: 'Test Saga Book 4', volumeNumber: 4, authorNames: ['Jane Doe'], genres: ['Fantasy'],
          source: 'google_books', sourceId: 'gb-4', sourceUrl: 'https://books.example/4',
        }],
        seriesId: 'gb-series-1',
      });

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).toHaveBeenCalledTimes(1);
      expect(prisma.seriesVolumeSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ seriesId: SERIES_ID, title: 'Test Saga Book 4', volumeNumber: 4 }) }),
      );
      expect(prisma.bookSeries.update).toHaveBeenCalledWith({
        where: { id: SERIES_ID },
        data: { lastCheckedAt: expect.any(Date), googleBooksSeriesId: 'gb-series-1', wikidataId: null },
      });
      expect(result).toEqual({ seriesChecked: 1, suggestionsCreated: 1, googleBooksRateLimited: false });
    });

    it('skips a candidate whose volumeNumber already exists in the series', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [1, 2, 3], book: { title: 'Test Saga Book 3', authors: [] } },
      ]);
      googleBooks.search.mockResolvedValue({
        candidates: [{ title: 'Test Saga Book 3 (reissue)', volumeNumber: 3, authorNames: [], genres: [], source: 'google_books', sourceId: 'gb-3' }],
        seriesId: null,
      });

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).not.toHaveBeenCalled();
      expect(result.suggestionsCreated).toBe(0);
    });

    it('skips a candidate whose title loosely matches an existing book, even without a volumeNumber', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [], book: { title: "Test Saga: The Dragon's Gift", authors: [] } },
      ]);
      openLibrary.search.mockResolvedValue([
        { title: "The Dragon's Gift", authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL1' },
      ]);

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).not.toHaveBeenCalled();
      expect(result.suggestionsCreated).toBe(0);
    });

    it('skips a candidate whose title differs from an existing book only by "&" vs "and"', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [], book: { title: 'Fire and Blood', authors: [] } },
      ]);
      openLibrary.search.mockResolvedValue([
        { title: 'Fire & Blood', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-fireblood' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(0);
    });

    it('does not duplicate a suggestion that was already created by a previous run', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.seriesVolumeSuggestion.findUnique as jest.Mock).mockResolvedValue({ id: 'existing-suggestion' });
      googleBooks.search.mockResolvedValue({
        candidates: [{ title: 'Test Saga Book 4', volumeNumber: 4, authorNames: [], genres: [], source: 'google_books', sourceId: 'gb-4' }],
        seriesId: null,
      });

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).not.toHaveBeenCalled();
      expect(result.suggestionsCreated).toBe(0);
    });

    it('still surfaces candidates from other sources when one source fails', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      googleBooks.search.mockRejectedValue(new Error('Google Books is down'));
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga Book 5', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL5' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(1);
      expect(prisma.seriesVolumeSuggestion.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ source: 'open_library', sourceId: '/works/OL5' }) }),
      );
    });

    it('stops calling Google Books for the rest of the run once it 429s, but keeps checking other sources/series', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        makeSeries({ id: 'series-1', name: 'First Series' }),
        makeSeries({ id: 'series-2', name: 'Second Series' }),
      ]);
      googleBooks.search.mockResolvedValue({ candidates: [], seriesId: null, rateLimited: true });
      openLibrary.search.mockImplementation((seriesName: string) =>
        Promise.resolve(
          seriesName === 'Second Series'
            ? [{ title: 'Second Series Book 2', authorNames: [], genres: [], source: 'open_library' as const, sourceId: '/works/OL2' }]
            : [],
        ),
      );

      const result = await service.runCheck();

      expect(googleBooks.search).toHaveBeenCalledTimes(1); // not called again for series-2
      expect(result.googleBooksRateLimited).toBe(true);
      expect(result.suggestionsCreated).toBe(1); // Open Library still contributed for series-2
    });

    it('keeps checking the next series when one series errors entirely', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([
        makeSeries({ id: 'series-broken', name: 'Broken Series' }),
        makeSeries({ id: 'series-2', name: 'Second Series' }),
      ]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockImplementation(({ where }: { where: { seriesId: string } }) => {
        if (where.seriesId === 'series-broken') throw new Error('DB blew up');
        return Promise.resolve([]);
      });

      const result = await service.runCheck();

      expect(result.seriesChecked).toBe(2);
      expect(prisma.bookSeries.update).toHaveBeenCalledTimes(1);
      expect(prisma.bookSeries.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'series-2' } }));
    });

    it('never checks a completed series (enforced by the where clause)', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      await service.runCheck();

      const call = (prisma.bookSeries.findMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ isCompleted: false });
    });

    it('resolves a Wikidata QID once and caches it for the next run when not already cached', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: null })]);
      wikidata.resolveSeriesId.mockResolvedValue('Q123');
      wikidata.fetchParts.mockResolvedValue([]);

      await service.runCheck();

      expect(wikidata.resolveSeriesId).toHaveBeenCalledWith('Test Saga');
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q123', 'Q1860');
      expect(prisma.bookSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ wikidataId: 'Q123' }) }),
      );
    });

    it('skips Wikidata resolution entirely when a QID is already cached', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: 'Q999' })]);

      await service.runCheck();

      expect(wikidata.resolveSeriesId).not.toHaveBeenCalled();
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q999', 'Q1860');
    });

    it('restricts each source to the configured language (defaulting to English)', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: 'Q999' })]);

      await service.runCheck();

      expect(googleBooks.search).toHaveBeenCalledWith('Test Saga', [], null, 'en');
      expect(openLibrary.search).toHaveBeenCalledWith('Test Saga', [], 'eng');
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q999', 'Q1860');
    });

    it('falls back to no language filter for a configured language with no verified mapping', async () => {
      config.get.mockReturnValue('de');
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: 'Q999' })]);

      await service.runCheck();

      expect(googleBooks.search).toHaveBeenCalledWith('Test Saga', [], null, 'de');
      expect(openLibrary.search).toHaveBeenCalledWith('Test Saga', [], undefined);
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q999', undefined);
    });

    it('skips a bundle/omnibus listing whose title is just the series name plus an excluded keyword', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga Trilogy', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-trilogy' },
        { title: 'The Test Saga Boxed Set', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-boxed' },
      ]);

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).not.toHaveBeenCalled();
      expect(result.suggestionsCreated).toBe(0);
    });

    it('does not filter bundle-word candidates when the excluded-keyword list is empty', async () => {
      (prisma.seriesDiscoveryExcludedKeyword.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga Trilogy', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-trilogy' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(1);
    });

    it('excludes any candidate containing an excluded keyword, even with its own distinct subtitle', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga: The Bundle Conspiracy', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-real' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(0);
    });

    it('excludes a generic multi-author bundle that does not reduce to the series name at all (real bug: "BookTok Bestsellers Boxed Set")', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      openLibrary.search.mockResolvedValue([
        // Doesn't contain "Test Saga" at all — an earlier version's "must reduce to exactly the
        // series name" rule let this through, since a generic bundle title never does that.
        { title: 'BookTok Bestsellers Boxed Set', authorNames: [], genres: [], source: 'open_library', sourceId: '/works/OL-booktok' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(0);
    });
  });

  describe('author matching', () => {
    it('drops a candidate whose author matches none of the series\' known authors', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [1], book: { title: 'Test Saga Book 1', authors: [{ author: { name: 'Real Author' } }] } },
      ]);
      openLibrary.search.mockResolvedValue([
        // A generic series name pulling in an unrelated book by someone else — the real bug report.
        { title: 'Some Unrelated Book', authorNames: ['Someone Else'], genres: [], source: 'open_library', sourceId: '/works/OL-wrong' },
      ]);

      const result = await service.runCheck();

      expect(prisma.seriesVolumeSuggestion.create).not.toHaveBeenCalled();
      expect(result.suggestionsCreated).toBe(0);
    });

    it('keeps a candidate whose author matches despite "Last, First" vs "First Last" reordering', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [1], book: { title: 'Test Saga Book 1', authors: [{ author: { name: 'Jane Doe' } }] } },
      ]);
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga Book 2', authorNames: ['Doe, Jane'], genres: [], source: 'open_library', sourceId: '/works/OL-right' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(1);
    });

    it('does not drop a same-word-fragment different author (e.g. known "Susanna Collins" vs candidate "Ann")', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [1], book: { title: 'Test Saga Book 1', authors: [{ author: { name: 'Susanna Collins' } }] } },
      ]);
      openLibrary.search.mockResolvedValue([
        { title: 'Test Saga Book 2', authorNames: ['Ann'], genres: [], source: 'open_library', sourceId: '/works/OL-ann' },
      ]);

      const result = await service.runCheck();

      // Must NOT match on the raw substring "ann" hiding inside "susANNa" — confirms the
      // author check compares whole word tokens, not substrings.
      expect(result.suggestionsCreated).toBe(0);
    });

    it('keeps a candidate with no author info at all (Wikidata never populates it) even when the series has known authors', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: 'Q999' })]);
      (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([
        { volumeNumbers: [1], book: { title: 'Test Saga Book 1', authors: [{ author: { name: 'Jane Doe' } }] } },
      ]);
      wikidata.fetchParts.mockResolvedValue([
        { title: 'Test Saga Book 3', authorNames: [], genres: [], source: 'wikidata', sourceId: 'Q1000' },
      ]);

      const result = await service.runCheck();

      expect(result.suggestionsCreated).toBe(1);
    });
  });

  describe('excluded-keyword list', () => {
    it('lists keywords alphabetically', async () => {
      (prisma.seriesDiscoveryExcludedKeyword.findMany as jest.Mock).mockResolvedValue([]);

      await service.listExcludedKeywords();

      expect(prisma.seriesDiscoveryExcludedKeyword.findMany).toHaveBeenCalledWith({ orderBy: { keyword: 'asc' } });
    });

    it('adds a keyword, lowercased and trimmed', async () => {
      (prisma.seriesDiscoveryExcludedKeyword.create as jest.Mock).mockResolvedValue({ id: 'k1', keyword: 'box set' });

      await service.addExcludedKeyword('  Box Set  ');

      expect(prisma.seriesDiscoveryExcludedKeyword.create).toHaveBeenCalledWith({ data: { keyword: 'box set' } });
    });

    it('rejects adding a keyword that already exists', async () => {
      (prisma.seriesDiscoveryExcludedKeyword.create as jest.Mock).mockRejectedValue(new Error('unique constraint'));

      await expect(service.addExcludedKeyword('trilogy')).rejects.toThrow('already in the excluded-keyword list');
    });

    it('removes a keyword by id', async () => {
      (prisma.seriesDiscoveryExcludedKeyword.delete as jest.Mock).mockResolvedValue({ id: 'k1' });

      await service.removeExcludedKeyword('k1');

      expect(prisma.seriesDiscoveryExcludedKeyword.delete).toHaveBeenCalledWith({ where: { id: 'k1' } });
    });
  });

  describe('findSuggestions / updateSuggestionStatus / removeSuggestion', () => {
    it('filters by status when provided', async () => {
      (prisma.seriesVolumeSuggestion.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.seriesVolumeSuggestion.count as jest.Mock).mockResolvedValue(0);

      await service.findSuggestions(1, 30, 'pending');

      expect(prisma.seriesVolumeSuggestion.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'pending' } }),
      );
    });

    it('updates status and adminNote', async () => {
      (prisma.seriesVolumeSuggestion.update as jest.Mock).mockResolvedValue({ id: 's1', status: 'approved' });

      await service.updateSuggestionStatus('s1', 'approved', 'looks good');

      expect(prisma.seriesVolumeSuggestion.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { status: 'approved', adminNote: 'looks good' },
      });
    });

    it('deletes a suggestion', async () => {
      (prisma.seriesVolumeSuggestion.delete as jest.Mock).mockResolvedValue({ id: 's1' });

      await service.removeSuggestion('s1');

      expect(prisma.seriesVolumeSuggestion.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });
});
