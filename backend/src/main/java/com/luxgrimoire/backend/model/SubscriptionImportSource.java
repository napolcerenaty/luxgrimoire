package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "subscription_import_sources")
public class SubscriptionImportSource {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_id")
    private String companyId;

    @Column(name = "subscription_id")
    private String subscriptionId;

    @Column(name = "source_type")
    private String sourceType; // "RSS" or "BLOG"

    @Column(name = "url", length = 1000)
    private String url;

    @Column(name = "last_checked_at")
    private Instant lastCheckedAt;

    @Column(name = "last_item_guid", length = 1000)
    private String lastItemGuid;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public String getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(String subscriptionId) { this.subscriptionId = subscriptionId; }
    public String getSourceType() { return sourceType; }
    public void setSourceType(String sourceType) { this.sourceType = sourceType; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public Instant getLastCheckedAt() { return lastCheckedAt; }
    public void setLastCheckedAt(Instant lastCheckedAt) { this.lastCheckedAt = lastCheckedAt; }
    public String getLastItemGuid() { return lastItemGuid; }
    public void setLastItemGuid(String lastItemGuid) { this.lastItemGuid = lastItemGuid; }
}
