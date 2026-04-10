package com.luxgrimoire.backend.model;

public class BookListing {
    private Long id;
    private String title;
    private String author;
    private String genre;
    private String imageUrl;
    private String description;

    public BookListing(Long id, String title, String author, String genre, String imageUrl, String description) {
        this.id = id;
        this.title = title;
        this.author = author;
        this.genre = genre;
        this.imageUrl = imageUrl;
        this.description = description;
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    public String getAuthor() { return author; }
    public String getGenre() { return genre; }
    public String getImageUrl() { return imageUrl; }
    public String getDescription() { return description; }
}
