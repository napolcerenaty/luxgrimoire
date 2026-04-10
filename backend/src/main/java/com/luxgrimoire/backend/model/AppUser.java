package com.luxgrimoire.backend.model;

import com.fasterxml.jackson.annotation.JsonManagedReference;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "app_user")
public class AppUser {
    @Id
    private String username;
    private String password;
    private String firstName;
    private String lastName;
    private String timezone;

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference("user-books")
    private List<UserBookEntry> ownedBooks = new ArrayList<>();

    @OneToMany(mappedBy = "user", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @JsonManagedReference("user-subscriptions")
    private List<UserSubscriptionEntry> subscriptions = new ArrayList<>();

    public AppUser() {}

    public AppUser(String username, String password, String firstName, String lastName, String timezone) {
        this.username = username;
        this.password = password;
        this.firstName = firstName;
        this.lastName = lastName;
        this.timezone = timezone;
    }

    public String getUsername() { return username; }
    public String getPassword() { return password; }
    public String getFirstName() { return firstName; }
    public void setFirstName(String firstName) { this.firstName = firstName; }
    public String getLastName() { return lastName; }
    public void setLastName(String lastName) { this.lastName = lastName; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone; }
    public List<UserBookEntry> getOwnedBooks() { return ownedBooks; }
    public List<UserSubscriptionEntry> getSubscriptions() { return subscriptions; }
}
