package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "comment_like", uniqueConstraints = {
    @UniqueConstraint(name = "uq_comment_like", columnNames = {"commentId", "username"})
}, indexes = {
    @Index(name = "idx_cl_comment_id", columnList = "commentId"),
    @Index(name = "idx_cl_username",   columnList = "username")
})
public class CommentLike {
    @Id
    private String id;

    @Column(nullable = false)
    private String commentId;

    @Column(nullable = false)
    private String username;

    private Instant createdAt;

    public CommentLike() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId() { return id; }
    public String getCommentId() { return commentId; }
    public void setCommentId(String commentId) { this.commentId = commentId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Instant getCreatedAt() { return createdAt; }
}
