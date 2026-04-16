package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_favorite_book", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fav_book", columnNames = {"username", "bookId"})
}, indexes = {
    @Index(name = "idx_ufb_username", columnList = "username"),
    @Index(name = "idx_ufb_book_id",  columnList = "bookId")
})
public class UserFavoriteBook {
    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String bookId;

    private boolean notify = true;

    private Instant addedAt;

    public UserFavoriteBook() {
        this.id = UUID.randomUUID().toString();
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getBookId() { return bookId; }
    public void setBookId(String bookId) { this.bookId = bookId; }
    public boolean isNotify() { return notify; }
    public void setNotify(boolean notify) { this.notify = notify; }
    public Instant getAddedAt() { return addedAt; }
}
