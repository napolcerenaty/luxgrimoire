package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_favorite_artist", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fav_artist", columnNames = {"username", "artistId"})
}, indexes = {
    @Index(name = "idx_ufar_username",  columnList = "username"),
    @Index(name = "idx_ufar_artist_id", columnList = "artistId")
})
public class UserFavoriteArtist {
    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String artistId;

    private boolean notify = true;

    private Instant addedAt;

    public UserFavoriteArtist() {
        this.id = UUID.randomUUID().toString();
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getArtistId() { return artistId; }
    public void setArtistId(String artistId) { this.artistId = artistId; }
    public boolean isNotify() { return notify; }
    public void setNotify(boolean notify) { this.notify = notify; }
    public Instant getAddedAt() { return addedAt; }
}
