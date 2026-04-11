package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface UserNotificationRepository extends JpaRepository<UserNotification, Long> {
    List<UserNotification> findByUserUsernameOrderByNotification_CreatedAtDesc(String username);
    Optional<UserNotification> findByNotificationIdAndUserUsername(Long notifId, String username);
    long countByUserUsernameAndReadAtIsNull(String username);
    List<UserNotification> findByUserUsernameAndReadAtIsNull(String username);
    long countByNotificationId(Long notificationId);
}
