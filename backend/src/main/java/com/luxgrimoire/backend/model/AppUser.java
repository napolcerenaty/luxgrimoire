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
    @Column(length = 500)
    private String adminPermissions;
    @Column(length = 36)
    private String managedCompanyId;
    private boolean libraryPublic = false;
    private boolean messagingPrivate = false;
    private boolean favoritesPublic = true;

    // Granular privacy levels: PUBLIC | FOLLOWERS | FRIENDS | PRIVATE
    private String profilePrivacy       = "PUBLIC";
    private String collectionPrivacy    = "FRIENDS";
    private String isoPrivacy           = "FRIENDS";
    private String interestedPrivacy    = "FOLLOWERS";
    private String subscriptionsPrivacy = "PRIVATE";
    private String favoritesPrivacy     = "PUBLIC";

    @Column(columnDefinition = "TEXT")
    private String bioPublic;
    private String goodreadsUrl;
    private String storygraphUrl;
    private String instagramUrl;
    private String twitterUrl;

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
    public void setPassword(String password) { this.password = password; }
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
    public String getAdminPermissions() { return adminPermissions; }
    public void setAdminPermissions(String adminPermissions) { this.adminPermissions = adminPermissions; }
    public String getManagedCompanyId() { return managedCompanyId; }
    public void setManagedCompanyId(String managedCompanyId) { this.managedCompanyId = managedCompanyId; }
    public boolean isLibraryPublic() { return libraryPublic; }
    public void setLibraryPublic(boolean libraryPublic) { this.libraryPublic = libraryPublic; }
    public boolean isMessagingPrivate() { return messagingPrivate; }
    public void setMessagingPrivate(boolean messagingPrivate) { this.messagingPrivate = messagingPrivate; }
    public boolean isFavoritesPublic() { return favoritesPublic; }
    public void setFavoritesPublic(boolean favoritesPublic) { this.favoritesPublic = favoritesPublic; }
    public String getProfilePrivacy() { return profilePrivacy; }
    public void setProfilePrivacy(String profilePrivacy) { this.profilePrivacy = profilePrivacy; }
    public String getCollectionPrivacy() { return collectionPrivacy; }
    public void setCollectionPrivacy(String collectionPrivacy) { this.collectionPrivacy = collectionPrivacy; }
    public String getIsoPrivacy() { return isoPrivacy; }
    public void setIsoPrivacy(String isoPrivacy) { this.isoPrivacy = isoPrivacy; }
    public String getInterestedPrivacy() { return interestedPrivacy; }
    public void setInterestedPrivacy(String interestedPrivacy) { this.interestedPrivacy = interestedPrivacy; }
    public String getSubscriptionsPrivacy() { return subscriptionsPrivacy; }
    public void setSubscriptionsPrivacy(String subscriptionsPrivacy) { this.subscriptionsPrivacy = subscriptionsPrivacy; }
    public String getFavoritesPrivacy() { return favoritesPrivacy; }
    public void setFavoritesPrivacy(String favoritesPrivacy) { this.favoritesPrivacy = favoritesPrivacy; }
    public String getBioPublic() { return bioPublic; }
    public void setBioPublic(String bioPublic) { this.bioPublic = bioPublic; }
    public String getGoodreadsUrl() { return goodreadsUrl; }
    public void setGoodreadsUrl(String goodreadsUrl) { this.goodreadsUrl = goodreadsUrl; }
    public String getStorygraphUrl() { return storygraphUrl; }
    public void setStorygraphUrl(String storygraphUrl) { this.storygraphUrl = storygraphUrl; }
    public String getInstagramUrl() { return instagramUrl; }
    public void setInstagramUrl(String instagramUrl) { this.instagramUrl = instagramUrl; }
    public String getTwitterUrl() { return twitterUrl; }
    public void setTwitterUrl(String twitterUrl) { this.twitterUrl = twitterUrl; }
    public List<UserBookEntry> getOwnedBooks() { return ownedBooks; }
    public List<UserSubscriptionEntry> getSubscriptions() { return subscriptions; }
}
