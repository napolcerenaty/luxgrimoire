package com.luxgrimoire.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rometools.rome.feed.synd.SyndEntry;
import com.rometools.rome.feed.synd.SyndFeed;
import com.rometools.rome.io.SyndFeedInput;
import com.rometools.rome.io.XmlReader;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URL;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.*;

@Service
public class PageScraperService {

    private final OpenAiService openAiService;

    public PageScraperService(@Lazy OpenAiService openAiService) {
        this.openAiService = openAiService;
    }

    // ── DTO ──────────────────────────────────────────────────────────────────────
    public static class ScrapedMonthData {
        public Integer year;
        public Integer month;
        public String  theme;
        public String  bookTitle;
        public String  bookAuthor;
        public String  imageUrl;
        public List<String> allImages = new ArrayList<>();
        public String  sourceUrl;
        public String  rawText;
    }

    public static class RssEntryInfo {
        public String guid;
        public String title;
        public String link;
        public java.time.Instant publishedDate;
    }

    // ── Month name maps ───────────────────────────────────────────────────────────
    private static final Map<String, Integer> MONTH_NAMES = new LinkedHashMap<>();
    static {
        // Polish nominative / genitive
        MONTH_NAMES.put("styczeń",    1);  MONTH_NAMES.put("stycznia",    1);
        MONTH_NAMES.put("luty",       2);  MONTH_NAMES.put("lutego",      2);
        MONTH_NAMES.put("marzec",     3);  MONTH_NAMES.put("marca",       3);
        MONTH_NAMES.put("kwiecień",   4);  MONTH_NAMES.put("kwietnia",    4);
        MONTH_NAMES.put("maj",        5);  MONTH_NAMES.put("maja",        5);
        MONTH_NAMES.put("czerwiec",   6);  MONTH_NAMES.put("czerwca",     6);
        MONTH_NAMES.put("lipiec",     7);  MONTH_NAMES.put("lipca",       7);
        MONTH_NAMES.put("sierpień",   8);  MONTH_NAMES.put("sierpnia",    8);
        MONTH_NAMES.put("wrzesień",   9);  MONTH_NAMES.put("września",    9);
        MONTH_NAMES.put("październik",10); MONTH_NAMES.put("października",10);
        MONTH_NAMES.put("listopad",  11);  MONTH_NAMES.put("listopada",  11);
        MONTH_NAMES.put("grudzień",  12);  MONTH_NAMES.put("grudnia",    12);
        // English
        MONTH_NAMES.put("january",    1);  MONTH_NAMES.put("february",    2);
        MONTH_NAMES.put("march",      3);  MONTH_NAMES.put("april",       4);
        MONTH_NAMES.put("may",        5);  MONTH_NAMES.put("june",        6);
        MONTH_NAMES.put("july",       7);  MONTH_NAMES.put("august",      8);
        MONTH_NAMES.put("september",  9);  MONTH_NAMES.put("october",    10);
        MONTH_NAMES.put("november",  11);  MONTH_NAMES.put("december",   12);
    }

    // Pattern to match  /2025/01/  or  -2025-01-  in URLs
    private static final Pattern URL_DATE_PATTERN = Pattern.compile("[/\\-](20\\d{2})[/\\-](0[1-9]|1[0-2])[/\\-]");

    // ── Public API ────────────────────────────────────────────────────────────────

