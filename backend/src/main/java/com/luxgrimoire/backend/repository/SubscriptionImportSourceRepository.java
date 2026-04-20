package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.SubscriptionImportSource;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface SubscriptionImportSourceRepository extends JpaRepository<SubscriptionImportSource, Long> {
    List<SubscriptionImportSource> findByCompanyIdAndSubscriptionId(String companyId, String subscriptionId);
    List<SubscriptionImportSource> findBySourceType(String sourceType);
    List<SubscriptionImportSource> findByEnabled(boolean enabled);
    List<SubscriptionImportSource> findAllByOrderByCompanyIdAscNameAsc();
}
