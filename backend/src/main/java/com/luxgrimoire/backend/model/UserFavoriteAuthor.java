package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_favorite_author", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fav_author", columnNames = {"username", "authorId"})
}, indexes = {
    @Index(name = "idx_ufa_username",  columnList = "username"),
    @Index(name = "idx_ufa_author_id", columnList = "authorId")
})
public class UserFavoriteAuthor {
    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String authorId;

    private boolean notify = true;

    private Instant addedAt;

    public UserFavoriteAuthor() {
        this.id = UUID.randomUUID().toString();
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getAuthorId() { return authorId; }
    public void setAuthorId(String authorId) { this.authorId = authorId; }
    public boolean isNotify() { return notify; }
    public void setNotify(boolean notify) { this.notify = notify; }
    public Instant getAddedAt() { return addedAt; }
}
