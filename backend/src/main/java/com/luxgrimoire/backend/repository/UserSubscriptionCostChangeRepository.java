package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserSubscriptionCostChange;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface UserSubscriptionCostChangeRepository extends JpaRepository<UserSubscriptionCostChange, String> {
    List<UserSubscriptionCostChange> findByEntryIdOrderByEffectiveFromYearAscEffectiveFromMonthAsc(String entryId);
}
