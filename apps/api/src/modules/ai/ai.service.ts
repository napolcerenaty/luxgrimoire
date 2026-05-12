import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface AiSaleRegion {
  name: string;
  isDefault: boolean;
  countryCodes?: string;
  price?: number;
  currency?: string;
  saleTimezone?: string;
  firstAccessDate?: string;
  earlyAccessDate?: string;
  generalSaleDate?: string;
}

export interface AiSaleAnnouncementResult {
  title?: string;
  expectedShipping?: string;
  regions?: AiSaleRegion[];
}

export interface AiBookResult {
  title?: string;
  authors?: { name: string }[];
  seriesName?: string;
  volumeNumber?: number;
  description?: string;
  genres?: string[];
}

export interface AiParseResult {
  book?: {
    title?: string;
    authors?: { name: string }[];
    seriesName?: string;
    volumeNumber?: number;
  };
  edition?: {
    publisher?: string;
    price?: number;
    currency?: string;
    firstAccessDate?: string;
    earlyAccessDate?: string;
    generalSaleDate?: string;
    features?: string[];
    artists?: { name: string; role: string }[];
  };
}

const SYSTEM_PROMPT = `You are a book edition data extractor for a luxury book subscription tracking app.
Given social media posts, newsletters, announcements, or images about special/exclusive book editions, extract structured information.

Return ONLY valid JSON matching this schema (omit fields you cannot find):
{
  "book": {
    "title": "book title",
    "authors": [{ "name": "Full Author Name" }],
    "seriesName": "series name if the book is part of a series",
    "volumeNumber": 1
  },
  "edition": {
    "publisher": "original publisher name",
    "price": 45.99,
    "currency": "GBP",
    "firstAccessDate": "YYYY-MM-DD",
    "earlyAccessDate": "YYYY-MM-DD",
    "generalSaleDate": "YYYY-MM-DD",
    "features": ["sprayed edges", "ribbon bookmark", "exclusive art print", "signed bookplate"],
    "artists": [
      { "name": "@artisthandle", "role": "full description of what they created, e.g. cover art, character illustrations, map, typography, interior artwork, endpapers design" }
    ]
  }
}

SIGNATURE RULES (read before artist rules):
- If the text contains phrases like "signed by @...", "digitally signed by @...", "signed copy by @...", "@signature by @...", "author signed", or similar — this means the edition IS SIGNED. In that case:
  - Add "signed" (or "signed bookplate", "digitally signed", etc. as appropriate) to the features array
  - Do NOT add the signer as an artist entry — being a signer is NOT an artistic contribution
  - Example: "signed by @authorname" → features: ["signed"], no artist entry for @authorname
  - Example: "digitally signed by @illustrator" → features: ["digitally signed"], no artist entry for @illustrator

ARTIST EXTRACTION RULES:
- Look for @mentions combined with descriptions of what they designed/drew/illustrated
- Keep the @ prefix in the name exactly as written (e.g. "@artistname")
- The "role" field MUST include the FULL description of what this person created. This means capturing the complete phrase from the start of the bullet/sentence up to and including the work noun right before "by @handle" — NOT just the last word. KEEP all parenthetical text in parentheses — e.g. "(no dust jacket)", "(collector's edition)" — they are part of the description and must not be removed or paraphrased.
  Example 1: "An exclusive redesigned naked hardcover (no dust jacket) with illustrations by @nophie.blue"
    → name: "@nophie.blue", role: "An exclusive redesigned naked hardcover (no dust jacket) with illustrations"
  Example 2: "An exclusive redesigned naked hardcover (no dust jacket) with illustration by @celestarly and typography and foiling by @francesandferndesigns"
    → name: "@celestarly", role: "An exclusive redesigned naked hardcover (no dust jacket) with illustration"
    → name: "@francesandferndesigns", role: "typography and foiling"
  Example 3: "cover art by @someartist" → name: "@someartist", role: "cover art"
  Example 4: "hand-lettered chapter headers and map by @mapmaker" → name: "@mapmaker", role: "hand-lettered chapter headers and map"
- For the FIRST artist in a line/bullet: start the role from the beginning of that line/clause
- For SUBSEQUENT artists in the same line (after "and … by @next"): the role = only their portion of the sentence
- If multiple artists are mentioned in separate lines/bullets, list each separately
- IMPORTANT: The SAME artist handle can appear multiple times in different bullets — if @artist did work on MULTIPLE elements (each in its own bullet), create ONE entry per bullet. Do NOT merge or combine entries for the same artist. Every @mention in its own bullet = its own separate artist entry in the array.

FEATURES RULES:
- Extract ALL physical extras: sprayed/dyed edges, foil details, ribbon bookmarks, art prints, bookplates, stickers, maps, endpapers, gilded pages, dust jacket, slipcase, etc.
- Also include: signed, numbered, exclusive content notes
- BINDING/FORMAT: If the text explicitly mentions a binding or format type such as "hardcover", "paperback", "cloth bound", "leatherette", "naked hardcover (no dust jacket)", etc., add it as a feature. These are physical characteristics of the edition.
  Example: "hardcover edition with sprayed edges" → features: ["hardcover", "sprayed edges"]
  Example: "paperback with foiled cover" → features: ["paperback", "foiled cover"]
- BOOK SIZE: If the text mentions a book size or format, extract it as a feature. This includes named formats (B format, A format, Royal, Demy, Crown Quarto, trade paperback, mass market, etc.) AND explicit dimensions (e.g. "Book size: 5 ⅜" x 8 ¼"", "234 x 153 mm", etc.). Add the full size string as a feature exactly as written, prefixed with "book size:" if a label is present.
  Example: "Book size: 5 ⅜" x 8 ¼"" → features: ["book size: 5 ⅜\" x 8 ¼\""]
  Example: "B format paperback" → features: ["B format paperback"] (keep size + binding together as one compound feature)
  Example: "Royal hardback" → features: ["Royal hardback"] (NOT split into ["Royal", "hardback"])
  Example: "Demy hardcover" → features: ["Demy hardcover"]
  Example: "Royal" alone (no binding mentioned) → features: ["Royal"]
- COVER DESCRIPTIONS: Add cover descriptions to features even when no artist is credited. This includes phrases like "Original trade cover (from the publisher)", "exclusive cover featuring a colourway variation of the trade cover", "special edition cover", "variant cover", etc.
  Example: "Original trade cover (from the publisher)" → features: ["Original trade cover (from the publisher)"]
  Example: "exclusive cover featuring a colourway variation of the trade cover" → features: ["exclusive cover featuring a colourway variation of the trade cover"]
- SEMICOLON QUALIFIERS: When a feature line contains a semicolon after the artist attribution parenthetical, the text after the semicolon is an additional qualifier/description that belongs to BOTH the feature and the artist role. Append it (preceded by "; ") to the feature string and to the artist role.
  Example: "Illustrated endpapers (by @nekokonut22); different front and back" →
    features: ["Illustrated endpapers; different front and back"]
    artists: [{ name: "@nekokonut22", role: "Illustrated endpapers; different front and back" }]
- MULTI-ARTIST PARENTHETICAL: When a single feature line has a parenthetical that contains multiple "role by @artist" pairs separated by semicolons, split into one artist entry per pair. Each artist's role is: the feature name + " (" + their specific role portion + ")". Also add one feature entry per pair using the same pattern (feature name + " (" + role portion + ")").
  Example: "Exclusive redesigned covers (art by @penglu_art; design by @chattynora)" →
    features: ["Exclusive redesigned covers (art)", "Exclusive redesigned covers (design)"]
    artists: [{ name: "@penglu_art", role: "Exclusive redesigned covers (art)" }, { name: "@chattynora", role: "Exclusive redesigned covers (design)" }]
  Example: "New chapter headers (illustration by @artist1; lettering by @artist2; colour by @artist3)" →
    features: ["New chapter headers (illustration)", "New chapter headers (lettering)", "New chapter headers (colour)"]
    artists: [{ name: "@artist1", role: "New chapter headers (illustration)" }, { name: "@artist2", role: "New chapter headers (lettering)" }, { name: "@artist3", role: "New chapter headers (colour)" }]
- Keep all parenthetical details in the feature description — e.g. "foiled cover (front and spine)" — do not strip text in parentheses
- When a feature includes "of [title/name]" — e.g. "first chapter of A Ballad for the Broken", "preview of Book 2", "excerpt of..." — keep the FULL phrase including "of [title]". Do NOT truncate to just "first chapter" or "preview".
- IMPORTANT: When a physical feature is attributed to an artist (e.g. "foiled cover by @artist", "illustrations by @artist"), ALWAYS add the feature description (without the "by @handle" part) to the features array AND also add the artist to the artists array. Both entries must be created — never skip the feature just because there is an artist attached to it.
  Example: "An exclusive foiled cover (front and spine) by @artisthandle" →
    features: ["exclusive foiled cover (front and spine)"]
    artists: [{ name: "@artisthandle", role: "exclusive foiled cover (front and spine)" }]
  Example: "naked hardcover (no dust jacket) with illustrations by @artist and endpapers by @artist2" →
    features: ["naked hardcover (no dust jacket)", "illustrations", "endpapers"]
    artists: [{ name: "@artist", role: "naked hardcover (no dust jacket) with illustrations" }, { name: "@artist2", role: "endpapers" }]
- INLINE MULTI-ARTIST (no parenthetical): When a line reads "[feature description] [role1] by @artist1 with [role2] by @artist2" (multiple artists credited inline for the SAME physical item), create ONE feature = the initial description before the first role verb/attribution, and create one artist entry per person using the pattern: role = feature name + " (" + their role word + ")". The feature must NOT include role verbs or artist handles.
  Example: "exclusive redesigned covers with foil illustrated by @palinlineart with design by @amysharpillustration" →
    features: ["exclusive redesigned covers with foil"]
    artists: [{ name: "@palinlineart", role: "exclusive redesigned covers with foil (illustrated)" }, { name: "@amysharpillustration", role: "exclusive redesigned covers with foil (design)" }]
  Example: "special edition endpapers painted by @artist1 with lettering by @artist2" →
    features: ["special edition endpapers"]
    artists: [{ name: "@artist1", role: "special edition endpapers (painted)" }, { name: "@artist2", role: "special edition endpapers (lettering)" }]
- Do NOT duplicate purely narrative artist-credit phrases as features (e.g. "designed by @handle" alone is not a physical feature). Only add to features if there is an actual physical item/element being described.
- EXCEPTION: Interior book production credits such as "formatting", "typesetting", "interior design", "interior layout" ARE valid features — even when attributed to an artist (e.g. "Formatting by @handle" → feature: "Formatting", artist: "@handle" with role "Formatting"). These describe a real production element of the edition.
- PRINT RUN / LIMITED COPIES: If the text mentions the number of copies, print run size, or limited edition quantity (e.g. "limited to 1500 copies", "strictly limited to 1500 signed and numbered copies", "print run of 500", "only 750 copies"), add it as a feature in the format: "limited to [N] copies". Extract the number and format consistently.
  Example: "strictly limited to 1500 signed and numbered copies" → features: ["limited to 1500 copies", "signed", "numbered"]
  Example: "limited edition of 500 copies" → features: ["limited to 500 copies"]
  Example: "print run: 2000" → features: ["limited to 2000 copies"]
- BINDING DETAILS: Physical binding features such as "Smyth sewn binding", "head and tail bands", "rounded and backed", "French links", etc. are physical characteristics and should always be added as features.

For dates, use ISO format YYYY-MM-DD. If only month/year is given, use the first day of that month.
For currency, use 3-letter ISO codes (GBP, USD, EUR, PLN, etc.).`;

