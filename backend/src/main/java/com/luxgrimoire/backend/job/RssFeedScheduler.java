package com.luxgrimoire.backend.job;

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
import java.util.List;

@Component
public class RssFeedScheduler {

    private static final Logger log = LoggerFactory.getLogger(RssFeedScheduler.class);

    private final SubscriptionImportSourceRepository sourceRepo;
    private final PendingMonthImportRepository       pendingRepo;
    private final PageScraperService                 scraper;

    public RssFeedScheduler(SubscriptionImportSourceRepository sourceRepo,
                             PendingMonthImportRepository pendingRepo,
                             PageScraperService scraper) {
        this.sourceRepo  = sourceRepo;
        this.pendingRepo = pendingRepo;
        this.scraper     = scraper;
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
        } else {
            checkBlogSource(source);
        }
    }

    private void checkRssSource(SubscriptionImportSource source) {
        List<RssEntryInfo> entries = scraper.parseRssFeed(source.getUrl());
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
            savePendingImport(source, data, entry.link, entry.title);

            if (newestGuid == null) newestGuid = entry.guid;
        }

        if (newestGuid != null) source.setLastItemGuid(newestGuid);
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }

    private void checkBlogSource(SubscriptionImportSource source) {
        ScrapedMonthData data = scraper.scrapeUrl(source.getUrl());
        if (data != null) {
            savePendingImport(source, data, source.getUrl(), null);
        }
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }

    private void savePendingImport(SubscriptionImportSource source, ScrapedMonthData data, String sourceUrl, String rawTitle) {
        String targetType = source.getTargetType() != null ? source.getTargetType() : "MONTH_THEME";

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
        pendingRepo.save(pending);
        log.info("Saved pending {} import for sub={}: {}", targetType, source.getSubscriptionId(), sourceUrl);
    }
}
