package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.AppLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface AppLogRepository extends JpaRepository<AppLog, String> {

    Page<AppLog> findAllByOrderByCreatedAtDesc(Pageable pageable);

    Page<AppLog> findByLevelOrderByCreatedAtDesc(String level, Pageable pageable);

    Page<AppLog> findBySourceOrderByCreatedAtDesc(String source, Pageable pageable);

    Page<AppLog> findByLevelAndSourceOrderByCreatedAtDesc(String level, String source, Pageable pageable);

    @Transactional
    @Modifying
    @Query("DELETE FROM AppLog a WHERE a.createdAt < :cutoff")
    int deleteOlderThan(@org.springframework.data.repository.query.Param("cutoff") java.time.Instant cutoff);
}
