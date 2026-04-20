package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.job.RssFeedScheduler;
import com.luxgrimoire.backend.model.PendingMonthImport;
import com.luxgrimoire.backend.model.SubscriptionImportSource;
import com.luxgrimoire.backend.model.SubscriptionMonth;
import com.luxgrimoire.backend.repository.PendingMonthImportRepository;
import com.luxgrimoire.backend.repository.SubscriptionImportSourceRepository;
import com.luxgrimoire.backend.repository.SubscriptionMonthRepository;
import com.luxgrimoire.backend.repository.SubscriptionRepository;
import com.luxgrimoire.backend.service.AdminAuditLogService;
import com.luxgrimoire.backend.service.FileStorageService;
import com.luxgrimoire.backend.service.OpenAiService;
import com.luxgrimoire.backend.service.PageScraperService;
import com.luxgrimoire.backend.service.PageScraperService.ScrapedMonthData;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.Instant;
import java.util.Base64;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/import")
public class ImportController {

    private final PageScraperService                 scraper;
    private final OpenAiService                      openAiService;
    private final SubscriptionImportSourceRepository sourceRepo;
    private final PendingMonthImportRepository       pendingRepo;
    private final SubscriptionRepository             subscriptionRepo;
    private final SubscriptionMonthRepository        monthRepo;
    private final RssFeedScheduler                   scheduler;
    private final AdminAuditLogService               auditLogService;
    private final FileStorageService                 fileStorage;

    public ImportController(PageScraperService scraper,
                            OpenAiService openAiService,
                            SubscriptionImportSourceRepository sourceRepo,
                            PendingMonthImportRepository pendingRepo,
                            SubscriptionRepository subscriptionRepo,
                            SubscriptionMonthRepository monthRepo,
                            RssFeedScheduler scheduler,
                            AdminAuditLogService auditLogService,
                            FileStorageService fileStorage) {
        this.scraper         = scraper;
        this.openAiService   = openAiService;
        this.sourceRepo      = sourceRepo;
        this.pendingRepo     = pendingRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.monthRepo       = monthRepo;
        this.scheduler       = scheduler;
        this.auditLogService = auditLogService;
        this.fileStorage     = fileStorage;
    }

    // ── Guard helpers ─────────────────────────────────────────────────────────

    private ResponseEntity<?> forbidden()    { return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", "Forbidden")); }
    private ResponseEntity<?> unauthorized() { return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated")); }

    // ── Stage 1: URL scrape preview ───────────────────────────────────────────

    @PostMapping("/scrape-url")
    public ResponseEntity<?> scrapeUrl(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String url = (String) body.get("url");
        if (url == null || url.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "url is required"));

        ScrapedMonthData data = scraper.scrapeUrl(url);

        // Optionally save as pending if subscriptionId provided
        String subscriptionId = (String) body.get("subscriptionId");
        String companyId      = (String) body.get("companyId");
        if (subscriptionId != null && !subscriptionId.isBlank()) {
            data.sourceUrl      = url;
        }

        return ResponseEntity.ok(data);
    }

    // ── Stage 1a: Parent URL multi-post scrape ────────────────────────────────

    @PostMapping("/scrape-parent")
    public ResponseEntity<?> scrapeParent(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String url = (String) body.get("url");
        if (url == null || url.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "url is required"));

        return ResponseEntity.ok(scraper.scrapeParentPage(url));
    }

    // ── Stage 1b: Screenshot / image import via AI vision ─────────────────────

    @PostMapping("/scrape-image")
    public ResponseEntity<?> scrapeImage(@RequestParam("file") MultipartFile file, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        if (!openAiService.isConfigured())
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body(Map.of("error", "AI not configured — set openai.api-key"));

        if (file.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("error", "file is required"));

        String mimeType = file.getContentType();
        if (mimeType == null || !mimeType.startsWith("image/"))
            return ResponseEntity.badRequest().body(Map.of("error", "Only image files are accepted"));

        try {
            String base64 = Base64.getEncoder().encodeToString(file.getBytes());
            ScrapedMonthData data = openAiService.extractFromImage(base64, mimeType);
            if (data == null)
                return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                        .body(Map.of("error", "AI extraction failed"));
            return ResponseEntity.ok(data);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                    .body(Map.of("error", e.getMessage()));
        }
    }

    // ── AI status ─────────────────────────────────────────────────────────────

    @GetMapping("/ai-status")
    public ResponseEntity<?> aiStatus(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(Map.of("configured", openAiService.isConfigured()));
    }

    // ── Import Sources ────────────────────────────────────────────────────────

    /** List ALL sources (admin/superadmin) */
    @GetMapping("/sources")
    public ResponseEntity<?> listAllSources(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(sourceRepo.findAllByOrderByCompanyIdAscNameAsc());
    }

