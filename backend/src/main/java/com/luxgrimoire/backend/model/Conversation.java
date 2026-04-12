package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "conversation", indexes = {
    @Index(name = "idx_conv_user1", columnList = "user1_username"),
    @Index(name = "idx_conv_user2", columnList = "user2_username")
})
public class Conversation {

    @Id
    private String id;

    @Column(name = "user1_username", nullable = false)
    private String user1Username;

    @Column(name = "user2_username", nullable = false)
    private String user2Username;

    private LocalDateTime createdAt;
    private LocalDateTime lastMessageAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getUser1Username() { return user1Username; }
    public void setUser1Username(String user1Username) { this.user1Username = user1Username; }
    public String getUser2Username() { return user2Username; }
    public void setUser2Username(String user2Username) { this.user2Username = user2Username; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getLastMessageAt() { return lastMessageAt; }
    public void setLastMessageAt(LocalDateTime lastMessageAt) { this.lastMessageAt = lastMessageAt; }
}
