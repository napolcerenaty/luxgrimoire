package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.FaqCategory;
import com.luxgrimoire.backend.model.FaqItem;
import com.luxgrimoire.backend.repository.FaqCategoryRepository;
import com.luxgrimoire.backend.repository.FaqItemRepository;
import com.luxgrimoire.backend.service.AdminAuditLogService;
import com.luxgrimoire.backend.service.AppSettingService;
import com.luxgrimoire.backend.util.AuthHelper;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class FaqController {

    private final FaqCategoryRepository categoryRepo;
    private final FaqItemRepository     itemRepo;
    private final AppSettingService     settingService;
    private final AdminAuditLogService  auditLogService;

    public FaqController(FaqCategoryRepository categoryRepo,
                         FaqItemRepository itemRepo,
                         AppSettingService settingService,
                         AdminAuditLogService auditLogService) {
        this.categoryRepo   = categoryRepo;
        this.itemRepo       = itemRepo;
        this.settingService = settingService;
        this.auditLogService = auditLogService;
    }

    // ── Public: read FAQ ──────────────────────────────────────────────────────

    @GetMapping("/faq")
    public ResponseEntity<List<FaqCategory>> getFaq() {
        return ResponseEntity.ok(categoryRepo.findAllByOrderBySortOrderAsc());
    }

    // ── Public: static pages (privacy_policy, terms_of_use) ──────────────────

    @GetMapping("/pages/{key}")
    public ResponseEntity<Map<String, String>> getPage(@PathVariable String key) {
        if (!isAllowedPageKey(key)) return ResponseEntity.notFound().build();
        String content = settingService.get("page." + key, "");
        return ResponseEntity.ok(Map.of("key", key, "content", content));
    }

    // ── Admin: update static page ─────────────────────────────────────────────

    @PutMapping("/admin/pages/{key}")
    public ResponseEntity<?> updatePage(@PathVariable String key,
                                        @RequestBody Map<String, String> body,
                                        HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();
        if (!isAllowedPageKey(key))          return ResponseEntity.notFound().build();

        String content = body.getOrDefault("content", "");
        settingService.set("page." + key, content);
        auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "StaticPage", key,
                "Updated static page: " + key);
        return ResponseEntity.ok(Map.of("key", key, "content", content));
    }

    // ── Admin: FAQ categories ─────────────────────────────────────────────────

    @PostMapping("/admin/faq/categories")
    public ResponseEntity<?> createCategory(@RequestBody Map<String, Object> body, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        String title = (String) body.getOrDefault("title", "");
        if (title.isBlank()) return ResponseEntity.badRequest().body(Map.of("error", "title required"));

        int sortOrder = body.containsKey("sortOrder")
                ? ((Number) body.get("sortOrder")).intValue()
                : (int) categoryRepo.count();

        FaqCategory cat = new FaqCategory();
        cat.setTitle(title.trim());
        cat.setSortOrder(sortOrder);
        applyI18n(cat, body);
        FaqCategory saved = categoryRepo.save(cat);
        auditLogService.log(AuthHelper.getUsername(session), "CREATE", "FaqCategory",
                saved.getId(), "Created FAQ category: \"" + title.trim() + "\"");
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/admin/faq/categories/{id}")
    public ResponseEntity<?> updateCategory(@PathVariable String id,
                                            @RequestBody Map<String, Object> body,
                                            HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        return categoryRepo.findById(id).map(cat -> {
            if (body.containsKey("title"))     cat.setTitle((String) body.get("title"));
            if (body.containsKey("sortOrder")) cat.setSortOrder(((Number) body.get("sortOrder")).intValue());
            applyI18n(cat, body);
            FaqCategory saved = categoryRepo.save(cat);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "FaqCategory",
                    id, "Updated FAQ category: \"" + cat.getTitle() + "\"");
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/admin/faq/categories/{id}")
    public ResponseEntity<?> deleteCategory(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        if (!categoryRepo.existsById(id)) return ResponseEntity.notFound().build();
        categoryRepo.deleteById(id);
        auditLogService.log(AuthHelper.getUsername(session), "DELETE", "FaqCategory",
                id, "Deleted FAQ category id=" + id);
        return ResponseEntity.noContent().build();
    }

    // ── Admin: FAQ items ──────────────────────────────────────────────────────

    @PostMapping("/admin/faq/categories/{categoryId}/items")
    public ResponseEntity<?> createItem(@PathVariable String categoryId,
                                        @RequestBody Map<String, Object> body,
                                        HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        return categoryRepo.findById(categoryId).map(cat -> {
            String question = (String) body.getOrDefault("question", "");
            String answer   = (String) body.getOrDefault("answer", "");
            if (question.isBlank()) return ResponseEntity.badRequest().<Object>body(Map.of("error", "question required"));

            int sortOrder = body.containsKey("sortOrder")
                    ? ((Number) body.get("sortOrder")).intValue()
                    : itemRepo.findByCategory_IdOrderBySortOrderAsc(categoryId).size();

            FaqItem item = new FaqItem();
            item.setCategory(cat);
            item.setQuestion(question.trim());
            item.setAnswer(answer.trim());
            item.setSortOrder(sortOrder);
            applyI18nItem(item, body);
            FaqItem saved = itemRepo.save(item);
            auditLogService.log(AuthHelper.getUsername(session), "CREATE", "FaqItem",
                    saved.getId(), "Created FAQ item in cat=" + categoryId + ": \"" + question.trim() + "\"");
            return ResponseEntity.<Object>status(HttpStatus.CREATED).body(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/admin/faq/items/{id}")
    public ResponseEntity<?> updateItem(@PathVariable String id,
                                        @RequestBody Map<String, Object> body,
                                        HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        return itemRepo.findById(id).map(item -> {
            if (body.containsKey("question"))  item.setQuestion((String) body.get("question"));
            if (body.containsKey("answer"))    item.setAnswer((String) body.get("answer"));
            if (body.containsKey("sortOrder")) item.setSortOrder(((Number) body.get("sortOrder")).intValue());
            applyI18nItem(item, body);
            FaqItem saved = itemRepo.save(item);
            auditLogService.log(AuthHelper.getUsername(session), "UPDATE", "FaqItem",
                    id, "Updated FAQ item: \"" + item.getQuestion() + "\"");
            return ResponseEntity.ok(saved);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/admin/faq/items/{id}")
    public ResponseEntity<?> deleteItem(@PathVariable String id, HttpSession session) {
        if (!AuthHelper.isLoggedIn(session)) return ResponseEntity.status(401).build();
        if (!AuthHelper.isAdmin(session))    return ResponseEntity.status(403).build();

        if (!itemRepo.existsById(id)) return ResponseEntity.notFound().build();
        itemRepo.deleteById(id);
        auditLogService.log(AuthHelper.getUsername(session), "DELETE", "FaqItem",
                id, "Deleted FAQ item id=" + id);
        return ResponseEntity.noContent().build();
    }

    // ─────────────────────────────────────────────────────────────────────────

    private boolean isAllowedPageKey(String key) {
        return "privacy_policy".equals(key) || "terms_of_use".equals(key);
    }

    @SuppressWarnings("unchecked")
    private void applyI18n(FaqCategory cat, Map<String, Object> body) {
        if (body.containsKey("titleI18n")) {
            Object raw = body.get("titleI18n");
            if (raw instanceof Map<?,?> m) cat.setTitleI18n((Map<String, String>) m);
        }
    }

    @SuppressWarnings("unchecked")
    private void applyI18nItem(FaqItem item, Map<String, Object> body) {
        if (body.containsKey("questionI18n")) {
            Object raw = body.get("questionI18n");
            if (raw instanceof Map<?,?> m) item.setQuestionI18n((Map<String, String>) m);
        }
        if (body.containsKey("answerI18n")) {
            Object raw = body.get("answerI18n");
            if (raw instanceof Map<?,?> m) item.setAnswerI18n((Map<String, String>) m);
        }
    }
}
