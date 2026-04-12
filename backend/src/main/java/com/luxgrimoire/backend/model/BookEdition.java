package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import org.hibernate.annotations.BatchSize;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "book_edition", indexes = {
    @Index(name = "idx_book_edition_book_id", columnList = "book_id")
})
public class BookEdition {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "book_id")
    @JsonBackReference("book-editions")
    private Book book;

    private String editionName;
    private String subscriptionName;
    private String publisher;
    private String language;
    private Integer subscriptionMonth;
    private Integer subscriptionYear;
    private String firstAccessDate;
    private String earlyAccessDate;
    private String generalSaleDate;
    private BigDecimal basePrice;
    private String currency;
    private String bookBoxCompanyId;
    private String bookBoxCompanyCustomName;
    private String subscriptionId;
    private String subscriptionMonthId;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "book_edition_image", joinColumns = @JoinColumn(name = "edition_id"))
    @Column(name = "image_url")
    @OrderColumn(name = "sort_order")
    @BatchSize(size = 50)
    private List<String> imageUrls = new ArrayList<>();

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "book_edition_artist", joinColumns = @JoinColumn(name = "edition_id"))
    @BatchSize(size = 50)
    private List<ArtistContribution> artists = new ArrayList<>();

    public BookEdition() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Book getBook() { return book; }
    public void setBook(Book book) { this.book = book; }
    public String getEditionName() { return editionName; }
    public void setEditionName(String editionName) { this.editionName = editionName; }
    public String getSubscriptionName() { return subscriptionName; }
    public void setSubscriptionName(String subscriptionName) { this.subscriptionName = subscriptionName; }
    public String getPublisher() { return publisher; }
    public void setPublisher(String publisher) { this.publisher = publisher; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
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
