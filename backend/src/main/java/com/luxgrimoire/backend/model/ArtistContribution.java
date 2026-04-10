package com.luxgrimoire.backend.model;

public class ArtistContribution {
    private String artistName;
    private String contribution;

    public ArtistContribution() {}

    public ArtistContribution(String artistName, String contribution) {
        this.artistName = artistName;
        this.contribution = contribution;
    }

    public String getArtistName() { return artistName; }
    public void setArtistName(String artistName) { this.artistName = artistName; }

    public String getContribution() { return contribution; }
    public void setContribution(String contribution) { this.contribution = contribution; }
}
