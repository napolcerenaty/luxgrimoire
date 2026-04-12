package com.luxgrimoire.backend.job;

import com.luxgrimoire.backend.repository.UserNotificationRepository;
import com.luxgrimoire.backend.service.AppSettingService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Component
public class NotificationRetentionJob {

    private static final Logger log = LoggerFactory.getLogger(NotificationRetentionJob.class);
    private static final String RETENTION_KEY = "notification.retention.days";
    private static final int    DEFAULT_DAYS  = 180;

    private final UserNotificationRepository userNotificationRepo;
    private final AppSettingService          appSettingService;

    public NotificationRetentionJob(UserNotificationRepository userNotificationRepo,
                                    AppSettingService appSettingService) {
        this.userNotificationRepo = userNotificationRepo;
        this.appSettingService    = appSettingService;
    }

    /** Runs every day at 03:00 AM. */
    @Scheduled(cron = "0 0 3 * * *")
    @Transactional
    public void cleanup() {
        int days   = appSettingService.getInt(RETENTION_KEY, DEFAULT_DAYS);
        if (days <= 0) {
            log.info("[NotificationRetention] Retention disabled (days={}), skipping cleanup.", days);
            return;
        }
        LocalDateTime cutoff = LocalDateTime.now().minusDays(days);
        int deleted = userNotificationRepo.deleteByNotificationCreatedAtBefore(cutoff);
        log.info("[NotificationRetention] Deleted {} user-notification records older than {} days (cutoff={}).",
                deleted, days, cutoff);
    }
}
