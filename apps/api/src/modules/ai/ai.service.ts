import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

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
- Keep all parenthetical details in the feature description — e.g. "foiled cover (front and spine)" — do not strip text in parentheses
- When a feature includes "of [title/name]" — e.g. "first chapter of A Ballad for the Broken", "preview of Book 2", "excerpt of..." — keep the FULL phrase including "of [title]". Do NOT truncate to just "first chapter" or "preview".
- IMPORTANT: When a physical feature is attributed to an artist (e.g. "foiled cover by @artist", "illustrations by @artist"), ALWAYS add the feature description (without the "by @handle" part) to the features array AND also add the artist to the artists array. Both entries must be created — never skip the feature just because there is an artist attached to it.
  Example: "An exclusive foiled cover (front and spine) by @artisthandle" →
    features: ["exclusive foiled cover (front and spine)"]
    artists: [{ name: "@artisthandle", role: "exclusive foiled cover (front and spine)" }]
  Example: "naked hardcover (no dust jacket) with illustrations by @artist and endpapers by @artist2" →
    features: ["naked hardcover (no dust jacket)", "illustrations", "endpapers"]
    artists: [{ name: "@artist", role: "naked hardcover (no dust jacket) with illustrations" }, { name: "@artist2", role: "endpapers" }]
- Do NOT duplicate purely narrative artist-credit phrases as features (e.g. "designed by @handle" alone is not a physical feature). Only add to features if there is an actual physical item/element being described.

For dates, use ISO format YYYY-MM-DD. If only month/year is given, use the first day of that month.
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
}
