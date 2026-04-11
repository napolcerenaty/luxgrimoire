package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "app_user", indexes = {
    @Index(name = "idx_user_email", columnList = "email", unique = true)
})
public class AppUser {
    @Id
    private String username;
    private String password;
    private String firstName;
    private String lastName;
    private String timezone;
    private String avatarUrl;
    @Column(unique = true)
    private String email;
    private String role = "user";

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference("user-books")
    @JsonIgnore
    private List<UserBookEntry> ownedBooks = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @JsonManagedReference("user-subscriptions")
    @JsonIgnore
    private List<UserSubscriptionEntry> subscriptions = new ArrayList<>();

    public AppUser() {}

    public AppUser(String username, String password, String firstName, String lastName, String timezone) {
        this.username = username;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.timezone = timezone;
    }

    public AppUser(String username, String password, String firstName, String lastName, String timezone, String email, String role) {
        this.username = username;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.timezone = timezone;
        this.email = email;
        this.role = role;
    }

    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public String getAvatarUrl() { return avatarUrl; }
    public void setAvatarUrl(String avatarUrl) { this.avatarUrl = avatarUrl; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getRole() { return role; }
    public void setRole(String role) { this.role = role; }
    public List<UserBookEntry> getOwnedBooks() { return ownedBooks; }
    public List<UserSubscriptionEntry> getSubscriptions() { return subscriptions; }
}
