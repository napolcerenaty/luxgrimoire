package com.luxgrimoire.backend.service;

import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Sliding-window rate limiter for AI endpoints.
 * Non-admin users are limited to MAX_REQUESTS_PER_WINDOW per WINDOW_SECONDS.
 * Admins bypass all limits (enforced at the controller level).
 */
@Service
public class AiRateLimiterService {

    private static final int  MAX_REQUESTS_PER_WINDOW = 20;
    private static final long WINDOW_SECONDS          = 3600; // 1 hour

    // userId -> timestamps of recent requests (epoch millis)
    private final Map<String, Deque<Long>> userWindows = new ConcurrentHashMap<>();

    /**
     * Returns true if the user is allowed to make another request.
     * Registers the request when allowed.
     */
    public boolean tryConsume(String userId) {
        long now = Instant.now().toEpochMilli();
        long cutoff = now - WINDOW_SECONDS * 1000;

        Deque<Long> timestamps = userWindows.computeIfAbsent(userId, k -> new ArrayDeque<>());

        synchronized (timestamps) {
            // Drop entries outside the window
            while (!timestamps.isEmpty() && timestamps.peekFirst() <= cutoff) {
                timestamps.pollFirst();
            }
            if (timestamps.size() >= MAX_REQUESTS_PER_WINDOW) {
                return false;
            }
            timestamps.addLast(now);
            return true;
        }
    }

    /** Returns how many seconds until the oldest request leaves the window, or 0 if under limit. */
    public long retryAfterSeconds(String userId) {
        long now = Instant.now().toEpochMilli();
        long cutoff = now - WINDOW_SECONDS * 1000;

        Deque<Long> timestamps = userWindows.getOrDefault(userId, new ArrayDeque<>());
        synchronized (timestamps) {
            if (timestamps.isEmpty()) return 0;
            long oldest = timestamps.peekFirst();
            if (oldest <= cutoff) return 0;
            return Math.max(0, (oldest - cutoff) / 1000);
        }
    }
}
