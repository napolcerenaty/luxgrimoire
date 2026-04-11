package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "edition_like", uniqueConstraints = {
    @UniqueConstraint(name = "uq_edition_like", columnNames = {"editionId", "username"})
}, indexes = {
    @Index(name = "idx_el_edition_id", columnList = "editionId"),
    @Index(name = "idx_el_username",   columnList = "username")
})
public class EditionLike {
    @Id
    private String id;

    @Column(nullable = false)
    private String editionId;

    @Column(nullable = false)
    private String username;

    private Instant createdAt;

    public EditionLike() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId() { return id; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public Instant getCreatedAt() { return createdAt; }
}
