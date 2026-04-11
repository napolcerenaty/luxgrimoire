package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "user_subscription_cost_change", indexes = {
    @Index(name = "idx_uscc_entry_id", columnList = "entry_id")
})
public class UserSubscriptionCostChange {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id")
    @JsonBackReference("entry-cost-changes")
    private UserSubscriptionEntry entry;

    @Column(name = "effective_from_month")
    private int effectiveFromMonth;

    @Column(name = "effective_from_year")
    private int effectiveFromYear;

    @Column(precision = 10, scale = 2)
    private BigDecimal shippingCost;

    @Column(name = "taxes_and_fees", precision = 10, scale = 2)
    private BigDecimal taxesAndFees;

    @Column(name = "recorded_at")
    private LocalDateTime recordedAt;

    public UserSubscriptionCostChange() {
        this.id = UUID.randomUUID().toString();
        this.recordedAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public UserSubscriptionEntry getEntry() { return entry; }
    public void setEntry(UserSubscriptionEntry entry) { this.entry = entry; }
    public int getEffectiveFromMonth() { return effectiveFromMonth; }
    public void setEffectiveFromMonth(int effectiveFromMonth) { this.effectiveFromMonth = effectiveFromMonth; }
    public int getEffectiveFromYear() { return effectiveFromYear; }
    public void setEffectiveFromYear(int effectiveFromYear) { this.effectiveFromYear = effectiveFromYear; }
    public BigDecimal getShippingCost() { return shippingCost; }
    public void setShippingCost(BigDecimal shippingCost) { this.shippingCost = shippingCost; }
    public BigDecimal getTaxesAndFees() { return taxesAndFees; }
    public void setTaxesAndFees(BigDecimal taxesAndFees) { this.taxesAndFees = taxesAndFees; }
    public LocalDateTime getRecordedAt() { return recordedAt; }
    public void setRecordedAt(LocalDateTime recordedAt) { this.recordedAt = recordedAt; }
}
