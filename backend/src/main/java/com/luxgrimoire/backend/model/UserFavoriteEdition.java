package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_favorite_edition", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fav_edition", columnNames = {"username", "editionId"})
}, indexes = {
    @Index(name = "idx_ufe_username",   columnList = "username"),
    @Index(name = "idx_ufe_edition_id", columnList = "editionId")
})
public class UserFavoriteEdition {
    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String editionId;

    private Instant addedAt;

    public UserFavoriteEdition() {
        this.id = UUID.randomUUID().toString();
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getEditionId() { return editionId; }
    public void setEditionId(String editionId) { this.editionId = editionId; }
    public Instant getAddedAt() { return addedAt; }
}
