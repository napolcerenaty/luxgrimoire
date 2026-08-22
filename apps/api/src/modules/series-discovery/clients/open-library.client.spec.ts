import { OpenLibraryClient } from './open-library.client';

function mockJsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('OpenLibraryClient', () => {
  let client: OpenLibraryClient;
  let fetchMock: jest.Mock;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new OpenLibraryClient();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('includes the author in the query when one is known', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ docs: [] }));

    await client.search('Test Saga', ['Jane Doe']);

    expect(fetchMock.mock.calls[0][0] as string).toContain('q=Test+Saga+Jane+Doe');
  });

  it('searches by series name alone when no author is known', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ docs: [] }));

    await client.search('Test Saga', []);

    expect(fetchMock.mock.calls[0][0] as string).toContain('q=Test+Saga');
  });

  it('maps docs into candidates, capping genres at 5', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      docs: [{
        key: '/works/OL1W',
        title: 'Test Saga Book 5',
        author_name: ['Jane Doe'],
        first_publish_year: 2024,
        subject: ['Fantasy', 'Adventure', 'Magic', 'Dragons', 'Quests', 'Extra Tag'],
      }],
    }));

    const result = await client.search('Test Saga', ['Jane Doe']);

    expect(result).toEqual([{
      title: 'Test Saga Book 5',
      authorNames: ['Jane Doe'],
      genres: ['Fantasy', 'Adventure', 'Magic', 'Dragons', 'Quests'],
      source: 'open_library',
      sourceId: '/works/OL1W',
      sourceUrl: 'https://openlibrary.org/works/OL1W',
      publishedDate: '2024',
    }]);
  });

  it('filters out docs with no title', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({ docs: [{ key: '/works/OL2W' }] }));

    const result = await client.search('Test Saga', []);

    expect(result).toEqual([]);
  });

  it('returns an empty array on a non-ok response', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({}, false, 503));

    const result = await client.search('Test Saga', []);

    expect(result).toEqual([]);
  });

  it('returns an empty array when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await client.search('Test Saga', []);

    expect(result).toEqual([]);
  });
});
