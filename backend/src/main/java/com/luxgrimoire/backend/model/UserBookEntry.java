package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_book_entry", indexes = {
    @Index(name = "idx_ube_username",           columnList = "username"),
    @Index(name = "idx_ube_edition_id",         columnList = "editionId"),
    @Index(name = "idx_ube_username_ownership", columnList = "username,ownershipStatus"),
    @Index(name = "idx_ube_purchase_tx",        columnList = "purchaseTransactionId")
})
public class UserBookEntry {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "username")
    @JsonBackReference("user-books")
    private AppUser user;

    private String bookId;
    private String editionId;
    private Instant addedAt;

    // ── Purchase info ──────────────────────────────────────────────────────

    @Column(name = "purchaseTransactionId")
    private String purchaseTransactionId;

    @Column(precision = 10, scale = 2)
    private BigDecimal allocatedPrice;

    @Column(length = 20)
    private String condition;

    private Instant purchaseDate;

    // ── Status fields ──────────────────────────────────────────────────────

    /** OWNED, WISHLIST, PREORDER, LOANED_OUT, SOLD, GIFTED_AWAY */
    @Column(name = "ownershipStatus", length = 30)
    private String ownershipStatus = "OWNED";

    /** Date sold (ISO "YYYY-MM-DD") */
    @Column(name = "sale_date", length = 20)
    private String saleDate;

    /** Price received when sold */
    @Column(name = "sale_price", precision = 10, scale = 2)
    private BigDecimal salePrice;

    /** Currency of the sale */
    @Column(name = "sale_currency", length = 10)
    private String saleCurrency;

    /** Where it was sold (e.g. "eBay", "Vinted", "Direct") */
    @Column(name = "sale_venue", length = 100)
    private String saleVenue;

    /** Optional notes about the sale */
    @Column(name = "sale_notes", columnDefinition = "TEXT")
    private String saleNotes;

    /** UNREAD, READING, READ, DNF */
    @Column(name = "readingStatus", length = 20)
    private String readingStatus = "UNREAD";

    // ── Legacy flag — kept for backward compat ─────────────────────────────
    @Column(name = "flag")
    private String flag = "OWNED";

    public UserBookEntry() {}

    public UserBookEntry(String bookId, String editionId) {
        this.id = UUID.randomUUID().toString();
        this.bookId = bookId;
        this.editionId = editionId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }
    public String getBookId() { return bookId; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
    public String getFlag() { return flag; }
    public void setFlag(String flag) { this.flag = flag; }
    public String getPurchaseTransactionId() { return purchaseTransactionId; }
    public void setPurchaseTransactionId(String t) { this.purchaseTransactionId = t; }
    public BigDecimal getAllocatedPrice() { return allocatedPrice; }
    public void setAllocatedPrice(BigDecimal allocatedPrice) { this.allocatedPrice = allocatedPrice; }
    public String getCondition() { return condition; }
    public void setCondition(String condition) { this.condition = condition; }
    public Instant getPurchaseDate() { return purchaseDate; }
    public void setPurchaseDate(Instant purchaseDate) { this.purchaseDate = purchaseDate; }
    public String getOwnershipStatus() { return ownershipStatus; }
    public void setOwnershipStatus(String ownershipStatus) { this.ownershipStatus = ownershipStatus; }
    public String getSaleDate()     { return saleDate; }
    public void setSaleDate(String d)    { this.saleDate = d; }
    public BigDecimal getSalePrice() { return salePrice; }
    public void setSalePrice(BigDecimal p) { this.salePrice = p; }
    public String getSaleCurrency() { return saleCurrency; }
    public void setSaleCurrency(String c) { this.saleCurrency = c; }
    public String getSaleVenue()    { return saleVenue; }
    public void setSaleVenue(String v)    { this.saleVenue = v; }
    public String getSaleNotes()    { return saleNotes; }
    public void setSaleNotes(String n)    { this.saleNotes = n; }
    public String getReadingStatus() { return readingStatus; }
    public void setReadingStatus(String readingStatus) { this.readingStatus = readingStatus; }
}
