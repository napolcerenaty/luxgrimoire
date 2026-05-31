import { Injectable, Logger, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { FeatureTaggerService } from '../feature-categories/feature-tagger.service';

export interface AiSaleRegion {
  name: string;
  isDefault: boolean;
  countryCodes?: string;
  price?: number;
  subscriberBasePrice?: number;
  currency?: string;
  saleTimezone?: string;
  firstAccessDate?: string;
  earlyAccessDate?: string;
  generalSaleDate?: string;
}

export interface AiSaleAnnouncementResult {
  title?: string;
  companyName?: string;
  subscriberBasePrice?: number;
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
    /** Normalized category slugs per raw feature value (post-processing) */
    featureTags?: Record<string, string[]>;
    artistTags?: Record<string, string[]>;
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
    "features": ["Sprayed edges", "Ribbon bookmark", "Exclusive art print", "Signed bookplate"],
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
- "Foiled Author Signature" means a foil-stamped facsimile of the author's signature — it is NOT a hand-signed copy. In that case:
  - Add "Foiled Author Signature" (exact phrase, capitalised) to the features array — do NOT add "signed" or "digitally signed"
  - Example: "Foiled Author Signature" → features: ["Foiled Author Signature"]
- If the text contains phrases like "signed by the author on a page designed by @artist", "hand-signed by the author on a page designed by @artist", or similar (author signs on a page whose DESIGN is credited to @artist):
  - Add "signed" to the features array (it IS a hand-signed copy)
  - Add the @artist as an artist entry with role: "author signature page"
  - Do NOT add the author as an artist entry
  - Example: "Signed by the author on a page designed by @apollosproblemchild" → features: ["signed"], artists: [{ name: "@apollosproblemchild", role: "author signature page" }]
  - Example: "Hand-signed by the author on a page designed by @apollosproblemchild" → features: ["signed"], artists: [{ name: "@apollosproblemchild", role: "author signature page" }]
- SIGNED PHYSICAL ITEM: If "signed" appears as an attribute of a PHYSICAL ITEM (e.g. "Custom endpapers which are signed by the author"), capture BOTH the physical item as its own separate feature AND "signed" as an additional separate feature. Never reduce a sentence describing a physical feature to just "signed" alone — the physical item must not be lost.
  - Example: "Custom endpapers which are signed by the author" → features: ["Custom endpapers", "signed"]
  - Example: "Custom signed bookplate" → features: ["signed bookplate"] (here the item IS a signed bookplate — keep as one entry, no need to split)

ARTIST EXTRACTION RULES:
- Look for @mentions combined with descriptions of what they designed/drew/illustrated
- Keep the @ prefix in the name exactly as written (e.g. "@artistname")
- The "role" field MUST capture the FULL description of what this person created — the physical item or creative work — starting from the beginning of the bullet/sentence. KEEP all parenthetical text in parentheses (e.g. "(no dust jacket)") — do not remove or paraphrase them.
- ATTRIBUTION VERB RULE: The word immediately before "by @handle" is often an attribution verb (designed, illustrated, painted, drawn, created, made, etc.). Do NOT include this trailing attribution verb in the role — strip it. The role should end with the SUBJECT (the thing created), not the verb used to credit it.
  Example: "Digitally printed edges designed by @artist" → role: "Digitally printed edges" (NOT "Digitally printed edges designed")
  Example: "sprayed edges illustrated by @artist" → role: "sprayed edges"
  Exception: when the verb is part of the name of the thing (e.g. "hand-lettered chapter headers" — "lettered" is part of the noun phrase, not the attribution verb). Use judgment: if removing the last word leaves an incomplete or nonsensical description, keep it.
- When the structure is "[item] [verb] by @handle", the role = [item] only. When the structure is "[verb phrase] by @handle" (verb phrase IS the work description), keep the verb phrase as-is.
  Example: "cover art by @someartist" → role: "cover art" (no trailing verb to strip)
  Example: "cover illustrated by @artist" → role: "cover" (strip "illustrated")
  Example: "hand-lettered chapter headers and map by @mapmaker" → role: "hand-lettered chapter headers and map" (no trailing verb)
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
- ORDER PRESERVATION: List features and artists in the EXACT ORDER they appear in the source text. Do not sort, reorder, or group them. The first feature mentioned in the text must be first in the array, and so on.
- CASING: The FIRST letter of every feature string must always be uppercase (sentence-start capitalisation). Preserve the original capitalisation of all subsequent words exactly as they appear in the source — if the source capitalises a word (e.g. "Foiled", "Exclusive"), keep it capitalised; if it uses lowercase (e.g. "ribbon bookmark"), keep it lowercase. EXCEPTION: if a word in the source appears in ALL CAPS (e.g. "SPECIAL", "SIGNED"), convert it to lowercase (e.g. "special", "signed"). Never fully uppercase or fully lowercase an entire phrase.
- Extract ALL physical extras: sprayed/dyed edges, foil details, ribbon bookmarks, art prints, bookplates, stickers, maps, endpapers, gilded pages, dust jacket, slipcase, etc.
- Also include: signed, numbered, exclusive content notes
- BINDING/FORMAT: If the text explicitly mentions a binding or format type such as "hardcover", "paperback", "cloth bound", "leatherette", "naked hardcover (no dust jacket)", etc., add it as a feature. These are physical characteristics of the edition.
  Example: "hardcover edition with sprayed edges" → features: ["hardcover", "sprayed edges"]
  Example: "paperback with foiled cover" → features: ["paperback", "foiled cover"]
- BOOK SIZE: If the text mentions a book size or format, extract it as a feature. This includes named formats (B format, A format, Royal, Demy, Crown Quarto, trade paperback, mass market, etc.) AND explicit dimensions. When dimensions are given in US inches, convert to the closest UK/European standard name — do NOT output raw inch dimensions alone. Use this mapping:
  • ~4.25" × 6.87" / ~108 × 175mm → "A format" (mass market paperback)
  • ~5" × 7.75" to 5.12" × 7.8" / ~129 × 198mm → "B format"
  • ~5.5" × 8.5" / ~140 × 216mm → "Demy" (if hardcover: "Demy hardback"; if paperback: "Demy paperback")
  • ~6" × 9" / ~152 × 229mm → "Royal" (if hardcover: "Royal hardback"; if paperback: "Royal paperback")
  • ~6.14" × 9.21" / ~156 × 234mm → "Royal"
  • ~7" × 10" / ~178 × 254mm → "Crown Quarto"
  • ~8.5" × 11" / A4 → "A4 large format"
  • Metric dimensions (mm): convert to nearest named format using the same table
  OUTPUT FORMAT: When the original text uses non-UK dimensions (inches or mm), output the feature as "[original size text] (≈ [UK name])". When the text already uses UK standard names (Royal, Demy, B format, etc.), output as-is combined with binding if present — no "(≈ …)" annotation needed.
  If the size does not match any standard name within reasonable tolerance, output as "book size: [WxH]mm".
  Examples: "Book size: 5.5\" x 8.5\"" → features: ["5.5\" x 8.5\" (≈ Demy)"]
  Example: "5 ⅜\" x 8 ¼\"" → features: ["5 ⅜\" x 8 ¼\" (≈ Demy)"]
  Example: "B format paperback" → features: ["B format paperback"] (already UK standard — no annotation needed)
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
  IMPORTANT: This rule applies ONLY when the original source text contains a semicolon AFTER an artist attribution parenthetical. Do NOT use semicolons to replace parentheses that are already in the feature name itself.
  Example: "Foiled end pages (different front and back) designed by @harteus" →
    features: [] (covered by artist entry)
    artists: [{ name: "@harteus", role: "Foiled end pages (different front and back)" }]
  The parenthetical "(different front and back)" is part of the feature name — keep it in parentheses, do NOT rewrite it as "Foiled end pages; different front and back".
- MULTI-ARTIST PARENTHETICAL: When a single feature line has a parenthetical that contains multiple "role by @artist" pairs separated by semicolons, create ONE feature entry using only the base feature name (strip the entire parenthetical). Split into one artist entry per pair — each artist's role is: the feature name + " (" + their specific role portion + ")".
  Example: "Exclusive redesigned covers (art by @penglu_art; design by @chattynora)" →
    features: ["Exclusive redesigned covers"]
    artists: [{ name: "@penglu_art", role: "Exclusive redesigned covers (art)" }, { name: "@chattynora", role: "Exclusive redesigned covers (design)" }]
  Example: "New chapter headers (illustration by @artist1; lettering by @artist2; colour by @artist3)" →
    features: ["New chapter headers"]
    artists: [{ name: "@artist1", role: "New chapter headers (illustration)" }, { name: "@artist2", role: "New chapter headers (lettering)" }, { name: "@artist3", role: "New chapter headers (colour)" }]
- Keep all parenthetical details in the feature description — e.g. "foiled cover (front and spine)" — do not strip text in parentheses
- When a feature includes "of [title/name]" — e.g. "first chapter of A Ballad for the Broken", "preview of Book 2", "excerpt of..." — keep the FULL phrase including "of [title]". Do NOT truncate to just "first chapter" or "preview".
- IMPORTANT: When a physical feature is attributed to an artist (e.g. "foiled cover by @artist", "illustrations by @artist"), add the artist to the artists array with role = the feature description. Do NOT add that feature separately to the features array — the artist entry already captures it. Only add to features array items that have NO artist attribution.
  Exception: When ONE feature has MULTIPLE artists (e.g. via parenthetical or semicolons), DO include it once in features array (using the base feature name only) AND also create one artist entry per person.
  Example: "An exclusive foiled cover (front and spine) by @artisthandle" →
    features: [] (no standalone feature — covered by artist entry)
    artists: [{ name: "@artisthandle", role: "exclusive foiled cover (front and spine)" }]
  Example: "naked hardcover (no dust jacket) with illustrations by @artist and endpapers by @artist2" →
    features: ["naked hardcover (no dust jacket)"] (binding = no artist, so it stays)
    artists: [{ name: "@artist", role: "naked hardcover (no dust jacket) with illustrations" }, { name: "@artist2", role: "endpapers" }]
  Example: "sprayed edges, ribbon bookmark, art print" (no artists) →
    features: ["sprayed edges", "ribbon bookmark", "art print"]
    artists: []
- FEATURE TRAILING VERBS: When a feature description ends with a trailing attribution verb (e.g. "designed", "illustrated", "painted", "drawn", "created", "written"), strip that trailing verb. The trailing verb is one that would normally be followed by "by @artist" but either no artist is credited or the artist is mentioned elsewhere.
  Example: "Reversible dust jacket designed" → feature: "Reversible dust jacket"
  Example: "Exclusive gilded edges painted" → feature: "Exclusive gilded edges"
  NOTE: Do NOT strip verbs that are an integral part of the feature name (e.g. "digitally printed edges" — "printed" is part of the material description, not an attribution verb).
- INLINE MULTI-ARTIST (no parenthetical): When a line credits multiple artists for the SAME physical item inline — patterns like "[feature] [role1] by [artist1] and [role2] by [artist2]", "[feature] [role1] by [artist1] with [role2] by [artist2]", or similar — create EXACTLY ONE feature entry for the entire combined description (including any trailing qualifiers or parentheticals), and one artist entry per person. Each artist's role = full combined feature name + " (" + normalised role noun + ")". The feature must NOT include role verbs or artist names/handles. NEVER create multiple feature entries for different parts of the same inline multi-artist line.
  ROLE VERB NORMALISATION: Convert attribution verbs to noun form for the parenthetical: "designed/design" → "design", "illustrated/illustration" → "illustration", "painted" → "painting", "art" → "art", "lettering" → "lettering", "colour/coloured" → "colour", "composed/composing" → "composition".
  Artist names may or may not have an @ prefix — capture them exactly as written (with or without @).
  Example: "Exclusive redesigned dust jacket with art by 2 ghosts and designed by @lichen_and_limestone" →
    features: ["Exclusive redesigned dust jacket"]
    artists: [{ name: "2 ghosts", role: "Exclusive redesigned dust jacket (art)" }, { name: "@lichen_and_limestone", role: "Exclusive redesigned dust jacket (design)" }]
  Example: "exclusive redesigned covers with foil illustrated by @palinlineart with design by @amysharpillustration" →
    features: ["exclusive redesigned covers with foil"]
    artists: [{ name: "@palinlineart", role: "exclusive redesigned covers with foil (illustration)" }, { name: "@amysharpillustration", role: "exclusive redesigned covers with foil (design)" }]
  Example: "special edition endpapers painted by @artist1 with lettering by @artist2" →
    features: ["special edition endpapers"]
    artists: [{ name: "@artist1", role: "special edition endpapers (painting)" }, { name: "@artist2", role: "special edition endpapers (lettering)" }]
  Example: "Character artwork on the endpapers by @gonzalom.art with foil by @blanca.design (different front and back)" →
    features: ["Character artwork on the endpapers with foil (different front and back)"]
    artists: [{ name: "@gonzalom.art", role: "Character artwork on the endpapers with foil (different front and back) (artwork)" }, { name: "@blanca.design", role: "Character artwork on the endpapers with foil (different front and back) (foil)" }]
  Example: "Printed hardcover case with foil designed by @artist1 with lettering by @artist2" →
    features: ["Printed hardcover case with foil"]
    artists: [{ name: "@artist1", role: "Printed hardcover case with foil (design)" }, { name: "@artist2", role: "Printed hardcover case with foil (lettering)" }]
- SINGLE ARTIST WITH CONTINUATION ("X by @artist with Y" where Y has no artist): When a feature line attributes ONE artist and continues with "with [additional description]" that has no "by @artist" attribution, treat the additional description as part of the same feature/role — do NOT crop it. The artist's role = full combined description (minus the attribution verb). Do NOT create a separate feature entry for the additional description.
  Example: "Digitally sprayed edge by @bluelyboo with solid sprayed top and bottom edges" →
    features: [] (covered by artist entry)
    artists: [{ name: "@bluelyboo", role: "Digitally sprayed edge with solid sprayed top and bottom edges" }]
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
- genres: take at most 5 genres from the Genres section. Omit if not present. NEVER include "Audiobook" or "Book Club" in genres — skip them entirely.
- authors: list all authors found.`;

const SALE_ANNOUNCEMENT_PROMPT = `You are a sale announcement data extractor for a luxury book subscription tracking app.
Given a sale announcement post (usually from a book subscription box company), extract structured information.

Return ONLY valid JSON matching this schema (omit fields you cannot find):
{
  "title": "announcement title, e.g. 'All Hail Chaos Exclusive Edition'",
  "companyName": "name of the book subscription company, e.g. 'The Locked Library', 'Illumicrate', 'Owlcrate'",
  "subscriberBasePrice": 22.00,
  "expectedShipping": "e.g. November/December 2025",
  "regions": [
    {
      "name": "region name, e.g. UK/INT or US/Canada",
      "isDefault": true,
      "countryCodes": "comma-separated ISO country codes, e.g. GB,US,CA",
      "price": 24.00,
      "subscriberBasePrice": 22.00,
      "currency": "GBP",
      "saleTimezone": "BST",
      "firstAccessDate": "2025-07-15T09:00:00.000Z",
      "earlyAccessDate": "2025-07-15T13:00:00.000Z",
      "generalSaleDate": "2025-07-16T09:00:00.000Z"
    }
  ]
}

COMPANY NAME RULES:
- Extract the name of the book subscription company or box that is announcing this sale
- Look for it in: explicit mentions ("The Locked Library announces…", "We are Illumicrate"), hashtags (#thelockedlibrary → "The Locked Library", #illumicrate → "Illumicrate"), the "we" context ("The Locked Librarians are thrilled…" → "The Locked Library")
- If a source URL is provided (e.g. "illumicrate.com/…"), extract the company name from the domain: illumicrate.com → "Illumicrate", thelockedlibrary.com → "The Locked Library", owlcrate.com → "Owlcrate"
- Use proper capitalisation (e.g. "The Locked Library", "Illumicrate", "Owlcrate", "FairyLoot")

SUBSCRIBER PRICE RULES:
- If the announcement mentions a special lower price for active/current subscribers (phrases like "Subscriber price: £22", "for active subscribers the price will drop to £75", "subscriber-only price: £X", "subscribers pay £X"), extract it as subscriberBasePrice
- subscriberBasePrice is a numeric price (same currency as the general basePrice/currency)
- Do NOT confuse with the general sale price — subscriberBasePrice is LOWER and only for existing subscribers
- If there are regions and the subscriber price differs per region, set subscriberBasePrice on the relevant region object instead of (or in addition to) the top-level field

TITLE RULES:
- Extract the edition title from the announcement. Usually quoted or explicitly named.
- Keep "Exclusive Edition" if it's part of the product name.
- Example: "'All Hail Chaos' Exclusive Edition" → title: "All Hail Chaos Exclusive Edition"
- AUTHOR IN TITLE: If the announcement title or product name includes an author credit in the format "by [Author Name]" (e.g. "The Name of the Wind by Patrick Rothfuss Exclusive Edition"), ALWAYS include the "by [Author Name]" part in the title. Never strip it.
  - Example: "The Way of Kings by Brandon Sanderson Exclusive Edition" → title: "The Way of Kings by Brandon Sanderson Exclusive Edition"
  - Example: "A Court of Thorns and Roses by Sarah J. Maas" → title: "A Court of Thorns and Roses by Sarah J. Maas"

REGION RULES:
- Look for different price/currency combinations or different regions mentioned (UK/INT, US/Canada, EU, AUS, etc.)
- The FIRST region/price mentioned = isDefault: true
- If NO regions are mentioned (single global price/date), do NOT create a regions array
- If only ONE region is mentioned (e.g. the whole announcement has one price/currency/date set), do NOT create a regions array — the data will be applied to the sale announcement defaults directly
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
- If exactly one region exists (even if named), do NOT create regions array — it becomes the sale announcement default

SHIPPING:
- Extract expected shipping timeframe if mentioned (e.g. "ships around November/December", "expected to ship in Q1 2026")
- Include year if determinable from context (current year is 2026)

For dates, use ISO 8601 format with time and Z suffix (UTC). If only a date is given without time, use 00:00:00.000Z.
For currency, use 3-letter ISO codes (GBP, USD, EUR, PLN, etc.).`;

/**
 * Normalises specific plural forms to singular in feature/role strings.
 * Preserves original casing of surrounding text (only replaces the matched word).
 * Examples:
 *   "exclusive re-designed covers"  → "exclusive re-designed cover"
 *   "Foiled hardcases"              → "Foiled hardcase"
 *   "ribbon bookmarks"              → "ribbon bookmark"
 */
function normalizePlurals(value: string): string {
  return value
    .replace(/\bribbon bookmarks\b/gi, m => m.slice(0, -1))   // ribbon bookmarks → ribbon bookmark
    .replace(/\bdust jackets\b/gi,     m => m.slice(0, -1))   // dust jackets → dust jacket
    .replace(/\bjackets\b/gi,          m => m.slice(0, -1))   // jackets → jacket
    .replace(/\bhardcases\b/gi,        m => m.slice(0, -1))   // hardcases → hardcase
    .replace(/\bhardbacks\b/gi,        m => m.slice(0, -1))   // hardbacks → hardback
    .replace(/\bpaperbacks\b/gi,       m => m.slice(0, -1))   // paperbacks → paperback
    .replace(/\bcovers\b/gi,           m => m.slice(0, -1));  // covers → cover
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly featureTagger: FeatureTaggerService,
  ) {
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

    const content = await this.callOpenAi({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 1200,
    });

    try {
      const result = JSON.parse(content) as AiParseResult;

      // ── Plural → singular normalization ──────────────────────────────────────
      // Applied to both standalone feature values and artist role descriptions
      // before tagging, so the stored values are already in canonical form.
      if (result.edition) {
        if (result.edition.features) {
          result.edition.features = result.edition.features.map(normalizePlurals);
        }
        if (result.edition.artists) {
          result.edition.artists = result.edition.artists.map(a => ({
            ...a,
            role: a.role ? normalizePlurals(a.role) : a.role,
          }));
        }
      }

      // Post-process: build unified featureTags map covering both standalone features
      // and base feature names derived from artist roles (single-artist features only
      // appear in artists[], not features[], so we must include them here).
      try {
        const standaloneFeatures = result.edition?.features ?? [];
        const artistBaseFeatures = (result.edition?.artists ?? [])
          .map(a => (a.role ?? '').replace(/\s*\(\w+\)$/, '').trim())
          .filter(Boolean);
        const allRaws = Array.from(new Set([...standaloneFeatures, ...artistBaseFeatures]));
        if (allRaws.length > 0) {
          const featureTags = await this.featureTagger.categorizeMany(allRaws);
          if (result.edition) result.edition.featureTags = featureTags;
        }
      } catch {
        // Tagging is best-effort — never fail the AI parse due to tagger errors
      }
      return result;
    } catch {
      throw new BadRequestException('AI returned invalid JSON');
    }
  }

  private async callOpenAi(params: Parameters<OpenAI['chat']['completions']['create']>[0]): Promise<string> {
    let response: OpenAI.Chat.Completions.ChatCompletion;
    try {
      response = await this.client!.chat.completions.create(params) as OpenAI.Chat.Completions.ChatCompletion;
    } catch (err: unknown) {
      if (err instanceof OpenAI.APIError) {
        this.logger.error(`OpenAI API error: ${err.status} ${err.message}`);
        if (err.status === 401) throw new BadRequestException('OpenAI API key is invalid or expired');
        if (err.status === 429) throw new BadRequestException('OpenAI rate limit or quota exceeded');
        if (err.status === 503 || err.status === 502) throw new InternalServerErrorException('OpenAI service temporarily unavailable');
        throw new InternalServerErrorException(`OpenAI error: ${err.message}`);
      }
      this.logger.error('Unexpected error calling OpenAI', err);
      throw new InternalServerErrorException('Unexpected error calling AI service');
    }
    const content = response.choices[0]?.message?.content;
    if (!content) throw new BadRequestException('No response from AI model');
    return content;
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

    return this.parseSaleAnnouncement(text, rawUrl);
  }

  async parseSaleAnnouncement(text: string, sourceUrl?: string): Promise<AiSaleAnnouncementResult> {
    if (!this.client) {
      throw new BadRequestException('OPENAI_API_KEY is not configured on the server');
    }

    let userContent = `Extract sale announcement information from this text:\n\n${text}`;
    if (sourceUrl) {
      userContent = `Source URL: ${sourceUrl}\n\n` + userContent;
    }

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: SALE_ANNOUNCEMENT_PROMPT },
      { role: 'user', content: userContent },
    ];

    const content = await this.callOpenAi({
      model: 'gpt-4o',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 2000,
    });

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

    const content = await this.callOpenAi({
      model: 'gpt-4o-mini',
      messages,
      response_format: { type: 'json_object' },
      max_tokens: 800,
    });

    try {
      return JSON.parse(content) as AiBookResult;
    } catch {
      throw new BadRequestException('AI returned invalid JSON');
    }
  }
}
