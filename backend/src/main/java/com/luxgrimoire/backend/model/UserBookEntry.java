package com.luxgrimoire.backend.model;

import java.time.Instant;
import java.util.UUID;

public class UserBookEntry {
    private String id;
    private String bookDetailId;
    private Instant addedAt;

    public UserBookEntry() {}

    public UserBookEntry(String bookDetailId) {
        this.id = UUID.randomUUID().toString();
        this.bookDetailId = bookDetailId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getBookDetailId() { return bookDetailId; }
    public Instant getAddedAt() { return addedAt; }
}
