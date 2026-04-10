package com.luxgrimoire.backend.model;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "author")
public class Author {
    @Id private String id;
    private String name;
    @Column(columnDefinition = "TEXT") private String bio;
    private String imageUrl;
    private String nationality;
    private String website;
    private String instagram;
    private String twitter;
    private String facebook;

    public Author() { this.id = UUID.randomUUID().toString(); }
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getNationality() { return nationality; }
    public void setNationality(String nationality) { this.nationality = nationality; }
    public String getWebsite() { return website; }
    public void setWebsite(String website) { this.website = website; }
    public String getInstagram() { return instagram; }
    public void setInstagram(String instagram) { this.instagram = instagram; }
    public String getTwitter() { return twitter; }
    public void setTwitter(String twitter) { this.twitter = twitter; }
    public String getFacebook() { return facebook; }
    public void setFacebook(String facebook) { this.facebook = facebook; }
}
