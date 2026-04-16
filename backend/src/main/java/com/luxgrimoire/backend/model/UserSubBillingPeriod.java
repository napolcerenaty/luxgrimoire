package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Table(name = "user_sub_billing_period", indexes = {
    @Index(name = "idx_billing_entry_id", columnList = "entry_id")
})
public class UserSubBillingPeriod {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id")
    @JsonBackReference("entry-billing-periods")
    private UserSubscriptionEntry entry;

    /** ISO date when the payment was/will be made, e.g. "2025-03-15" */
    @Column(name = "billed_at")
    private String billedAt;

    /** Base subscription amount for this billing period */
    @Column(name = "base_amount", precision = 10, scale = 2)
    private BigDecimal baseAmount;

    /** Taxes and fees portion */
    @Column(name = "taxes_and_fees", precision = 10, scale = 2)
    private BigDecimal taxesAndFees;

    /** Shipping portion */
    @Column(precision = 10, scale = 2)
    private BigDecimal shipping;

    /** Optional link to a PurchaseTransaction created for this billing period (for unified stats). */
    @Column(name = "purchase_transaction_id")
    private String purchaseTransactionId;

    /** Number of months this payment covers (1 = regular monthly) */
    @Column(name = "months_covered")
    private int monthsCovered = 1;

    /** First month covered (1-12) */
    @Column(name = "covered_from_month")
    private int coveredFromMonth;

    /** Year of the first covered month */
    @Column(name = "covered_from_year")
    private int coveredFromYear;

    /** Optional reference to a predefined SubscriptionPrepayOption id */
    @Column(name = "prepay_option_id")
    private String prepayOptionId;

    /** Notes (optional) */
    @Column(columnDefinition = "TEXT")
    private String notes;

    public UserSubBillingPeriod() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public UserSubscriptionEntry getEntry() { return entry; }
    public void setEntry(UserSubscriptionEntry entry) { this.entry = entry; }
    public String getBilledAt() { return billedAt; }
    public void setBilledAt(String billedAt) { this.billedAt = billedAt; }
    public BigDecimal getBaseAmount() { return baseAmount; }
    public void setBaseAmount(BigDecimal baseAmount) { this.baseAmount = baseAmount; }
    public BigDecimal getTaxesAndFees() { return taxesAndFees; }
    public void setTaxesAndFees(BigDecimal taxesAndFees) { this.taxesAndFees = taxesAndFees; }
    public BigDecimal getShipping() { return shipping; }
    public void setShipping(BigDecimal shipping) { this.shipping = shipping; }
    /** Computed total — sum of all three components. */
    public BigDecimal getAmountPaid() {
        BigDecimal total = baseAmount != null ? baseAmount : BigDecimal.ZERO;
        if (taxesAndFees != null) total = total.add(taxesAndFees);
        if (shipping     != null) total = total.add(shipping);
        return total;
    }
    public String getPurchaseTransactionId() { return purchaseTransactionId; }
    public void setPurchaseTransactionId(String purchaseTransactionId) { this.purchaseTransactionId = purchaseTransactionId; }
    public int getMonthsCovered() { return monthsCovered; }
    public void setMonthsCovered(int monthsCovered) { this.monthsCovered = monthsCovered; }
    public int getCoveredFromMonth() { return coveredFromMonth; }
    public void setCoveredFromMonth(int coveredFromMonth) { this.coveredFromMonth = coveredFromMonth; }
    public int getCoveredFromYear() { return coveredFromYear; }
    public void setCoveredFromYear(int coveredFromYear) { this.coveredFromYear = coveredFromYear; }
    public String getPrepayOptionId() { return prepayOptionId; }
    public void setPrepayOptionId(String prepayOptionId) { this.prepayOptionId = prepayOptionId; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
