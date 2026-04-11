package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.DataRequest;
import com.luxgrimoire.backend.model.ErrorReport;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.DataRequestRepository;
import com.luxgrimoire.backend.repository.ErrorReportRepository;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AppUserRepository userRepo;
    private final ErrorReportRepository reportRepo;
    private final DataRequestRepository dataRequestRepo;
    private final BookBoxCompanyStore companyStore;

    public AdminController(AppUserRepository userRepo,
                           ErrorReportRepository reportRepo,
                           DataRequestRepository dataRequestRepo,
                           BookBoxCompanyStore companyStore) {
        this.userRepo = userRepo;
        this.reportRepo = reportRepo;
        this.dataRequestRepo = dataRequestRepo;
        this.companyStore = companyStore;
    }

    // ── Guard helper ──────────────────────────────────────────────────────────

    private ResponseEntity<?> forbidden() {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden"));
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }

    // ── Users ─────────────────────────────────────────────────────────────────

    @GetMapping("/users")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getUsers(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false)    String email,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        Page<AppUser> result = (email != null && !email.isBlank())
                ? userRepo.findByEmailContainingIgnoreCase(email.trim(), pageable)
                : userRepo.findAll(pageable);

        List<Map<String, Object>> content = result.getContent().stream()
                .map(u -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("username",  u.getUsername());
                    m.put("firstName", u.getFirstName());
                    m.put("lastName",  u.getLastName());
                    m.put("email",     u.getEmail());
                    m.put("role",      u.getRole());
                    m.put("avatarUrl", u.getAvatarUrl());
                    return m;
                })
                .toList();

        return ResponseEntity.ok(Map.of(
                "content",       content,
                "page",          result.getNumber(),
                "size",          result.getSize(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages(),
                "last",          result.isLast()
        ));
    }

    // ── Companies (proxy to existing store) ──────────────────────────────────

    @GetMapping("/companies")
    public ResponseEntity<?> getCompanies(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(companyStore.findAll());
    }

    // ── Error Reports ─────────────────────────────────────────────────────────

    @GetMapping("/reports")
    public ResponseEntity<?> getReports(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false)    String status,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        Page<ErrorReport> result = (status != null && !status.isBlank())
                ? reportRepo.findByStatusOrderByCreatedAtDesc(status, pageable)
                : reportRepo.findAllByOrderByCreatedAtDesc(pageable);

        return ResponseEntity.ok(Map.of(
                "content",       result.getContent(),
                "page",          result.getNumber(),
                "size",          result.getSize(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages(),
                "last",          result.isLast()
        ));
    }

    @PostMapping("/reports")
    public ResponseEntity<?> submitReport(
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();

        String title = body.get("title");
        if (title == null || title.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));

        ErrorReport report = new ErrorReport();
        report.setReporterUsername(AuthHelper.getUsername(session));
        report.setTitle(title.trim());
        report.setDescription(body.getOrDefault("description", ""));
        report.setCategory(body.getOrDefault("category", "other"));
        return ResponseEntity.status(HttpStatus.CREATED).body(reportRepo.save(report));
    }

    @PutMapping("/reports/{id}/status")
    public ResponseEntity<?> updateReportStatus(
            @PathVariable String id,
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return reportRepo.findById(id).map(report -> {
            if (body.containsKey("status"))    report.setStatus(body.get("status"));
            if (body.containsKey("adminNote")) report.setAdminNote(body.get("adminNote"));
            return ResponseEntity.ok(reportRepo.save(report));
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Data Requests ─────────────────────────────────────────────────────────

    @GetMapping("/data-requests")
    public ResponseEntity<?> getDataRequests(
            @RequestParam(defaultValue = "0")  int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false)    String status,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        Pageable pageable = PageRequest.of(page, Math.min(size, 100));
        Page<DataRequest> result = (status != null && !status.isBlank())
                ? dataRequestRepo.findByStatusOrderByCreatedAtDesc(status, pageable)
                : dataRequestRepo.findAllByOrderByCreatedAtDesc(pageable);

        return ResponseEntity.ok(Map.of(
                "content",       result.getContent(),
                "page",          result.getNumber(),
                "size",          result.getSize(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages(),
                "last",          result.isLast()
        ));
    }

    @PostMapping("/data-requests")
    public ResponseEntity<?> submitDataRequest(
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();

        String type = body.get("type");
        if (type == null || type.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "type is required"));

        DataRequest req = new DataRequest();
        req.setRequesterUsername(AuthHelper.getUsername(session));
        req.setType(type.trim());
        req.setDescription(body.getOrDefault("description", ""));
        return ResponseEntity.status(HttpStatus.CREATED).body(dataRequestRepo.save(req));
    }

    @PutMapping("/data-requests/{id}/status")
    public ResponseEntity<?> updateDataRequestStatus(
            @PathVariable String id,
            @RequestBody Map<String, String> body,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return dataRequestRepo.findById(id).map(req -> {
            if (body.containsKey("status"))    req.setStatus(body.get("status"));
            if (body.containsKey("adminNote")) req.setAdminNote(body.get("adminNote"));
            return ResponseEntity.ok(dataRequestRepo.save(req));
        }).orElse(ResponseEntity.notFound().build());
    }
}
