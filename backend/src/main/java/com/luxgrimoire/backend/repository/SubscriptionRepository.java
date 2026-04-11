package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.Subscription;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SubscriptionRepository extends JpaRepository<Subscription, String> {
    List<Subscription> findByCompanyId(String companyId);

    @Query("SELECT s FROM Subscription s LEFT JOIN FETCH s.company WHERE LOWER(s.name) LIKE :q")
    List<Subscription> searchByNamePattern(@Param("q") String pattern);

    @Query("SELECT s FROM Subscription s LEFT JOIN FETCH s.company WHERE LOWER(s.name) LIKE :q")
    List<Subscription> searchByNamePattern(@Param("q") String pattern, Pageable pageable);
}
