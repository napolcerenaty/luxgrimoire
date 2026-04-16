package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.PurchaseTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PurchaseTransactionRepository extends JpaRepository<PurchaseTransaction, String> {
    List<PurchaseTransaction> findByUsernameOrderByPurchaseDateDesc(String username);
}
