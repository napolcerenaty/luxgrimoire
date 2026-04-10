package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.*;
import com.luxgrimoire.backend.service.UserStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/user")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class UserCollectionController {

    private final UserStore userStore;

    public UserCollectionController(UserStore userStore) {
        this.userStore = userStore;
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
    public ResponseEntity<?> addSubscription(@RequestBody Map<String, String> body, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        String companyId = body.get("companyId");
        String subscriptionId = body.get("subscriptionId");
        if (companyId == null || subscriptionId == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Missing companyId or subscriptionId"));

        long existingCount = userStore.countSubscriptions(username, companyId, subscriptionId);
        UserSubscriptionEntry entry = userStore.addSubscription(username, companyId, subscriptionId);
        return ResponseEntity.ok(Map.of("entry", entry, "existingCount", existingCount));
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<?> removeSubscription(@PathVariable String id, HttpSession session) {
        String username = resolveUsername(session);
        if (username == null) return unauthorized();
        boolean removed = userStore.removeSubscription(username, id);
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private String resolveUsername(HttpSession session) {
        return (String) session.getAttribute("username");
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
