package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserBookEntry;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface UserBookEntryRepository extends JpaRepository<UserBookEntry, String> {
    List<UserBookEntry> findByUserUsername(String username);
    long countByUserUsernameAndEditionId(String username, String editionId);
    List<UserBookEntry> findByUserUsernameAndPurchaseTransactionId(String username, String purchaseTransactionId);
    Optional<UserBookEntry> findByUserUsernameAndEditionId(String username, String editionId);

    @Query("SELECT e FROM UserBookEntry e WHERE e.user.username = :username " +
           "AND e.ownershipStatus = :status")
    List<UserBookEntry> findByUsernameAndOwnershipStatus(@Param("username") String username, @Param("status") String status);

    @Query("SELECT e FROM UserBookEntry e WHERE e.user.username = :username " +
           "AND (e.flag = :flag OR (:flag = 'OWNED' AND e.flag IS NULL))")
    List<UserBookEntry> findByUsernameAndFlag(@Param("username") String username, @Param("flag") String flag);
}
