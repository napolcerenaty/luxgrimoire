package com.luxgrimoire.backend.model;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

@Embeddable
public class ArtistContribution {
    @Column(name = "artist_name")
    private String artistName;
    private String contribution;
    private String artistId;

    public ArtistContribution() {}
    public ArtistContribution(String artistName, String contribution) {
        this.artistName = artistName;
        this.contribution = contribution;
    }
    public String getArtistName() { return artistName; }
    public void setArtistName(String artistName) { this.artistName = artistName; }
    public String getContribution() { return contribution; }
    public void setContribution(String contribution) { this.contribution = contribution; }
    public String getArtistId() { return artistId; }
    public void setArtistId(String artistId) { this.artistId = artistId; }
}
