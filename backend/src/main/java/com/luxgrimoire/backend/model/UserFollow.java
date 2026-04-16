package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "user_follow",
    uniqueConstraints = @UniqueConstraint(columnNames = {"follower_username", "following_username"}),
    indexes = {
        @Index(name = "idx_follow_follower",  columnList = "follower_username"),
        @Index(name = "idx_follow_following", columnList = "following_username")
    })
public class UserFollow {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "follower_username", nullable = false)
    private String followerUsername;

    @Column(name = "following_username", nullable = false)
    private String followingUsername;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public UserFollow() {}

    public UserFollow(String followerUsername, String followingUsername) {
        this.followerUsername  = followerUsername;
        this.followingUsername = followingUsername;
    }

    public Long getId() { return id; }
    public String getFollowerUsername() { return followerUsername; }
    public void setFollowerUsername(String followerUsername) { this.followerUsername = followerUsername; }
    public String getFollowingUsername() { return followingUsername; }
    public void setFollowingUsername(String followingUsername) { this.followingUsername = followingUsername; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
