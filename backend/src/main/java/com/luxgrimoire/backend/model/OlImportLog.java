package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "ol_import_log")
public class OlImportLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "run_at")
    private Instant runAt;

    @Column(name = "mode")
    private String mode;

    @Column(name = "books_processed")
    private Long booksProcessed;

    @Column(name = "books_inserted")
    private Long booksInserted;

    @Column(name = "authors_inserted")
    private Long authorsInserted;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "status")
    private String status; // "ok" | "partial" | "failed"

    @Column(name = "error_message", length = 1000)
    private String errorMessage;

    public OlImportLog() {}

    public Long getId()                         { return id; }
    public Instant getRunAt()                   { return runAt; }
    public void setRunAt(Instant v)             { this.runAt = v; }
    public String getMode()                     { return mode; }
    public void setMode(String v)               { this.mode = v; }
    public Long getBooksProcessed()             { return booksProcessed; }
    public void setBooksProcessed(Long v)       { this.booksProcessed = v; }
    public Long getBooksInserted()              { return booksInserted; }
    public void setBooksInserted(Long v)        { this.booksInserted = v; }
    public Long getAuthorsInserted()            { return authorsInserted; }
    public void setAuthorsInserted(Long v)      { this.authorsInserted = v; }
    public Integer getDurationSeconds()         { return durationSeconds; }
    public void setDurationSeconds(Integer v)   { this.durationSeconds = v; }
    public String getStatus()                   { return status; }
    public void setStatus(String v)             { this.status = v; }
    public String getErrorMessage()             { return errorMessage; }
    public void setErrorMessage(String v)       { this.errorMessage = v; }
}
