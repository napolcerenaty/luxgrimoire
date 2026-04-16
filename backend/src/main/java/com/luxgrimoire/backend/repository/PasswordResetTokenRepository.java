package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, String> {

    @Modifying
    @Transactional
    @Query("DELETE FROM PasswordResetToken t WHERE t.expiresAt < :now OR t.used = true")
    void deleteExpiredAndUsed(Instant now);
}
