package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AdminAuditLog;
import com.luxgrimoire.backend.repository.AdminAuditLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records every significant admin action (create, update, delete, trigger, etc.)
 * so administrators can review who did what and when.
 */
@Service
public class AdminAuditLogService {

    private final AdminAuditLogRepository repo;

    public AdminAuditLogService(AdminAuditLogRepository repo) {
        this.repo = repo;
    }

    /**
     * @param performedBy  username of the admin who performed the action
     * @param action       one of: CREATE, UPDATE, DELETE, TRIGGER, UPLOAD, EMAIL
     * @param entityType   e.g. Company, Subscription, SubscriptionMonth, OlImport, …
     * @param entityId     optional – the ID of the affected entity
     * @param description  human-readable summary
     */
    @Transactional
    public void log(String performedBy, String action,
                    String entityType, String entityId, String description) {
        AdminAuditLog entry = new AdminAuditLog();
        entry.setPerformedByUsername(performedBy != null ? performedBy : "unknown");
        entry.setAction(action);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setDescription(description);
        repo.save(entry);
    }
}