    @GetMapping("/sources/{companyId}/{subscriptionId}")
    public ResponseEntity<?> listSources(@PathVariable String companyId,
                                         @PathVariable String subscriptionId,
                                         HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(sourceRepo.findByCompanyIdAndSubscriptionId(companyId, subscriptionId));
    }

    @PostMapping("/sources")
    public ResponseEntity<?> createSource(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        String url            = (String) body.get("url");
        String companyId      = (String) body.get("companyId");
        String subscriptionId = (String) body.get("subscriptionId");
        String sourceType     = (String) body.get("sourceType");

        if (url == null || url.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "url is required"));
        if (sourceType == null || sourceType.isBlank())
            sourceType = "RSS";

        SubscriptionImportSource source = new SubscriptionImportSource();
        source.setName((String) body.get("name"));
        source.setCompanyId(companyId);
        source.setSubscriptionId(subscriptionId);
        source.setSourceType(sourceType.toUpperCase());
        source.setTargetType(targetTypeFrom(body));
        source.setUrl(url.trim());
        applyScheduleFields(source, body);

        SubscriptionImportSource saved = sourceRepo.save(source);
        auditLogService.log(AuthHelper.getUsername(session), "CREATE", "ImportSource",
                String.valueOf(saved.getId()), "Created import source: " + url.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/sources/{id}")
    public ResponseEntity<?> updateSource(@PathVariable Long id,
                                          @RequestBody Map<String, Object> body,
                                          HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return sourceRepo.findById(id).map(source -> {
            String name = (String) body.get("name");
            if (name != null) source.setName(name);
            String url = (String) body.get("url");
            if (url != null && !url.isBlank()) source.setUrl(url.trim());
            String sourceType = (String) body.get("sourceType");
            if (sourceType != null && !sourceType.isBlank()) source.setSourceType(sourceType.toUpperCase());
            source.setTargetType(targetTypeFrom(body));
            applyScheduleFields(source, body);

            if (body.containsKey("enabled")) {
                Object en = body.get("enabled");
                source.setEnabled(Boolean.TRUE.equals(en) || "true".equals(String.valueOf(en)));
            }

            SubscriptionImportSource saved = sourceRepo.save(source);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "ImportSource",
                    String.valueOf(id), "Updated import source id=" + id);
            return ResponseEntity.ok((Object) saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/sources/{id}")
    public ResponseEntity<?> deleteSource(@PathVariable Long id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        if (!sourceRepo.existsById(id))
            return ResponseEntity.notFound().build();
        sourceRepo.deleteById(id);
        auditLogService.log(AuthHelper.getUsername(session), "DELETE", "ImportSource",
                String.valueOf(id), "Deleted import source id=" + id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/sources/{id}/check-now")
    public ResponseEntity<?> checkNow(@PathVariable Long id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return sourceRepo.findById(id).map(source -> {
            try {
                scheduler.checkSource(source);
                auditLogService.log(AuthHelper.getUsername(session), "TRIGGER", "ImportSource",
                        String.valueOf(id), "Manually checked source id=" + id + " url=" + source.getUrl());
                return ResponseEntity.ok((Object) Map.of("message", "Check completed"));
            } catch (Exception e) {
                return ResponseEntity.status(500).<Object>body(Map.of("error", e.getMessage()));
            }
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Save to pending queue manually ────────────────────────────────────────

    @PostMapping("/pending")
    public ResponseEntity<?> savePending(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        PendingMonthImport pending = buildPendingFromBody(body);
        pending.setStatus("PENDING");
        pending.setCreatedAt(Instant.now());
        PendingMonthImport saved = pendingRepo.save(pending);
        auditLogService.log(AuthHelper.getUsername(session), "CREATE", "PendingImport",
                String.valueOf(saved.getId()),
                "Queued pending import: sub=" + saved.getSubscriptionId()
                        + " " + saved.getYear() + "/" + saved.getMonth());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    // ── Pending imports queue ─────────────────────────────────────────────────

    @GetMapping("/pending")
    public ResponseEntity<?> listPending(HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();
        return ResponseEntity.ok(pendingRepo.findByStatusOrderByCreatedAtDesc("PENDING"));
    }

    @PostMapping("/pending/{id}/approve")
    @Transactional
    public ResponseEntity<?> approvePending(@PathVariable Long id,
                                             @RequestBody Map<String, Object> body,
                                             HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return pendingRepo.findById(id).map(pending -> {
            String subscriptionId = pending.getSubscriptionId();
            if (subscriptionId == null)
                return ResponseEntity.badRequest().<Object>body(Map.of("error", "No subscriptionId on pending import"));

            // Allow admin to reclassify UNKNOWN items via body; reject if still UNKNOWN
            String resolvedType = strFromBody(body, "targetType", pending.getTargetType());
            if ("UNKNOWN".equals(resolvedType))
                return ResponseEntity.badRequest().<Object>body(
                        Map.of("error", "Please classify this import as MONTH_THEME or SALE_ANNOUNCEMENT before approving"));

            pending.setTargetType(resolvedType);

            return subscriptionRepo.findById(subscriptionId).map(sub -> {
                // Build the SubscriptionMonth
                SubscriptionMonth sm = new SubscriptionMonth();
                sm.setSubscription(sub);

                Integer year  = intFromBody(body, "year",  pending.getYear());
                Integer month = intFromBody(body, "month", pending.getMonth());
                sm.setYear(year  != null ? year  : 0);
                sm.setMonth(month != null ? month : 0);

                String theme = strFromBody(body, "theme", pending.getTheme());
                sm.setTheme(theme);

                String imageUrl = strFromBody(body, "imageUrl", pending.getImageUrl());
                // Download remote image and store locally if it's an external URL
                if (imageUrl != null && imageUrl.startsWith("http")) {
                    String category  = "SALE_ANNOUNCEMENT".equals(resolvedType)
                            ? "sale-announcements" : "monthly-themes";
                    String companyId = pending.getCompanyId();
                    String local = fileStorage.storeRemoteImage(imageUrl, category, companyId);
                    if (local != null) imageUrl = local;
                }
                sm.setImageUrl(imageUrl);

                String bookId = strFromBody(body, "bookId", null);
                sm.setBookId(bookId);
                String editionId = strFromBody(body, "editionId", null);
                if (editionId != null && !editionId.isBlank()) sm.setEditionId(editionId);

                sub.getMonths().add(sm);
                subscriptionRepo.save(sub);

                pending.setStatus("APPROVED");
                pendingRepo.save(pending);
                auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "PendingImport",
                        String.valueOf(id), "Approved pending import id=" + id + " → sub=" + subscriptionId);
                return ResponseEntity.ok((Object) Map.of("message", "Approved and saved"));
            }).orElse(ResponseEntity.badRequest().<Object>body(Map.of("error", "Subscription not found")));
        }).orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/pending/{id}/reject")
    public ResponseEntity<?> rejectPending(@PathVariable Long id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return unauthorized();
        if (!AuthHelper.isAdmin(session))    return forbidden();

        return pendingRepo.findById(id).map(pending -> {
            pending.setStatus("REJECTED");
            pendingRepo.save(pending);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "PendingImport",
                    String.valueOf(id), "Rejected pending import id=" + id);
            return ResponseEntity.ok((Object) Map.of("message", "Rejected"));
        }).orElse(ResponseEntity.notFound().build());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private PendingMonthImport buildPendingFromBody(Map<String, Object> body) {
        PendingMonthImport p = new PendingMonthImport();
        p.setCompanyId((String) body.get("companyId"));
        p.setSubscriptionId((String) body.get("subscriptionId"));
        p.setYear(intFromBody(body, "year", null));
        p.setMonth(intFromBody(body, "month", null));
        p.setTheme((String) body.get("theme"));
        p.setBookTitle((String) body.get("bookTitle"));
        p.setBookAuthor((String) body.get("bookAuthor"));
        p.setImageUrl((String) body.get("imageUrl"));
        p.setSourceUrl((String) body.get("sourceUrl"));
        p.setTargetType(targetTypeFrom(body));
        p.setRawTitle((String) body.get("rawTitle"));
        return p;
    }

    private String targetTypeFrom(Map<String, Object> body) {
        String tt = (String) body.get("targetType");
        return (tt != null && !tt.isBlank()) ? tt.toUpperCase() : "MONTH_THEME";
    }

    private void applyScheduleFields(SubscriptionImportSource source, Map<String, Object> body) {
        String freq = (String) body.get("checkFrequency");
        if (freq != null && !freq.isBlank()) source.setCheckFrequency(freq.toUpperCase());
        Integer hour = intFromBody(body, "checkHour", null);
        if (hour != null) source.setCheckHour(hour);
        Integer dow = intFromBody(body, "checkDayOfWeek", null);
        source.setCheckDayOfWeek(dow);
        Integer dom = intFromBody(body, "checkDayOfMonth", null);
        source.setCheckDayOfMonth(dom);
        // Keyword classification
        if (body.containsKey("monthThemeKeywords")) source.setMonthThemeKeywords((String) body.get("monthThemeKeywords"));
        if (body.containsKey("saleKeywords"))       source.setSaleKeywords((String) body.get("saleKeywords"));
    }

    private Integer intFromBody(Map<String, Object> body, String key, Integer fallback) {
        Object val = body.get(key);
        if (val == null) return fallback;
        try { return Integer.valueOf(val.toString()); } catch (NumberFormatException e) { return fallback; }
    }

    private String strFromBody(Map<String, Object> body, String key, String fallback) {
        Object val = body.get(key);
        if (val instanceof String s && !s.isBlank()) return s;
        return fallback;
    }
}
