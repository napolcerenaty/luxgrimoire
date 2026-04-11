package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.ErrorReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ErrorReportRepository extends JpaRepository<ErrorReport, String> {
    Page<ErrorReport> findAllByOrderByCreatedAtDesc(Pageable pageable);
    Page<ErrorReport> findByStatusOrderByCreatedAtDesc(String status, Pageable pageable);
}
