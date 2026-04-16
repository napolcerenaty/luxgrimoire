package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.OlImportLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OlImportLogRepository extends JpaRepository<OlImportLog, Long> {

    @Query("SELECT l FROM OlImportLog l ORDER BY l.runAt DESC LIMIT 1")
    Optional<OlImportLog> findLatest();
}
