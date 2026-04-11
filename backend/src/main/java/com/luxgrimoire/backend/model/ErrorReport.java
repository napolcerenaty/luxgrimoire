package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "error_report", indexes = {
    @Index(name = "idx_error_report_status", columnList = "status"),
    @Index(name = "idx_error_report_created", columnList = "createdAt")
})
public class ErrorReport {

    @Id
    private String id;

    private String reporterUsername;

    @Column(nullable = false)
    private String title;

    @Column(length = 2000)
    private String description;

    private String category; // bug | content | other

    @Column(nullable = false)
    private String status = "open"; // open | in_progress | resolved | dismissed

    @Column(nullable = false)
    private Instant createdAt;

    private String adminNote;

    public ErrorReport() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId()                     { return id; }
    public String getReporterUsername()        { return reporterUsername; }
    public void setReporterUsername(String v)  { this.reporterUsername = v; }
    public String getTitle()                   { return title; }
    public void setTitle(String v)             { this.title = v; }
    public String getDescription()             { return description; }
    public void setDescription(String v)       { this.description = v; }
    public String getCategory()                { return category; }
    public void setCategory(String v)          { this.category = v; }
    public String getStatus()                  { return status; }
    public void setStatus(String v)            { this.status = v; }
    public Instant getCreatedAt()              { return createdAt; }
    public String getAdminNote()               { return adminNote; }
    public void setAdminNote(String v)         { this.adminNote = v; }
}
