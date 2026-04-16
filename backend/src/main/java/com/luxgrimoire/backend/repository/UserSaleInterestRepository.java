package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserSaleInterest;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserSaleInterestRepository extends JpaRepository<UserSaleInterest, String> {
    Optional<UserSaleInterest> findByUsernameAndSaleId(String username, String saleId);
    List<UserSaleInterest> findByUsernameAndStatus(String username, String status);
    List<UserSaleInterest> findByUsername(String username);
}
