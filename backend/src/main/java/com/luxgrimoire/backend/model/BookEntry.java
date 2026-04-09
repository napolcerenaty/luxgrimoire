package com.luxgrimoire.backend.model;

public class BookEntry {
    private String language;
    private String author;
    private String title;
    private String series;
    private String volume;
    private String edition;
    private String features;
    private Boolean read;
    private Boolean forSale;
    private String notes;

    public BookEntry(String language, String author, String title, String series,
                     String volume, String edition, String features,
                     Boolean read, Boolean forSale, String notes) {
        this.language = language;
        this.author = author;
        this.title = title;
        this.series = series;
        this.volume = volume;
        this.edition = edition;
        this.features = features;
        this.read = read;
        this.forSale = forSale;
        this.notes = notes;
    }

    public String getLanguage() { return language; }
    public String getAuthor() { return author; }
    public String getTitle() { return title; }
    public String getSeries() { return series; }
    public String getVolume() { return volume; }
    public String getEdition() { return edition; }
    public String getFeatures() { return features; }
    public Boolean getRead() { return read; }
    public Boolean getForSale() { return forSale; }
    public String getNotes() { return notes; }
}
