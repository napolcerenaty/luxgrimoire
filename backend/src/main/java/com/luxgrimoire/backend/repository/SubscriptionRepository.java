package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.Subscription;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    List<Subscription> findByCompanyId(String companyId);
}
