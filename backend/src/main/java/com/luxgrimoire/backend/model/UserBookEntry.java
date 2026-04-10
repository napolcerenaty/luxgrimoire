package com.luxgrimoire.backend.model;

import java.time.Instant;
import java.util.UUID;

public class UserBookEntry {
    private String id;
    private String bookId;
    private String editionId;
    private Instant addedAt;

    public UserBookEntry() {}

    public UserBookEntry(String bookId, String editionId) {
        this.id = UUID.randomUUID().toString();
        this.bookId = bookId;
        this.editionId = editionId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getBookId() { return bookId; }
    public String getEditionId() { return editionId; }
    public Instant getAddedAt() { return addedAt; }

    public void setId(String id) { this.id = id; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
}

