package com.luxgrimoire.backend.model;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

public class BookDetail {
    private String id;
    private String title;
    private String author;
    private String seriesName;
    private String volumeNumber;
    private String subscriptionName;
    private String publisher;
    private Integer subscriptionMonth;
    private Integer subscriptionYear;
    private String firstAccessDate;
    private String earlyAccessDate;
    private String generalSaleDate;
    private BigDecimal basePrice;
    private String currency;
    private List<String> imageUrls;
    private List<ArtistContribution> artists;
    private String bookBoxCompanyId;
    private String bookBoxCompanyCustomName;
    private String subscriptionId;
    private String subscriptionMonthId;

    public BookDetail() {
        this.imageUrls = new ArrayList<>();
        this.artists = new ArrayList<>();
    }

    public BookDetail(String id, String title, String author, String seriesName, String volumeNumber,
                      String subscriptionName, String publisher, Integer subscriptionMonth,
                      Integer subscriptionYear, String firstAccessDate, String earlyAccessDate,
                      String generalSaleDate, BigDecimal basePrice, String currency,
                      List<String> imageUrls, List<ArtistContribution> artists) {
        this.id = id;
        this.title = title;
        this.author = author;
        this.seriesName = seriesName;
        this.volumeNumber = volumeNumber;
        this.subscriptionName = subscriptionName;
        this.publisher = publisher;
        this.subscriptionMonth = subscriptionMonth;
        this.subscriptionYear = subscriptionYear;
        this.firstAccessDate = firstAccessDate;
        this.earlyAccessDate = earlyAccessDate;
        this.generalSaleDate = generalSaleDate;
        this.basePrice = basePrice;
        this.currency = currency;
        this.imageUrls = imageUrls != null ? imageUrls : new ArrayList<>();
        this.artists = artists != null ? artists : new ArrayList<>();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }

    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }

    public String getSeriesName() { return seriesName; }
    public void setSeriesName(String seriesName) { this.seriesName = seriesName; }

    public String getVolumeNumber() { return volumeNumber; }
    public void setVolumeNumber(String volumeNumber) { this.volumeNumber = volumeNumber; }

    public String getSubscriptionName() { return subscriptionName; }
    public void setSubscriptionName(String subscriptionName) { this.subscriptionName = subscriptionName; }

    public String getPublisher() { return publisher; }
    public void setPublisher(String publisher) { this.publisher = publisher; }

    public Integer getSubscriptionMonth() { return subscriptionMonth; }
    public void setSubscriptionMonth(Integer subscriptionMonth) { this.subscriptionMonth = subscriptionMonth; }

    public Integer getSubscriptionYear() { return subscriptionYear; }
    public void setSubscriptionYear(Integer subscriptionYear) { this.subscriptionYear = subscriptionYear; }

    public String getFirstAccessDate() { return firstAccessDate; }
    public void setFirstAccessDate(String firstAccessDate) { this.firstAccessDate = firstAccessDate; }

    public String getEarlyAccessDate() { return earlyAccessDate; }
    public void setEarlyAccessDate(String earlyAccessDate) { this.earlyAccessDate = earlyAccessDate; }

    public String getGeneralSaleDate() { return generalSaleDate; }
    public void setGeneralSaleDate(String generalSaleDate) { this.generalSaleDate = generalSaleDate; }

    public BigDecimal getBasePrice() { return basePrice; }
    public void setBasePrice(BigDecimal basePrice) { this.basePrice = basePrice; }

    public String getCurrency() { return currency; }
    public void setCurrency(String currency) { this.currency = currency; }

    public List<String> getImageUrls() { return imageUrls; }
    public void setImageUrls(List<String> imageUrls) { this.imageUrls = imageUrls; }

    public List<ArtistContribution> getArtists() { return artists; }
    public void setArtists(List<ArtistContribution> artists) { this.artists = artists; }

    public String getBookBoxCompanyId() { return bookBoxCompanyId; }
    public void setBookBoxCompanyId(String bookBoxCompanyId) { this.bookBoxCompanyId = bookBoxCompanyId; }

    public String getBookBoxCompanyCustomName() { return bookBoxCompanyCustomName; }
    public void setBookBoxCompanyCustomName(String bookBoxCompanyCustomName) { this.bookBoxCompanyCustomName = bookBoxCompanyCustomName; }

    public String getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(String subscriptionId) { this.subscriptionId = subscriptionId; }

    public String getSubscriptionMonthId() { return subscriptionMonthId; }
    public void setSubscriptionMonthId(String subscriptionMonthId) { this.subscriptionMonthId = subscriptionMonthId; }
}
