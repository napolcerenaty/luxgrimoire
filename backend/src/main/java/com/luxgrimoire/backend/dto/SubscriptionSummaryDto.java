package com.luxgrimoire.backend.dto;

import java.math.BigDecimal;
import java.util.List;

public class SubscriptionSummaryDto {
    private String id;
    private String name;
    private String logoUrl;
    private Integer renewalDay;
    private String parentSubscriptionId;
    private BigDecimal basePrice;
    private String type;
    private String companyId;
    private List<String> genres;

    public SubscriptionSummaryDto() {}

    public SubscriptionSummaryDto(String id, String name, String logoUrl, Integer renewalDay,
                                   String parentSubscriptionId, BigDecimal basePrice, String type,
                                   String companyId) {
        this.id = id;
        this.name = name;
        this.logoUrl = logoUrl;
        this.renewalDay = renewalDay;
        this.parentSubscriptionId = parentSubscriptionId;
        this.basePrice = basePrice;
        this.type = type;
        this.companyId = companyId;
    }

    public String getId() { return id; }
    public String getName() { return name; }
    public String getLogoUrl() { return logoUrl; }
    public Integer getRenewalDay() { return renewalDay; }
    public String getParentSubscriptionId() { return parentSubscriptionId; }
    public BigDecimal getBasePrice() { return basePrice; }
    public String getType() { return type; }
    public String getCompanyId() { return companyId; }
    public List<String> getGenres() { return genres; }
    public void setGenres(List<String> genres) { this.genres = genres; }
}
