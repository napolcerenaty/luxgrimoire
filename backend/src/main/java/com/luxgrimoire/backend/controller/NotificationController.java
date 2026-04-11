package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.UserNotificationDto;
import com.luxgrimoire.backend.model.UserNotification;
import com.luxgrimoire.backend.service.NotificationService;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

    private final NotificationService notificationService;

    public NotificationController(NotificationService notificationService) {
        this.notificationService = notificationService;
    }

    @GetMapping
    public ResponseEntity<?> getForUser(HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));

        List<UserNotificationDto> dtos = notificationService.getForUser(username)
                .stream()
                .map(this::toDto)
                .toList();
        return ResponseEntity.ok(dtos);
    }

    @GetMapping("/unread-count")
    public ResponseEntity<?> unreadCount(HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.ok(Map.of("count", 0));
        return ResponseEntity.ok(Map.of("count", notificationService.unreadCount(username)));
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable Long id, HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        notificationService.markRead(id, username);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    @PostMapping("/read-all")
    public ResponseEntity<?> markAllRead(HttpSession session) {
        String username = AuthHelper.getUsername(session);
        if (username == null) return ResponseEntity.status(401).body(Map.of("error", "Not authenticated"));
        notificationService.markAllRead(username);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    private UserNotificationDto toDto(UserNotification un) {
        UserNotificationDto dto = new UserNotificationDto();
        dto.setId(un.getId());
        dto.setNotificationId(un.getNotification().getId());
        dto.setTitle(un.getNotification().getTitle());
        dto.setMessage(un.getNotification().getMessage());
        dto.setType(un.getNotification().getType());
        dto.setCreatedAt(un.getNotification().getCreatedAt());
        dto.setReadAt(un.getReadAt());
        dto.setCreatedBy(un.getNotification().getCreatedBy());
        return dto;
    }
}
