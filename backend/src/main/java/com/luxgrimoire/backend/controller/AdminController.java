package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.model.DataRequest;
import com.luxgrimoire.backend.model.ErrorReport;
import com.luxgrimoire.backend.model.Subscription;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.DataRequestRepository;
import com.luxgrimoire.backend.repository.DeletionLogRepository;
import com.luxgrimoire.backend.repository.ErrorReportRepository;
import com.luxgrimoire.backend.repository.SubscriptionRepository;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AppUserRepository        userRepo;
    private final ErrorReportRepository    reportRepo;
    private final DataRequestRepository    dataRequestRepo;
    private final BookBoxCompanyStore      companyStore;
    private final SubscriptionRepository   subscriptionRepo;
    private final DeletionLogRepository    deletionLogRepo;
    private final DeletionLogService       deletionLogService;

    public AdminController(AppUserRepository userRepo,
                           ErrorReportRepository reportRepo,
                           DataRequestRepository dataRequestRepo,
                           BookBoxCompanyStore companyStore,
                           SubscriptionRepository subscriptionRepo,
                           DeletionLogRepository deletionLogRepo,
                           DeletionLogService deletionLogService) {
        this.userRepo           = userRepo;
        this.reportRepo         = reportRepo;
        this.dataRequestRepo    = dataRequestRepo;
        this.companyStore       = companyStore;
        this.subscriptionRepo   = subscriptionRepo;
        this.deletionLogRepo    = deletionLogRepo;
        this.deletionLogService = deletionLogService;
    }

    // ── Guard helpers ─────────────────────────────────────────────────────────

    private ResponseEntity<?> forbidden()     { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden")); }
    private ResponseEntity<?> unauthorized()  { return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated")); }
    private ResponseEntity<Object> notFound()      { return ResponseEntity.notFound().build(); }

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

    // ── Companies ─────────────────────────────────────────────────────────────

    @GetMapping("/companies")
    public ResponseEntity<?> getCompanies(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(companyStore.findAll());
    }

    @GetMapping("/companies/{id}")
    public ResponseEntity<?> getCompany(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return companyStore.findById(id)
                .map(c -> ResponseEntity.ok((Object) c))
                .orElse(notFound());
    }

    @PostMapping("/companies")
    @Transactional
    public ResponseEntity<?> createCompany(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String name = (String) body.get("name");
        if (name == null || name.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "name is required"));

        BookBoxCompany company = new BookBoxCompany();
        company.setId(UUID.randomUUID().toString());
        company.setName(name.trim());
        company.setLogoUrl((String) body.get("logoUrl"));
        company.setWebsiteUrl((String) body.get("websiteUrl"));
        company.setDescription((String) body.get("description"));
        company.setLocation((String) body.get("location"));
        company.setDefaultCurrency((String) body.get("defaultCurrency"));

        String username = AuthHelper.getUsername(session);
        if (username != null) company.getManagerUsernames().add(username);

        return ResponseEntity.status(HttpStatus.CREATED).body(companyStore.save(company));
    }

    @PutMapping("/companies/{id}")
    @Transactional
    public ResponseEntity<?> updateCompany(@PathVariable String id,
                                           @RequestBody Map<String, Object> body,
                                           HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return companyStore.updateMetadata(id,
                (String) body.get("name"),
                (String) body.get("logoUrl"),
                (String) body.get("websiteUrl"),
                (String) body.get("description"),
                (String) body.get("location"),
                (String) body.get("defaultCurrency"))
                .map(c -> ResponseEntity.ok((Object) c))
                .orElse(notFound());
    }

    @DeleteMapping("/companies/{id}")
    @Transactional
    public ResponseEntity<?> deleteCompany(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return companyStore.findById(id).map(company -> {
            deletionLogService.log(
                    AuthHelper.getUsername(session), "BookBoxCompany", id,
                    "Deleted company: \"" + company.getName() + "\"");
            companyStore.delete(id);
            return ResponseEntity.noContent().<Void>build();
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Subscriptions (admin) ─────────────────────────────────────────────────

    @PostMapping("/companies/{id}/subscriptions")
    @Transactional
    public ResponseEntity<?> addSubscription(@PathVariable String id,
                                             @RequestBody Map<String, Object> body,
                                             HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        if (companyStore.findById(id).isEmpty()) return notFound();

        Subscription sub = new Subscription();
        sub.setName((String) body.get("name"));
        sub.setType((String) body.get("type"));
        sub.setLogoUrl((String) body.get("logoUrl"));

        Object basePrice = body.get("basePrice");
        if (basePrice != null) {
            try { sub.setBasePrice(new BigDecimal(basePrice.toString())); } catch (NumberFormatException ignored) {}
        }
        Object shipsIntl = body.get("shipsInternationally");
        if (shipsIntl instanceof Boolean b) sub.setShipsInternationally(b);

        Object bookishMerch = body.get("bookishMerch");
        if (bookishMerch instanceof Boolean b) sub.setBookishMerch(b);

        @SuppressWarnings("unchecked")
        List<String> genres = (List<String>) body.get("genres");
        if (genres != null) sub.setGenres(genres);

        @SuppressWarnings("unchecked")
        List<String> countries = (List<String>) body.get("shippingCountries");
        if (countries != null) sub.setShippingCountries(countries);

        Subscription saved = companyStore.addSubscription(id, sub);
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/companies/{companyId}/subscriptions/{subId}")
    @Transactional
    public ResponseEntity<?> deleteSubscription(@PathVariable String companyId,
                                                @PathVariable String subId,
                                                HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return subscriptionRepo.findById(subId).map(sub -> {
            deletionLogService.log(
                    AuthHelper.getUsername(session), "Subscription", subId,
                    "Deleted subscription: \"" + sub.getName()
                            + "\" (companyId=" + companyId + ")");
            companyStore.deleteSubscription(subId);
            return ResponseEntity.noContent().<Void>build();
        }).orElse(ResponseEntity.notFound().build());
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
    public ResponseEntity<?> submitReport(@RequestBody Map<String, String> body, HttpSession session) {
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
    public ResponseEntity<?> updateReportStatus(@PathVariable String id,
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
    public ResponseEntity<?> submitDataRequest(@RequestBody Map<String, String> body, HttpSession session) {
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
    public ResponseEntity<?> updateDataRequestStatus(@PathVariable String id,
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

    // ── Deletion Logs ─────────────────────────────────────────────────────────

    @GetMapping("/deletion-logs")
    public ResponseEntity<?> getDeletionLogs(
            @RequestParam(defaultValue = "0")   int page,
            @RequestParam(defaultValue = "50")  int size,
            @RequestParam(required = false)     String entityType,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        Pageable pageable = PageRequest.of(page, Math.min(size, 200));
        var result = (entityType != null && !entityType.isBlank())
                ? deletionLogRepo.findByEntityTypeOrderByPerformedAtDesc(entityType, pageable)
                : deletionLogRepo.findAllByOrderByPerformedAtDesc(pageable);

        return ResponseEntity.ok(Map.of(
                "content",       result.getContent(),
                "page",          result.getNumber(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages()
        ));
    }
}