    public ScrapedMonthData scrapeUrl(String url) {
        ScrapedMonthData result = new ScrapedMonthData();
        result.sourceUrl = url;

        try {
            Document doc = Jsoup.connect(url)
                    .timeout(10_000)
                    .userAgent("Mozilla/5.0 (compatible; LuxGrimoireBot/1.0)")
                    .get();

            // 1. Collect ALL candidate images from the page (for manual selection in UI)
            String ogImageAll = doc.select("meta[property=og:image]").attr("content");
            if (ogImageAll != null && !ogImageAll.isBlank()) {
                result.allImages.add(ogImageAll);
            }
            doc.select("img[src]").stream()
                    .map(img -> img.absUrl("src"))
                    .filter(src -> src != null && !src.isBlank())
                    .filter(src -> !looksLikeLogo(src))
                    .distinct()
                    .limit(20)
                    .forEach(result.allImages::add);
            // Deduplicate while preserving order
            List<String> seen = new ArrayList<>();
            for (String s : result.allImages) { if (!seen.contains(s)) seen.add(s); }
            result.allImages = seen;

            // 2. Pick best single imageUrl automatically (admin can override from allImages)
            String contentImg = findContentImage(doc, url);
            if (contentImg != null) {
                result.imageUrl = contentImg;
            } else {
                String ogImage = ogImageAll;
                if (ogImage != null && !ogImage.isBlank() && !looksLikeLogo(ogImage)) {
                    result.imageUrl = ogImage;
                } else {
                    Element firstImg = doc.select("img[src]").stream()
                            .filter(img -> !looksLikeLogo(img.absUrl("src")))
                            .findFirst().orElse(null);
                    if (firstImg != null) result.imageUrl = firstImg.absUrl("src");
                    else if (ogImage != null && !ogImage.isBlank()) result.imageUrl = ogImage;
                }
            }

            // Headings for theme candidate
            String h1 = doc.select("h1").text();
            String h2 = doc.select("h2").first() != null ? doc.select("h2").first().text() : "";
            result.theme = cleanThemeHeading(h1.isBlank() ? h2 : h1);

            // Full text (first 2000 chars for debugging)
            String fullText = doc.body() != null ? doc.body().text() : "";
            result.rawText = fullText.length() > 2000 ? fullText.substring(0, 2000) : fullText;

            // Try month/year from URL first (regex fallback)
            Matcher urlMatcher = URL_DATE_PATTERN.matcher(url);
            if (urlMatcher.find()) {
                result.year  = Integer.parseInt(urlMatcher.group(1));
                result.month = Integer.parseInt(urlMatcher.group(2));
            }

            // Try to parse month/year from text if not found in URL
            if (result.month == null) {
                int[] parsed = extractMonthYear(fullText);
                if (parsed != null) {
                    result.month = parsed[0];
                    result.year  = parsed[1];
                }
            }

            // Last-resort: find just a month name without requiring a year
            // (e.g. "January Cosy Theme: Tails of Magic" has no year in text)
            if (result.month == null) {
                Integer m = extractMonthFromText(result.theme);
                if (m == null) m = extractMonthFromText(url);
                if (m == null) m = extractMonthFromText(fullText.substring(0, Math.min(600, fullText.length())));
                if (m != null) result.month = m;
            }

            // Try to extract year from URL path like /2025/ if still missing
            if (result.year == null) {
                Matcher yearMatcher = Pattern.compile("/(20\\d{2})/").matcher(url);
                if (yearMatcher.find()) result.year = Integer.parseInt(yearMatcher.group(1));
            }

            // Fallback: current year
            if (result.year == null) result.year = LocalDate.now(ZoneOffset.UTC).getYear();

            // AI-enhanced extraction: override regex results if AI returns non-null values
            if (openAiService.isConfigured()) {
                ScrapedMonthData aiData = openAiService.extractFromText(fullText, url);
                if (aiData != null) {
                    if (aiData.month     != null) result.month     = aiData.month;
                    if (aiData.year      != null) result.year      = aiData.year;
                    if (aiData.theme     != null) result.theme     = aiData.theme;
                    if (aiData.bookTitle != null) result.bookTitle = aiData.bookTitle;
                    if (aiData.bookAuthor!= null) result.bookAuthor= aiData.bookAuthor;
                }
            }

        } catch (Exception e) {
            result.rawText = "Scraping error: " + e.getMessage();
        }

        return result;
    }

    public List<RssEntryInfo> parseRssFeed(String feedUrl) {
        List<RssEntryInfo> entries = new ArrayList<>();
        try {
            URL url = new URL(feedUrl);
            SyndFeedInput input = new SyndFeedInput();
            SyndFeed feed = input.build(new XmlReader(url));
            for (SyndEntry e : feed.getEntries()) {
                RssEntryInfo info = new RssEntryInfo();
                info.guid  = e.getUri() != null ? e.getUri() : e.getLink();
                info.title = e.getTitle();
                info.link  = e.getLink();
                if (e.getPublishedDate() != null) {
                    info.publishedDate = e.getPublishedDate().toInstant();
                } else if (e.getUpdatedDate() != null) {
                    info.publishedDate = e.getUpdatedDate().toInstant();
                }
                entries.add(info);
            }
        } catch (Exception ignored) {
            // Return empty list on any error (broken feeds, HTML responses, etc.)
        }
        return entries;
    }

