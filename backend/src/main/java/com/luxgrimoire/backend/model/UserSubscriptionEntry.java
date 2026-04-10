package com.luxgrimoire.backend.model;

import java.time.Instant;
import java.util.UUID;

public class UserSubscriptionEntry {
    private String id;
    private String companyId;
    private String subscriptionId;
    private Instant addedAt;

    public UserSubscriptionEntry() {}

    public UserSubscriptionEntry(String companyId, String subscriptionId) {
        this.id = UUID.randomUUID().toString();
        this.companyId = companyId;
        this.subscriptionId = subscriptionId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getCompanyId() { return companyId; }
    public String getSubscriptionId() { return subscriptionId; }
    public Instant getAddedAt() { return addedAt; }
}
