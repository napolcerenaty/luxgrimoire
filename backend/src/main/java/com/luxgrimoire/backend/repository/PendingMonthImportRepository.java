package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.PendingMonthImport;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PendingMonthImportRepository extends JpaRepository<PendingMonthImport, Long> {
    List<PendingMonthImport> findByStatusOrderByCreatedAtDesc(String status);
    List<PendingMonthImport> findBySubscriptionIdAndStatus(String subscriptionId, String status);
}
