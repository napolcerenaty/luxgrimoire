package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.UserSubscriptionEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface UserSubscriptionEntryRepository extends JpaRepository<UserSubscriptionEntry, String> {
    List<UserSubscriptionEntry> findByUserUsername(String username);
    long countByUserUsernameAndSubscriptionIdAndCompanyId(String username, String subscriptionId, String companyId);
}
