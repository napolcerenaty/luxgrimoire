import { mockDeep, DeepMockProxy } from 'jest-mock-extended';
import { PrismaService } from '../../prisma/prisma.service';
import { SeriesDiscoveryService } from './series-discovery.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  let notifications: { createNotification: jest.Mock };
  let googleBooks: { search: jest.Mock };
  let openLibrary: { search: jest.Mock };
  let wikidata: { resolveSeriesId: jest.Mock; fetchParts: jest.Mock };

  beforeEach(() => {
    prisma = mockDeep<PrismaService>();
    notifications = { createNotification: jest.fn().mockResolvedValue({ id: 'notif-1' }) };
    googleBooks = { search: jest.fn().mockResolvedValue({ candidates: [], seriesId: null }) };
    openLibrary = { search: jest.fn().mockResolvedValue([]) };
    wikidata = { resolveSeriesId: jest.fn().mockResolvedValue(null), fetchParts: jest.fn().mockResolvedValue([]) };

    (prisma.bookSeriesEntry.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.seriesVolumeSuggestion.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.seriesVolumeSuggestion.create as jest.Mock).mockResolvedValue({ id: 'suggestion-1' });
    (prisma.bookSeries.update as jest.Mock).mockResolvedValue({});
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    service = new SeriesDiscoveryService(
      prisma,
      notifications as unknown as NotificationsService,
      googleBooks as unknown as GoogleBooksClient,
      openLibrary as unknown as OpenLibraryClient,
      wikidata as unknown as WikidataClient,
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

    it('does nothing further when there are no due series', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.runCheck();

      expect(result).toEqual({ seriesChecked: 0, suggestionsCreated: 0 });
      expect(notifications.createNotification).not.toHaveBeenCalled();
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
      expect(result).toEqual({ seriesChecked: 1, suggestionsCreated: 1 });
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

    it('notifies admins/moderators when new suggestions were created', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries()]);
      (prisma.user.findMany as jest.Mock).mockResolvedValue([{ id: 'admin-1' }, { id: 'mod-1' }]);
      googleBooks.search.mockResolvedValue({
        candidates: [{ title: 'Test Saga Book 4', volumeNumber: 4, authorNames: [], genres: [], source: 'google_books', sourceId: 'gb-4' }],
        seriesId: null,
      });

      await service.runCheck();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { role: { in: ['ADMIN', 'MODERATOR'] } } }),
      );
      expect(notifications.createNotification).toHaveBeenCalledTimes(2);
      expect(notifications.createNotification).toHaveBeenCalledWith('admin-1', 'series_volume_suggestions', expect.any(String), expect.any(String));
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
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q123');
      expect(prisma.bookSeries.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ wikidataId: 'Q123' }) }),
      );
    });

    it('skips Wikidata resolution entirely when a QID is already cached', async () => {
      (prisma.bookSeries.findMany as jest.Mock).mockResolvedValue([makeSeries({ wikidataId: 'Q999' })]);

      await service.runCheck();

      expect(wikidata.resolveSeriesId).not.toHaveBeenCalled();
      expect(wikidata.fetchParts).toHaveBeenCalledWith('Q999');
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
