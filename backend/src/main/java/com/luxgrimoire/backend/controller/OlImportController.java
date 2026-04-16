package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.service.OlImportService;
import com.luxgrimoire.backend.service.AdminAuditLogService;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/admin/ol-import")
public class OlImportController {

    private final OlImportService olImportService;
    private final AdminAuditLogService auditLogService;

    public OlImportController(OlImportService olImportService, AdminAuditLogService auditLogService) {
        this.olImportService = olImportService;
        this.auditLogService = auditLogService;
    }

    @GetMapping("/status")
    public ResponseEntity<?> getStatus(HttpSession session) {
        if (!isAdmin(session)) return forbidden();
        return ResponseEntity.ok(olImportService.getStatus());
    }

    @PostMapping("/trigger")
    public ResponseEntity<?> trigger(@RequestBody(required = false) Map<String, String> body,
                                     HttpSession session) {
        if (!isAdmin(session)) return forbidden();
        String mode = (body != null && "init".equals(body.get("mode"))) ? "init" : "diff";
        boolean started = olImportService.trigger(mode);
        if (!started) {
            return ResponseEntity.status(409)
                    .body(Map.of("error", "Import is already running"));
        }
        String username = (String) session.getAttribute("username");
        if (username == null) username = "unknown";
        auditLogService.log(username, "TRIGGER", "OlImport", null,
                "Triggered OL import, mode=" + mode);
        return ResponseEntity.ok(Map.of("message", "Import started in background", "mode", mode));
    }

    private boolean isAdmin(HttpSession session) {
        Object role = session.getAttribute(AppConstants.SESSION_ROLE);
        return AppConstants.ROLE_ADMIN.equals(role);
    }

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(403).body(Map.of("error", "Forbidden"));
    }
}
