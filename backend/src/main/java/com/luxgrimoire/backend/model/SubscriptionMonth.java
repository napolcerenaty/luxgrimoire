package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.math.BigDecimal;
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
    private String bookId;

    @Column(name = "actual_shipping")
    private BigDecimal actualShipping;

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
    public BigDecimal getActualShipping() { return actualShipping; }
    public void setActualShipping(BigDecimal actualShipping) { this.actualShipping = actualShipping; }
}
