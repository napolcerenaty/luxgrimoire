package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_favorite_company", uniqueConstraints = {
    @UniqueConstraint(name = "uq_fav_company", columnNames = {"username", "companyId"})
}, indexes = {
    @Index(name = "idx_ufc_username",   columnList = "username"),
    @Index(name = "idx_ufc_company_id", columnList = "companyId")
})
public class UserFavoriteCompany {
    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String companyId;

    private boolean notify = true;

    private Instant addedAt;

    public UserFavoriteCompany() {
        this.id = UUID.randomUUID().toString();
        this.addedAt = Instant.now();
    }

    public String getId() { return id; }
    public String getUsername() { return username; }
    public void setUsername(String username) { this.username = username; }
    public String getCompanyId() { return companyId; }
    public void setCompanyId(String companyId) { this.companyId = companyId; }
    public boolean isNotify() { return notify; }
    public void setNotify(boolean notify) { this.notify = notify; }
    public Instant getAddedAt() { return addedAt; }
}
