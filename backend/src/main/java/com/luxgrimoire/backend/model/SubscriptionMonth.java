package com.luxgrimoire.backend.model;

import java.util.UUID;

public class SubscriptionMonth {
    private String id;
    private String imageUrl;  // optional
    private String theme;     // optional
    private int month;        // 1–12
    private int year;
    private String bookId;    // optional – set when a book is linked to this month

    public SubscriptionMonth() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

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
}
