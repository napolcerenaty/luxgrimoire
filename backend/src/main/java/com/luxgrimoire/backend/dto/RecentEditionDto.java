package com.luxgrimoire.backend.dto;

import java.util.List;

public class RecentEditionDto {
    private String editionId;
    private String bookId;
    private String bookTitle;
    private String author;
    private String editionName;
    private String subscriptionName;
    private String bookBoxCompanyId;
    private List<String> imageUrls;

    public RecentEditionDto(String editionId, String bookId, String bookTitle, String author,
                             String editionName, String subscriptionName, String bookBoxCompanyId,
                             List<String> imageUrls) {
        this.editionId = editionId;
        this.bookId = bookId;
        this.bookTitle = bookTitle;
        this.author = author;
        this.editionName = editionName;
        this.subscriptionName = subscriptionName;
        this.bookBoxCompanyId = bookBoxCompanyId;
        this.imageUrls = imageUrls != null ? imageUrls : List.of();
    }

    public String getEditionId() { return editionId; }
    public String getBookId() { return bookId; }
    public String getBookTitle() { return bookTitle; }
    public String getAuthor() { return author; }
    public String getEditionName() { return editionName; }
    public String getSubscriptionName() { return subscriptionName; }
    public String getBookBoxCompanyId() { return bookBoxCompanyId; }
    public List<String> getImageUrls() { return imageUrls; }
}
