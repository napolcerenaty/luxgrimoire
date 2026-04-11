package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "edition_comment", indexes = {
    @Index(name = "idx_ec_edition_created", columnList = "editionId,createdAt"),
    @Index(name = "idx_ec_author",          columnList = "authorUsername")
})
public class EditionComment {
    @Id
    private String id;

    @Column(nullable = false)
    private String editionId;

    @Column(nullable = false)
    private String authorUsername;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String content;

    private Instant createdAt;
    private int likeCount = 0;

    public EditionComment() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId() { return id; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public String getAuthorUsername() { return authorUsername; }
    public void setAuthorUsername(String authorUsername) { this.authorUsername = authorUsername; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Instant getCreatedAt() { return createdAt; }
    public int getLikeCount() { return likeCount; }
    public void setLikeCount(int likeCount) { this.likeCount = likeCount; }
}
