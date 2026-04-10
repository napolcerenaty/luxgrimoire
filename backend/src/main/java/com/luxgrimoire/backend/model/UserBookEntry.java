package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonBackReference;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_book_entry")
public class UserBookEntry {
    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "username")
    @JsonBackReference("user-books")
    private AppUser user;

    private String bookId;
    private String editionId;
    private Instant addedAt;

    @Column(name = "flag")
    private String flag = "OWNED";

    public UserBookEntry() {}

    public UserBookEntry(String bookId, String editionId) {
        this.id = UUID.randomUUID().toString();
        this.bookId = bookId;
        this.editionId = editionId;
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public AppUser getUser() { return user; }
    public void setUser(AppUser user) { this.user = user; }
    public String getBookId() { return bookId; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public Instant getAddedAt() { return addedAt; }
    public void setAddedAt(Instant addedAt) { this.addedAt = addedAt; }
    public String getFlag() { return flag; }
    public void setFlag(String flag) { this.flag = flag; }
}
