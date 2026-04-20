package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppLog;
import com.luxgrimoire.backend.repository.AppLogRepository;
import com.luxgrimoire.backend.service.AppLogService;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
public class AppLogController {

    private final AppLogService    service;
    private final AppLogRepository repo;

    public AppLogController(AppLogService service, AppLogRepository repo) {
        this.service = service;
        this.repo    = repo;
    }

    // ---------------------------------------------------------------
    // Public endpoint — receives frontend error reports
    // ---------------------------------------------------------------
    @PostMapping("/api/logs")
    public ResponseEntity<?> receiveFrontendLog(@RequestBody Map<String, Object> body,
                                                 HttpSession session) {
        String username = AuthHelper.getUsername(session);
        String level    = str(body, "level", "ERROR");
        String message  = str(body, "message", "(no message)");
        String stack    = str(body, "stackTrace", null);
        String context  = str(body, "context", null);

        service.save("FRONTEND", level, message, stack, context, username);
        return ResponseEntity.ok(Map.of("saved", true));
    }

    // ---------------------------------------------------------------
    // Admin endpoints — view / delete logs
    // ---------------------------------------------------------------
    @GetMapping("/api/admin/app-logs")
    public ResponseEntity<?> listLogs(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "50") int size,
            @RequestParam(required = false)    String level,
            @RequestParam(required = false)    String source,
            HttpSession session) {

        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        size = Math.min(size, 100);
        PageRequest pr = PageRequest.of(page, size);

        Page<AppLog> result;
        if (level != null && source != null) {
            result = repo.findByLevelAndSourceOrderByCreatedAtDesc(level.toUpperCase(), source.toUpperCase(), pr);
        } else if (level != null) {
            result = repo.findByLevelOrderByCreatedAtDesc(level.toUpperCase(), pr);
        } else if (source != null) {
            result = repo.findBySourceOrderByCreatedAtDesc(source.toUpperCase(), pr);
        } else {
            result = repo.findAllByOrderByCreatedAtDesc(pr);
        }
        return ResponseEntity.ok(Map.of(
            "items",      result.getContent(),
            "totalPages", result.getTotalPages(),
            "totalItems", result.getTotalElements(),
            "page",       result.getNumber()
        ));
    }

    @DeleteMapping("/api/admin/app-logs/{id}")
    public ResponseEntity<?> deleteLog(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        if (!repo.existsById(id)) return ResponseEntity.notFound().build();
        repo.deleteById(id);
        return ResponseEntity.ok(Map.of("deleted", true));
    }

    @DeleteMapping("/api/admin/app-logs")
    public ResponseEntity<?> clearAll(HttpSession session) {
        if (!AuthHelper.isAdmin(session)) return ResponseEntity.status(403).build();
        repo.deleteAll();
        return ResponseEntity.ok(Map.of("cleared", true));
    }

    private static String str(Map<String, Object> body, String key, String fallback) {
        Object v = body.get(key);
        return v instanceof String s && !s.isBlank() ? s : fallback;
    }
}
