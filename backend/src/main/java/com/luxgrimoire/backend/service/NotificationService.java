package com.luxgrimoire.backend.service;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.Notification;
import com.luxgrimoire.backend.model.UserNotification;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.NotificationRepository;
import com.luxgrimoire.backend.repository.UserNotificationRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
public class NotificationService {

    private final NotificationRepository notificationRepository;
    private final UserNotificationRepository userNotificationRepository;
    private final AppUserRepository userRepository;

    public NotificationService(NotificationRepository notificationRepository,
                               UserNotificationRepository userNotificationRepository,
                               AppUserRepository userRepository) {
        this.notificationRepository = notificationRepository;
        this.userNotificationRepository = userNotificationRepository;
        this.userRepository = userRepository;
    }

    @Transactional
    public Notification send(String title, String message, String type, List<String> targetRoles, String createdBy) {
        Notification n = new Notification();
        n.setTitle(title);
        n.setMessage(message);
        n.setType(type);
        n.setTargetRoles(String.join(",", targetRoles));
        n.setCreatedAt(LocalDateTime.now());
        n.setCreatedBy(createdBy);
        n = notificationRepository.save(n);

        List<AppUser> users = userRepository.findAll();
        for (AppUser user : users) {
            if (targetRoles.contains(user.getRole())) {
                UserNotification un = new UserNotification();
                un.setNotification(n);
                un.setUserUsername(user.getUsername());
                un.setReadAt(null);
                userNotificationRepository.save(un);
            }
        }
        return n;
    }

    @Transactional(readOnly = true)
    public List<UserNotification> getForUser(String username) {
        return userNotificationRepository.findByUserUsernameOrderByNotification_CreatedAtDesc(username);
    }

    @Transactional
    public void markRead(Long notifId, String username) {
        userNotificationRepository.findByNotificationIdAndUserUsername(notifId, username)
            .ifPresent(un -> {
                if (un.getReadAt() == null) {
                    un.setReadAt(LocalDateTime.now());
                    userNotificationRepository.save(un);
                }
            });
    }

    @Transactional
    public void markAllRead(String username) {
        List<UserNotification> unread = userNotificationRepository.findByUserUsernameAndReadAtIsNull(username);
        LocalDateTime now = LocalDateTime.now();
        unread.forEach(un -> un.setReadAt(now));
        userNotificationRepository.saveAll(unread);
    }

    @Transactional(readOnly = true)
    public long unreadCount(String username) {
        return userNotificationRepository.countByUserUsernameAndReadAtIsNull(username);
    }

    @Transactional(readOnly = true)
    public List<Notification> getAllAdmin() {
        return notificationRepository.findAllByOrderByCreatedAtDesc();
    }
}
