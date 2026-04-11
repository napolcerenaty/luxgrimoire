package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.DeletionLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DeletionLogRepository extends JpaRepository<DeletionLog, String> {

    Page<DeletionLog> findAllByOrderByPerformedAtDesc(Pageable pageable);

    Page<DeletionLog> findByEntityTypeOrderByPerformedAtDesc(String entityType, Pageable pageable);
}
