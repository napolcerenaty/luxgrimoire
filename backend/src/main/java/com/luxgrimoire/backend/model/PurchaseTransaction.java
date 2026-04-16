package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "purchase_transaction", indexes = {
    @Index(name = "idx_pt_username", columnList = "username")
})
public class PurchaseTransaction {

    @Id
    private String id;

    @Column(name = "username", nullable = false)
    private String username;

    private Instant purchaseDate;

    @Column(precision = 10, scale = 2)
    private BigDecimal basePrice;

    @Column(name = "taxes_and_fees", precision = 10, scale = 2)
    private BigDecimal taxesAndFees;

    @Column(precision = 10, scale = 2)
    private BigDecimal shipping;

    /**
     * PURCHASE (manual) or SUBSCRIPTION (auto-created when billing period is logged).
     * Defaults to PURCHASE.
     */
    @Column(length = 20)
    private String type = "PURCHASE";

    @Column(length = 10)
    private String currency;

    /** OFFICIAL, SECOND_HAND, GIFT, OTHER */
    @Column(length = 30)
    private String source = "OFFICIAL";

    @Column(length = 500)
    private String notes;

    public PurchaseTransaction() {
        this.id = UUID.randomUUID().toString();
        this.purchaseDate = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Instant getPurchaseDate() { return purchaseDate; }
    public void setPurchaseDate(Instant purchaseDate) { this.purchaseDate = purchaseDate; }
    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }
    public BigDecimal getTaxesAndFees() { return taxesAndFees; }
    public void setTaxesAndFees(BigDecimal taxesAndFees) { this.taxesAndFees = taxesAndFees; }
    public BigDecimal getShipping() { return shipping; }
    public void setShipping(BigDecimal shipping) { this.shipping = shipping; }
    /** Computed total — sum of all three components. */
    public BigDecimal getTotalPaid() {
        BigDecimal total = basePrice != null ? basePrice : BigDecimal.ZERO;
        if (taxesAndFees != null) total = total.add(taxesAndFees);
        if (shipping     != null) total = total.add(shipping);
        return total;
    }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }
    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
}
