package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "subscription_month", indexes = {
    @Index(name = "idx_sub_month_subscription_id", columnList = "subscription_id")
})
public class SubscriptionMonth {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subscription_id")
    @JsonBackReference("subscription-months")
    private Subscription subscription;

    private String imageUrl;
    private String theme;
    private int month;
    private int year;

    /** Legacy single-book field — kept for backward compat; always mirrors first entry in books list */
    private String bookId;

    @Column(name = "edition_id")
    private String editionId;

    @Column(name = "actual_shipping")
    private BigDecimal actualShipping;

    /** Snapshot of subscription base price at the time this box was created; never auto-updated */
    @Column(name = "box_price")
    private BigDecimal boxPrice;

    @OneToMany(mappedBy = "month", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @BatchSize(size = 10)
    @OrderBy("sortOrder ASC")
    private List<SubscriptionMonthBook> books = new ArrayList<>();

    public SubscriptionMonth() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Subscription getSubscription() { return subscription; }
    public void setSubscription(Subscription subscription) { this.subscription = subscription; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getTheme() { return theme; }
    public void setTheme(String theme) { this.theme = theme; }
    public int getMonth() { return month; }
    public void setMonth(int month) { this.month = month; }
    public int getYear() { return year; }
    public void setYear(int year) { this.year = year; }
    public String getBookId() { return bookId; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public BigDecimal getActualShipping() { return actualShipping; }
    public void setActualShipping(BigDecimal actualShipping) { this.actualShipping = actualShipping; }
    public BigDecimal getBoxPrice() { return boxPrice; }
    public void setBoxPrice(BigDecimal boxPrice) { this.boxPrice = boxPrice; }
    public List<SubscriptionMonthBook> getBooks() { return books; }
    public void setBooks(List<SubscriptionMonthBook> books) { this.books = books != null ? books : new ArrayList<>(); }
}
