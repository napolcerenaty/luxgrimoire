package com.luxgrimoire.backend.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.luxgrimoire.backend.model.PendingMonthImport;
import com.luxgrimoire.backend.model.SubscriptionImportSource;
import com.luxgrimoire.backend.repository.PendingMonthImportRepository;
import com.luxgrimoire.backend.repository.SubscriptionImportSourceRepository;
import com.luxgrimoire.backend.service.PageScraperService;
import com.luxgrimoire.backend.service.PageScraperService.RssEntryInfo;
import com.luxgrimoire.backend.service.PageScraperService.ScrapedMonthData;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
public class RssFeedScheduler {

    private static final Logger log = LoggerFactory.getLogger(RssFeedScheduler.class);

    private final SubscriptionImportSourceRepository sourceRepo;
    private final PendingMonthImportRepository       pendingRepo;
    private final PageScraperService                 scraper;
    private final ObjectMapper                       objectMapper;

    public RssFeedScheduler(SubscriptionImportSourceRepository sourceRepo,
                             PendingMonthImportRepository pendingRepo,
                             PageScraperService scraper,
                             ObjectMapper objectMapper) {
        this.sourceRepo   = sourceRepo;
        this.pendingRepo  = pendingRepo;
        this.scraper      = scraper;
        this.objectMapper = objectMapper;
    }

    /**
     * Runs at the start of every UTC hour and checks which enabled sources are
     * scheduled to run in this hour according to their individual configuration.
     */
    @Scheduled(cron = "0 0 * * * *")
    public void checkScheduledSources() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        int currentHour = now.getHour();
        int currentDow  = now.getDayOfWeek().getValue(); // Mon=1, Sun=7
        int currentDom  = now.getDayOfMonth();

