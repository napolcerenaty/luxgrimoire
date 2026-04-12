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
import java.util.Optional;

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

    @Transactional
    public void sendToUser(String targetUsername, String title, String message, String type, String createdBy) {
        Optional<AppUser> userOpt = userRepository.findById(targetUsername);
        if (userOpt.isEmpty()) return;
        Notification n = new Notification();
        n.setTitle(title);
        n.setMessage(message);
        n.setType(type);
        n.setTargetRoles("user");
        n.setCreatedAt(LocalDateTime.now());
        n.setCreatedBy(createdBy);
        n = notificationRepository.save(n);
        UserNotification un = new UserNotification();
        un.setNotification(n);
        un.setUserUsername(targetUsername);
        un.setReadAt(null);
        userNotificationRepository.save(un);
    }

    @Transactional(readOnly = true)
    public List<UserNotification> getForUser(String username) {
        return userNotificationRepository.findByUserUsernameOrderByNotification_CreatedAtDesc(username);
    }

    @Transactional
    public void markRead(Long userNotifId, String username) {
        userNotificationRepository.findById(userNotifId)
            .filter(un -> un.getUserUsername().equals(username))
            .filter(un -> un.getReadAt() == null)
            .ifPresent(un -> {
                un.setReadAt(LocalDateTime.now());
                userNotificationRepository.save(un);
            });
    }

    @Transactional
    public void markAllRead(String username) {
        List<UserNotification> unread = userNotificationRepository.findByUserUsernameAndReadAtIsNull(username);
        LocalDateTime now = LocalDateTime.now();
        unread.forEach(un -> un.setReadAt(now));
        userNotificationRepository.saveAll(unread);
    }

    @Transactional
    public void markReadBatch(List<Long> ids, String username) {
        List<UserNotification> uns = userNotificationRepository.findByIdInAndUserUsername(ids, username);
        LocalDateTime now = LocalDateTime.now();
        uns.stream().filter(un -> un.getReadAt() == null).forEach(un -> un.setReadAt(now));
        userNotificationRepository.saveAll(uns);
    }

    @Transactional
    public void deleteOne(Long id, String username) {
        userNotificationRepository.findById(id)
            .filter(un -> un.getUserUsername().equals(username))
            .ifPresent(userNotificationRepository::delete);
    }

    @Transactional
    public void deleteBatch(List<Long> ids, String username) {
        List<UserNotification> uns = userNotificationRepository.findByIdInAndUserUsername(ids, username);
        userNotificationRepository.deleteAllInBatch(uns);
    }

    @Transactional
    public void deleteAllForUser(String username) {
        userNotificationRepository.deleteAllByUserUsernameQuery(username);
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
