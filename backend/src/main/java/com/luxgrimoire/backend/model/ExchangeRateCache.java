package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "exchange_rate_cache")
@IdClass(ExchangeRateCache.CacheId.class)
public class ExchangeRateCache {

    /** Always "EUR" — we store EUR-based rates and compute cross-rates on the fly. */
    @Id
    @Column(name = "from_currency", length = 10)
    private String fromCurrency;

    @Id
    @Column(name = "to_currency", length = 10)
    private String toCurrency;

    /** How many toCurrency units equal one fromCurrency unit. */
    @Column(name = "rate", precision = 18, scale = 6, nullable = false)
    private BigDecimal rate;

    @Column(name = "fetched_at", nullable = false)
    private Instant fetchedAt;

    public ExchangeRateCache() {}

    public ExchangeRateCache(String from, String to, BigDecimal rate, Instant fetchedAt) {
        this.fromCurrency = from;
        this.toCurrency   = to;
        this.rate         = rate;
        this.fetchedAt    = fetchedAt;
    }

    public String getFromCurrency() { return fromCurrency; }
    public String getToCurrency()   { return toCurrency; }
    public BigDecimal getRate()     { return rate; }
    public void setRate(BigDecimal rate) { this.rate = rate; }
    public Instant getFetchedAt()        { return fetchedAt; }
    public void setFetchedAt(Instant t)  { this.fetchedAt = t; }

    // ── Composite PK ──────────────────────────────────────────────────────────

    public static class CacheId implements Serializable {
        private String fromCurrency;
        private String toCurrency;

        public CacheId() {}
        public CacheId(String from, String to) { this.fromCurrency = from; this.toCurrency = to; }

        @Override public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof CacheId c)) return false;
            return Objects.equals(fromCurrency, c.fromCurrency)
                && Objects.equals(toCurrency,   c.toCurrency);
        }
        @Override public int hashCode() { return Objects.hash(fromCurrency, toCurrency); }
        public String getFromCurrency() { return fromCurrency; }
        public void setFromCurrency(String f) { this.fromCurrency = f; }
        public String getToCurrency()   { return toCurrency; }
        public void setToCurrency(String t)   { this.toCurrency = t; }
    }
}
