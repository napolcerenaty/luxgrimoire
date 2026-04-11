package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.UserStore;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserCollectionController {

    private final UserStore         userStore;
    private final DeletionLogService deletionLogService;

    public UserCollectionController(UserStore userStore, DeletionLogService deletionLogService) {
        this.userStore          = userStore;
        this.deletionLogService = deletionLogService;
    }

    // ── Books ──────────────────────────────────────────────────────────────

    @GetMapping("/books")
    public ResponseEntity<?> getBooks(@RequestParam(required = false) String flag, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        List<UserBookEntry> books = (flag != null && !flag.isBlank())
                ? userStore.getBooksByFlag(username, flag.toUpperCase())
                : userStore.getBooks(username);
        return ResponseEntity.ok(books);
    }

    @PostMapping("/books")
    public ResponseEntity<?> addBook(@RequestBody Map<String, String> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        String bookId = body.get("bookId");
        String editionId = body.get("editionId");
        String flag = body.get("flag");
        if (editionId == null || editionId.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Missing editionId"));

        long existingCount = userStore.countBooksByEdition(username, editionId);
        UserBookEntry entry = userStore.addBook(username, bookId, editionId, flag);
        return ResponseEntity.ok(Map.of("entry", entry, "existingCount", existingCount));
    }

    @DeleteMapping("/books/{id}")
    public ResponseEntity<?> removeBook(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.removeBook(username, id);
        if (removed) deletionLogService.log(username, "UserBookEntry", id,
                "User @" + username + " removed book entry " + id);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Subscriptions ──────────────────────────────────────────────────────

    @GetMapping("/subscriptions")
    public ResponseEntity<?> getSubscriptions(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getSubscriptions(username));
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<?> addSubscription(@RequestBody Map<String, Object> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        Object companyIdObj = body.get("companyId");
        Object subscriptionIdObj = body.get("subscriptionId");
        if (companyIdObj == null || subscriptionIdObj == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Missing companyId or subscriptionId"));
        String companyId = companyIdObj.toString();
        String subscriptionId = subscriptionIdObj.toString();

        long existingCount = userStore.countSubscriptions(username, companyId, subscriptionId);
        UserSubscriptionEntry entry = userStore.addSubscription(username, companyId, subscriptionId, body);
        return ResponseEntity.ok(Map.of("entry", entry, "existingCount", existingCount));
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<?> removeSubscription(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.removeSubscription(username, id);
        if (removed) deletionLogService.log(username, "UserSubscriptionEntry", id,
                "User @" + username + " removed subscription entry " + id);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    @PutMapping("/subscriptions/{id}")
    public ResponseEntity<?> updateSubscriptionCosts(@PathVariable String id,
            @RequestBody Map<String, Object> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            BigDecimal shippingCost = body.get("shippingCost") instanceof Number n
                    ? new BigDecimal(n.toString()) : null;
            BigDecimal taxesAndFees = body.get("taxesAndFees") instanceof Number n
                    ? new BigDecimal(n.toString()) : null;
            int effectiveFromMonth = body.get("effectiveFromMonth") instanceof Number n
                    ? n.intValue() : 1;
            int effectiveFromYear = body.get("effectiveFromYear") instanceof Number n
                    ? n.intValue() : java.time.LocalDate.now().getYear();
            UserSubscriptionEntry entry = userStore.updateSubscriptionCosts(
                    username, id, shippingCost, taxesAndFees, effectiveFromMonth, effectiveFromYear);
            return ResponseEntity.ok(entry);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    @GetMapping("/subscriptions/{id}/cost-history")
    public ResponseEntity<?> getCostHistory(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            return ResponseEntity.ok(userStore.getCostChanges(username, id));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    // ── Billing periods ────────────────────────────────────────────────────

    @GetMapping("/subscriptions/{id}/billing-periods")
    public ResponseEntity<?> getBillingPeriods(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            return ResponseEntity.ok(userStore.getBillingPeriods(username, id));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    @PostMapping("/subscriptions/{id}/billing-periods")
    public ResponseEntity<?> addBillingPeriod(@PathVariable String id,
            @RequestBody Map<String, Object> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            UserSubBillingPeriod period = userStore.addBillingPeriod(username, id, body);
            return ResponseEntity.status(HttpStatus.CREATED).body(period);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    @DeleteMapping("/subscriptions/{entryId}/billing-periods/{periodId}")
    public ResponseEntity<?> deleteBillingPeriod(@PathVariable String entryId,
            @PathVariable String periodId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.deleteBillingPeriod(username, entryId, periodId);
        if (removed) deletionLogService.log(username, "UserSubBillingPeriod", periodId,
                "User @" + username + " removed billing period " + periodId + " from entry " + entryId);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}

