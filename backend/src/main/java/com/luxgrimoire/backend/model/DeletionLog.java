package com.luxgrimoire.backend.model;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deletion_log", indexes = {
    @Index(name = "idx_deletion_log_at",          columnList = "performed_at"),
    @Index(name = "idx_deletion_log_user",         columnList = "performed_by_username"),
    @Index(name = "idx_deletion_log_entity_type",  columnList = "entity_type")
})
public class DeletionLog {

    @Id
    private String id;

    @Column(name = "performed_at", nullable = false)
    private Instant performedAt;

    @Column(name = "performed_by_username")
    private String performedByUsername;

    @Column(name = "entity_type", nullable = false)
    private String entityType;

    @Column(name = "entity_id")
    private String entityId;

    @Column(columnDefinition = "TEXT")
    private String description;

    public DeletionLog() {
        this.id = UUID.randomUUID().toString();
        this.performedAt = Instant.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Instant getPerformedAt() { return performedAt; }
    public void setPerformedAt(Instant performedAt) { this.performedAt = performedAt; }
    public String getPerformedByUsername() { return performedByUsername; }
    public void setPerformedByUsername(String v) { this.performedByUsername = v; }
    public String getEntityType() { return entityType; }
    public void setEntityType(String entityType) { this.entityType = entityType; }
    public String getEntityId() { return entityId; }
    public void setEntityId(String entityId) { this.entityId = entityId; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
