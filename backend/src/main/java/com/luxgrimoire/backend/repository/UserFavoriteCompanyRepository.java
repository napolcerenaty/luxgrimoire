package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserFavoriteCompany;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserFavoriteCompanyRepository extends JpaRepository<UserFavoriteCompany, String> {
    List<UserFavoriteCompany> findByUsernameOrderByAddedAtDesc(String username);
    Optional<UserFavoriteCompany> findByUsernameAndCompanyId(String username, String companyId);
    boolean existsByUsernameAndCompanyId(String username, String companyId);
    void deleteByUsernameAndCompanyId(String username, String companyId);
    long countByCompanyId(String companyId);
    List<UserFavoriteCompany> findByCompanyIdAndNotifyTrue(String companyId);
}
