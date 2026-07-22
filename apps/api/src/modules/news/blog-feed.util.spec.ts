import { guessFeedCandidates, parseFeedXml } from './blog-feed.util';

describe('guessFeedCandidates (spec 2.1)', () => {
  it('proposes the Shopify .atom convention first, then WordPress /feed/', () => {
    expect(guessFeedCandidates('https://illumicrate.com/blogs/news')).toEqual([
      { feedType: 'SHOPIFY_ATOM', feedUrl: 'https://illumicrate.com/blogs/news.atom' },
      { feedType: 'WORDPRESS', feedUrl: 'https://illumicrate.com/blogs/news/feed/' },
    ]);
  });

  it('strips a trailing slash before appending the feed suffix', () => {
    expect(guessFeedCandidates('https://community.fairyloot.com/')).toEqual([
      { feedType: 'SHOPIFY_ATOM', feedUrl: 'https://community.fairyloot.com.atom' },
      { feedType: 'WORDPRESS', feedUrl: 'https://community.fairyloot.com/feed/' },
    ]);
  });
});

describe('parseFeedXml — Atom (Shopify-style)', () => {
  const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>News</title>
  <entry>
    <title>August 2026 Theme Reveal</title>
    <link rel="alternate" type="text/html" href="https://example.com/blogs/news/august-2026-theme"/>
    <published>2026-07-20T09:00:00-04:00</published>
    <content type="html">&lt;p&gt;This month's theme is...&lt;/p&gt;</content>
  </entry>
  <entry>
    <title>Older post</title>
    <link rel="alternate" type="text/html" href="https://example.com/blogs/news/older-post"/>
    <published>2026-06-01T09:00:00-04:00</published>
    <content type="html">&lt;p&gt;Old news&lt;/p&gt;</content>
  </entry>
</feed>`;

  it('extracts title/link/publishedAt/contentHtml per entry', () => {
    const entries = parseFeedXml(atom);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      title: 'August 2026 Theme Reveal',
      link: 'https://example.com/blogs/news/august-2026-theme',
      publishedAt: new Date('2026-07-20T09:00:00-04:00'),
      contentHtml: "<p>This month's theme is...</p>",
    });
  });
});

describe('parseFeedXml — RSS 2.0 (WordPress-style)', () => {
  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>FairyLoot News</title>
    <item>
      <title>Author Interview: RJ Barker</title>
      <link>https://community.fairyloot.com/author-interview-rj-barker/</link>
      <pubDate>Mon, 20 Jul 2026 12:00:00 +0000</pubDate>
      <description>&lt;p&gt;We sat down with RJ Barker...&lt;/p&gt;</description>
    </item>
  </channel>
</rss>`;

  it('extracts title/link/publishedAt/contentHtml from <item>', () => {
    const entries = parseFeedXml(rss);
    expect(entries).toHaveLength(1);
    expect(entries[0].title).toBe('Author Interview: RJ Barker');
    expect(entries[0].link).toBe('https://community.fairyloot.com/author-interview-rj-barker/');
    expect(entries[0].contentHtml).toBe('<p>We sat down with RJ Barker...</p>');
    expect(entries[0].publishedAt).toEqual(new Date('Mon, 20 Jul 2026 12:00:00 +0000'));
  });
});

describe('parseFeedXml — unrecognised XML', () => {
  it('returns an empty array instead of throwing when neither <feed> nor <rss><channel> is present', () => {
    expect(parseFeedXml('<html><body>not a feed</body></html>')).toEqual([]);
  });
});
