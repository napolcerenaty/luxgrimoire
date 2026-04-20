package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppLog;
import com.luxgrimoire.backend.repository.AppLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;

@Service
public class AppLogService {

    private static final int MAX_MSG_LEN   = 500;
    private static final int MAX_STACK_LEN = 4000;
    private static final int MAX_CTX_LEN   = 500;

    private final AppLogRepository repo;

    public AppLogService(AppLogRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public AppLog save(String source, String level, String message,
                       String stackTrace, String context, String userId) {
        AppLog log = new AppLog();
        log.setSource(sanitize(source, 20, "FRONTEND"));
        log.setLevel(sanitize(level, 10, "ERROR"));
        log.setMessage(truncate(message, MAX_MSG_LEN));
        log.setStackTrace(truncate(stackTrace, MAX_STACK_LEN));
        log.setContext(truncate(context, MAX_CTX_LEN));
        log.setUserId(truncate(userId, 150));
        return repo.save(log);
    }

    /** Log a backend exception */
    @Transactional
    public void logBackendError(String message, Throwable ex, String context, String userId) {
        String stack = ex != null ? buildStack(ex) : null;
        save("BACKEND", "ERROR", message, stack, context, userId);
    }

    /** Purge logs older than {@code days} days (for scheduled cleanup) */
    @Transactional
    public int purgeOlderThan(int days) {
        Instant cutoff = Instant.now().minus(days, ChronoUnit.DAYS);
        return repo.deleteOlderThan(cutoff);
    }

    private String buildStack(Throwable ex) {
        StringBuilder sb = new StringBuilder(ex.toString());
        for (StackTraceElement el : ex.getStackTrace()) {
            sb.append("\n\tat ").append(el);
            if (sb.length() > MAX_STACK_LEN) break;
        }
        return sb.substring(0, Math.min(sb.length(), MAX_STACK_LEN));
    }

    private static String truncate(String s, int max) {
        if (s == null) return null;
        return s.length() <= max ? s : s.substring(0, max);
    }

    private static String sanitize(String s, int max, String defaultVal) {
        if (s == null || s.isBlank()) return defaultVal;
        return s.length() <= max ? s.toUpperCase() : s.substring(0, max).toUpperCase();
    }
}
