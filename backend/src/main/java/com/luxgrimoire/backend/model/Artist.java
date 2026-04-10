package com.luxgrimoire.backend.model;
import jakarta.persistence.*;
import java.util.UUID;

@Entity
@Table(name = "artist")
public class Artist {
    @Id private String id;
    private String name;
    @Column(columnDefinition = "TEXT") private String bio;
    private String imageUrl;
    private String specialty;

    public Artist() { this.id = UUID.randomUUID().toString(); }
    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getBio() { return bio; }
    public void setBio(String bio) { this.bio = bio; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public String getSpecialty() { return specialty; }
    public void setSpecialty(String specialty) { this.specialty = specialty; }
}
