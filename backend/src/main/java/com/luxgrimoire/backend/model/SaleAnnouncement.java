package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "sale_announcement")
public class SaleAnnouncement {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    private String companyId;

    @Column(nullable = false, name = "sale_date")
    private String generalSaleDate;

    @Column(name = "first_access_date")
    private String firstAccessDate;

    @Column(name = "early_access_date")
    private String earlyAccessDate;

    @Column(name = "sale_timezone", length = 60)
    private String saleTimezone;

    @Column(precision = 10, scale = 2)
    private BigDecimal basePrice;

    @Column(length = 10)
    private String currency;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String imageUrl;

    private Instant createdAt;

    public SaleAnnouncement() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId()                     { return id; }
    public void setId(String id)              { this.id = id; }
    public String getTitle()                  { return title; }
    public void setTitle(String title)        { this.title = title; }
    public String getCompanyId()              { return companyId; }
    public void setCompanyId(String companyId){ this.companyId = companyId; }
    public String getGeneralSaleDate()               { return generalSaleDate; }
    public void setGeneralSaleDate(String d)         { this.generalSaleDate = d; }
    public String getFirstAccessDate()               { return firstAccessDate; }
    public void setFirstAccessDate(String d)         { this.firstAccessDate = d; }
    public String getEarlyAccessDate()               { return earlyAccessDate; }
    public void setEarlyAccessDate(String d)         { this.earlyAccessDate = d; }
    public String getSaleTimezone()                  { return saleTimezone; }
    public void setSaleTimezone(String tz)           { this.saleTimezone = tz; }
    public BigDecimal getBasePrice()          { return basePrice; }
    public void setBasePrice(BigDecimal p)    { this.basePrice = p; }
    public String getCurrency()               { return currency; }
    public void setCurrency(String currency)  { this.currency = currency; }
    public String getDescription()            { return description; }
    public void setDescription(String d)      { this.description = d; }
    public String getImageUrl()               { return imageUrl; }
    public void setImageUrl(String imageUrl)  { this.imageUrl = imageUrl; }
    public Instant getCreatedAt()             { return createdAt; }
    public void setCreatedAt(Instant t)       { this.createdAt = t; }
}