    public ScrapedMonthData scrapeRssEntry(SyndEntry entry) {
        ScrapedMonthData data = scrapeUrl(entry.getLink());
        // Override theme with RSS title if scraping didn't yield a good one
        if ((data.theme == null || data.theme.isBlank()) && entry.getTitle() != null) {
            data.theme = entry.getTitle();
        }
        // If scraping didn't find a good image, try RSS enclosure or description img
        if (data.imageUrl == null || looksLikeLogo(data.imageUrl)) {
            String rssImg = extractImageFromRssEntry(entry);
            if (rssImg != null) data.imageUrl = rssImg;
        }
        // Use RSS published date if month/year still missing
        if (data.month == null && entry.getPublishedDate() != null) {
            LocalDate d = entry.getPublishedDate().toInstant().atZone(ZoneOffset.UTC).toLocalDate();
            data.month = d.getMonthValue();
            data.year  = d.getYear();
        }
        return data;
    }

    /** Try to extract an image URL from RSS enclosures or entry description/content. */
    private String extractImageFromRssEntry(SyndEntry entry) {
        // Check enclosures (podcasts/media feeds often include images here)
        if (entry.getEnclosures() != null) {
            for (var enc : entry.getEnclosures()) {
                if (enc.getType() != null && enc.getType().startsWith("image/") && enc.getUrl() != null) {
                    return enc.getUrl();
                }
            }
        }
        // Try to find <img> in entry description or content
        String html = null;
        if (entry.getDescription() != null) html = entry.getDescription().getValue();
        if ((html == null || html.isBlank()) && entry.getContents() != null && !entry.getContents().isEmpty()) {
            html = entry.getContents().get(0).getValue();
        }
        if (html != null && !html.isBlank()) {
            try {
                Document frag = Jsoup.parse(html);
                Element img = frag.select("img[src]").stream()
                        .filter(e -> !looksLikeLogo(e.absUrl("src")) && !looksLikeLogo(e.attr("src")))
                        .findFirst().orElse(null);
                if (img != null) {
                    String src = img.attr("src");
                    return src.isBlank() ? null : src;
                }
            } catch (Exception ignored) {}
        }
        return null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────────

    /** Try to extract the first meaningful image from article/blog post content area. */
    private String findContentImage(Document doc, String pageUrl) {
        // Common article content selectors ordered by specificity
        String[] contentSelectors = {
            "article img[src]",
            ".post-content img[src]", ".entry-content img[src]", ".post-body img[src]",
            ".blog-post-content img[src]", ".blog-content img[src]", ".article-content img[src]",
            ".post img[src]", ".entry img[src]", ".content img[src]",
            "figure img[src]", "main img[src]"
        };
        for (String sel : contentSelectors) {
            Element img = doc.select(sel).stream()
                    .filter(e -> !looksLikeLogo(e.absUrl("src")))
                    .findFirst().orElse(null);
            if (img != null) {
                String src = img.absUrl("src");
                if (!src.isBlank()) return src;
            }
        }
        return null;
    }

    /** Heuristic: does a URL look like it points to a logo or icon rather than a post image? */
    private boolean looksLikeLogo(String url) {
        if (url == null || url.isBlank()) return false;
        String lower = url.toLowerCase(Locale.ROOT);
        return lower.contains("logo") || lower.contains("icon") || lower.contains("favicon")
                || lower.contains("badge") || lower.contains("avatar") || lower.contains("sprite")
                || lower.matches(".*\\.(ico|svg)([?#].*)?$");
    }

    public List<ScrapedMonthData> scrapeParentPage(String parentUrl) {
        // Try WordPress REST API first (handles headless WP / SPAs)
        List<ScrapedMonthData> wpResults = tryWordPressRestApi(parentUrl);
        if (wpResults != null) return wpResults;

        // Fallback: HTML link scraping for regular blogs
        List<ScrapedMonthData> results = new ArrayList<>();
        try {
            Document doc = Jsoup.connect(parentUrl)
                    .timeout(10_000)
                    .userAgent("Mozilla/5.0 (compatible; LuxGrimoireBot/1.0)")
                    .get();

            String baseDomain = extractDomain(parentUrl);

            List<String> postLinks = doc.select("a[href]").stream()
                    .map(a -> a.absUrl("href"))
                    .filter(href -> href != null && !href.isBlank())
                    .filter(href -> href.contains(baseDomain))
                    .filter(href -> !href.equals(parentUrl) && !href.equals(parentUrl + "/"))
                    .filter(href -> looksLikePostLink(href, parentUrl))
                    .distinct()
                    .limit(15)
                    .collect(java.util.stream.Collectors.toList());

            java.util.concurrent.ExecutorService pool = java.util.concurrent.Executors.newFixedThreadPool(4);
            List<java.util.concurrent.Future<ScrapedMonthData>> futures = postLinks.stream()
                    .map(link -> pool.submit(() -> scrapeUrl(link)))
                    .collect(java.util.stream.Collectors.toList());
            pool.shutdown();
            pool.awaitTermination(60, java.util.concurrent.TimeUnit.SECONDS);

            for (var f : futures) {
                try {
                    ScrapedMonthData d = f.get();
                    if (d != null && d.month != null) results.add(d);
                } catch (Exception ignored) {}
            }

            sortByDate(results);
        } catch (Exception ignored) {}
        return results;
    }

    /**
     * Try to import posts using WordPress REST API.
     * - If the URL contains /category/, filters by that category (existing behaviour).
     * - Otherwise, fetches recent posts from the root WP REST API.
     *   This handles JS-rendered WordPress sites where Jsoup can't see article links.
     * Returns null if the site doesn't appear to be WordPress or the API is unavailable.
     */
    private List<ScrapedMonthData> tryWordPressRestApi(String parentUrl) {
        try {
            URI uri = new URI(parentUrl);
            String base = uri.getScheme() + "://" + uri.getHost();
            String path = uri.getPath();

            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .build();

            if (path.contains("/category/")) {
                // Category-filtered: resolve slug → ID then fetch by category
                String[] parts = path.replaceAll("/$", "").split("/");
                String slug = parts[parts.length - 1];
                if (slug.isBlank()) return null;

                String catJson = httpGet(http, base + "/wp-json/wp/v2/categories?slug=" + slug);
                if (catJson == null) return null;

                ObjectMapper mapper = new ObjectMapper();
                JsonNode cats = mapper.readTree(catJson);
                if (!cats.isArray() || cats.isEmpty()) return null;
                int categoryId = cats.get(0).get("id").asInt();

                return fetchWordPressPosts(base, http,
                        "/wp-json/wp/v2/posts?categories=" + categoryId + "&per_page=50&orderby=date&order=desc");
            } else {
                // Generic WordPress: try REST API without category filter.
                // Returns null if the endpoint is unavailable (non-WP site).
                return fetchWordPressPosts(base, http,
                        "/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc");
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    /** Fetches and processes paginated WP REST API posts. Returns null if endpoint unavailable. */
    private List<ScrapedMonthData> fetchWordPressPosts(String base, HttpClient http, String apiPath) {
        try {
            ObjectMapper mapper = new ObjectMapper();
            List<JsonNode> allPosts = new ArrayList<>();
            int page = 1;
            int totalPages = 1;
            do {
                String postsUrl = base + apiPath + "&page=" + page;
                HttpRequest req = HttpRequest.newBuilder()
                        .uri(new URI(postsUrl))
                        .timeout(Duration.ofSeconds(8))
                        .header("User-Agent", "Mozilla/5.0 (compatible; LuxGrimoireBot/1.0)")
                        .GET().build();
                HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() != 200) {
                    // 404 means not a WP site (or API disabled) — return null to fall through to HTML scraping
                    return page == 1 ? null : (allPosts.isEmpty() ? null : processWordPressPosts(allPosts));
                }
                if (page == 1) {
                    String tp = resp.headers().firstValue("X-WP-TotalPages").orElse("1");
                    try { totalPages = Integer.parseInt(tp.trim()); } catch (Exception ignored) {}
                }
                JsonNode pagePosts = mapper.readTree(resp.body());
                if (!pagePosts.isArray() || pagePosts.isEmpty()) break;
                pagePosts.forEach(allPosts::add);
                page++;
            } while (page <= totalPages && allPosts.size() < 200);

            return allPosts.isEmpty() ? null : processWordPressPosts(allPosts);
        } catch (Exception ignored) {
            return null;
        }
    }

    private List<ScrapedMonthData> processWordPressPosts(List<JsonNode> allPosts) {
        List<ScrapedMonthData> results = new ArrayList<>();
        DateTimeFormatter dtf = DateTimeFormatter.ISO_LOCAL_DATE_TIME;

        for (JsonNode post : allPosts) {
            try {
                ScrapedMonthData d = new ScrapedMonthData();
                d.sourceUrl = post.path("link").asText(null);

                String dateStr = post.path("date").asText(null);
                Integer postYear = null;
                Integer postMonth = null;
                if (dateStr != null) {
                    LocalDateTime dt = LocalDateTime.parse(dateStr, dtf);
                    postYear = dt.getYear();
                    postMonth = dt.getMonthValue();
                }

                // Theme from post title (cleaned of leading "Month Type: " prefix)
                String title = post.path("title").path("rendered").asText(null);
                if (title != null) {
                    d.theme = cleanThemeHeading(Jsoup.parse(title).text());
                    Integer titleMonth = extractMonthFromText(d.theme);
                    if (titleMonth == null) titleMonth = extractMonthFromText(Jsoup.parse(title).text());
                    if (titleMonth != null) d.month = titleMonth;
                }

                // Parse content HTML for images, text, and month
                String contentHtml = post.path("content").path("rendered").asText(null);
                if (contentHtml != null && !contentHtml.isBlank()) {
                    Document contentDoc = Jsoup.parse(contentHtml);
                    String bodyText = contentDoc.text();
                    d.rawText = bodyText.length() > 2000 ? bodyText.substring(0, 2000) : bodyText;

                    if (d.month == null) {
                        Integer contentMonth = extractMonthFromText(bodyText.substring(0, Math.min(300, bodyText.length())));
                        if (contentMonth != null) d.month = contentMonth;
                    }

                    contentDoc.select("img[src]").stream()
                            .map(img -> img.attr("src"))
                            .filter(src -> src != null && !src.isBlank() && !looksLikeLogo(src))
                            .distinct().limit(10)
                            .forEach(d.allImages::add);
                    if (!d.allImages.isEmpty()) d.imageUrl = d.allImages.get(0);

                    if (openAiService.isConfigured()) {
                        ScrapedMonthData ai = openAiService.extractFromText(
                                d.theme + "\n" + d.rawText, d.sourceUrl);
                        if (ai != null) {
                            if (ai.month     != null) d.month     = ai.month;
                            if (ai.theme     != null && !ai.theme.isBlank()) d.theme = ai.theme;
                            if (ai.bookTitle != null) d.bookTitle = ai.bookTitle;
                            if (ai.bookAuthor!= null) d.bookAuthor = ai.bookAuthor;
                        }
                    }
                }

                // Year from post date (adjust for year-end announcements)
                d.year = postYear;
                if (postYear != null && postMonth != null && d.month != null) {
                    if (postMonth >= 10 && d.month <= 3) d.year = postYear + 1;
                }
                if (d.year == null) d.year = LocalDate.now(ZoneOffset.UTC).getYear();

                // Featured image wins if present
                String featuredUrl = post.path("jetpack_featured_media_url").asText(null);
                if (featuredUrl != null && !featuredUrl.isBlank() && !looksLikeLogo(featuredUrl)) {
                    if (!d.allImages.contains(featuredUrl)) d.allImages.add(0, featuredUrl);
                    d.imageUrl = featuredUrl;
                }

                // Also try sourceUrl slug for month if still missing
                if (d.month == null && d.sourceUrl != null) {
                    d.month = extractMonthFromText(d.sourceUrl);
                }

                if (d.month != null) results.add(d);
            } catch (Exception ignored) {}
        }

        sortByDate(results);
        return results.isEmpty() ? null : results;
    }

    private String httpGet(HttpClient http, String url) {
        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(new URI(url))
                    .timeout(Duration.ofSeconds(8))
                    .header("User-Agent", "Mozilla/5.0 (compatible; LuxGrimoireBot/1.0)")
                    .GET().build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            return resp.statusCode() == 200 ? resp.body() : null;
        } catch (Exception e) { return null; }
    }

    private void sortByDate(List<ScrapedMonthData> list) {
        list.sort((a, b) -> {
            int cy = Integer.compare(b.year  != null ? b.year  : 0, a.year  != null ? a.year  : 0);
            if (cy != 0) return cy;
            return Integer.compare(b.month != null ? b.month : 0, a.month != null ? a.month : 0);
        });
    }

    private String extractDomain(String url) {
        try {
            java.net.URI uri = new java.net.URI(url);
            String host = uri.getHost();
            return host != null ? host.replaceFirst("^www\\.", "") : url;
        } catch (Exception e) { return url; }
    }

    /**
     * Strips leading "MonthName [words]: " or "MonthName [words] - " prefix from article headings.
     * Examples:
     *   "January Cosy Theme: Tails of Magic"  →  "Tails of Magic"
     *   "February Theme Reveal – The Lost Stars"  →  "The Lost Stars"
     *   "March Sale Announcement"  →  unchanged (no separator after prefix)
     */
    private static final Pattern HEADING_MONTH_PREFIX =
            Pattern.compile("^(?:january|february|march|april|may|june|july|august|september|october|november|december|"
                    + "styczeń|luty|marzec|kwiecień|maj|czerwiec|lipiec|sierpień|wrzesień|październik|listopad|grudzień)"
                    + "\\s+[^:–\\-–—]{0,40}[:\\-–—]\\s*", Pattern.CASE_INSENSITIVE);

    private String cleanThemeHeading(String heading) {
        if (heading == null || heading.isBlank()) return heading;
        Matcher m = HEADING_MONTH_PREFIX.matcher(heading.trim());
        if (m.find()) {
            String rest = heading.trim().substring(m.end()).trim();
            if (!rest.isBlank()) return rest;
        }
        return heading.trim();
    }

    private boolean looksLikePostLink(String href, String parentUrl) {
        if (href.length() <= parentUrl.length()) return false;
        String lower = href.toLowerCase(Locale.ROOT);
        if (lower.contains("/tag/") || lower.contains("/category/") || lower.contains("/author/")
            || lower.contains("/page/") || lower.contains("?") || lower.contains("#")
            || lower.endsWith(".jpg") || lower.endsWith(".png") || lower.endsWith(".pdf")
            || lower.contains("/wp-content/") || lower.contains("/feed/")) return false;
        return true;
    }

    /** Extract just a month number from text — no year required (useful for post titles like "May Theme: ..."). */
    private Integer extractMonthFromText(String text) {
        if (text == null) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, Integer> e : MONTH_NAMES.entrySet()) {
            // Match whole word only: check char before/after is not a letter
            String name = e.getKey();
            int idx = lower.indexOf(name);
            while (idx >= 0) {
                boolean before = idx == 0 || !Character.isLetter(lower.charAt(idx - 1));
                boolean after  = (idx + name.length()) >= lower.length()
                        || !Character.isLetter(lower.charAt(idx + name.length()));
                if (before && after) return e.getValue();
                idx = lower.indexOf(name, idx + 1);
            }
        }
        return null;
    }

    private int[] extractMonthYear(String text) {
        if (text == null) return null;
        String lower = text.toLowerCase(Locale.ROOT);

        // Try "MonthName YEAR" or "YEAR MonthName"
        for (Map.Entry<String, Integer> e : MONTH_NAMES.entrySet()) {
            String name = e.getKey();
            int idx = lower.indexOf(name);
            if (idx < 0) continue;

            // Look for a 4-digit year nearby (within 30 chars)
            int start = Math.max(0, idx - 30);
            int end   = Math.min(lower.length(), idx + name.length() + 30);
            String window = lower.substring(start, end);
            Matcher m = Pattern.compile("(20\\d{2})").matcher(window);
            if (m.find()) {
                return new int[]{ e.getValue(), Integer.parseInt(m.group(1)) };
            }
        }
        return null;
    }
}
