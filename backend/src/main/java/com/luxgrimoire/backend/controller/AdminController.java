package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.AdminNotificationDto;
import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.model.DataRequest;
import com.luxgrimoire.backend.model.ErrorReport;
import com.luxgrimoire.backend.model.Notification;
import com.luxgrimoire.backend.model.Subscription;
import com.luxgrimoire.backend.model.SubscriptionPrepayOption;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.DataRequestRepository;
import com.luxgrimoire.backend.repository.DeletionLogRepository;
import com.luxgrimoire.backend.repository.ErrorReportRepository;
import com.luxgrimoire.backend.repository.SubscriptionRepository;
import com.luxgrimoire.backend.repository.SubscriptionPrepayOptionRepository;
import com.luxgrimoire.backend.repository.UserNotificationRepository;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.service.NotificationService;
import org.springframework.web.multipart.MultipartFile;
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
import java.util.ArrayList;
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
    private final SubscriptionPrepayOptionRepository prepayOptionRepo;
    private final DeletionLogRepository    deletionLogRepo;
    private final DeletionLogService       deletionLogService;
    private final FileStorageService       fileStorageService;
    private final NotificationService      notificationService;
    private final UserNotificationRepository userNotificationRepo;
    private final com.luxgrimoire.backend.service.AppSettingService appSettingService;

    public AdminController(AppUserRepository userRepo,
                           ErrorReportRepository reportRepo,
                           DataRequestRepository dataRequestRepo,
                           BookBoxCompanyStore companyStore,
                           SubscriptionRepository subscriptionRepo,
                           SubscriptionPrepayOptionRepository prepayOptionRepo,
                           DeletionLogRepository deletionLogRepo,
                           DeletionLogService deletionLogService,
                           FileStorageService fileStorageService,
                           NotificationService notificationService,
                           UserNotificationRepository userNotificationRepo,
                           com.luxgrimoire.backend.service.AppSettingService appSettingService) {
        this.userRepo              = userRepo;
        this.reportRepo            = reportRepo;
        this.dataRequestRepo       = dataRequestRepo;
        this.companyStore          = companyStore;
        this.subscriptionRepo      = subscriptionRepo;
        this.prepayOptionRepo      = prepayOptionRepo;
        this.deletionLogRepo       = deletionLogRepo;
        this.deletionLogService    = deletionLogService;
        this.fileStorageService    = fileStorageService;
        this.notificationService   = notificationService;
        this.userNotificationRepo  = userNotificationRepo;
        this.appSettingService     = appSettingService;
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

    @GetMapping("/subscription-genres")
    @Transactional(readOnly = true)
    public ResponseEntity<?> getAllGenres(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(subscriptionRepo.findAllDistinctGenres());
    }

    @GetMapping("/companies/{id}/subscriptions")
    @Transactional(readOnly = true)
    public ResponseEntity<?> listCompanySubscriptions(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return companyStore.findById(id)
                .map(c -> ResponseEntity.ok((Object) c.getSubscriptions()))
                .orElse(notFound());
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

    // ─── applySubBody ─────────────────────────────────────────────────────────

    private void applySubBody(Subscription sub, Map<String, Object> body) {
        if (body.containsKey("name"))        sub.setName((String) body.get("name"));
        if (body.containsKey("type"))        sub.setType((String) body.get("type"));
        if (body.containsKey("logoUrl"))     sub.setLogoUrl((String) body.get("logoUrl"));
        Object basePrice = body.get("basePrice");
        if (basePrice != null) {
            try { sub.setBasePrice(new java.math.BigDecimal(basePrice.toString())); } catch (NumberFormatException ignored) {}
        }
        if (body.get("shipsInternationally") instanceof Boolean b) sub.setShipsInternationally(b);
        if (body.get("bookishMerch") instanceof Boolean b)         sub.setBookishMerch(b);
        @SuppressWarnings("unchecked") List<String> genres    = (List<String>) body.get("genres");
        if (genres    != null) sub.setGenres(genres);
        @SuppressWarnings("unchecked") List<String> countries = (List<String>) body.get("shippingCountries");
        if (countries != null) sub.setShippingCountries(countries);
        // skip policy
        if (body.containsKey("skipPolicyType"))     sub.setSkipPolicyType((String) body.get("skipPolicyType"));
        if (body.containsKey("skipResetType"))      sub.setSkipResetType((String) body.get("skipResetType"));
        if (body.containsKey("skipResetDate"))      sub.setSkipResetDate((String) body.get("skipResetDate"));
        if (body.containsKey("description"))        sub.setDescription((String) body.get("description"));
        Object skipCount = body.get("skipCount");
        if (skipCount != null) { try { sub.setSkipCount(Integer.valueOf(skipCount.toString())); } catch (NumberFormatException ignored) {} }
        Object maxConsec = body.get("maxConsecutiveSkips");
        if (maxConsec != null) { try { sub.setMaxConsecutiveSkips(Integer.valueOf(maxConsec.toString())); } catch (NumberFormatException ignored) {} }
        if (body.containsKey("skipPolicyNotes"))    sub.setSkipPolicyNotes((String) body.get("skipPolicyNotes"));
        // combo
        if (body.get("isCombo") instanceof Boolean b) sub.setCombo(b);
        if (body.get("renewalDayUserSet") instanceof Boolean b) sub.setRenewalDayUserSet(b);
        Object renewalDay = body.get("renewalDay");
        if (renewalDay != null) {
            try { sub.setRenewalDay(Integer.valueOf(renewalDay.toString())); } catch (NumberFormatException ignored) {}
        }
        @SuppressWarnings("unchecked") List<String> componentIds = (List<String>) body.get("comboComponentIds");
        if (componentIds != null) {
            List<com.luxgrimoire.backend.model.Subscription> components = componentIds.stream()
                    .map(subscriptionRepo::findById)
                    .filter(java.util.Optional::isPresent)
                    .map(java.util.Optional::get)
                    .filter(s -> !s.isCombo())
                    .toList();
            sub.setComboComponents(new java.util.ArrayList<>(components));
        }
        // prepay options
        @SuppressWarnings("unchecked") List<Map<String, Object>> prepayList =
                (List<Map<String, Object>>) body.get("prepayOptions");
        if (prepayList != null) {
            sub.getPrepayOptions().clear();
            for (Map<String, Object> opt : prepayList) {
                SubscriptionPrepayOption option = new SubscriptionPrepayOption();
                option.setSubscription(sub);
                if (opt.get("months") != null) {
                    try { option.setMonths(Integer.parseInt(opt.get("months").toString())); } catch (NumberFormatException ignored) {}
                }
                if (opt.get("price") != null) {
                    try { option.setPrice(new java.math.BigDecimal(opt.get("price").toString())); } catch (NumberFormatException ignored) {}
                }
                if (opt.get("label") instanceof String lbl) option.setLabel(lbl);
                sub.getPrepayOptions().add(option);
            }
        }
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
        applySubBody(sub, body);

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

    @PutMapping("/companies/{companyId}/subscriptions/{subId}")
    @Transactional
    public ResponseEntity<?> updateSubscription(@PathVariable String companyId,
                                                @PathVariable String subId,
                                                @RequestBody Map<String, Object> body,
                                                HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return subscriptionRepo.findById(subId).map(sub -> {
            applySubBody(sub, body);
            return ResponseEntity.ok((Object) subscriptionRepo.save(sub));
        }).orElse(notFound());
    }

    @PostMapping(value = "/companies/{id}/logo", consumes = "multipart/form-data")
    @Transactional
    public ResponseEntity<?> uploadCompanyLogo(@PathVariable String id,
                                               @RequestParam("file") MultipartFile file,
                                               HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return companyStore.findById(id).map(company -> {
            try {
                String url = fileStorageService.storeLogo("companies", id, file);
                company.setLogoUrl(url);
                companyStore.save(company);
                return ResponseEntity.ok((Object) Map.of("logoUrl", url));
            } catch (java.io.IOException e) {
                return ResponseEntity.status(500).<Object>body(Map.of("error", "Upload failed"));
            }
        }).orElse(notFound());
    }

    @PostMapping(value = "/companies/{companyId}/subscriptions/{subId}/logo", consumes = "multipart/form-data")
    @Transactional
    public ResponseEntity<?> uploadSubscriptionLogo(@PathVariable String companyId,
                                                    @PathVariable String subId,
                                                    @RequestParam("file") MultipartFile file,
                                                    HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return subscriptionRepo.findById(subId).map(sub -> {
            try {
                String url = fileStorageService.storeLogo("subscriptions", subId, file);
                sub.setLogoUrl(url);
                subscriptionRepo.save(sub);
                return ResponseEntity.ok((Object) Map.of("logoUrl", url));
            } catch (java.io.IOException e) {
                return ResponseEntity.status(500).<Object>body(Map.of("error", "Upload failed"));
            }
        }).orElse(notFound());
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
    // ── Notifications ─────────────────────────────────────────────────────────

    @PostMapping("/notifications")
    public ResponseEntity<?> sendNotification(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String title = (String) body.get("title");
        String message = (String) body.get("message");
        String type = (String) body.getOrDefault("type", "INFO");
        @SuppressWarnings("unchecked")
        List<String> targetRoles = (List<String>) body.getOrDefault("targetRoles", List.of("user"));

        if (title == null || title.isBlank() || message == null || message.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "title and message are required"));
        }

        String createdBy = AuthHelper.getUsername(session);
        Notification n = notificationService.send(title, message, type, targetRoles, createdBy);
        return ResponseEntity.ok(n);
    }

    @GetMapping("/notifications")
    public ResponseEntity<?> getAdminNotifications(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        List<AdminNotificationDto> dtos = notificationService.getAllAdmin().stream()
                .map(n -> {
                    AdminNotificationDto dto = new AdminNotificationDto();
                    dto.setId(n.getId());
                    dto.setTitle(n.getTitle());
                    dto.setMessage(n.getMessage());
                    dto.setType(n.getType());
                    dto.setTargetRoles(n.getTargetRoles());
                    dto.setCreatedAt(n.getCreatedAt());
                    dto.setCreatedBy(n.getCreatedBy());
                    dto.setRecipientCount(userNotificationRepo.countByNotificationId(n.getId()));
                    return dto;
                })
                .toList();
        return ResponseEntity.ok(dtos);
    }

    // ── Notification retention settings ──────────────────────────────────────

    @GetMapping("/settings/notification-retention")
    public ResponseEntity<?> getNotifRetention(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        int days = appSettingService.getInt("notification.retention.days", 180);
        return ResponseEntity.ok(Map.of("days", days));
    }

    @PutMapping("/settings/notification-retention")
    public ResponseEntity<?> setNotifRetention(@RequestBody Map<String, Integer> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        int days = body.getOrDefault("days", 180);
        if (days < 7 || days > 3650)
            return ResponseEntity.badRequest().body(Map.of("error", "Retencja musi być między 7 a 3650 dni."));
        appSettingService.set("notification.retention.days", String.valueOf(days));
        return ResponseEntity.ok(Map.of("ok", true, "days", days));
    }
}