package com.luxgrimoire.backend.repository;
import com.luxgrimoire.backend.model.SubscriptionPrepayOption;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface SubscriptionPrepayOptionRepository extends JpaRepository<SubscriptionPrepayOption, String> {
    List<SubscriptionPrepayOption> findBySubscriptionId(String subscriptionId);
    void deleteBySubscriptionId(String subscriptionId);
}
