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

  it('cleans up raw LCSH/BISAC subject strings into deduplicated genre tags', async () => {
    // Real values seen from Open Library for one book — regression test for a reported bug.
    fetchMock.mockResolvedValue(mockJsonResponse({
      docs: [{
        key: '/works/OL9W',
        title: 'Some Book',
        subject: [
          'Death--Fiction.',
          'Murder--Fiction.',
          'Science fiction.',
          'YOUNG ADULT FICTION / Science Fiction',
          'Science fiction',
        ],
      }],
    }));

    const result = await client.search('Test Saga', []);

    expect(result[0].genres).toEqual(['Science Fiction']);
  });

  it('requests the language field and drops a doc whose language does not match', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      docs: [
        { key: '/works/OL1W', title: 'English Edition', language: ['eng'] },
        { key: '/works/OL2W', title: 'Foreign Edition', language: ['fre'] },
      ],
    }));

    const result = await client.search('Test Saga', [], 'eng');

    expect(fetchMock.mock.calls[0][0] as string).toContain('fields=key%2Ctitle%2Cauthor_name%2Cfirst_publish_year%2Csubject%2Clanguage');
    expect(result.map((c) => c.title)).toEqual(['English Edition']);
  });

  it('keeps a doc with no language field at all rather than dropping it (sparse data)', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      docs: [{ key: '/works/OL3W', title: 'Unknown Language Edition' }],
    }));

    const result = await client.search('Test Saga', [], 'eng');

    expect(result.map((c) => c.title)).toEqual(['Unknown Language Edition']);
  });

  it('does not filter by language when none is requested', async () => {
    fetchMock.mockResolvedValue(mockJsonResponse({
      docs: [{ key: '/works/OL2W', title: 'Foreign Edition', language: ['fre'] }],
    }));

    const result = await client.search('Test Saga', []);

    expect(result.map((c) => c.title)).toEqual(['Foreign Edition']);
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
