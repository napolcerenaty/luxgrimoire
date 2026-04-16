package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ol_book")
public class OlBook {

    @Id
    @Column(name = "ol_key", nullable = false)
    private String olKey;

    @Column(name = "title")
    private String title;

    @Column(name = "series_name")
    private String seriesName;

    @Column(name = "series_position")
    private String seriesPosition;

    @Column(name = "first_pub_year")
    private Integer firstPubYear;

    @Column(name = "ol_modified")
    private Instant olModified;

    /** Nullable FK linking to our Book entity once matched */
    @Column(name = "book_id")
    private String bookId;

    public OlBook() {}

    public String getOlKey()               { return olKey; }
    public void setOlKey(String v)         { this.olKey = v; }
    public String getTitle()               { return title; }
    public void setTitle(String v)         { this.title = v; }
    public String getSeriesName()          { return seriesName; }
    public void setSeriesName(String v)    { this.seriesName = v; }
    public String getSeriesPosition()      { return seriesPosition; }
    public void setSeriesPosition(String v){ this.seriesPosition = v; }
    public Integer getFirstPubYear()       { return firstPubYear; }
    public void setFirstPubYear(Integer v) { this.firstPubYear = v; }
    public Instant getOlModified()         { return olModified; }
    public void setOlModified(Instant v)   { this.olModified = v; }
    public String getBookId()              { return bookId; }
    public void setBookId(String v)        { this.bookId = v; }
}
