package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
@Entity
@Table(name = "book", indexes = {
    @Index(name = "idx_book_status",           columnList = "status"),
    @Index(name = "idx_book_author_id",        columnList = "authorId"),
    @Index(name = "idx_book_author_status",    columnList = "authorId,status"),
    @Index(name = "idx_book_series_name",      columnList = "seriesName")
})
public class Book {
    @Id
    private String id;

    private String title;
    private String author;
    private String authorId;
    private String seriesName;
    private String volumeNumber;
    private String status = "approved";
    private String addedBy;
    private String coverUrl;

    @OneToMany(mappedBy = "book", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference("book-editions")
    @JsonIgnore
    private List<BookEdition> editions = new ArrayList<>();

    public Book() {
        this.id = UUID.randomUUID().toString();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
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
    public List<BookEdition> getEditions() { return editions; }
    public void setEditions(List<BookEdition> editions) { this.editions = editions; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getAddedBy() { return addedBy; }
    public void setAddedBy(String addedBy) { this.addedBy = addedBy; }
    public String getCoverUrl() { return coverUrl; }
    public void setCoverUrl(String coverUrl) { this.coverUrl = coverUrl; }
}
