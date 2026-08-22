import { WikidataClient } from './wikidata.client';

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('WikidataClient', () => {
  let client: WikidataClient;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new WikidataClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('resolveSeriesId', () => {
    it('prefers a result whose description mentions "series"', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({
        search: [
          { id: 'Q1', description: 'a fantasy novel' },
          { id: 'Q2', description: 'a book series' },
        ],
      }));

      const result = await client.resolveSeriesId('Test Saga');

      expect(result).toBe('Q2');
    });

    it('falls back to the first result when none mention "series"', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({
        search: [{ id: 'Q1', description: 'a fantasy novel' }, { id: 'Q2', description: 'an author' }],
      }));

      const result = await client.resolveSeriesId('Test Saga');

      expect(result).toBe('Q1');
    });

    it('returns null when there are no search results', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({ search: [] }));

      const result = await client.resolveSeriesId('Test Saga');

      expect(result).toBeNull();
    });

    it('returns null on a non-ok response', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({}, false, 500));

      const result = await client.resolveSeriesId('Test Saga');

      expect(result).toBeNull();
    });

    it('returns null when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await client.resolveSeriesId('Test Saga');

      expect(result).toBeNull();
    });
  });

  describe('fetchParts', () => {
    it('maps SPARQL bindings into candidates, using the ordinal as volumeNumber', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({
        results: {
          bindings: [{
            part: { value: 'http://www.wikidata.org/entity/Q999' },
            partLabel: { value: 'Test Saga Book 4' },
            ordinal: { value: '4' },
            pubDate: { value: '2026-01-01T00:00:00Z' },
          }],
        },
      }));

      const result = await client.fetchParts('Q123');

      expect(result).toEqual([{
        title: 'Test Saga Book 4',
        volumeNumber: 4,
        authorNames: [],
        genres: [],
        source: 'wikidata',
        sourceId: 'Q999',
        sourceUrl: 'http://www.wikidata.org/entity/Q999',
        publishedDate: '2026-01-01',
      }]);
    });

    it('omits volumeNumber when no ordinal qualifier is present', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({
        results: {
          bindings: [{
            part: { value: 'http://www.wikidata.org/entity/Q999' },
            partLabel: { value: 'Test Saga Book 4' },
          }],
        },
      }));

      const result = await client.fetchParts('Q123');

      expect(result[0].volumeNumber).toBeUndefined();
    });

    it('filters out bindings missing a part or a label', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({
        results: {
          bindings: [
            { part: { value: 'http://www.wikidata.org/entity/Q999' } },
            { partLabel: { value: 'No part URL' } },
          ],
        },
      }));

      const result = await client.fetchParts('Q123');

      expect(result).toEqual([]);
    });

    it('returns an empty array on a non-ok response', async () => {
      fetchMock.mockResolvedValue(mockJsonResponse({}, false, 500));

      const result = await client.fetchParts('Q123');

      expect(result).toEqual([]);
    });

    it('returns an empty array when fetch throws', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await client.fetchParts('Q123');

      expect(result).toEqual([]);
    });
  });
});
