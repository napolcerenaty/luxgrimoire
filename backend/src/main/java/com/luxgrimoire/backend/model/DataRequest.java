package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "data_request", indexes = {
    @Index(name = "idx_data_request_status", columnList = "status"),
    @Index(name = "idx_data_request_created", columnList = "createdAt")
})
public class DataRequest {

    @Id
    private String id;

    private String requesterUsername;

    @Column(nullable = false)
    private String type; // export | deletion | correction | other

    @Column(length = 2000)
    private String description;

    @Column(nullable = false)
    private String status = "pending"; // pending | processing | completed | rejected

    @Column(nullable = false)
    private Instant createdAt;

    private String adminNote;

    public DataRequest() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId()                     { return id; }
    public String getRequesterUsername()       { return requesterUsername; }
    public void setRequesterUsername(String v) { this.requesterUsername = v; }
    public String getType()                    { return type; }
    public void setType(String v)              { this.type = v; }
    public String getDescription()             { return description; }
    public void setDescription(String v)       { this.description = v; }
    public String getStatus()                  { return status; }
    public void setStatus(String v)            { this.status = v; }
    public Instant getCreatedAt()              { return createdAt; }
    public String getAdminNote()               { return adminNote; }
    public void setAdminNote(String v)         { this.adminNote = v; }
}
