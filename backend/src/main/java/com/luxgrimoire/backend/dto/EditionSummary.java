package com.luxgrimoire.backend.dto;

public class EditionSummary {
    private String editionId;
    private String bookId;
    private String bookTitle;
    private String seriesName;
    private String volumeNumber;
    private String coverUrl;
    private String boxName;
    private String companyName;

    public EditionSummary() {}

    public EditionSummary(String editionId, String bookId, String bookTitle,
                          String seriesName, String volumeNumber,
                          String coverUrl, String boxName, String companyName) {
        this.editionId = editionId;
        this.bookId = bookId;
        this.bookTitle = bookTitle;
        this.seriesName = seriesName;
        this.volumeNumber = volumeNumber;
        this.coverUrl = coverUrl;
        this.boxName = boxName;
        this.companyName = companyName;
    }

    public String getEditionId() { return editionId; }
    public String getBookId() { return bookId; }
    public String getBookTitle() { return bookTitle; }
    public String getSeriesName() { return seriesName; }
    public String getVolumeNumber() { return volumeNumber; }
    public String getCoverUrl() { return coverUrl; }
    public String getBoxName() { return boxName; }
    public String getCompanyName() { return companyName; }
}
