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

    @Scheduled(cron = "0 0 6 * * *")
    public void checkAllFeeds() {
        List<SubscriptionImportSource> rssSources = sourceRepo.findBySourceType("RSS");
        for (SubscriptionImportSource source : rssSources) {
            try {
                checkSource(source);
            } catch (Exception e) {
                log.error("Error checking RSS source id={}: {}", source.getId(), e.getMessage());
            }
        }
    }

    public void checkSource(SubscriptionImportSource source) {
        List<RssEntryInfo> entries = scraper.parseRssFeed(source.getUrl());
        if (entries.isEmpty()) return;

        String lastGuid = source.getLastItemGuid();
        String newestGuid = null;

        for (RssEntryInfo entry : entries) {
            if (entry.guid != null && entry.guid.equals(lastGuid)) break;
            if (entry.link == null || entry.link.isBlank()) continue;

            ScrapedMonthData data = scraper.scrapeUrl(entry.link);

            PendingMonthImport pending = new PendingMonthImport();
            pending.setCompanyId(source.getCompanyId());
            pending.setSubscriptionId(source.getSubscriptionId());
            pending.setYear(data.year);
            pending.setMonth(data.month);
            pending.setTheme(data.theme);
            pending.setImageUrl(data.imageUrl);
            pending.setSourceUrl(entry.link);
            pending.setStatus("PENDING");
            pending.setCreatedAt(Instant.now());
            pendingRepo.save(pending);

            if (newestGuid == null) newestGuid = entry.guid;
        }

        if (newestGuid != null) {
            source.setLastItemGuid(newestGuid);
        }
        source.setLastCheckedAt(Instant.now());
        sourceRepo.save(source);
    }
}
