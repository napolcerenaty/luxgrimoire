package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_subscription_entry", indexes = {
    @Index(name = "idx_use_username", columnList = "username")
})
public class UserSubscriptionEntry {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "username")
    @JsonBackReference("user-subscriptions")
    private AppUser user;

    private String companyId;
    private String subscriptionId;
    private Instant addedAt;

    @Column(name = "start_date")
    private String startDate;

    @Column(name = "starting_month")
    private Integer startingMonth;

    @Column(name = "shipping_cost", precision = 10, scale = 2)
    private BigDecimal shippingCost;

    @Column(name = "taxes_and_fees", precision = 10, scale = 2)
    private BigDecimal taxesAndFees;

    private boolean active = true;

    public UserSubscriptionEntry() {}

    public UserSubscriptionEntry(String companyId, String subscriptionId) {
        this.id = UUID.randomUUID().toString();
        this.companyId = companyId;
        this.subscriptionId = subscriptionId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public String getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(String subscriptionId) { this.subscriptionId = subscriptionId; }
    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
    public String getStartDate() { return startDate; }
    public void setStartDate(String startDate) { this.startDate = startDate; }
    public Integer getStartingMonth() { return startingMonth; }
    public void setStartingMonth(Integer startingMonth) { this.startingMonth = startingMonth; }
    public BigDecimal getShippingCost() { return shippingCost; }
    public void setShippingCost(BigDecimal shippingCost) { this.shippingCost = shippingCost; }
    public BigDecimal getTaxesAndFees() { return taxesAndFees; }
    public void setTaxesAndFees(BigDecimal taxesAndFees) { this.taxesAndFees = taxesAndFees; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
}
