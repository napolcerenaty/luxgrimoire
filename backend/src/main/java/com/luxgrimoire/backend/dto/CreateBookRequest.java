package com.luxgrimoire.backend.dto;

public class CreateBookRequest {
    private String title;
    private String author;
    private String authorId;
    private String seriesName;
    private String volumeNumber;

    public CreateBookRequest() {}

    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getAuthor() { return author; }
    public void setAuthor(String author) { this.author = author; }
    public String getAuthorId() { return authorId; }
    public void setAuthorId(String authorId) { this.authorId = authorId; }
    public String getSeriesName() { return seriesName; }
    public void setSeriesName(String seriesName) { this.seriesName = seriesName; }
    public String getVolumeNumber() { return volumeNumber; }
    public void setVolumeNumber(String volumeNumber) { this.volumeNumber = volumeNumber; }
}
