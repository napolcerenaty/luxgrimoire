package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "subscription_prepay_option", indexes = {
    @Index(name = "idx_prepay_subscription_id", columnList = "subscription_id")
})
public class SubscriptionPrepayOption {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    @JsonBackReference("subscription-prepay-options")
    private Subscription subscription;

    private int months;

    @Column(precision = 10, scale = 2)
    private BigDecimal price;

    private String label;

    public SubscriptionPrepayOption() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Subscription getSubscription() { return subscription; }
    public void setSubscription(Subscription subscription) { this.subscription = subscription; }
    public int getMonths() { return months; }
    public void setMonths(int months) { this.months = months; }
    public BigDecimal getPrice() { return price; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public String getLabel() { return label; }
    public void setLabel(String label) { this.label = label; }
}