        List<SubscriptionImportSource> sources = sourceRepo.findByEnabled(true);
        for (SubscriptionImportSource source : sources) {
            try {
                if (shouldRunNow(source, currentHour, currentDow, currentDom)) {
                    log.info("Scheduled check for source id={} ({})", source.getId(), source.getName());
                    checkSource(source);
                }
            } catch (Exception e) {
                log.error("Error checking source id={}: {}", source.getId(), e.getMessage(), e);
            }
        }
    }

    /** Returns true if this source is due to run in the given hour/dayOfWeek/dayOfMonth. */
    private boolean shouldRunNow(SubscriptionImportSource source, int hour, int dow, int dom) {
        // Check hour match (default 6 UTC when null)
        int targetHour = source.getCheckHour() != null ? source.getCheckHour() : 6;
        if (targetHour != hour) return false;

        String freq = source.getCheckFrequency();
        if ("WEEKLY".equals(freq)) {
            return source.getCheckDayOfWeek() == null || source.getCheckDayOfWeek() == dow;
        }
        if ("MONTHLY".equals(freq)) {
            return source.getCheckDayOfMonth() == null || source.getCheckDayOfMonth() == dom;
        }
        return true; // DAILY or null → runs every day at the configured hour
    }

    public void checkSource(SubscriptionImportSource source) {
        String sourceType = source.getSourceType();
        if ("RSS".equalsIgnoreCase(sourceType)) {
            checkRssSource(source);
        } else if ("BLOG_LISTING".equalsIgnoreCase(sourceType)) {
            checkBlogListingSource(source);
        } else {
            checkBlogSource(source);
        }
    }

    private void checkRssSource(SubscriptionImportSource source) {
        boolean isFirstRun = source.getLastItemGuid() == null || source.getLastItemGuid().isBlank();

        List<RssEntryInfo> entries;
        if (isFirstRun) {
            // On first run, fetch multiple pages to cover full history (e.g. Shopify Atom feeds)
            entries = new ArrayList<>();
            for (int page = 1; page <= 10; page++) {
                String pageUrl = page == 1 ? source.getUrl() : appendPageParam(source.getUrl(), page);
                List<RssEntryInfo> pageEntries = scraper.parseRssFeed(pageUrl);
                if (pageEntries.isEmpty()) break;
                entries.addAll(pageEntries);
            }
        } else {
            entries = scraper.parseRssFeed(source.getUrl());
        }

        if (entries.isEmpty()) {
            source.setLastCheckedAt(Instant.now());
            sourceRepo.save(source);
            return;
        }

        String lastGuid   = source.getLastItemGuid();
        String newestGuid = null;

        for (RssEntryInfo entry : entries) {
            if (entry.guid != null && entry.guid.equals(lastGuid)) break;
            if (entry.link == null || entry.link.isBlank()) continue;

            ScrapedMonthData data = scraper.scrapeUrl(entry.link);
            String targetType = classifyEntry(source, entry.title, data != null ? data.rawText : null);
            savePendingImport(source, data, entry.link, entry.title, targetType);

            if (newestGuid == null) newestGuid = entry.guid;
        }

        if (newestGuid != null) source.setLastItemGuid(newestGuid);
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }

    private String appendPageParam(String url, int page) {
        return url + (url.contains("?") ? "&" : "?") + "page=" + page;
    }

    private void checkBlogSource(SubscriptionImportSource source) {
        ScrapedMonthData data = scraper.scrapeUrl(source.getUrl());
        if (data != null) {
            String targetType = classifyEntry(source, data.rawText, data.rawText);
            savePendingImport(source, data, source.getUrl(), null, targetType);
        }
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }

    /**
     * Blog listing: scrapes a page that lists articles, visits each article
     * and saves new ones as pending imports.
     * Already-visited article URLs are stored (newline-separated) in lastItemGuid
     * so they are not re-imported on subsequent runs.
     */
    private void checkBlogListingSource(SubscriptionImportSource source) {
        List<ScrapedMonthData> results = scraper.scrapeParentPage(source.getUrl());
        if (results.isEmpty()) {
            source.setLastCheckedAt(Instant.now());
            sourceRepo.save(source);
            return;
        }

        // Load already-seen article URLs from lastItemGuid (newline-separated)
        Set<String> seenUrls = new HashSet<>();
        if (source.getLastItemGuid() != null && !source.getLastItemGuid().isBlank()) {
            for (String line : source.getLastItemGuid().split("\n")) {
                if (!line.isBlank()) seenUrls.add(line.trim());
            }
        }

        int newCount = 0;
        for (ScrapedMonthData data : results) {
            String articleUrl = data.sourceUrl;
            if (articleUrl != null && seenUrls.contains(articleUrl)) continue;

            String targetType = classifyEntry(source, data.theme, data.rawText);
            savePendingImport(source, data, articleUrl, null, targetType);

            if (articleUrl != null) seenUrls.add(articleUrl);
            newCount++;
        }

        if (newCount > 0) {
            // Persist seen URLs; cap at 500 entries to prevent unbounded growth
            List<String> seenList = new ArrayList<>(seenUrls);
            if (seenList.size() > 500) seenList = seenList.subList(seenList.size() - 500, seenList.size());
            source.setLastItemGuid(String.join("\n", seenList));
        }

        log.info("Blog listing check for source id={}: {} new imports", source.getId(), newCount);
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }

    /**
     * Classifies an entry as MONTH_THEME, SALE_ANNOUNCEMENT, or UNKNOWN.
     *
     * If neither keyword list is configured → falls back to source.targetType.
     * If keywords are configured but nothing matches → returns "UNKNOWN" so
     * the admin can manually classify in the pending queue.
     */
    private String classifyEntry(SubscriptionImportSource source, String title, String bodyText) {
        String monthKw = source.getMonthThemeKeywords();
        String saleKw  = source.getSaleKeywords();

        boolean hasKeywords = (monthKw != null && !monthKw.isBlank())
                           || (saleKw  != null && !saleKw.isBlank());

        if (!hasKeywords) {
            // No keyword config → use source default
            return source.getTargetType() != null ? source.getTargetType() : "MONTH_THEME";
        }

        String text = ((title    != null ? title    : "") + " "
                     + (bodyText != null ? bodyText : "")).toLowerCase();

        if (monthKw != null && !monthKw.isBlank()) {
            for (String kw : monthKw.split(",")) {
                if (!kw.isBlank() && text.contains(kw.trim().toLowerCase())) return "MONTH_THEME";
            }
        }
        if (saleKw != null && !saleKw.isBlank()) {
            for (String kw : saleKw.split(",")) {
                if (!kw.isBlank() && text.contains(kw.trim().toLowerCase())) return "SALE_ANNOUNCEMENT";
            }
        }

        return "UNKNOWN"; // keywords configured but no match → manual review
    }

    private void savePendingImport(SubscriptionImportSource source, ScrapedMonthData data,
                                   String sourceUrl, String rawTitle, String targetType) {

        PendingMonthImport pending = new PendingMonthImport();
        pending.setCompanyId(source.getCompanyId());
        pending.setSubscriptionId(source.getSubscriptionId());
        pending.setTargetType(targetType);
        pending.setYear(data.year);
        pending.setMonth(data.month);
        pending.setTheme(data.theme);
        pending.setBookTitle(data.bookTitle);
        pending.setBookAuthor(data.bookAuthor);
        pending.setImageUrl(data.imageUrl);
        pending.setSourceUrl(sourceUrl);
        pending.setRawTitle(rawTitle);
        pending.setStatus("PENDING");
        pending.setCreatedAt(Instant.now());

        if (data.allImages != null && !data.allImages.isEmpty()) {
            try {
                pending.setAllImagesJson(objectMapper.writeValueAsString(data.allImages));
            } catch (Exception ignored) {}
        }

        pendingRepo.save(pending);
        log.info("Saved pending {} import for sub={}: {}", targetType, source.getSubscriptionId(), sourceUrl);
    }
}
