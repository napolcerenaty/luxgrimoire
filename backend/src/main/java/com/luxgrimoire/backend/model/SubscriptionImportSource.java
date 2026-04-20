package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "subscription_import_sources")
public class SubscriptionImportSource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Human-friendly label shown in admin UI */
    @Column(name = "name", length = 255)
    private String name;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "subscription_id")
    private String subscriptionId;

    @Column(name = "source_type")
    private String sourceType; // "RSS" or "BLOG"

    /** What to create from scraped data: MONTH_THEME or SALE_ANNOUNCEMENT */
    @Column(name = "target_type", length = 30)
    private String targetType = "MONTH_THEME";

    @Column(name = "url", length = 1000)
    private String url;

    /** Whether this source is actively scheduled */
    @Column(name = "enabled", nullable = false)
    private boolean enabled = true;

    /** DAILY, WEEKLY, or MONTHLY */
    @Column(name = "check_frequency", length = 20)
    private String checkFrequency = "DAILY";

    /** 0–23: UTC hour at which to run the check */
    @Column(name = "check_hour")
    private Integer checkHour = 6;

    /** 1–7 (Mon=1, Sun=7): used when checkFrequency=WEEKLY */
    @Column(name = "check_day_of_week")
    private Integer checkDayOfWeek;

    /** 1–31: used when checkFrequency=MONTHLY */
    @Column(name = "check_day_of_month")
    private Integer checkDayOfMonth;

    @Column(name = "last_checked_at")
    private Instant lastCheckedAt;

    @Column(name = "last_item_guid", length = 1000)
    private String lastItemGuid;

    /**
     * Comma-separated keywords that indicate a MONTH_THEME entry.
     * Example: "reveal,theme,spoiler,unboxing"
     */
    @Column(name = "month_theme_keywords", length = 1000)
    private String monthThemeKeywords;

    /**
     * Comma-separated keywords that indicate a SALE_ANNOUNCEMENT entry.
     * Example: "sale,available,shop,order now"
     */
    @Column(name = "sale_keywords", length = 1000)
    private String saleKeywords;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public String getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(String subscriptionId) { this.subscriptionId = subscriptionId; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getCheckFrequency() { return checkFrequency; }
    public void setCheckFrequency(String checkFrequency) { this.checkFrequency = checkFrequency; }
    public Integer getCheckHour() { return checkHour; }
    public void setCheckHour(Integer checkHour) { this.checkHour = checkHour; }
    public Integer getCheckDayOfWeek() { return checkDayOfWeek; }
    public void setCheckDayOfWeek(Integer checkDayOfWeek) { this.checkDayOfWeek = checkDayOfWeek; }
    public Integer getCheckDayOfMonth() { return checkDayOfMonth; }
    public void setCheckDayOfMonth(Integer checkDayOfMonth) { this.checkDayOfMonth = checkDayOfMonth; }
    public Instant getLastCheckedAt() { return lastCheckedAt; }
    public void setLastCheckedAt(Instant lastCheckedAt) { this.lastCheckedAt = lastCheckedAt; }
    public String getLastItemGuid() { return lastItemGuid; }
    public void setLastItemGuid(String lastItemGuid) { this.lastItemGuid = lastItemGuid; }
    public String getMonthThemeKeywords() { return monthThemeKeywords; }
    public void setMonthThemeKeywords(String monthThemeKeywords) { this.monthThemeKeywords = monthThemeKeywords; }
    public String getSaleKeywords() { return saleKeywords; }
    public void setSaleKeywords(String saleKeywords) { this.saleKeywords = saleKeywords; }
}
