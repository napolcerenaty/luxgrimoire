package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_log", indexes = {
    @Index(name = "idx_app_log_created", columnList = "createdAt"),
    @Index(name = "idx_app_log_level",   columnList = "level"),
    @Index(name = "idx_app_log_source",  columnList = "source")
})
public class AppLog {

    @Id
    private String id;

    /** FRONTEND or BACKEND */
    @Column(nullable = false, length = 20)
    private String source;

    /** ERROR, WARN, INFO */
    @Column(nullable = false, length = 10)
    private String level;

    @Column(nullable = false, length = 500)
    private String message;

    @Column(length = 4000)
    private String stackTrace;

    /** URL, component name, or endpoint where the error occurred */
    @Column(length = 500)
    private String context;

    /** Username of the logged-in user, if any */
    @Column(length = 150)
    private String userId;

    @Column(nullable = false)
    private Instant createdAt;

    public AppLog() {
        this.id = UUID.randomUUID().toString();
        this.createdAt = Instant.now();
    }

    public String getId()                  { return id; }
    public String getSource()              { return source; }
    public void   setSource(String v)      { this.source = v; }
    public String getLevel()               { return level; }
    public void   setLevel(String v)       { this.level = v; }
    public String getMessage()             { return message; }
    public void   setMessage(String v)     { this.message = v; }
    public String getStackTrace()          { return stackTrace; }
    public void   setStackTrace(String v)  { this.stackTrace = v; }
    public String getContext()             { return context; }
    public void   setContext(String v)     { this.context = v; }
    public String getUserId()              { return userId; }
    public void   setUserId(String v)      { this.userId = v; }
    public Instant getCreatedAt()          { return createdAt; }
}
