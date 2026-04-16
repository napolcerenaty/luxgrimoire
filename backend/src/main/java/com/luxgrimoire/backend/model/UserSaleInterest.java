package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "user_sale_interest", indexes = {
    @Index(name = "idx_usi_username", columnList = "username")
})
public class UserSaleInterest {

    @Id
    private String id;

    @Column(nullable = false)
    private String username;

    @Column(nullable = false)
    private String saleId;

    @Column(length = 20)
    private String status;

    private Instant createdAt;

    public UserSaleInterest() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId()                     { return id; }
    public void setId(String id)              { this.id = id; }
    public String getUsername()               { return username; }
    public void setUsername(String username)  { this.username = username; }
    public String getSaleId()                 { return saleId; }
    public void setSaleId(String saleId)      { this.saleId = saleId; }
    public String getStatus()                 { return status; }
    public void setStatus(String status)      { this.status = status; }
    public Instant getCreatedAt()             { return createdAt; }
    public void setCreatedAt(Instant t)       { this.createdAt = t; }
}
