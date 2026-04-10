package com.luxgrimoire.backend.controller;

import com.luxgrimoire.backend.model.AppUser;
import com.luxgrimoire.backend.model.UserBookEntry;
import com.luxgrimoire.backend.model.UserSubscriptionEntry;
import com.luxgrimoire.backend.service.UserStore;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Optional;

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
    public ResponseEntity<?> getBooks(HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        return ResponseEntity.ok(user.getOwnedBooks());
    }

    @PostMapping("/books")
    public ResponseEntity<?> addBook(@RequestBody Map<String, String> body, HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        String bookDetailId = body.get("bookDetailId");
        if (bookDetailId == null || bookDetailId.isBlank())
            return ResponseEntity.badRequest().body(Map.of("error", "Missing bookDetailId"));

        long existingCount = user.getOwnedBooks().stream()
                .filter(e -> bookDetailId.equals(e.getBookDetailId()))
                .count();

        UserBookEntry entry = new UserBookEntry(bookDetailId);
        user.getOwnedBooks().add(entry);
        return ResponseEntity.ok(Map.of("entry", entry, "existingCount", existingCount));
    }

    @DeleteMapping("/books/{id}")
    public ResponseEntity<?> removeBook(@PathVariable String id, HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        boolean removed = user.getOwnedBooks().removeIf(e -> id.equals(e.getId()));
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Subscriptions ──────────────────────────────────────────────────────

    @GetMapping("/subscriptions")
    public ResponseEntity<?> getSubscriptions(HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        return ResponseEntity.ok(user.getSubscriptions());
    }

    @PostMapping("/subscriptions")
    public ResponseEntity<?> addSubscription(@RequestBody Map<String, String> body, HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        String companyId = body.get("companyId");
        String subscriptionId = body.get("subscriptionId");
        if (companyId == null || subscriptionId == null)
            return ResponseEntity.badRequest().body(Map.of("error", "Missing companyId or subscriptionId"));

        long existingCount = user.getSubscriptions().stream()
                .filter(e -> subscriptionId.equals(e.getSubscriptionId()) && companyId.equals(e.getCompanyId()))
                .count();

        UserSubscriptionEntry entry = new UserSubscriptionEntry(companyId, subscriptionId);
        user.getSubscriptions().add(entry);
        return ResponseEntity.ok(Map.of("entry", entry, "existingCount", existingCount));
    }

    @DeleteMapping("/subscriptions/{id}")
    public ResponseEntity<?> removeSubscription(@PathVariable String id, HttpSession session) {
        AppUser user = resolveUser(session);
        if (user == null) return unauthorized();
        boolean removed = user.getSubscriptions().removeIf(e -> id.equals(e.getId()));
        return removed ? ResponseEntity.ok(Map.of("removed", true))
                       : ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Not found"));
    }

    // ── Helpers ────────────────────────────────────────────────────────────

    private AppUser resolveUser(HttpSession session) {
        String username = (String) session.getAttribute("username");
        if (username == null) return null;
        Optional<AppUser> opt = userStore.findByUsername(username);
        return opt.orElse(null);
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not authenticated"));
    }
}
