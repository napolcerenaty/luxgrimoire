package com.luxgrimoire.backend.dto;

import com.luxgrimoire.backend.model.BookEdition;

import java.util.List;

public class BookDetailResponse {
    private final String id;
    private final String title;
    private final String author;
    private final String authorId;
    private final String seriesName;
    private final String volumeNumber;
    private final List<BookEdition> editions;

    public BookDetailResponse(String id,
                              String title,
                              String author,
                              String authorId,
                              String seriesName,
                              String volumeNumber,
                              List<BookEdition> editions) {
        this.id = id;
        this.title = title;
        this.author = author;
        this.authorId = authorId;
        this.seriesName = seriesName;
        this.volumeNumber = volumeNumber;
        this.editions = editions;
    }

    public String getId() { return id; }
    public String getTitle() { return title; }
    public String getAuthor() { return author; }
    public String getAuthorId() { return authorId; }
    public String getSeriesName() { return seriesName; }
    public String getVolumeNumber() { return volumeNumber; }
    public List<BookEdition> getEditions() { return editions; }
}
