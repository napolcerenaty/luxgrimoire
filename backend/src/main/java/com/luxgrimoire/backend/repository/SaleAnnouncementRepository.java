package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.SaleAnnouncement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SaleAnnouncementRepository extends JpaRepository<SaleAnnouncement, String> {
    List<SaleAnnouncement> findByCompanyIdOrderByGeneralSaleDateAsc(String companyId);
    List<SaleAnnouncement> findByGeneralSaleDateGreaterThanEqualOrderByGeneralSaleDateAsc(String date);
}
