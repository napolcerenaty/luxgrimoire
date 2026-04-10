package com.luxgrimoire.backend.model;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

public class Book {
    private String id;
    private String title;
    private String author;
    private String seriesName;
    private String volumeNumber;
    private List<BookEdition> editions;

    public Book() {
        this.id = UUID.randomUUID().toString();
        this.editions = new ArrayList<>();
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

    public List<BookEdition> getEditions() { return editions; }
    public void setEditions(List<BookEdition> editions) { this.editions = editions; }
}