const GOODREADS_BOOK_PROMPT = `You are a book data extractor. Given text copied from a Goodreads book page, extract structured book information.

Return ONLY valid JSON matching this schema (omit fields you cannot find):
{
  "title": "book title only, without series or volume info",
  "authors": [{ "name": "Full Author Name" }],
  "seriesName": "series name if present, e.g. Deception Duet",
  "volumeNumber": 2,
  "description": "full book blurb/synopsis",
  "genres": ["genre1", "genre2", "genre3"]
}

RULES:
- title: only the actual book title. Remove any "Series Name #N" prefix/suffix.
- seriesName: extract from a line like "Series Name #N" at the top, or from parenthetical in title.
- volumeNumber: extract the number from "#N" — must be a number (integer or decimal).
- description: the book blurb only. Do NOT include ratings, reviews count, genres, or author names.
- genres: take at most 5 genres from the Genres section. Omit if not present.
- authors: list all authors found.`;

const SALE_ANNOUNCEMENT_PROMPT = `You are a sale announcement data extractor for a luxury book subscription tracking app.
Given a sale announcement post (usually from a book subscription box company), extract structured information.

Return ONLY valid JSON matching this schema (omit fields you cannot find):
{
  "title": "announcement title, e.g. 'All Hail Chaos Exclusive Edition'",
  "expectedShipping": "e.g. November/December 2025",
  "regions": [
    {
      "name": "region name, e.g. UK/INT or US/Canada",
      "isDefault": true,
      "countryCodes": "comma-separated ISO country codes, e.g. GB,US,CA",
      "price": 24.00,
      "currency": "GBP",
      "saleTimezone": "BST",
      "firstAccessDate": "2025-07-15T09:00:00.000Z",
      "earlyAccessDate": "2025-07-15T13:00:00.000Z",
      "generalSaleDate": "2025-07-16T09:00:00.000Z"
    }
  ]
}

TITLE RULES:
- Extract the edition title from the announcement. Usually quoted or explicitly named.
- Keep "Exclusive Edition" if it's part of the product name.
- Example: "'All Hail Chaos' Exclusive Edition" → title: "All Hail Chaos Exclusive Edition"

REGION RULES:
- Look for different price/currency combinations or different regions mentioned (UK/INT, US/Canada, EU, AUS, etc.)
- The FIRST region/price mentioned = isDefault: true
- If NO regions are mentioned (single global price/date), do NOT create a regions array
- Each region should have: name, price, currency, and dates where available
- For dates: convert all times to UTC using the timezone mentioned
  - "10am BST" = BST is UTC+1 → 09:00 UTC
  - "10am ET" = ET/EDT is UTC-4 → 14:00 UTC; EST is UTC-5 → 15:00 UTC
  - firstAccessDate = earliest access date (e.g. previous customers/edition holders)
  - earlyAccessDate = subscriber/presale early access date
  - generalSaleDate = public/general sale date
- If multiple time slots exist for the same region (different customer tiers), use:
  - firstAccessDate = earliest slot, earlyAccessDate = subscriber slot, generalSaleDate = general public slot
- Extract timezone from the text and set saleTimezone (e.g. "BST", "ET", "UTC")
- For country codes: UK/INT → "GB", US/Canada → "US,CA", EU → omit, AUS → "AU", INT → omit
- If only one price/date is given for the entire announcement (no regional split), do NOT create regions array

SHIPPING:
- Extract expected shipping timeframe if mentioned (e.g. "ships around November/December", "expected to ship in Q1 2026")
- Include year if determinable from context (current year is 2026)

For dates, use ISO 8601 format with time and Z suffix (UTC). If only a date is given without time, use 00:00:00.000Z.
For currency, use 3-letter ISO codes (GBP, USD, EUR, PLN, etc.).`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('OPENAI_API_KEY');
    if (key) {
      this.client = new OpenAI({ apiKey: key });
      this.logger.log('OpenAI client initialized');
    } else {
      this.client = null;
      this.logger.warn('OPENAI_API_KEY not set — AI parse endpoint will be unavailable');
    }
  }

  async parse(input: { text?: string; imageUrl?: string }): Promise<AiParseResult> {
    if (!this.client) {
      throw new BadRequestException('OPENAI_API_KEY is not configured on the server');
    }
    if (!input.text && !input.imageUrl) {
      throw new BadRequestException('Provide either text or imageUrl');
    }

    // SSRF guard: never let users force the OpenAI vision endpoint to fetch
    // an internal/loopback/metadata URL on our behalf.
    if (input.imageUrl) {
      let url: URL;
      try {
        url = new URL(input.imageUrl);
      } catch {
        throw new BadRequestException('Invalid imageUrl');
      }
      if (url.protocol !== 'https:') {
        throw new BadRequestException('imageUrl must use https://');
      }
      const host = url.hostname.toLowerCase();
      const blocked =
        host === 'localhost' ||
        host === '0.0.0.0' ||
        host === '::1' ||
        host.endsWith('.local') ||
        host.endsWith('.internal') ||
        /^127\./.test(host) ||
        /^10\./.test(host) ||
        /^192\.168\./.test(host) ||
        /^169\.254\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
      if (blocked) {
        throw new BadRequestException('imageUrl points to a disallowed host');
      }
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

    if (input.imageUrl) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: 'Extract book edition information from this image:' },
          { type: 'image_url', image_url: { url: input.imageUrl, detail: 'high' } },
        ],
      });
    } else {
      messages.push({
        role: 'user',
        content: `Extract book edition information from this announcement:\n\n${input.text}`,
      });
    }

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new BadRequestException('No response from AI model');

    try {
      return JSON.parse(content) as AiParseResult;
    } catch {
      throw new BadRequestException('AI returned invalid JSON');
    }
  }

  private guardSsrf(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('Invalid URL');
    }
    if (url.protocol !== 'https:') {
      throw new BadRequestException('URL must use https://');
    }
    const host = url.hostname.toLowerCase();
    const blocked =
      host === 'localhost' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
    if (blocked) {
      throw new BadRequestException('URL points to a disallowed host');
    }
    return url;
  }

  private extractTextFromHtml(html: string): string {
    // Remove script/style blocks and their content
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      // Replace block-level tags with newlines
      .replace(/<\/(p|div|section|article|li|h[1-6]|br|tr|td|th|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Strip all remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
      // Collapse whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // Truncate to 15k chars to stay within token limits
    if (text.length > 15_000) {
      text = text.slice(0, 15_000) + '\n[content truncated]';
    }
    return text;
  }

  async parseSaleAnnouncementFromUrl(rawUrl: string): Promise<AiSaleAnnouncementResult> {
    this.guardSsrf(rawUrl);

    let html: string;
    try {
      const response = await fetch(rawUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; LuxGrimoire/1.0; +https://luxgrimoire.com)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new BadRequestException(`Failed to fetch URL: HTTP ${response.status}`);
      }
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('html') && !contentType.includes('text')) {
        throw new BadRequestException('URL did not return an HTML page');
      }
      html = await response.text();
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException(`Could not fetch URL: ${(e as Error).message}`);
    }

    const text = this.extractTextFromHtml(html);
    if (!text) {
      throw new BadRequestException('Could not extract text content from URL');
    }

    return this.parseSaleAnnouncement(text);
  }

  async parseSaleAnnouncement(text: string): Promise<AiSaleAnnouncementResult> {
    if (!this.client) {
      throw new BadRequestException('OPENAI_API_KEY is not configured on the server');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SALE_ANNOUNCEMENT_PROMPT },
      { role: 'user', content: `Extract sale announcement information from this text:\n\n${text}` },
    ];

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new BadRequestException('No response from AI model');

    try {
      return JSON.parse(content) as AiSaleAnnouncementResult;
    } catch {
      throw new BadRequestException('AI returned invalid JSON');
    }
  }

  async parseBookFromText(text: string): Promise<AiBookResult> {
    if (!this.client) {
      throw new BadRequestException('OPENAI_API_KEY is not configured on the server');
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: GOODREADS_BOOK_PROMPT },
      { role: 'user', content: `Extract book information from this Goodreads text:\n\n${text.slice(0, 8_000)}` },
    ];

    const response = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new BadRequestException('No response from AI model');

    try {
      return JSON.parse(content) as AiBookResult;
    } catch {
      throw new BadRequestException('AI returned invalid JSON');
    }
  }
}
