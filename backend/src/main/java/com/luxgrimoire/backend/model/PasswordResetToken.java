package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "password_reset_token")
public class PasswordResetToken {

    @Id
    @Column(length = 64)
    private String token;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private Instant expiresAt;

    private boolean used = false;

    public PasswordResetToken() {}

    public PasswordResetToken(String token, String username, Instant expiresAt) {
        this.token     = token;
        this.username  = username;
        this.expiresAt = expiresAt;
    }

    public String  getToken()     { return token; }
    public String  getUsername()  { return username; }
    public Instant getExpiresAt() { return expiresAt; }
    public boolean isUsed()       { return used; }
    public void    setUsed(boolean used) { this.used = used; }

    public boolean isValid() {
        return !used && Instant.now().isBefore(expiresAt);
    }
}
