package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.service.DeletionLogService;
import com.luxgrimoire.backend.service.UserStore;
import com.luxgrimoire.backend.util.AppConstants;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
public class UserCollectionController {

    private final UserStore         userStore;
    private final DeletionLogService deletionLogService;
    private final JdbcTemplate      jdbc;

    private static final String SOLD_BOOKS_ENRICHED_SQL = """
        SELECT ube.id, ube.book_id AS bookId, ube.edition_id AS editionId,
               ube.ownership_status AS ownershipStatus, ube.flag,
               ube.allocated_price AS allocatedPrice, COALESCE(pt.currency, 'GBP') AS currency,
               ube.sale_price AS salePrice, ube.sale_currency AS saleCurrency,
               ube.sale_date AS saleDate, ube.sale_venue AS saleVenue, ube.sale_notes AS saleNotes,
               ube.purchase_transaction_id AS purchaseTransactionId,
               COALESCE(pt.taxes_and_fees, 0) / COALESCE(cnt.book_count, 1) AS proportionalTaxes,
               COALESCE(pt.shipping, 0)        / COALESCE(cnt.book_count, 1) AS proportionalShipping
        FROM user_book_entry ube
        LEFT JOIN purchase_transaction pt ON ube.purchase_transaction_id = pt.id
        LEFT JOIN (
            SELECT purchase_transaction_id, COUNT(*) AS book_count
            FROM user_book_entry
            WHERE purchase_transaction_id IS NOT NULL
            GROUP BY purchase_transaction_id
        ) cnt ON ube.purchase_transaction_id = cnt.purchase_transaction_id
        WHERE ube.username = ? AND ube.ownership_status = 'SOLD'
        ORDER BY ube.sale_date DESC NULLS LAST
        """;

    public UserCollectionController(UserStore userStore, DeletionLogService deletionLogService, JdbcTemplate jdbc) {
        this.userStore          = userStore;
        this.deletionLogService = deletionLogService;
        this.jdbc               = jdbc;
    }

    // ── Collection flat view ───────────────────────────────────────────────

