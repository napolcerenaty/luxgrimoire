package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.ExchangeRateCache;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface ExchangeRateCacheRepository
        extends JpaRepository<ExchangeRateCache, ExchangeRateCache.CacheId> {

    @Query("SELECT e FROM ExchangeRateCache e WHERE e.fromCurrency = 'EUR'")
    List<ExchangeRateCache> findAllEurBased();
}
