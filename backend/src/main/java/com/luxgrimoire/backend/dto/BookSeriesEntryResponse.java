package com.luxgrimoire.backend.dto;

public class BookSeriesEntryResponse {
    private final String id;
    private final String title;
    private final String author;
    private final String authorId;
    private final String seriesName;
    private final String volumeNumber;
    private final boolean current;
    private final String coverUrl;

    public BookSeriesEntryResponse(String id, String title, String author, String authorId,
                                   String seriesName, String volumeNumber, boolean current,
                                   String coverUrl) {
        this.id = id;
        this.title = title;
        this.author = author;
        this.authorId = authorId;
        this.seriesName = seriesName;
        this.volumeNumber = volumeNumber;
        this.current = current;
        this.coverUrl = coverUrl;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getAuthor() { return author; }
    public String getAuthorId() { return authorId; }
    public String getSeriesName() { return seriesName; }
    public String getVolumeNumber() { return volumeNumber; }
    public boolean isCurrent() { return current; }
    public String getCoverUrl() { return coverUrl; }
}
