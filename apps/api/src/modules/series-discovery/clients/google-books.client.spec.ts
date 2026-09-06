import { ConfigService } from '@nestjs/config';
import { GoogleBooksClient } from './google-books.client';

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('GoogleBooksClient', () => {
  let client: GoogleBooksClient;
  let config: { get: jest.Mock };
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    config = { get: jest.fn().mockReturnValue(undefined) };
    client = new GoogleBooksClient(config as unknown as ConfigService);
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('builds the query with inauthor when an author is given, no key param when unconfigured', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ items: [] }));

    await client.search('Test Saga', ['Jane Doe'], null);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=Test+Saga+inauthor%3A%22Jane+Doe%22');
    expect(calledUrl).not.toContain('key=');
  });

  it('omits inauthor when no author names are known', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ items: [] }));

    await client.search('Test Saga', [], null);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=Test+Saga');
    expect(calledUrl).not.toContain('inauthor');
  });

  it('adds langRestrict when a language is given, omits it otherwise', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ items: [] }));

    await client.search('Test Saga', [], null, 'en');
    expect(fetchMock.mock.calls[0][0] as string).toContain('langRestrict=en');

    await client.search('Test Saga', [], null);
    expect(fetchMock.mock.calls[1][0] as string).not.toContain('langRestrict');
  });

  it('appends the configured API key when set', async () => {
    config.get.mockReturnValue('my-key');
    fetchMock.mockResolvedValue(mockJsonResponse({ items: [] }));

    await client.search('Test Saga', [], null);

    expect(fetchMock.mock.calls[0][0] as string).toContain('key=my-key');
  });

  it('maps volumeInfo into candidates, pulling volumeNumber/genres/authors from the response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{
        id: 'gb-1',
        volumeInfo: {
          title: 'Test Saga Book 4',
          authors: ['Jane Doe'],
          categories: ['Fantasy'],
          description: 'A description',
          publishedDate: '2026-01-01',
          infoLink: 'https://books.example/gb-1',
          seriesInfo: { volumeSeries: [{ seriesId: 'gb-series-1', orderNumber: 4 }] },
        },
      }],
    }));

    const result = await client.search('Test Saga', ['Jane Doe'], null);

    expect(result.candidates).toEqual([{
      title: 'Test Saga Book 4',
      volumeNumber: 4,
      authorNames: ['Jane Doe'],
      genres: ['Fantasy'],
      source: 'google_books',
      sourceId: 'gb-1',
      sourceUrl: 'https://books.example/gb-1',
      description: 'A description',
      publishedDate: '2026-01-01',
    }]);
    expect(result.seriesId).toBe('gb-series-1');
  });

  it('drops a volume whose language contradicts the target', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [
        { id: 'de', volumeInfo: { title: 'Test Saga Buch 4', language: 'de' } },
        { id: 'en', volumeInfo: { title: 'Test Saga Book 4', language: 'en-US' } },
      ],
    }));

    const result = await client.search('Test Saga', [], null, 'en');

    expect(result.candidates.map((c) => c.sourceId)).toEqual(['en']);
  });

  it('keeps a volume with no language field (best-effort)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{ id: 'nolang', volumeInfo: { title: 'Test Saga Book 4' } }],
    }));

    const result = await client.search('Test Saga', [], null, 'en');

    expect(result.candidates.map((c) => c.sourceId)).toEqual(['nolang']);
  });

  it('drops an author\'s unrelated book that neither names the series nor shares its seriesId', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{ id: 'other', volumeInfo: { title: 'A Completely Different Novel', authors: ['Jane Doe'] } }],
    }));

    const result = await client.search('Test Saga', ['Jane Doe'], null);

    expect(result.candidates).toEqual([]);
  });

  it('keeps a volume that does not name the series but shares the cached seriesId', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{
        id: 'vol2',
        volumeInfo: { title: 'Legendary', seriesInfo: { volumeSeries: [{ seriesId: 'gb-cached-series', orderNumber: 2 }] } },
      }],
    }));

    const result = await client.search('Test Saga', [], 'gb-cached-series');

    expect(result.candidates.map((c) => c.sourceId)).toEqual(['vol2']);
  });

  it('adopts a seriesId only from a title-confirmed volume, then keeps later volumes sharing it', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [
        { id: 'unrelated', volumeInfo: { title: 'Some Other Series', seriesInfo: { volumeSeries: [{ seriesId: 'wrong' }] } } },
        { id: 'vol1', volumeInfo: { title: 'Test Saga', seriesInfo: { volumeSeries: [{ seriesId: 'gb-real', orderNumber: 1 }] } } },
        { id: 'vol2', volumeInfo: { title: 'Second Entry', seriesInfo: { volumeSeries: [{ seriesId: 'gb-real', orderNumber: 2 }] } } },
      ],
    }));

    const result = await client.search('Test Saga', [], null);

    expect(result.seriesId).toBe('gb-real');
    expect(result.candidates.map((c) => c.sourceId)).toEqual(['vol1', 'vol2']);
  });

  it('skips items with no volumeInfo.title', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{ id: 'gb-1', volumeInfo: {} }, { id: 'gb-2' }],
    }));

    const result = await client.search('Test Saga', [], null);

    expect(result.candidates).toEqual([]);
  });

  it('keeps an already-cached seriesId instead of overwriting it with a new match', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      items: [{
        id: 'gb-1',
        volumeInfo: { title: 'Some Other Book', seriesInfo: { volumeSeries: [{ seriesId: 'gb-different-series' }] } },
      }],
    }));

    const result = await client.search('Test Saga', [], 'gb-cached-series');

    expect(result.seriesId).toBe('gb-cached-series');
  });

  it('flags rateLimited on a 429 without treating it as a generic failure', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({}, false, 429));

    const result = await client.search('Test Saga', [], 'gb-cached-series');

    expect(result).toEqual({ candidates: [], seriesId: 'gb-cached-series', rateLimited: true });
  });

  it('returns empty candidates and preserves the cached seriesId on a non-ok response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({}, false, 500));

    const result = await client.search('Test Saga', [], 'gb-cached-series');

    expect(result).toEqual({ candidates: [], seriesId: 'gb-cached-series' });
  });

  it('returns empty candidates and preserves the cached seriesId when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await client.search('Test Saga', [], 'gb-cached-series');

    expect(result).toEqual({ candidates: [], seriesId: 'gb-cached-series' });
  });
});
