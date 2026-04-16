package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "admin_audit_log", indexes = {
    @Index(name = "idx_audit_log_at",          columnList = "performed_at"),
    @Index(name = "idx_audit_log_user",        columnList = "performed_by_username"),
    @Index(name = "idx_audit_log_entity_type", columnList = "entity_type"),
    @Index(name = "idx_audit_log_action",      columnList = "action")
})
public class AdminAuditLog {

    @Id
    private String id;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    @Column(name = "performed_by_username", nullable = false)
    private String performedByUsername;

    /** CREATE | UPDATE | DELETE | TRIGGER | UPLOAD | EMAIL */
    @Column(nullable = false)
    private String action;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id")
    private String entityId;

    @Column(columnDefinition = "TEXT")
    private String description;

    public AdminAuditLog() {
        this.id = UUID.randomUUID().toString();
        this.performedAt = Instant.now();
    }

    public String getId()                        { return id; }
    public void   setId(String id)               { this.id = id; }
    public Instant getPerformedAt()              { return performedAt; }
    public void   setPerformedAt(Instant v)      { this.performedAt = v; }
    public String getPerformedByUsername()       { return performedByUsername; }
    public void   setPerformedByUsername(String v) { this.performedByUsername = v; }
    public String getAction()                    { return action; }
    public void   setAction(String v)            { this.action = v; }
    public String getEntityType()                { return entityType; }
    public void   setEntityType(String v)        { this.entityType = v; }
    public String getEntityId()                  { return entityId; }
    public void   setEntityId(String v)          { this.entityId = v; }
    public String getDescription()               { return description; }
    public void   setDescription(String v)       { this.description = v; }
}
