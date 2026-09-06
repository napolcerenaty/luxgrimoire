const mockOpenAiCreate = jest.fn();

jest.mock('openai', () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  const OpenAI = jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAiCreate } },
  }));
  (OpenAI as unknown as { APIError: unknown }).APIError = APIError;
  return { __esModule: true, default: OpenAI, APIError };
});

import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureTaggerService } from '../feature-categories/feature-tagger.service';
import { AiService } from './ai.service';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { APIError } = jest.requireMock('openai');

function makeService(key: string | null = 'test-key') {
  const config = { get: jest.fn().mockReturnValue(key) } as unknown as ConfigService;
  const tagger = { categorizeMany: jest.fn().mockResolvedValue({ 'x': ['cat'] }) } as unknown as FeatureTaggerService;
  return { service: new AiService(config, tagger), tagger };
}

const okContent = (obj: unknown) => ({ choices: [{ message: { content: JSON.stringify(obj) } }] });

describe('AiService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    jest.clearAllMocks();
    global.fetch = realFetch;
  });

  describe('parse — guards', () => {
    it('rejects when no OpenAI key is configured', async () => {
      const { service } = makeService(null);
      await expect(service.parse({ text: 'hi' })).rejects.toThrow(/OPENAI_API_KEY is not configured/);
    });

    it('rejects when none of text / imageUrl / imageBase64 is provided', async () => {
      const { service } = makeService();
      await expect(service.parse({})).rejects.toThrow(/Provide either text, imageUrl, or imageBase64/);
    });

    it('rejects a malformed imageUrl', async () => {
      const { service } = makeService();
      await expect(service.parse({ imageUrl: 'not a url' })).rejects.toThrow(/Invalid imageUrl/);
    });

    it('rejects a non-https imageUrl', async () => {
      const { service } = makeService();
      await expect(service.parse({ imageUrl: 'http://example.com/x.jpg' })).rejects.toThrow(/must use https/);
    });

    it.each([
      'https://localhost/x.jpg',
      'https://127.0.0.1/x.jpg',
      'https://10.1.2.3/x.jpg',
      'https://192.168.0.5/x.jpg',
      'https://169.254.169.254/latest/meta-data',
      'https://172.16.0.1/x.jpg',
      'https://foo.internal/x.jpg',
      'https://printer.local/x.jpg',
    ])('blocks the internal/loopback/metadata host %s', async (url) => {
      const { service } = makeService();
      await expect(service.parse({ imageUrl: url })).rejects.toThrow(/disallowed host/);
    });

    it('allows a public https imageUrl through to the model', async () => {
      const { service } = makeService();
      mockOpenAiCreate.mockResolvedValue(okContent({ edition: {} }));
      await expect(service.parse({ imageUrl: 'https://cdn.example.com/x.jpg' })).resolves.toBeDefined();
    });
  });

  describe('parse — post-processing', () => {
    it('singularises plurals in features and artist roles, and resolves featureOrder', async () => {
      const { service, tagger } = makeService();
      mockOpenAiCreate.mockResolvedValue(
        okContent({ edition: { features: ['Foiled hardcases'], artists: [{ name: 'a', role: 'sprayed edges (design)' }] } }),
      );

      const res = await service.parse({ text: 'blurb' });

      expect(res.edition!.features).toEqual(['Foiled hardcase']);
      expect(res.edition!.featureOrder).toEqual(['Foiled hardcase', 'sprayed edges']);
      expect(tagger.categorizeMany).toHaveBeenCalledWith(['Foiled hardcase', 'sprayed edges']);
    });

    it('does not fail the parse when the feature tagger throws', async () => {
      const { service, tagger } = makeService();
      (tagger.categorizeMany as jest.Mock).mockRejectedValue(new Error('tagger down'));
      mockOpenAiCreate.mockResolvedValue(okContent({ edition: { features: ['cover'] } }));

      await expect(service.parse({ text: 'blurb' })).resolves.toMatchObject({ edition: { features: ['cover'] } });
    });

    it('rejects when the model returns non-JSON content', async () => {
      const { service } = makeService();
      mockOpenAiCreate.mockResolvedValue({ choices: [{ message: { content: 'not json' } }] });
      await expect(service.parse({ text: 'blurb' })).rejects.toThrow(/invalid JSON/);
    });

    it('rejects when the model returns empty content', async () => {
      const { service } = makeService();
      mockOpenAiCreate.mockResolvedValue({ choices: [{ message: { content: '' } }] });
      await expect(service.parse({ text: 'blurb' })).rejects.toThrow(/No response from AI model/);
    });

    it('builds a data: URL from raw base64 and passes an existing data: URL through untouched', async () => {
      const { service } = makeService();
      mockOpenAiCreate.mockResolvedValue(okContent({ edition: {} }));

      await service.parse({ imageBase64: 'AAAA' });
      expect(mockOpenAiCreate.mock.calls[0][0].messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,AAAA');

      mockOpenAiCreate.mockClear().mockResolvedValue(okContent({ edition: {} }));
      await service.parse({ imageBase64: 'data:image/png;base64,BBBB' });
      expect(mockOpenAiCreate.mock.calls[0][0].messages[1].content[1].image_url.url).toBe('data:image/png;base64,BBBB');
    });
  });

  describe('OpenAI error mapping', () => {
    it.each([
      [401, BadRequestException, /invalid or expired/],
      [429, BadRequestException, /rate limit or quota/],
      [503, InternalServerErrorException, /temporarily unavailable/],
      [502, InternalServerErrorException, /temporarily unavailable/],
      [500, InternalServerErrorException, /OpenAI error/],
    ])('maps APIError %i to the right exception', async (status, ExceptionType, message) => {
      const { service } = makeService();
      mockOpenAiCreate.mockRejectedValue(new APIError(status, 'boom'));
      await expect(service.parse({ text: 'x' })).rejects.toThrow(ExceptionType);
      await expect(service.parse({ text: 'x' })).rejects.toThrow(message);
    });

    it('maps an unexpected (non-APIError) failure to a generic 500', async () => {
      const { service } = makeService();
      mockOpenAiCreate.mockRejectedValue(new Error('socket hang up'));
      await expect(service.parse({ text: 'x' })).rejects.toThrow(/Unexpected error calling AI service/);
    });
  });

  describe('parseSaleAnnouncementFromUrl', () => {
    it('applies the SSRF guard before fetching', async () => {
      const { service } = makeService();
      global.fetch = jest.fn() as unknown as typeof fetch;
      await expect(service.parseSaleAnnouncementFromUrl('https://127.0.0.1/sale')).rejects.toThrow(/disallowed host/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('rejects a non-OK fetch response', async () => {
      const { service } = makeService();
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, headers: { get: () => 'text/html' } }) as unknown as typeof fetch;
      await expect(service.parseSaleAnnouncementFromUrl('https://shop.example.com/sale')).rejects.toThrow(/HTTP 404/);
    });

    it('rejects a non-HTML content type', async () => {
      const { service } = makeService();
      global.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, headers: { get: () => 'application/pdf' }, text: async () => 'x',
      }) as unknown as typeof fetch;
      await expect(service.parseSaleAnnouncementFromUrl('https://shop.example.com/sale')).rejects.toThrow(/did not return an HTML page/);
    });

    it('wraps a network failure as a BadRequestException', async () => {
      const { service } = makeService();
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
      await expect(service.parseSaleAnnouncementFromUrl('https://shop.example.com/sale')).rejects.toThrow(/Could not fetch URL/);
    });

    it('extracts text, truncates past 15k chars and forwards to parseSaleAnnouncement', async () => {
      const { service } = makeService();
      const bigBody = `<html><body><script>ignored()</script><p>${'A'.repeat(20_000)}</p></body></html>`;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true, status: 200, headers: { get: () => 'text/html; charset=utf-8' }, text: async () => bigBody,
      }) as unknown as typeof fetch;
      mockOpenAiCreate.mockResolvedValue(okContent({ title: 'Big Sale' }));

      const res = await service.parseSaleAnnouncementFromUrl('https://shop.example.com/sale');

      expect(res).toMatchObject({ title: 'Big Sale' });
      const userMsg = mockOpenAiCreate.mock.calls[0][0].messages[1].content as string;
      expect(userMsg).toContain('[content truncated]');
      expect(userMsg).not.toContain('ignored()');
      expect(userMsg).toContain('Source URL: https://shop.example.com/sale');
    });
  });

  describe('other text parsers', () => {
    it('parseSaleAnnouncement / parseBookFromText reject without a key and on bad JSON', async () => {
      const { service: noKey } = makeService(null);
      await expect(noKey.parseSaleAnnouncement('t')).rejects.toThrow(/not configured/);
      await expect(noKey.parseBookFromText('t')).rejects.toThrow(/not configured/);

      const { service } = makeService();
      mockOpenAiCreate.mockResolvedValue({ choices: [{ message: { content: '{oops' } }] });
      await expect(service.parseBookFromText('t')).rejects.toThrow(/invalid JSON/);
    });
  });
});
