package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.UserSubBillingPeriod;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface UserSubBillingPeriodRepository extends JpaRepository<UserSubBillingPeriod, String> {
    List<UserSubBillingPeriod> findByEntryIdOrderByCoveredFromYearAscCoveredFromMonthAsc(String entryId);
}
