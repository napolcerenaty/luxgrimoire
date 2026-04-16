package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.dto.SubscriptionSummaryDto;
import com.luxgrimoire.backend.model.Subscription;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    List<Subscription> findByCompanyId(String companyId);
    List<Subscription> findByParentSubscriptionId(String parentId);

    @Query("SELECT s FROM Subscription s LEFT JOIN FETCH s.company WHERE LOWER(s.name) LIKE :q")
    List<Subscription> searchByNamePattern(@Param("q") String pattern);

    @Query("SELECT s FROM Subscription s LEFT JOIN FETCH s.company WHERE LOWER(s.name) LIKE :q")
    List<Subscription> searchByNamePattern(@Param("q") String pattern, Pageable pageable);

    @Query("SELECT DISTINCT g FROM Subscription s JOIN s.genres g ORDER BY g")
    List<String> findAllDistinctGenres();

    @Query(value = "SELECT g.subscription_id, g.genre FROM subscription_genre g", nativeQuery = true)
    List<Object[]> findAllSubscriptionGenreRows();

    @Query("SELECT new com.luxgrimoire.backend.dto.SubscriptionSummaryDto(" +
           "s.id, s.name, s.logoUrl, s.renewalDay, s.parentSubscriptionId, s.basePrice, s.type, c.id) " +
           "FROM Subscription s JOIN s.company c")
    List<SubscriptionSummaryDto> findAllSummaries();
}
