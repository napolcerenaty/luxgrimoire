package com.luxgrimoire.backend.repository;

import com.luxgrimoire.backend.model.UserNotification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface UserNotificationRepository extends JpaRepository<UserNotification, Long> {
    List<UserNotification> findByUserUsernameOrderByNotification_CreatedAtDesc(String username);
    Optional<UserNotification> findByNotificationIdAndUserUsername(Long notifId, String username);
    long countByUserUsernameAndReadAtIsNull(String username);
    List<UserNotification> findByUserUsernameAndReadAtIsNull(String username);
    long countByNotificationId(Long notificationId);

    List<UserNotification> findByIdInAndUserUsername(Iterable<Long> ids, String username);

    @Modifying
    @Query("DELETE FROM UserNotification un WHERE un.userUsername = :username")
    void deleteAllByUserUsernameQuery(@Param("username") String username);

    @Modifying
    @Query("DELETE FROM UserNotification un WHERE un.notification.createdAt < :cutoff")
    int deleteByNotificationCreatedAtBefore(@Param("cutoff") java.time.LocalDateTime cutoff);
}
