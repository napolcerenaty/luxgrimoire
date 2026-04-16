package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.dto.AdminNotificationDto;
import com.luxgrimoire.backend.model.BookBoxCompany;
import com.luxgrimoire.backend.model.DataRequest;
import com.luxgrimoire.backend.model.ErrorReport;
import com.luxgrimoire.backend.model.Notification;
import com.luxgrimoire.backend.model.Subscription;
import com.luxgrimoire.backend.model.SubscriptionMonth;
import com.luxgrimoire.backend.model.SubscriptionMonthBook;
import com.luxgrimoire.backend.model.SubscriptionPrepayOption;
import com.luxgrimoire.backend.repository.AdminAuditLogRepository;
import com.luxgrimoire.backend.repository.AppUserRepository;
import com.luxgrimoire.backend.repository.BookEditionRepository;
import com.luxgrimoire.backend.repository.DataRequestRepository;
import com.luxgrimoire.backend.repository.DeletionLogRepository;
import com.luxgrimoire.backend.repository.ErrorReportRepository;
import com.luxgrimoire.backend.repository.SubscriptionMonthRepository;
import com.luxgrimoire.backend.repository.SubscriptionMonthBookRepository;
import com.luxgrimoire.backend.repository.SubscriptionRepository;
import com.luxgrimoire.backend.repository.SubscriptionPrepayOptionRepository;
import com.luxgrimoire.backend.repository.UserNotificationRepository;
import com.luxgrimoire.backend.service.AdminAuditLogService;
import com.luxgrimoire.backend.service.BookBoxCompanyStore;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.EmailService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.service.FavoriteNotificationService;
import com.luxgrimoire.backend.service.NotificationService;
import org.springframework.web.multipart.MultipartFile;
import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.util.AuthHelper;
import com.luxgrimoire.backend.util.AppConstants;
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
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
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
    private final EmailService             emailService;
    private final SubscriptionMonthRepository monthRepo;
    private final SubscriptionMonthBookRepository monthBookRepo;
    private final BookEditionRepository    bookEditionRepo;
    private final FavoriteNotificationService favoriteNotificationService;
    private final AdminAuditLogService     auditLogService;
    private final com.luxgrimoire.backend.repository.AdminAuditLogRepository auditLogRepo;

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
                           com.luxgrimoire.backend.service.AppSettingService appSettingService,
                           EmailService emailService,
                           SubscriptionMonthRepository monthRepo,
                           SubscriptionMonthBookRepository monthBookRepo,
                           BookEditionRepository bookEditionRepo,
                           FavoriteNotificationService favoriteNotificationService,
                           AdminAuditLogService auditLogService,
                           com.luxgrimoire.backend.repository.AdminAuditLogRepository auditLogRepo) {
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
        this.emailService          = emailService;
        this.monthRepo             = monthRepo;
        this.monthBookRepo         = monthBookRepo;
        this.bookEditionRepo       = bookEditionRepo;
        this.favoriteNotificationService = favoriteNotificationService;
        this.auditLogService       = auditLogService;
        this.auditLogRepo          = auditLogRepo;
    }

    // ── Guard helpers ─────────────────────────────────────────────────────────

    private ResponseEntity<?> forbidden()     { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden")); }
    private ResponseEntity<?> unauthorized()  { return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated")); }
    private ResponseEntity<Object> notFound()      { return ResponseEntity.notFound().build(); }

    private String emailOf(String username) {
        if (username == null) return null;
        return userRepo.findById(username).map(u -> u.getEmail()).orElse(null);
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
                    m.put("username",          u.getUsername());
                    m.put("firstName",         u.getFirstName());
                    m.put("lastName",          u.getLastName());
                    m.put("email",             u.getEmail());
                    m.put("role",              u.getRole());
                    m.put("adminPermissions",  u.getAdminPermissions() != null ? u.getAdminPermissions() : "");
                    m.put("managedCompanyId",  u.getManagedCompanyId() != null ? u.getManagedCompanyId() : "");
                    m.put("avatarUrl",         u.getAvatarUrl());
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

    @PutMapping("/users/{username}/role-permissions")
    @Transactional
    public ResponseEntity<?> updateUserRoleAndPermissions(
            @PathVariable String username,
            @RequestBody Map<String, Object> body,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String newRole = body.get("role") instanceof String r ? r.trim() : null;
        String newPerms = body.get("adminPermissions") instanceof String p ? p.trim() : "";
        String newManagedCompanyId = body.get("managedCompanyId") instanceof String c ? c.trim() : null;

        // Only superadmin can assign admin or superadmin role
        if ((AppConstants.ROLE_SUPERADMIN.equals(newRole) || AppConstants.ROLE_ADMIN.equals(newRole))
                && !AuthHelper.isSuperAdmin(session)) {
            return ResponseEntity.status(403).body(Map.of("error", "Only superadmin can assign admin or superadmin role"));
        }

        // Validate role value
        List<String> validRoles = List.of(
            AppConstants.ROLE_USER, AppConstants.ROLE_COMPANY_MANAGER,
            AppConstants.ROLE_MODERATOR, AppConstants.ROLE_ADMIN, AppConstants.ROLE_SUPERADMIN);
        if (newRole != null && !validRoles.contains(newRole)) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid role: " + newRole));
        }

        return userRepo.findById(username).map(u -> {
            String oldRole = u.getRole();
            if (newRole != null) u.setRole(newRole);
            u.setAdminPermissions(newPerms.isBlank() ? null : newPerms);
            u.setManagedCompanyId(newManagedCompanyId == null || newManagedCompanyId.isBlank() ? null : newManagedCompanyId);
            userRepo.save(u);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "AppUser", username,
                "role: " + oldRole + "→" + newRole + ", permissions: " + newPerms
                + (newManagedCompanyId != null ? ", managedCompany: " + newManagedCompanyId : ""));
            Map<String, Object> resp = new LinkedHashMap<>();
            resp.put("username",         u.getUsername());
            resp.put("role",             u.getRole());
            resp.put("adminPermissions", u.getAdminPermissions() != null ? u.getAdminPermissions() : "");
            resp.put("managedCompanyId", u.getManagedCompanyId() != null ? u.getManagedCompanyId() : "");
            return ResponseEntity.ok((Object) resp);
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Companies ─────────────────────────────────────────────────────────────

    @GetMapping("/companies")
    public ResponseEntity<?> getCompanies(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();

        // company_manager sees only their assigned company
        if (AuthHelper.isCompanyManager(session)) {
            String managed = AuthHelper.getManagedCompanyId(session);
            if (managed == null || managed.isBlank()) return ResponseEntity.ok(List.of());
            return companyStore.findById(managed)
                    .map(c -> ResponseEntity.ok((Object) List.of(c)))
                    .orElse(ResponseEntity.ok(List.of()));
        }
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, id)) return forbidden();
        return companyStore.findById(id)
                .map(c -> ResponseEntity.ok((Object) c.getSubscriptions()))
                .orElse(notFound());
    }

    @GetMapping("/companies/{id}")
    public ResponseEntity<?> getCompany(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, id)) return forbidden();
        return companyStore.findById(id)
                .map(c -> ResponseEntity.ok((Object) c))
                .orElse(notFound());
    }

    /** Returns true if the current session user may access the given company. */
    private boolean canAccessCompany(HttpSession session, String companyId) {
        if (AuthHelper.isAdmin(session)) return true;
        if (AuthHelper.isCompanyManager(session)) {
            String managed = AuthHelper.getManagedCompanyId(session);
            return companyId != null && companyId.equals(managed);
        }
        // Users with explicit MANAGE_COMPANIES permission can access all companies
        return AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES);
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
        company.setInstagram((String) body.get("instagram"));
        company.setThreads((String) body.get("threads"));
        company.setTiktok((String) body.get("tiktok"));
        company.setFacebook((String) body.get("facebook"));
        company.setX((String) body.get("x"));
        company.setBluesky((String) body.get("bluesky"));

        String username = AuthHelper.getUsername(session);
        if (username != null) company.getManagerUsernames().add(username);

        BookBoxCompany saved = companyStore.save(company);
        auditLogService.log(username, "CREATE", "Company", saved.getId(),
                "Created company: \"" + saved.getName() + "\"");
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/companies/{id}")
    @Transactional
    public ResponseEntity<?> updateCompany(@PathVariable String id,
                                           @RequestBody Map<String, Object> body,
                                           HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, id)) return forbidden();

        return companyStore.updateMetadata(id,
                (String) body.get("name"),
                (String) body.get("logoUrl"),
                (String) body.get("websiteUrl"),
                (String) body.get("description"),
                (String) body.get("location"),
                (String) body.get("defaultCurrency"),
                (String) body.get("instagram"),
                (String) body.get("threads"),
                (String) body.get("tiktok"),
                (String) body.get("facebook"),
                (String) body.get("x"),
                (String) body.get("bluesky"))
                .map(c -> {
                    auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "Company", id,
                            "Updated company: \"" + c.getName() + "\"");
                    return ResponseEntity.ok((Object) c);
                })
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
            auditLogService.log(AuthHelper.getUsername(session), "DELETE", "Company", id,
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
        if (body.containsKey("defaultLanguage"))     sub.setDefaultLanguage((String) body.get("defaultLanguage"));
        Object skipCount = body.get("skipCount");
        if (skipCount != null) { try { sub.setSkipCount(Integer.valueOf(skipCount.toString())); } catch (NumberFormatException ignored) {} }
        Object maxConsec = body.get("maxConsecutiveSkips");
        if (maxConsec != null) { try { sub.setMaxConsecutiveSkips(Integer.valueOf(maxConsec.toString())); } catch (NumberFormatException ignored) {} }
        if (body.containsKey("skipPolicyNotes"))    sub.setSkipPolicyNotes((String) body.get("skipPolicyNotes"));
        // combo
        if (body.get("isCombo") instanceof Boolean b) sub.setCombo(b);
        // variant (parentSubscriptionId)
        if (body.containsKey("parentSubscriptionId")) {
            sub.setParentSubscriptionId((String) body.get("parentSubscriptionId"));
        }
        if (body.get("renewalDayUserSet") instanceof Boolean b) sub.setRenewalDayUserSet(b);
        Object renewalDay = body.get("renewalDay");
        if (renewalDay != null) {
            try { sub.setRenewalDay(Integer.valueOf(renewalDay.toString())); } catch (NumberFormatException ignored) {}
        }
        Object startingMonth = body.get("startingMonth");
        if (startingMonth != null) {
            try { sub.setStartingMonth(Integer.valueOf(startingMonth.toString())); } catch (NumberFormatException ignored) {}
        } else {
            sub.setStartingMonth(null);
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, id)) return forbidden();
        if (companyStore.findById(id).isEmpty()) return notFound();

        Subscription sub = new Subscription();
        applySubBody(sub, body);

        Subscription saved = companyStore.addSubscription(id, sub);
        auditLogService.log(AuthHelper.getUsername(session), "CREATE", "Subscription",
                saved.getId(), "Created subscription: \"" + saved.getName() + "\" (companyId=" + id + ")");
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/companies/{companyId}/subscriptions/{subId}")
    @Transactional
    public ResponseEntity<?> deleteSubscription(@PathVariable String companyId,
                                                @PathVariable String subId,
                                                HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, companyId)) return forbidden();

        return subscriptionRepo.findById(subId).map(sub -> {
            deletionLogService.log(
                    AuthHelper.getUsername(session), "Subscription", subId,
                    "Deleted subscription: \"" + sub.getName()
                            + "\" (companyId=" + companyId + ")");
            auditLogService.log(AuthHelper.getUsername(session), "DELETE", "Subscription", subId,
                    "Deleted subscription: \"" + sub.getName() + "\" (companyId=" + companyId + ")");
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, companyId)) return forbidden();
        return subscriptionRepo.findById(subId).map(sub -> {
            applySubBody(sub, body);
            Subscription saved = subscriptionRepo.save(sub);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "Subscription", subId,
                    "Updated subscription: \"" + saved.getName() + "\" (companyId=" + companyId + ")");
            return ResponseEntity.ok((Object) saved);
        }).orElse(notFound());
    }

    @PostMapping(value = "/companies/{id}/logo", consumes = "multipart/form-data")
    @Transactional
    public ResponseEntity<?> uploadCompanyLogo(@PathVariable String id,
                                               @RequestParam("file") MultipartFile file,
                                               HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, id)) return forbidden();
        return companyStore.findById(id).map(company -> {
            try {
                String url = fileStorageService.storeLogo("companies", id, file);
                company.setLogoUrl(url);
                companyStore.save(company);
                auditLogService.log(AuthHelper.getUsername(session), "UPLOAD", "Company", id,
                        "Uploaded logo for company: \"" + company.getName() + "\"");
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_COMPANIES)) return forbidden();
        if (!canAccessCompany(session, companyId)) return forbidden();
        return subscriptionRepo.findById(subId).map(sub -> {
            try {
                String url = fileStorageService.storeLogo("subscriptions", subId, file);
                sub.setLogoUrl(url);
                subscriptionRepo.save(sub);
                auditLogService.log(AuthHelper.getUsername(session), "UPLOAD", "Subscription", subId,
                        "Uploaded logo for subscription: \"" + sub.getName() + "\"");
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_REPORTS)) return forbidden();

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
    public ResponseEntity<?> submitReport(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();

        String title = (String) body.get("title");
        if (title == null || title.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "title is required"));

        Object imageUrlsRaw = body.get("imageUrls");
        String imageUrlsStr = "";
        if (imageUrlsRaw instanceof List) {
            imageUrlsStr = String.join(",", (List<String>)(List<?>)imageUrlsRaw);
        } else if (imageUrlsRaw instanceof String) {
            imageUrlsStr = (String) imageUrlsRaw;
        }

        ErrorReport report = new ErrorReport();
        report.setReporterUsername(AuthHelper.getUsername(session));
        report.setTitle(title.trim());
        report.setDescription(body.getOrDefault("description", "").toString());
        report.setCategory(body.getOrDefault("category", "other").toString());
        report.setImageUrls(imageUrlsStr);
        reportRepo.save(report);

        notificationService.sendToUser(report.getReporterUsername(), "Report received",
            "Your bug report \"" + report.getTitle() + "\" has been received. We will keep you updated on any status changes.",
            "system", "system");

        return ResponseEntity.status(HttpStatus.CREATED).body(report);
    }

    @PutMapping("/reports/{id}/status")
    public ResponseEntity<?> updateReportStatus(@PathVariable String id,
                                                @RequestBody Map<String, String> body,
                                                HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_REPORTS)) return forbidden();

        return reportRepo.findById(id).map(report -> {
            if (body.containsKey("status"))    report.setStatus(body.get("status"));
            if (body.containsKey("adminNote")) report.setAdminNote(body.get("adminNote"));
            reportRepo.save(report);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "ErrorReport", id,
                    "Updated bug report \"" + report.getTitle() + "\" → status=" + report.getStatus());
            if (report.getReporterUsername() != null) {
                notificationService.sendToUser(report.getReporterUsername(), "Report status updated",
                    "The status of your report \"" + report.getTitle() + "\" has changed to: " + report.getStatus(),
                    "system", "system");
            }
            return ResponseEntity.ok(report);
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
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_DATA_REQUESTS)) return forbidden();

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
    public ResponseEntity<?> submitDataRequest(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();

        String type = (String) body.get("type");
        if (type == null || type.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "type is required"));

        Object imageUrlsRaw = body.get("imageUrls");
        String imageUrlsStr = "";
        if (imageUrlsRaw instanceof List) {
            imageUrlsStr = String.join(",", (List<String>)(List<?>)imageUrlsRaw);
        } else if (imageUrlsRaw instanceof String) {
            imageUrlsStr = (String) imageUrlsRaw;
        }

        String username = AuthHelper.getUsername(session);
        String title = body.containsKey("title") ? body.get("title").toString() : null;

        // For sale_announcement: deduplicate by URL (title field)
        if ("sale_announcement".equals(type.trim()) && title != null && !title.isBlank()) {
            Optional<DataRequest> existing = dataRequestRepo.findFirstByTypeAndTitle("sale_announcement", title.trim());
            if (existing.isPresent()) {
                DataRequest req = existing.get();
                // Add this user to the reporters list if not already present
                String currentReporters = req.getReporters() != null ? req.getReporters() : "";
                List<String> reporterList = new ArrayList<>(
                        Arrays.asList(currentReporters.split(","))
                );
                reporterList.removeIf(String::isBlank);
                if (!reporterList.contains(username)) {
                    reporterList.add(username);
                    req.setReporters(String.join(",", reporterList));
                    dataRequestRepo.save(req);
                }
                notificationService.sendToUser(username, "Request received",
                    "Your sale report \"" + title + "\" has been received (merged with an existing request).",
                    "system", "system");
                return ResponseEntity.status(HttpStatus.CREATED).body(req);
            }
        }

        DataRequest req = new DataRequest();
        req.setRequesterUsername(username);
        req.setType(type.trim());
        req.setTitle(title);
        req.setDescription(body.getOrDefault("description", "").toString());
        req.setImageUrls(imageUrlsStr);
        req.setReporters(username);
        dataRequestRepo.save(req);

        notificationService.sendToUser(req.getRequesterUsername(), "Request received",
            "Your data request \"" + (req.getTitle() != null ? req.getTitle() : type) + "\" has been received.",
            "system", "system");

        return ResponseEntity.status(HttpStatus.CREATED).body(req);
    }

    @PutMapping("/data-requests/{id}/status")
    public ResponseEntity<?> updateDataRequestStatus(@PathVariable String id,
                                                     @RequestBody Map<String, String> body,
                                                     HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.hasPermission(session, AppConstants.PERM_MANAGE_DATA_REQUESTS)) return forbidden();

        return dataRequestRepo.findById(id).map(req -> {
            if (body.containsKey("status"))    req.setStatus(body.get("status"));
            if (body.containsKey("adminNote")) req.setAdminNote(body.get("adminNote"));
            dataRequestRepo.save(req);
            String label = req.getTitle() != null ? req.getTitle() : req.getType();
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "DataRequest", id,
                    "Updated data request \"" + label + "\" → status=" + req.getStatus());
            // Notify original requester + all reporters (deduplicated)
            Set<String> toNotify = new java.util.LinkedHashSet<>();
            if (req.getRequesterUsername() != null) toNotify.add(req.getRequesterUsername());
            if (req.getReporters() != null) {
                Arrays.stream(req.getReporters().split(","))
                      .map(String::trim).filter(s -> !s.isBlank())
                      .forEach(toNotify::add);
            }
            String msg = "The status of your request \"" + label + "\" has changed to: " + req.getStatus();
            for (String recipient : toNotify) {
                notificationService.sendToUser(recipient, "Request status updated", msg, "system", "system");
            }
            return ResponseEntity.ok(req);
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Audit Log ─────────────────────────────────────────────────────────────

    @GetMapping("/audit-logs")
    public ResponseEntity<?> getAuditLogs(
            @RequestParam(defaultValue = "0")   int page,
            @RequestParam(defaultValue = "50")  int size,
            @RequestParam(required = false)     String action,
            @RequestParam(required = false)     String entityType,
            @RequestParam(required = false)     String username,
            HttpSession session) {

        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        org.springframework.data.domain.Pageable pageable =
                PageRequest.of(page, Math.min(size, 200));
        boolean hasFilter = (action != null && !action.isBlank())
                || (entityType != null && !entityType.isBlank())
                || (username   != null && !username.isBlank());

        var result = hasFilter
                ? auditLogRepo.findFiltered(
                        (action     != null && !action.isBlank())     ? action     : null,
                        (entityType != null && !entityType.isBlank()) ? entityType : null,
                        (username   != null && !username.isBlank())   ? username   : null,
                        pageable)
                : auditLogRepo.findAllByOrderByPerformedAtDesc(pageable);

        return ResponseEntity.ok(Map.of(
                "content",       result.getContent(),
                "page",          result.getNumber(),
                "totalElements", result.getTotalElements(),
                "totalPages",    result.getTotalPages()
        ));
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
        auditLogService.log(createdBy, "TRIGGER", "Notification", String.valueOf(n.getId()),
                "Sent notification \"" + title + "\" to roles=" + targetRoles);
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
            return ResponseEntity.badRequest().body(Map.of("error", "Retention must be between 7 and 3650 days."));
        appSettingService.set("notification.retention.days", String.valueOf(days));
        auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "AppSetting",
                "notification.retention.days", "Set notification retention to " + days + " days");
        return ResponseEntity.ok(Map.of("ok", true, "days", days));
    }

    // ── Custom email ──────────────────────────────────────────────────────────

    @PostMapping("/send-email")
    public ResponseEntity<?> sendEmail(@RequestBody Map<String, String> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String to      = body.get("to");
        String subject = body.get("subject");
        String content = body.get("content");

        if (to == null || to.isBlank() || !to.contains("@"))
            return ResponseEntity.badRequest().body(Map.of("error", "Please provide a valid email address."));
        if (subject == null || subject.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Subject cannot be empty."));
        if (content == null || content.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Content cannot be empty."));

        emailService.sendCustom(to.trim(), subject.trim(), content.trim());
        auditLogService.log(AuthHelper.getUsername(session), "EMAIL", "Email", null,
                "Sent custom email to " + to.trim() + " — subject: \"" + subject.trim() + "\"");
        return ResponseEntity.ok(Map.of("ok", true, "message", "Email sent to " + to.trim()));
    }

    // ── BookEdition search ────────────────────────────────────────────────────

    @GetMapping("/companies/{companyId}/editions/search")
    @Transactional(readOnly = true)
    public ResponseEntity<?> searchEditions(@PathVariable String companyId,
                                            @RequestParam(defaultValue = "") String q,
                                            HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        List<com.luxgrimoire.backend.model.BookEdition> editions = bookEditionRepo.searchByCompanyAndText(
                companyId, q, PageRequest.of(0, 20));

        List<Map<String, Object>> result = editions.stream().map(e -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id",                  e.getId());
            m.put("editionName",         e.getEditionName());
            m.put("subscriptionName",    e.getSubscriptionName());
            m.put("bookTitle",           e.getBook() != null ? e.getBook().getTitle() : null);
            m.put("imageUrl",            e.getImageUrls() != null && !e.getImageUrls().isEmpty() ? e.getImageUrls().get(0) : null);
            m.put("subscriptionId",      e.getSubscriptionId());
            m.put("subscriptionMonthId", e.getSubscriptionMonthId());
            return m;
        }).toList();

        return ResponseEntity.ok(result);
    }

    // ── Subscription Month CRUD ───────────────────────────────────────────────

    private Map<String, Object> monthToMap(SubscriptionMonth sm) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",       sm.getId());
        m.put("year",     sm.getYear());
        m.put("month",    sm.getMonth());
        m.put("theme",    sm.getTheme());
        m.put("imageUrl", sm.getImageUrl());
        m.put("boxPrice", sm.getBoxPrice());
        // Legacy single-book fields (first book in list, or stored directly)
        m.put("bookId",    sm.getBookId());
        m.put("editionId", sm.getEditionId());
        // Multi-book list
        m.put("books", sm.getBooks().stream()
                .sorted(java.util.Comparator.comparingInt(SubscriptionMonthBook::getSortOrder))
                .map(b -> {
                    Map<String, Object> bm = new LinkedHashMap<>();
                    bm.put("id",        b.getId());
                    bm.put("bookId",    b.getBookId());
                    bm.put("editionId", b.getEditionId());
                    bm.put("sortOrder", b.getSortOrder());
                    return bm;
                }).toList());
        return m;
    }

    @GetMapping("/companies/{companyId}/subscriptions/{subId}/months")
    @Transactional(readOnly = true)
    public ResponseEntity<?> listMonths(@PathVariable String companyId,
                                        @PathVariable String subId,
                                        HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return subscriptionRepo.findById(subId).map(sub -> {
            List<Map<String, Object>> list = sub.getMonths().stream()
                    .sorted(Comparator.comparingInt(SubscriptionMonth::getYear).reversed()
                            .thenComparing(Comparator.comparingInt(SubscriptionMonth::getMonth).reversed()))
                    .map(this::monthToMap)
                    .toList();
            return ResponseEntity.ok((Object) list);
        }).orElse(notFound());
    }

    @PostMapping("/companies/{companyId}/subscriptions/{subId}/months")
    @Transactional
    public ResponseEntity<?> createMonth(@PathVariable String companyId,
                                         @PathVariable String subId,
                                         @RequestBody Map<String, Object> body,
                                         HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return subscriptionRepo.findById(subId).map(sub -> {
            SubscriptionMonth sm = new SubscriptionMonth();
            sm.setSubscription(sub);
            // Snapshot current subscription price if not explicitly provided
            if (sub.getBasePrice() != null && !body.containsKey("boxPrice")) {
                sm.setBoxPrice(sub.getBasePrice());
            }
            applyMonthBody(sm, body);
            sub.getMonths().add(sm);
            subscriptionRepo.save(sub);
            // Notify users who favorited this company
            if (sub.getCompany() != null) {
                String boxLabel = sm.getTheme() != null && !sm.getTheme().isBlank() ? sm.getTheme()
                        : (sm.getYear() + "/" + String.format("%02d", sm.getMonth()));
                favoriteNotificationService.notifyCompanyFavoriters(
                        sub.getCompany().getId(), sub.getCompany().getName(), boxLabel);
            }
            auditLogService.log(AuthHelper.getUsername(session), "CREATE", "SubscriptionMonth",
                    sm.getId(), "Created month " + sm.getYear() + "/" + sm.getMonth()
                            + (sm.getTheme() != null ? " — " + sm.getTheme() : "")
                            + " for subscription \"" + sub.getName() + "\"");
            return ResponseEntity.status(HttpStatus.CREATED).body((Object) monthToMap(sm));
        }).orElse(notFound());
    }

    @PutMapping("/months/{monthId}")
    @Transactional
    public ResponseEntity<?> updateMonth(@PathVariable String monthId,
                                         @RequestBody Map<String, Object> body,
                                         HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return monthRepo.findById(monthId).map(sm -> {
            applyMonthBody(sm, body);
            monthRepo.save(sm);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "SubscriptionMonth",
                    monthId, "Updated month " + sm.getYear() + "/" + sm.getMonth()
                            + (sm.getTheme() != null ? " — " + sm.getTheme() : ""));
            return ResponseEntity.ok((Object) monthToMap(sm));
        }).orElse(notFound());
    }

    @DeleteMapping("/months/{monthId}")
    @Transactional
    public ResponseEntity<?> deleteMonth(@PathVariable String monthId, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return monthRepo.findById(monthId).map(sm -> {
            String desc = "Deleted month " + sm.getYear() + "/" + sm.getMonth()
                    + (sm.getTheme() != null ? " — " + sm.getTheme() : "");
            Subscription sub = sm.getSubscription();
            if (sub != null) sub.getMonths().removeIf(m -> m.getId().equals(monthId));
            monthRepo.delete(sm);
            auditLogService.log(AuthHelper.getUsername(session), "DELETE", "SubscriptionMonth", monthId, desc);
            return ResponseEntity.noContent().<Void>build();
        }).orElse(ResponseEntity.notFound().build());
    }

    @SuppressWarnings("unchecked")
    private void applyMonthBody(SubscriptionMonth sm, Map<String, Object> body) {
        if (body.containsKey("year"))     { try { sm.setYear(Integer.parseInt(body.get("year").toString()));   } catch (NumberFormatException ignored) {} }
        if (body.containsKey("month"))    { try { sm.setMonth(Integer.parseInt(body.get("month").toString())); } catch (NumberFormatException ignored) {} }
        if (body.containsKey("theme"))    sm.setTheme((String) body.get("theme"));
        if (body.containsKey("imageUrl")) sm.setImageUrl((String) body.get("imageUrl"));
        // boxPrice can be set explicitly or left as-is (snapshot set at creation time)
        Object boxPrice = body.get("boxPrice");
        if (boxPrice != null && body.containsKey("boxPrice")) {
            try { sm.setBoxPrice(new BigDecimal(boxPrice.toString())); } catch (NumberFormatException ignored) {}
        }
        // Multi-book list
        List<Map<String, Object>> booksList = (List<Map<String, Object>>) body.get("books");
        if (booksList != null) {
            sm.getBooks().clear();
            for (int i = 0; i < booksList.size(); i++) {
                Map<String, Object> b = booksList.get(i);
                SubscriptionMonthBook smb = new SubscriptionMonthBook();
                smb.setMonth(sm);
                String bid = b.get("bookId") instanceof String s ? s : null;
                String eid = b.get("editionId") instanceof String s2 ? s2 : null;
                smb.setBookId(bid);
                smb.setEditionId(eid != null && !eid.isBlank() ? eid : null);
                smb.setSortOrder(i);
                sm.getBooks().add(smb);
            }
            // Sync legacy single-book fields from first entry
            if (!sm.getBooks().isEmpty()) {
                sm.setBookId(sm.getBooks().get(0).getBookId());
                sm.setEditionId(sm.getBooks().get(0).getEditionId());
            } else {
                sm.setBookId(null);
                sm.setEditionId(null);
            }
        } else {
            // Backward compat: single bookId/editionId fields
            if (body.containsKey("bookId")) sm.setBookId((String) body.get("bookId"));
            Object editionId = body.get("editionId");
            if (editionId instanceof String s) sm.setEditionId(s.isBlank() ? null : s);
            else if (editionId == null && body.containsKey("editionId")) sm.setEditionId(null);
        }
    }
}