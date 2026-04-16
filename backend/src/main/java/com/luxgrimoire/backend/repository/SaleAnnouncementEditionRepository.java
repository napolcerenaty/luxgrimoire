package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.SaleAnnouncementEdition;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface SaleAnnouncementEditionRepository extends JpaRepository<SaleAnnouncementEdition, String> {
    List<SaleAnnouncementEdition> findBySaleIdOrderBySortOrderAsc(String saleId);

    long countBySaleId(String saleId);

    @Modifying
    @Transactional
    void deleteBySaleId(String saleId);

    List<SaleAnnouncementEdition> findByEditionId(String editionId);

    boolean existsBySaleIdAndEditionId(String saleId, String editionId);
}
