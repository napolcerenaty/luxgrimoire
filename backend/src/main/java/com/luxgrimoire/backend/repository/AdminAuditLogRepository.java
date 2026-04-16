package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.AdminAuditLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AdminAuditLogRepository extends JpaRepository<AdminAuditLog, String> {

    Page<AdminAuditLog> findAllByOrderByPerformedAtDesc(Pageable pageable);

    @Query("""
        SELECT a FROM AdminAuditLog a
        WHERE (:action IS NULL OR a.action = :action)
          AND (:entityType IS NULL OR a.entityType = :entityType)
          AND (:username IS NULL OR a.performedByUsername = :username)
        ORDER BY a.performedAt DESC
        """)
    Page<AdminAuditLog> findFiltered(
            @Param("action")     String action,
            @Param("entityType") String entityType,
            @Param("username")   String username,
            Pageable pageable);
}
