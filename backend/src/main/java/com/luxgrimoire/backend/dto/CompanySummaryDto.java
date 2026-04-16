package com.luxgrimoire.backend.dto;

import java.util.List;

public class CompanySummaryDto {
    private String id;
    private String name;
    private String logoUrl;
    private List<SubscriptionSummaryDto> subscriptions;

    public CompanySummaryDto(String id, String name, String logoUrl, List<SubscriptionSummaryDto> subscriptions) {
        this.id = id;
        this.name = name;
        this.logoUrl = logoUrl;
        this.subscriptions = subscriptions;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getLogoUrl() { return logoUrl; }
    public List<SubscriptionSummaryDto> getSubscriptions() { return subscriptions; }
}
