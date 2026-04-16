package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.ExchangeRateCache;
import com.luxgrimoire.backend.repository.ExchangeRateCacheRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fetches EUR-based exchange rates from Frankfurter (free, no key needed)
 * once a day and stores them in {@code exchange_rate_cache}.
 *
 * <p>Cross-rate formula: A→B = EUR_B / EUR_A<br>
 * (Special cases: if A == B return 1; if A == EUR use EUR_B; if B == EUR use 1/EUR_A)
 */
@Service
public class CurrencyRateService {

    private static final Logger log = LoggerFactory.getLogger(CurrencyRateService.class);

    private static final String FRANKFURTER_URL =
        "https://api.frankfurter.app/latest?from=EUR&to=GBP,USD,PLN,CZK,SEK,DKK,NOK,AUD,CAD,CHF,JPY,NZD,HUF,RON";

    private final ExchangeRateCacheRepository repo;
    private final RestTemplate restTemplate;

    // In-memory mirror for fast lookups: EUR → X
    private final Map<String, BigDecimal> eurRates = new ConcurrentHashMap<>();

    public CurrencyRateService(ExchangeRateCacheRepository repo) {
        this.repo = repo;
        this.restTemplate = new RestTemplate();
        // Load from DB on startup
        repo.findAllEurBased().forEach(r -> eurRates.put(r.getToCurrency(), r.getRate()));
        eurRates.put("EUR", BigDecimal.ONE);
        if (eurRates.size() <= 1) {
            log.info("No cached rates found, triggering initial fetch");
            fetchAndStore();
        }
    }

    // ── Scheduled refresh ─────────────────────────────────────────────────────

    @Scheduled(cron = "0 30 2 * * *")   // 02:30 every night
    public void scheduledRefresh() {
        fetchAndStore();
    }

    @SuppressWarnings("unchecked")
    private void fetchAndStore() {
        try {
            var response = restTemplate.getForObject(FRANKFURTER_URL, Map.class);
            if (response == null) return;

            Map<String, Object> rates = (Map<String, Object>) response.get("rates");
            if (rates == null) return;

            Instant now = Instant.now();
            eurRates.put("EUR", BigDecimal.ONE);

            rates.forEach((currency, rateObj) -> {
                BigDecimal rate = new BigDecimal(rateObj.toString());
                eurRates.put(currency, rate);

                ExchangeRateCache entity = repo.findById(
                        new ExchangeRateCache.CacheId("EUR", currency))
                        .orElseGet(() -> new ExchangeRateCache("EUR", currency, rate, now));
                entity.setRate(rate);
                entity.setFetchedAt(now);
                repo.save(entity);
            });

            log.info("Exchange rates refreshed: {} currencies loaded", rates.size());
        } catch (Exception e) {
            log.warn("Failed to refresh exchange rates: {}", e.getMessage());
        }
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Returns the exchange rate from {@code fromCurrency} to {@code toCurrency}.
     * Falls back to 1.0 if either currency is unknown.
     */
    public BigDecimal getRate(String fromCurrency, String toCurrency) {
        if (fromCurrency == null || toCurrency == null) return BigDecimal.ONE;
        if (fromCurrency.equalsIgnoreCase(toCurrency))  return BigDecimal.ONE;

        String from = fromCurrency.toUpperCase();
        String to   = toCurrency.toUpperCase();

        BigDecimal eurFrom = eurRates.getOrDefault(from, null);
        BigDecimal eurTo   = eurRates.getOrDefault(to,   null);

        if (eurFrom == null || eurTo == null) {
            log.debug("Unknown currency pair {}/{}, using rate 1.0", from, to);
            return BigDecimal.ONE;
        }

        // Cross-rate: A→B = EUR_B / EUR_A
        return eurTo.divide(eurFrom, 6, RoundingMode.HALF_UP);
    }

    /**
     * Converts {@code amount} from {@code fromCurrency} to {@code toCurrency}.
     * Null-safe — returns ZERO if amount is null.
     */
    public BigDecimal convert(BigDecimal amount, String fromCurrency, String toCurrency) {
        if (amount == null) return BigDecimal.ZERO;
        BigDecimal rate = getRate(fromCurrency, toCurrency);
        return amount.multiply(rate).setScale(2, RoundingMode.HALF_UP);
    }

    /** Returns true if we have at least some rates loaded. */
    public boolean hasRates() {
        return eurRates.size() > 1;
    }
}