    @GetMapping("/collection")
    public ResponseEntity<?> getCollectionView(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getCollectionView(username));
    }

    // ── Books ──────────────────────────────────────────────────────────────

    @GetMapping("/books")
    public ResponseEntity<?> getBooks(@RequestParam(required = false) String flag,
                                      @RequestParam(required = false) String ownershipStatus,
                                      HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        if ("SOLD".equalsIgnoreCase(flag)) {
            List<Map<String, Object>> enriched = jdbc.query(
                SOLD_BOOKS_ENRICHED_SQL,
                (rs, i) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id",                    rs.getString("id"));
                    row.put("bookId",                rs.getString("bookId"));
                    row.put("editionId",             rs.getString("editionId"));
                    row.put("ownershipStatus",       rs.getString("ownershipStatus"));
                    row.put("flag",                  rs.getString("flag"));
                    row.put("allocatedPrice",        rs.getBigDecimal("allocatedPrice"));
                    row.put("currency",              rs.getString("currency"));
                    row.put("salePrice",             rs.getBigDecimal("salePrice"));
                    row.put("saleCurrency",          rs.getString("saleCurrency"));
                    row.put("saleDate",              rs.getString("saleDate"));
                    row.put("saleVenue",             rs.getString("saleVenue"));
                    row.put("saleNotes",             rs.getString("saleNotes"));
                    row.put("purchaseTransactionId", rs.getString("purchaseTransactionId"));
                    row.put("proportionalTaxes",     rs.getBigDecimal("proportionalTaxes"));
                    row.put("proportionalShipping",  rs.getBigDecimal("proportionalShipping"));
                    return row;
                },
                username);
            return ResponseEntity.ok(enriched);
        }
        List<UserBookEntry> books;
        if (ownershipStatus != null && !ownershipStatus.isBlank())
            books = userStore.getBooksByOwnershipStatus(username, ownershipStatus.toUpperCase());
        else if (flag != null && !flag.isBlank())
            books = userStore.getBooksByFlag(username, flag.toUpperCase());
        else
            books = userStore.getBooks(username);
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

    @PutMapping("/books/{id}")
    public ResponseEntity<?> updateBook(@PathVariable String id,
                                        @RequestBody Map<String, Object> body,
                                        HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            UserBookEntry updated = userStore.updateBook(username, id, body);
            return ResponseEntity.ok(updated);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(404).body(Map.of("error", "Not found"));
        }
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

    // ── Purchase transactions ──────────────────────────────────────────────

    @GetMapping("/purchases")
    public ResponseEntity<?> getPurchases(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getPurchaseTransactions(username));
    }

    @GetMapping("/purchases/{transactionId}/books")
    public ResponseEntity<?> getPurchaseBooks(@PathVariable String transactionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getEntriesForTransaction(username, transactionId));
    }

    /**
     * Add one or more books in a single purchase event.
     * Body: { purchaseDate, totalPaid, currency, source, notes,
     *         books: [{bookId, editionId, allocatedPrice?, ownershipStatus?, condition?}] }
     */
    @PostMapping("/purchases")
    public ResponseEntity<?> addPurchase(@RequestBody Map<String, Object> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            PurchaseTransaction tx = userStore.addPurchase(username, body);
            return ResponseEntity.status(HttpStatus.CREATED).body(tx);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(Map.of("error", e.getMessage()));
        }
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

    @PatchMapping("/subscriptions/{id}/status")
    public ResponseEntity<?> updateSubscriptionStatus(@PathVariable String id,
            @RequestBody Map<String, Object> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            boolean active = !Boolean.FALSE.equals(body.get("active"));
            String cancellationDate = body.get("cancellationDate") instanceof String s ? s : null;
            UserSubscriptionEntry entry = userStore.updateSubscriptionStatus(username, id, active, cancellationDate);
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

    // ── Edition tags ───────────────────────────────────────────────────────

    /** All distinct tags the current user has ever used — for autocomplete. */
    @GetMapping("/tags")
    public ResponseEntity<?> getUserTags(HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getUserTags(username));
    }

    @GetMapping("/editions/{editionId}/tags")
    public ResponseEntity<?> getEditionTags(@PathVariable String editionId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        return ResponseEntity.ok(userStore.getEditionTags(username, editionId));
    }

    @PostMapping("/editions/{editionId}/tags")
    public ResponseEntity<?> addEditionTag(@PathVariable String editionId,
            @RequestBody Map<String, String> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        // Tags are personal — only users who own this edition may tag it
        if (userStore.countBooksByEdition(username, editionId) == 0)
            return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "You must own this edition to add tags"));
        String tag = body.get("tag");
        if (tag == null || tag.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Tag is required"));
        UserEditionTag saved = userStore.addEditionTag(username, editionId, tag.trim());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @DeleteMapping("/editions/{editionId}/tags/{tagId}")
    public ResponseEntity<?> deleteEditionTag(@PathVariable String editionId,
            @PathVariable String tagId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.removeEditionTag(username, tagId);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    // ── Subscription entry tags ────────────────────────────────────────────────

    @GetMapping("/subscriptions/{id}/tags")
    public ResponseEntity<?> getSubTags(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        try {
            return ResponseEntity.ok(userStore.getSubTags(username, id));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    @PostMapping("/subscriptions/{id}/tags")
    public ResponseEntity<?> addSubTag(@PathVariable String id,
            @RequestBody Map<String, String> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        String tag = body.get("tag");
        if (tag == null || tag.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Tag is required"));
        try {
            return ResponseEntity.status(HttpStatus.CREATED).body(userStore.addSubTag(username, id, tag.trim()));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
        }
    }

    @DeleteMapping("/subscriptions/{entryId}/tags/{tagId}")
    public ResponseEntity<?> removeSubTag(@PathVariable String entryId,
            @PathVariable String tagId, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.removeSubTag(username, tagId);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute(AppConstants.SESSION_USERNAME);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}

