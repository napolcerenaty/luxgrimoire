import { XMLParser } from 'fast-xml-parser';
import { BlogFeedType } from '@prisma/client';

export interface FeedCandidate {
  feedType: BlogFeedType;
  feedUrl: string;
}

export interface FeedEntry {
  title: string;
  link: string;
  publishedAt: Date | null;
  contentHtml: string;
}

/**
 * Known feed-URL conventions, tried in order (spec section 2.1 — verified against
 * Illumicrate/OwlCrate/The Locked Library [Shopify `.atom`] and FairyLoot [WordPress
 * `/feed/`]). HTML-scrape fallback is handled by the caller once both of these fail.
 */
export function guessFeedCandidates(blogUrl: string): FeedCandidate[] {
  const base = blogUrl.replace(/\/+$/, '');
  return [
    { feedType: 'SHOPIFY_ATOM', feedUrl: `${base}.atom` },
    { feedType: 'WORDPRESS', feedUrl: `${base}/feed/` },
  ];
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
});

/** Normalises whatever fast-xml-parser gives back for a possibly-repeated node into an array. */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textOf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && '#text' in (value as any)) return String((value as any)['#text'] ?? '');
  return String(value);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(textOf(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Parses either an Atom feed (`<feed><entry>`) or an RSS 2.0 feed (`<rss><channel><item>`) into a common shape. */
export function parseFeedXml(xml: string): FeedEntry[] {
  const doc = xmlParser.parse(xml);

  if (doc.feed) {
    // Atom
    return asArray(doc.feed.entry).map((entry: any) => {
      const links = asArray(entry.link);
      const htmlLink = links.find((l) => l?.['@_rel'] === 'alternate') ?? links[0];
      return {
        title: textOf(entry.title),
        link: htmlLink?.['@_href'] ?? textOf(entry.id),
        publishedAt: parseDate(entry.published ?? entry.updated),
        contentHtml: textOf(entry.content ?? entry.summary),
      };
    });
  }

  if (doc.rss?.channel) {
    // RSS 2.0
    return asArray(doc.rss.channel.item).map((item: any) => ({
      title: textOf(item.title),
      link: textOf(item.link),
      publishedAt: parseDate(item.pubDate),
      contentHtml: textOf(item['content:encoded'] ?? item.description),
    }));
  }

  return [];
}
