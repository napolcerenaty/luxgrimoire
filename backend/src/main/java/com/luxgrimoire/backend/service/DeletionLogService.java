package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.DeletionLog;
import com.luxgrimoire.backend.repository.DeletionLogRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Records every destructive deletion that happens in the application.
 * Call {@link #log} from any controller / service that performs a delete.
 */
@Service
public class DeletionLogService {

    private final DeletionLogRepository repo;

    public DeletionLogService(DeletionLogRepository repo) {
        this.repo = repo;
    }

    @Transactional
    public void log(String performedByUsername, String entityType, String entityId, String description) {
        DeletionLog entry = new DeletionLog();
        entry.setPerformedByUsername(performedByUsername);
        entry.setEntityType(entityType);
        entry.setEntityId(entityId);
        entry.setDescription(description);
        repo.save(entry);
    }
}
