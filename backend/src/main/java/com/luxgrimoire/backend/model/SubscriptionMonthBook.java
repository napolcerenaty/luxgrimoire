package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "subscription_month_book", indexes = {
    @Index(name = "idx_smb_month_id", columnList = "month_id")
})
public class SubscriptionMonthBook {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "month_id")
    @JsonIgnore
    private SubscriptionMonth month;

    @Column(name = "book_id")
    private String bookId;

    @Column(name = "edition_id")
    private String editionId;

    @Column(name = "sort_order")
    private int sortOrder;

    public SubscriptionMonthBook() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public SubscriptionMonth getMonth() { return month; }
    public void setMonth(SubscriptionMonth month) { this.month = month; }
    public String getBookId() { return bookId; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public int getSortOrder() { return sortOrder; }
    public void setSortOrder(int sortOrder) { this.sortOrder = sortOrder; }
}
