package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "subscription", indexes = {
    @Index(name = "idx_subscription_company_id", columnList = "company_id")
})
public class Subscription {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id")
    @JsonBackReference("company-subscriptions")
    private BookBoxCompany company;

    private String name;
    private String logoUrl;
    private BigDecimal basePrice;
    private boolean shipsInternationally;
    private String type;
    private boolean bookishMerch;

    @Column(name = "skip_policy_type")
    private String skipPolicyType = "UNLIMITED";

    @Column(name = "skip_reset_type")
    private String skipResetType;

    @Column(name = "skip_reset_date")
    private String skipResetDate;

    @Column(name = "skip_count")
    private Integer skipCount;

    @Column(name = "max_consecutive_skips")
    private Integer maxConsecutiveSkips;

    @Column(name = "skip_policy_notes", columnDefinition = "TEXT")
    private String skipPolicyNotes;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "subscription_shipping_country", joinColumns = @JoinColumn(name = "subscription_id"))
    @Column(name = "country")
    private List<String> shippingCountries = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "subscription_genre", joinColumns = @JoinColumn(name = "subscription_id"))
    @Column(name = "genre")
    private List<String> genres = new ArrayList<>();

    @OneToMany(mappedBy = "subscription", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference("subscription-months")
    @BatchSize(size = 100)
    private List<SubscriptionMonth> months = new ArrayList<>();

    public Subscription() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public BookBoxCompany getCompany() { return company; }
    public void setCompany(BookBoxCompany company) { this.company = company; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getLogoUrl() { return logoUrl; }
    public void setLogoUrl(String logoUrl) { this.logoUrl = logoUrl; }
    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }
    public boolean isShipsInternationally() { return shipsInternationally; }
    public void setShipsInternationally(boolean shipsInternationally) { this.shipsInternationally = shipsInternationally; }
    public List<String> getShippingCountries() { return shippingCountries; }
    public void setShippingCountries(List<String> shippingCountries) { this.shippingCountries = shippingCountries != null ? shippingCountries : new ArrayList<>(); }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public List<String> getGenres() { return genres; }
    public void setGenres(List<String> genres) { this.genres = genres != null ? genres : new ArrayList<>(); }
    public boolean isBookishMerch() { return bookishMerch; }
    public void setBookishMerch(boolean bookishMerch) { this.bookishMerch = bookishMerch; }
    public List<SubscriptionMonth> getMonths() { return months; }
    public void setMonths(List<SubscriptionMonth> months) { this.months = months != null ? months : new ArrayList<>(); }
    public String getSkipPolicyType() { return skipPolicyType; }
    public void setSkipPolicyType(String skipPolicyType) { this.skipPolicyType = skipPolicyType != null ? skipPolicyType : "UNLIMITED"; }
    public String getSkipResetType() { return skipResetType; }
    public void setSkipResetType(String skipResetType) { this.skipResetType = skipResetType; }
    public String getSkipResetDate() { return skipResetDate; }
    public void setSkipResetDate(String skipResetDate) { this.skipResetDate = skipResetDate; }
    public Integer getSkipCount() { return skipCount; }
    public void setSkipCount(Integer skipCount) { this.skipCount = skipCount; }
    public Integer getMaxConsecutiveSkips() { return maxConsecutiveSkips; }
    public void setMaxConsecutiveSkips(Integer maxConsecutiveSkips) { this.maxConsecutiveSkips = maxConsecutiveSkips; }
    public String getSkipPolicyNotes() { return skipPolicyNotes; }
    public void setSkipPolicyNotes(String skipPolicyNotes) { this.skipPolicyNotes = skipPolicyNotes; }
}
